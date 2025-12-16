const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

export const expandQuery = async (userQuery, apiKey, keywordCount = 20) => {
  const count = Math.max(1, Math.min(100, parseInt(keywordCount, 10) || 20));

  const prompt = `
User Search: "${userQuery}"

Task: Extract up to ${count} unique, single-word search keywords to find this topic in browser history.
Order keywords from most directly relevant to least.

Rules:
1. If the input is a question, extract only the main subject.
2. If the input is non-English, include English equivalents of technical terms and vice versa.
3. Include close synonyms and related concepts; keep highest-value terms first.
4. Remove stop words (the, a, in, about, que, el, la, tutorial).
5. Keywords MUST be unique (case-insensitive, trim spaces). Do not repeat concepts.
6. If fewer than ${count} unique keywords exist, return fewer. Do NOT pad.
7. Output ONLY a raw JSON array. No markdown. No text. Just [ ... ].
`;

  try {
    const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        const uniq = Array.from(new Set(arr.map(x => String(x).trim()).filter(Boolean)));
        if (uniq.length >= count) return uniq.slice(0, count);
        return uniq.slice(0, count);

      }
    }

    const fallback = userQuery
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 3);

    const uniqFallback = Array.from(new Set(fallback));
    if (uniqFallback.length >= count) return uniqFallback.slice(0, count);

    return uniqFallback.slice(0, count);

  } catch (e) {
    const fallback = userQuery
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 3);

    const uniqFallback = Array.from(new Set(fallback));
    if (uniqFallback.length >= count) return uniqFallback.slice(0, count);

    return uniqFallback.slice(0, count);

  }
};

export const analyzeWithGemini = async (query, historyItems, apiKey) => {
  const prompt = `
Context: Browser History Search
User Query: "${query}"

Candidate Pages:
${JSON.stringify(historyItems.map(h => ({ title: h.title, url: h.url, time: h.lastVisitTime })))}

Task: Identify the best matching pages.

Rules:
1. Be lenient. If a page covers a concept related to the query, consider it relevant.
2. If the Title or URL contains the main keyword, prioritize it.
3. Return raw JSON only, with this exact shape:
   { "found": true, "results": [ { "url": "MATCHED_URL", "reason": "SHORT_EXPLANATION" }, ... ] }
4. Return up to 5 results ordered best to worst.
5. If absolutely no relation exists, return { "found": false, "results": [] }.
`;

  try {
    const response = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (!Array.isArray(parsed.results)) parsed.results = [];
      return parsed;
    }
    return { found: false, results: [] };
  } catch (e) {
    return { found: false, results: [] };
  }
};