const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const checkGeminiConnection = async (apiKey) => {
  try {
    const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
    });
    return response.ok;
  } catch (e) { return false; }
};

export const expandQuery = async (userQuery, apiKey) => {
  const prompt = `
  User Search: "${userQuery}"
  
  Task: Extract 5-10 specific search keywords to find this topic in browser history.
  
  Rules:
  1. If the input is a question ("where is...", "cual fue..."), extract only the main subject.
  2. If the input is in a non-English language, MUST include English translations of technical terms (e.g., "POO" -> "OOP", "Programacion" -> "Programming") and vice versa.
  3. Include synonyms and related concepts (e.g., "Java" -> "JVM", "Spring", "OOP", "Class", "Inheritance", "Programming", "James Gosling").
  4. Remove stop words (the, a, in, about, que, el, la, tutorial).
  5. Output ONLY the array. No markdown. No text. Just [ ... ]
  `;

  try {
    const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);

    return Array.isArray(json) ? json : [userQuery];
  } catch (e) {
    return userQuery.split(' ').filter(word => word.length > 3);
  }
};

export const analyzeWithGemini = async (query, historyItems, apiKey) => {
  const prompt = `
  Context: Browser History Search
  User Query: "${query}"
  
  Candidate Pages:
  ${JSON.stringify(historyItems.map(h => ({ title: h.title, url: h.url, time: h.lastVisitTime })))}
  
  Task: Identify the best matching page.
  Rules:
  1. Be lenient. If a page covers a concept related to the query (e.g., "Encapsulation" for query "Java"), mark it as found.
  2. If the Title or URL contains the main keyword, prioritize it.
  3. Return raw JSON: { "found": true, "url": "MATCHED_URL", "reason": "SHORT_EXPLANATION" }
  4. If absolutely no relation exists, return { "found": false }.
  `;

  try {
    const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    return { found: false };
  }
};