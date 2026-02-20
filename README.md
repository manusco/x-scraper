# X-Scraper

**Version**: 0.1.7  
**Type**: Browser Extension (Chrome & Firefox)

A lightweight browser extension for scraping X (Twitter) threads to your clipboard with intelligent filtering. Designed for simplicity: scrape, copy, paste.

---

## 🚀 Features

- ✅ **Intelligent Filtering**: Captures the main post + thread continuations + relevant replies.
- ✅ **Auto-Expand**: Automatically clicks "Show More" buttons during scraping.
- ✅ **Cross-Browser**: Native support for Chrome (Chromium) and Firefox.
- ✅ **Clipboard Ready**: Cleanly formatted output for easy pasting into documents or memory logs.
- ✅ **Privacy First**: No servers, no data collection. Everything stays in your browser.

---

## 🛠️ Installation

### Chrome / Edge / Brave
1. Download or clone this repository.
2. Go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the root directory of this project.

### Firefox
1. Download or clone this repository.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `manifest.firefox.json` from the root directory.

---

## 📖 Usage

1. **Navigate**: Go to any X thread (e.g., `https://x.com/username/status/...`).
2. **Open**: Click the X-Scraper icon in your toolbar.
3. **Scrape**: Click the "Scrape Thread" button.
4. **Done**: The thread is now in your clipboard. Paste it anywhere!

### Output Format
```text
[Main Post]
@username (timestamp):
Main content here...

[Replies] (42)
1. @user1: Direct reply...
2. @user2: Another reply...
...
```

---

## 📂 Project Structure

```text
X-Scraper/
├── manifest.json           # Chrome Manifest (V3)
├── manifest.firefox.json   # Firefox Manifest (V3)
├── popup/                  # Extension UI (HTML/CSS/JS)
├── scripts/                # Content script bridge
├── shared/                 # Core scraping engine (DRY)
├── icons/                  # Extension visual assets
├── tests/                  # Automated Jest suites
├── docs/                   # Architectural documentation
├── .agent/                 # Resonance AI Skillsets
└── .resonance/             # Persistent Project Memory
```

---

## 🛠️ Development

### Local Setup
```bash
npm install     # Install dev dependencies (ESLint, Jest)
npm test        # Run automated tests
npm run lint    # Run code quality checks
```

### Configuration
Customize scraping limits in `shared/scraper.js`:
- `TARGET_COUNT`: Max replies to capture.
- `MAX_SUB_COMMENTS`: Sub-replies per main reply.

---

## 📜 License
MIT License. Free to use, modify, and distribute.

---

**Maintained with ❤️ using [Resonance](https://github.com/manusco/resonance)**
