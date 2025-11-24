(() => {
    // We remove the strict injection guard to allow re-injection if the extension was reloaded but the page wasn't.
    // However, we still want to avoid double listeners if the script IS alive.
    // The popup checks for 'ping' response. If we respond, it won't inject.
    // If we don't respond (orphaned), it injects.

    // If we are re-injected, we might have multiple listeners if we are not careful.
    // But 'orphaned' scripts don't receive messages from the new extension process.
    // So only the NEW script will receive the 'ping' (if it was already injected by new extension) or 'start_scrape'.

    // To be safe, let's set a flag on the window that is specific to this extension instance? 
    // No, 'window' is shared. 
    // Let's just add the listener. If we are the 'active' script, we'll work.

    if (window.xScraperListenerAdded) {
        // If this specific script instance already added a listener, don't add again.
        // But if the script is re-executed?
        // 'window' persists.
        // If we rely on popup's Ping, we shouldn't be re-executed often.
        // But if we are, let's just proceed.
    }
    window.xScraperListenerAdded = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'ping') {
            sendResponse({ status: 'pong' });
            return;
        }
        if (message.action === 'start_scrape') {
            startScraping();
        }
    });

    async function startScraping() {
        try {
            reportStatus('Initializing...', 'normal');

            if (!window.location.href.includes('/status/')) {
                throw new Error('Not a valid X thread URL.');
            }

            reportStatus('Expanding tweets...', 'normal');
            await expandTweets();

            reportStatus('Scrolling to load replies...', 'normal');
            await autoScroll();

            reportStatus('Scraping content...', 'normal');
            const data = scrapeData();

            const formattedText = formatData(data);
            await copyToClipboard(formattedText);

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
        const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
        for (const btn of showMoreButtons) {
            btn.click();
            await sleep(500 + Math.random() * 500);
        }
    }

    async function autoScroll() {
        const maxScrolls = 5;
        let lastHeight = document.body.scrollHeight;

        for (let i = 0; i < maxScrolls; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(1500 + Math.random() * 1000);

            let newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
                break;
            }
            lastHeight = newHeight;
        }
    }

    function scrapeData() {
        const tweets = [];
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach((article, index) => {
            try {
                const userElement = article.querySelector('[data-testid="User-Name"]');
                const userInfo = userElement ? userElement.innerText.split('\n') : ['Unknown'];
                const name = userInfo[0] || 'Unknown';
                const handle = userInfo[1] || '@unknown';

                const timeElement = article.querySelector('time');
                const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

                const textElement = article.querySelector('[data-testid="tweetText"]');
                let text = '';
                if (textElement) {
                    text = textElement.innerText;
                }

                tweets.push({
                    name,
                    handle,
                    timestamp,
                    text,
                    isMain: index === 0
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
        const main = tweets[0];
        output += `[Main Post]\n${main.handle} (${main.timestamp}):\n${main.text}\n\n`;

        output += `[Replies]\n`;
        for (let i = 1; i < tweets.length; i++) {
            const t = tweets[i];
            output += `${i}. ${t.handle}: ${t.text}\n`;
        }

        return output;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
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
