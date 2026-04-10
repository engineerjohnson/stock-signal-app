<template>
  <div class="min-h-screen bg-gray-950 pb-16 select-none">

    <!-- ── Header ─────────────────────────────────────────────── -->
    <header class="sticky top-0 z-20 bg-gray-950 border-b border-gray-800">

      <!-- 頂列：標題 + 時間 -->
      <div class="flex items-center justify-between px-3 py-2">
        <h1 class="text-white font-bold text-sm tracking-wide">📈 飆股雷達</h1>
        <div class="flex items-center gap-2">
          <span :class="['text-[11px] font-medium px-2 py-0.5 rounded-full', marketStatus.cls]">
            {{ marketStatus.text }}
          </span>
          <span class="text-gray-400 text-[11px] font-mono tabular-nums">{{ currentTime }}</span>
        </div>
      </div>

      <!-- Tab 列 -->
      <div class="flex border-b border-gray-800">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          :class="[
            'flex-1 py-1.5 text-xs font-medium transition-colors',
            store.activeTab === tab.value
              ? 'text-white border-b-2 border-orange-400'
              : 'text-gray-500 hover:text-gray-300',
          ]"
          @click="store.activeTab = tab.value"
        >{{ tab.label }}</button>
      </div>

      <!-- 連次門檻（僅盤中、且非「全部/推薦」tab 顯示） -->
      <div
        v-if="isOpen && store.activeTab !== 'recommended' && store.activeTab !== 'all'"
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

      <!-- 欄位標題列（可點擊排序） -->
      <div v-if="!store.isLoading" class="flex items-center px-2 py-1 bg-gray-900 border-b border-gray-800 text-[10px] text-gray-500">
        <div class="w-3 shrink-0"></div>
        <div class="w-[72px] shrink-0 pl-1">K棒/股票</div>
        <div
          class="w-[68px] shrink-0 text-right cursor-pointer"
          :class="sortHighlight('changePercent')"
          @click="store.setSort('changePercent')"
        >成交價<br>漲跌幅{{ sortArrow('changePercent') }}</div>
        <div class="w-[50px] shrink-0 text-right text-[9px] leading-tight">昨量比<br>昨漲幅</div>
        <div
          class="w-[52px] shrink-0 text-center cursor-pointer leading-tight"
          @click="onSortTicksVol"
        >
          <span :class="sortHighlight('consecutiveTicks')">連次{{ sortArrow('consecutiveTicks') }}</span>
          <span class="text-gray-700 mx-0.5">/</span>
          <span :class="sortHighlight('consecutiveVolume')">連量{{ sortArrow('consecutiveVolume') }}</span>
        </div>
        <div
          class="w-[46px] shrink-0 text-right cursor-pointer leading-tight"
          :class="sortHighlight('turnoverRate')"
          @click="store.setSort('turnoverRate')"
        >週轉率<br>{{ sortArrow('turnoverRate') }}</div>
        <div class="flex-1 text-center">走勢</div>
      </div>
    </header>

    <!-- ── 收盤 banner ─────────────────────────────────────────── -->
    <div
      v-if="!isOpen && !store.isLoading"
      class="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 border-b border-gray-700 text-[11px] text-gray-400"
    >
      🌙 收盤，顯示最後交易資料（{{ currentList.length }} 檔）
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
          <template v-if="store.activeTab === 'recommended'">推薦 <b class="text-orange-400">{{ currentList.length }}</b> 檔</template>
          <template v-else-if="store.activeTab === 'capitalFocus'">資金焦點 <b class="text-orange-400">{{ currentList.length }}</b> 檔</template>
          <template v-else-if="store.activeTab === 'highTurnover'">高換手 <b class="text-orange-400">{{ currentList.length }}</b> 檔</template>
          <template v-else-if="isOpen">訊號 <b class="text-white">{{ currentList.length }}</b> 檔</template>
          <template v-else>股票 <b class="text-white">{{ currentList.length }}</b> 檔</template>
        </span>
        <span v-if="store.scanCount < 3 && isOpen" class="text-yellow-500 animate-pulse">累積資料中…</span>
        <span v-else>更新 {{ lastUpdateStr }}</span>
      </div>

      <!-- 股票列表 -->
      <TransitionGroup name="list" tag="div" class="divide-y divide-gray-800/60">
        <div
          v-for="stock in currentList"
          :key="stock.id"
          :class="[
            'flex items-center px-2 py-2 transition-all',
            stock.isNew ? 'bg-amber-950/30 border-l-2 border-amber-400' : 'border-l-2 border-transparent',
            store.activeTab === 'recommended' ? 'bg-orange-950/10' : '',
          ]"
        >
          <!-- K棒 -->
          <div class="w-3 shrink-0 mr-1">
            <svg width="10" height="28" viewBox="0 0 10 28">
              <!-- wick -->
              <line x1="5" y1="0" x2="5" y2="28" :stroke="stock.changePercent >= 0 ? '#f87171' : '#4ade80'" stroke-width="1" opacity="0.4"/>
              <!-- body -->
              <rect
                x="1"
                :y="kBarY(stock)"
                width="8"
                :height="kBarH(stock)"
                :fill="stock.changePercent >= 0 ? '#ef4444' : '#22c55e'"
                rx="1"
              />
            </svg>
          </div>

          <!-- 股票名稱 + 代號 + 收藏 -->
          <div class="w-[72px] shrink-0 pr-1 min-w-0">
            <div class="flex items-center gap-0.5">
              <span class="text-white text-xs font-medium truncate leading-tight">{{ stock.name }}</span>
              <button
                :class="['text-[10px] leading-none shrink-0', watchlist.has(stock.id) ? 'text-yellow-400' : 'text-gray-700']"
                @click.stop="watchlist.has(stock.id) ? watchlist.remove(stock.id) : watchlist.add(stock.id)"
              >★</button>
            </div>
            <div class="text-gray-500 text-[10px] font-mono">{{ stock.id }}</div>
          </div>

          <!-- 成交價 + 漲跌幅 -->
          <div class="w-[68px] shrink-0 text-right">
            <div :class="['font-mono font-bold text-sm leading-tight', changeColor(stock.changePercent)]">
              {{ fmtPrice(stock.price) }}
            </div>
            <div :class="['font-mono text-[11px]', changeColor(stock.changePercent)]">
              {{ fmtPercent(stock.changePercent) }}
            </div>
          </div>

          <!-- 昨量比 + 昨漲幅 -->
          <div class="w-[50px] shrink-0 text-right">
            <div :class="['text-[11px] font-medium', ratioColor(stock.volumeVsYesterday)]">
              {{ fmtRatio(stock.volumeVsYesterday) }}
            </div>
            <div :class="['text-[10px]', changeColor(stock.yesterdayChangePercent)]">
              {{ fmtPercent(stock.yesterdayChangePercent) }}
            </div>
          </div>

          <!-- 連次 / 連量 (boxed) -->
          <div class="w-[52px] shrink-0 flex flex-col items-center">
            <div
              :class="[
                'w-full text-center font-bold text-[11px] leading-tight border rounded-sm px-0.5',
                stock.consecutiveTicks !== 0
                  ? (stock.consecutiveTicks > 0 ? 'border-red-500/60 text-red-400 bg-red-950/30' : 'border-green-500/60 text-green-400 bg-green-950/30')
                  : 'border-gray-700 text-gray-500',
              ]"
            >{{ Math.abs(stock.consecutiveTicks) || '—' }}</div>
            <div class="w-full border-t border-gray-700 my-0.5"></div>
            <div
              :class="[
                'w-full text-center font-bold text-[11px] leading-tight border rounded-sm px-0.5',
                stock.consecutiveVolume !== 0
                  ? (stock.consecutiveVolume > 0 ? 'border-orange-500/60 text-orange-400 bg-orange-950/30' : 'border-blue-500/60 text-blue-400 bg-blue-950/30')
                  : 'border-gray-700 text-gray-500',
              ]"
            >{{ fmtConsecVol(stock.consecutiveVolume) }}</div>
          </div>

          <!-- 週轉率 -->
          <div class="w-[46px] shrink-0 text-right">
            <div class="text-[12px] font-medium text-gray-200 leading-tight">
              {{ stock.turnoverRate > 0 ? stock.turnoverRate.toFixed(1) + '%' : '—' }}
            </div>
            <div class="text-[10px] text-gray-500">
              {{ fmtDeltaVol(stock.lastDeltaVol) }}
            </div>
          </div>

          <!-- 即時走勢 sparkline -->
          <div class="flex-1 flex items-center justify-center">
            <svg v-if="stock.recentPrices && stock.recentPrices.length >= 2"
              width="40" height="22" viewBox="0 0 40 22" class="overflow-visible">
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
      <div v-if="currentList.length === 0" class="flex flex-col items-center justify-center py-24 gap-3 text-gray-600">
        <span class="text-5xl">🔍</span>
        <p class="text-sm">目前無符合條件的股票</p>
        <p v-if="store.activeTab !== 'recommended'" class="text-xs">降低門檻或等待訊號出現</p>
        <p v-else class="text-xs">盤中累積資料後自動顯示推薦</p>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useScannerStore } from '@/stores/scanner.js'
import { useWatchlistStore } from '@/stores/watchlist.js'
import { getMarketStatus, isMarketOpen } from '@/composables/useMarketHours.js'
import {
  fmtPrice, fmtPercent, fmtRatio, fmtDeltaVol, fmtConsecVol,
  changeColor, ratioColor,
} from '@/utils/formatters.js'

const store     = useScannerStore()
const watchlist = useWatchlistStore()

const tabs = [
  { value: 'strong',       label: '強勢 🔴' },
  { value: 'weak',         label: '弱勢 🟢' },
  { value: 'capitalFocus', label: '資金焦點 🟠' },
  { value: 'highTurnover', label: '高換手 ⚡' },
  { value: 'recommended',  label: '推薦 ⭐' },
  { value: 'all',          label: '全部' },
]

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
  if (!isOpen.value) return store.allPoolStocks  // 收盤後固定顯示全部
  return store.signals
})

// ── 最後更新時間 ───────────────────────────────────────────────
const lastUpdateStr = computed(() => {
  if (!store.lastUpdate) return '--'
  return store.lastUpdate.toLocaleTimeString('zh-TW', { hour12: false })
})

// ── 排序輔助 ───────────────────────────────────────────────────
function sortHighlight(field) {
  return store.sortField === field ? 'text-orange-400' : ''
}
function sortArrow(field) {
  if (store.sortField !== field) return ''
  return store.sortAsc ? '↑' : '↓'
}
// 點連次/連量欄：交替切換兩個 field
function onSortTicksVol() {
  if (store.sortField === 'consecutiveTicks') {
    store.setSort('consecutiveVolume')
  } else {
    store.setSort('consecutiveTicks')
  }
}

// ── K棒 ────────────────────────────────────────────────────────
function kBarH(s) {
  const pct = Math.abs(s.changePercent || 0)
  return Math.min(20, Math.max(3, pct * 3))
}
function kBarY(s) {
  const h = kBarH(s)
  const isUp = (s.changePercent || 0) >= 0
  return isUp ? (14 - h) : 14
}

// ── Sparkline ──────────────────────────────────────────────────
function sparkline(prices) {
  const w = 40, h = 20
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
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
.list-move         { transition: transform 0.35s ease; }
.list-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.list-leave-active { transition: opacity 0.2s ease; position: absolute; width: 100%; }
.list-enter-from   { opacity: 0; transform: translateX(-12px); }
.list-leave-to     { opacity: 0; }
</style>
