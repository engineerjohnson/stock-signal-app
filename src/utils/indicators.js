/**
 * 計算連次
 * 從最新一筆成交往回數，連續同方向的價格變動次數。
 * 正數 = 連漲次數，負數 = 連跌次數，平盤略過不計。
 *
 * @param {number[]} prices 由舊到新的成交價陣列
 * @returns {number}
 */
export function calcConsecutiveTicks(prices) {
  if (prices.length < 2) return 0

  // 找最後一次有方向的變動，確定 direction
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1; break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  // 從後往前數連續同方向次數（遇到反方向即停）
  let count = 0
  for (let i = prices.length - 1; i > 0; i--) {
    const diff = prices[i] - prices[i - 1]
    if (diff === 0) continue               // 平盤略過
    if (Math.sign(diff) === direction) count++
    else break
  }

  return direction * count
}

/**
 * 計算連量
 * 從最新一筆 tick 量往回數，連續同方向的量能變化次數。
 * 正數 = 連放量，負數 = 連縮量。
 *
 * @param {number[]} volumes 由舊到新的每 tick 成交量（非累積量）
 * @returns {number}
 */
export function calcConsecutiveVolume(volumes) {
  if (volumes.length < 2) return 0

  let direction = 0
  for (let i = volumes.length - 1; i > 0; i--) {
    if (volumes[i] > volumes[i - 1]) { direction = 1; break }
    if (volumes[i] < volumes[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  let count = 0
  for (let i = volumes.length - 1; i > 0; i--) {
    const diff = volumes[i] - volumes[i - 1]
    if (diff === 0) continue
    if (Math.sign(diff) === direction) count++
    else break
  }

  return direction * count
}

/**
 * 強勢股判斷
 * 連次 >= 門檻 且 今日漲跌% > 0
 */
export function isStrong(stock, minTicks = 3) {
  return stock.consecutiveTicks >= minTicks && stock.changePercent > 0
}

/**
 * 弱勢股判斷
 * 連次 <= -門檻 且 今日漲跌% < 0
 */
export function isWeak(stock, minTicks = 3) {
  return stock.consecutiveTicks <= -minTicks && stock.changePercent < 0
}
