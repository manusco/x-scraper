document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const statusBox = document.getElementById('status');
    const statusText = document.getElementById('statusText');

    scrapeBtn.addEventListener('click', async () => {
        updateStatus('Starting...', 'normal');
        scrapeBtn.disabled = true;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) {
                updateStatus('Error: Not on X/Twitter', 'error');
                scrapeBtn.disabled = false;
                return;
            }

            // Ping strategy: Check if content script is already alive
            let isAlive = false;
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                if (response && response.status === 'pong') {
                    isAlive = true;
                }
            } catch (e) {
                // Script not there or not responding
                isAlive = false;
            }

            if (!isAlive) {
                // Inject script
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['scripts/content.js']
                });

                // Wait a tiny bit for script to initialize listener
                await new Promise(r => setTimeout(r, 100));
            }

            // Send start message
            chrome.tabs.sendMessage(tab.id, { action: 'start_scrape' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    updateStatus('Error: Could not connect to page. Try reloading the page.', 'error');
                    scrapeBtn.disabled = false;
                }
            });

        } catch (err) {
            console.error(err);
            updateStatus(`Error: ${err.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'status_update') {
            updateStatus(message.status, message.type);
        } else if (message.action === 'scrape_complete') {
            updateStatus('Success! Copied to clipboard.', 'success');
            scrapeBtn.disabled = false;
        } else if (message.action === 'scrape_error') {
            updateStatus(`Error: ${message.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    });

    function updateStatus(text, type = 'normal') {
        statusBox.classList.remove('hidden');
        statusText.textContent = text;
        statusBox.className = 'status-box';
        if (type === 'error') statusBox.classList.add('status-error');
        if (type === 'success') statusBox.classList.add('status-success');
    }
});
