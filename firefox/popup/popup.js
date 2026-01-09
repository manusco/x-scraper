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
    // This runs INSIDE the page. No external dependencies.
    async function atomicScrape() {
        const log = (msg) => console.log(`[Atomic] ${msg}`);
        log('Starting v0.1.6 Scraper...');

        try {
            // Helpers
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            // 1. Identify Main Post ID from URL
            const urlParts = window.location.pathname.split('/');
            const statusIndex = urlParts.indexOf('status');
            const mainTweetId = (statusIndex !== -1 && urlParts.length > statusIndex + 1) ? urlParts[statusIndex + 1] : null;
            log(`Target Tweet ID: ${mainTweetId}`);

            // 2. Data Collection
            const tweetsMap = new Map(); // ID -> Tweet Object
            const TARGET_COUNT = 100;
            let noNewTweetsCount = 0;
            let mainPostHandle = null;

            // 3. Loop
            while (tweetsMap.size < (TARGET_COUNT + 50) && noNewTweetsCount < 3) { // Buffer for filtering
                // A. Expand "Show More"
                const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
                for (const btn of showMoreButtons) {
                    btn.click();
                }
                if (showMoreButtons.length > 0) await sleep(500);

                // B. Scrape Visible
                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                let newFound = 0;

                articles.forEach((article) => {
                    try {
                        // Extract Text
                        const textElement = article.querySelector('[data-testid="tweetText"]');
                        const text = textElement ? textElement.innerText : '';
                        if (!text) return;

                        // Extract Handle/Time
                        const userElement = article.querySelector('[data-testid="User-Name"]');
                        const userInfo = userElement ? userElement.innerText.split('\n') : ['Unknown'];
                        const handle = userInfo[1] || '@unknown';
                        const timeElement = article.querySelector('time');
                        const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

                        // Extract "Replying to"
                        // Usually found in a div with text "Replying to @handle"
                        let replyingTo = [];
                        const replyElement = article.innerText.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
                        if (replyElement) {
                            replyingTo = replyElement.map(s => s.replace('Replying to ', '').trim());
                        }

                        // ID Generation
                        let tweetId = 'unknown_' + Math.random();
                        const link = article.querySelector('a[href*="/status/"]');
                        if (link) {
                            const match = link.href.match(/status\/(\d+)/);
                            if (match) tweetId = match[1];
                        }

                        const isMain = tweetId === mainTweetId;
                        if (isMain) mainPostHandle = handle;

                        if (!tweetsMap.has(tweetId)) {
                            tweetsMap.set(tweetId, {
                                id: tweetId,
                                handle,
                                timestamp,
                                text,
                                isMain,
                                replyingTo
                            });
                            newFound++;
                        }
                    } catch (e) { }
                });

                log(`Scraped cycle: ${tweetsMap.size} total (+${newFound} new)`);

                if (newFound === 0) {
                    noNewTweetsCount++;
                } else {
                    noNewTweetsCount = 0;
                }

                // Check if we have enough VALID tweets (approximate check to stop scrolling)
                // We'll filter properly at the end, but we need to know if we should stop.
                // For now, let's just scrape a bit more than target to be safe.
                if (tweetsMap.size >= TARGET_COUNT * 2) break;

                // C. Scroll
                window.scrollTo(0, document.body.scrollHeight);
                await sleep(1500); // Wait for load
            }

            // 4. Process & Filter
            const allTweets = Array.from(tweetsMap.values());

            // Find Main Post
            let mainPost = allTweets.find(t => t.isMain);
            if (!mainPost && allTweets.length > 0) {
                mainPost = allTweets[0];
                mainPostHandle = mainPost.handle;
            }
            if (!mainPost) return { status: 'error', message: 'No tweets found' };

            // Filter Logic
            const validTweets = [];
            let currentLevel1Id = null;
            let subCommentCount = 0;

            // We assume the list is roughly in order of appearance (Main -> Comment 1 -> Sub 1 -> Sub 2 -> Comment 2...)
            // But Map iteration order is insertion order. Since we scroll down, it should be correct.

            // First, separate Main Post
            // Then iterate the rest
            const replies = allTweets.filter(t => t.id !== mainPost.id);

            for (const tweet of replies) {
                if (validTweets.length >= TARGET_COUNT) break;

                // Determine Level
                // Level 1: Replying ONLY to MainHandle (or no reply info if it's a direct reply sometimes hidden)
                // Level 2: Replying to someone else OR (MainHandle AND someone else)

                let isLevel1 = false;

                // Heuristic: If it replies to MainHandle and NO ONE ELSE, it's Level 1.
                // If it replies to MainHandle AND others, it's likely a sub-comment involving the OP.
                // If it replies to NO ONE (rare in thread view), assume Level 1?

                if (tweet.replyingTo.length === 0) {
                    // Sometimes "Replying to" is hidden for the very first reply? 
                    // Or if we missed scraping it.
                    // Let's assume Level 1 if ambiguous.
                    isLevel1 = true;
                } else if (tweet.replyingTo.length === 1 && tweet.replyingTo[0] === mainPostHandle) {
                    isLevel1 = true;
                } else {
                    isLevel1 = false;
                }

                if (isLevel1) {
                    validTweets.push(tweet);
                    currentLevel1Id = tweet.id;
                    subCommentCount = 0;
                } else {
                    // Level 2 (Sub-comment)
                    if (subCommentCount < 5) {
                        validTweets.push(tweet);
                        subCommentCount++;
                    }
                    // Else skip
                }
            }

            // 5. Format Output
            let output = `[Main Post]\n${mainPost.handle} (${mainPost.timestamp}):\n${mainPost.text}\n\n`;
            output += `[Replies] (${validTweets.length})\n`;

            validTweets.forEach((t, i) => {
                output += `${i + 1}. ${t.handle}: ${t.text}\n`;
            });

            try { await navigator.clipboard.writeText(output); } catch (e) { }

            return { status: 'success', data: output, count: validTweets.length + 1 };

        } catch (err) {
            return { status: 'error', message: err.toString() };
        }
    }
});
