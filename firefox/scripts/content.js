(() => {
    // Prevent multiple injections
    if (window.xScraperInjected) return;
    window.xScraperInjected = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'start_scrape') {
            startScraping();
        }
    });

    async function startScraping() {
        try {
            reportStatus('Initializing...', 'normal');

            // 1. Validation
            if (!window.location.href.includes('/status/')) {
                throw new Error('Not a valid X thread URL.');
            }

            // 2. Expansion (Show more)
            reportStatus('Expanding tweets...', 'normal');
            await expandTweets();

            // 3. Scrolling (Load replies)
            reportStatus('Scrolling to load replies...', 'normal');
            await autoScroll();

            // 4. Scraping
            reportStatus('Scraping content...', 'normal');
            const data = scrapeData();

            // 5. Formatting & Clipboard
            const formattedText = formatData(data);
            await copyToClipboard(formattedText);

            // 6. Done
            chrome.runtime.sendMessage({ action: 'scrape_complete' });

        } catch (err) {
            console.error(err);
            chrome.runtime.sendMessage({ action: 'scrape_error', message: err.message });
        }
    }

    function reportStatus(text, type) {
        chrome.runtime.sendMessage({ action: 'status_update', status: text, type: type });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function expandTweets() {
        // Find "Show more" buttons. 
        // Selector might need adjustment as X changes classes. 
        // data-testid="tweet-text-show-more-link" is a good bet.
        const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
        for (const btn of showMoreButtons) {
            btn.click();
            await sleep(500 + Math.random() * 500); // Random delay
        }
    }

    async function autoScroll() {
        // Scroll down a few times to load some replies.
        // We won't go forever, maybe just a fixed amount or until no new tweets appear for a bit.
        // For v0.1, let's scroll for a fixed duration or number of steps to mimic user reading.
        const maxScrolls = 5;
        let lastHeight = document.body.scrollHeight;

        for (let i = 0; i < maxScrolls; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(1500 + Math.random() * 1000); // Wait for load

            let newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
                // No new content loaded
                break;
            }
            lastHeight = newHeight;
        }

        // Scroll back up to top? Not strictly necessary but nice.
        // window.scrollTo(0, 0);
    }

    function scrapeData() {
        const tweets = [];
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach((article, index) => {
            try {
                // User Handle & Name
                const userElement = article.querySelector('[data-testid="User-Name"]');
                const userInfo = userElement ? userElement.innerText.split('\n') : ['Unknown'];
                // Usually: Name, @Handle, ·, Time
                const name = userInfo[0] || 'Unknown';
                const handle = userInfo[1] || '@unknown';

                // Timestamp
                const timeElement = article.querySelector('time');
                const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

                // Text Content
                const textElement = article.querySelector('[data-testid="tweetText"]');
                let text = '';
                if (textElement) {
                    // Get text, handling images/emojis if possible (innerText usually works well for text)
                    text = textElement.innerText;
                }

                // Determine if it's the main tweet or a reply
                // The first one is usually the main tweet in a status view.
                // However, sometimes previous tweets in thread are shown.
                // We'll assume index 0 is main for now, or check URL vs tweet link if needed.
                // For v0.1, simple list is fine.

                tweets.push({
                    name,
                    handle,
                    timestamp,
                    text,
                    isMain: index === 0 // Naive assumption
                });
            } catch (e) {
                console.warn('Failed to scrape a tweet', e);
            }
        });

        return tweets;
    }

    function formatData(tweets) {
        if (tweets.length === 0) return "No tweets found.";

        let output = "";

        // Main Post
        const main = tweets[0];
        output += `[Main Post]\n${main.handle} (${main.timestamp}):\n${main.text}\n\n`;

        // Replies
        output += `[Replies]\n`;
        for (let i = 1; i < tweets.length; i++) {
            const t = tweets[i];
            output += `${i}. ${t.handle}: ${t.text}\n`;
        }

        return output;
    }

    async function copyToClipboard(text) {
        // Use the Clipboard API
        // Since we have 'clipboardWrite' permission and are in a focused tab (mostly), this should work.
        // However, navigator.clipboard.writeText needs focus.
        // The content script runs in the page context, so it should be fine if the user just clicked the extension.
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            // Fallback if focus is lost or other issue
            console.error('Clipboard API failed, trying fallback', err);
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
        }
    }

})();
