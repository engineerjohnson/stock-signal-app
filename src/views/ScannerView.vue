<template>
  <div class="min-h-screen bg-gray-950 pb-16 select-none">

    <!-- ── Header ─────────────────────────────────────────────── -->
    <header class="sticky top-0 z-20 bg-gray-950 border-b border-gray-800">

      <!-- 頂列：標題 + 市場狀態 + 時間 -->
      <div class="flex items-center justify-between px-3 py-2">
        <h1 class="text-white font-bold text-sm tracking-wide">📈 飆股雷達</h1>
        <div class="flex items-center gap-2">
          <span :class="['text-[11px] font-medium px-2 py-0.5 rounded-full', marketStatus.cls]">
            {{ marketStatus.text }}
          </span>
          <span class="text-gray-400 text-[11px] font-mono tabular-nums">{{ currentTime }}</span>
        </div>
      </div>

      <!-- Tab 列（橫向捲動） -->
      <div class="tab-scroller flex overflow-x-auto border-b border-gray-800 bg-gray-950">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          :class="[
            'shrink-0 px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors',
            store.activeTab === tab.value
              ? 'text-white border-b-2 border-orange-400 bg-gray-900/50'
              : 'text-gray-500 hover:text-gray-300',
          ]"
          @click="store.activeTab = tab.value"
        >{{ tab.label }}</button>
      </div>

      <!-- 連次門檻（僅盤中、強勢/弱勢/資金焦點 tab 顯示） -->
      <div
        v-if="isOpen && showThreshold"
        class="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800"
      >
        <span class="text-gray-500 text-[11px] shrink-0">連次門檻</span>
        <button
          v-for="t in [2, 3, 5]"
          :key="t"
          :class="[
            'px-2.5 py-0.5 text-[11px] rounded-full transition-colors font-medium',
            store.threshold === t ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300',
          ]"
          @click="store.threshold = t"
        >{{ t }}次</button>
      </div>

      <!-- 欄位標題列 + 排序按鈕 -->
      <div v-if="!store.isLoading" class="flex items-center px-2 py-1 bg-gray-900 border-b border-gray-800 text-[10px]">
        <!-- K棒占位 -->
        <div class="w-4 shrink-0"></div>

        <!-- 股票名稱（不可排序） -->
        <div class="w-[70px] shrink-0 pl-1 text-gray-500">股票</div>

        <!-- 成交價 / 漲跌幅 -->
        <div class="w-[62px] shrink-0 text-right leading-tight text-gray-500">
          <div>成交價</div>
          <div>漲跌幅</div>
        </div>

        <!-- 量比（時間修正） -->
        <div class="w-[46px] shrink-0 text-right leading-tight text-gray-500">量比</div>

        <!-- 連次 -->
        <div class="w-[28px] shrink-0 text-center leading-tight text-gray-500">連次</div>

        <!-- 連量 -->
        <div class="w-[36px] shrink-0 text-center leading-tight text-gray-500">連量</div>

        <!-- 成交量 / 周轉率 -->
        <div class="w-[46px] shrink-0 text-right leading-tight text-gray-500">
          <div>成交量</div>
          <div>週轉%</div>
        </div>

        <!-- 走勢 + 排序按鈕 -->
        <div class="flex-1 flex items-center justify-end gap-1">
          <span class="text-gray-500">走勢</span>
          <button
            @click="showSortSheet = true"
            class="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 text-[10px] font-medium"
          >
            <span>⇅</span>
            <span class="text-orange-400">{{ currentSortLabel }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- ── 收盤 banner ─────────────────────────────────────────── -->
    <div
      v-if="!isOpen && !store.isLoading"
      class="flex items-center gap-2 px-3 py-1.5 bg-indigo-950/60 border-b border-indigo-800/50 text-[11px] text-indigo-300"
    >
      <span>🌙 盤後模式</span>
      <span class="text-indigo-500">｜</span>
      <span v-if="store.dataDate" class="text-indigo-400">📅 資料日期 {{ store.dataDate }}</span>
      <span v-else-if="store.lastUpdate" class="text-indigo-400">快照 {{ lastUpdateStr }}</span>
      <span v-else class="text-indigo-500">顯示昨日收盤數據</span>
      <template v-if="store.fugleProgress && store.fugleProgress !== 'done'">
        <span class="ml-1 text-yellow-400 animate-pulse font-semibold">⏳ Fugle {{ store.fugleProgress }}</span>
      </template>
      <template v-else>
        <span v-if="fugleKeySet" class="ml-1 text-green-400 font-semibold">✓ Fugle 連次</span>
        <span v-else-if="store.isDailyMode" class="ml-1 text-emerald-400 font-semibold">📊 日K連次</span>
      </template>
      <button
        @click="showFugleSettings = !showFugleSettings"
        class="ml-auto text-indigo-500 hover:text-indigo-300 shrink-0 px-1"
        title="設定 Fugle API Key"
      >⚙</button>
    </div>

    <!-- ── Fugle API Key 設定列 ────────────────────────────────── -->
    <div
      v-if="!isOpen && !store.isLoading && showFugleSettings"
      class="flex flex-col gap-2 px-3 py-2 bg-indigo-950/40 border-b border-indigo-800/40 text-[11px]"
    >
      <!-- API Key 列 -->
      <div class="flex items-center gap-2">
        <span class="text-indigo-400 shrink-0">🔑 Fugle Key</span>
        <input
          v-model="fugleKeyInput"
          type="password"
          placeholder="貼上 Fugle API Key（免費方案即可）"
          class="flex-1 bg-gray-800 text-gray-200 text-[11px] px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-indigo-500 min-w-0"
          @keyup.enter="saveFugleKey"
        />
        <button
          @click="saveFugleKey"
          class="shrink-0 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
        >儲存</button>
        <button
          v-if="fugleKeySet"
          @click="fugleKeyInput = ''; saveFugleKey()"
          class="shrink-0 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-[11px]"
        >清除</button>
      </div>
      <!-- 重新計算列 -->
      <div class="flex items-center gap-2 pt-0.5 border-t border-indigo-800/30">
        <span class="text-indigo-500 flex-1">清除快取，重新從 Fugle 計算連次/連量</span>
        <button
          @click="resetAndReload"
          class="shrink-0 px-2.5 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-medium"
        >🔄 重新計算</button>
      </div>
    </div>

    <!-- ── 載入中 ─────────────────────────────────────────────── -->
    <div v-if="store.isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
      <div class="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-gray-400 text-sm">載入股票資料中...</p>
    </div>

    <template v-else>
      <!-- 狀態列 -->
      <div class="flex justify-between items-center px-3 py-1 text-[11px] text-gray-500 bg-gray-900/40 border-b border-gray-900">
        <span>
          {{ tabLabel }} <b :class="currentList.length ? 'text-white' : 'text-gray-600'">{{ currentList.length }}</b> 檔
          <span v-if="!isOpen && !isLastUpdateToday" class="text-gray-600 ml-1">（前次收盤資料）</span>
        </span>
        <span v-if="store.scanCount < 3 && isOpen" class="text-yellow-500 animate-pulse">⏳ 累積資料中…</span>
        <span v-else class="text-gray-600">更新 {{ lastUpdateStr }}</span>
      </div>

      <!-- 股票列表 -->
      <TransitionGroup name="list" tag="div" class="divide-y divide-gray-800/60">
        <div
          v-for="stock in currentList"
          :key="stock.id"
          :class="[
            'flex items-center px-2 py-1.5 transition-all',
            stock.isNew ? 'bg-amber-950/30 border-l-2 border-amber-400' : 'border-l-2 border-transparent',
            store.activeTab === 'recommended' ? 'bg-orange-950/10' : '',
          ]"
        >
          <!-- K棒 SVG -->
          <div class="w-4 shrink-0 flex justify-center">
            <svg width="8" height="26" viewBox="0 0 8 26">
              <line x1="4" y1="0" x2="4" y2="26"
                :stroke="stock.changePercent >= 0 ? '#f87171' : '#4ade80'"
                stroke-width="1" opacity="0.35"/>
              <rect x="0" :y="kBarY(stock)" width="8" :height="kBarH(stock)"
                :fill="stock.changePercent >= 0 ? '#ef4444' : '#22c55e'" rx="1"/>
            </svg>
          </div>

          <!-- 股票名稱 + 代號 + ★ -->
          <div class="w-[70px] shrink-0 pr-1 min-w-0">
            <div class="flex items-center gap-0.5">
              <span class="text-white text-xs font-medium truncate leading-tight">{{ stock.name }}</span>
              <button
                :class="['text-[10px] leading-none shrink-0', watchlist.has(stock.id) ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500']"
                @click.stop="watchlist.has(stock.id) ? watchlist.remove(stock.id) : watchlist.add(stock.id)"
              >★</button>
            </div>
            <div class="text-gray-500 text-[10px] font-mono leading-tight">{{ stock.id }}</div>
          </div>

          <!-- 成交價 + 漲跌幅 -->
          <div class="w-[62px] shrink-0 text-right">
            <div :class="['font-mono font-bold text-[13px] leading-tight', changeColor(stock.changePercent)]">
              {{ fmtPrice(stock.price) }}
            </div>
            <div :class="['font-mono text-[11px] leading-tight', changeColor(stock.changePercent)]">
              {{ fmtPercent(stock.changePercent) }}
            </div>
          </div>

          <!-- 昨量比 + 昨收漲跌（盤後顯示昨量比，盤中顯示今昨差） -->
          <div class="w-[46px] shrink-0 text-right">
            <div :class="['text-[11px] font-medium leading-tight', ratioColor(stock.volumeVsYesterday)]">
              {{ fmtRatio(stock.volumeVsYesterday) }}
            </div>
            <div v-if="isOpen" :class="['text-[10px] leading-tight', changeColor(stock.yesterdayChangePercent)]">
              昨{{ fmtPercent(stock.yesterdayChangePercent) }}
            </div>
            <div v-else class="text-[10px] leading-tight text-gray-600">
              量比
            </div>
          </div>

          <!-- 連次（boxed） -->
          <div class="w-[28px] shrink-0 flex justify-center">
            <div :class="[
              'w-full text-center font-bold text-[11px] leading-tight border rounded-sm px-0.5',
              stock.consecutiveTicks > 0 ? 'border-red-500/60 text-red-400 bg-red-950/30'
                : stock.consecutiveTicks < 0 ? 'border-green-500/60 text-green-400 bg-green-950/30'
                : 'border-gray-700/50 text-gray-600',
            ]">{{ Math.abs(stock.consecutiveTicks) || '—' }}</div>
          </div>

          <!-- 連量（boxed） -->
          <div class="w-[36px] shrink-0 flex justify-center">
            <div :class="[
              'w-full text-center font-bold text-[11px] leading-tight border rounded-sm px-0.5',
              stock.consecutiveVolume > 0 ? 'border-orange-500/60 text-orange-400 bg-orange-950/30'
                : stock.consecutiveVolume < 0 ? 'border-blue-500/60 text-blue-400 bg-blue-950/30'
                : 'border-gray-700/50 text-gray-600',
            ]">{{ fmtConsecVol(stock.consecutiveVolume) }}</div>
          </div>

          <!-- 成交量 + 周轉率 -->
          <div class="w-[46px] shrink-0 text-right">
            <div class="text-[11px] font-medium text-gray-200 leading-tight">
              {{ stock.volume > 0 ? fmtVolume(stock.volume) : '—' }}
            </div>
            <div class="text-[10px] text-gray-500 leading-tight">
              {{ fmtTurnover(stock.turnoverRate) }}
            </div>
          </div>

          <!-- 即時走勢 sparkline -->
          <div class="flex-1 flex items-center justify-center">
            <svg v-if="stock.recentPrices && stock.recentPrices.length >= 2"
              width="38" height="20" viewBox="0 0 38 20" class="overflow-visible">
              <polyline
                :points="sparkline(stock.recentPrices)"
                fill="none"
                :stroke="sparkColor(stock)"
                stroke-width="1.5"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </svg>
            <span v-else class="text-gray-700 text-[10px]">—</span>
          </div>
        </div>
      </TransitionGroup>

      <!-- 空狀態 -->
      <div v-if="currentList.length === 0" class="flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
        <span class="text-4xl">{{ emptyIcon }}</span>
        <p class="text-sm">{{ emptyMsg }}</p>
      </div>
    </template>

    <!-- ── 排序選擇底部面板 ──────────────────────────────────────── -->
    <Transition name="sheet">
      <div v-if="showSortSheet" class="fixed inset-0 z-50 flex flex-col justify-end" @click.self="showSortSheet = false">
        <!-- 半透明遮罩 -->
        <div class="absolute inset-0 bg-black/60" @click="showSortSheet = false"></div>

        <!-- 面板主體 -->
        <div class="relative bg-gray-900 rounded-t-2xl pb-safe overflow-hidden">
          <!-- 把手 -->
          <div class="flex justify-center pt-3 pb-1">
            <div class="w-10 h-1 bg-gray-600 rounded-full"></div>
          </div>

          <div class="px-4 pb-2 text-center text-gray-400 text-xs">選擇排序方式</div>

          <!-- 排序選項 -->
          <div class="divide-y divide-gray-800">
            <div
              v-for="opt in sortOptions"
              :key="opt.field + opt.asc"
              @click="applySort(opt)"
              class="flex items-center px-5 py-3.5 active:bg-gray-800 cursor-pointer"
            >
              <!-- 勾選狀態 -->
              <span class="w-5 text-orange-400 text-sm">
                {{ store.sortField === opt.field && store.sortAsc === opt.asc ? '✓' : '' }}
              </span>
              <!-- 欄位名 -->
              <span class="flex-1 text-white text-sm">{{ opt.label }}</span>
              <!-- 方向 -->
              <span :class="['text-xs font-medium px-2 py-0.5 rounded-full', opt.asc ? 'bg-blue-900 text-blue-300' : 'bg-red-900 text-red-300']">
                {{ opt.asc ? '↑ 低 → 高' : '↓ 高 → 低' }}
              </span>
            </div>
          </div>

          <!-- 取消 -->
          <button
            @click="showSortSheet = false"
            class="w-full py-4 text-gray-400 text-sm font-medium border-t border-gray-800 mt-1"
          >取消</button>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useScannerStore } from '@/stores/scanner.js'
import { useWatchlistStore } from '@/stores/watchlist.js'
import { getMarketStatus, isMarketOpen } from '@/composables/useMarketHours.js'
import { getFugleApiKey, setFugleApiKey, hasFugleApiKey } from '@/services/fugle.js'
import {
  fmtPrice, fmtPercent, fmtRatio, fmtDeltaVol, fmtConsecVol, fmtVolume, fmtTurnover,
  changeColor, ratioColor,
} from '@/utils/formatters.js'

const store     = useScannerStore()
const watchlist = useWatchlistStore()

// ── Tab 定義（完整仿照當沖飆股神手） ───────────────────────────
const tabs = [
  // ── Tab 1 強勢 ───────────────────────────────────────────────
  { value: 'warrantLong',      label: '權證做多 🎯',    desc: '權證做多' },
  { value: 'instBuy',          label: '主投買進 💼',    desc: '主投買進' },
  { value: 'instBuyUp',        label: '主投買沿上 🏔',  desc: '主投買沿上' },
  { value: 'surging',          label: '飆風向上 🌪',    desc: '飆風向上' },
  { value: 'bollingerLong',    label: '布林多味 📊',    desc: '布林多味' },
  // ── Tab 2 弱勢 ───────────────────────────────────────────────
  { value: 'warrantShort',     label: '權證做空 🎯📉',  desc: '權證做空' },
  { value: 'instSell',         label: '主投賣出 💼📉',  desc: '主投賣出' },
  { value: 'bollingerWeak',    label: '布林下軌 📊📉',  desc: '弱勢沿下軌' },
  // ── Tab 3 週轉率 ─────────────────────────────────────────────
  { value: 'highTurnoverRisk', label: '換手高危 🚨',    desc: '換手高危' },
  { value: 'capitalFocus',     label: '資金焦點 🟠',    desc: '資金關注焦點' },
  // ── 其他輔助 ────────────────────────────────────────────────
  { value: 'strong',           label: '強勢 🔴',        desc: '強勢' },
  { value: 'weak',             label: '弱勢 🟢',        desc: '弱勢' },
  { value: 'longCandidate',    label: '做多 📈',        desc: '做多候選' },
  { value: 'shortCandidate',   label: '做空 📉',        desc: '做空候選' },
  { value: 'capitalAttention', label: '資金關注 🔍',    desc: '資金關注焦點' },
  { value: 'volumeUp',         label: '量增價漲 🔼',    desc: '量增價漲' },
  { value: 'volumeDown',       label: '縮量上漲 🔽',    desc: '縮量上漲' },
  { value: 'highTurnover',     label: '大量換手 ⚡',     desc: '大量換手' },
  { value: 'limitUp',          label: '近漲停 🚀',      desc: '近漲停' },
  { value: 'limitDown',        label: '近跌停 💀',      desc: '近跌停' },
  { value: 'recommended',      label: '推薦飆股 ⭐',    desc: '推薦飆股' },
  { value: 'watchlistTab',     label: '自選股 ☆',       desc: '自選股' },
  { value: 'all',              label: '全部',            desc: '全部' },
]

// 哪些 tab 需要顯示連次門檻設定
const THRESHOLD_TABS = new Set(['strong', 'weak', 'capitalFocus'])

const showThreshold = computed(() => THRESHOLD_TABS.has(store.activeTab))

// ── 時鐘 & 市場狀態 ────────────────────────────────────────────
const currentTime  = ref('')
const marketStatus = ref(getMarketStatus())
const isOpen       = ref(isMarketOpen())
let clockTimer = null

function updateClock() {
  currentTime.value  = new Date().toLocaleTimeString('zh-TW', { hour12: false })
  marketStatus.value = getMarketStatus()
  isOpen.value       = isMarketOpen()
}

onMounted(() => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  if (!store.isInitialized) store.init()
})
onUnmounted(() => clearInterval(clockTimer))

// ── 目前顯示清單 ───────────────────────────────────────────────
const currentList = computed(() => {
  if (store.activeTab === 'recommended') return store.recommended
  if (store.activeTab === 'watchlistTab') {
    const wIds = new Set(watchlist.items || [])
    // 直接從 quotes 取，不受 yesterdayVolume 過濾限制（避免手動加入的低流動性股票消失）
    return store.applySort(Object.values(store.quotes).filter(s => wIds.has(s.id)))
  }
  // 'all' tab：全部股票，排序後取前100（避免渲染幾百行）
  if (store.activeTab === 'all') return store.allPoolStocks.slice(0, 100)
  // 其他 tab：篩選後取前50（篩選結果通常不多，但避免極端情況）
  return store.signals.slice(0, 50)
})

// 當前 tab 的文字描述（用於狀態列）
const tabLabel = computed(() => {
  const t = tabs.find(t => t.value === store.activeTab)
  return t ? t.desc : ''
})

// ── 最後更新時間 ───────────────────────────────────────────────
const lastUpdateStr = computed(() => {
  if (!store.lastUpdate) return '--'
  const d = store.lastUpdate
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('zh-TW', { hour12: false })
    : d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) +
      ' ' + d.toLocaleTimeString('zh-TW', { hour12: false })
})

const isLastUpdateToday = computed(() =>
  store.lastUpdate != null && store.lastUpdate.toDateString() === new Date().toDateString()
)

// ── 空狀態提示 ─────────────────────────────────────────────────
const emptyIcon = computed(() => {
  const map = {
    // Tab 1 強勢
    warrantLong: '🎯', instBuy: '💼', instBuyUp: '🏔', surging: '🌪', bollingerLong: '📊',
    // Tab 2 弱勢
    warrantShort: '🎯', instSell: '💼', bollingerWeak: '📊',
    // Tab 3 週轉率
    highTurnoverRisk: '🚨', capitalFocus: '🟠',
    // 其他
    strong: '🔴', weak: '🟢', longCandidate: '📈', shortCandidate: '📉',
    capitalAttention: '🔍', volumeUp: '🔼', volumeDown: '🔽', highTurnover: '⚡',
    limitUp: '🚀', limitDown: '💀', recommended: '⭐', watchlistTab: '☆', all: '🔍',
  }
  return map[store.activeTab] || '🔍'
})
const emptyMsg = computed(() => {
  const t   = store.threshold
  const cvt = store.connVolumeThreshold
  const msgs = {
    watchlistTab:  '尚未加入自選股，點 ★ 加入',
    recommended:   '盤中累積資料後自動顯示推薦（連漲≥2次 + 有連量 + 今漲 + 量比≥1.5x）',
    limitUp:       '目前無股票接近漲停板 (≥9%)',
    limitDown:     '目前無股票接近跌停板 (≤-9%)',
    // ── 其他輔助 ─────────────────────────────────────────────────
    strong:        `目前無強勢股（連漲≥${t}次 + 今日上漲）`,
    weak:          `目前無弱勢股（連跌≥${t}次 + 今日下跌）`,
    volumeUp:      '目前無量增價漲（漲≥1% + 量比≥2x）',
    volumeDown:    '目前無縮量上漲（漲≥1% + 量比0~0.7x + 成交量≥200張）',
    highTurnover:  '目前無大量換手（量比≥2.5x + 今日上漲）',
    longCandidate: '目前無做多候選（漲≥2% + 連漲≥2次 + 量比≥1.5x）',
    shortCandidate:'目前無做空候選（跌≥2% + 連跌≥2次 + 量比≥1.5x）',
    capitalAttention: '目前無資金關注焦點（漲≥2% + 連漲≥3次 + 連量≥300張 + 量比≥2x）',
    // ── Tab 1 強勢 ───────────────────────────────────────────────
    warrantLong:   `目前無權證做多標的（漲+2%~+9.5% + 量比≥1.2x + 月線多頭 + 價>MA20 + 連次≥1 + 連量≥${cvt}張）`,
    instBuy:       '目前無主投買進特徵（連漲≥2次 + 連量≥200張 + 今漲 + 量比≥1.5x）',
    instBuyUp:     '目前無主投買沿上特徵（連漲≥5次 + 連量≥200張 + 漲≥1.5% + 量比≥1.3x）',
    surging:       '目前無飆風向上股（連漲≥3次+有連量+今漲，或 漲≥3%+量比≥2x）',
    bollingerLong: '目前無布林多味股（突破中軌且靠近上軌 + 布林開口放大 + 今漲）',
    // ── Tab 2 弱勢 ───────────────────────────────────────────────
    warrantShort:  `目前無權證做空標的（跌-2%~-9.5% + 量比≥1.2x + 月線空頭 + 價<MA20 + 連次≤-1 + 連量≥${cvt}張）`,
    instSell:      '目前無主投賣出特徵（連跌≥2次 + 連量≤-200張 + 今跌 + 量比≥1.5x）',
    bollingerWeak: '目前無弱勢沿下軌股（貼近布林下軌 + 月線下彎 + 量能增加 + 今跌）',
    // ── Tab 3 週轉率 ─────────────────────────────────────────────
    highTurnoverRisk: '目前無換手高危訊號（週轉率≥15% + 量比≥2x + 今漲≥5% + 昨漲≥3%）',
    capitalFocus:  '目前無資金關注焦點（量比>1.5x + 週轉率>5% + 今漲）',
  }
  return msgs[store.activeTab] || '目前無符合條件的股票，可降低門檻或等待訊號'
})

// ── Fugle API Key 設定 ────────────────────────────────────────
const showFugleSettings = ref(false)
const fugleKeyInput     = ref(getFugleApiKey())
const fugleKeySet       = ref(hasFugleApiKey())

function saveFugleKey() {
  setFugleApiKey(fugleKeyInput.value)
  fugleKeySet.value = hasFugleApiKey()
  showFugleSettings.value = false
}

function resetAndReload() {
  localStorage.removeItem('scanner_quotes_v2')
  location.reload()
}

// ── 排序底部面板 ──────────────────────────────────────────────
const showSortSheet = ref(false)

const sortOptions = [
  { field: 'consecutiveVolume', asc: false, label: '連量' },
  { field: 'consecutiveVolume', asc: true,  label: '連量' },
  { field: 'consecutiveTicks',  asc: false, label: '連次' },
  { field: 'consecutiveTicks',  asc: true,  label: '連次' },
  { field: 'changePercent',     asc: false, label: '漲跌幅' },
  { field: 'changePercent',     asc: true,  label: '漲跌幅' },
  { field: 'volumeVsYesterday', asc: false, label: '昨量比' },
  { field: 'volumeVsYesterday', asc: true,  label: '昨量比' },
  { field: 'volume',            asc: false, label: '成交量' },
  { field: 'volume',            asc: true,  label: '成交量' },
]

const SORT_LABELS = {
  consecutiveVolume: '連量', consecutiveTicks: '連次',
  changePercent: '漲跌幅', volumeVsYesterday: '昨量比', volume: '成交量',
}

const currentSortLabel = computed(() => {
  const name = SORT_LABELS[store.sortField] || store.sortField
  const dir  = store.sortAsc ? '↑低→高' : '↓高→低'
  return `${name} ${dir}`
})

function applySort(opt) {
  store.sortField = opt.field
  store.sortAsc   = opt.asc
  showSortSheet.value = false
}

// ── 排序輔助 ───────────────────────────────────────────────────
function sortHeaderCls(field) {
  return store.sortField === field
    ? 'text-orange-400 cursor-pointer'
    : 'text-gray-500 cursor-pointer'
}
function sortArrow(field) {
  if (store.sortField !== field) return ''
  return store.sortAsc ? '↑低→高' : '↓高→低'
}

// ── K棒 ────────────────────────────────────────────────────────
function kBarH(s) {
  const pct = Math.abs(s.changePercent || 0)
  return Math.min(18, Math.max(3, pct * 2.5))
}
function kBarY(s) {
  const h = kBarH(s)
  return (s.changePercent || 0) >= 0 ? (13 - h) : 13
}

// ── Sparkline ──────────────────────────────────────────────────
function sparkline(prices) {
  const w = 38, h = 18
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 0.01
  return prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w
    const y = h - ((p - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
function sparkColor(s) {
  const prices = s.recentPrices || []
  if (prices.length < 2) return '#6b7280'
  return prices[prices.length - 1] >= prices[0] ? '#f87171' : '#4ade80'
}
</script>

<style scoped>
/* tab 橫向捲動列：桌機顯示細捲軸，手機觸控滑動無捲軸 */
.tab-scroller { -webkit-overflow-scrolling: touch; }
.tab-scroller::-webkit-scrollbar { height: 3px; }
.tab-scroller::-webkit-scrollbar-track { background: transparent; }
.tab-scroller::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 2px; }
@supports (scrollbar-width: thin) {
  .tab-scroller { scrollbar-width: thin; scrollbar-color: #4b5563 transparent; }
}

.list-move         { transition: transform 0.3s ease; }
.list-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.list-leave-active { transition: opacity 0.15s ease; position: absolute; width: 100%; }
.list-enter-from   { opacity: 0; transform: translateX(-10px); }
.list-leave-to     { opacity: 0; }

/* 底部面板動畫 */
.sheet-enter-active, .sheet-leave-active { transition: opacity 0.2s ease; }
.sheet-enter-active .relative, .sheet-leave-active .relative { transition: transform 0.25s ease; }
.sheet-enter-from { opacity: 0; }
.sheet-enter-from .relative { transform: translateY(100%); }
.sheet-leave-to { opacity: 0; }
.sheet-leave-to .relative { transform: translateY(100%); }
</style>
