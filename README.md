# X-Scraper

**Version**: 0.1.6  
**Type**: Browser Extension (Chromium-based browsers)

A lightweight browser extension for scraping X (Twitter) threads to clipboard with intelligent filtering.

---

## Features

- ✅ **Smart Thread Scraping**: Captures main post + top-level replies + up to 5 sub-comments per reply
- ✅ **Auto-Expand**: Automatically clicks "Show More" buttons
- ✅ **Clipboard Ready**: Formatted output copied directly to clipboard
- ✅ **Debug Logging**: Built-in logger for troubleshooting
- ✅ **Clean UI**: Modern X-themed interface

---

## Installation

### Chrome/Edge/Brave

1. Download or clone this repository
2. Open browser and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `X Scraper` directory
6. Extension icon should appear in toolbar

---

## Usage

1. Navigate to any X (Twitter) thread: `https://x.com/username/status/123456...`
2. Click the X-Scraper extension icon
3. Click "Scrape Thread" button
4. Wait for scraping to complete
5. Thread content is automatically copied to clipboard

### Output Format

```
[Main Post]
@username (2024-01-09T12:00:00.000Z):
Thread content here...

[Replies] (42)
1. @user1: Reply text...
2. @user2: Another reply...
...
```

---

## Configuration

The scraper behavior can be customized by editing `shared/scraper.js`:

```javascript
export const SCRAPER_CONFIG = {
    TARGET_COUNT: 100,        // Max replies to scrape
    TARGET_BUFFER: 50,        // Extra buffer for filtering
    MAX_NO_NEW_TWEETS: 3,     // Stop after N cycles with no new tweets
    MAX_SUB_COMMENTS: 5,      // Sub-comments per top-level reply
    SCROLL_WAIT_MS: 1500,     // Wait time after scrolling
    EXPAND_WAIT_MS: 500       // Wait time after expanding tweets
};
```

---

## Development

### Project Structure

```
X-Scraper/
├── manifest.json           # Extension manifest (Manifest V3)
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup logic
├── scripts/
│   └── content.js         # Content script (injected into X pages)
├── shared/
│   └── scraper.js         # Core scraping logic (DRY)
├── icons/
│   └── icon.svg           # Extension icon
└── .resonance/            # Resonance Framework (AI agent system)
```

### Architecture

- **popup.js**: Handles user interaction, injects scraper into active tab
- **content.js**: Listens for scrape messages, executes scraper
- **scraper.js**: Shared scraping logic (eliminates duplication)

### Code Quality

```bash
# Install dependencies (if using linting)
npm install -D eslint

# Run linter
npx eslint .
```

---

## Known Limitations

- **DOM Selector Fragility**: Relies on X's `data-testid` attributes which may change
- **Rate Limiting**: No built-in rate limiting; use responsibly
- **No Offline Support**: Requires active internet connection
- **No Media**: Only scrapes text content, not images/videos

---

## Troubleshooting

### Extension doesn't load
- Ensure you're using a Chromium-based browser (Chrome, Edge, Brave)
- Check `chrome://extensions/` for error messages
- Verify all files are present in the directory

### Scraping fails
1. Click "Show Logs" in the popup
2. Check console for errors
3. Verify you're on an X/Twitter thread URL
4. Try refreshing the page and scraping again

### Empty results
- Thread may be protected/private
- May need to scroll manually first to load some tweets
- Check if you're logged into X

---

## Changelog

### v0.1.6 (2026-01-09)
- ✅ Eliminated code duplication (148 lines)
- ✅ Extracted shared scraper module
- ✅ Added proper error logging
- ✅ Added ESLint configuration
- ✅ Fixed version inconsistency
- ✅ Added comprehensive README

### v0.1.5
- Added debug logging system
- Improved error handling

### v0.1.4
- Initial stable release
- Core scraping functionality

---

## License

MIT License - Feel free to modify and distribute

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Maintained with ❤️ using the [Resonance Framework](https://github.com/manusco/resonance)**
