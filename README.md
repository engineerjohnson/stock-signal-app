# 當沖飆股神手

> Vue 3 PWA · 台股即時連次連量掃描 · 1 秒自動刷新 · 部署於 GitHub Pages · 免後端伺服器

---

## 目錄

1. [專案概覽](#1-專案概覽)
2. [技術架構](#2-技術架構)
3. [系統架構圖](#3-系統架構圖)
4. [功能模組規格](#4-功能模組規格)
5. [指標定義與公式](#5-指標定義與公式)
6. [資料來源與 API](#6-資料來源與-api)
7. [Cloudflare Worker CORS Proxy](#7-cloudflare-worker-cors-proxy)
8. [目錄結構](#8-目錄結構)
9. [核心程式碼設計](#9-核心程式碼設計)
10. [環境設定與安裝](#10-環境設定與安裝)
11. [GitHub Pages 部署](#11-github-pages-部署)
12. [PWA 手機安裝](#12-pwa-手機安裝)
13. [開發路線圖](#13-開發路線圖)
14. [常見問題](#14-常見問題)

---

## 1. 專案概覽

### 目標

每秒掃描台灣上市前 100 大活躍股，即時計算連次、連量、週轉率、昨日量比、昨日漲幅，自動將符合條件的**強勢股**與**弱勢股**排至清單頂端，並以閃爍動畫標示新出現的訊號。

無走勢圖、無登入、無後端伺服器。部署至 GitHub Pages，手機瀏覽器加入主畫面即可當 APP 使用。

### 核心功能一覽

| 功能 | 說明 |
|------|------|
| **即時掃描清單** | 每 1 秒刷新，顯示所有觸發訊號的股票 |
| **強勢股推薦** | 連次 ≥ 門檻 且今日漲幅 > 0 |
| **弱勢股推薦** | 連次 ≤ -門檻 且今日漲幅 < 0 |
| **連次** | 連續同方向 tick 次數（正=連漲，負=連跌）|
| **連量** | 連續放量/縮量次數（正=連放量，負=連縮量）|
| **週轉率** | 今日成交量 / 在外流通股數 × 100% |
| **昨日量比** | 今日累計量 / 昨日總成交量 |
| **昨日漲幅** | 昨日收盤漲跌幅（參考對照用）|
| **自選股** | 手動加入監控，localStorage 儲存，免登入 |
| **門檻切換** | 連次 ≥ 2 / 3 / 5 次，即時篩選 |

---

## 2. 技術架構

```
前端框架    Vue 3.5  (Composition API + <script setup>)
建構工具    Vite 6
狀態管理    Pinia 2（scanner store 管理掃描狀態與輪詢）
路由        Vue Router 4（Hash 模式，GitHub Pages 相容）
樣式        Tailwind CSS 3 + DaisyUI 4（深色主題，手機優先）
HTTP        Axios 1.7
CORS Proxy  Cloudflare Worker（免費方案，每日 10 萬次請求）
部署        GitHub Pages + GitHub Actions CI/CD
PWA         vite-plugin-pwa（Workbox，手機加入主畫面）
```

### 套件版本

```json
{
  "dependencies": {
    "vue": "^3.5.13",
    "vue-router": "^4.4.5",
    "pinia": "^2.2.8",
    "axios": "^1.7.9"
  },
  "devDependencies": {
    "vite": "^6.0.11",
    "@vitejs/plugin-vue": "^5.2.1",
    "tailwindcss": "^3.4.17",
    "daisyui": "^4.12.14",
    "vite-plugin-pwa": "^0.21.1"
  }
}
```

---

## 3. 系統架構圖

```
┌──────────────────────────────────────────────┐
│              手機 / 瀏覽器                    │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │           Vue 3 PWA (SPA)              │  │
│  │                                        │  │
│  │  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │ scanner store│  │  Vue Router    │  │  │
│  │  │  (Pinia)     │  │  /#/           │  │  │
│  │  │  1秒輪詢     │  │  /#/watchlist  │  │  │
│  │  └──────┬───────┘  └────────────────┘  │  │
│  │         │                              │  │
│  │  ┌──────▼───────────────────────────┐  │  │
│  │  │         services/twse.js          │  │  │
│  │  │  fetchStockPool() → OpenAPI       │  │  │
│  │  │  fetchBatchQuotes() → Proxy       │  │  │
│  │  └──────┬──────────────┬────────────┘  │  │
│  └─────────┼──────────────┼───────────────┘  │
└────────────┼──────────────┼──────────────────┘
             │              │
    ┌─────────▼──────┐  ┌───▼──────────────────┐
    │ Cloudflare     │  │ TWSE OpenAPI          │
    │ Worker Proxy   │  │ openapi.twse.com.tw   │
    └─────────┬──────┘  │ (CORS OK, 直接呼叫)   │
             │          └───────────────────────┘
    ┌─────────▼──────┐
    │ TWSE MIS API   │
    │ mis.twse.com.tw│
    │ 盤中即時報價   │
    └────────────────┘
```

---

## 4. 功能模組規格

### 4.1 主畫面 — 掃描清單（ScannerView）

#### 頁面佈局

```
┌────────────────────────────────────┐
│ 當沖飆股神手         ● 盤中 09:32  │  ← Header
├────────────────────────────────────┤
│ [強勢股] [弱勢股] [全部]            │  ← Tab
│ 連次門檻: [2次] [3次] [5次]         │  ← 篩選列
├────────────────────────────────────┤
│ 共 12 檔  最後更新 09:32:45         │
├──────────────────────────────────  │
│ ⚡ 2330 台積電       825.0 +2.11%  │  ← 新訊號(閃爍)
│    連次+5↑ 連量+3↑  週轉0.17%      │
│    昨量比 1.2x       昨漲 +1.50%   │
├──────────────────────────────────  │
│    2454 聯發科       215.0 +1.80%  │
│    連次+4↑ 連量+2↑  週轉0.52%      │
│    昨量比 0.9x       昨漲 +0.80%   │
├──────────────────────────────────  │
│    3008 大立光       678.0 -1.20%  │  ← 弱勢股(綠色)
│    連次-4↓ 連量+2↑  週轉0.31%      │
│    昨量比 1.5x       昨漲 +0.50%   │
└────────────────────────────────────┘
│  🔴 掃描      ⭐ 自選股             │  ← NavBar
└────────────────────────────────────┘
```

#### 強勢股條件
```
連次 >= 門檻  AND  今日漲跌% > 0
```

#### 弱勢股條件
```
連次 <= -門檻  AND  今日漲跌% < 0
```

#### 全部條件（顯示所有有訊號的股票）
```
|連次| >= 門檻  OR  |連量| >= 門檻
```

#### 排序規則
```
主排序：|連次| + |連量|  由大到小
次排序：|今日漲跌%|      由大到小
```

#### 新訊號動畫
- 股票剛進入清單 → 左邊顯示 ⚡ 圖示 + 行背景閃爍 amber 色
- 4 秒後恢復正常

---

### 4.2 自選股清單（WatchlistView）

- 與掃描清單相同的欄位格式
- 右上角「+ 新增」→ 輸入股票代碼加入
- 長按（或點刪除鍵）移除
- 自選股同樣每 1 秒刷新
- localStorage 持久化，不需登入
- 自選股加入掃描母池（確保一定被監控）

---

### 4.3 色彩規範（台股慣例）

| 狀態 | 顏色 | Tailwind Class |
|------|------|----------------|
| 上漲 | 紅色 | `text-red-400` |
| 下跌 | 綠色 | `text-green-400` |
| 平盤 | 灰色 | `text-gray-400` |
| 連漲（連次+）| 紅色 | `text-red-400` |
| 連跌（連次-）| 綠色 | `text-green-400` |
| 連放量（連量+）| 橘色 | `text-orange-400` |
| 連縮量（連量-）| 藍色 | `text-blue-400` |
| 新訊號 | 黃色閃爍 | `border-amber-400 animate-pulse` |

---

## 5. 指標定義與公式

### 5.1 連次（Consecutive Ticks）

**定義**：從最新一筆成交往回數，連續同方向成交的次數。正數 = 連漲，負數 = 連跌，平盤略過不計。

**公式**：
```
給定成交價序列 prices = [p1, p2, p3, ..., pN]（由舊到新）

1. 從 pN 往前找最後一次有方向的變動，確定 direction（+1 或 -1）
2. 從後往前數連續 direction 方向的變動次數 = count
3. 連次 = direction × count

範例：
prices = [100, 101, 102, 103, 102]
→ 最後變動 103→102 = 下跌 (direction = -1)
→ 往前數：103→102 跌(-1)✓ count=1，再前 102→103 漲(+1)✗ 停
→ 連次 = -1

prices = [100, 101, 102, 103, 104]
→ 最後變動 103→104 = 上漲 (direction = +1)
→ 往前數：104(+1)✓, 103(+1)✓, 102(+1)✓, 101(+1)✓
→ 連次 = +4
```

**JavaScript 實作**：
```javascript
export function calcConsecutiveTicks(prices) {
  if (prices.length < 2) return 0

  // 找最後一次有方向的變動
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1; break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0

  // 從後往前數連續同方向次數
  let count = 0
  for (let i = prices.length - 1; i > 0; i--) {
    const diff = prices[i] - prices[i - 1]
    if (diff === 0) continue               // 平盤略過
    if (Math.sign(diff) === direction) count++
    else break
  }

  return direction * count
}
```

---

### 5.2 連量（Consecutive Volume）

**定義**：從最新一筆每 tick 成交量往回數，連續同方向變化的次數。正數 = 連放量，負數 = 連縮量。

> **注意**：TWSE MIS API 回傳的 `v` 欄位是**累積成交量**，需計算 delta（每次增量）才是每 tick 的量。

**公式**：
```
累積量序列 V = [v1, v2, v3, ..., vN]
delta 量序列 D = [v2-v1, v3-v2, ..., vN-v(N-1)]

連量 = calcConsecutiveVolume(D)
（與連次算法相同，套用在 D 上）
```

**更新邏輯**（每秒輪詢時）：
```
若 新v > 舊v（有新成交）：
  delta = 新v - 舊v
  追加 delta 到 volumeHistory
  更新 lastVol = 新v
```

---

### 5.3 週轉率（Turnover Rate）

**定義**：今日成交量占在外流通股數的百分比，反映今日該股票的活躍程度。

**公式**：
```
週轉率 (%) = 今日累計成交量（張）/ 在外流通股數（張）× 100

在外流通股數（張）= 公司資本額（元）/ 每股面值 10 元 / 1000（股/張）
                  = 資本額 / 10,000

範例（台積電 2330）：
  資本額 ≈ 259,303,805,000 元
  在外流通股數 = 259,303,805,000 / 10,000 ≈ 25,930,380 張
  今日成交量 = 45,320 張
  週轉率 = 45,320 / 25,930,380 × 100 ≈ 0.17%
```

**資料來源**：資本額從 `openapi.twse.com.tw/v1/company/companies` 的 `PaidInCapital` 欄位取得（啟動時一次性載入）。

---

### 5.4 昨日量比（Volume vs Yesterday）

**定義**：今日目前累計成交量 / 昨日全日成交量，反映今日活躍度是否超越昨日。

**公式**：
```
昨日量比 = 今日累計量（張）/ 昨日總成交量（張）

> 1.0 = 今日比昨日活躍
< 1.0 = 今日比昨日清淡
= 1.0 = 相同
```

**資料來源**：昨日總成交量從 `STOCK_DAY_ALL` 的 `TradeVolume` 欄位取得。

---

### 5.5 昨日漲幅（Yesterday's Change %）

**定義**：昨日收盤相對於前日收盤的漲跌幅，提供今日操作的歷史背景參考。

**公式**：
```
昨日漲幅 (%) = (昨收 - 前日收盤) / 前日收盤 × 100
            = 昨日 Change / (昨收 - 昨日 Change) × 100
```

**資料來源**：從 `STOCK_DAY_ALL` 的 `Change`（漲跌元）與 `ClosingPrice`（昨收）計算。

---

## 6. 資料來源與 API

### 6.1 TWSE OpenAPI（無 CORS 問題，直接呼叫）

Base URL：`https://openapi.twse.com.tw/v1`

| 端點 | 用途 | 呼叫時機 |
|------|------|---------|
| `GET /exchangeReport/STOCK_DAY_ALL` | 取得所有上市股票昨日資料（昨量、昨收、昨漲跌）建立掃描母池 | 啟動時一次 |
| `GET /company/companies` | 取得所有公司資本額（計算週轉率分母）| 啟動時一次 |

**STOCK_DAY_ALL 回傳欄位說明**：
```json
{
  "Code":         "2330",       // 股票代碼
  "Name":         "台積電",     // 股票名稱
  "TradeVolume":  "45,320",     // 昨日成交量（張），含千分位逗號
  "TradeValue":   "37,389,600", // 昨日成交值（千元）
  "OpeningPrice": "815.0",      // 昨日開盤
  "HighestPrice": "828.0",      // 昨日最高
  "LowestPrice":  "812.0",      // 昨日最低
  "ClosingPrice": "825.0",      // 昨日收盤
  "Change":       "+17.0",      // 昨日漲跌（元）
  "Transaction":  "28,456"      // 昨日成交筆數
}
```

**前置過濾條件**（排除不適合當沖的股票）：
```
代碼為 4 位純數字（排除 ETF、特別股）
昨日收盤 >= 10 元（排除低價股）
昨日成交量 >= 500 張（排除冷門股）
```

---

### 6.2 TWSE MIS 盤中即時 API（需 Cloudflare Worker Proxy）

Base URL：`https://mis.twse.com.tw/stock/api`

**批次查詢（最多 20 支，用 `|` 分隔）**：
```
GET /getStockInfo.jsp?ex_ch=tse_2330.tw|tse_2454.tw|tse_3008.tw&json=1&delay=0
```

**回傳欄位說明**：
```json
{
  "msgArray": [
    {
      "c": "2330",           // 股票代碼
      "n": "台積電",          // 股票名稱
      "z": "825.0",          // 最新成交價（盤中更新）
      "y": "808.0",          // 昨日收盤價
      "o": "815.0",          // 今日開盤價
      "h": "828.0",          // 今日最高價
      "l": "812.0",          // 今日最低價
      "v": "45320",          // 今日累計成交量（張）
      "t": "09:32:15",       // 最後成交時間
      "a": "825.5_826.0",    // 賣出五檔價（_ 分隔）
      "b": "824.5_824.0",    // 買入五檔價
      "f": "100_200",        // 賣出五檔量
      "g": "200_300"         // 買入五檔量
    }
  ]
}
```

**關鍵欄位對應**：
```
z → 即時現價（計算連次、今日漲跌%）
v → 累積量（計算連量 delta、昨日量比、週轉率）
y → 昨收（計算今日漲跌%）
```

---

### 6.3 輪詢策略

```
盤中（09:00 ~ 13:30，週一到週五）：
  每 1 秒執行一次 doScan()
  100 支股票 / 20 = 5 批平行請求

非交易時間：
  停止輪詢（clearInterval）
  保留最後一次的數據顯示
  顯示「收盤」狀態

批次請求範例（5 個平行）：
  Promise.allSettled([
    fetchBatchQuotes(['2330','2454','3008',...]),  // 第1批 20支
    fetchBatchQuotes(['2317','2412','1301',...]),  // 第2批 20支
    fetchBatchQuotes([...]),                       // 第3批 20支
    fetchBatchQuotes([...]),                       // 第4批 20支
    fetchBatchQuotes([...]),                       // 第5批 20支
  ])
```

---

## 7. Cloudflare Worker CORS Proxy

### 7.1 為什麼需要

TWSE MIS API（`mis.twse.com.tw`）不允許跨來源請求，瀏覽器直接呼叫會被 CORS 政策擋住。Cloudflare Worker 作為中繼伺服器，轉發請求並加上正確的 CORS 回應標頭。

**Cloudflare Worker 免費方案：每日 100,000 次請求，完全夠用。**

> 換算：每秒 5 批 × 每小時 3,600 秒 × 4.5 交易小時 = 81,000 次/日

### 7.2 Worker 完整程式碼

檔案：`worker/proxy.js`

```javascript
// 允許呼叫此 proxy 的前端來源（填入你的 GitHub Pages URL）
const ALLOWED_ORIGINS = [
  'https://<你的GitHub帳號>.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

// 只允許代理這些目標 host（安全白名單）
const ALLOWED_TARGET_HOSTS = [
  'mis.twse.com.tw',
  'www.twse.com.tw',
]

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''

    // 處理 CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: buildCorsHeaders(origin),
      })
    }

    // 從 query string 取目標 URL
    // 格式：https://your-worker.workers.dev/?url=https://mis.twse.com.tw/...
    const reqUrl = new URL(request.url)
    const targetUrl = reqUrl.searchParams.get('url')

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 })
    }

    // 安全性：只允許轉發到白名單 host
    let targetHost
    try {
      targetHost = new URL(targetUrl).hostname
    } catch {
      return new Response('Invalid url parameter', { status: 400 })
    }

    if (!ALLOWED_TARGET_HOSTS.includes(targetHost)) {
      return new Response('Target host not allowed', { status: 403 })
    }

    // 轉發請求到 TWSE
    let response
    try {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://mis.twse.com.tw/',
          'Accept': 'application/json, text/plain, */*',
        },
        cf: { cacheEverything: false },
      })
    } catch (err) {
      return new Response(`Upstream error: ${err.message}`, { status: 502 })
    }

    const body = await response.text()

    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-store',
        ...buildCorsHeaders(origin),
      },
    })
  },
}

function buildCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}
```

### 7.3 部署步驟

```bash
# 1. 安裝 Wrangler CLI
npm install -g wrangler

# 2. 登入 Cloudflare（免費帳號即可）
wrangler login

# 3. 進入 worker 目錄並部署
cd worker
wrangler deploy proxy.js \
  --name stock-proxy \
  --compatibility-date 2024-01-01

# 部署完成後會顯示 Worker URL，例如：
# https://stock-proxy.你的帳號.workers.dev

# 4. 將 URL 填入專案根目錄的 .env.local
VITE_PROXY_URL=https://stock-proxy.你的帳號.workers.dev
```

### 7.4 修改 Worker 允許的 Origin

部署完成後，請編輯 `worker/proxy.js` 第一行的 `ALLOWED_ORIGINS`，填入你的 GitHub Pages 網址：

```javascript
const ALLOWED_ORIGINS = [
  'https://你的帳號.github.io',  // ← 修改這行
  'http://localhost:5173',
]
```

然後重新執行 `wrangler deploy`。

---

## 8. 目錄結構

```
stock-signal-app/
│
├── public/                         # 靜態資源
│   └── icons/                      # PWA 圖示（192x192, 512x512）
│
├── src/
│   │
│   ├── utils/
│   │   ├── indicators.js           # 純函數：連次、連量計算
│   │   └── formatters.js           # 數字格式化、顏色 class 判斷
│   │
│   ├── services/
│   │   ├── proxy.js                # Cloudflare Worker 呼叫封裝
│   │   └── twse.js                 # TWSE API（OpenAPI + MIS）封裝
│   │
│   ├── composables/
│   │   └── useMarketHours.js       # 判斷交易時間（週一至週五 09:00~13:30）
│   │
│   ├── stores/
│   │   ├── scanner.js              # 核心：掃描母池、1 秒輪詢、訊號計算
│   │   └── watchlist.js            # 自選股（localStorage 持久化）
│   │
│   ├── views/
│   │   ├── ScannerView.vue         # 主畫面：即時訊號清單
│   │   └── WatchlistView.vue       # 自選股清單
│   │
│   ├── components/
│   │   └── NavBar.vue              # 底部導覽列（掃描 / 自選股）
│   │
│   ├── App.vue                     # 根元件
│   ├── main.js                     # 應用程式進入點
│   └── router/
│       └── index.js                # 路由設定（Hash 模式）
│
├── worker/
│   └── proxy.js                    # Cloudflare Worker 原始碼
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions 自動部署腳本
│
├── .env.example                    # 環境變數範本（不含敏感資訊）
├── .gitignore
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

---

## 9. 核心程式碼設計

### 9.1 `utils/indicators.js`

```javascript
/**
 * 計算連次
 * @param {number[]} prices 由舊到新的成交價陣列
 * @returns {number} 正=連漲次數, 負=連跌次數
 */
export function calcConsecutiveTicks(prices) {
  if (prices.length < 2) return 0
  let direction = 0
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1]) { direction = 1; break }
    if (prices[i] < prices[i - 1]) { direction = -1; break }
  }
  if (direction === 0) return 0
  let count = 0
  for (let i = prices.length - 1; i > 0; i--) {
    const diff = prices[i] - prices[i - 1]
    if (diff === 0) continue
    if (Math.sign(diff) === direction) count++
    else break
  }
  return direction * count
}

/**
 * 計算連量
 * @param {number[]} volumes 由舊到新的每 tick 成交量（非累積）
 * @returns {number} 正=連放量次數, 負=連縮量次數
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

/** 是否為強勢股 */
export function isStrong(stock, minTicks = 3) {
  return stock.consecutiveTicks >= minTicks && stock.changePercent > 0
}

/** 是否為弱勢股 */
export function isWeak(stock, minTicks = 3) {
  return stock.consecutiveTicks <= -minTicks && stock.changePercent < 0
}
```

---

### 9.2 `stores/scanner.js`（掃描核心）

**狀態結構**：
```javascript
// Pinia store 內部狀態
pool        = ref([])      // 掃描母池（100 支股票的靜態基礎資料）
quotes      = ref({})      // 即時報價快取 { '2330': StockData }
threshold   = ref(3)       // 連次觸發門檻
activeTab   = ref('strong')// 當前 tab: 'strong' | 'weak' | 'all'
isLoading   = ref(false)
tickHistories = {}         // 不需響應式（純計算），{ '2330': { prices[], volumes[], lastVol } }
```

**StockData 資料結構**：
```javascript
{
  // 基礎（從 STOCK_DAY_ALL 載入，固定不變）
  id:                  '2330',
  name:                '台積電',
  yesterdayVolume:     45320,     // 昨日成交量（張）
  yesterdayClose:      808.0,     // 昨日收盤
  yesterdayChange:     +17.0,     // 昨日漲跌（元）
  yesterdayChangePercent: +2.15,  // 昨日漲跌幅（%）
  sharesLots:          25930380,  // 在外流通股數（張），用於週轉率

  // 即時（每秒更新）
  price:               825.0,     // 現價
  changePercent:       +2.11,     // 今日漲跌幅（%）
  volume:              45320,     // 今日累計量（張）

  // 計算指標（每秒更新）
  consecutiveTicks:    +5,        // 連次
  consecutiveVolume:   +3,        // 連量
  turnoverRate:        0.17,      // 週轉率（%）
  volumeVsYesterday:   1.19,      // 昨日量比（倍）

  // 動畫狀態
  isNew:               false,     // 是否為剛進入訊號清單
}
```

**掃描流程**：
```javascript
async function doScan() {
  const batches = chunk(poolIds, 20)           // 分批

  const results = await Promise.allSettled(    // 並行請求
    batches.map(batch => fetchBatchQuotes(batch))
  )

  const prevSignalIds = new Set(signals.value.map(s => s.id))

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const raw of result.value) {
      updateQuote(raw)                         // 更新 tick 歷史 + 重算指標
    }
  }

  markNewSignals(prevSignalIds)               // 標記新出現的訊號（閃爍動畫）
}
```

**updateQuote 核心邏輯**：
```javascript
function updateQuote(raw) {
  const totalVol = parseInt(raw.v)
  const history  = tickHistories[raw.c]

  // 只在有新成交時才更新 tick 歷史
  if (totalVol > history.lastVol) {
    const deltaVol = totalVol - history.lastVol
    history.prices.push(parseFloat(raw.z))     // 追加最新成交價
    history.volumes.push(deltaVol)             // 追加本次 tick 量
    history.lastVol = totalVol

    // 只保留最近 30 筆
    if (history.prices.length  > 30) history.prices.shift()
    if (history.volumes.length > 30) history.volumes.shift()
  }

  // 重新計算所有指標
  quotes.value[raw.c] = {
    ...quotes.value[raw.c],
    price:              parseFloat(raw.z),
    changePercent:      計算漲跌幅,
    volume:             totalVol,
    consecutiveTicks:   calcConsecutiveTicks(history.prices),
    consecutiveVolume:  calcConsecutiveVolume(history.volumes),
    turnoverRate:       totalVol / sharesLots * 100,
    volumeVsYesterday:  totalVol / yesterdayVolume,
  }
}
```

---

### 9.3 `services/twse.js`（API 封裝）

```javascript
// 初始化：載入掃描母池
export async function fetchStockPool(topN = 100) {
  // 1. 並行取得「昨日成交資料」和「公司資本額」
  const [dayAll, companies] = await Promise.allSettled([
    axios.get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
    axios.get('https://openapi.twse.com.tw/v1/company/companies'),
  ])

  // 2. 建立資本額對照表 { '2330': 259303805000 }
  const capitalMap = buildCapitalMap(companies)

  // 3. 過濾、轉換、排序取 Top N
  return dayAll.value.data
    .filter(s => /^\d{4}$/.test(s.Code)            // 4位數代碼
              && parseFloat(s.ClosingPrice) >= 10   // 股價 >= 10
              && parseVolume(s.TradeVolume) >= 500) // 成交量 >= 500張
    .map(s => mapToStockBase(s, capitalMap))
    .sort((a, b) => b.yesterdayVolume - a.yesterdayVolume)
    .slice(0, topN)
}

// 盤中：批次查詢即時報價（最多 20 支）
export async function fetchBatchQuotes(stockIds) {
  const query = stockIds.map(id => `tse_${id}.tw`).join('|')
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${query}&json=1&delay=0`
  const data = await proxyGet(url)  // 透過 Cloudflare Worker
  return data?.msgArray || []
}
```

---

### 9.4 `views/ScannerView.vue`（主畫面）

```
ScannerView
├── Header（標題 + 市場狀態 + 時鐘）
├── TabBar（強勢股 | 弱勢股 | 全部）
├── FilterBar（連次門檻：2次 / 3次 / 5次）
├── StatusBar（共 N 檔 | 最後更新時間）
└── <TransitionGroup>（訊號清單，動畫排序）
    └── StockRow × N
        ├── 第一行：代碼、名稱、現價、今日漲跌%
        └── 第二行：連次、連量、週轉率、昨日量比、昨日漲幅
```

**`<TransitionGroup>` 排序動畫**：每次 `signals` 陣列重新排序時，Vue 自動計算位移並播放 CSS `transform` 過渡動畫，視覺上股票會平滑地上下移動。

---

### 9.5 `stores/watchlist.js`（自選股）

```javascript
// 自選股清單存入 localStorage
const STORAGE_KEY = 'stock_watchlist_v1'

const items = ref(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))

// 自動同步到 localStorage
watch(items, val => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

// 加入自選股時，同步加入 scanner 的掃描母池
function add(stockId) {
  if (!items.value.includes(stockId)) {
    items.value.push(stockId)
    scannerStore.addToPool(stockId)  // 確保此股也被每秒掃描
  }
}
```

---

## 10. 環境設定與安裝

### 10.1 前置需求

- Node.js >= 18
- npm >= 9

### 10.2 安裝步驟

```bash
# 1. Clone repo
git clone https://github.com/你的帳號/stock-signal-app.git
cd stock-signal-app

# 2. 安裝依賴
npm install

# 3. 設定環境變數
cp .env.example .env.local
# 編輯 .env.local，填入 Cloudflare Worker URL

# 4. 啟動開發伺服器
npm run dev
# 開啟 http://localhost:5173

# 5. 建置正式版
npm run build
# 輸出至 dist/
```

### 10.3 `.env.example`

```bash
# Cloudflare Worker URL（部署後填入，見第 7 節）
VITE_PROXY_URL=https://your-worker.your-account.workers.dev

# GitHub Pages 的 repo 名稱（用於 vite.config.js base 路徑）
VITE_REPO_NAME=stock-signal-app
```

### 10.4 `vite.config.js`

```javascript
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  return {
    base: `/${env.VITE_REPO_NAME || 'stock-signal-app'}/`,

    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: '當沖飆股神手',
          short_name: '飆股神手',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
```

### 10.5 `tailwind.config.js`

```javascript
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        rise:    '#f87171',  // red-400：漲
        fall:    '#4ade80',  // green-400：跌
        volup:   '#fb923c',  // orange-400：放量
        voldown: '#60a5fa',  // blue-400：縮量
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: { themes: ['dark'] },
}
```

---

## 11. GitHub Pages 部署

### 11.1 GitHub Actions 自動部署腳本

檔案：`.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_PROXY_URL:  ${{ secrets.VITE_PROXY_URL }}
          VITE_REPO_NAME:  ${{ github.event.repository.name }}

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 11.2 完整部署流程

```
步驟 1：建立 GitHub Repository
  → 新建 repo，名稱例如 stock-signal-app

步驟 2：設定 GitHub Pages
  → Settings → Pages → Source 選 "GitHub Actions"

步驟 3：新增 Secret
  → Settings → Secrets and variables → Actions
  → New repository secret
  → Name: VITE_PROXY_URL
  → Value: https://stock-proxy.你的帳號.workers.dev

步驟 4：Push 程式碼
  git add .
  git commit -m "initial commit"
  git push -u origin main

步驟 5：等待部署（約 1~2 分鐘）
  → 至 Actions tab 查看進度
  → 完成後網址：https://你的帳號.github.io/stock-signal-app/
```

---

## 12. PWA 手機安裝

### Android（Chrome 瀏覽器）
```
1. 用 Chrome 開啟網址
2. 右上角 ⋮（三點選單）
3. 點「新增至主畫面」
4. 確認 → 主畫面出現 APP 圖示
```

### iPhone（Safari 瀏覽器）
```
1. 用 Safari 開啟網址（必須用 Safari，Chrome 不支援）
2. 下方工具列點「分享」按鈕 □↑
3. 向下捲動找「加入主畫面」
4. 確認 → 主畫面出現 APP 圖示
```

### PWA 安裝後的體驗
- 全螢幕顯示（無瀏覽器網址列）
- 深色背景（看盤眼睛不累）
- 支援離線顯示最後一次的資料
- 畫面鎖定直立方向

---

## 13. 開發路線圖

### Phase 1 — 基礎建設
- [ ] Vue 3 + Vite + Tailwind + DaisyUI + Pinia 專案架構
- [ ] Cloudflare Worker CORS Proxy 部署
- [ ] `utils/indicators.js`：連次、連量算法
- [ ] `utils/formatters.js`：數字格式化、顏色 class
- [ ] `services/twse.js`：TWSE API 封裝
- [ ] `composables/useMarketHours.js`：交易時間判斷

### Phase 2 — 掃描核心
- [ ] `stores/scanner.js`：掃描母池初始化
- [ ] 1 秒輪詢機制（交易時間自動開關）
- [ ] 連次 / 連量 / 週轉率 / 昨日量比 / 昨日漲幅 計算
- [ ] `signals` computed（強勢 / 弱勢 / 全部篩選 + 排序）

### Phase 3 — 主畫面
- [ ] `ScannerView.vue`：Tab + 篩選列 + 清單
- [ ] `StockRow`：雙行顯示格式（手機優先）
- [ ] `<TransitionGroup>` 排序動畫
- [ ] 新訊號閃爍（isNew badge）
- [ ] `NavBar.vue`：底部導覽

### Phase 4 — 自選股
- [ ] `stores/watchlist.js`：localStorage 持久化
- [ ] `WatchlistView.vue`：新增 / 刪除 / 即時顯示
- [ ] 自選股自動加入掃描母池

### Phase 5 — 收尾
- [ ] PWA 設定（manifest、icons）
- [ ] GitHub Actions 自動部署
- [ ] 開收盤狀態顯示
- [ ] 錯誤處理（API 失敗重試、網路中斷提示）

---

## 14. 常見問題

**Q: 掃描的是哪些股票？**
A: 每日啟動時從 TWSE OpenAPI 取前一日成交量 Top 100 的上市股票作為預設母池，自選股會額外加入（不受 100 支限制）。

**Q: 非交易時間打開會怎樣？**
A: 顯示最後一次的資料，停止輪詢，Header 顯示「收盤」狀態。

**Q: 1 秒內 API 來不及回傳怎麼辦？**
A: 每次 `doScan()` 使用 `Promise.allSettled`，個別請求失敗不影響其他批次。若本次掃描尚未完成，下一次 1 秒到來時會略過（避免堆積）。

**Q: 連次是以分鐘 K 計算還是 tick？**
A: 以每次 API 偵測到成交量增加為一個 tick（近似 tick 精度），非分鐘 K 棒。

**Q: 週轉率怎麼計算？**
A: `在外流通股數（張）= 公司資本額（元）/ 10,000`，資本額從 TWSE OpenAPI 公司資料取得，啟動時一次性載入。

**Q: Cloudflare Worker 設定麻煩嗎？**
A: 只需一次，約 5 分鐘。詳見第 7 節步驟。免費帳號即可，不需填信用卡。

---

*最後更新：2026-04-10*
# stock-signal-app
# stock-signal-app
# stock-signal-app
