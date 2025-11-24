document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const statusBox = document.getElementById('status');
    const statusText = document.getElementById('statusText');

    scrapeBtn.addEventListener('click', async () => {
        // Reset status
        updateStatus('Starting...', 'normal');
        scrapeBtn.disabled = true;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url.includes('x.com') && !tab.url.includes('twitter.com')) {
                updateStatus('Error: Not on X/Twitter', 'error');
                scrapeBtn.disabled = false;
                return;
            }

            // Inject content script if not already there (though manifest should handle it, 
            // explicit injection ensures it's ready or we can just send message if it's already there)
            // For V3 with activeTab, we might need to script injection if not in manifest content_scripts
            // But we defined permissions. Let's try sending a message first.
            // Actually, we didn't define content_scripts in manifest, so we MUST inject or use scripting.executeScript.
            // The plan said "Injects scripts/content.js".
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['scripts/content.js']
            });

            // Send message to start scraping
            // We need a small delay to ensure script is loaded? executeScript awaits result so it should be fine.
            // However, if the script is just a one-off runner, it runs immediately. 
            // Let's design content.js to listen for a message OR just run main() when injected.
            // Better to listen for a message to allow re-triggering without re-injecting variables if we keep state.
            // But for now, let's just send a message.
            
            chrome.tabs.sendMessage(tab.id, { action: 'start_scrape' }, (response) => {
                if (chrome.runtime.lastError) {
                    // If message fails, maybe script wasn't ready or something else.
                    // But executeScript should have finished. 
                    // If content.js adds a listener, it should be there.
                    console.error(chrome.runtime.lastError);
                    updateStatus('Error: Could not connect to page', 'error');
                    scrapeBtn.disabled = false;
                }
            });

        } catch (err) {
            console.error(err);
            updateStatus(`Error: ${err.message}`, 'error');
            scrapeBtn.disabled = false;
        }
    });

    // Listen for status updates from content script
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
        statusBox.className = 'status-box'; // reset classes
        if (type === 'error') statusBox.classList.add('status-error');
        if (type === 'success') statusBox.classList.add('status-success');
    }
});
