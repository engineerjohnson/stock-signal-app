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
 * 這與「連放量次數」完全不同，是衡量連漲/連跌期間
 * 有多少真實資金參與的指標。
 *
 * @param {number[]} prices  由舊到新的成交價（每筆實際成交）
 * @param {number[]} volumes 與 prices 對應的每筆成交量 delta（張）
 *                           prices 可能比 volumes 多一筆（開盤前參考價）
 * @returns {number} 正 = 連漲累積張數，負 = 連跌累積張數，0 = 無方向
 */
export function calcConsecutiveVolume(prices, volumes) {
  if (prices.length < 2 || volumes.length === 0) return 0

  // prices 可能比 volumes 多一筆（開盤前還沒成交時的參考價）
  // offset = 1 表示 prices[i] 對應 volumes[i-1]
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
    const volIdx = i - offset                    // 對應 volumes 的 index

    if (diff === 0) {
      // 平盤：仍屬於這段連次的量，但不計入 count
      if (volIdx >= 0 && volIdx < volumes.length) totalVol += volumes[volIdx]
      continue
    }

    if (Math.sign(diff) !== direction) break     // 反方向，連次中斷

    if (volIdx >= 0 && volIdx < volumes.length) totalVol += volumes[volIdx]
  }

  return direction * totalVol
}

/**
 * 強勢股：連次 >= 門檻 且 今日漲跌% > 0
 */
export function isStrong(stock, minTicks = 3) {
  return stock.consecutiveTicks >= minTicks && stock.changePercent > 0
}

/**
 * 弱勢股：連次 <= -門檻 且 今日漲跌% < 0
 */
export function isWeak(stock, minTicks = 3) {
  return stock.consecutiveTicks <= -minTicks && stock.changePercent < 0
}

/**
 * 資金關注焦點：連次 >= 門檻 + 有量（漲方向）
 * 代表有實際資金推動的連漲動能
 */
export function isCapitalFocus(stock, minTicks = 2) {
  return stock.consecutiveTicks >= minTicks &&
    stock.consecutiveVolume > 0 &&
    stock.changePercent > 0
}

/**
 * 大量換手高危：週轉率 >= 3% 且 昨量比 >= 2
 * 代表今天換手極度活躍，是當沖主力最愛的標的
 */
export function isHighTurnover(stock) {
  return stock.turnoverRate >= 3 && stock.volumeVsYesterday >= 2
}
