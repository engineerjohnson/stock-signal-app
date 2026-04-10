import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchStockPool, fetchBatchQuotes, lookupStockBase } from '@/services/twse.js'
import { calcConsecutiveTicks, calcConsecutiveVolume, isStrong, isWeak } from '@/utils/indicators.js'
import { isMarketOpen } from '@/composables/useMarketHours.js'

const QUOTES_STORAGE_KEY = 'scanner_quotes_v1'

function saveQuotes(quotesObj) {
  try { localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotesObj)) } catch {}
}

function loadQuotes() {
  try { return JSON.parse(localStorage.getItem(QUOTES_STORAGE_KEY) || 'null') } catch { return null }
}

/** 將陣列切成每份 size 個的 chunks */
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export const useScannerStore = defineStore('scanner', () => {
  // ── 狀態 ────────────────────────────────────────────────────────
  const pool        = ref([])      // 掃描母池（基礎靜態資料）
  const quotes      = ref({})      // 即時報價快取 { '2330': StockData }
  const threshold   = ref(3)       // 連次觸發門檻（2 / 3 / 5）
  const activeTab   = ref('strong')// 'strong' | 'weak' | 'all'
  const isLoading   = ref(false)
  const isInitialized = ref(false)
  const lastUpdate  = ref(null)
  const scanCount   = ref(0)       // 已完成掃描次數（前幾次資料不足）

  // tick 歷史不需響應式，只用於計算
  const tickHistories = {}

  let scanTimer = null
  let scanning  = false   // 防止同時多個 doScan 並行

  // ── Computed：盤中訊號清單 ────────────────────────────────────
  const signals = computed(() => {
    const all = Object.values(quotes.value)

    let filtered
    if (activeTab.value === 'strong') {
      filtered = all.filter(s => isStrong(s, threshold.value))
    } else if (activeTab.value === 'weak') {
      filtered = all.filter(s => isWeak(s, threshold.value))
    } else {
      filtered = all.filter(s =>
        Math.abs(s.consecutiveTicks)  >= threshold.value ||
        Math.abs(s.consecutiveVolume) >= threshold.value
      )
    }

    return filtered.sort((a, b) => {
      const va = Math.abs(a.consecutiveVolume), vb = Math.abs(b.consecutiveVolume)
      if (vb !== va) return vb - va
      const ta = Math.abs(a.consecutiveTicks),  tb = Math.abs(b.consecutiveTicks)
      if (tb !== ta) return tb - ta
      return Math.abs(b.changePercent) - Math.abs(a.changePercent)
    })
  })

  // ── Computed：收盤模式——依連量 → 連次 → 昨日量 排序 ──────────
  const allPoolStocks = computed(() =>
    Object.values(quotes.value)
      .filter(s => s.yesterdayVolume > 0)
      .sort((a, b) => {
        const va = Math.abs(a.consecutiveVolume), vb = Math.abs(b.consecutiveVolume)
        if (vb !== va) return vb - va
        const ta = Math.abs(a.consecutiveTicks),  tb = Math.abs(b.consecutiveTicks)
        if (tb !== ta) return tb - ta
        return b.yesterdayVolume - a.yesterdayVolume
      })
  )

  // ── 初始化 ────────────────────────────────────────────────────
  async function init() {
    if (isInitialized.value || isLoading.value) return   // 防止重複初始化
    isLoading.value = true

    try {
      const stocks = await fetchStockPool(100)
      pool.value = stocks

      // 以昨日資料填入初始 quotes
      const newQuotes = {}
      for (const s of stocks) {
        newQuotes[s.id] = buildInitialQuote(s)
        tickHistories[s.id] = { prices: [], volumes: [], lastVol: 0, lastDelta: 0 }
      }

      // 收盤時，用上次儲存的掃描快照覆蓋（保留連量連次週轉率）
      if (!isMarketOpen()) {
        const saved = loadQuotes()
        if (saved) {
          for (const id of Object.keys(newQuotes)) {
            if (saved[id]) newQuotes[id] = { ...newQuotes[id], ...saved[id] }
          }
        }
      }

      quotes.value = newQuotes

      isInitialized.value = true
      startScan()
    } catch (e) {
      console.error('[Scanner] 初始化失敗', e)
    } finally {
      isLoading.value = false
    }
  }

  function buildInitialQuote(base) {
    return {
      ...base,
      price:             base.yesterdayClose,
      changePercent:     0,
      volume:            0,
      lastDeltaVol:      0,
      consecutiveTicks:  0,
      consecutiveVolume: 0,
      turnoverRate:      0,
      volumeVsYesterday: 0,
      isNew:             false,
    }
  }

  // ── 輪詢控制 ──────────────────────────────────────────────────
  function startScan() {
    if (scanTimer) return
    doScan()  // 立即執行一次
    scanTimer = setInterval(() => {
      if (isMarketOpen()) doScan()
    }, 1000)
  }

  function stopScan() {
    clearInterval(scanTimer)
    scanTimer = null
  }

  // ── 掃描主邏輯 ────────────────────────────────────────────────
  async function doScan() {
    if (scanning || !pool.value.length) return
    scanning = true

    try {
      const ids     = pool.value.map(s => s.id)
      const batches = chunk(ids, 20)

      // 記錄本次掃描前的訊號 id，用於偵測新出現
      const prevIds = new Set(signals.value.map(s => s.id))

      // 5 批平行請求
      const results = await Promise.allSettled(
        batches.map(b => fetchBatchQuotes(b))
      )

      for (const res of results) {
        if (res.status !== 'fulfilled') continue
        for (const raw of res.value) updateQuote(raw)
      }

      // 標記剛進入訊號清單的股票（閃爍動畫）
      for (const s of signals.value) {
        if (!prevIds.has(s.id) && quotes.value[s.id] && !quotes.value[s.id].isNew) {
          quotes.value[s.id] = { ...quotes.value[s.id], isNew: true }
          setTimeout(() => {
            if (quotes.value[s.id]) {
              quotes.value[s.id] = { ...quotes.value[s.id], isNew: false }
            }
          }, 4000)
        }
      }

      scanCount.value++
      lastUpdate.value = new Date()
      saveQuotes(quotes.value)   // 每次掃描後持久化，收盤後重開頁面仍可讀取
    } finally {
      scanning = false
    }
  }

  // ── 更新單支股票報價 ──────────────────────────────────────────
  function updateQuote(raw) {
    const id = raw.c
    if (!quotes.value[id] || !tickHistories[id]) return

    // z = '-' 表示今日尚未成交，使用昨收作為顯示價格但不更新歷史
    const rawZ    = raw.z
    const hasPrice = rawZ && rawZ !== '-' && rawZ !== ''
    const price    = hasPrice ? parseFloat(rawZ) : parseFloat(raw.y) || 0
    if (price <= 0) return

    const totalVol = parseInt(raw.v) || 0
    const history  = tickHistories[id]

    // 只在有新成交（累積量增加）時更新 tick 歷史
    if (hasPrice && totalVol > history.lastVol) {
      const delta = totalVol - history.lastVol

      history.prices.push(price)
      history.volumes.push(delta)
      history.lastDelta = delta   // 記錄最新一筆 tick 量（張）

      history.lastVol = totalVol
    } else if (history.prices.length === 0 && price > 0) {
      // 尚未成交，先記錄一筆開盤前參考價
      history.prices.push(price)
    }

    const base           = quotes.value[id]
    const prevClose      = parseFloat(raw.y) || base.yesterdayClose || 0
    const changePercent  = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0

    const sharesLots         = base.sharesLots || 0
    const turnoverRate       = sharesLots > 0 ? (totalVol / sharesLots) * 100 : 0

    const yesterdayVol       = base.yesterdayVolume || 0
    const volumeVsYesterday  = yesterdayVol > 0 ? totalVol / yesterdayVol : 0

    const consecutiveTicks   = calcConsecutiveTicks(history.prices)
    const consecutiveVolume  = calcConsecutiveVolume(history.volumes)

    quotes.value[id] = {
      ...base,
      price,
      prevClose,
      volume: totalVol,
      lastDeltaVol: history.lastDelta || 0,  // 最新一筆 tick 成交量（張）
      changePercent,
      consecutiveTicks,
      consecutiveVolume,
      turnoverRate,
      volumeVsYesterday,
    }
  }

  // ── 自選股動態加入母池 ────────────────────────────────────────
  function addToPool(stockId) {
    if (quotes.value[stockId]) return  // 已在母池中

    const base = lookupStockBase(stockId) || {
      id:                    stockId,
      name:                  stockId,
      yesterdayVolume:       0,
      yesterdayClose:        0,
      yesterdayChange:       0,
      yesterdayChangePercent: 0,
      sharesLots:            0,
    }

    quotes.value[stockId] = buildInitialQuote(base)
    pool.value = [...pool.value, base]
    tickHistories[stockId] = { prices: [], volumes: [], lastVol: 0, lastDelta: 0 }
  }

  function removeFromPool(stockId) {
    pool.value = pool.value.filter(s => s.id !== stockId)
    delete quotes.value[stockId]
    delete tickHistories[stockId]
  }

  function getStock(id) {
    return quotes.value[id] || null
  }

  return {
    pool,
    quotes,
    signals,
    allPoolStocks,
    threshold,
    activeTab,
    isLoading,
    isInitialized,
    lastUpdate,
    scanCount,
    init,
    startScan,
    stopScan,
    addToPool,
    removeFromPool,
    getStock,
  }
})
