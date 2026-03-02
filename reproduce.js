import { atomicScrape } from './shared/scraper.js';
import { JSDOM } from 'jsdom';

// 1. Mock the DOM
const dom = new JSDOM(`
    <!DOCTYPE html>
    <body>
        <div data-testid="cellInnerDiv">
            <article data-testid="tweet">
                <div data-testid="tweetText">Hello World</div>
                <div data-testid="User-Name"><a href="/user/status/12345">@testuser</a></div>
                <time datetime="2024-01-01T00:00:00.000Z"></time>
                <div role="group">
                    <div aria-label="10 replies"></div>
                    <div aria-label="5 reposts"></div>
                </div>
            </article>
        </div>
        <div data-testid="cellInnerDiv">
            <article data-testid="tweet">
                <div data-testid="tweetText">First Reply</div>
                <div data-testid="User-Name"><a href="/otheruser/status/67890">@otheruser</a></div>
                <time datetime="2024-01-01T01:00:00.000Z"></time>
            </article>
        </div>
    </body>
`, { url: 'https://x.com/testuser/status/12345' });

global.window = dom.window;
global.window.scrollTo = () => { };
global.document = dom.window.document;

// Polyfill innerText
Object.defineProperty(global.window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent; }
});

// Mock chrome.runtime
global.chrome = {
    runtime: {
        sendMessage: async () => { }
    }
};

(async () => {
    try {
        console.log('Running reproduce script...');
        const result = await atomicScrape({});
        console.log('Result:', result);
    } catch (e) {
        console.error('Script failed:', e);
    }
})();
