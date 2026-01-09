document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const statusBox = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const logContainer = document.getElementById('logContainer');
    const logContent = document.getElementById('logContent');
    const toggleLogsBtn = document.getElementById('toggleLogsBtn');
    const copyLogsBtn = document.getElementById('copyLogsBtn');

    // Logger Class
    class Logger {
        constructor() {
            this.logs = [];
        }
        log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            const entry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
            this.logs.push(entry);
            console.log(entry);

            // Update UI
            logContent.textContent = this.logs.join('\n');
            logContent.scrollTop = logContent.scrollHeight;
        }
        clear() {
            this.logs = [];
            logContent.textContent = '';
        }
    }
    const logger = new Logger();

    // UI Toggles
    toggleLogsBtn.addEventListener('click', () => {
        logContainer.classList.toggle('hidden');
        toggleLogsBtn.textContent = logContainer.classList.contains('hidden') ? 'Show Logs' : 'Hide Logs';
    });

    copyLogsBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(logger.logs.join('\n'));
        const originalText = copyLogsBtn.textContent;
        copyLogsBtn.textContent = 'Copied!';
        setTimeout(() => copyLogsBtn.textContent = originalText, 1500);
    });

    // Main Action
    scrapeBtn.addEventListener('click', async () => {
        scrapeBtn.disabled = true;
        logger.clear();
        logger.log('Starting scrape process (v0.1.6)...');

        try {
            await runScrapeProcess();
        } catch (err) {
            logger.log(`Critical Error: ${err.message}`, 'error');
            updateStatus(`Error: ${err.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    });

    async function runScrapeProcess() {
        // STEP 1: Initialization
        updateStatus('Initializing...', 'normal');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        logger.log(`Active tab found: ${tab.id} (${tab.url})`);

        if (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) {
            throw new Error('Not on X/Twitter');
        }

        // STEP 2: Atomic Execution (Primary)
        updateStatus('Running Atomic Scraper...', 'normal');
        await runAtomicExecution(tab.id);
    }

    async function runAtomicExecution(tabId) {
        try {
            logger.log('Injecting Atomic Scraper function...');

            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: atomicScrape // The function below
            });

            logger.log('Atomic Scraper returned.');

            if (!results || !results[0] || !results[0].result) {
                throw new Error('No result returned from script.');
            }

            const result = results[0].result;
            logger.log(`Result status: ${result.status}`);

            if (result.status === 'success') {
                await navigator.clipboard.writeText(result.data);
                logger.log('Copied to clipboard (Popup context).');
                updateStatus(`Success! Scraped ${result.count} tweets.`, 'success');
                scrapeBtn.disabled = false;
            } else {
                throw new Error(result.message || 'Unknown error in atomic script');
            }

        } catch (err) {
            logger.log(`Atomic Execution Failed: ${err.message}`, 'error');
            updateStatus(`Error: ${err.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    }

    function updateStatus(text, type = 'normal') {
        statusBox.classList.remove('hidden');
        statusText.textContent = text;
        statusBox.className = 'status-box';
        if (type === 'error') statusBox.classList.add('status-error');
        if (type === 'success') statusBox.classList.add('status-success');
    }

    // --- ATOMIC SCRAPER FUNCTION ---
    // Imported from shared module to eliminate code duplication
    async function atomicScrape() {
        // Import and execute the shared scraper
        const { atomicScrape: sharedScraper } = await import('../shared/scraper.js');
        return await sharedScraper();
    }
});
