/**
 * 計算連次
 * 從最新一筆成交往回數，連續同方向的價格變動次數。
 * 正數 = 連漲次數，負數 = 連跌次數。平盤略過，不中斷連次。
 *
 * @param {number[]} prices 由舊到新的成交價陣列
 * @returns {number}
 */
export function calcConsecutiveTicks(prices) {
  if (prices.length < 2) return 0

  // 從末端找最後一次有方向的變動，確定方向
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1; break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  // 從後往前數連續同方向次數（遇到反方向即停，平盤略過）
  let count = 0
  for (let i = prices.length - 1; i > 0; i--) {
    const diff = prices[i] - prices[i - 1]
    if (diff === 0) continue               // 平盤：略過但不中斷
    if (Math.sign(diff) === direction) count++
    else break
  }

  return direction * count
}

/**
 * 計算連量（當沖飆股神手定義）
 *
 * 連量 = 當前連次方向上「累積成交量」（單位：張）
 * 例：連漲 14 次共成交 1092 張 → 連量 = +1092
 *
 * @param {number[]} prices  由舊到新的成交價（每筆實際成交）
 * @param {number[]} volumes 與 prices 對應的每筆成交量 delta（張）
 *                           prices 可能比 volumes 多一筆（開盤前參考價）
 * @returns {number} 正 = 連漲累積張數，負 = 連跌累積張數，0 = 無方向
 */
export function calcConsecutiveVolume(prices, volumes) {
  if (prices.length < 2 || volumes.length === 0) return 0

  // prices 可能比 volumes 多一筆（開盤前還沒成交時的參考價）
  const offset = prices.length - volumes.length  // 0 或 1

  // 找當前方向
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1; break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  // 從末端往前，累加當前連次期間的每筆成交量
  let totalVol = 0
  for (let i = prices.length - 1; i > 0; i--) {
    const diff   = prices[i] - prices[i - 1]
    const volIdx = i - offset

    if (diff === 0) {
      if (volIdx >= 0 && volIdx < volumes.length) totalVol += volumes[volIdx]
      continue
    }

    if (Math.sign(diff) !== direction) break

    if (volIdx >= 0 && volIdx < volumes.length) totalVol += volumes[volIdx]
  }

  return direction * totalVol
}

// ── 篩選函式 ──────────────────────────────────────────────────────

/** 強勢股：連次 >= 門檻 且 今日漲 */
export function isStrong(stock, minTicks = 3) {
  return stock.consecutiveTicks >= minTicks && stock.changePercent > 0
}

/** 弱勢股：連次 <= -門檻 且 今日跌 */
export function isWeak(stock, minTicks = 3) {
  return stock.consecutiveTicks <= -minTicks && stock.changePercent < 0
}

/**
 * 量增價漲：今日成交量 >= 昨日 2 倍 + 今日漲幅 >= 1%
 * 代表有大量資金進場推升，門檻提高至 2x 避免早盤假信號
 */
export function isVolumeUp(stock) {
  return stock.changePercent >= 1 && stock.volumeVsYesterday >= 2
}

/**
 * 縮量上漲：今日成交量 < 昨日 0.7 倍 且 今日漲 且有一定成交量（> 200張）
 *
 * 正確定義：成交量萎縮但股價仍能上漲，代表籌碼穩定、惜售，
 * 是多方強勢整理的型態（非真正的「量縮整理」盤整，而是「縮量上漲」）。
 *
 * 注意：此指標用今日累積量 / 昨日總量，盤中早段因時間不足容易誤判，
 * 下午 12:00 後較為可靠。需同時有基本成交量確保流動性。
 */
export function isVolumeDown(stock) {
  return stock.changePercent >= 1 &&
    stock.volumeVsYesterday > 0 &&
    stock.volumeVsYesterday < 0.7 &&
    stock.volume >= 200  // 至少 200 張確保流動性
}

/**
 * 資金關注焦點：連次 >= 門檻 + 連漲方向有積量 + 今日漲
 * 代表有實際資金持續推動的連漲動能
 * 盤後日K模式：略過連量條件（日K無法計算 tick 連量）
 */
export function isCapitalFocus(stock, minTicks = 2) {
  return stock.consecutiveTicks >= minTicks &&
    (stock._dailyMode || stock.consecutiveVolume > 0) &&
    stock.changePercent > 0
}

/**
 * 大量換手：以「量比」取代週轉率（週轉率需股本資料，目前無來源）
 * 量比 >= 2.5x（今日累計量是昨日全日的 2.5 倍以上）+ 漲幅 > 0
 * 代表資金異常湧入，是當沖主力換手的常見特徵
 */
export function isHighTurnover(stock) {
  return stock.volumeVsYesterday >= 2.5 && stock.changePercent > 0
}

/**
 * 做多候選：今漲幅 >= 2% + 連漲 >= 2次 + 昨量比 >= 1.5x
 * 有價格動能 + 有向上連次 + 有量配合，盤中最佳做多標的
 */
export function isLongCandidate(stock) {
  return stock.changePercent >= 2 &&
    stock.consecutiveTicks >= 2 &&
    stock.volumeVsYesterday >= 1.5
}

/**
 * 做空候選：今跌幅 <= -2% + 連跌 >= 2次 + 昨量比 >= 1.5x
 * 有向下動能 + 有量配合，盤中當沖做空標的
 * （注意：實際下單需確認個股是否有融券/借券資格）
 */
export function isShortCandidate(stock) {
  return stock.changePercent <= -2 &&
    stock.consecutiveTicks <= -2 &&
    stock.volumeVsYesterday >= 1.5
}

export function isNearLimitUp(stock) {
  return stock.changePercent >= 9
}

/**
 * 崩跌跌停：跌幅 <= -9%（接近或達到跌停板）
 */
export function isNearLimitDown(stock) {
  return stock.changePercent <= -9
}

// ── 進階篩選 ──────────────────────────────────────────────────────

/**
 * 權證做多：適合買進「認購權證」的底層標的
 * 漲幅 1%~8%（空間還夠，不在漲停邊緣）+ 連漲≥2次 + 量比≥1.3x
 * 超過 8% 時認購權證 delta/gamma 異常，流動性差，不建議進場
 */
export function isWarrantLong(stock) {
  return stock.changePercent >= 1 &&
    stock.changePercent < 8 &&
    stock.consecutiveTicks >= 2 &&
    stock.volumeVsYesterday >= 1.3
}

/**
 * 主投買進股：有主力資金進場特徵（類機構買盤）
 * 連漲≥2次 + 連量≥200張（大資金介入）+ 今漲 + 量比≥1.5x
 * 連量≥200張代表在當前連次中累積買入至少200張，規模顯著
 */
export function isInstBuy(stock) {
  return stock.consecutiveTicks >= 2 &&
    stock.consecutiveVolume >= 200 &&
    stock.changePercent > 0 &&
    stock.volumeVsYesterday >= 1.5
}

/**
 * 主投買沿上：主力持續買進推升（逐步吸貨型）
 * 連漲≥5次（持續性強）+ 連量≥200張 + 漲≥1.5% + 量比≥1.3x
 * 「沿上」= 邊漲邊買，不是單次爆量，代表籌碼穩定積累
 */
export function isInstBuyUp(stock) {
  return stock.consecutiveTicks >= 5 &&
    stock.consecutiveVolume >= 200 &&
    stock.changePercent >= 1.5 &&
    stock.volumeVsYesterday >= 1.3
}

/**
 * 飆風向上股：盤中強勢爆發
 * 漲≥3% + 連漲≥3次 + 量比≥2.5x + 連量正向
 * 三重確認：價格、連次、量能同步上揚，是最強勢的當日飆股
 * 盤後日K模式：量比用昨日量/前日量替代，略過盤中連量條件
 */
export function isSurging(stock) {
  return stock.changePercent >= 3 &&
    stock.consecutiveTicks >= 3 &&
    stock.volumeVsYesterday >= 2.5 &&
    (stock._dailyMode || stock.consecutiveVolume > 0)
}

/**
 * 資金關注焦點（強版）：多重訊號共振
 * 漲≥2% + 連漲≥3次 + 連量≥300張 + 量比≥2x
 * 比資金焦點更嚴格：需同時滿足較強的價格動能、連次、連量、量比
 */
export function isCapitalAttention(stock) {
  return stock.changePercent >= 2 &&
    stock.consecutiveTicks >= 3 &&
    stock.consecutiveVolume >= 300 &&
    stock.volumeVsYesterday >= 2
}

/**
 * 大量換手高危：量能爆炸 + 已大漲 → 主力可能出貨
 * 量比≥3x + 漲幅≥5% → 「拉高出貨」的典型特徵
 * 適合短線注意反轉風險、或觀察是否繼續噴出
 */
export function isHighTurnoverRisk(stock) {
  return stock.volumeVsYesterday >= 3 &&
    stock.changePercent >= 5
}
