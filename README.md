# Chat with History - Chrome Extension

A privacy-focused Chrome extension that lets you chat with your browsing history using natural language. Recall websites you visited without remembering the exact URL or title.

DEMO: https://www.youtube.com/watch?v=qqbKGZbqk0g

## Features

**Natural Language Search**
Ask "Where was that recipe for pizza?" instead of exact keywords.

**Local-First Privacy**
Works out-of-the-box with local keyword search. AI features are strictly opt-in.

**Configurable Retention**
You control how far back to search (24h, 7 days, 30 days) and how long chat logs are kept.

**No Hallucinations**
Results are fetched directly from your local \`chrome.history\`. If it's not in your history, the extension won't invent it.

## Installation

1. Download or clone this repository.
2. **Ensure you are in the \`history-chat\` directory.**
3. Run \`npm install\` to install dependencies.
4. Run \`npm run build\` to generate the \`/dist\` folder.
5. Open Chrome and go to \`chrome://extensions\`.
6. Enable **Developer mode** (top right).
7. Click **Load unpacked** and select the \`dist\` folder created in step 3.

## Usage

1. Click the extension icon to open the chat.
2. **Basic Mode (Default):** Type keywords (e.g., "docs python") to search instantly.
3. **AI Mode (Optional):** Go to Settings (gear icon) and enter a Google Gemini API Key. This enables natural language queries (e.g., "The documentation page I used for Python loops").
4. Click any result to open it in a new tab.

## Permissions Justification

This extension adheres to the principle of least privilege.

**\`history\`**
Essential to search the user's visited sites based on their query. Data is processed locally or passed to the AI (only if opt-in) solely for finding the relevant link.

**\`storage\`**
Used to save user preferences (API Key, retention settings) and the temporary chat log locally on the device.

## Data Privacy

**Local Data**
Your browsing history never leaves your device by default.

**AI Processing**
If you opt-in to use Gemini, only the specific search query and the titles/URLs of potential matches are sent to the API for analysis. They are not stored by the extension developer.

**Transparency**
You can clear your API key and chat history at any time via the Settings menu.

## Architecture

**Frontend:** React + Vite + TailwindCSS.

**Logic:**
1. **Intent Extraction:** Converts natural language into search keywords.
2. **Local Retrieval:** Queries \`chrome.history\` API.
3. **Semantic Ranking:** Uses LLM to select the most relevant link from the candidates.

