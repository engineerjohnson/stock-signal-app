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
