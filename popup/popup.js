document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const statusBox = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const logContainer = document.getElementById('logContainer');
    const logContent = document.getElementById('logContent');
    const toggleLogsBtn = document.getElementById('toggleLogsBtn');
    const copyLogsBtn = document.getElementById('copyLogsBtn');

    // Settings Elements
    const settingSubcomments = document.getElementById('settingSubcomments');
    const settingFormat = document.getElementById('settingFormat');
    const settingUnroll = document.getElementById('settingUnroll');
    const settingMetrics = document.getElementById('settingMetrics');
    const settingDownload = document.getElementById('settingDownload');

    // Load Settings
    chrome.storage.local.get(['maxSubcomments', 'format', 'unroll', 'metrics', 'download'], (result) => {
        if (result.maxSubcomments !== undefined) settingSubcomments.value = result.maxSubcomments;
        if (result.format !== undefined) settingFormat.value = result.format;
        if (result.unroll !== undefined) settingUnroll.checked = result.unroll;
        if (result.metrics !== undefined) settingMetrics.checked = result.metrics;
        if (result.download !== undefined) settingDownload.checked = result.download;
    });

    // Save Settings
    const saveSettings = () => {
        chrome.storage.local.set({
            maxSubcomments: parseInt(settingSubcomments.value) || 5,
            format: settingFormat.value,
            unroll: settingUnroll.checked,
            metrics: settingMetrics.checked,
            download: settingDownload.checked
        });
    };

    settingSubcomments.addEventListener('input', saveSettings);
    settingFormat.addEventListener('change', saveSettings);
    settingUnroll.addEventListener('change', saveSettings);
    settingMetrics.addEventListener('change', saveSettings);
    settingDownload.addEventListener('change', saveSettings);

    // Logger Class
    class Logger {
        constructor() { this.logs = []; }
        log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            const entry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
            this.logs.push(entry);
            console.log(entry);
            logContent.textContent = this.logs.join('\n');
            logContent.scrollTop = logContent.scrollHeight;
        }
        clear() { this.logs = []; logContent.textContent = ''; }
    }
    const logger = new Logger();

    // UI Toggles
    toggleLogsBtn.addEventListener('click', () => {
        logContainer.classList.toggle('hidden');
        toggleLogsBtn.textContent = logContainer.classList.contains('hidden') ? 'View Runtime Protocol Specs' : 'Hide Specs';
    });

    copyLogsBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(logger.logs.join('\n'));
        const originalText = copyLogsBtn.textContent;
        copyLogsBtn.textContent = 'Copied!';
        setTimeout(() => copyLogsBtn.textContent = originalText, 1500);
    });

    // Listen to live progress from Content Script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'progress') {
            updateStatus(message.text, 'normal');
            logger.log(message.text);
        }
    });

    // Main Action
    scrapeBtn.addEventListener('click', async () => {
        scrapeBtn.disabled = true;
        logger.clear();
        logger.log('Engaging Scraper Engine...');

        const userConfig = {
            MAX_SUB_COMMENTS: parseInt(settingSubcomments.value) || 0,
            FORMAT: settingFormat.value,
            UNROLL_THREAD: settingUnroll.checked,
            INCLUDE_METRICS: settingMetrics.checked,
            DOWNLOAD: settingDownload.checked
        };

        try {
            await runScrapeProcess(userConfig);
        } catch (err) {
            logger.log(`Critical Error: ${err.message}`, 'error');
            updateStatus(`Execution Failed: ${err.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    });

    async function runScrapeProcess(userConfig) {
        updateStatus('Initializing Target Scan...', 'normal');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        logger.log(`Active tab acquired: ${tab.id} (${tab.url})`);

        if (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) {
            throw new Error('Not executed on an X (Twitter) domain.');
        }

        updateStatus('Injecting Collector...', 'normal');
        await runAtomicExecution(tab.id, userConfig);
    }

    async function runAtomicExecution(tabId, userConfig) {
        try {
            const scraperUrl = chrome.runtime.getURL('shared/scraper.js');
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: atomicScrape,
                args: [scraperUrl, userConfig]
            });

            logger.log('Collector Script Terminated.');

            if (!results || !results[0] || !results[0].result) {
                throw new Error('Null result returned from content script. Ensure DOM is loaded.');
            }

            const result = results[0].result;

            if (result.status === 'success') {
                logger.log(`Data payload received: ${result.count} nodes.`);

                if (userConfig.DOWNLOAD) {
                    // Trigger Download
                    const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);

                    let filename = `X_Scrape_${new Date().getTime()}`;
                    if (userConfig.FORMAT === 'json') filename += '.json';
                    else if (userConfig.FORMAT === 'markdown') filename += '.md';
                    else filename += '.txt';

                    await chrome.downloads.download({ url: url, filename: filename, saveAs: true });
                    logger.log('File Download Sent to Browser API.');
                    updateStatus(`Success! Saved ${result.count} tweets.`, 'success');
                } else {
                    // Copy to Clipboard (Fallback implemented in scraper.js normally, but we handle logic properly)
                    await navigator.clipboard.writeText(result.data);
                    logger.log('Copied directly to User Clipboard.');
                    updateStatus(`Success! Copied ${result.count} tweets to clipboard.`, 'success');
                }

                scrapeBtn.disabled = false;
            } else {
                throw new Error(result.message || 'Unknown protocol failure in content script');
            }

        } catch (err) {
            logger.log(`Atomic Payload Failed: ${err.message}`, 'error');
            updateStatus(`Execution Blocked: ${err.message}`, 'error');
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

    async function atomicScrape(scraperUrl, userConfig) {
        // Prevent writing to clipboard inside script if we intend to download, wait, the scraper.js writes to clipboard.
        // We will modify scraper.js to NOT write to clipboard. Returning result.data is enough.
        const { atomicScrape: sharedScraper } = await import(scraperUrl);
        return await sharedScraper(userConfig);
    }
});
