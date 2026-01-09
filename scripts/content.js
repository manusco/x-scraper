(() => {
    console.log("X-Scraper: Content script loaded (v0.1.6).");

    window.xScraper = {
        ping: () => 'pong',
        run: async () => {
            return await atomicScrapeLogic();
        }
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'ping') {
            sendResponse({ status: 'pong' });
            return;
        }
        if (message.action === 'start_scrape') {
            atomicScrapeLogic().then(result => {
                if (result.status === 'success') {
                    chrome.runtime.sendMessage({ action: 'scrape_complete' });
                } else {
                    chrome.runtime.sendMessage({ action: 'scrape_error', message: result.message });
                }
            });
        }
    });

    // Shared Logic - Now imported from shared module
    async function atomicScrapeLogic() {
        try {
            const { atomicScrape } = await import(chrome.runtime.getURL('shared/scraper.js'));
            return await atomicScrape();
        } catch (err) {
            console.error('[Content Script] Error importing scraper:', err);
            return { status: 'error', message: err.toString() };
        }
    }

})();
