document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const scrapeBtn = document.getElementById('scrapeBtn');
    const btnText = document.getElementById('btnText');
    const statusBox = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const logContainer = document.getElementById('logContainer');
    const logContent = document.getElementById('logContent');
    const toggleLogsBtn = document.getElementById('toggleLogsBtn');
    const copyLogsBtn = document.getElementById('copyLogsBtn');
    const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
    const advancedSettings = document.getElementById('advancedSettings');
    const advancedChevron = document.getElementById('advancedChevron');
    const bookmarksBanner = document.getElementById('bookmarksBanner');

    // Settings Elements
    const settingSubcomments = document.getElementById('settingSubcomments');
    const settingFormat = document.getElementById('settingFormat');
    const settingUnroll = document.getElementById('settingUnroll');
    const settingMetrics = document.getElementById('settingMetrics');
    const settingDownload = document.getElementById('settingDownload');
    const settingLinks = document.getElementById('settingLinks');
    const settingWebhook = document.getElementById('settingWebhook');

    // New JTBD UI Elements
    const platformBadge = document.getElementById('platformBadge');
    const platformIcon = document.getElementById('platformIcon');
    const platformName = document.getElementById('platformName');
    const choicePost = document.getElementById('choicePost');
    const choiceThread = document.getElementById('choiceThread');
    const choicePostDesc = document.getElementById('choicePostDesc');
    const choiceThreadTitle = document.getElementById('choiceThreadTitle');
    const choiceThreadDesc = document.getElementById('choiceThreadDesc');

    // Platform config: what each platform calls its content
    const PLATFORM_CONFIGS = {
        'x.com':        { icon: '𝕏', name: 'X (Twitter)', postDesc: 'Just the tweet / article', threadTitle: 'Tweet + Replies', threadDesc: 'Full thread conversation' },
        'twitter.com':  { icon: '𝕏', name: 'X (Twitter)', postDesc: 'Just the tweet / article', threadTitle: 'Tweet + Replies', threadDesc: 'Full thread conversation' },
        'linkedin.com': { icon: 'in', name: 'LinkedIn',   postDesc: 'Post text & author only', threadTitle: 'Post + Comments', threadDesc: 'Full professional discussion' },
        'instagram.com':{ icon: '📷', name: 'Instagram',  postDesc: 'Caption & media info',    threadTitle: 'Caption + Comments', threadDesc: 'Post and all comments' },
    };

    function applyPlatformUI(hostname) {
        const key = Object.keys(PLATFORM_CONFIGS).find(d => hostname.includes(d));
        const cfg = key ? PLATFORM_CONFIGS[key] : null;

        if (cfg) {
            platformIcon.textContent = cfg.icon;
            platformName.textContent = cfg.name;
            choicePostDesc.textContent = cfg.postDesc;
            choiceThreadTitle.textContent = cfg.threadTitle;
            choiceThreadDesc.textContent = cfg.threadDesc;
        } else {
            platformName.textContent = 'Unsupported page';
            scrapeBtn.disabled = true;
        }
    }

    // Choice selection
    let currentChoice = 'post'; // 'post' | 'thread'

    function setChoice(choice) {
        currentChoice = choice;
        if (choice === 'thread') {
            choiceThread.classList.add('active');
            choicePost.classList.remove('active');
            btnText.textContent = settingDownload.checked ? 'Save File' : 'Copy to Clipboard';
            // Enable comment depth for thread mode
            settingUnroll.checked = false;
        } else {
            choicePost.classList.add('active');
            choiceThread.classList.remove('active');
            btnText.textContent = settingDownload.checked ? 'Save File' : 'Copy to Clipboard';
            // Post-only: set depth to 0 (scraper picks up only article/main post)
            settingUnroll.checked = true;
        }
        chrome.storage.local.set({ choice });
    }

    choicePost.addEventListener('click', () => setChoice('post'));
    choiceThread.addEventListener('click', () => setChoice('thread'));

    // Update button label when download toggle changes
    settingDownload.addEventListener('change', () => {
        btnText.textContent = settingDownload.checked ? 'Save File' : 'Copy to Clipboard';
        saveSettings();
    });

    // --- Site Mode Detection ---
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
            const url = new URL(tabs[0].url);
            applyPlatformUI(url.hostname);

            if (tabs[0].url.includes('/i/bookmarks') || tabs[0].url.includes('/my-items/saved-posts/') || tabs[0].url.includes('/saved/')) {
                bookmarksBanner.classList.remove('hidden');
                bookmarksBanner.textContent = '🔖 Saved Archive Mode Detected';
                btnText.textContent = 'Process Saved Items';
            }
        }
    });

    // --- Settings Persistence ---
    const SETTINGS_KEYS = ['maxSubcomments', 'format', 'metrics', 'download', 'webhook', 'advancedOpen', 'choice'];

    chrome.storage.local.get(SETTINGS_KEYS, (result) => {
        if (result.maxSubcomments !== undefined) settingSubcomments.value = result.maxSubcomments;
        if (result.format !== undefined) settingFormat.value = result.format;
        if (result.metrics !== undefined) settingMetrics.checked = result.metrics;
        if (result.download !== undefined) {
            settingDownload.checked = result.download;
            btnText.textContent = result.download ? 'Save File' : 'Copy to Clipboard';
        }
        if (result.webhook !== undefined) settingWebhook.value = result.webhook;
        if (result.choice !== undefined) setChoice(result.choice);
        if (result.advancedOpen) {
            advancedSettings.classList.remove('hidden');
            advancedChevron.classList.add('open');
        }
    });

    const saveSettings = () => {
        chrome.storage.local.set({
            maxSubcomments: parseInt(settingSubcomments.value) || 5,
            format: settingFormat.value,
            metrics: settingMetrics.checked,
            download: settingDownload.checked,
            webhook: settingWebhook.value.trim()
        });
    };

    // Auto-save on every change
    settingSubcomments.addEventListener('input', saveSettings);
    settingFormat.addEventListener('change', saveSettings);
    settingMetrics.addEventListener('change', saveSettings);
    settingWebhook.addEventListener('input', saveSettings);

    // --- Advanced Settings Toggle ---
    toggleAdvancedBtn.addEventListener('click', () => {
        const isHidden = advancedSettings.classList.toggle('hidden');
        advancedChevron.classList.toggle('open', !isHidden);
        chrome.storage.local.set({ advancedOpen: !isHidden });
    });

    // --- Logger ---
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

    // --- UI Toggles ---
    toggleLogsBtn.addEventListener('click', () => {
        logContainer.classList.toggle('hidden');
        toggleLogsBtn.textContent = logContainer.classList.contains('hidden') ? 'View Runtime Protocol Specs' : 'Hide Specs';
    });

    copyLogsBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(logger.logs.join('\n'));
        const originalText = copyLogsBtn.textContent;
        copyLogsBtn.textContent = 'Copied!';
        setTimeout(() => { copyLogsBtn.textContent = originalText; }, 1500);
    });

    // --- Live Progress from Content Script ---
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'progress') {
            updateStatus(message.text, 'normal');
            logger.log(message.text);
        }
    });

    // --- Main Action ---
    scrapeBtn.addEventListener('click', async () => {
        scrapeBtn.disabled = true;
        logger.clear();
        logger.log('Engaging Scraper Engine...');

        // Post Only: depth=0, unroll=true (only main post captured)
        // Thread: depth from settings, unroll=false
        const isPostOnly = currentChoice === 'post';
        const userConfig = {
            MAX_SUB_COMMENTS: isPostOnly ? 0 : (parseInt(settingSubcomments.value) || 5),
            FORMAT: settingFormat.value,
            UNROLL_THREAD: isPostOnly,
            INCLUDE_METRICS: settingMetrics.checked,
            DOWNLOAD: settingDownload.checked,
            EXTRACT_LINKS: false,
            WEBHOOK_URL: settingWebhook.value.trim()
        };


        try {
            await runScrapeProcess(userConfig);
        } catch (err) {
            logger.log(`Critical Error: ${err.message}`, 'error');
            updateStatus(`Execution Failed: ${err.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    });

    // --- Scraping Pipeline ---
    async function runScrapeProcess(userConfig) {
        updateStatus('Initializing Target Scan...', 'normal');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        logger.log(`Active tab acquired: ${tab.id} (${tab.url})`);

        const validDomains = ['x.com', 'twitter.com', 'linkedin.com', 'instagram.com'];
        const isSupported = validDomains.some(domain => tab.url.includes(domain));

        if (!isSupported) {
            throw new Error('This platform is not yet supported for extraction.');
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

                // Second Brain Webhook POST
                if (userConfig.WEBHOOK_URL) {
                    try {
                        logger.log('Transmitting to Second Brain Webhook...');
                        fetch(userConfig.WEBHOOK_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                source: 'Omni-Scraper',
                                timestamp: new Date().toISOString(),
                                dataCount: result.count,
                                payload: result.rawData || result.data
                            }),
                            mode: 'no-cors'
                        }).catch(e => logger.log('Webhook warning (CORS is normal): ' + e, 'error'));
                        logger.log('Webhook dispatched successfully.');
                    } catch (e) {
                        logger.log(`Webhook Error: ${e.message}`, 'error');
                    }
                }

                if (userConfig.DOWNLOAD) {
                    const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);

                    let filename = `Social_Scrape_${new Date().getTime()}`;
                    if (userConfig.FORMAT === 'json') filename += '.json';
                    else if (userConfig.FORMAT === 'markdown') filename += '.md';
                    else filename += '.txt';

                    await chrome.downloads.download({ url: url, filename: filename, saveAs: true });
                    logger.log('File Download Sent to Browser API.');
                    updateStatus(`Success! Saved ${result.count} items.`, 'success');
                } else {
                    await navigator.clipboard.writeText(result.data);
                    logger.log('Copied directly to User Clipboard.');
                    updateStatus(`Success! Copied ${result.count} items to clipboard.`, 'success');
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

    // --- Helpers ---
    function updateStatus(text, type = 'normal') {
        statusBox.classList.remove('hidden');
        statusText.textContent = text;
        statusBox.className = 'status-box';
        if (type === 'error') statusBox.classList.add('status-error');
        if (type === 'success') statusBox.classList.add('status-success');
    }

    async function atomicScrape(scraperUrl, userConfig) {
        const { atomicScrape: sharedScraper } = await import(scraperUrl);
        return await sharedScraper(userConfig);
    }
});
