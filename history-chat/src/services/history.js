const searchSingleKeyword = async (keyword, startTime, maxResults) => {
  return await chrome.history.search({
    text: keyword,
    startTime: startTime,
    maxResults: maxResults
  });
};

export const searchMultipleKeywords = async (keywords, startTime = 0) => {
  try {
    const promises = keywords.map(kw => searchSingleKeyword(kw, startTime, 200));
    const resultsArrays = await Promise.all(promises);

    const uniqueMap = new Map();
    
    resultsArrays.flat().forEach(item => {
      if (!item.url || item.url.startsWith('chrome://') || item.url.startsWith('file://')) return;

      if (!uniqueMap.has(item.url)) {
        uniqueMap.set(item.url, {
          id: item.id,
          title: item.title || item.url,
          url: item.url,
          lastVisitTime: new Date(item.lastVisitTime).toLocaleDateString() + ' ' + new Date(item.lastVisitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          visitCount: item.visitCount
        });
      }
    });

    return Array.from(uniqueMap.values()).slice(0, 150);

  } catch (error) {
    return [];
  }
};