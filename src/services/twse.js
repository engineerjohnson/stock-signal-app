import axios from 'axios'
import { proxyGet } from './proxy.js'

const _OPENAPI = 'https://openapi.twse.com.tw/v1'
const _TWSE    = 'https://www.twse.com.tw'
const MIS      = 'https://mis.twse.com.tw/stock/api'

// 開發模式下改走 Vite dev proxy，避免 CORS
const OPENAPI = import.meta.env.DEV
  ? _OPENAPI.replace('https://openapi.twse.com.tw', '/api/twse-openapi')
  : _OPENAPI
const TWSE_WWW = import.meta.env.DEV
  ? _TWSE.replace('https://www.twse.com.tw', '/api/twse-www')
  : _TWSE

// 快取全部股票基礎資料，供自選股查詢用
let _fullStockMap = {}

// localStorage key：儲存前一次 STOCK_DAY_ALL 的量，用於跨日量比計算
const STOCK_DAY_CACHE_KEY = 'twse_day_cache_v1'

/**
 * 解析含千分位逗號的數字字串
 */
function parseNum(str) {
  if (!str || str === '--') return 0
  return parseFloat(String(str).replace(/,/g, '')) || 0
}

/**
 * 讀取前一次 STOCK_DAY_ALL 快取（儲存於 localStorage）
 * 回傳 { date: string, map: { [code]: { volume } } }
 */
function loadDayCache() {
  try { return JSON.parse(localStorage.getItem(STOCK_DAY_CACHE_KEY) || 'null') } catch { return null }
}

function saveDayCache(map, date) {
  try { localStorage.setItem(STOCK_DAY_CACHE_KEY, JSON.stringify({ date, map })) } catch {}
}

/**
 * 初始化：取得掃描母池（前一日 Top N 活躍股）
 *
 * 【跨日量比】
 * 每次 fetch 後將各股量存入 localStorage。
 * 下次 fetch 時（通常是隔日），以今日量 / 前日量 = dayVolumeRatio。
 * 盤後使用時 = 昨日量 / 前日量，作為量比的靜態估算。
 * 盤中時 doScan() 會以即時量覆蓋，所以此值僅作為初始值。
 *
 * @param {number} topN 取成交量前幾名（預設 100）
 * @returns {Promise<StockBase[]>}
 */
export async function fetchStockPool() {
  // 讀取前一次快取（跨日量比用）
  const prevCache = loadDayCache()
  const prevMap   = prevCache?.map || {}

  // 用 www.twse.com.tw 的 endpoint 帶今日日期，確保取到最新收盤資料
  // openapi.twse.com.tw 有 CDN 快取延遲，可能回傳前一日資料
  const todayParam = new Date().toISOString().slice(0, 10).replace(/-/g, '')  // YYYYMMDD
  const wwwPath = `/rwd/zh/afterTrading/STOCK_DAY_ALL?date=${todayParam}&response=json`

  // www 端點有兩個問題：
  //   1. 盤中請求 date=今日時，當日 STOCK_DAY_ALL 尚未釋出 → 307 redirect
  //   2. Vite proxy 不帶完整 Browser header（Cookie / Referer）→ 被 WAF 攔截 → 307 → 封鎖頁
  // openapi 端點不帶 date 參數，直接回傳最近一次已有資料（如盤中回傳前一交易日），無上述問題。
  //
  // DEV：直接走 openapi，跳過 www（避免 Vite proxy 觸發 WAF）
  // PROD：先試 www（Cloudflare Worker 有完整 header，可取到最即時資料），307 / 失敗再 fallback openapi
  let rawResp = null

  if (!import.meta.env.DEV) {
    // PROD：先試 www，失敗再 fallback
    try {
      rawResp = await proxyGet(`${_TWSE}${wwwPath}`)
    } catch (e) {
      console.warn('[TWSE] PROD www endpoint 失敗，fallback 到 openapi', e?.message ?? e)
    }
  }

  // DEV 直接走 openapi；PROD www 307 / 失敗或回應非 OK 也走 openapi
  const wwwOk = rawResp?.stat === 'OK' && Array.isArray(rawResp.data)
  if (!wwwOk && !Array.isArray(rawResp)) {
    try {
      const fallback = import.meta.env.DEV
        ? await axios.get(`${OPENAPI}/exchangeReport/STOCK_DAY_ALL`, { timeout: 15000 }).then(r => r?.data ?? r)
        : await proxyGet(`${_OPENAPI}/exchangeReport/STOCK_DAY_ALL`)
      rawResp = fallback
    } catch (e) {
      console.warn('[TWSE] openapi fallback 失敗', e?.message ?? e)
      rawResp = []
    }
  }

  // www endpoint 回傳格式：{ stat, date, fields, data: [...rows] }
  // 每筆 data 是 array，欄位對應 fields
  // 相容 openapi 格式（直接是 array of objects）
  let dayAllData
  if (Array.isArray(rawResp)) {
    dayAllData = rawResp   // openapi 格式
  } else if (rawResp?.stat === 'OK' && Array.isArray(rawResp.data)) {
    const fields = rawResp.fields || []
    const idx = name => fields.indexOf(name)
    const iCode = idx('證券代號'), iName = idx('證券名稱')
    const iVol = idx('成交股數'), iVal = idx('成交金額')
    const iOpen = idx('開盤價'), iHigh = idx('最高價'), iLow = idx('最低價')
    const iClose = idx('收盤價'), iChg = idx('漲跌價差'), iTxn = idx('成交筆數')
    dayAllData = rawResp.data.map(row => ({
      Code:         row[iCode],
      Name:         row[iName],
      // 成交股數 是「股」，除以 1000 轉換成「張」，與 openapi TradeVolume 單位一致
      TradeVolume:  String(Math.round(parseNum(row[iVol]) / 1000)),
      TradeValue:   row[iVal],
      OpeningPrice: row[iOpen],
      HighestPrice: row[iHigh],
      LowestPrice:  row[iLow],
      ClosingPrice: row[iClose],
      Change:       row[iChg],
      Transaction:  row[iTxn],
    }))
  } else {
    dayAllData = []
  }

  const allStocks = (dayAllData || [])
    .filter(s => {
      if (!s.Code || !s.Name) return false
      if (!/^\d{4}$/.test(s.Code)) return false      // 只留 4 位數代碼
      const price  = parseNum(s.ClosingPrice)
      const vol    = parseNum(s.TradeVolume)
      const change = parseNum(s.Change)
      // 用 price 計算漲跌幅（price = close，此 scope 已定義）
      const prevClose = price - change
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0
      // 保留：價格>=10元 且 (量>=200張 或 漲跌幅>=9%【近漲跌停】)
      return price >= 10 && (vol >= 200 || Math.abs(changePct) >= 9)
    })
    .map(s => {
      const close  = parseNum(s.ClosingPrice)
      const open   = parseNum(s.OpeningPrice)
      const high   = parseNum(s.HighestPrice)
      const low    = parseNum(s.LowestPrice)
      const vol    = parseNum(s.TradeVolume)
      const change = parseNum(s.Change)
      const prevDayClose = close - change
      const yesterdayChangePercent = prevDayClose > 0 ? (change / prevDayClose) * 100 : 0
      const tradeValue = parseNum(s.TradeValue) / 10000

      // 跨日量比：今日量 / 前次儲存量（通常是前一交易日）
      const prevVol = prevMap[s.Code]?.volume || 0
      const dayVolumeRatio = vol > 0 && prevVol > 0 ? vol / prevVol : 0

      return {
        id:                    s.Code,
        name:                  s.Name,
        yesterdayVolume:       vol,
        yesterdayClose:        close,
        yesterdayOpen:         open,
        yesterdayHigh:         high,
        yesterdayLow:          low,
        yesterdayChange:       change,
        yesterdayChangePercent,
        yesterdayTradeValue:   tradeValue,
        sharesLots:            0,
        dayVolumeRatio,          // 昨日量 / 前日量（跨日靜態量比）
      }
    })

  // 取出資料日期
  // www endpoint 在 rawResp.date 直接給 "115/04/10" 格式
  let dataDate = null
  if (!Array.isArray(rawResp) && rawResp?.date) {
    const d = String(rawResp.date).replace(/-/g, '')
    if (/^\d{8}$/.test(d)) {
      // "20260410" → 2026/04/10（西元8碼格式）
      dataDate = `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`
    } else {
      // "115/04/10" → 2026/04/10（民國斜線格式，備用）
      const parts = rawResp.date.split('/')
      if (parts.length === 3) {
        const y = parseInt(parts[0]) + 1911
        dataDate = `${y}/${parts[1]}/${parts[2]}`
      }
    }
  } else {
    // fallback：從 openapi 資料的 Date 欄位解析
    const firstItem = (dayAllData || []).find(s => s.Date)
    if (firstItem?.Date) {
      const d = String(firstItem.Date)
      if (d.length === 7) {
        const y = parseInt(d.slice(0, 3)) + 1911
        dataDate = `${y}/${d.slice(3, 5)}/${d.slice(5, 7)}`
      }
    }
  }
  console.info(`[TWSE] STOCK_DAY_ALL 資料日期: ${dataDate || '未知'}，股票數: ${allStocks.length}`)

  // 建立全股票快取（自選股新增時用）
  _fullStockMap = {}
  for (const s of allStocks) _fullStockMap[s.id] = s

  // 儲存本次量資料，供下次訪問計算跨日量比
  // 只在日期不同時才覆寫（同一天多次開 app 不覆寫，否則下次比較會變今/今=1）
  const todayStr = new Date().toDateString()
  if (prevCache?.date !== todayStr) {
    const newMap = {}
    for (const s of allStocks) newMap[s.id] = { volume: s.yesterdayVolume }
    saveDayCache(newMap, todayStr)
  }

  // 全部符合條件的股票都進 pool（讓篩選 tab 在完整宇宙上過濾）
  return { stocks: allStocks, dataDate }
}

/**
 * 取得上市公司在外流通股數（用於計算周轉率）
 * 資料來源：TWSE OpenAPI t187ap03_L（上市公司基本資料）
 *
 * @returns {Promise<Object>} { '2330': 25930380, ... }  單位：張（1張=1000股）
 */
export async function fetchSharesOutstanding() {
  const path = '/opendata/t187ap03_L'
  try {
    const raw = await (import.meta.env.DEV
      ? axios.get(`${OPENAPI}${path}`, { timeout: 15000 }).then(r => r?.data ?? r)
      : proxyGet(`${_OPENAPI}${path}`))

    const map = {}
    for (const co of (Array.isArray(raw) ? raw : [])) {
      const code = co['公司代號']
      const sharesStr = co['已發行普通股數或TDR原股發行股數']
      if (!code || !sharesStr) continue
      const shares = parseNum(sharesStr)   // 單位：股
      if (shares > 0) map[code] = Math.round(shares / 1000)  // 轉換為張
    }
    return map
  } catch {
    return {}
  }
}

/**
 * 優先從快取取，找不到則回傳 null
 */
export function lookupStockBase(stockId) {
  return _fullStockMap[stockId] || null
}

/**
 * 取得單支股票的日K歷史資料（TWSE STOCK_DAY，本月每日OHLCV）
 * 盤後使用：計算連日漲跌（consecutiveTicks）和昨日量比（volumeVsYesterday）
 *
 * @param {string} stockId 股票代碼
 * @returns {Promise<{ id: string, days: { close, volume, change }[] }>}
 */
export async function fetchDailyHistory(stockId) {
  // STOCK_DAY 帶 date=今日 在盤中會得到 307（今日盤後資料尚未釋出）。
  // DEV：Vite proxy 碰到 307 → 被 WAF 封鎖頁面，直接跳過 www 走 openapi。
  // PROD：Cloudflare Worker 同樣會拿到 307 並透傳；先試 www，失敗再 fallback openapi。
  const todayParam = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const wwwPath    = `/rwd/zh/afterTrading/STOCK_DAY?stockNo=${stockId}&date=${todayParam}&response=json`

  // ── 嘗試 www（僅 PROD）───────────────────────────────────────
  let wwwResp = null
  if (!import.meta.env.DEV) {
    try {
      wwwResp = await proxyGet(`${_TWSE}${wwwPath}`)
    } catch { /* 失敗直接 fallback */ }
  }

  // ── 解析 www 結果 ─────────────────────────────────────────────
  if (wwwResp?.stat === 'OK' && Array.isArray(wwwResp.data)) {
    try {
      const fields  = wwwResp.fields || []
      const idx     = name => fields.indexOf(name)
      const iClose  = idx('收盤價'), iVol = idx('成交股數'), iChg = idx('漲跌價差')
      const rows = wwwResp.data
        .filter(r => r[iClose] && r[iClose] !== '--' && parseNum(r[iClose]) > 0)
        .map(r => ({
          close:  parseNum(r[iClose]),
          volume: Math.round(parseNum(r[iVol]) / 1000),  // 股→張
          change: parseNum(r[iChg]),
        }))
      return { id: stockId, days: rows }
    } catch { /* 解析失敗繼續 fallback */ }
  }

  // ── Fallback：openapi（DEV 直接走這裡；PROD www 307/失敗也走這裡）─
  try {
    const path = `/exchangeReport/STOCK_DAY?stockNo=${stockId}`
    const raw  = await (import.meta.env.DEV
      ? axios.get(`${OPENAPI}${path}`, { timeout: 10000 }).then(r => r?.data ?? r)
      : proxyGet(`${_OPENAPI}${path}`))
    const rows = (Array.isArray(raw) ? raw : [])
      .filter(r => r.ClosingPrice && r.ClosingPrice !== '--' && parseNum(r.ClosingPrice) > 0)
      .map(r => ({
        close:  parseNum(r.ClosingPrice),
        volume: parseNum(r.TradeVolume),
        change: parseNum(r.Change),
      }))
    return { id: stockId, days: rows }
  } catch {
    return { id: stockId, days: [] }
  }
}

/**
 * 批次查詢盤中即時報價（最多 20 支，使用 Cloudflare Worker Proxy）
 *
 * @param {string[]} stockIds 股票代碼陣列
 * @returns {Promise<RawQuote[]>} TWSE MIS msgArray
 */
export async function fetchBatchQuotes(stockIds) {
  if (!stockIds.length) return []

  // TWSE MIS 格式：tse_2330.tw|tse_2454.tw|...
  // 注意：| 不能 encode，TWSE 需要原始字元
  const query = stockIds.map(id => `tse_${id}.tw`).join('|')
  const url   = `${MIS}/getStockInfo.jsp?ex_ch=${query}&json=1&delay=0`

  try {
    const data = await proxyGet(url)
    return data?.msgArray || []
  } catch {
    return []   // 單批失敗不影響其他批次
  }
}
