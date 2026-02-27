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
export async function atomicScrape(userConfig = {}) {
    const config = { ...SCRAPER_CONFIG, ...userConfig };

    const log = (msg) => console.log(`[Atomic Scraper] ${msg}`);
    log('Starting v0.1.7 Scraper...');

    const emitProgress = (msg) => {
        try {
            chrome.runtime.sendMessage({ action: 'progress', text: msg }).catch(() => { });
        } catch (e) { }
    };

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
            const cells = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
            let newFound = 0;
            let hitBoundary = false;

            for (const cell of cells) {
                if (hitBoundary) continue;

                const textContext = cell.innerText || cell.textContent || '';
                // Check if this cell is a boundary indicator
                if (/^(Discover more|More posts|More Tweets)$/i.test(textContext.trim()) && !cell.querySelector('article')) {
                    log('Hit boundary: ' + textContext.trim());
                    hitBoundary = true;
                    continue;
                }

                const article = cell.querySelector('article[data-testid="tweet"]');
                if (article) {
                    const tweet = extractTweetData(article);
                    if (tweet && !tweetsMap.has(tweet.id)) {
                        tweetsMap.set(tweet.id, tweet);
                        if (tweet.id === mainTweetId) mainPostHandle = tweet.handle;
                        newFound++;
                    }
                }
            }

            log(`Scraped cycle: ${tweetsMap.size} total (+${newFound} new)`);
            emitProgress(`Scraping... (${tweetsMap.size} tweets gathered)`);
            noNewTweetsCount = (newFound === 0) ? noNewTweetsCount + 1 : 0;

            if (hitBoundary) {
                log('Boundary reached, stopping scroll.');
                break;
            }

            if (tweetsMap.size >= config.TARGET_COUNT * 2) break;

            // C. Scroll
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(config.SCROLL_WAIT_MS);
        }

        /**
         * Extract structured data from a tweet article element
         */
        function extractTweetData(article) {
            try {
                const textElements = article.querySelectorAll('[data-testid="tweetText"]');
                let text = textElements.length > 0 ? textElements[0].innerText : '';
                if (textElements.length > 1) {
                    text += '\n[Quoted]: ' + textElements[1].innerText;
                }

                const userElement = article.querySelector('[data-testid="User-Name"]');
                const handleMatch = userElement ? userElement.innerText.match(/@[a-zA-Z0-9_]+/) : null;
                const handle = handleMatch ? handleMatch[0] : '@unknown';

                const timeElement = article.querySelector('time');
                const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

                const replyingTo = (article.innerText.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g) || [])
                    .map(s => s.replace('Replying to ', '').trim());

                let tweetId = null;

                // 1. Check header for reply IDs (Reliable for replies and avoids quoted tweet IDs)
                if (userElement) {
                    const timeLink = userElement.querySelector('a[href*="/status/"]');
                    if (timeLink) {
                        const match = timeLink.href.match(/status\/(\d+)/);
                        if (match) tweetId = match[1];
                    }
                }

                // 2. Identify the main tweet reliably
                if (!tweetId && mainTweetId) {
                    const links = article.querySelectorAll('a[href*="/status/"]');
                    for (const link of links) {
                        const match = link.href.match(/status\/(\d+)/);
                        if (match && match[1] === mainTweetId) {
                            tweetId = match[1];
                            break;
                        }
                    }
                    if (!tweetId) {
                        tweetId = mainTweetId;
                    }
                }

                if (!tweetId) tweetId = 'unknown_' + Math.random();

                // Extra check for image media / visual awareness
                const imageElements = article.querySelectorAll('div[data-testid="tweetPhoto"] img, div[data-testid="videoComponent"] video');
                imageElements.forEach((img, index) => {
                    const alt = img.getAttribute('alt');
                    text += `\n[Media${imageElements.length > 1 ? ` ${(index + 1)}` : ''}: ${alt ? alt : 'Visual Attachment'}]`;
                });

                // Extract Metrics optionally
                let metrics = { replies: 0, reposts: 0, likes: 0, views: 0 };
                article.querySelectorAll('[role="group"] [aria-label]').forEach(el => {
                    const label = el.getAttribute('aria-label').toLowerCase();
                    const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(num)) {
                        if (label.includes('repl')) metrics.replies = num;
                        if (label.includes('repost')) metrics.reposts = num;
                        if (label.includes('like')) metrics.likes = num;
                        if (label.includes('view')) metrics.views = num;
                    }
                });

                // Do not drop main tweet even if it's just media
                if (!text && !article.querySelector('img') && tweetId !== mainTweetId) {
                    return null;
                }

                return {
                    id: tweetId,
                    handle,
                    timestamp,
                    text: text || '[Media/Empty]',
                    isMain: tweetId === mainTweetId,
                    replyingTo,
                    metrics
                };
            } catch (e) {
                console.error('[Scraper] Error processing tweet:', e);
                return null;
            }
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

        // Filter Logic - Maintain Chronological DOM Order
        const validTweets = [];
        let currentSubCommentCount = 0;
        let nonAuthorCount = 0;

        for (let i = 0; i < allTweets.length; i++) {
            const tweet = allTweets[i];

            // Skip main post since we process it directly at output
            if (tweet.id === mainPost.id) continue;

            const isAuthor = tweet.handle === mainPostHandle;

            // Determine level: L1 means direct reply toOP or author's own thread extension
            let isLevel1 = false;
            if (isAuthor) {
                isLevel1 = true;
            } else if (tweet.replyingTo.length === 0) {
                isLevel1 = true;
            } else if (tweet.replyingTo.length === 1 && tweet.replyingTo[0] === mainPostHandle) {
                isLevel1 = true;
            }

            // UNROLL feature: Ignore entire post if not author
            if (config.UNROLL_THREAD && !isAuthor) {
                continue;
            }

            if (isLevel1) {
                currentSubCommentCount = 0; // Starts a fresh group
                validTweets.push(tweet);
                if (!isAuthor) nonAuthorCount++;
            } else {
                // It is a sub-comment
                if (currentSubCommentCount < config.MAX_SUB_COMMENTS) {
                    validTweets.push(tweet);
                    currentSubCommentCount++;
                    if (!isAuthor) nonAuthorCount++;
                } else {
                    // Maximum subcomments reached
                }
            }

            // Stop when we hit the total requested limit for non-author tweets
            if (nonAuthorCount >= config.TARGET_COUNT) break;
        }

        // 5. Format Output
        let output = '';

        const renderMetrics = (m) => config.INCLUDE_METRICS ? `  [💡 ${m.likes} Likes | 🔁 ${m.reposts} Reposts | 💬 ${m.replies} Replies | 👁️ ${m.views} Views]` : '';
        const renderMarkdownMetrics = (m) => config.INCLUDE_METRICS ? `\n> *${m.likes} Likes | ${m.reposts} Reposts | ${m.replies} Replies | ${m.views} Views*` : '';

        if (config.FORMAT === 'json') {
            const dataToExport = { mainPost, replies: validTweets };
            if (!config.INCLUDE_METRICS) {
                delete dataToExport.mainPost.metrics;
                dataToExport.replies.forEach(t => delete t.metrics);
            }
            output = JSON.stringify(dataToExport, null, 2);
        } else if (config.FORMAT === 'markdown') {
            output = `# Thread by ${mainPost.handle}\n\n`;
            output += `**${mainPost.handle}** (${mainPost.timestamp}):\n${mainPost.text}${renderMarkdownMetrics(mainPost.metrics)}\n\n`;

            if (validTweets.length > 0) {
                output += `## ${config.UNROLL_THREAD ? 'Thread Breakdown' : 'Replies'} (${validTweets.length})\n\n`;
                validTweets.forEach((t) => {
                    output += `> **${t.handle}**: ${t.text.replace(/\n/g, '\n> ')}${renderMarkdownMetrics(t.metrics)}\n\n`;
                });
            }
        } else {
            output = `[Main Post]\n${mainPost.handle} (${mainPost.timestamp}):\n${mainPost.text}\n${renderMetrics(mainPost.metrics)}\n\n`;
            if (validTweets.length > 0) {
                output += `[${config.UNROLL_THREAD ? 'Thread Extension' : 'Replies'}] (${validTweets.length})\n`;
                validTweets.forEach((t, i) => {
                    output += `${i + 1}. ${t.handle}: ${t.text}\n${renderMetrics(t.metrics)}\n`;
                });
            }
        }

        return { status: 'success', data: output, count: validTweets.length + 1 };

    } catch (err) {
        console.error('[Scraper] Critical error:', err);
        return { status: 'error', message: err.toString() };
    }
}
