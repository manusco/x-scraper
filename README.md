<div align="center">

<img src="icons/icon128.png" alt="X-Scraper Logo" width="80" />

# X-Scraper

**The open-source browser extension for extracting X (Twitter) threads, replies, and bookmarks — without the noise.**

[![Version](https://img.shields.io/badge/version-0.2.0-1d9bf0?style=flat-square)](https://github.com/manusco/x-scraper/releases)
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Firefox](https://img.shields.io/badge/Firefox-Compatible-FF7139?style=flat-square&logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/)
[![License: MIT](https://img.shields.io/badge/License-MIT-00ba7c?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

*Scrape any X thread in one click. Export as Markdown, JSON, or plain text. Send to your Second Brain automatically.*

</div>

---

## ✨ What It Does

X-Scraper is a lightweight, privacy-first browser extension that intelligently extracts the content of any X (Twitter) thread — including replies, engagement metrics, embedded media, and outbound links — and delivers it in your preferred format directly to your clipboard, a downloaded file, or a webhook endpoint.

It is designed for **researchers, writers, developers, knowledge curators, and power users** who want to capture knowledge from X without copy-pasting tweet by tweet.

---

## 🚀 Feature Overview

### Core Extraction
| Feature | Description |
|---|---|
| **Thread Scraping** | Extracts the full conversation tree of any X thread, following the correct author-first chronological order |
| **Quote-Tweet Handling** | Captures the text of quoted tweets inline as `[Quoted]: ...` without following the quoted tweet's unrelated comment tree |
| **Boundary Detection** | Automatically stops at "Discover more" and platform-injected content dividers — no cross-thread pollution |
| **Sub-comment Depth Control** | Set exactly how many nested replies to capture per top-level comment (0–25) |
| **Media Awareness** | Detects image alt text and video thumbnails, appending `[Media: ...]` tags for context even in text exports |

### Export & Format
| Feature | Description |
|---|---|
| **Markdown Export** | Clean, structured Markdown with headers, blockquotes per user, and a Resources section — paste directly into Notion, Obsidian, or any markdown editor |
| **JSON Export** | Fully structured JSON object with `mainPost`, `replies`, `metrics`, and `harvestedResources` fields — pipe directly into any downstream system |
| **Plain Text Export** | Clean numbered list output for quick reading, notes, or LLM prompting |
| **Copy to Clipboard** | Instant one-click copy — default mode, zero extra steps |
| **Save as File** | Triggers a browser download dialog to save `.md`, `.json`, or `.txt` files directly to disk |

### Intelligence Layer
| Feature | Description |
|---|---|
| **Unroll Thread Mode** | When toggled, ignores all replies and captures only the original author's own tweets — cleanly unrolls essay-style threads |
| **Engagement Metrics** | Optionally appends Likes, Reposts, Replies, and Views counts to every captured tweet |
| **Resource Harvester 🔗** | Detects and extracts all external URLs mentioned across the thread, compiling them into a dedicated "Harvested Resources" section |
| **Bookmarks Archive Mode 🔖** | Navigate to `x.com/i/bookmarks`, open the extension, and it automatically switches into archive mode — bulk-captures your entire Bookmarks catalog |
| **Second Brain Webhook 🧠** | Paste any webhook URL (Zapier, Make.com, n8n, Notion API) and your scraped payload is automatically `POST`ed as JSON after every scrape |

---

## 📸 How It Works

1. **Navigate** to any X thread or your Bookmarks page in Chrome or Firefox.
2. **Click** the X-Scraper extension icon in your toolbar.
3. **Configure** your export format, depth, toggles, and optional webhook in the settings panel.
4. **Click "Execute Protocol"** — X-Scraper scrolls, extracts, filters, and formats the thread.
5. **Receive** the output: clipboard copy, file download, or webhook delivery — your choice.

---

## ⚙️ Settings Reference

| Setting | Default | Description |
|---|---|---|
| Export Format | `Markdown` | Output format: `Markdown`, `JSON`, `Plain Text` |
| Unroll Thread | `OFF` | Strip replies — author's posts only |
| Include Metrics | `ON` | Append engagement numbers (likes, reposts, etc.) |
| Resource Harvester | `OFF` | Extract and group all external URLs from the thread |
| Save as File | `OFF` | Download file instead of copying to clipboard |
| Second Brain Webhook | *(blank)* | Optional POST target URL for automated pipelines |
| Comment Depth | `5` | Max number of sub-replies to capture per top-level comment |

All settings are **automatically persisted** across sessions via `chrome.storage.local` — configure once, use forever.

---

## 🔖 Bookmarks Archive Mode

The extension detects when you are on `x.com/i/bookmarks` and **automatically enters Archive Mode**:

- The popup displays a yellow **"🔖 Bookmarks Archive Mode Detected"** banner
- The button label changes to **"Archive Bookmarks"**
- The scraper bypasses thread-filtering logic and captures every visible bookmark
- Supports all export formats and the "Save as File" option for a complete offline backup

> **Use case:** Escape the Twitter Bookmarks black hole. Export your entire saved library as a searchable Markdown file or structured JSON database in one click.

---

## 🧠 Second Brain Webhook Integration

Paste any HTTP endpoint into the **"Second Brain Webhook"** field. After each successful scrape, X-Scraper will silently `POST` the following payload:

```json
{
  "source": "X-Scraper",
  "timestamp": "2026-02-27T22:00:00.000Z",
  "dataCount": 42,
  "payload": "...formatted output string..."
}
```

**Compatible with:**
- [Zapier Webhooks](https://zapier.com/apps/webhook/integrations)
- [Make.com (Integromat)](https://www.make.com/en/integrations/webhook)
- [n8n](https://n8n.io/)
- [Notion API](https://developers.notion.com/)
- Any custom REST endpoint

---

## 🔗 Resource Harvester

When enabled, the scraper scans every tweet's link elements for outbound URLs (Twitter/X internal links are excluded). At the end of the export, a dedicated section is appended:

**In Markdown:**
```markdown
---
## 🔗 Harvested Resources (3)

- https://example.com/article
- https://github.com/some/repo
- https://docs.sometools.com/guide
```

**In JSON:**
```json
{
  "harvestedResources": [
    "https://example.com/article",
    "https://github.com/some/repo"
  ]
}
```

---

## 🛠️ Installation

### Chrome (Manual / Developer Mode)

1. [Download the latest release](https://github.com/manusco/x-scraper/releases) as a `.zip` or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode** (top-right toggle).
4. Click **"Load unpacked"** and select the root folder of this repository (the one containing `manifest.json`).
5. The X-Scraper icon will appear in your toolbar.

### Firefox (Developer Edition / Manual)

1. Clone this repository or download the source.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **"Load Temporary Add-on..."**.
4. Select the `manifest.firefox.json` file inside the project directory.

> **Note:** Firefox requires using `manifest.firefox.json`. The Chrome version uses `manifest.json`.

---

## 🏗️ Project Structure

```
x-scraper/
├── icons/                  # Extension icons (PNG, SVG)
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
├── popup/                  # Extension popup UI
│   ├── popup.html          # Markup & settings layout
│   ├── popup.css           # Dark mode glass UI
│   └── popup.js            # Settings persistence, UI logic, webhook dispatch
├── shared/
│   └── scraper.js          # Core scraping engine (exported ES module)
├── scripts/
│   └── convert_icon.js     # SVG→PNG icon generation utility
├── tests/                  # Jest test suite
├── manifest.json           # Chrome Manifest V3
├── manifest.firefox.json   # Firefox Manifest V3
└── README.md
```

---

## 🧪 Development & Testing

**Requirements:** Node.js ≥ 18

```bash
# Install dependencies
npm install

# Run test suite
npm test

# Regenerate PNG icons from SVG source
node scripts/convert_icon.js
```

Tests use **Jest with ESM support** via `--experimental-vm-modules`. The test suite covers:
- Thread boundary detection
- Quote-tweet extraction
- Author vs. commenter filtering
- Sub-comment depth limiting
- Bookmarks mode bypass logic
- Output formatting (Markdown, JSON, Plain Text)

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Please feel free to open a [GitHub Issue](https://github.com/manusco/x-scraper/issues) or submit a PR.

**Good first contributions:**
- Adding support for polling/retry on slow-loading threads
- UI theme customization (Light mode)
- CSV export format
- Timestamp normalization across locales

---

## 📋 Changelog

### v0.2.0 — *Current*
- 🔖 **Bookmarks Archive Mode** — auto-detected when on `/i/bookmarks`, bulk-archives entire bookmark catalog
- 🔗 **Resource Harvester** — extracts and groups all external URLs from a thread
- 🧠 **Second Brain Webhook** — POST scraped payload automatically to any Zapier / Make / Notion endpoint
- 📊 **Engagement Metrics** — capture Likes, Reposts, Replies, Views per tweet
- ⬇️ **Save as File** — download output as `.md`, `.json`, or `.txt` using the browser Downloads API
- 🧵 **Unroll Thread Mode** — author-only extraction, perfect for essay threads
- ✨ **Complete UI Overhaul** — premium dark glass UI with toggle switches, live status, and persistent settings

### v0.1.x
- Initial thread scraping engine
- Clipboard copy
- Basic quote-tweet and boundary handling
- Icon fix for Chrome / Firefox

---

## 📄 License

MIT © [manusco](https://github.com/manusco)

---

<div align="center">

*Built for knowledge workers who refuse to let great threads disappear into the void.*

**[⭐ Star this repo](https://github.com/manusco/x-scraper)** if X-Scraper saves you time.

</div>
