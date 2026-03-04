// shared/scraper.js

export const SCRAPER_CONFIG = {
    TARGET_COUNT: 100,
    TARGET_BUFFER: 50,
    MAX_NO_NEW_TWEETS: 3,
    MAX_SUB_COMMENTS: 5,
    SCROLL_WAIT_MS: 1500,
    EXPAND_WAIT_MS: 500
};

// --- Helper Functions ---

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getText = (el) => (el ? (el.innerText || el.textContent || '') : '');

function getContext() {
    let isBookmarksMode = false;
    let mainTweetId = null;

    if (typeof window !== 'undefined' && window.location) {
        isBookmarksMode = window.location.pathname.includes('/i/bookmarks');
        const urlParts = window.location.pathname.split('/');
        const statusIndex = urlParts.indexOf('status');
        if (statusIndex !== -1 && urlParts.length > statusIndex + 1) {
            mainTweetId = urlParts[statusIndex + 1];
        }
    }
    return { isBookmarksMode, mainTweetId };
}

function extractTweetData(article, mainTweetId, config) {
    try {
        const isXArticle = article.getAttribute('data-testid') === 'twitterArticleReadView';

        let text = '';
        if (isXArticle) {
            const titleEls = article.querySelectorAll('[data-testid="twitter-article-title"]');
            if (titleEls.length > 0) text += `# ${getText(titleEls[0])}\n\n`;

            const textBlocks = article.querySelectorAll('[data-testid="longformRichTextComponent"]');
            if (textBlocks.length > 0) {
                textBlocks.forEach(el => text += getText(el) + '\n\n');
            } else {
                const richTextEls = article.querySelectorAll('[data-testid="twitterArticleRichTextView"]');
                if (richTextEls.length > 0) {
                    richTextEls.forEach(el => text += getText(el) + '\n\n');
                } else {
                    const fallbackText = article.querySelector('[data-testid="tweetText"]');
                    if (fallbackText) text += getText(fallbackText);
                }
            }
            text = text.trim();
        } else {
            const textElements = article.querySelectorAll('[data-testid="tweetText"]');
            text = textElements.length > 0 ? getText(textElements[0]) : '';
            if (textElements.length > 1) {
                text += '\n[Quoted]: ' + getText(textElements[1]);
            }
        }

        const userElement = article.querySelector('[data-testid="User-Name"]');
        const handleMatch = userElement ? getText(userElement).match(/@[a-zA-Z0-9_]+/) : null;
        const handle = handleMatch ? handleMatch[0] : '@unknown';

        const timeElement = article.querySelector('time');
        const timestamp = timeElement ? timeElement.getAttribute('datetime') : 'Unknown Time';

        const replyingTo = (getText(article).match(/Replying to\s+(@[a-zA-Z0-9_]+)/g) || [])
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
            if (isXArticle) {
                tweetId = mainTweetId;
            } else {
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
        }

        if (!tweetId) tweetId = 'unknown_' + Math.random();

        // Extra check for image media / visual awareness
        const imageElements = isXArticle
            ? article.querySelectorAll('img, video')
            : article.querySelectorAll('div[data-testid="tweetPhoto"] img, div[data-testid="videoComponent"] video');

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

        // Extract Links (Resource Harvester)
        let extractedLinks = [];
        if (config.EXTRACT_LINKS) {
            const anchors = article.querySelectorAll('[data-testid="tweetText"] a[href^="http"]');
            anchors.forEach(a => {
                if (!a.href.includes('twitter.com') && !a.href.includes('x.com')) {
                    extractedLinks.push(a.href);
                }
            });
        }

        // If absolutely no meaning can be extracted, skip it to avoid polluting data.
        // Don't drop tweets with media or if we know it's our main tweet.
        if (!text && imageElements.length === 0 && tweetId !== mainTweetId && handle === '@unknown') {
            return null;
        }

        return {
            id: tweetId,
            handle,
            timestamp,
            text: text || '[Media/Empty]',
            isMain: tweetId === mainTweetId,
            replyingTo,
            metrics,
            links: extractedLinks
        };
    } catch (e) {
        console.error('[Scraper] Error processing tweet:', e);
        return null; // Skip invalid elements rather than crashing
    }
}

function processAndFilterTweets(tweetsMap, isBookmarksMode, mainTweetId, config) {
    const allTweets = Array.from(tweetsMap.values());
    let validTweets = [];
    let mainPost = null;
    let mainPostHandle = null;

    if (isBookmarksMode) {
        validTweets = allTweets;
        if (validTweets.length > 0) mainPost = validTweets[0];
        return { mainPost, validTweets };
    }

    mainPost = allTweets.find(t => t.isMain);
    if (!mainPost && allTweets.length > 0) {
        mainPost = allTweets[0];
    }

    if (!mainPost) {
        throw new Error('No tweets found during processing.');
    }

    mainPostHandle = mainPost.handle;

    let currentSubCommentCount = 0;
    let nonAuthorCount = 0;

    for (let i = 0; i < allTweets.length; i++) {
        const tweet = allTweets[i];

        if (tweet.id === mainPost.id) continue;

        const isAuthor = tweet.handle === mainPostHandle;

        let isLevel1 = false;
        if (isAuthor) {
            isLevel1 = true;
        } else if (tweet.replyingTo.length === 0) {
            isLevel1 = true;
        } else if (tweet.replyingTo.length === 1 && tweet.replyingTo[0] === mainPostHandle) {
            isLevel1 = true;
        }

        if (config.UNROLL_THREAD && !isAuthor) {
            continue;
        }

        if (isLevel1) {
            currentSubCommentCount = 0;
            validTweets.push(tweet);
            if (!isAuthor) nonAuthorCount++;
        } else {
            if (currentSubCommentCount < config.MAX_SUB_COMMENTS) {
                validTweets.push(tweet);
                currentSubCommentCount++;
                if (!isAuthor) nonAuthorCount++;
            }
        }

        if (nonAuthorCount >= config.TARGET_COUNT) break;
    }

    return { mainPost, validTweets };
}

function formatOutput(mainPost, validTweets, isBookmarksMode, config) {
    let output = '';
    const renderMetrics = (m) => config.INCLUDE_METRICS && m ? `  [💡 ${m.likes} Likes | 🔁 ${m.reposts} Reposts | 💬 ${m.replies} Replies | 👁️ ${m.views} Views]` : '';
    const renderMarkdownMetrics = (m) => config.INCLUDE_METRICS && m ? `\n> *${m.likes} Likes | ${m.reposts} Reposts | ${m.replies} Replies | ${m.views} Views*` : '';

    let allResources = new Set();
    if (config.EXTRACT_LINKS) {
        if (mainPost && mainPost.links) mainPost.links.forEach(l => allResources.add(l));
        validTweets.forEach(t => t.links && t.links.forEach(l => allResources.add(l)));
    }

    let listToExport = isBookmarksMode ? validTweets : validTweets;

    if (config.FORMAT === 'json') {
        const dataToExport = isBookmarksMode
            ? { archiveType: 'Bookmarks', items: listToExport }
            : { archiveType: 'Thread', mainPost, replies: validTweets };

        if (!config.INCLUDE_METRICS) {
            if (dataToExport.mainPost) delete dataToExport.mainPost.metrics;
            listToExport.forEach(t => delete t.metrics);
        }
        if (config.EXTRACT_LINKS && allResources.size > 0) {
            dataToExport.harvestedResources = Array.from(allResources);
        }
        output = JSON.stringify(dataToExport, null, 2);
    } else if (config.FORMAT === 'markdown') {
        if (isBookmarksMode) {
            output = `# 🔖 Saved Bookmarks Archive (${listToExport.length} entries)\n\n`;
            listToExport.forEach((t) => {
                output += `> **${t.handle}** (${t.timestamp}): ${t.text.replace(/\n/g, '\n> ')}${renderMarkdownMetrics(t.metrics)}\n\n`;
            });
        } else {
            output = `# Thread by ${mainPost.handle}\n\n`;
            output += `**${mainPost.handle}** (${mainPost.timestamp}):\n${mainPost.text}${renderMarkdownMetrics(mainPost.metrics)}\n\n`;

            if (validTweets.length > 0) {
                output += `## ${config.UNROLL_THREAD ? 'Thread Breakdown' : 'Replies'} (${validTweets.length})\n\n`;
                validTweets.forEach((t) => {
                    output += `> **${t.handle}**: ${t.text.replace(/\n/g, '\n> ')}${renderMarkdownMetrics(t.metrics)}\n\n`;
                });
            }
        }

        if (config.EXTRACT_LINKS && allResources.size > 0) {
            output += `\n---\n## 🔗 Harvested Resources (${allResources.size})\n\n`;
            Array.from(allResources).forEach(l => output += `- ${l}\n`);
        }
    } else {
        if (isBookmarksMode) {
            output = `[Bookmarks Archive]\nCollected: ${listToExport.length}\n\n`;
            listToExport.forEach((t, i) => {
                output += `${i + 1}. [${t.timestamp}] ${t.handle}: ${t.text}\n${renderMetrics(t.metrics)}\n\n`;
            });
        } else {
            output = `[Main Post]\n${mainPost.handle} (${mainPost.timestamp}):\n${mainPost.text}\n${renderMetrics(mainPost.metrics)}\n\n`;
            if (validTweets.length > 0) {
                output += `[${config.UNROLL_THREAD ? 'Thread Extension' : 'Replies'}] (${validTweets.length})\n`;
                validTweets.forEach((t, i) => {
                    output += `${i + 1}. ${t.handle}: ${t.text}\n${renderMetrics(t.metrics)}\n`;
                });
            }
        }

        if (config.EXTRACT_LINKS && allResources.size > 0) {
            output += '\n[Harvested Resources]\n';
            Array.from(allResources).forEach(l => output += `- ${l}\n`);
        }
    }

    return output;
}

// --- Main Scraper Engine ---

export async function atomicScrape(userConfig = {}) {
    const config = { ...SCRAPER_CONFIG, ...userConfig };
    const log = (msg) => console.log(`[Atomic Scraper] ${msg}`);
    const emitProgress = (msg) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ action: 'progress', text: msg }).catch(() => { });
            }
        } catch (e) {
            // Ignore if disconnected
        }
    };

    log('Engaging v0.2.0 Scraper Engine...');

    try {
        const { isBookmarksMode, mainTweetId } = getContext();
        log(`Context: ${isBookmarksMode ? 'Bookmarks Archive' : 'Thread Scrape'}`);
        log(`Target Tweet ID: ${mainTweetId}`);

        const tweetsMap = new Map();
        let noNewTweetsCount = 0;

        // Ensure DOM has hydrated tweets OR articles before we start scrolling
        let hydrationRetries = 0;
        while (document.querySelectorAll('article[data-testid="tweet"], [data-testid="twitterArticleReadView"]').length === 0 && hydrationRetries < 5) {
            log('Waiting for React DOM to hydrate tweets...');
            emitProgress('Waiting for page to load...');
            await sleep(1000);
            hydrationRetries++;
        }

        // Scraping Loop
        while (tweetsMap.size < (config.TARGET_COUNT + config.TARGET_BUFFER) && noNewTweetsCount < config.MAX_NO_NEW_TWEETS) {

            // Expand "Show More"
            const showMoreButtons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
            for (const btn of showMoreButtons) {
                btn.click();
            }
            if (showMoreButtons.length > 0) await sleep(config.EXPAND_WAIT_MS);

            // Scrape Visible
            const cells = document.querySelectorAll('div[data-testid="cellInnerDiv"], [data-testid="twitterArticleReadView"]');
            let newFound = 0;
            let hitBoundary = false;

            for (const cell of cells) {
                if (hitBoundary) continue;

                const textContext = getText(cell);
                if (/^(Discover more|More posts|More Tweets)$/i.test(textContext.trim()) && !cell.querySelector('article')) {
                    log('Hit boundary: ' + textContext.trim());
                    hitBoundary = true;
                    continue;
                }

                const article = cell.getAttribute('data-testid') === 'twitterArticleReadView'
                    ? cell
                    : cell.querySelector('article[data-testid="tweet"]');

                if (article) {
                    const tweet = extractTweetData(article, mainTweetId, config);
                    if (tweet && !tweetsMap.has(tweet.id)) {
                        tweetsMap.set(tweet.id, tweet);
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

            window.scrollTo(0, document.body.scrollHeight);
            await sleep(config.SCROLL_WAIT_MS);
        }

        if (tweetsMap.size === 0) {
            return { status: 'error', message: 'No tweets found. Make sure you are on a valid X thread or bookmarks page or give it a second to load.' };
        }

        const { mainPost, validTweets } = processAndFilterTweets(tweetsMap, isBookmarksMode, mainTweetId, config);
        const output = formatOutput(mainPost, validTweets, isBookmarksMode, config);

        return {
            status: 'success',
            data: output,
            count: validTweets.length + (isBookmarksMode ? 0 : 1),
            rawData: Array.from(tweetsMap.values())
        };

    } catch (err) {
        console.error('[Scraper] Critical error:', err);
        return { status: 'error', message: err.toString() };
    }
}
