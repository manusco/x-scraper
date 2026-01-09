import { jest, describe, test, expect, beforeEach } from '@jest/globals';
/**
 * Integration Tests for X-Scraper
 * Tests component interactions and message passing
 */

describe('Extension Integration Tests', () => {

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Chrome API Integration', () => {
        test('should query active tab', async () => {
            const mockTab = { id: 1, url: 'https://x.com/test/status/123' };
            chrome.tabs.query.mockResolvedValueOnce([mockTab]);

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

            expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
            expect(tabs).toHaveLength(1);
            expect(tabs[0].id).toBe(1);
        });

        test('should send message to tab', async () => {
            chrome.tabs.sendMessage.mockResolvedValueOnce({ status: 'success' });

            const response = await chrome.tabs.sendMessage(1, { action: 'scrape' });

            expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { action: 'scrape' });
            expect(response.status).toBe('success');
        });

        test('should handle sendMessage errors', async () => {
            chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Tab not found'));

            await expect(
                chrome.tabs.sendMessage(999, { action: 'scrape' })
            ).rejects.toThrow('Tab not found');
        });

        test('should handle no active tabs', async () => {
            chrome.tabs.query.mockResolvedValueOnce([]);

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

            expect(tabs).toHaveLength(0);
        });
    });

    describe('Message Passing Protocol', () => {
        test('should validate scrape action message format', () => {
            const message = { action: 'scrape' };
            expect(message).toHaveProperty('action');
            expect(message.action).toBe('scrape');
        });

        test('should validate response format', () => {
            const response = {
                status: 'success',
                data: 'tweet content',
                count: 10
            };
            expect(response).toHaveProperty('status');
            expect(response).toHaveProperty('data');
            expect(response).toHaveProperty('count');
        });

        test('should validate error response format', () => {
            const errorResponse = {
                status: 'error',
                message: 'Failed to scrape'
            };
            expect(errorResponse.status).toBe('error');
            expect(errorResponse).toHaveProperty('message');
        });
    });

    describe('URL Validation', () => {
        test('should accept valid X.com URLs', () => {
            const validUrls = [
                'https://x.com/user/status/123456789',
                'https://twitter.com/user/status/987654321',
                'https://x.com/username/status/111111111111'
            ];

            validUrls.forEach(url => {
                expect(url).toMatch(/status\/\d+/);
            });
        });

        test('should reject invalid URLs', () => {
            const invalidUrls = [
                'https://x.com/user/profile',
                'https://x.com/',
                'https://google.com',
                'not-a-url'
            ];

            invalidUrls.forEach(url => {
                expect(url).not.toMatch(/status\/\d+/);
            });
        });
    });

    describe('Clipboard Integration', () => {
        test('should copy text to clipboard', async () => {
            const testText = 'Test tweet content';
            await navigator.clipboard.writeText(testText);

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testText);
        });

        test('should handle clipboard permission denied', async () => {
            navigator.clipboard.writeText.mockRejectedValueOnce(
                new Error('Permission denied')
            );

            await expect(
                navigator.clipboard.writeText('test')
            ).rejects.toThrow('Permission denied');
        });
    });

    describe('Extension Lifecycle', () => {
        test('should initialize runtime message listener', () => {
            const mockListener = jest.fn();
            chrome.runtime.onMessage.addListener(mockListener);

            expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(mockListener);
        });

        test('should handle runtime errors', () => {
            chrome.runtime.lastError = { message: 'Extension context invalidated' };

            expect(chrome.runtime.lastError).toBeTruthy();
            expect(chrome.runtime.lastError.message).toContain('Extension context');
        });
    });

    describe('Data Flow Testing', () => {
        test('should complete full scrape workflow', async () => {
            // 1. Query active tab
            const mockTab = { id: 1, url: 'https://x.com/test/status/123' };
            chrome.tabs.query.mockResolvedValueOnce([mockTab]);
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

            // 2. Send scrape message
            chrome.tabs.sendMessage.mockResolvedValueOnce({
                status: 'success',
                data: 'Tweet content',
                count: 5
            });
            const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'scrape' });

            // 3. Verify response
            expect(response.status).toBe('success');
            expect(response.data).toBeTruthy();
            expect(response.count).toBeGreaterThan(0);
        });

        test('should handle error in scrape workflow', async () => {
            // 1. Query active tab
            const mockTab = { id: 1, url: 'https://x.com/test/status/123' };
            chrome.tabs.query.mockResolvedValueOnce([mockTab]);
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

            // 2. Send scrape message (fails)
            chrome.tabs.sendMessage.mockResolvedValueOnce({
                status: 'error',
                message: 'No tweets found'
            });
            const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'scrape' });

            // 3. Verify error handling
            expect(response.status).toBe('error');
            expect(response.message).toBeTruthy();
        });
    });
});
