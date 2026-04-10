import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchStockPool, fetchBatchQuotes, lookupStockBase, fetchDailyHistory, fetchSharesOutstanding } from '@/services/twse.js'
import { calcConsecutiveTicks, calcConsecutiveVolume, isStrong, isWeak, isVolumeUp, isVolumeDown, isCapitalFocus, isHighTurnover, isNearLimitUp, isNearLimitDown, isLongCandidate, isShortCandidate, isWarrantLong, isInstBuy, isInstBuyUp, isSurging, isCapitalAttention, isHighTurnoverRisk } from '@/utils/indicators.js'
import { isMarketOpen, getVolumeTimeFactor } from '@/composables/useMarketHours.js'

const QUOTES_STORAGE_KEY = 'scanner_quotes_v2'

function saveQuotes(quotesObj) {
  try {
    const payload = { ...quotesObj, _lastUpdate: new Date().toISOString() }
    localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(payload))
  } catch {}
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
  const activeTab   = ref('all') // 預設「全部」，確保初次/盤後開啟一定看得到資料
  const isLoading   = ref(false)
  const isInitialized = ref(false)
  const lastUpdate  = ref(null)
  const dataDate    = ref(null)    // STOCK_DAY_ALL 資料日期（例如 '2026/04/09'）
  const scanCount   = ref(0)       // 已完成掃描次數（前幾次資料不足）

  // 排序狀態
  // field: 'consecutiveVolume' | 'consecutiveTicks' | 'changePercent' | 'turnoverRate' | 'volumeVsYesterday' | 'volume'
  const sortField     = ref('consecutiveVolume')
  const sortAsc       = ref(false)   // false = 高→低（預設降序）

  // tick 歷史不需響應式，只用於計算
  const tickHistories = {}

  let scanTimer  = null
  let scanning   = false   // 防止同時多個 doScan 並行
  let _scanIds   = []      // 量前100的股票ID快取（pool 設定後填入，避免每3秒重排）

  // ── 共用排序函式 ──────────────────────────────────────────────
  function applySort(list) {
    const field = sortField.value
    const dir   = sortAsc.value ? 1 : -1
    return [...list].sort((a, b) => {
      // 連次/連量 以絕對值排序，弱勢股（負數）才不會排到最底
      const va = (field === 'consecutiveVolume' || field === 'consecutiveTicks')
        ? Math.abs(a[field]) : (a[field] ?? 0)
      const vb = (field === 'consecutiveVolume' || field === 'consecutiveTicks')
        ? Math.abs(b[field]) : (b[field] ?? 0)
      return (va - vb) * dir
    })
  }

  /**
   * 設定排序欄位，點同欄切換升降序，換欄位固定重設為降序
   * 這樣行為是：第一次點 = 高→低，再點同欄 = 低→高，再點 = 高→低...
   */
  function setSort(field) {
    if (sortField.value === field) {
      sortAsc.value = !sortAsc.value
    } else {
      sortField.value = field
      sortAsc.value   = false   // 換欄位：重設為降序（高→低）
    }
  }

  // ── Computed：盤中訊號清單 ────────────────────────────────────
  const signals = computed(() => {
    const all = Object.values(quotes.value)

    let filtered
    switch (activeTab.value) {
      case 'strong':       filtered = all.filter(s => isStrong(s, threshold.value));       break
      case 'weak':         filtered = all.filter(s => isWeak(s, threshold.value));         break
      case 'volumeUp':     filtered = all.filter(s => isVolumeUp(s));                      break
      case 'volumeDown':   filtered = all.filter(s => isVolumeDown(s));                    break
      case 'capitalFocus': filtered = all.filter(s => isCapitalFocus(s, threshold.value)); break
      case 'highTurnover': filtered = all.filter(s => isHighTurnover(s));                  break
      case 'longCandidate':      filtered = all.filter(s => isLongCandidate(s));      break
      case 'shortCandidate':     filtered = all.filter(s => isShortCandidate(s));     break
      case 'warrantLong':        filtered = all.filter(s => isWarrantLong(s));        break
      case 'instBuy':            filtered = all.filter(s => isInstBuy(s));            break
      case 'instBuyUp':          filtered = all.filter(s => isInstBuyUp(s));          break
      case 'surging':            filtered = all.filter(s => isSurging(s));            break
      case 'capitalAttention':   filtered = all.filter(s => isCapitalAttention(s));   break
      case 'highTurnoverRisk':   filtered = all.filter(s => isHighTurnoverRisk(s));   break
      case 'limitUp':      filtered = all.filter(s => isNearLimitUp(s));                   break
      case 'limitDown':    filtered = all.filter(s => isNearLimitDown(s));                 break
      default:             filtered = all  // 'all'：不篩選
    }

    return applySort(filtered)
  })

  // ── Computed：是否為日K模式（盤後從STOCK_DAY補充）────────────
  const isDailyMode = computed(() =>
    Object.values(quotes.value).some(s => s._dailyMode)
  )

  // ── Computed：收盤模式——全部母池，套用相同排序 ───────────────
  const allPoolStocks = computed(() =>
    applySort(
      Object.values(quotes.value).filter(s => s.yesterdayVolume > 0)
    )
  )

  // ── Computed：推薦飆股（連量積量+連次+量比 綜合評分前20）────────
  const recommended = computed(() => {
    return Object.values(quotes.value)
      .filter(s =>
        s.consecutiveTicks  >= 2 &&
        (s._dailyMode || s.consecutiveVolume > 0) &&  // 盤後日K模式略過連量條件
        s.changePercent > 0 &&
        s.volumeVsYesterday >= 1.5    // 有量確認
      )
      .map(s => ({
        ...s,
        // sqrt 平衡大小量股評分差距；量比加權，鼓勵量能爆發股
        // 日K模式 consecutiveVolume=0，改用 consecutiveTicks 補分
        _score: (s._dailyMode
          ? s.consecutiveTicks * 5
          : Math.sqrt(s.consecutiveVolume) * 3
        ) + s.consecutiveTicks * 2 + s.volumeVsYesterday * 2
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 20)
  })

  // ── 初始化 ────────────────────────────────────────────────────
  async function init() {
    if (isInitialized.value || isLoading.value) return   // 防止重複初始化
    isLoading.value = true

    try {
      const { stocks, dataDate: apiDataDate } = await fetchStockPool()   // 全部符合條件的股票（約500支）
      pool.value = stocks
      if (apiDataDate) dataDate.value = apiDataDate

      // 預先計算盤中 MIS 掃描用的量前100股票ID，避免每次掃描重排
      _scanIds = [...stocks]
        .sort((a, b) => b.yesterdayVolume - a.yesterdayVolume)
        .slice(0, 100)
        .map(s => s.id)

      // 以昨日資料填入初始 quotes
      const newQuotes = {}
      for (const s of stocks) {
        newQuotes[s.id] = buildInitialQuote(s)
        tickHistories[s.id] = { prices: [], volumes: [], lastVol: 0, lastDelta: 0 }
      }

      // 不論盤中或盤後，都嘗試讀取 localStorage 快照
      // 盤中：只補連次/連量等 tick 計算值（且只用今日資料，避免昨日連次誤導即時判斷）
      // 盤後：
      //   今日資料 → 完整覆蓋（保留盤中連次/連量等計算值）
      //   非今日資料 → 只補 tick 計算值，price/volume/changePercent 用新 STOCK_DAY_ALL 資料
      //   ⚠️ 不能讓昨日盤中 price/volume 蓋掉今日 STOCK_DAY_ALL 的收盤資料
      const saved = loadQuotes()
      if (saved) {
        const marketOpen = isMarketOpen()
        const savedDate = saved._lastUpdate ? new Date(saved._lastUpdate).toDateString() : null
        const isTodayData = savedDate === new Date().toDateString()

        for (const id of Object.keys(newQuotes)) {
          if (!saved[id]) continue
          if (marketOpen) {
            // 盤中：只保留今日的 tick 計算值，price/changePercent 由即時 API 更新
            if (isTodayData) {
              newQuotes[id] = {
                ...newQuotes[id],
                consecutiveTicks:  saved[id].consecutiveTicks  ?? 0,
                consecutiveVolume: saved[id].consecutiveVolume ?? 0,
                recentPrices:      saved[id].recentPrices      ?? [],
              }
            }
          } else if (isTodayData) {
            // 盤後 + 今日資料（今日曾盤中掃描過）：完整覆蓋，保留連次/連量等
            newQuotes[id] = { ...newQuotes[id], ...saved[id] }
          } else {
            // 盤後 + 非今日資料：只補 tick 計算值
            // price/volume/changePercent 保留 STOCK_DAY_ALL 的最新收盤資料
            newQuotes[id] = {
              ...newQuotes[id],
              consecutiveTicks:  saved[id].consecutiveTicks  ?? 0,
              consecutiveVolume: saved[id].consecutiveVolume ?? 0,
              // recentPrices 不恢復（昨日走勢線對今日無意義）
            }
          }
        }

        // 盤後 + 今日資料：還原上次更新時間（顯示資料來源的時間點）
        if (!marketOpen && isTodayData && saved._lastUpdate) {
          lastUpdate.value = new Date(saved._lastUpdate)
        }
      }

      quotes.value = newQuotes
      isInitialized.value = true

      // 背景載入在外流通股數（周轉率分母），不阻塞畫面
      fetchSharesOutstanding().then(sharesMap => {
        if (!Object.keys(sharesMap).length) return
        // 更新 pool 和 quotes 的 sharesLots，並重新計算初始 turnoverRate
        for (const s of pool.value) {
          if (sharesMap[s.id]) s.sharesLots = sharesMap[s.id]
        }
        for (const id of Object.keys(quotes.value)) {
          const lots = sharesMap[id]
          if (!lots) continue
          const q = quotes.value[id]
          quotes.value[id] = {
            ...q,
            sharesLots: lots,
            // 若尚未有即時成交量則用昨日量計算初始 turnoverRate
            turnoverRate: q.turnoverRate > 0
              ? q.turnoverRate
              : (q.volume > 0 ? (q.volume / lots) * 100 : 0),
          }
        }
        console.info('[Scanner] 在外流通股數載入完成')
      }).catch(() => {})   // 取得失敗不影響主流程

      // 盤後：呼叫日K API，補充連次/量比（讓各tab盤後有資料可篩選）
      // 若已有今日 localStorage 快照（今日曾盤中掃描過），跳過日K補充
      if (!isMarketOpen()) {
        const savedDate = saved?._lastUpdate ? new Date(saved._lastUpdate).toDateString() : null
        const hasTodaySnapshot = savedDate === new Date().toDateString()
        if (!hasTodaySnapshot) {
          // 不 await，在背景載入，不阻塞畫面渲染
          loadAfterHoursHistory()
        }
      }

      startScan()
    } catch (e) {
      console.error('[Scanner] 初始化失敗', e)
    } finally {
      isLoading.value = false
    }
  }

  function buildInitialQuote(base) {
    const sharesLots = base.sharesLots || 0
    return {
      ...base,
      price:             base.yesterdayClose,
      open:              base.yesterdayOpen  || base.yesterdayClose,
      recentPrices:      [],
      // 盤後初始值：用昨日資料填充，盤中會被即時 API 覆蓋
      changePercent:     base.yesterdayChangePercent || 0,
      volume:            base.yesterdayVolume || 0,   // 讓成交量欄位顯示昨日量
      lastDeltaVol:      0,
      consecutiveTicks:  0,
      consecutiveVolume: 0,
      // 初始周轉率：若已有 sharesLots，用昨日量計算；盤中會被即時量覆蓋
      turnoverRate:      sharesLots > 0 ? (base.yesterdayVolume / sharesLots) * 100 : 0,
      // dayVolumeRatio：跨日靜態量比（昨日量/前日量），盤後有參考值；盤中被即時值覆蓋
      volumeVsYesterday: base.dayVolumeRatio || 0,
      isNew:             false,
    }
  }

  // ── 盤後日K補充（連次/量比） ─────────────────────────────────
  /**
   * 盤後：平行呼叫 STOCK_DAY API 取本月每日收盤資料。
   * 利用日K計算：
   *   - consecutiveTicks：連日漲跌次數（用於強勢/弱勢/做多/做空等 tab）
   *   - volumeVsYesterday：昨日量 / 前日量（用於量增/換手 tab）
   *
   * 注意：consecutiveVolume 日K版本無意義（量級差100x），保留為 0。
   * 若已有今日盤中 localStorage 快照，此函式不會被呼叫（見 init()）。
   */
  async function loadAfterHoursHistory() {
    // 使用已快取的掃描ID（量前100 + 自選股），避免重新排序整個pool
    const ids = _scanIds.length
      ? _scanIds
      : [...pool.value].sort((a, b) => b.yesterdayVolume - a.yesterdayVolume).slice(0, 100).map(s => s.id)
    if (!ids.length) return

    // 並行取日K，失敗單股不影響其他
    const results = await Promise.allSettled(ids.map(id => fetchDailyHistory(id)))

    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const { id, days } = r.value
      if (!quotes.value[id] || days.length < 2) continue

      const prices = days.map(d => d.close)
      const consecutiveTicks = calcConsecutiveTicks(prices)

      // 昨日量 / 前日量（最後兩個交易日）
      const lastVol = days[days.length - 1].volume
      const prevVol = days[days.length - 2].volume
      const volumeVsYesterday = prevVol > 0 ? lastVol / prevVol : 0

      quotes.value[id] = {
        ...quotes.value[id],
        consecutiveTicks,
        volumeVsYesterday,
        _dailyMode: true,   // 標記為日K模式，讓 UI 可顯示提示
      }
    }

    lastUpdate.value = new Date()
    saveQuotes(quotes.value)   // 持久化日K資料，避免刷新頁面重新請求100支API
    console.info('[Scanner] 盤後日K補充完成，使用連日漲跌作為連次')
  }

  // ── 輪詢控制 ──────────────────────────────────────────────────
  function startScan() {
    if (scanTimer) return
    // 盤中才立即掃描並輪詢；盤後直接顯示 localStorage 資料（MIS 盤後 z='-'，無法更新連次/連量）
    if (isMarketOpen()) doScan()
    scanTimer = setInterval(() => {
      if (isMarketOpen()) doScan()
    }, 3000)
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
      // 盤中 MIS 只掃量前100大（避免500支全打造成每3秒25批並行請求）
      // 漲跌停等極端股票通常量也大，量前100已涵蓋大部分訊號
      const ids = _scanIds.length ? _scanIds : [...pool.value]
        .sort((a, b) => b.yesterdayVolume - a.yesterdayVolume)
        .slice(0, 100)
        .map(s => s.id)
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

    // z = '-' 表示今日尚未成交（或盤後 MIS 已清除即時報價）
    // 此時直接 return，保留已從 localStorage 恢復的 price/changePercent/consecutiveTicks 等，
    // 避免用昨收覆蓋掉今日正確的收盤資料
    const rawZ    = raw.z
    const hasPrice = rawZ && rawZ !== '-' && rawZ !== ''
    if (!hasPrice) return

    const price = parseFloat(rawZ)
    if (price <= 0) return

    const totalVol = parseInt(raw.v) || 0
    const history  = tickHistories[id]

    // 只在有新成交（累積量增加）時更新 tick 歷史
    const isNewTick = totalVol > history.lastVol
    if (isNewTick) {
      const delta = totalVol - history.lastVol

      // 限制歷史陣列最大長度，避免長時間交易後記憶體無限增長
      if (history.prices.length >= 500) {
        history.prices.shift()
        history.volumes.shift()
      }
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

    // 開盤價：以「是否已記錄到第一筆真實成交」為準，不比較價格
    // 避免開盤=昨收時條件判斷失效
    const open = base._openLocked
      ? base.open
      : (totalVol > 0 ? price : base.yesterdayClose || 0)

    // 即時走勢價格歷史（最多 150 筆 ≈ 7.5分鐘，用於 sparkline）
    const recentPrices = isNewTick
      ? [...(base.recentPrices || []).slice(-149), price]
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

    // volumeVsYesterday（時間修正量比）：乘以時間因子讓早盤/尾盤數值可比
    // 例：09:30 因子=9，若 rawRatio=0.3 → 時間修正量比=2.7（代表此時段強度是昨日2.7倍）
    // 盤後：因子=1（不放大，直接用當日收盤時的最終比值）
    const finalVolRatio = (() => {
      if (totalVol <= 0 || yesterdayVol <= 0) return base.volumeVsYesterday ?? 0
      const rawRatio  = totalVol / yesterdayVol
      const factor    = isMarketOpen() ? getVolumeTimeFactor() : 1
      return rawRatio * factor
    })()

    quotes.value[id] = {
      ...base,
      price,
      open,
      _openLocked: base._openLocked || totalVol > 0,  // 一旦有成交就鎖定
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

    // 自選股一律加入掃描 ID 清單，確保盤中能取得即時 MIS 資料
    if (!_scanIds.includes(stockId)) _scanIds.push(stockId)
  }

  function removeFromPool(stockId) {
    pool.value = pool.value.filter(s => s.id !== stockId)
    delete quotes.value[stockId]
    delete tickHistories[stockId]
    _scanIds = _scanIds.filter(id => id !== stockId)
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
    isDailyMode,
    threshold,
    activeTab,
    sortField,
    sortAsc,
    setSort,
    applySort,
    isLoading,
    isInitialized,
    lastUpdate,
    dataDate,
    scanCount,
    init,
    startScan,
    stopScan,
    addToPool,
    removeFromPool,
    getStock,
  }
})
