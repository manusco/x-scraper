import { jest } from '@jest/globals';

// Jest setup file for browser extension testing
// Mock browser APIs that aren't available in jsdom

global.chrome = {
    tabs: {
        query: jest.fn(),
        sendMessage: jest.fn()
    },
    runtime: {
        lastError: null,
        sendMessage: jest.fn(),
        onMessage: {
            addListener: jest.fn()
        }
    }
};

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn(() => Promise.resolve())
    },
    writable: true
});

// Mock console methods to avoid noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};
