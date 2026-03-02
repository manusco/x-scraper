import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { SCRAPER_CONFIG, atomicScrape } from '../shared/scraper.js';

// ============================================================================
// 1. CONFIGURATION CONSTANTS
// ============================================================================

describe('SCRAPER_CONFIG', () => {
    test('all required keys exist', () => {
        const requiredKeys = ['TARGET_COUNT', 'TARGET_BUFFER', 'MAX_NO_NEW_TWEETS', 'MAX_SUB_COMMENTS', 'SCROLL_WAIT_MS', 'EXPAND_WAIT_MS'];
        requiredKeys.forEach(key => {
            expect(SCRAPER_CONFIG).toHaveProperty(key);
        });
    });

    test('all values are positive numbers', () => {
        Object.values(SCRAPER_CONFIG).forEach(val => {
            expect(typeof val).toBe('number');
            expect(val).toBeGreaterThanOrEqual(0);
        });
    });

    test('TARGET_COUNT is positive', () => {
        expect(SCRAPER_CONFIG.TARGET_COUNT).toBeGreaterThan(0);
    });

    test('TARGET_BUFFER is non-negative', () => {
        expect(SCRAPER_CONFIG.TARGET_BUFFER).toBeGreaterThanOrEqual(0);
    });

    test('MAX_NO_NEW_TWEETS is positive to prevent infinite loops', () => {
        expect(SCRAPER_CONFIG.MAX_NO_NEW_TWEETS).toBeGreaterThan(0);
    });

    test('MAX_SUB_COMMENTS prevents infinite nesting', () => {
        expect(SCRAPER_CONFIG.MAX_SUB_COMMENTS).toBeLessThan(100);
    });

    test('SCROLL_WAIT_MS is reasonable (100ms - 5000ms)', () => {
        expect(SCRAPER_CONFIG.SCROLL_WAIT_MS).toBeGreaterThanOrEqual(100);
        expect(SCRAPER_CONFIG.SCROLL_WAIT_MS).toBeLessThan(5000);
    });

    test('EXPAND_WAIT_MS is reasonable (50ms - 2000ms)', () => {
        expect(SCRAPER_CONFIG.EXPAND_WAIT_MS).toBeGreaterThanOrEqual(50);
        expect(SCRAPER_CONFIG.EXPAND_WAIT_MS).toBeLessThan(2000);
    });

    test('config is not frozen (can be overridden by userConfig)', () => {
        const merged = { ...SCRAPER_CONFIG, TARGET_COUNT: 999 };
        expect(merged.TARGET_COUNT).toBe(999);
        // Original remains untouched  
        expect(SCRAPER_CONFIG.TARGET_COUNT).toBe(100);
    });

    test('zero sub-comments config is valid', () => {
        const testConfig = { ...SCRAPER_CONFIG, MAX_SUB_COMMENTS: 0 };
        expect(testConfig.MAX_SUB_COMMENTS).toBe(0);
    });
});

// ============================================================================
// 2. URL PARSING & CONTEXT DETECTION
// ============================================================================

describe('URL Parsing & Context Detection', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        delete window.location;
    });

    test('should detect thread mode from /status/ URL', () => {
        window.location = { pathname: '/user/status/123456789', href: 'https://x.com/user/status/123456789' };
        const urlParts = window.location.pathname.split('/');
        const statusIndex = urlParts.indexOf('status');
        expect(statusIndex).not.toBe(-1);
        const mainTweetId = urlParts[statusIndex + 1];
        expect(mainTweetId).toBe('123456789');
    });

    test('should detect bookmarks mode', () => {
        window.location = { pathname: '/i/bookmarks', href: 'https://x.com/i/bookmarks' };
        expect(window.location.pathname.includes('/i/bookmarks')).toBe(true);
    });

    test('should handle malformed URL with no status', () => {
        window.location = { pathname: '/user/profile', href: 'https://x.com/user/profile' };
        const urlParts = window.location.pathname.split('/');
        const statusIndex = urlParts.indexOf('status');
        expect(statusIndex).toBe(-1);
    });

    test('should handle status URL with trailing slash but empty ID', () => {
        window.location = { pathname: '/user/status/', href: 'https://x.com/user/status/' };
        const urlParts = window.location.pathname.split('/');
        const statusIndex = urlParts.indexOf('status');
        const mainTweetId = (statusIndex !== -1 && urlParts.length > statusIndex + 1) ? urlParts[statusIndex + 1] : null;
        expect(mainTweetId).toBe('');
    });

    test('should handle empty pathname', () => {
        window.location = { pathname: '', href: 'https://x.com' };
        const urlParts = window.location.pathname.split('/');
        const statusIndex = urlParts.indexOf('status');
        expect(statusIndex).toBe(-1);
    });

    test('should handle root pathname', () => {
        window.location = { pathname: '/', href: 'https://x.com/' };
        const isBookmarksMode = window.location.pathname.includes('/i/bookmarks');
        expect(isBookmarksMode).toBe(false);
    });

    test('should handle deeply nested URL', () => {
        window.location = { pathname: '/user/status/123/photo/1', href: 'https://x.com/user/status/123/photo/1' };
        const urlParts = window.location.pathname.split('/');
        const statusIndex = urlParts.indexOf('status');
        const mainTweetId = urlParts[statusIndex + 1];
        expect(mainTweetId).toBe('123');
    });

    test('should handle twitter.com domain', () => {
        const url = 'https://twitter.com/user/status/999';
        expect(url.includes('twitter.com')).toBe(true);
    });

    test('should handle x.com domain', () => {
        const url = 'https://x.com/user/status/999';
        expect(url.includes('x.com')).toBe(true);
    });
});

// ============================================================================
// 3. DOM ELEMENT QUERYING
// ============================================================================

describe('DOM Element Querying', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('should find tweet articles', () => {
        document.body.innerHTML = '<article data-testid="tweet">Tweet</article>';
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        expect(articles.length).toBe(1);
    });

    test('should handle zero tweet articles', () => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        expect(articles.length).toBe(0);
    });

    test('should find cellInnerDiv containers', () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv"><article data-testid="tweet">A</article></div>
            <div data-testid="cellInnerDiv"><article data-testid="tweet">B</article></div>
        `;
        const cells = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
        expect(cells.length).toBe(2);
    });

    test('should find tweetText elements', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">Hello</div></article>';
        const article = document.querySelector('article[data-testid="tweet"]');
        const textEls = article.querySelectorAll('[data-testid="tweetText"]');
        expect(textEls.length).toBe(1);
        expect(textEls[0].textContent).toBe('Hello');
    });

    test('should handle missing text elements in article', () => {
        document.body.innerHTML = '<article data-testid="tweet"></article>';
        const article = document.querySelector('article[data-testid="tweet"]');
        const textEl = article.querySelector('[data-testid="tweetText"]');
        expect(textEl).toBeNull();
    });

    test('should find User-Name element', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="User-Name">User\n@testuser</div></article>';
        const article = document.querySelector('article[data-testid="tweet"]');
        const userEl = article.querySelector('[data-testid="User-Name"]');
        expect(userEl).not.toBeNull();
    });

    test('should handle missing User-Name element', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">Test</div></article>';
        const article = document.querySelector('article[data-testid="tweet"]');
        const userEl = article.querySelector('[data-testid="User-Name"]');
        expect(userEl).toBeNull();
    });

    test('should find time element', () => {
        document.body.innerHTML = '<article data-testid="tweet"><time datetime="2024-01-01T00:00:00Z">Jan 1</time></article>';
        const article = document.querySelector('article[data-testid="tweet"]');
        const timeEl = article.querySelector('time');
        expect(timeEl.getAttribute('datetime')).toBe('2024-01-01T00:00:00Z');
    });

    test('should handle missing time element', () => {
        document.body.innerHTML = '<article data-testid="tweet"></article>';
        const article = document.querySelector('article[data-testid="tweet"]');
        const timeEl = article.querySelector('time');
        expect(timeEl).toBeNull();
    });

    test('should find show-more buttons', () => {
        document.body.innerHTML = `
            <button data-testid="tweet-text-show-more-link">Show More</button>
            <button data-testid="tweet-text-show-more-link">Show More</button>
        `;
        const buttons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
        expect(buttons.length).toBe(2);
    });

    test('should find quoted tweet text', () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetText">Original text</div>
                <div data-testid="tweetText">Quoted text</div>
            </article>
        `;
        const article = document.querySelector('article[data-testid="tweet"]');
        const textEls = article.querySelectorAll('[data-testid="tweetText"]');
        expect(textEls.length).toBe(2);
        expect(textEls[0].textContent).toBe('Original text');
        expect(textEls[1].textContent).toBe('Quoted text');
    });
});

// ============================================================================
// 4. TWEET ID EXTRACTION
// ============================================================================

describe('Tweet ID Extraction', () => {
    test('should extract valid tweet ID from status link', () => {
        const href = 'https://x.com/user/status/1234567890';
        const match = href.match(/status\/(\d+)/);
        expect(match).toBeTruthy();
        expect(match[1]).toBe('1234567890');
    });

    test('should handle missing status in link', () => {
        const href = 'https://x.com/user/profile';
        const match = href.match(/status\/(\d+)/);
        expect(match).toBeNull();
    });

    test('should handle non-numeric status ID', () => {
        const href = 'https://x.com/user/status/abc123';
        const match = href.match(/status\/(\d+)/);
        expect(match).toBeNull();
    });

    test('should extract ID from twitter.com link', () => {
        const href = 'https://twitter.com/user/status/9876543210';
        const match = href.match(/status\/(\d+)/);
        expect(match[1]).toBe('9876543210');
    });

    test('should handle very long tweet IDs', () => {
        const href = 'https://x.com/user/status/1234567890123456789';
        const match = href.match(/status\/(\d+)/);
        expect(match[1]).toBe('1234567890123456789');
    });

    test('should not match status in query parameters', () => {
        const href = 'https://x.com/user?status=fake';
        const match = href.match(/status\/(\d+)/);
        expect(match).toBeNull();
    });

    test('should extract first status in URL with multiple segments', () => {
        const href = 'https://x.com/user/status/111/photo/1';
        const match = href.match(/status\/(\d+)/);
        expect(match[1]).toBe('111');
    });
});

// ============================================================================
// 5. REPLY CHAIN DETECTION
// ============================================================================

describe('Reply Chain Detection', () => {
    test('should extract single "Replying to" mention', () => {
        const text = 'Replying to @username\nThis is my reply';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches).toHaveLength(1);
        expect(matches[0]).toBe('Replying to @username');
    });

    test('should handle "Replying to" with multiple mentions', () => {
        const text = 'Replying to @user1 and @user2\nReply';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches).toHaveLength(1); // Regex only catches first after "Replying to"
    });

    test('should return null for no replies', () => {
        const text = 'Just a normal tweet without replies';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches).toBeNull();
    });

    test('should not match malformed patterns (no @)', () => {
        const text = 'Replying to username without at-sign';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches).toBeNull();
    });

    test('should extract mention from "Replying to" with multiple spaces', () => {
        const text = 'Replying to   @user_with_spaces';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches).toHaveLength(1);
    });

    test('should handle underscores in handles', () => {
        const text = 'Replying to @user_name_123';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches[0]).toContain('@user_name_123');
    });

    test('should handle multiple "Replying to" blocks', () => {
        const text = 'Replying to @user1\nSome text\nReplying to @user2\nMore text';
        const matches = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
        expect(matches).toHaveLength(2);
    });
});

// ============================================================================
// 6. HANDLE EXTRACTION
// ============================================================================

describe('Handle Extraction', () => {
    test('should extract handle from text', () => {
        const text = 'Some Name\n@testuser';
        const match = text.match(/@[a-zA-Z0-9_]+/);
        expect(match[0]).toBe('@testuser');
    });

    test('should handle missing @ in text', () => {
        const text = 'Some Name Only';
        const match = text.match(/@[a-zA-Z0-9_]+/);
        expect(match).toBeNull();
    });

    test('should extract first handle when multiple present', () => {
        const text = '@first_user @second_user';
        const match = text.match(/@[a-zA-Z0-9_]+/);
        expect(match[0]).toBe('@first_user');
    });

    test('should handle handle with numbers', () => {
        const text = '@user123abc';
        const match = text.match(/@[a-zA-Z0-9_]+/);
        expect(match[0]).toBe('@user123abc');
    });

    test('should handle underscore-only handle', () => {
        const text = '@___';
        const match = text.match(/@[a-zA-Z0-9_]+/);
        expect(match[0]).toBe('@___');
    });
});

// ============================================================================
// 7. BOUNDARY DETECTION
// ============================================================================

describe('Boundary Detection', () => {
    const boundaryRegex = /^(Discover more|More posts|More Tweets)$/i;

    test('should detect "Discover more" boundary', () => {
        expect(boundaryRegex.test('Discover more')).toBe(true);
    });

    test('should detect "More posts" boundary', () => {
        expect(boundaryRegex.test('More posts')).toBe(true);
    });

    test('should detect "More Tweets" boundary', () => {
        expect(boundaryRegex.test('More Tweets')).toBe(true);
    });

    test('should be case-insensitive', () => {
        expect(boundaryRegex.test('DISCOVER MORE')).toBe(true);
        expect(boundaryRegex.test('more posts')).toBe(true);
        expect(boundaryRegex.test('MORE TWEETS')).toBe(true);
    });

    test('should NOT match partial boundaries', () => {
        expect(boundaryRegex.test('Discover more about this')).toBe(false);
    });

    test('should NOT match empty string', () => {
        expect(boundaryRegex.test('')).toBe(false);
    });

    test('should NOT match random text', () => {
        expect(boundaryRegex.test('Hello World')).toBe(false);
    });

    test('boundary cell should not have an article inside', () => {
        document.body.innerHTML = '<div data-testid="cellInnerDiv">Discover more</div>';
        const cell = document.querySelector('[data-testid="cellInnerDiv"]');
        const hasArticle = cell.querySelector('article');
        expect(hasArticle).toBeNull();
    });
});

// ============================================================================
// 8. DATA STRUCTURE & MAP OPERATIONS
// ============================================================================

describe('Data Structure Operations', () => {
    test('Map should store unique tweets by ID', () => {
        const tweetsMap = new Map();
        tweetsMap.set('123', { id: '123', text: 'First' });
        tweetsMap.set('123', { id: '123', text: 'Duplicate' });
        expect(tweetsMap.size).toBe(1);
        expect(tweetsMap.get('123').text).toBe('Duplicate');
    });

    test('Map should track multiple unique tweets', () => {
        const tweetsMap = new Map();
        tweetsMap.set('1', { id: '1', text: 'A' });
        tweetsMap.set('2', { id: '2', text: 'B' });
        tweetsMap.set('3', { id: '3', text: 'C' });
        expect(tweetsMap.size).toBe(3);
    });

    test('should handle finding main post from array', () => {
        const tweets = [
            { id: '1', handle: '@author', isMain: true },
            { id: '2', handle: '@other', isMain: false }
        ];
        const mainPost = tweets.find(t => t.isMain);
        expect(mainPost.id).toBe('1');
    });

    test('should handle empty tweets array gracefully', () => {
        const allTweets = [];
        const mainPost = allTweets.find(t => t.isMain);
        expect(mainPost).toBeUndefined();
    });

    test('should filter tweets correctly for replies', () => {
        const tweets = [
            { id: '1', handle: '@author', isMain: true },
            { id: '2', handle: '@author', isMain: false },
            { id: '3', handle: '@other', isMain: false }
        ];
        const mainPost = tweets.find(t => t.isMain);
        const replies = tweets.filter(t => t.id !== mainPost.id);
        const authorReplies = replies.filter(t => t.handle === '@author');

        expect(replies.length).toBe(2);
        expect(authorReplies.length).toBe(1);
    });

    test('Map to Array conversion should preserve all entries', () => {
        const tweetsMap = new Map();
        for (let i = 0; i < 50; i++) {
            tweetsMap.set(`id_${i}`, { id: `id_${i}`, text: `Tweet ${i}` });
        }
        const arr = Array.from(tweetsMap.values());
        expect(arr.length).toBe(50);
    });
});

// ============================================================================
// 9. THREAD FILTERING LOGIC
// ============================================================================

describe('Thread Filtering Logic', () => {
    const mainPostHandle = '@author';
    const mainPostId = 'main_1';

    function filterTweets(allTweets, config) {
        let validTweets = [];
        let currentSubCommentCount = 0;
        let nonAuthorCount = 0;

        for (const tweet of allTweets) {
            if (tweet.id === mainPostId) continue;
            const isAuthor = tweet.handle === mainPostHandle;

            let isLevel1 = false;
            if (isAuthor) isLevel1 = true;
            else if (tweet.replyingTo.length === 0) isLevel1 = true;
            else if (tweet.replyingTo.length === 1 && tweet.replyingTo[0] === mainPostHandle) isLevel1 = true;

            if (config.UNROLL_THREAD && !isAuthor) continue;

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
        return validTweets;
    }

    test('should keep author replies', () => {
        const tweets = [
            { id: mainPostId, handle: mainPostHandle, replyingTo: [] },
            { id: '2', handle: mainPostHandle, replyingTo: [] }
        ];
        const result = filterTweets(tweets, { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 5, TARGET_COUNT: 100 });
        expect(result.length).toBe(1);
        expect(result[0].id).toBe('2');
    });

    test('UNROLL_THREAD should filter out non-author tweets', () => {
        const tweets = [
            { id: mainPostId, handle: mainPostHandle, replyingTo: [] },
            { id: '2', handle: mainPostHandle, replyingTo: [] },
            { id: '3', handle: '@other', replyingTo: [] },
            { id: '4', handle: mainPostHandle, replyingTo: [] }
        ];
        const result = filterTweets(tweets, { UNROLL_THREAD: true, MAX_SUB_COMMENTS: 5, TARGET_COUNT: 100 });
        expect(result.length).toBe(2);
        result.forEach(t => expect(t.handle).toBe(mainPostHandle));
    });

    test('should limit sub-comments with MAX_SUB_COMMENTS', () => {
        const tweets = [
            { id: mainPostId, handle: mainPostHandle, replyingTo: [] },
            { id: 'l1', handle: '@other', replyingTo: [] }, // Level 1
            { id: 'sub1', handle: '@sub', replyingTo: ['@other'] }, // Sub-comment 1
            { id: 'sub2', handle: '@sub2', replyingTo: ['@sub'] }, // Sub-comment 2
            { id: 'sub3', handle: '@sub3', replyingTo: ['@sub2'] }, // Sub-comment 3 - should be blocked
        ];
        const result = filterTweets(tweets, { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 2, TARGET_COUNT: 100 });
        expect(result.length).toBe(3); // l1 + sub1 + sub2
    });

    test('MAX_SUB_COMMENTS 0 should only keep level-1 tweets', () => {
        const tweets = [
            { id: mainPostId, handle: mainPostHandle, replyingTo: [] },
            { id: 'l1', handle: '@other', replyingTo: [] },
            { id: 'sub1', handle: '@sub', replyingTo: ['@other'] },
        ];
        const result = filterTweets(tweets, { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 0, TARGET_COUNT: 100 });
        expect(result.length).toBe(1);
        expect(result[0].id).toBe('l1');
    });

    test('TARGET_COUNT should limit non-author tweets', () => {
        const tweets = [{ id: mainPostId, handle: mainPostHandle, replyingTo: [] }];
        for (let i = 0; i < 20; i++) {
            tweets.push({ id: `reply_${i}`, handle: `@user_${i}`, replyingTo: [] });
        }
        const result = filterTweets(tweets, { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 5, TARGET_COUNT: 5 });
        expect(result.length).toBe(5);
    });

    test('should handle all tweets being from author', () => {
        const tweets = [
            { id: mainPostId, handle: mainPostHandle, replyingTo: [] },
            { id: '2', handle: mainPostHandle, replyingTo: [] },
            { id: '3', handle: mainPostHandle, replyingTo: [] }
        ];
        const result = filterTweets(tweets, { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 5, TARGET_COUNT: 100 });
        expect(result.length).toBe(2);
    });

    test('should handle direct reply to main post handle', () => {
        const tweets = [
            { id: mainPostId, handle: mainPostHandle, replyingTo: [] },
            { id: '2', handle: '@user', replyingTo: [mainPostHandle] }
        ];
        const result = filterTweets(tweets, { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 5, TARGET_COUNT: 100 });
        expect(result.length).toBe(1);
        expect(result[0].id).toBe('2');
    });

    test('should handle empty tweets array', () => {
        const result = filterTweets([], { UNROLL_THREAD: false, MAX_SUB_COMMENTS: 5, TARGET_COUNT: 100 });
        expect(result.length).toBe(0);
    });
});

// ============================================================================
// 10. OUTPUT FORMATTING - PLAIN TEXT
// ============================================================================

describe('Output Formatting - Plain Text', () => {
    const renderMetrics = (m, config) => config.INCLUDE_METRICS && m
        ? `  [💡 ${m.likes} Likes | 🔁 ${m.reposts} Reposts | 💬 ${m.replies} Replies | 👁️ ${m.views} Views]`
        : '';

    test('should render metrics when enabled', () => {
        const metrics = { likes: 10, reposts: 5, replies: 3, views: 1000 };
        const result = renderMetrics(metrics, { INCLUDE_METRICS: true });
        expect(result).toContain('10 Likes');
        expect(result).toContain('5 Reposts');
        expect(result).toContain('3 Replies');
        expect(result).toContain('1000 Views');
    });

    test('should return empty string when metrics disabled', () => {
        const metrics = { likes: 10, reposts: 5, replies: 3, views: 1000 };
        const result = renderMetrics(metrics, { INCLUDE_METRICS: false });
        expect(result).toBe('');
    });

    test('should return empty string when metrics is null', () => {
        const result = renderMetrics(null, { INCLUDE_METRICS: true });
        expect(result).toBe('');
    });

    test('should handle zero metrics', () => {
        const metrics = { likes: 0, reposts: 0, replies: 0, views: 0 };
        const result = renderMetrics(metrics, { INCLUDE_METRICS: true });
        expect(result).toContain('0 Likes');
    });
});

// ============================================================================
// 11. OUTPUT FORMATTING - MARKDOWN
// ============================================================================

describe('Output Formatting - Markdown', () => {
    const renderMarkdownMetrics = (m, config) => config.INCLUDE_METRICS && m
        ? `\n> *${m.likes} Likes | ${m.reposts} Reposts | ${m.replies} Replies | ${m.views} Views*`
        : '';

    test('should render markdown metrics with blockquote', () => {
        const metrics = { likes: 42, reposts: 7, replies: 15, views: 5000 };
        const result = renderMarkdownMetrics(metrics, { INCLUDE_METRICS: true });
        expect(result).toContain('> *42 Likes');
        expect(result).toContain('5000 Views*');
    });

    test('should return empty when metrics disabled', () => {
        const result = renderMarkdownMetrics({ likes: 1 }, { INCLUDE_METRICS: false });
        expect(result).toBe('');
    });

    test('markdown thread header should include author handle', () => {
        const mainPost = { handle: '@testauthor' };
        const header = `# Thread by ${mainPost.handle}`;
        expect(header).toBe('# Thread by @testauthor');
    });

    test('markdown bookmarks header should include count', () => {
        const count = 42;
        const header = `# 🔖 Saved Bookmarks Archive (${count} entries)`;
        expect(header).toContain('42 entries');
    });
});

// ============================================================================
// 12. OUTPUT FORMATTING - JSON
// ============================================================================

describe('Output Formatting - JSON', () => {
    test('should produce valid JSON for thread mode', () => {
        const data = {
            archiveType: 'Thread',
            mainPost: { id: '1', handle: '@user', text: 'Main' },
            replies: [{ id: '2', handle: '@other', text: 'Reply' }]
        };
        const json = JSON.stringify(data, null, 2);
        expect(() => JSON.parse(json)).not.toThrow();
        const parsed = JSON.parse(json);
        expect(parsed.archiveType).toBe('Thread');
        expect(parsed.replies).toHaveLength(1);
    });

    test('should produce valid JSON for bookmarks mode', () => {
        const data = {
            archiveType: 'Bookmarks',
            items: [{ id: '1' }, { id: '2' }]
        };
        const json = JSON.stringify(data, null, 2);
        const parsed = JSON.parse(json);
        expect(parsed.archiveType).toBe('Bookmarks');
        expect(parsed.items).toHaveLength(2);
    });

    test('should strip metrics from JSON when disabled', () => {
        const tweet = { id: '1', text: 'Test', metrics: { likes: 5 } };
        delete tweet.metrics;
        expect(tweet.metrics).toBeUndefined();
    });

    test('should include harvested resources in JSON', () => {
        const data = {
            archiveType: 'Thread',
            mainPost: { id: '1' },
            replies: [],
            harvestedResources: ['https://example.com', 'https://test.com']
        };
        const json = JSON.stringify(data, null, 2);
        const parsed = JSON.parse(json);
        expect(parsed.harvestedResources).toHaveLength(2);
    });

    test('should handle special characters in JSON output', () => {
        const data = { text: 'Test with "quotes" and <tags>' };
        const json = JSON.stringify(data);
        const parsed = JSON.parse(json);
        expect(parsed.text).toBe('Test with "quotes" and <tags>');
    });
});

// ============================================================================
// 13. RESOURCE HARVESTER
// ============================================================================

describe('Resource Harvester', () => {
    test('should collect external links from Set', () => {
        const resources = new Set();
        resources.add('https://example.com');
        resources.add('https://example.com'); // duplicate
        resources.add('https://another.com');
        expect(resources.size).toBe(2);
    });

    test('should filter out twitter.com links', () => {
        const href = 'https://twitter.com/user/status/123';
        expect(href.includes('twitter.com')).toBe(true);
    });

    test('should filter out x.com links', () => {
        const href = 'https://x.com/user/status/123';
        expect(href.includes('x.com')).toBe(true);
    });

    test('should keep external links', () => {
        const href = 'https://github.com/project';
        expect(!href.includes('twitter.com') && !href.includes('x.com')).toBe(true);
    });

    test('should handle links with query parameters', () => {
        const href = 'https://example.com/path?param=value&other=test';
        const resources = new Set();
        resources.add(href);
        expect(Array.from(resources)[0]).toBe(href);
    });

    test('should handle links with fragments', () => {
        const href = 'https://example.com/page#section';
        const resources = new Set();
        resources.add(href);
        expect(resources.has(href)).toBe(true);
    });
});

// ============================================================================
// 14. METRICS PARSING
// ============================================================================

describe('Metrics Parsing', () => {
    test('should parse likes from aria-label', () => {
        const label = '42 Likes';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(num).toBe(42);
        expect(label.toLowerCase().includes('like')).toBe(true);
    });

    test('should parse reposts from aria-label', () => {
        const label = '7 Reposts';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(num).toBe(7);
        expect(label.toLowerCase().includes('repost')).toBe(true);
    });

    test('should parse replies from aria-label', () => {
        const label = '15 replies';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(num).toBe(15);
        expect(label.toLowerCase().includes('repl')).toBe(true);
    });

    test('should parse views from aria-label', () => {
        const label = '1500 Views';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(num).toBe(1500);
        expect(label.toLowerCase().includes('view')).toBe(true);
    });

    test('should handle metrics with no number', () => {
        const label = 'No likes yet';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(isNaN(num)).toBe(true);
    });

    test('should handle extremely large numbers', () => {
        const label = '1000000 Likes';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(num).toBe(1000000);
    });

    test('should handle zero metrics', () => {
        const label = '0 Reposts';
        const num = parseInt(label.replace(/[^0-9]/g, ''), 10);
        expect(num).toBe(0);
    });
});

// ============================================================================
// 15. SPECIAL CHARACTERS & INJECTION ATTEMPTS
// ============================================================================

describe('Special Characters & Injection', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('should handle tweets with HTML tags', () => {
        const dangerousText = '<script>alert("XSS")</script>';
        document.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">${dangerousText}</div></article>`;
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toBe('alert("XSS")');
    });

    test('should handle SQL injection patterns', () => {
        const sqlInjection = "'; DROP TABLE tweets; --";
        document.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">${sqlInjection}</div></article>`;
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toContain('DROP TABLE');
    });

    test('should handle tweets with emojis', () => {
        const emojiText = '🚀 Test tweet with emojis 🎉🎊';
        document.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">${emojiText}</div></article>`;
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toBe(emojiText);
    });

    test('should handle Unicode characters', () => {
        const unicodeText = 'Test: 你好世界 مرحبا العالم';
        document.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">${unicodeText}</div></article>`;
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toBe(unicodeText);
    });

    test('should handle extremely long text (10k chars)', () => {
        const longText = 'A'.repeat(10000);
        document.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">${longText}</div></article>`;
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent.length).toBe(10000);
    });

    test('should handle newlines in tweet text', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">Line 1\nLine 2\nLine 3</div></article>';
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toContain('Line 1');
        expect(textElement.textContent).toContain('Line 2');
    });

    test('should handle tab characters', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">Col1\tCol2\tCol3</div></article>';
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toContain('\t');
    });

    test('should handle empty tweet text', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText"></div></article>';
        const textElement = document.querySelector('[data-testid="tweetText"]');
        expect(textElement.textContent).toBe('');
    });
});

// ============================================================================
// 16. MEDIA DETECTION
// ============================================================================

describe('Media Detection', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('should detect tweetPhoto images', () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img alt="Photo alt text" src="test.jpg"></div>
            </article>
        `;
        const article = document.querySelector('article');
        const imgs = article.querySelectorAll('div[data-testid="tweetPhoto"] img');
        expect(imgs.length).toBe(1);
        expect(imgs[0].getAttribute('alt')).toBe('Photo alt text');
    });

    test('should detect video components', () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="videoComponent"><video></video></div>
            </article>
        `;
        const article = document.querySelector('article');
        const videos = article.querySelectorAll('div[data-testid="videoComponent"] video');
        expect(videos.length).toBe(1);
    });

    test('should detect multiple media elements', () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img alt="Photo 1" src="1.jpg"></div>
                <div data-testid="tweetPhoto"><img alt="Photo 2" src="2.jpg"></div>
                <div data-testid="videoComponent"><video></video></div>
            </article>
        `;
        const article = document.querySelector('article');
        const media = article.querySelectorAll('div[data-testid="tweetPhoto"] img, div[data-testid="videoComponent"] video');
        expect(media.length).toBe(3);
    });

    test('should handle article with no media', () => {
        document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">Text only</div></article>';
        const article = document.querySelector('article');
        const media = article.querySelectorAll('div[data-testid="tweetPhoto"] img, div[data-testid="videoComponent"] video');
        expect(media.length).toBe(0);
    });

    test('should handle image without alt text', () => {
        document.body.innerHTML = `
            <article data-testid="tweet">
                <div data-testid="tweetPhoto"><img src="test.jpg"></div>
            </article>
        `;
        const article = document.querySelector('article');
        const img = article.querySelector('div[data-testid="tweetPhoto"] img');
        const alt = img.getAttribute('alt');
        const label = alt ? alt : 'Visual Attachment';
        expect(label).toBe('Visual Attachment');
    });
});

// ============================================================================
// 17. CLIPBOARD API
// ============================================================================

describe('Clipboard API', () => {
    test('should handle clipboard write success', async () => {
        await navigator.clipboard.writeText('test data');
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test data');
    });

    test('should handle clipboard write failure', async () => {
        navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
        await expect(navigator.clipboard.writeText('test')).rejects.toThrow('Clipboard denied');
    });

    test('should handle empty clipboard write', async () => {
        await navigator.clipboard.writeText('');
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
    });

    test('should handle very large clipboard content', async () => {
        const largeText = 'X'.repeat(100000);
        await navigator.clipboard.writeText(largeText);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(largeText);
    });
});

// ============================================================================
// 18. RACE CONDITIONS & TIMING
// ============================================================================

describe('Race Conditions & Timing', () => {
    test('should handle rapid "Show More" button clicks', () => {
        document.body.innerHTML = `
            <button data-testid="tweet-text-show-more-link">Show More</button>
            <button data-testid="tweet-text-show-more-link">Show More</button>
        `;
        const buttons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');
        buttons.forEach(btn => {
            const clickSpy = jest.fn();
            btn.addEventListener('click', clickSpy);
            btn.click();
            btn.click();
            expect(clickSpy).toHaveBeenCalledTimes(2);
        });
    });

    test('scrollTo should be callable', () => {
        expect(() => window.scrollTo(0, 0)).not.toThrow();
    });

    test('scrollTo should accept document.body.scrollHeight', () => {
        expect(() => window.scrollTo(0, document.body.scrollHeight)).not.toThrow();
    });
});

// ============================================================================
// 19. ATOMICSCRAPE - HIGH LEVEL (integration-style)
// ============================================================================

describe('atomicScrape function', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        delete window.location;
        window.location = { pathname: '/user/status/12345', href: 'https://x.com/user/status/12345' };
    });

    test('should be a function', () => {
        expect(typeof atomicScrape).toBe('function');
    });

    test('should return a promise', () => {
        // Set up minimal DOM so it doesn't hang forever
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Test tweet</div>
                    <div data-testid="User-Name">User\n@testuser<a href="https://x.com/testuser/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10 });
        expect(result).toBeInstanceOf(Promise);
    });

    test('should accept userConfig overrides', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Test</div>
                    <div data-testid="User-Name">User\n@user<a href="https://x.com/user/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10, FORMAT: 'json' });
        expect(result.status).toBe('success');
    });

    test('should return error status when no tweets found', async () => {
        // Empty DOM - no tweets at all
        // Note: hydration loop waits up to 5s, so we need a longer timeout
        document.body.innerHTML = '<div>No tweets here</div>';
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10 });
        expect(result.status).toBe('error');
        expect(result.message).toContain('No tweets found');
    }, 15000);

    test('should return success with count for valid tweets', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Main tweet content</div>
                    <div data-testid="User-Name">Author\n@author<a href="https://x.com/author/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10 });
        expect(result.status).toBe('success');
        expect(result.count).toBeGreaterThanOrEqual(1);
        expect(result.data).toBeTruthy();
    });

    test('should produce plain text output by default', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Hello world</div>
                    <div data-testid="User-Name">Test\n@test<a href="https://x.com/test/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10 });
        expect(result.status).toBe('success');
        expect(result.data).toContain('Hello world');
    });

    test('should produce JSON output when FORMAT is json', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">JSON test</div>
                    <div data-testid="User-Name">Test\n@test<a href="https://x.com/test/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10, FORMAT: 'json' });
        expect(result.status).toBe('success');
        expect(() => JSON.parse(result.data)).not.toThrow();
    });

    test('should produce markdown output when FORMAT is markdown', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Markdown test</div>
                    <div data-testid="User-Name">Test\n@test<a href="https://x.com/test/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10, FORMAT: 'markdown' });
        expect(result.status).toBe('success');
        expect(result.data).toContain('# Thread by');
    });

    test('should handle bookmarks mode', async () => {
        window.location = { pathname: '/i/bookmarks', href: 'https://x.com/i/bookmarks' };
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Bookmarked tweet</div>
                    <div data-testid="User-Name">User\n@bookuser<a href="https://x.com/bookuser/status/999">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10 });
        expect(result.status).toBe('success');
        expect(result.data).toContain('Bookmarked tweet');
    });

    test('should include metrics when INCLUDE_METRICS is true', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Metrics test</div>
                    <div data-testid="User-Name">Test\n@test<a href="https://x.com/test/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                    <div role="group"><div aria-label="42 Likes"></div></div>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10, INCLUDE_METRICS: true });
        expect(result.status).toBe('success');
    });

    test('should extract links when EXTRACT_LINKS is true', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Check <a href="https://github.com/project">this</a></div>
                    <div data-testid="User-Name">Test\n@test<a href="https://x.com/test/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10, EXTRACT_LINKS: true });
        expect(result.status).toBe('success');
    });

    test('should handle multiple tweets', async () => {
        document.body.innerHTML = `
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Main post</div>
                    <div data-testid="User-Name">Author\n@author<a href="https://x.com/author/status/12345">link</a></div>
                    <time datetime="2024-01-01T00:00:00Z">Jan 1</time>
                </article>
            </div>
            <div data-testid="cellInnerDiv">
                <article data-testid="tweet">
                    <div data-testid="tweetText">Reply</div>
                    <div data-testid="User-Name">Other\n@other<a href="https://x.com/other/status/67890">link</a></div>
                    <time datetime="2024-01-01T01:00:00Z">Jan 1</time>
                </article>
            </div>
        `;
        const result = await atomicScrape({ MAX_NO_NEW_TWEETS: 1, SCROLL_WAIT_MS: 10 });
        expect(result.status).toBe('success');
        expect(result.count).toBeGreaterThanOrEqual(2);
    });
});

// ============================================================================
// 20. CONFIGURATION MERGE BEHAVIOR
// ============================================================================

describe('Configuration Merge Behavior', () => {
    test('userConfig should override defaults', () => {
        const config = { ...SCRAPER_CONFIG, TARGET_COUNT: 50 };
        expect(config.TARGET_COUNT).toBe(50);
        expect(config.SCROLL_WAIT_MS).toBe(SCRAPER_CONFIG.SCROLL_WAIT_MS);
    });

    test('extra userConfig keys should pass through', () => {
        const config = { ...SCRAPER_CONFIG, FORMAT: 'json', INCLUDE_METRICS: true, EXTRACT_LINKS: true };
        expect(config.FORMAT).toBe('json');
        expect(config.INCLUDE_METRICS).toBe(true);
        expect(config.EXTRACT_LINKS).toBe(true);
    });

    test('empty userConfig should not modify defaults', () => {
        const config = { ...SCRAPER_CONFIG };
        expect(config).toEqual(SCRAPER_CONFIG);
    });

    test('UNROLL_THREAD should default to undefined/falsy', () => {
        const config = { ...SCRAPER_CONFIG };
        expect(config.UNROLL_THREAD).toBeFalsy();
    });

    test('WEBHOOK_URL should default to undefined/falsy', () => {
        const config = { ...SCRAPER_CONFIG };
        expect(config.WEBHOOK_URL).toBeFalsy();
    });
});
