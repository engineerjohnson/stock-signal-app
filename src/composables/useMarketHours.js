/**
 * 判斷目前是否為台股交易時間
 * 交易時間：週一至週五 09:00 ~ 13:30
 */
export function isMarketOpen() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false     // 六日休市
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 540 && minutes <= 810      // 09:00(540) ~ 13:30(810)
}

/**
 * 取得「量比時間修正因子」
 *
 * 傳統量比是「今日成交量 / 昨日同時段成交量」，但我們只有昨日全日量。
 * 修正公式：rawRatio × (全日分鐘數 / 已開盤分鐘數)
 *
 * 例：09:30（開盤30分鐘），因子 = 270/30 = 9
 * → 若 rawRatio = 0.3，time-adj 量比 = 2.7（代表以此時段強度來看是昨日2.7倍）
 *
 * 因子上限 12（開盤前 22.5 分鐘內），下限 1（收盤後）
 */
export function getVolumeTimeFactor() {
  const now = new Date()
  const minuteOfDay = now.getHours() * 60 + now.getMinutes()
  const elapsed = minuteOfDay - 540   // 距09:00過了幾分鐘
  if (elapsed <= 0) return 1          // 開盤前：不放大
  const factor = 270 / Math.max(1, elapsed)
  return Math.min(factor, 12)         // 上限12倍（避免開盤幾分鐘內極端值）
}

/**
 * 判斷是否為開盤前準備時段（08:00~09:00）
 */
export function isPreMarket() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 480 && minutes < 540
}

/**
 * 取得市場狀態文字與樣式
 * @returns {{ text: string, cls: string }}
 */
export function getMarketStatus() {
  if (isMarketOpen())   return { text: '盤中',   cls: 'bg-green-700 text-green-200' }
  if (isPreMarket())    return { text: '開盤前', cls: 'bg-yellow-700 text-yellow-200' }
  return                       { text: '收盤',   cls: 'bg-slate-600 text-slate-300' }
}
