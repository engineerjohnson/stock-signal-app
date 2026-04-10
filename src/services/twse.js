import axios from 'axios'
import { proxyGet } from './proxy.js'

const _OPENAPI = 'https://openapi.twse.com.tw/v1'
const MIS      = 'https://mis.twse.com.tw/stock/api'

// 開發模式下改走 Vite dev proxy，避免 CORS
const OPENAPI = import.meta.env.DEV
  ? _OPENAPI.replace('https://openapi.twse.com.tw', '/api/twse-openapi')
  : _OPENAPI

// 快取全部股票基礎資料，供自選股查詢用
let _fullStockMap = {}

/**
 * 解析含千分位逗號的數字字串
 */
function parseNum(str) {
  if (!str || str === '--') return 0
  return parseFloat(String(str).replace(/,/g, '')) || 0
}

/**
 * 初始化：取得掃描母池（前一日 Top N 活躍股）
 * 同時載入公司資本額（用於計算週轉率）
 *
 * @param {number} topN 取成交量前幾名（預設 100）
 * @returns {Promise<StockBase[]>}
 */
export async function fetchStockPool(topN = 100) {
  // 並行請求「昨日成交資料」與「公司資本額」
  const [dayAllRes, companiesRes] = await Promise.allSettled([
    axios.get(`${OPENAPI}/exchangeReport/STOCK_DAY_ALL`, { timeout: 15000 }),
    axios.get(`${OPENAPI}/company/companies`, { timeout: 15000 }),
  ])

  if (dayAllRes.status === 'rejected') {
    throw new Error('無法取得 TWSE STOCK_DAY_ALL：' + dayAllRes.reason?.message)
  }

  // 建立資本額對照表 { '2330': 25930380 }（張數）
  const sharesMap = {}
  if (companiesRes.status === 'fulfilled') {
    for (const c of (companiesRes.value.data || [])) {
      const code    = c.Code || c.CompanyCode
      const capital = parseNum(c.PaidInCapital || c.Capital || '0')
      if (code && capital > 0) {
        // 在外流通股數（張）= 資本額（元）/ 每股面值10元 / 1000（股/張）
        sharesMap[code] = capital / 10000
      }
    }
  }

  const allStocks = (dayAllRes.value.data || [])
    .filter(s => {
      if (!s.Code || !s.Name) return false
      if (!/^\d{4}$/.test(s.Code)) return false      // 只留 4 位數代碼
      const price = parseNum(s.ClosingPrice)
      const vol   = parseNum(s.TradeVolume)
      return price >= 10 && vol >= 500                // 排除低價股、冷門股
    })
    .map(s => {
      const close  = parseNum(s.ClosingPrice)
      const change = parseNum(s.Change)              // 昨日漲跌（元），可能負值
      const prevDayClose = close - change            // 前日收盤（供計算昨日漲跌%）
      const yesterdayChangePercent =
        prevDayClose > 0 ? (change / prevDayClose) * 100 : 0

      return {
        id:                    s.Code,
        name:                  s.Name,
        yesterdayVolume:       parseNum(s.TradeVolume),  // 昨日成交量（張）
        yesterdayClose:        close,                    // 昨日收盤
        yesterdayChange:       change,
        yesterdayChangePercent,                          // 昨日漲跌幅（%）
        sharesLots:            sharesMap[s.Code] || 0,  // 在外流通股數（張）
      }
    })

  // 建立全股票快取（自選股新增時用）
  _fullStockMap = {}
  for (const s of allStocks) _fullStockMap[s.id] = s

  return allStocks
    .sort((a, b) => b.yesterdayVolume - a.yesterdayVolume)
    .slice(0, topN)
}

/**
 * 查詢單支股票的基礎資料（自選股新增時用）
 * 優先從快取取，找不到則回傳 null
 */
export function lookupStockBase(stockId) {
  return _fullStockMap[stockId] || null
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
