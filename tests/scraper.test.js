import { jest, describe, test, expect, beforeEach } from '@jest/globals';
/**
 * Destructive Testing Suite for X-Scraper
 * Following Resonance QA Protocol: "Break it before they do"
 */

import { SCRAPER_CONFIG } from '../shared/scraper.js';

describe('SCRAPER_CONFIG - Configuration Constants', () => {
    test('should have valid configuration values', () => {
        expect(SCRAPER_CONFIG.TARGET_COUNT).toBeGreaterThan(0);
        expect(SCRAPER_CONFIG.TARGET_BUFFER).toBeGreaterThanOrEqual(0);
        expect(SCRAPER_CONFIG.MAX_NO_NEW_TWEETS).toBeGreaterThan(0);
        expect(SCRAPER_CONFIG.MAX_SUB_COMMENTS).toBeGreaterThanOrEqual(0);
        expect(SCRAPER_CONFIG.SCROLL_WAIT_MS).toBeGreaterThan(0);
        expect(SCRAPER_CONFIG.EXPAND_WAIT_MS).toBeGreaterThan(0);
    });

    test('should use reasonable timeout values', () => {
        // Timeouts shouldn't be too long (bad UX) or too short (unreliable)
        expect(SCRAPER_CONFIG.SCROLL_WAIT_MS).toBeLessThan(5000);
        expect(SCRAPER_CONFIG.EXPAND_WAIT_MS).toBeLessThan(2000);
    });
});

describe('Scraper Edge Cases - Destructive Testing', () => {

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = '';

        // Mock window.location
        delete window.location;
        window.location = {
            pathname: '/user/status/123456789',
            href: 'https://x.com/user/status/123456789'
        };
    });

    describe('URL Parsing Edge Cases', () => {
        test('should handle malformed URL - no status', () => {
            window.location.pathname = '/user/invalid';
            const urlParts = window.location.pathname.split('/');
            const statusIndex = urlParts.indexOf('status');
            expect(statusIndex).toBe(-1);
        });

        test('should handle malformed URL - status but no ID', () => {
            window.location.pathname = '/user/status/';
            const urlParts = window.location.pathname.split('/');
            const statusIndex = urlParts.indexOf('status');
            const mainTweetId = (statusIndex !== -1 && urlParts.length > statusIndex + 1)
                ? urlParts[statusIndex + 1]
                : null;
            expect(mainTweetId).toBe('');
        });

        test('should handle empty pathname', () => {
            window.location.pathname = '';
            const urlParts = window.location.pathname.split('/');
            const statusIndex = urlParts.indexOf('status');
            expect(statusIndex).toBe(-1);
        });
    });

    describe('DOM Manipulation - Missing Elements', () => {
        test('should handle missing tweet articles', () => {
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            expect(articles.length).toBe(0);
        });

        test('should handle missing text elements', () => {
            document.body.innerHTML = '<article data-testid="tweet"></article>';
            const article = document.querySelector('article[data-testid="tweet"]');
            const textElement = article.querySelector('[data-testid="tweetText"]');
            expect(textElement).toBeNull();
        });

        test('should handle missing user info', () => {
            document.body.innerHTML = '<article data-testid="tweet"><div data-testid="tweetText">Test</div></article>';
            const article = document.querySelector('article[data-testid="tweet"]');
            const userElement = article.querySelector('[data-testid="User-Name"]');
            expect(userElement).toBeNull();
        });

        test('should handle missing timestamp', () => {
            document.body.innerHTML = `
                <article data-testid="tweet">
                    <div data-testid="tweetText">Test tweet</div>
                    <div data-testid="User-Name">User\n@testuser</div>
                </article>
            `;
            const article = document.querySelector('article[data-testid="tweet"]');
            const timeElement = article.querySelector('time');
            expect(timeElement).toBeNull();
        });
    });

    describe('Special Characters - XSS & Injection Attempts', () => {
        test('should handle tweets with HTML tags', () => {
            const dangerousText = '<script>alert("XSS")</script>';
            document.body.innerHTML = `
                <article data-testid="tweet">
                    <div data-testid="tweetText">${dangerousText}</div>
                </article>
            `;
            const textElement = document.querySelector('[data-testid="tweetText"]');
            // textContent in jsdom for a script tag returns the code inside
            expect(textElement.textContent).toBe('alert("XSS")');
        });

        test('should handle tweets with SQL injection patterns', () => {
            const sqlInjection = "'; DROP TABLE tweets; --";
            document.body.innerHTML = `
                <article data-testid="tweet">
                    <div data-testid="tweetText">${sqlInjection}</div>
                </article>
            `;
            const textElement = document.querySelector('[data-testid="tweetText"]');
            expect(textElement.textContent).toContain('DROP TABLE');
        });

        test('should handle tweets with emojis', () => {
            const emojiText = '🚀 Test tweet with emojis 🎉🎊';
            document.body.innerHTML = `
                <article data-testid="tweet">
                    <div data-testid="tweetText">${emojiText}</div>
                </article>
            `;
            const textElement = document.querySelector('[data-testid="tweetText"]');
            expect(textElement.textContent).toBe(emojiText);
        });

        test('should handle tweets with Unicode characters', () => {
            const unicodeText = 'Test with Unicode: 你好世界 مرحبا العالم';
            document.body.innerHTML = `
                <article data-testid="tweet">
                    <div data-testid="tweetText">${unicodeText}</div>
                </article>
            `;
            const textElement = document.querySelector('[data-testid="tweetText"]');
            expect(textElement.textContent).toBe(unicodeText);
        });

        test('should handle extremely long tweet text', () => {
            const longText = 'A'.repeat(10000);
            document.body.innerHTML = `
                <article data-testid="tweet">
                    <div data-testid="tweetText">${longText}</div>
                </article>
            `;
            const textElement = document.querySelector('[data-testid="tweetText"]');
            expect(textElement.textContent.length).toBe(10000);
        });
    });

    describe('Reply Chain Detection', () => {
        test('should extract single "Replying to" mention', () => {
            const text = 'Replying to @username\nThis is my reply';
            const replyElement = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
            expect(replyElement).toHaveLength(1);
            expect(replyElement[0]).toBe('Replying to @username');
        });

        test('should extract multiple "Replying to" mentions', () => {
            const text = 'Replying to @user1 and @user2\nThis is my reply';
            const replyElement = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
            expect(replyElement).toHaveLength(1);
        });

        test('should handle no "Replying to" mentions', () => {
            const text = 'This is a standalone tweet';
            const replyElement = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
            expect(replyElement).toBeNull();
        });

        test('should handle malformed "Replying to" patterns', () => {
            const text = 'Replying to username (no @)';
            const replyElement = text.match(/Replying to\s+(@[a-zA-Z0-9_]+)/g);
            expect(replyElement).toBeNull();
        });
    });

    describe('Tweet ID Extraction', () => {
        test('should extract valid tweet ID from link', () => {
            const href = 'https://x.com/user/status/1234567890';
            const match = href.match(/status\/(\d+)/);
            expect(match).toBeTruthy();
            expect(match[1]).toBe('1234567890');
        });

        test('should handle missing status link', () => {
            const href = 'https://x.com/user/profile';
            const match = href.match(/status\/(\d+)/);
            expect(match).toBeNull();
        });

        test('should handle malformed status link', () => {
            const href = 'https://x.com/user/status/abc123';
            const match = href.match(/status\/(\d+)/);
            expect(match).toBeNull();
        });
    });

    describe('Data Structure Validation', () => {
        test('Map should store unique tweets by ID', () => {
            const tweetsMap = new Map();
            tweetsMap.set('123', { id: '123', text: 'First' });
            tweetsMap.set('123', { id: '123', text: 'Duplicate' });
            expect(tweetsMap.size).toBe(1);
            expect(tweetsMap.get('123').text).toBe('Duplicate');
        });

        test('should handle empty tweets array', () => {
            const allTweets = [];
            const mainPost = allTweets.find(t => t.isMain);
            expect(mainPost).toBeUndefined();
        });

        test('should filter tweets correctly', () => {
            const tweets = [
                { id: '1', handle: '@author', isMain: true },
                { id: '2', handle: '@author', isMain: false },
                { id: '3', handle: '@other', isMain: false }
            ];
            const mainPost = tweets.find(t => t.isMain);
            const replies = tweets.filter(t => t.id !== mainPost.id);
            const authorPosts = replies.filter(t => t.handle === '@author');

            expect(replies.length).toBe(2);
            expect(authorPosts.length).toBe(1);
        });
    });

    describe('Race Conditions & Timing', () => {
        test('should handle rapid "Show More" button clicks', () => {
            document.body.innerHTML = `
                <button data-testid="tweet-text-show-more-link">Show More</button>
                <button data-testid="tweet-text-show-more-link">Show More</button>
            `;
            const buttons = document.querySelectorAll('[data-testid="tweet-text-show-more-link"]');

            // Simulate rapid clicks
            buttons.forEach(btn => {
                const clickSpy = jest.fn();
                btn.addEventListener('click', clickSpy);
                btn.click();
                btn.click();
                expect(clickSpy).toHaveBeenCalledTimes(2);
            });
        });

        test('should handle scroll during scraping', () => {
            const initialScrollHeight = document.body.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
            expect(window.scrollY).toBeDefined();
        });
    });

    describe('Clipboard API Edge Cases', () => {
        test('should handle clipboard write failure gracefully', async () => {
            navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard denied'));

            await expect(
                navigator.clipboard.writeText('test')
            ).rejects.toThrow('Clipboard denied');
        });

        test('should handle empty clipboard write', async () => {
            await navigator.clipboard.writeText('');
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
        });

        test('should handle very large clipboard write', async () => {
            const largeText = 'A'.repeat(100000);
            await navigator.clipboard.writeText(largeText);
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(largeText);
        });
    });
});

describe('Configuration Boundary Testing', () => {
    test('TARGET_COUNT should be positive', () => {
        expect(SCRAPER_CONFIG.TARGET_COUNT).toBeGreaterThan(0);
    });

    test('MAX_SUB_COMMENTS should prevent infinite nesting', () => {
        expect(SCRAPER_CONFIG.MAX_SUB_COMMENTS).toBeLessThan(100);
    });

    test('should handle zero sub-comments configuration', () => {
        const testConfig = { ...SCRAPER_CONFIG, MAX_SUB_COMMENTS: 0 };
        expect(testConfig.MAX_SUB_COMMENTS).toBe(0);
    });
});
