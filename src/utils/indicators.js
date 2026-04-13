// ── 技術指標計算 ──────────────────────────────────────────────────

/**
 * 計算 MA20（20日移動平均收盤價）
 * @param {number[]} closes 由舊到新的收盤價陣列（需至少20筆）
 * @returns {number|null}
 */
export function calcMA20(closes) {
  if (!closes || closes.length < 20) return null
  const last20 = closes.slice(-20)
  return last20.reduce((a, b) => a + b, 0) / 20
}

/**
 * 計算布林通道（Bollinger Bands, 20期 ±2σ）
 * @param {number[]} closes 由舊到新的收盤價陣列（需至少20筆）
 * @returns {{ upper, middle, lower, std, width }|null}
 *   width = 4σ / middle（開口相對寬度，越大代表波動越劇烈）
 */
export function calcBollinger(closes) {
  if (!closes || closes.length < 20) return null
  const last20   = closes.slice(-20)
  const middle   = last20.reduce((a, b) => a + b, 0) / 20
  const variance = last20.reduce((sum, c) => sum + (c - middle) ** 2, 0) / 20
  const std      = Math.sqrt(variance)
  return {
    upper:  middle + 2 * std,
    middle,
    lower:  middle - 2 * std,
    std,
    width:  std > 0 ? (4 * std) / middle : 0,
  }
}

/**
 * 計算月線斜率（今日MA20 − 5日前MA20）
 * > 0 = 多頭上揚，< 0 = 空頭下彎
 * @param {number[]} closes 由舊到新的收盤價（需至少25筆）
 * @returns {number|null}
 */
export function calcMA20Slope(closes) {
  if (!closes || closes.length < 25) return null
  const todayMA20      = closes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const fiveDaysAgoMA20 = closes.slice(-25, -5).reduce((a, b) => a + b, 0) / 20
  return todayMA20 - fiveDaysAgoMA20
}

// ── 連次 ──────────────────────────────────────────────────────────

/**
 * 計算連次（連續攻擊次數）
 *
 * 從最新一筆成交往回數，連續同方向的價格變動次數。
 * 正數 = 連漲次數，負數 = 連跌次數。平盤略過，不中斷連次。
 *
 * ⚠️ 注意：TWSE MIS 與 Fugle API 目前均不提供逐筆主動買/賣方向，
 * 此處以「價格方向」近似（外盤≈漲、內盤≈跌）。
 *
 * @param {number[]} prices 由舊到新的成交價陣列
 * @returns {number}
 */
export function calcConsecutiveTicks(prices) {
  if (prices.length < 2) return 0

  // 從末端找最後一次有方向的變動，確定方向
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1;  break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  // 從後往前數連續同方向次數（遇到反方向即停，平盤略過）
  let count = 0
  for (let i = prices.length - 1; i > 0; i--) {
    const diff = prices[i] - prices[i - 1]
    if (diff === 0) continue
    if (Math.sign(diff) === direction) count++
    else break
  }

  return direction * count
}

// ── 連量 ──────────────────────────────────────────────────────────

/**
 * 計算連量
 *
 * 有時間戳記（Fugle 逐筆）→ 取最近 30 秒同方向成交量總和
 * 無時間戳記（TWSE MIS）  → 取當前連次期間的累積成交量（fallback）
 *
 * @param {number[]} prices    由舊到新的成交價
 * @param {number[]} volumes   每筆成交量 delta（張），prices 可能多一筆開盤前參考價
 * @param {number[]} [timestamps] 每筆成交的 ms 時間戳記（與 volumes 對應，可選）
 * @returns {number} 正 = 連漲累積張數，負 = 連跌累積張數，0 = 無方向
 */
export function calcConsecutiveVolume(prices, volumes, timestamps = null) {
  if (prices.length < 2 || volumes.length === 0) return 0

  // prices 可能比 volumes 多一筆（開盤前還沒成交時的參考價）
  const offset = prices.length - volumes.length  // 0 或 1

  // 找當前方向
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1;  break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  // ── 30 秒滾動視窗（Fugle 逐筆有時間戳記時使用）────────────────
  if (timestamps && timestamps.length > 0) {
    const now    = timestamps[timestamps.length - 1]
    const cutoff = now - 30_000  // 30 秒前
    let total = 0

    for (let i = prices.length - 1; i > 0; i--) {
      const volIdx = i - offset
      if (volIdx < 0 || volIdx >= volumes.length) continue

      const ts = timestamps[volIdx] ?? 0
      if (ts < cutoff) break  // 超過 30 秒視窗，不再往前累加

      const diff    = prices[i] - prices[i - 1]
      // 平盤沿用當前連次方向；反向不計入
      const thisDir = diff > 0 ? 1 : diff < 0 ? -1 : direction
      if (thisDir === direction) total += volumes[volIdx]
    }

    return direction * total
  }

  // ── 連次期間累積量（TWSE MIS fallback，無時間戳記）──────────────
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

// ── 基礎篩選 ──────────────────────────────────────────────────────

/** 強勢股：連次 >= 門檻 且 今日漲 */
export function isStrong(stock, minTicks = 3) {
  return stock.consecutiveTicks >= minTicks && stock.changePercent > 0
}

/** 弱勢股：連次 <= -門檻 且 今日跌 */
export function isWeak(stock, minTicks = 3) {
  return stock.consecutiveTicks <= -minTicks && stock.changePercent < 0
}

/**
 * 量增價漲：漲幅 >= 1% + 均量比 >= 2x
 * （均量比以昨日全日量為基準，盤中早段因時間比例放大，12:00後較可靠）
 */
export function isVolumeUp(stock) {
  return stock.changePercent >= 1 && stock.volumeVsYesterday >= 2
}

/**
 * 縮量上漲：漲幅 >= 1% + 量比 0~0.7x + 成交量 >= 200張
 * 籌碼穩定惜售型態，下午12:00後較可靠
 */
export function isVolumeDown(stock) {
  return stock.changePercent >= 1 &&
    stock.volumeVsYesterday > 0 &&
    stock.volumeVsYesterday < 0.7 &&
    stock.volume >= 200
}

/**
 * 資金關注焦點（Tab 3-B）
 * 均量比 > 1.5x + 週轉率 > 5%（資金異常活躍，已有股本資料才計算）
 *
 * 原始需求：成交金額前20% + 均量比>1.5 + 週轉率>5%
 * 「成交金額前20%」依賴全市場動態排行，改以 週轉率>5% 替代門檻，
 * 效果等同：週轉高代表相對成交金額也大。
 */
export function isCapitalFocus(stock) {
  return stock.volumeVsYesterday > 1.5 &&
    stock.turnoverRate > 5 &&
    stock.changePercent > 0
}

/**
 * 大量換手：均量比 >= 2.5x + 今日漲
 * 資金異常湧入，當沖主力換手常見特徵
 */
export function isHighTurnover(stock) {
  return stock.volumeVsYesterday >= 2.5 && stock.changePercent > 0
}

/**
 * 做多候選：漲幅 >= 2% + 連漲 >= 2次 + 量比 >= 1.5x
 */
export function isLongCandidate(stock) {
  return stock.changePercent >= 2 &&
    stock.consecutiveTicks >= 2 &&
    stock.volumeVsYesterday >= 1.5
}

/**
 * 做空候選：跌幅 <= -2% + 連跌 >= 2次 + 量比 >= 1.5x
 */
export function isShortCandidate(stock) {
  return stock.changePercent <= -2 &&
    stock.consecutiveTicks <= -2 &&
    stock.volumeVsYesterday >= 1.5
}

export function isNearLimitUp(stock) {
  return stock.changePercent >= 9
}

export function isNearLimitDown(stock) {
  return stock.changePercent <= -9
}

// ── 進階篩選（Tab 1 強勢） ────────────────────────────────────────

/**
 * 權證做多（Tab 1-A）
 *
 * 條件（依規格書）：
 *   漲幅 +2%~+9.5%（有空間，不在漲停邊緣）
 *   均量比 >= 1.2x
 *   月線斜率 > 0（多頭走勢）
 *   現價 > MA20
 *   多方連次 >= 1
 *   連量 >= 市場前30%門檻（connVolThreshold 由 store 傳入）
 *
 * ⚠️ ma20 / ma20Slope 在首次盤後日K補充前為 null，
 *    null 時略過該條件（不因資料不足錯誤排除）。
 * ⚠️ 盤後 _dailyMode 略過連量條件（日K無逐筆連量）。
 *
 * @param {object} stock
 * @param {number} [connVolThreshold=0]  連量前30%門檻（由 store 計算後傳入）
 */
export function isWarrantLong(stock, connVolThreshold = 0) {
  return stock.changePercent >= 2 &&
    stock.changePercent < 9.5 &&
    stock.volumeVsYesterday >= 1.2 &&
    (stock.ma20Slope === null || stock.ma20Slope === undefined || stock.ma20Slope > 0) &&
    (stock.ma20 === null || stock.ma20 === undefined || stock.price > stock.ma20) &&
    stock.consecutiveTicks >= 1 &&
    (stock._dailyMode || connVolThreshold <= 0 || Math.abs(stock.consecutiveVolume) >= connVolThreshold)
}

/**
 * 主投買進股（Tab 1-B）
 *
 * 原始需求：外盤量>內盤量 + 大單主動買超>門檻 + 均量比>1.5
 * ⚠️ TWSE MIS / Fugle 逐筆均不提供外/內盤方向，
 *    改以「連漲≥2次（外盤強勢）+ 連量≥200張（大單規模）+ 量比>1.5」近似。
 *
 * 盤後 _dailyMode 略過連量條件。
 */
export function isInstBuy(stock) {
  return stock.consecutiveTicks >= 2 &&
    (stock._dailyMode || stock.consecutiveVolume >= 200) &&
    stock.changePercent > 0 &&
    stock.volumeVsYesterday >= 1.5
}

/**
 * 主投買沿上（強版）：主力持續推升（吸貨型）
 * 連漲≥5次 + 連量≥200張 + 漲≥1.5% + 量比≥1.3x
 *
 * 盤後 _dailyMode 略過連量條件。
 */
export function isInstBuyUp(stock) {
  return stock.consecutiveTicks >= 5 &&
    (stock._dailyMode || stock.consecutiveVolume >= 200) &&
    stock.changePercent >= 1.5 &&
    stock.volumeVsYesterday >= 1.3
}

/**
 * 飆風向上股（Tab 1-C）
 *
 * 情境A「目前上衝中」：連漲≥3次 + 有連量 + 今漲（盤後略過連量）
 * 情境B「量能確認衝高」：漲幅≥3% + 量比≥2x
 *
 * 兩條件取 OR：符合其中一個即顯示。
 *
 * 原始需求「突破近5分鐘高點」需要逐筆時間戳，目前 TWSE MIS 無法提供，
 * 改以「連次≥3 + 連量確認」替代。
 */
export function isSurging(stock) {
  const currentlySurging =
    stock.consecutiveTicks >= 3 &&
    (stock._dailyMode || stock.consecutiveVolume > 0) &&
    stock.changePercent > 0

  const recentSurge =
    stock.changePercent >= 3 &&
    stock.volumeVsYesterday >= 2

  return currentlySurging || recentSurge
}

/**
 * 布林多味（Tab 1-D）：多方布林強勢型態
 *
 * 條件：
 *   現價突破布林中軌（price > boll.middle）
 *   現價已達中軌往上軌中途一半以上（靠近上軌）
 *   布林開口放大（boll.width > 0.03 = 3%）
 *   今日漲
 *
 * ⚠️ boll 在日K補充前為 null，null 時回傳 false。
 */
export function isBollingerLong(stock) {
  const boll = stock.boll
  if (!boll) return false
  const midToUpper = boll.upper - boll.middle
  return stock.changePercent > 0 &&
    stock.price > boll.middle &&
    stock.price >= boll.middle + midToUpper * 0.5 &&
    boll.width > 0.03
}

// ── 進階篩選（Tab 2 弱勢） ────────────────────────────────────────

/**
 * 權證做空（Tab 2-A）
 *
 * 條件（對稱於權證做多）：
 *   跌幅 -2%~-9.5%（有空間，不在跌停邊緣）
 *   均量比 >= 1.2x
 *   月線斜率 < 0（空頭走勢）
 *   現價 < MA20
 *   空方連次 >= 1（consecutiveTicks <= -1）
 *   連量 >= 市場前30%門檻
 *
 * 盤後 _dailyMode 略過連量條件。
 *
 * @param {object} stock
 * @param {number} [connVolThreshold=0]
 */
export function isWarrantShort(stock, connVolThreshold = 0) {
  return stock.changePercent <= -2 &&
    stock.changePercent > -9.5 &&
    stock.volumeVsYesterday >= 1.2 &&
    (stock.ma20Slope === null || stock.ma20Slope === undefined || stock.ma20Slope < 0) &&
    (stock.ma20 === null || stock.ma20 === undefined || stock.price < stock.ma20) &&
    stock.consecutiveTicks <= -1 &&
    (stock._dailyMode || connVolThreshold <= 0 || Math.abs(stock.consecutiveVolume) >= connVolThreshold)
}

/**
 * 主投賣出股（Tab 2-B）
 *
 * 原始需求：內盤量>外盤量 + 大單主動賣超>門檻 + 均量比>1.5
 * ⚠️ 改以「連跌≥2次 + |連量|≥200張 + 量比>1.5」近似內盤主力賣出。
 *
 * 盤後 _dailyMode 略過連量條件。
 */
export function isInstSell(stock) {
  return stock.consecutiveTicks <= -2 &&
    (stock._dailyMode || stock.consecutiveVolume <= -200) &&
    stock.changePercent < 0 &&
    stock.volumeVsYesterday >= 1.5
}

/**
 * 弱勢沿下軌（Tab 2-C）：空方布林弱勢型態
 *
 * 條件：
 *   現價貼近布林下軌（price <= boll.lower × 1.02，允許 2% 誤差）
 *   月線下彎（ma20Slope < 0）
 *   量能增加（volumeVsYesterday >= 1.2）
 *   今日跌
 *
 * ⚠️ boll / ma20Slope 為 null 時回傳 false。
 */
export function isBollingerWeak(stock) {
  const boll = stock.boll
  if (!boll) return false
  if (stock.ma20Slope === null || stock.ma20Slope === undefined) return false
  return stock.changePercent < 0 &&
    stock.price <= boll.lower * 1.02 &&
    stock.ma20Slope < 0 &&
    stock.volumeVsYesterday >= 1.2
}

// ── 進階篩選（Tab 3 週轉率） ──────────────────────────────────────

/**
 * 資金關注焦點（強版多重共振）
 * 漲≥2% + 連漲≥3次 + 連量≥300張 + 量比≥2x
 *
 * 盤後 _dailyMode 略過連量條件。
 */
export function isCapitalAttention(stock) {
  return stock.changePercent >= 2 &&
    stock.consecutiveTicks >= 3 &&
    (stock._dailyMode || stock.consecutiveVolume >= 300) &&
    stock.volumeVsYesterday >= 2
}

/**
 * 大量換手高危（Tab 3-A）
 *
 * 條件（依規格書）：
 *   週轉率 >= 15%（極度換手）
 *   均量比 >= 2x
 *   今日漲幅 >= 5%
 *   昨日漲幅 >= 3%（前一日已拉高，今日可能為主力出貨）
 *
 * ⚠️ turnoverRate 需有流通股數資料（sharesLots），
 *    資料未到前 turnoverRate = 0，此時以量比≥3x + 漲幅≥5% 替代門檻。
 */
export function isHighTurnoverRisk(stock) {
  const hasTurnover = stock.turnoverRate > 0
  if (hasTurnover) {
    return stock.turnoverRate >= 15 &&
      stock.volumeVsYesterday >= 2 &&
      stock.changePercent >= 5 &&
      (stock.yesterdayChangePercent ?? 0) >= 3
  }
  // 流通股數尚未載入時，以量比高門檻替代週轉率
  return stock.volumeVsYesterday >= 3 &&
    stock.changePercent >= 5 &&
    (stock.yesterdayChangePercent ?? 0) >= 3
}
