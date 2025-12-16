import { useState, useEffect, useRef } from 'react'
import { searchMultipleKeywords } from './services/history'
import { expandQuery, analyzeWithGemini } from './services/gemini'

const SEARCH_MODES = {
  superficial: { label: 'Superficial', keywordCount: 5 },
  regular: { label: 'Regular', keywordCount: 20 },
  exhaustive: { label: 'Exhaustive', keywordCount: 50 },
  sheerlock: { label: 'Sheerlock', keywordCount: 100 }
}

function App() {
  const [view, setView] = useState('chat')
  const [apiKey, setApiKey] = useState('')
  const [input, setInput] = useState('')
  const [timeRange, setTimeRange] = useState('24h')
  const [retention, setRetention] = useState(86400000)
  const [searchMode, setSearchMode] = useState('regular')
  const [expandedMessages, setExpandedMessages] = useState({})
  const [messages, setMessages] = useState([
    { type: 'bot', text: 'Hi. I use Smart Expansion to find your lost links. You can chat with me or just search keywords.', timestamp: Date.now() }
  ])
  const messagesEndRef = useRef(null)
  const isHistoryLoaded = useRef(false)

  useEffect(() => {
    const init = async () => {
      if (chrome?.storage?.sync) {
        const settings = await chrome.storage.sync.get(['gemini_key', 'retention_period', 'search_mode'])
        if (settings.gemini_key) setApiKey(settings.gemini_key)

        const savedRetention = settings.retention_period || 86400000
        setRetention(savedRetention)

        const savedMode = settings.search_mode || 'regular'
        setSearchMode(savedMode in SEARCH_MODES ? savedMode : 'regular')

        if (chrome?.storage?.local) {
          const localData = await chrome.storage.local.get(['chat_history'])
          if (localData.chat_history && localData.chat_history.length > 0) {
            const now = Date.now()
            const filtered = localData.chat_history.filter(msg => {
              const msgTime = msg.timestamp || now
              return (now - msgTime) < savedRetention
            })

            if (filtered.length > 0) {
              setMessages(filtered)
            } else {
              setMessages([{ type: 'bot', text: 'History cleared due to time limit.', timestamp: Date.now() }])
            }
          }
          isHistoryLoaded.current = true
        }
      }
    }
    init()
  }, [])

  const updateMessages = (newMessages) => {
    setMessages(newMessages)
    if (chrome?.storage?.local && isHistoryLoaded.current) {
      chrome.storage.local.set({ chat_history: newMessages })
    }
  }

  useEffect(() => {
    if (isHistoryLoaded.current && messages.length > 0 && chrome?.storage?.local) {
      chrome.storage.local.set({ chat_history: messages })
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const saveSettings = () => {
    if (chrome?.storage?.sync) {
      const newRetention = parseInt(retention)
      chrome.storage.sync.set(
        {
          gemini_key: apiKey,
          retention_period: newRetention,
          search_mode: searchMode
        },
        () => {
          setView('chat')
          const now = Date.now()
          const filteredMsgs = messages.filter(msg => {
            const msgTime = msg.timestamp || now
            return (now - msgTime) < newRetention
          })
          const finalMsgs = [...filteredMsgs, { type: 'bot', text: 'Settings saved.', timestamp: Date.now() }]
          updateMessages(finalMsgs)
        }
      )
    } else {
      setView('chat')
    }
  }

  const deleteSettings = () => {
    if (chrome?.storage?.sync) {
      chrome.storage.sync.remove(['gemini_key', 'retention_period'], () => {
        setApiKey('')
        setRetention(86400000)
        const newMsgs = [...messages, { type: 'bot', text: 'API Key removed. Back to local mode.', timestamp: Date.now() }]
        updateMessages(newMsgs)
      })
    }
  }

  const clearChat = () => {
    const initialMsg = [{ type: 'bot', text: 'Chat cleared. How can I help?', timestamp: Date.now() }]
    updateMessages(initialMsg)
  }

  const getStartTime = () => {
    const now = Date.now()
    switch (timeRange) {
      case '24h': return now - (24 * 60 * 60 * 1000)
      case '7d': return now - (7 * 24 * 60 * 60 * 1000)
      case '30d': return now - (30 * 24 * 60 * 60 * 1000)
      case '3m': return now - (90 * 24 * 60 * 60 * 1000)
      default: return now - (24 * 60 * 60 * 1000)
    }
  }

  const isGoogleSearchUrl = (rawUrl) => {
    try {
      const u = new URL(rawUrl)
      const host = u.hostname.toLowerCase()
      if (!host.includes('google.')) return false
      const path = u.pathname.toLowerCase()
      return path === '/search' || path.startsWith('/search/') || path === '/url'
    } catch {
      return false
    }
  }

  const normalizeUrl = (rawUrl) => {
    try {
      const u = new URL(rawUrl)
      u.hash = ''
      const toDelete = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'gclid', 'fbclid', 'yclid', 'mc_cid', 'mc_eid', 'igshid'
      ]
      toDelete.forEach(k => u.searchParams.delete(k))
      const sorted = new URLSearchParams()
      Array.from(u.searchParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([k, v]) => sorted.append(k, v))
      u.search = sorted.toString() ? `?${sorted.toString()}` : ''
      return u.toString()
    } catch {
      return rawUrl
    }
  }

  const cleanAndDedupeCandidates = (items) => {
    const map = new Map()
    for (const it of items) {
      if (!it?.url) continue
      if (isGoogleSearchUrl(it.url)) continue
      const n = normalizeUrl(it.url)
      if (!map.has(n)) {
        map.set(n, { ...it, url: n })
      }
    }
    return Array.from(map.values())
  }

  const buildCandidatesTieredTwoPass = async (keywords, startTime, targetCount = 100) => {
    const tierSpec = [
      { from: 0, to: 10, maxPerKeyword: 10 },
      { from: 10, to: 30, maxPerKeyword: 5 },
      { from: 30, to: 100, maxPerKeyword: 2 }
    ]

    const bag = []
    const bagNormSet = new Set()
    const leftoversByKeyword = new Map()

    const addToBag = (items) => {
      for (const it of items) {
        if (!it?.url) continue
        if (isGoogleSearchUrl(it.url)) continue
        const n = normalizeUrl(it.url)
        if (bagNormSet.has(n)) continue
        bagNormSet.add(n)
        bag.push({ ...it, url: n })
        if (bag.length >= targetCount) break
      }
    }

    const pass1 = async () => {
      for (const tier of tierSpec) {
        const slice = keywords.slice(tier.from, tier.to)
        for (const kw of slice) {
          if (bag.length >= targetCount) return
          const results = await searchMultipleKeywords([kw], startTime)
          const cleaned = cleanAndDedupeCandidates(results)

          const take = cleaned.slice(0, tier.maxPerKeyword)
          const left = cleaned.slice(tier.maxPerKeyword)

          addToBag(take)
          if (left.length > 0) leftoversByKeyword.set(kw, left)
        }
      }
    }

    const pass2 = async () => {
      if (bag.length >= targetCount) return
      for (const kw of keywords) {
        if (bag.length >= targetCount) return
        const left = leftoversByKeyword.get(kw) || []
        if (left.length === 0) continue
        addToBag(left)
      }
    }

    await pass1()
    await pass2()

    return bag.slice(0, targetCount)
  }

  const toggleExpanded = (idx) => {
    setExpandedMessages(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const exportCandidates = (candidates) => {
    const sorted = [...(candidates || [])].sort((a, b) => {
      const ta = (a.title || '').toLowerCase()
      const tb = (b.title || '').toLowerCase()
      if (ta !== tb) return ta.localeCompare(tb)
      return (a.url || '').localeCompare(b.url || '')
    })
    const payload = {
      exportedAt: new Date().toISOString(),
      count: sorted.length,
      items: sorted.map(x => ({
        title: x.title || '',
        url: x.url || '',
        lastVisitTime: x.lastVisitTime || ''
      }))
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'historychat-results.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleSearch = async () => {
    if (!input.trim()) return

    const userMsg = { type: 'user', text: input, timestamp: Date.now() }
    const historyWithUser = [...messages, userMsg]
    updateMessages(historyWithUser)

    const currentQuery = input
    setInput('')
    const startTime = getStartTime()

    if (!apiKey) {
      const loadingMsg = [...historyWithUser, { type: 'bot', text: 'Searching local history (Basic Mode)...', timestamp: Date.now() }]
      updateMessages(loadingMsg)

      const candidates = await searchMultipleKeywords([currentQuery], startTime)
      const cleaned = cleanAndDedupeCandidates(candidates)

      if (cleaned.length === 0) {
        const noMatchMsg = [...historyWithUser, { type: 'bot', text: 'No local matches found. Try adding an API Key for AI smart search.', timestamp: Date.now() }]
        updateMessages(noMatchMsg)
      } else {
        const foundMsg = [...historyWithUser, { type: 'bot', text: `Found ${cleaned.length} matches locally:`, data: cleaned.slice(0, 5), allData: cleaned, timestamp: Date.now() }]
        updateMessages(foundMsg)
      }
      return
    }

    const modeInfo = SEARCH_MODES[searchMode] || SEARCH_MODES.regular
    const keywordCount = modeInfo.keywordCount

    const historyWithThinking = [...historyWithUser, { type: 'bot', text: `Thinking... (Mode: ${modeInfo.label})`, timestamp: Date.now() }]
    updateMessages(historyWithThinking)

    try {
      const keywords = await expandQuery(currentQuery, apiKey, keywordCount)
      const candidatesTiered = await buildCandidatesTieredTwoPass(keywords, startTime, 100)
      const finalCandidates = cleanAndDedupeCandidates(candidatesTiered).slice(0, 100)

      if (finalCandidates.length === 0) {
        const finalMsgs = [...historyWithUser, { type: 'bot', text: `No matches found for: ${keywords.join(', ')}`, timestamp: Date.now() }]
        updateMessages(finalMsgs)
        return
      }

      const historyAnalyzing = [...historyWithUser, { type: 'bot', text: `Analyzing ${finalCandidates.length} candidates...`, timestamp: Date.now() }]
      updateMessages(historyAnalyzing)

      const aiResult = await analyzeWithGemini(currentQuery, finalCandidates, apiKey)

      const results = Array.isArray(aiResult?.results) ? aiResult.results : []
      const topItems = results
        .map(r => finalCandidates.find(h => h.url === r.url) || { title: 'Result', url: r.url, lastVisitTime: 'Unknown' })
        .slice(0, 5)

      if (topItems.length > 0) {
        const reasonText = results[0]?.reason ? `Top match: ${results[0].reason}` : 'Top related results found.'
        const successMsg = [
          ...historyWithUser,
          {
            type: 'bot',
            text: reasonText,
            data: topItems,
            allData: finalCandidates,
            timestamp: Date.now()
          }
        ]
        updateMessages(successMsg)
      } else {
        const failMsg = [
          ...historyWithUser,
          {
            type: 'bot',
            text: 'Here is what I found.',
            data: finalCandidates.slice(0, 5),
            allData: finalCandidates,
            timestamp: Date.now()
          }
        ]
        updateMessages(failMsg)
      }
    } catch (err) {
      const errorMsg = [...historyWithUser, { type: 'bot', text: 'Error in AI processing.', timestamp: Date.now() }]
      updateMessages(errorMsg)
    }
  }

  if (view === 'settings') {
    return (
      <div className="w-full h-screen flex flex-col bg-gray-50 text-gray-800">
        <div className="px-4 py-3 border-b bg-white shadow-sm flex items-center gap-2">
          <button onClick={() => setView('chat')} className="text-gray-500 hover:text-gray-700 font-medium">Back</button>
          <h1 className="font-bold text-gray-700 text-sm ml-auto">Settings</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-blue-50 p-3 rounded border border-blue-100">
            <p className="text-[10px] text-blue-800">
              <strong>Privacy Note:</strong> Your browsing history stays on your device. Only search queries are sent to Google Gemini when an API Key is active.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Search Type</label>
            <select
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="superficial">Superficial (5 keywords)</option>
              <option value="regular">Regular (20 keywords)</option>
              <option value="exhaustive">Exhaustive (50 keywords)</option>
              <option value="sheerlock">Sheerlock (100 keywords)</option>
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Higher levels broaden the search by expanding more keywords.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Google Gemini API Key (Optional)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">Required for natural language. Without it, standard keyword search applies.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Chat Retention</label>
            <select
              value={retention}
              onChange={(e) => setRetention(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="86400000">24 Hours</option>
              <option value="604800000">7 Days</option>
              <option value="2592000000">30 Days</option>
            </select>
            <p className="text-[10px] text-gray-500 mt-1">Messages older than this are removed on reload.</p>
          </div>

          <button onClick={saveSettings} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">Save Configuration</button>

          {apiKey && (
            <div className="pt-4 border-t mt-4">
              <button onClick={deleteSettings} className="w-full text-red-500 text-xs hover:text-red-700 font-medium border border-red-200 py-2 rounded">
                Disconnect API Key
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50 text-gray-800">
      <div className="px-4 py-3 border-b bg-white shadow-sm flex justify-between items-center sticky top-0 z-10">
        <h1 className="font-bold text-gray-700 text-sm">History Chat</h1>
        <div className="flex gap-3">
          <button onClick={clearChat} className="text-gray-400 hover:text-red-500 transition-colors" title="Clear History">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
          <button onClick={() => setView('settings')} className="text-gray-400 hover:text-blue-600 transition-colors" title="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col max-w-[90%] ${msg.type === 'user' ? 'self-end items-end ml-auto' : 'items-start'}`}>
            <div className={`px-3 py-2 rounded-2xl text-sm shadow-sm ${msg.type === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'}`}>
              <p>{msg.text}</p>

              {msg.data && (
                <ul className="mt-2 space-y-2">
                  {msg.data.map((item, i) => (
                    <li key={i} className="border-t pt-2 first:border-0 first:pt-0">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline block truncate">{item.title}</a>
                      <span className="text-xs text-gray-400 block truncate">{item.url}</span>
                    </li>
                  ))}
                </ul>
              )}

              {msg.allData && msg.type === 'bot' && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    onClick={() => toggleExpanded(idx)}
                    className="text-xs border border-gray-200 px-2 py-1 rounded hover:border-gray-300 text-gray-600"
                    title="Show all candidates sent to Gemini"
                  >
                    {expandedMessages[idx] ? `Hide all (${msg.allData.length})` : `Show all (${msg.allData.length})`}
                  </button>
                  <button
                    onClick={() => exportCandidates(msg.allData)}
                    className="text-xs border border-gray-200 px-2 py-1 rounded hover:border-gray-300 text-gray-600"
                    title="Export candidates"
                  >
                    Export
                  </button>
                </div>
              )}

              {msg.allData && expandedMessages[idx] && (
                <ul className="mt-2 space-y-2">
                  {msg.allData.map((item, i) => (
                    <li key={i} className="border-t pt-2 first:border-0 first:pt-0">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline block truncate">{item.title}</a>
                      <span className="text-xs text-gray-400 block truncate">{item.url}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="text-[10px] text-gray-400 mt-1 px-1">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t bg-white space-y-2">
        <div className="flex gap-2 justify-end">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1 bg-gray-50 text-gray-600 focus:outline-none focus:border-blue-500">
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="3m">Last 3 Months</option>
          </select>
        </div>
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={apiKey ? 'Ask about your history...' : 'Search local keywords...'}
            className="w-full border border-gray-300 rounded-full pl-4 pr-12 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} disabled={!input.trim()} className="absolute right-1 top-1 bg-blue-600 text-white p-1.5 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.89 28.89 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default App