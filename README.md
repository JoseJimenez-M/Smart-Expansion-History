# History Chat – Chrome Extension

A privacy-first Chrome extension that helps you rediscover websites you’ve visited using natural language, even when you don’t remember exact keywords, titles, or URLs.

Instead of digging through history, just ask.

DEMO: https://youtu.be/V6LXm6JLMJQ

---

## Key Features

### Natural Language History Search
Ask things like:
- “The page about planting trees and animals”
- “That documentation I used for Python loops”

The extension finds real pages from your browsing history. Nothing is invented.

---

### Progressive Smart Search (AI-Optional)
When AI mode is enabled, searches run in progressive levels to maximize recall while minimizing API usage:

- Superficial – 5 high-value keywords  
- Regular (default) – 20 keywords  
- Exhaustive – 50 keywords  
- Sheerlock – up to 100 keywords (deep recovery mode)

Keywords are ordered by relevance and searched locally until enough real pages are found.

---

### Local-First by Design
- Works fully offline with basic keyword search.
- AI features are strictly opt-in.
- Your browsing history is never uploaded in bulk.

---

### Token-Efficient AI Usage
- AI never scans your full history.
- No hallucinations: if it’s not in your history, it won’t appear.
- Designed to stay within very small token budgets.

---

### Transparent Results
- Shows the Top 5 most relevant pages.
- Option to view or export all candidates.
- You always see what the AI evaluated.

---

### Configurable Retention
- Control how far back searches go (24h, 7 days, 30 days, 3 months).
- Control how long chat history is stored locally.
- Old data is automatically purged.

---

## Installation

1. Clone or download this repository.
2. Navigate to the history-chat directory
3. Install dependencies:
   npm install
4. Build the extension:
   npm run build
5. Open Chrome and go to chrome://extensions.
6. Enable Developer mode (top right).
7. Click Load unpacked and select the generated dist folder.

---

## Usage

1. Click the extension icon to open History Chat.
2. Basic Mode (default):
   - Type keywords like python, docs, bank, flight, booking.
3. AI Mode (optional):
   - Open Settings (gear icon).
   - Enter a Google Gemini API Key.
   - Choose a search depth (Superficial → Sheerlock).
4. Click any result to open it in a new tab.
5. Use Show all or Export to inspect every evaluated link.

---

## Permissions Justification

This extension follows the principle of least privilege.

### history
Required to search your visited pages.  
Data is processed locally and only specific candidate URLs are sent to AI if you explicitly enable it.

### storage
Used to store:
- User preferences (API key, search mode, retention)
- Temporary chat history (stored locally only)

No background tracking. No analytics.

---

## Data Privacy

### Local by Default
Your browsing history never leaves your device unless you enable AI features.

### AI Processing (Opt-In)
When enabled:
- Only the search query and a limited set of candidate titles/URLs are sent to Google Gemini.
- No full history, no cookies, no identifiers.
- Data is not stored by the extension developer.

### Full User Control
- Remove your API key at any time.
- Clear chat history instantly from Settings.

---

## Architecture Overview

### Frontend
- React
- Vite
- TailwindCSS

### Search Pipeline
1. Intent Expansion (optional)  
   Converts natural language into ordered, unique keywords.
2. Local Retrieval  
   Progressive keyword search over chrome.history.
3. Candidate Cleaning  
   Deduplication, URL normalization, removal of search noise.
4. Semantic Ranking (optional)  
   AI selects the most relevant links from real history entries.

---

## Philosophy

- Privacy first.
- Deterministic results.
- AI as a ranking tool, not a source of truth.
- Maximum recall with minimum tokens.

