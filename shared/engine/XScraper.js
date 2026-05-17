// shared/engine/XScraper.js
import { BaseScraper } from './BaseScraper.js';

export class XScraper extends BaseScraper {
    getContext() {
        let isArchiveMode = false;
        let mainId = null;

        if (typeof window !== 'undefined' && window.location) {
            isArchiveMode = window.location.pathname.includes('/i/bookmarks');
            const urlParts = window.location.pathname.split('/');
            const statusIndex = urlParts.indexOf('status');
            if (statusIndex !== -1 && urlParts.length > statusIndex + 1) {
                mainId = urlParts[statusIndex + 1];
            }
        }
        return { isArchiveMode, mainId };
    }

    async waitForHydration() {
        let hydrationRetries = 0;
        while (document.querySelectorAll('article[data-testid="tweet"], [data-testid="twitterArticleReadView"]').length === 0 && hydrationRetries < 5) {
            this.log('Waiting for React DOM to hydrate tweets...');
            this.emitProgress('Waiting for page to load...');
            await this.sleep(1000);
            hydrationRetries++;
        }
    }

    async expandContent() {
        const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
        for (const btn of showMoreButtons) {
            btn.click();
        }
        if (showMoreButtons.length > 0) await this.sleep(this.config.EXPAND_WAIT_MS);
    }

    getVisibleItems() {
        return document.querySelectorAll('div[data-testid="cellInnerDiv"], [data-testid="twitterArticleReadView"]');
    }

    isBoundaryReached(cell) {
        const textContext = this.getText(cell);
        if (/^(Discover more|More posts|More Tweets)$/i.test(textContext.trim()) && !cell.querySelector('article')) {
            return true;
        }
        return false;
    }

    extractData(cell) {
        try {
            const article = cell.getAttribute('data-testid') === 'twitterArticleReadView'
                ? cell
                : cell.querySelector('article[data-testid="tweet"]');

            if (!article) return null;

            const isStandaloneArticle = article.getAttribute('data-testid') === 'twitterArticleReadView';
            const embeddedArticle = !isStandaloneArticle ? article.querySelector('[data-testid="twitterArticleReadView"]') : null;
            const isXArticle = isStandaloneArticle || embeddedArticle !== null;
            const articleRoot = isStandaloneArticle ? article : (embeddedArticle || article);

            let text = '';
            if (isXArticle) {
                const titleEl = articleRoot.querySelector('[data-testid="twitter-article-title"]');
                if (titleEl) text += `# ${this.getText(titleEl)}\n\n`;

                const longformBlocks = articleRoot.querySelectorAll('[data-testid="longformRichTextComponent"]');
                if (longformBlocks.length > 0) {
                    longformBlocks.forEach(el => text += this.getText(el) + '\n\n');
                } else {
                    const richTextView = articleRoot.querySelector('[data-testid="twitterArticleRichTextView"]');
                    if (richTextView) {
                        text += this.getText(richTextView) + '\n\n';
                    } else {
                        const articleText = this.getText(articleRoot);
                        if (articleText && articleText.length > 200) text += articleText + '\n\n';
                    }
                }

                if (!text.trim()) {
                    const fallback = article.querySelector('[data-testid="tweetText"]');
                    if (fallback) text = this.getText(fallback);
                }
                text = text.trim();
            } else {
                const textElements = article.querySelectorAll('[data-testid="tweetText"]');
                text = textElements.length > 0 ? this.getText(textElements[0]) : '';
                if (textElements.length > 1) {
                    text += '\n[Quoted]: ' + this.getText(textElements[1]);
                }
            }

            const userElement = article.querySelector('[data-testid="User-Name"]');
            const handleMatch = userElement ? this.getText(userElement).match(/@[a-zA-Z0-9_]+/) : null;
            const handle = handleMatch ? handleMatch[0] : '@unknown';

            const timeElement = article.querySelector('time');
            const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

            const replyingTo = (this.getText(article).match(/Replying to\s+(@[a-zA-Z0-9_]+)/g) || [])
                .map(s => s.replace('Replying to ', '').trim());

            let tweetId = null;
            if (userElement) {
                const timeLink = userElement.querySelector('a[href*="/status/"]');
                if (timeLink) {
                    const match = timeLink.href.match(/status\/(\d+)/);
                    if (match) tweetId = match[1];
                }
            }

            if (!tweetId && this.mainId) {
                if (isXArticle) {
                    tweetId = this.mainId;
                } else {
                    const links = article.querySelectorAll('a[href*="/status/"]');
                    for (const link of links) {
                        const match = link.href.match(/status\/(\d+)/);
                        if (match && match[1] === this.mainId) {
                            tweetId = match[1];
                            break;
                        }
                    }
                    if (!tweetId) tweetId = this.mainId;
                }
            }

            if (!tweetId) tweetId = 'unknown_' + Math.random();

            const imageElements = isXArticle
                ? articleRoot.querySelectorAll('img, video')
                : article.querySelectorAll('div[data-testid="tweetPhoto"] img, div[data-testid="videoComponent"] video');

            imageElements.forEach((img, index) => {
                const alt = img.getAttribute('alt');
                text += `\n[Media${imageElements.length > 1 ? ` ${(index + 1)}` : ''}: ${alt ? alt : 'Visual Attachment'}]`;
            });

            let metrics = { replies: 0, reposts: 0, likes: 0, views: 0 };
            article.querySelectorAll('[role="group"] [aria-label]').forEach(el => {
                const label = el.getAttribute('aria-label').toLowerCase();
                const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(num)) {
                    if (label.includes('repl')) metrics.replies = num;
                    if (label.includes('repost')) metrics.reposts = num;
                    if (label.includes('like')) metrics.likes = num;
                    if (label.includes('view')) metrics.views = num;
                }
            });

            let extractedLinks = [];
            if (this.config.EXTRACT_LINKS) {
                const anchors = article.querySelectorAll('[data-testid="tweetText"] a[href^="http"]');
                anchors.forEach(a => {
                    if (!a.href.includes('twitter.com') && !a.href.includes('x.com')) {
                        extractedLinks.push(a.href);
                    }
                });
            }

            if (!text && imageElements.length === 0 && tweetId !== this.mainId && handle === '@unknown') {
                return null;
            }

            return {
                id: tweetId,
                handle,
                timestamp,
                text: text || '[Media/Empty]',
                isMain: tweetId === this.mainId,
                replyingTo,
                metrics,
                links: extractedLinks
            };
        } catch (e) {
            this.log('Error processing tweet: ' + e.message);
            return null;
        }
    }
}
