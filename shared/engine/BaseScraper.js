// shared/engine/BaseScraper.js

export class BaseScraper {
    constructor(config = {}) {
        this.config = config;
        this.itemsMap = new Map();
        this.noNewItemsCount = 0;
        this.isArchiveMode = false;
        this.mainId = null;
    }

    log(msg) { console.log(`[${this.constructor.name}] ${msg}`); }

    emitProgress(msg) {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ action: 'progress', text: msg }).catch(() => { });
            }
        } catch (e) { }
    }

    async sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    getText(el) { return (el ? (el.innerText || el.textContent || '') : ''); }

    // --- Abstract Methods (To be implemented by subclasses) ---
    getContext() { throw new Error('getContext() not implemented'); }
    extractData(element) { throw new Error('extractData() not implemented'); }
    async expandContent() { /* Optional hook */ }
    getVisibleItems() { throw new Error('getVisibleItems() not implemented'); }
    isBoundaryReached(element) { return false; }
    async waitForHydration() { throw new Error('waitForHydration() not implemented'); }
    // Scroll hook — override in subclasses where window scroll doesn't apply (e.g. Instagram)
    scrollPage() { window.scrollTo(0, document.body.scrollHeight); }

    // --- Core Scraper Loop ---
    async run() {
        this.log('Engaging Protocol Engine...');
        const context = this.getContext();
        this.isArchiveMode = context.isArchiveMode;
        this.mainId = context.mainId;

        await this.waitForHydration();

        while (this.itemsMap.size < (this.config.TARGET_COUNT + this.config.TARGET_BUFFER) &&
            this.noNewItemsCount < this.config.MAX_NO_NEW_TWEETS) {

            await this.expandContent();

            const elements = this.getVisibleItems();
            let newFound = 0;
            let hitBoundary = false;

            for (const el of elements) {
                if (this.isBoundaryReached(el)) {
                    this.log('Hit platform boundary, stopping scroll.');
                    hitBoundary = true;
                    break;
                }

                const item = this.extractData(el);
                if (item && !this.itemsMap.has(item.id)) {
                    this.itemsMap.set(item.id, item);
                    newFound++;
                }
            }

            this.log(`Scraped cycle: ${this.itemsMap.size} total (+${newFound} new)`);
            this.emitProgress(`Scraping... (${this.itemsMap.size} items gathered)`);
            this.noNewItemsCount = (newFound === 0) ? this.noNewItemsCount + 1 : 0;

            if (hitBoundary) break;
            if (this.itemsMap.size >= this.config.TARGET_COUNT * 2) break;

            this.scrollPage();
            await this.sleep(this.config.SCROLL_WAIT_MS);

        }

        if (this.itemsMap.size === 0) {
            throw new Error('No items found. Ensure you are on a valid page and content is loaded.');
        }

        return this.processResults();
    }

    processResults() {
        const { mainPost, validItems } = this.filterItems();
        const output = this.formatOutput(mainPost, validItems);

        return {
            status: 'success',
            data: output,
            count: validItems.length + (this.isArchiveMode ? 0 : 1),
            rawData: Array.from(this.itemsMap.values())
        };
    }

    filterItems() {
        const allItems = Array.from(this.itemsMap.values());
        let validItems = [];
        let mainPost = null;

        if (this.isArchiveMode) {
            validItems = allItems;
            if (validItems.length > 0) mainPost = validItems[0];
            return { mainPost, validItems };
        }

        mainPost = allItems.find(t => t.isMain) || allItems[0];
        if (!mainPost) throw new Error('Failed to identify main post.');

        const mainHandle = mainPost.handle;
        let currentSubCommentCount = 0;
        let nonAuthorCount = 0;

        for (const item of allItems) {
            if (item.id === mainPost.id) continue;

            // If handles are unknown on both sides, don't treat everything as "author"
            const isAuthor = mainHandle !== '@unknown' && item.handle === mainHandle;
            let isLevel1 = isAuthor ||
                          item.replyingTo.length === 0 ||
                          (item.replyingTo.length === 1 && item.replyingTo[0] === mainHandle);

            if (this.config.UNROLL_THREAD && !isAuthor) continue;

            if (isLevel1) {
                currentSubCommentCount = 0;
                validItems.push(item);
                if (!isAuthor) nonAuthorCount++;
            } else if (currentSubCommentCount < this.config.MAX_SUB_COMMENTS) {
                validItems.push(item);
                currentSubCommentCount++;
                if (!isAuthor) nonAuthorCount++;
            }

            if (nonAuthorCount >= this.config.TARGET_COUNT) break;
        }

        return { mainPost, validItems };
    }

    formatOutput(mainPost, validItems) {
        const config = this.config;
        const isArchiveMode = this.isArchiveMode;
        
        const renderMetrics = (m) => config.INCLUDE_METRICS && m ? `  [💡 ${m.likes} Likes | 🔁 ${m.reposts || m.shares || 0} Shares | 💬 ${m.replies || m.comments || 0} Replies | 👁️ ${m.views || 0} Views]` : '';
        const renderMarkdownMetrics = (m) => config.INCLUDE_METRICS && m ? `\n> *${m.likes} Likes | ${m.reposts || m.shares || 0} Shares | ${m.replies || m.comments || 0} Replies | ${m.views || 0} Views*` : '';

        let allResources = new Set();
        if (config.EXTRACT_LINKS) {
            if (mainPost?.links) mainPost.links.forEach(l => allResources.add(l));
            validItems.forEach(t => t.links?.forEach(l => allResources.add(l)));
        }

        if (config.FORMAT === 'json') {
            const dataToExport = isArchiveMode
                ? { archiveType: 'Archive', items: validItems }
                : { archiveType: 'Thread', mainPost, replies: validItems };

            if (!config.INCLUDE_METRICS) {
                if (dataToExport.mainPost) delete dataToExport.mainPost.metrics;
                validItems.forEach(t => delete t.metrics);
            }
            if (config.EXTRACT_LINKS && allResources.size > 0) {
                dataToExport.harvestedResources = Array.from(allResources);
            }
            return JSON.stringify(dataToExport, null, 2);
        }

        if (config.FORMAT === 'markdown') {
            let output = '';
            if (isArchiveMode) {
                output = `# 🔖 Saved Archive (${validItems.length} entries)\n\n`;
                validItems.forEach(t => {
                    output += `> **${t.handle}** (${t.timestamp}): ${t.text.replace(/\n/g, '\n> ')}${renderMarkdownMetrics(t.metrics)}\n\n`;
                });
            } else {
                output = `# Post by ${mainPost.handle}\n\n`;
                output += `**${mainPost.handle}** (${mainPost.timestamp}):\n${mainPost.text}${renderMarkdownMetrics(mainPost.metrics)}\n\n`;
                if (validItems.length > 0) {
                    output += `## ${config.UNROLL_THREAD ? 'Breakdown' : 'Replies'} (${validItems.length})\n\n`;
                    validItems.forEach(t => {
                        output += `> **${t.handle}**: ${t.text.replace(/\n/g, '\n> ')}${renderMarkdownMetrics(t.metrics)}\n\n`;
                    });
                }
            }
            if (config.EXTRACT_LINKS && allResources.size > 0) {
                output += `\n---\n## 🔗 Harvested Resources (${allResources.size})\n\n`;
                Array.from(allResources).forEach(l => output += `- ${l}\n`);
            }
            return output;
        }

        // Plain Text fallback
        let output = isArchiveMode ? `[Archive]\nCollected: ${validItems.length}\n\n` : `[Main Post]\n${mainPost.handle} (${mainPost.timestamp}):\n${mainPost.text}\n${renderMetrics(mainPost.metrics)}\n\n`;
        if (isArchiveMode) {
            validItems.forEach((t, i) => output += `${i + 1}. [${t.timestamp}] ${t.handle}: ${t.text}\n${renderMetrics(t.metrics)}\n\n`);
        } else if (validItems.length > 0) {
            output += `[${config.UNROLL_THREAD ? 'Extension' : 'Replies'}] (${validItems.length})\n`;
            validItems.forEach((t, i) => output += `${i + 1}. ${t.handle}: ${t.text}\n${renderMetrics(t.metrics)}\n`);
        }
        if (config.EXTRACT_LINKS && allResources.size > 0) {
            output += '\n[Harvested Resources]\n';
            Array.from(allResources).forEach(l => output += `- ${l}\n`);
        }
        return output;
    }
}
