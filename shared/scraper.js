// Shared Scraper Logic Module
// This module contains the core scraping functionality used by both popup and content script

// Configuration Constants
export const SCRAPER_CONFIG = {
    TARGET_COUNT: 100,
    TARGET_BUFFER: 50,
    MAX_NO_NEW_TWEETS: 3,
    MAX_SUB_COMMENTS: 5,
    SCROLL_WAIT_MS: 1500,
    EXPAND_WAIT_MS: 500
};

/**
 * Main scraping function - executes the complete thread scraping logic
 * @returns {Promise<{status: string, data?: string, count?: number, message?: string}>}
 */
export async function atomicScrape() {
    const log = (msg) => console.log(`[Atomic Scraper] ${msg}`);
    log('Starting v0.1.7 Scraper...');

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
        let noNewTweetsCount = 0;
        let mainPostHandle = null;

        // 3. Scraping Loop
        while (tweetsMap.size < (SCRAPER_CONFIG.TARGET_COUNT + SCRAPER_CONFIG.TARGET_BUFFER) &&
            noNewTweetsCount < SCRAPER_CONFIG.MAX_NO_NEW_TWEETS) {

            // A. Expand "Show More" buttons
            const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
            for (const btn of showMoreButtons) {
                btn.click();
            }
            if (showMoreButtons.length > 0) await sleep(SCRAPER_CONFIG.EXPAND_WAIT_MS);

            // B. Scrape Visible Tweets
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
                } catch (e) {
                    console.error('[Scraper] Error processing tweet:', e);
                }
            });

            log(`Scraped cycle: ${tweetsMap.size} total (+${newFound} new)`);

            if (newFound === 0) {
                noNewTweetsCount++;
            } else {
                noNewTweetsCount = 0;
            }

            // Check if we have enough tweets
            if (tweetsMap.size >= SCRAPER_CONFIG.TARGET_COUNT * 2) break;

            // C. Scroll
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(SCRAPER_CONFIG.SCROLL_WAIT_MS);
        }

        // 4. Process & Filter
        const allTweets = Array.from(tweetsMap.values());

        // Find Main Post
        let mainPost = allTweets.find(t => t.isMain);
        if (!mainPost && allTweets.length > 0) {
            mainPost = allTweets[0];
            mainPostHandle = mainPost.handle;
        }
        if (!mainPost) {
            return { status: 'error', message: 'No tweets found' };
        }

        // Filter Logic
        const validTweets = [];

        const replies = allTweets.filter(t => t.id !== mainPost.id);

        // Separate author thread posts from other user comments
        const authorThreadPosts = replies.filter(t => t.handle === mainPostHandle);
        const otherComments = replies.filter(t => t.handle !== mainPostHandle);

        // Include ALL author thread posts (these are thread continuations, not comments)
        validTweets.push(...authorThreadPosts);

        // Apply TARGET_COUNT limit only to non-author comments
        let subCommentCount = 0;

        for (const tweet of otherComments) {
            // Stop when we have enough non-author comments
            if ((validTweets.length - authorThreadPosts.length) >= SCRAPER_CONFIG.TARGET_COUNT) break;

            // Determine if Level 1 (direct reply to main post)
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
                // Level 2 (Sub-comment)
                if (subCommentCount < SCRAPER_CONFIG.MAX_SUB_COMMENTS) {
                    validTweets.push(tweet);
                    subCommentCount++;
                }
            }
        }

        // 5. Format Output
        let output = `[Main Post]\n${mainPost.handle} (${mainPost.timestamp}):\n${mainPost.text}\n\n`;
        output += `[Replies] (${validTweets.length})\n`;

        validTweets.forEach((t, i) => {
            output += `${i + 1}. ${t.handle}: ${t.text}\n`;
        });

        try {
            await navigator.clipboard.writeText(output);
        } catch (e) {
            console.error('[Scraper] Failed to copy to clipboard:', e);
        }

        return { status: 'success', data: output, count: validTweets.length + 1 };

    } catch (err) {
        console.error('[Scraper] Critical error:', err);
        return { status: 'error', message: err.toString() };
    }
}
