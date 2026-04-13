const FUGLE_KEY_STORAGE = 'fugle_api_key'
const FUGLE_BASE = 'https://api.fugle.tw/marketdata/v1.0/stock'

// 優先用 .env 的 VITE_FUGEL_KEY（注意拼字：FUGEL），其次用 localStorage 手動輸入
export function getFugleApiKey() {
  return import.meta.env.VITE_FUGEL_KEY || localStorage.getItem(FUGLE_KEY_STORAGE) || ''
}

export function setFugleApiKey(key) {
  if (key && key.trim()) {
    localStorage.setItem(FUGLE_KEY_STORAGE, key.trim())
  } else {
    localStorage.removeItem(FUGLE_KEY_STORAGE)
  }
}

export function hasFugleApiKey() {
  return !!getFugleApiKey()
}

/**
 * 取得單支股票今日逐筆成交（精準連次/連量計算用）
 * 取最後 2000 筆（倒序 → 再反轉），足以涵蓋一般連次長度。
 *
 * @param {string} stockId 股票代碼
 * @returns {Promise<{prices: number[], volumes: number[]} | null>}
 */
export async function fetchIntradayTrades(stockId) {
  const apiKey = getFugleApiKey()
  if (!apiKey) return null

  const base = import.meta.env.DEV ? '/api/fugle' : FUGLE_BASE
  // sort=desc 取最新2000筆，再反轉成舊→新順序
  const url = `${base}/intraday/trades/${stockId}?sort=desc&limit=2000`

  try {
    const resp = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return null

    const json = await resp.json()
    const trades = Array.isArray(json) ? json : (json?.data ?? null)
    if (!Array.isArray(trades) || trades.length < 2) return null

    trades.reverse()  // 倒轉為舊→新

    // 將 HH:MM:SS.mmm 字串轉為當日毫秒數（用於 30 秒滾動連量視窗）
    function parseTradeTime(t) {
      const s = t?.time ?? ''
      const m = s.match(/(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/)
      if (!m) return 0
      return (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + (+( m[4] ?? '0').padEnd(3,'0').slice(0,3))
    }

    return {
      prices:     trades.map(t => t.price),
      // size = 每筆成交量（張）；volume 是累積量，不用
      volumes:    trades.map(t => t.size ?? 0),
      timestamps: trades.map(parseTradeTime),
    }
  } catch {
    return null
  }
}

/**
 * 取得單支股票今日 1 分K（連次/連量 fallback 用）
 * 當逐筆成交不可用時改用此函式（精確度較低）。
 *
 * @param {string} stockId 股票代碼
 * @returns {Promise<{prices: number[], volumes: number[]} | null>}
 */
export async function fetchIntradayCandles(stockId) {
  const apiKey = getFugleApiKey()
  if (!apiKey) return null

  const base = import.meta.env.DEV ? '/api/fugle' : FUGLE_BASE
  const url = `${base}/intraday/candles/${stockId}?timeframe=1&sort=asc`

  try {
    const resp = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null

    const json = await resp.json()
    const candles = Array.isArray(json) ? json : (json?.data ?? null)
    if (!Array.isArray(candles) || candles.length < 2) return null

    return {
      prices:  candles.map(c => c.close),
      volumes: candles.map(c => c.volume ?? 0),
    }
  } catch {
    return null
  }
}
