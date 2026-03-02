const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');
const scraperCode = fs.readFileSync(path.join(__dirname, 'shared/scraper.js'), 'utf8');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto('https://x.com/elonmusk/status/1700685609337065969', { waitUntil: 'networkidle2' });

    // Check DOM counts
    const counts = await page.evaluate(() => {
        return {
            cells: document.querySelectorAll('div[data-testid="cellInnerDiv"]').length,
            articles: document.querySelectorAll('article').length,
            bodyHtml: document.body.innerHTML.substring(0, 200)
        };
    });
    console.log('DOM Counts:', counts);

    await browser.close();
})();
