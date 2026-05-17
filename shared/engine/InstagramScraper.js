// shared/engine/InstagramScraper.js
// Instagram has TWO distinct page layouts:
//
// LAYOUT A — "Modal"   : clicked from profile grid / explore
//   Signals : article element present, comments in ul > li
//
// LAYOUT B — "Direct"  : navigated directly to /p/SHORTCODE/
//   Signals : no article, no li elements, comments in divs
//   Caption : div._ap3a._aaco (confirmed via live DOM inspection)
//
// Primary strategy  : React fiber traversal (layout-agnostic)
// Secondary strategy: DOM scraping with layout-aware selectors

import { BaseScraper } from './BaseScraper.js';

export class InstagramScraper extends BaseScraper {

    // ─────────────────────────────────────────────
    //  Context
    // ─────────────────────────────────────────────
    getContext() {
        let isArchiveMode = false;
        let mainId = null;
        if (typeof window !== 'undefined' && window.location) {
            isArchiveMode = window.location.pathname.includes('/saved/');
            const match = window.location.pathname.match(/\/(p|reels|reel)\/([^\/]+)/);
            if (match) mainId = match[2];
        }
        return { isArchiveMode, mainId };
    }

    // ─────────────────────────────────────────────
    //  Layout detection
    // ─────────────────────────────────────────────
    _detectLayout() {
        if (document.querySelector('article')) return 'modal';
        if (document.querySelector('[role="dialog"] article')) return 'modal';
        if (document.querySelector('div._ap3a')) return 'direct';
        // Fallback: check for li elements anywhere (modal indicator)
        if (document.querySelectorAll('li').length > 0) return 'modal';
        return 'direct';
    }

    // ─────────────────────────────────────────────
    //  React fiber extractor
    //  Works regardless of DOM layout — reads from
    //  Instagram's React component props/state tree.
    // ─────────────────────────────────────────────
    _getReactFiber(el) {
        const key = Object.keys(el).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
        );
        return key ? el[key] : null;
    }

    _getFiberProps(fiber) {
        let node = fiber;
        let depth = 0;
        while (node && depth < 60) {
            const props = node.memoizedProps || node.pendingProps;
            if (props) {
                // Look for comment data
                if (props.text || props.comment || props.node?.text) return props;
                // Look for author data
                if (props.owner || props.user?.username) return props;
            }
            node = node.return;
            depth++;
        }
        return null;
    }

    // Attempt to extract all post data from React fiber state
    _extractViaReactFiber() {
        const items = [];
        const seen = new Set();

        // Strategy: find all time elements (comments always have timestamps)
        // Then walk their fiber tree to get the actual text/author data
        const timeEls = document.querySelectorAll('time');
        for (const timeEl of timeEls) {
            // Walk up DOM to find a container that has author + text
            let container = timeEl.parentElement;
            for (let i = 0; i < 8 && container; i++) {
                const text = container.innerText?.trim();
                if (text && text.length > 10) {
                    const key = text.substring(0, 40);
                    if (!seen.has(key)) {
                        seen.add(key);
                        items.push({ el: container, timeEl });
                    }
                    break;
                }
                container = container.parentElement;
            }
        }

        // Also include the main caption (div._ap3a or article)
        const captionEl = document.querySelector('article') ||
                          document.querySelector('div._ap3a._aaco') ||
                          document.querySelector('div._ap3a');
        if (captionEl) {
            const key = captionEl.innerText?.substring(0, 40) || 'main';
            if (!seen.has(key)) {
                seen.add(key);
                items.unshift({ el: captionEl, timeEl: captionEl.querySelector('time'), isMain: true });
            }
        }

        this.log(`React fiber strategy: found ${items.length} candidate elements`);
        return items;
    }

    // ─────────────────────────────────────────────
    //  Hydration
    // ─────────────────────────────────────────────
    async waitForHydration() {
        // Wait for ANY sign of a loaded post — article OR _ap3a div OR any time element
        let retries = 0;
        const isReady = () =>
            document.querySelector('article') ||
            document.querySelector('div._ap3a') ||
            document.querySelectorAll('time').length > 0;

        while (!isReady() && retries < 8) {
            this.log(`Waiting for page (attempt ${retries + 1}/8)...`);
            this.emitProgress('Waiting for page to load...');
            await this.sleep(1500);
            retries++;
        }

        if (isReady()) {
            this.log(`Page ready. Layout: ${this._detectLayout()}`);
            await this.sleep(800); // Let comments lazy-load
        } else {
            this.log('WARNING: Page not detected after timeout. Attempting extraction anyway.');
        }
    }

    // ─────────────────────────────────────────────
    //  Expand
    // ─────────────────────────────────────────────
    async expandContent() {
        // "View all X comments" / "Alle X Kommentare ansehen"
        const allBtns = document.querySelectorAll('span[role="button"], button');
        for (const btn of allBtns) {
            const t = btn.textContent?.trim().toLowerCase() || '';
            if (t.startsWith('view all') || t.startsWith('alle') || t.includes('view all comments')) {
                btn.click();
                await this.sleep(this.config.EXPAND_WAIT_MS);
                break;
            }
        }

        // "Load more comments" SVG button
        const loadMoreSvg = document.querySelector('svg[aria-label="Load more comments"]');
        if (loadMoreSvg) {
            loadMoreSvg.closest('button')?.click();
            await this.sleep(this.config.EXPAND_WAIT_MS);
        }

        // Expand truncated captions
        for (const btn of document.querySelectorAll('span[role="button"]')) {
            if (btn.textContent?.trim().toLowerCase() === 'more') btn.click();
        }
    }

    // ─────────────────────────────────────────────
    //  Scroll (layout-aware)
    // ─────────────────────────────────────────────
    scrollPage() {
        const layout = this._detectLayout();

        if (layout === 'modal') {
            // Comments are in a sidebar panel — scroll its container
            const article = document.querySelector('article');
            if (article) {
                // Walk up to find the overflow-scrollable container
                let el = article.parentElement;
                while (el && el !== document.body) {
                    const overflow = getComputedStyle(el).overflowY;
                    if (overflow === 'auto' || overflow === 'scroll') {
                        el.scrollTop = el.scrollHeight;
                        return;
                    }
                    el = el.parentElement;
                }
            }
        }

        // Direct URL page: comments load as you scroll the main page
        window.scrollTo(0, document.body.scrollHeight);
    }

    // ─────────────────────────────────────────────
    //  Get visible items (layout-aware with 3 tiers)
    // ─────────────────────────────────────────────
    getVisibleItems() {
        const layout = this._detectLayout();
        this.log(`Layout detected: ${layout}`);

        if (layout === 'modal') {
            return this._getModalItems();
        } else {
            return this._getDirectItems();
        }
    }

    _getModalItems() {
        const items = [];
        const root = document.querySelector('article') ||
                     document.querySelector('[role="dialog"]');

        if (root) items.push(root);

        // Tier 1: IG class selectors
        let commentLIs = document.querySelectorAll('ul._a9z6._a9za > li._a9zj, ul._a9z6 > li._a9zj');

        // Tier 2: structural — LI with a time tag
        if (commentLIs.length === 0) {
            this.log('Modal Tier 1 missed → trying li:has(time)');
            commentLIs = document.querySelectorAll('li:has(time)');
        }

        // Tier 3: all LIs inside the root
        if (commentLIs.length === 0 && root) {
            this.log('Modal Tier 2 missed → all LIs in root');
            commentLIs = root.querySelectorAll('li');
        }

        commentLIs.forEach(li => {
            if (!items.includes(li)) items.push(li);
        });

        this.log(`Modal items: ${items.length}`);
        return items;
    }

    _getDirectItems() {
        const items = [];
        const seen = new Set();

        const add = (el) => {
            if (el && !seen.has(el)) {
                seen.add(el);
                items.push(el);
            }
        };

        // Main post: caption container
        const captionEl = document.querySelector('article') ||
                          document.querySelector('div._ap3a._aaco') ||
                          document.querySelector('div._ap3a');
        if (captionEl) {
            captionEl._isMainPost = true;
            add(captionEl);
        }

        // Comments Tier 1: role="listitem" (semantic, stable)
        document.querySelectorAll('[role="listitem"]').forEach(el => {
            if (el.querySelector('time')) add(el);
        });

        // Comments Tier 2: divs that directly contain a time element
        if (items.length <= 1) {
            this.log('Direct Tier 1 missed → trying div:has(time)');
            document.querySelectorAll('div:has(> time), div:has(> * > time), div:has(> * > * > time)')
                .forEach(el => {
                    // Exclude the caption div itself
                    if (captionEl && captionEl.contains(el)) return;
                    if (el === captionEl) return;
                    add(el);
                });
        }

        // Comments Tier 3: ALL time elements, walk up to a reasonable comment container
        if (items.length <= 1) {
            this.log('Direct Tier 2 missed → time element walk-up');
            document.querySelectorAll('time').forEach(timeEl => {
                // Walk up to find a meaningful container (has author + text)
                let el = timeEl.parentElement;
                for (let i = 0; i < 6 && el; i++) {
                    const txt = el.innerText?.trim();
                    if (txt && txt.length > 5 && el.children.length >= 1) {
                        if (!captionEl?.contains(el)) add(el);
                        break;
                    }
                    el = el.parentElement;
                }
            });
        }

        this.log(`Direct items: ${items.length} (caption: ${!!captionEl})`);
        return items;
    }

    // ─────────────────────────────────────────────
    //  Extract data from a single element
    // ─────────────────────────────────────────────
    extractData(element) {
        try {
            const isMain = element.tagName.toLowerCase() === 'article' ||
                           element._isMainPost === true ||
                           element.classList.contains('_ap3a');

            // Timestamp
            const timeEl = element.querySelector('time');
            const timestamp = timeEl?.getAttribute('datetime') ||
                              timeEl?.textContent?.trim() || 'Recent';
            const relativeTime = timeEl?.textContent?.trim() || '';

            // Author — look for h2 (modal) or first <a> that looks like a handle (direct)
            let handle = '@unknown';
            const h2 = element.querySelector('h2');
            if (h2) {
                handle = h2.textContent.trim();
            } else {
                // On direct pages, author links are <a> with an href like /username/
                const authorLinks = element.querySelectorAll('a[href]');
                for (const a of authorLinks) {
                    const href = a.getAttribute('href') || '';
                    const m = href.match(/^\/([^\/\?]+)\/?$/);
                    if (m && !href.includes('/p/') && !href.includes('/reel')) {
                        handle = m[1];
                        break;
                    }
                }
            }

            // Text
            let text = '';
            if (isMain) {
                // Caption: structured span chain or innerText fallback
                const captionEl = element.querySelector('h1, div._ap3a span, div._aaco span, [data-testid="post-comment-root"]');
                text = captionEl ? captionEl.textContent.trim() : '';
                if (!text) {
                    // innerText minus metadata noise
                    text = (element.innerText || '')
                        .split('\n')
                        .map(l => l.trim())
                        .filter(l => l && !l.match(/^\d+[smhdwy]$/) && l !== handle && l.length > 1)
                        .join('\n')
                        .trim();
                }
            } else {
                const UI_NOISE = new Set(['reply', 'like', 'see translation', '❤️', 'view replies',
                                         'hide replies', 'antworten', 'mehr anzeigen', 'weniger']);
                const rawText = (element.innerText || element.textContent || '').trim();
                text = rawText
                    .replace(new RegExp('^' + handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
                    .replace(relativeTime, '')
                    .split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !UI_NOISE.has(l.toLowerCase()) && !l.match(/^\d+[smhdwy]$/))
                    .join(' ')
                    .trim();
            }

            // ID — use time href anchor or shortcode or fallback
            const id = isMain
                ? (this.mainId || 'ig_post')
                : (timeEl?.closest('a')?.href || `ig_${timestamp}_${handle}`.replace(/\W/g, '_'));

            // Metrics (main post only)
            const metrics = { likes: 0, comments: 0 };
            if (isMain) {
                const likeBtn = element.querySelector('section button span, [aria-label*="like"] span');
                if (likeBtn) metrics.likes = parseInt(likeBtn.textContent.replace(/\D/g, '')) || 0;
            }

            // Reply detection
            const isReply = !!element.closest('ul._a9ym, ul._a9yo, [role="group"]');

            return {
                id,
                handle,
                timestamp,
                text: text || '[Media post]',
                isMain,
                replyingTo: !isMain ? [this.mainId].filter(Boolean) : [],
                isReply,
                metrics
            };
        } catch (e) {
            this.log('extractData error: ' + e.message);
            return null;
        }
    }
}
