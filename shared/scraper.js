// shared/scraper.js
import { XScraper } from './engine/XScraper.js';
import { LinkedInScraper } from './engine/LinkedInScraper.js';
import { InstagramScraper } from './engine/InstagramScraper.js';

export const SCRAPER_CONFIG = {
    TARGET_COUNT: 1000,
    TARGET_BUFFER: 200,
    MAX_NO_NEW_TWEETS: 8,
    MAX_SUB_COMMENTS: 5,
    SCROLL_WAIT_MS: 1500,
    EXPAND_WAIT_MS: 500
};

export async function atomicScrape(userConfig = {}) {
    const config = { ...SCRAPER_CONFIG, ...userConfig };
    const hostname = window.location.hostname;

    let scraper;

    if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
        scraper = new XScraper(config);
    } else if (hostname.includes('linkedin.com')) {
        scraper = new LinkedInScraper(config);
    } else if (hostname.includes('instagram.com')) {
        scraper = new InstagramScraper(config);
    } else {
        return { status: 'error', message: `Platform not supported: ${hostname}` };
    }


    try {
        return await scraper.run();
    } catch (err) {
        console.error('[Scraper Factory] Critical error:', err);
        return { status: 'error', message: err.toString() };
    }
}
