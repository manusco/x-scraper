# 04 Systems: The Machinery

## 1. External Systems & Integrations
- **X (Twitter)**: The target platform for scraping.
    - *Interaction*: DOM scraping via content scripts.
    - *Auth*: Relies on the user's active browser session.

## 2. Internal Subsystems
- **Popup UI (`/popup`)**: The user interface for triggering scrapes and viewing logs.
- **Content Script Layer (`/scripts`)**: The bridge between the extension context and the X webpage.
- **Shared Scraper logic (`/shared`)**: The core engine that handles scrolling, tweet extraction, and filtering.
- **Automated Tests (`/tests`)**: Jest suite for verifying scraping and filtering algorithms.

## 3. Data Infrastructure
- **Storage**: None. Data is transient.
- **Output**: Clipboard (via `navigator.clipboard`).
- **Memory**: Persistent project context stored in `.resonance/`.

## 4. Key Workflows
1. **Thread Scraping**:
    - Step 1: User opens extension on an X status page.
    - Step 2: Popup injects `atomicScrape` function.
    - Step 3: Scraper scrolls and collects tweets.
    - Step 4: Logic filters for main post, thread author, and relevant replies.
    - Step 5: Formatted string is copied to clipboard.

## 5. Development Environment
- **Runtime**: Browser (Chrome/Chromium or Firefox).
- **Tooling**: Node.js for testing (Jest) and linting (ESLint).
- **Packaging**: Unpacked extension loading in developer mode.

---

[→ Back to State (Active Context)](01_state.md)
