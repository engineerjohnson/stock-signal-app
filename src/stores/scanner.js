import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchStockPool, fetchBatchQuotes, lookupStockBase } from '@/services/twse.js'
import { calcConsecutiveTicks, calcConsecutiveVolume, isStrong, isWeak, isCapitalFocus, isHighTurnover } from '@/utils/indicators.js'
import { isMarketOpen } from '@/composables/useMarketHours.js'

const QUOTES_STORAGE_KEY = 'scanner_quotes_v2'

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

  // 排序狀態：field = 'consecutiveVolume' | 'consecutiveTicks' | 'changePercent' | 'turnoverRate' | 'yesterdayVolume'
  const sortField     = ref('consecutiveVolume')
  const sortAsc       = ref(false)   // false = 大到小（預設）

  // tick 歷史不需響應式，只用於計算
  const tickHistories = {}

  let scanTimer = null
  let scanning  = false   // 防止同時多個 doScan 並行

  // ── 共用排序函式 ──────────────────────────────────────────────
  function applySort(list) {
    const field = sortField.value
    const dir   = sortAsc.value ? 1 : -1
    return [...list].sort((a, b) => {
      const va = field === 'consecutiveVolume' || field === 'consecutiveTicks'
        ? Math.abs(a[field]) : a[field]
      const vb = field === 'consecutiveVolume' || field === 'consecutiveTicks'
        ? Math.abs(b[field]) : b[field]
      return (va - vb) * dir
    })
  }

  function setSort(field) {
    if (sortField.value === field) {
      sortAsc.value = !sortAsc.value   // 同欄位：切換升降序
    } else {
      sortField.value = field
      sortAsc.value   = false          // 換欄位：預設降序
    }
  }

  // ── Computed：盤中訊號清單 ────────────────────────────────────
  const signals = computed(() => {
    const all = Object.values(quotes.value)

    let filtered
    if (activeTab.value === 'strong') {
      filtered = all.filter(s => isStrong(s, threshold.value))
    } else if (activeTab.value === 'weak') {
      filtered = all.filter(s => isWeak(s, threshold.value))
    } else if (activeTab.value === 'capitalFocus') {
      filtered = all.filter(s => isCapitalFocus(s, threshold.value))
    } else if (activeTab.value === 'highTurnover') {
      filtered = all.filter(s => isHighTurnover(s))
    } else {
      filtered = all   // 全部：不篩選
    }

    return applySort(filtered)
  })

  // ── Computed：收盤模式——全部母池，套用相同排序 ───────────────
  const allPoolStocks = computed(() =>
    applySort(
      Object.values(quotes.value).filter(s => s.yesterdayVolume > 0)
    )
  )

  // ── Computed：推薦飆股（連量積量+連次+週轉率 綜合評分前20）─────
  const recommended = computed(() => {
    return Object.values(quotes.value)
      .filter(s =>
        s.consecutiveTicks  >= 2 &&
        s.consecutiveVolume > 0  &&   // 連漲方向有積量（單位：張）
        s.changePercent > 0 &&
        s.turnoverRate > 0
      )
      .map(s => ({
        ...s,
        // 用 sqrt 平衡大量股與小量股的得分差距
        _score: Math.sqrt(s.consecutiveVolume) * 3 + s.consecutiveTicks * 2 + s.turnoverRate * 0.5
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 20)
  })

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
      open:              0,
      recentPrices:      [],
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
    const isNewTick = hasPrice && totalVol > history.lastVol
    if (isNewTick) {
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
    const yesterdayVol       = base.yesterdayVolume || 0

    // 開盤價：第一筆真實成交即鎖定
    const open = (base.open && base.open !== base.yesterdayClose)
      ? base.open
      : (hasPrice && totalVol > 0 ? price : base.yesterdayClose || 0)

    // 即時走勢價格歷史（最多 40 筆，用於 sparkline）
    const recentPrices = isNewTick
      ? [...(base.recentPrices || []).slice(-39), price]
      : (base.recentPrices || [])

    // 只有在本次頁面生命週期裡累積了 >1 筆 tick 才重算；
    // 否則保留從 localStorage 恢復的值（收盤重開頁面後的主要場景）
    const consecutiveTicks = history.prices.length > 1
      ? calcConsecutiveTicks(history.prices)
      : (base.consecutiveTicks ?? 0)

    // 連量 = 連次方向上的「累積成交張數」（需同時傳入 prices 和 volumes）
    const consecutiveVolume = history.prices.length > 1 && history.volumes.length > 0
      ? calcConsecutiveVolume(history.prices, history.volumes)
      : (base.consecutiveVolume ?? 0)

    // lastDeltaVol：有新成交就用新值，否則保留舊值
    const lastDeltaVol = history.lastDelta || base.lastDeltaVol || 0

    // turnoverRate / volumeVsYesterday：totalVol 為 0 時保留舊值
    const finalTurnover = totalVol > 0 && sharesLots > 0
      ? (totalVol / sharesLots) * 100
      : (base.turnoverRate ?? 0)

    const finalVolRatio = totalVol > 0 && yesterdayVol > 0
      ? totalVol / yesterdayVol
      : (base.volumeVsYesterday ?? 0)

    quotes.value[id] = {
      ...base,
      price,
      open,
      recentPrices,
      prevClose,
      volume: totalVol,
      lastDeltaVol,
      changePercent,
      consecutiveTicks,
      consecutiveVolume,
      turnoverRate:      finalTurnover,
      volumeVsYesterday: finalVolRatio,
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
    recommended,
    threshold,
    activeTab,
    sortField,
    sortAsc,
    setSort,
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
