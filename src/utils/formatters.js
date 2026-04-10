/**
 * 格式化股價（依照大小自動決定小數位數）
 */
export function fmtPrice(n) {
  if (n == null || isNaN(n) || n === 0) return '--'
  if (n >= 1000) return n.toFixed(0)
  if (n >= 100)  return n.toFixed(1)
  return n.toFixed(2)
}

/**
 * 格式化漲跌幅，含正負號
 * 例：+2.11%  -1.50%
 */
export function fmtPercent(n) {
  if (n == null || isNaN(n)) return '--'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

/**
 * 格式化倍率（昨日量比）
 * 例：1.20x  0.85x
 */
export function fmtRatio(n) {
  if (n == null || isNaN(n) || n === 0) return '--'
  return `${n.toFixed(2)}x`
}

/**
 * 格式化週轉率（百分比）
 * 例：0.17%
 */
export function fmtTurnover(n) {
  if (n == null || isNaN(n) || n === 0) return '--'
  return `${n.toFixed(2)}%`
}

/**
 * 格式化成交量（加千分位）
 */
export function fmtVolume(n) {
  if (n == null || isNaN(n) || n === 0) return '--'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}萬`
  return n.toLocaleString()
}

// ── 顏色 class（台股：漲=紅，跌=綠）──────────────────

/** 現價、漲跌幅、昨日漲幅 顏色 */
export function changeColor(n) {
  if (!n || n === 0) return 'text-slate-300'
  return n > 0 ? 'text-red-400' : 'text-green-400'
}

/** 連次 顏色（連漲=紅，連跌=綠） */
export function tickColor(n) {
  if (!n || n === 0) return 'text-slate-400'
  return n > 0 ? 'text-red-400' : 'text-green-400'
}

/** 連量 顏色（放量=橘，縮量=藍） */
export function volColor(n) {
  if (!n || n === 0) return 'text-slate-400'
  return n > 0 ? 'text-orange-400' : 'text-blue-400'
}

/** 昨日量比 顏色（> 1.5 倍=橘，< 0.7 倍=藍，其餘灰） */
export function ratioColor(n) {
  if (!n || n === 0) return 'text-slate-400'
  if (n >= 1.5) return 'text-orange-400'
  if (n < 0.7)  return 'text-blue-400'
  return 'text-slate-300'
}

/** 連次標籤文字（中文）*/
export function fmtTick(n) {
  if (n === 0) return '－'
  return n > 0 ? `連漲${n}次` : `連跌${Math.abs(n)}次`
}

/** 連量標籤文字（中文）*/
export function fmtVol(n) {
  if (n === 0) return '－'
  return n > 0 ? `放量${n}次` : `縮量${Math.abs(n)}次`
}

/** 每筆 tick 量（張）*/
export function fmtDeltaVol(n) {
  if (!n || n === 0) return '--'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千張`
  return `${n}張`
}
