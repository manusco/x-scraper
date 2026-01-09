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

    // Shared Logic (Duplicated from popup.js for independence)
    async function atomicScrapeLogic() {
        try {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const urlParts = window.location.pathname.split('/');
            const statusIndex = urlParts.indexOf('status');
            const mainTweetId = (statusIndex !== -1 && urlParts.length > statusIndex + 1) ? urlParts[statusIndex + 1] : null;

            const tweetsMap = new Map();
            const TARGET_COUNT = 100;
            let noNewTweetsCount = 0;
            let mainPostHandle = null;

            while (tweetsMap.size < (TARGET_COUNT + 50) && noNewTweetsCount < 3) {
                const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
                for (const btn of showMoreButtons) btn.click();
                if (showMoreButtons.length > 0) await sleep(500);

                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                let newFound = 0;

                articles.forEach((article) => {
                    try {
                        const textElement = article.querySelector('[data-testid="tweetText"]');
                        const text = textElement ? textElement.innerText : '';
                        if (!text) return;

                        const userElement = article.querySelector('[data-testid="User-Name"]');
                        const userInfo = userElement ? userElement.innerText.split('\n') : ['Unknown'];
                        const handle = userInfo[1] || '@unknown';
                        const timeElement = article.querySelector('time');
                        const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

                        let replyingTo = [];
                        const replyElement = article.innerText.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
                        if (replyElement) {
                            replyingTo = replyElement.map(s => s.replace('Replying to ', '').trim());
                        }

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

                if (newFound === 0) noNewTweetsCount++;
                else noNewTweetsCount = 0;

                if (tweetsMap.size >= TARGET_COUNT * 2) break;

                window.scrollTo(0, document.body.scrollHeight);
                await sleep(1500);
            }

            const allTweets = Array.from(tweetsMap.values());
            let mainPost = allTweets.find(t => t.isMain);
            if (!mainPost && allTweets.length > 0) {
                mainPost = allTweets[0];
                mainPostHandle = mainPost.handle;
            }
            if (!mainPost) return { status: 'error', message: 'No tweets found' };

            const validTweets = [];
            let subCommentCount = 0;
            const replies = allTweets.filter(t => t.id !== mainPost.id);

            for (const tweet of replies) {
                if (validTweets.length >= TARGET_COUNT) break;

                let isLevel1 = false;
                if (tweet.replyingTo.length === 0) {
                    isLevel1 = true;
                } else if (tweet.replyingTo.length === 1 && tweet.replyingTo[0] === mainPostHandle) {
                    isLevel1 = true;
                } else {
                    isLevel1 = false;
                }

                if (isLevel1) {
                    validTweets.push(tweet);
                    subCommentCount = 0;
                } else {
                    if (subCommentCount < 5) {
                        validTweets.push(tweet);
                        subCommentCount++;
                    }
                }
            }

            let output = `[Main Post]\n${mainPost.handle} (${mainPost.timestamp}):\n${mainPost.text}\n\n`;
            output += `[Replies] (${validTweets.length})\n`;
            validTweets.forEach((t, i) => output += `${i + 1}. ${t.handle}: ${t.text}\n`);

            try { await navigator.clipboard.writeText(output); } catch (e) { }

            return { status: 'success', data: output, count: validTweets.length + 1 };

        } catch (err) {
            return { status: 'error', message: err.toString() };
        }
    }

})();
