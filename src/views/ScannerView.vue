<template>
  <div class="min-h-screen bg-slate-900 pb-16">

    <!-- ── Header ───────────────────────────────────────────── -->
    <header class="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-4 py-2.5">
      <div class="flex items-center justify-between">
        <h1 class="text-white font-bold text-base tracking-wide">📈 當沖飆股神手</h1>
        <div class="flex items-center gap-2">
          <span :class="['text-xs font-medium px-2 py-0.5 rounded-full', marketStatus.cls]">
            {{ marketStatus.text }}
          </span>
          <span class="text-slate-400 text-xs font-mono tabular-nums">{{ currentTime }}</span>
        </div>
      </div>
    </header>

    <!-- ── 收盤模式 Banner ────────────────────────────────────── -->
    <div
      v-if="!isOpen && !store.isLoading"
      class="flex items-center gap-2 px-4 py-2 bg-slate-700/50 border-b border-slate-600 text-xs text-slate-300"
    >
      <span>🌙</span>
      <span>收盤，顯示最後交易資料（共 {{ store.allPoolStocks.length }} 檔，依連量連次排序）</span>
    </div>

    <!-- ── Tab：強勢 / 弱勢 / 全部（僅盤中顯示） ─────────────── -->
    <div v-if="isOpen" class="flex bg-slate-800 border-b border-slate-700">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        :class="[
          'flex-1 py-2 text-sm font-medium transition-colors',
          store.activeTab === tab.value
            ? 'text-white border-b-2 border-blue-500'
            : 'text-slate-400 hover:text-slate-200',
        ]"
        @click="store.activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ── 連次門檻篩選（僅盤中顯示） ───────────────────────── -->
    <div v-if="isOpen" class="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
      <span class="text-slate-400 text-xs shrink-0">連次門檻</span>
      <div class="flex gap-1.5">
        <button
          v-for="t in [2, 3, 5]"
          :key="t"
          :class="[
            'px-3 py-1 text-xs rounded-full transition-colors font-medium',
            store.threshold === t
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600',
          ]"
          @click="store.threshold = t"
        >
          {{ t }}次
        </button>
      </div>
    </div>

    <!-- ── 載入中 ─────────────────────────────────────────────── -->
    <div v-if="store.isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
      <span class="loading loading-spinner loading-md text-blue-400"></span>
      <p class="text-slate-400 text-sm">載入股票資料中...</p>
    </div>

    <template v-else>

      <!-- ════════════════════════════════════════════════════════
           盤中模式：顯示訊號清單
           ════════════════════════════════════════════════════════ -->
      <template v-if="isOpen">
        <!-- 狀態列 -->
        <div class="flex justify-between items-center px-4 py-1.5 bg-slate-800/40 text-xs text-slate-400 border-b border-slate-800">
          <span>訊號 <b class="text-white">{{ store.signals.length }}</b> 檔</span>
          <span v-if="store.scanCount < 3" class="text-yellow-500 animate-pulse">累積資料中...</span>
          <span v-else>更新 {{ lastUpdateStr }}</span>
        </div>

        <!-- 訊號清單 -->
        <TransitionGroup name="list" tag="div" class="divide-y divide-slate-800">
          <div
            v-for="stock in store.signals"
            :key="stock.id"
            :class="[
              'px-4 py-3 transition-all',
              stock.isNew
                ? 'bg-amber-950/40 border-l-4 border-amber-400'
                : 'bg-slate-900 border-l-4 border-transparent',
            ]"
          >
            <StockRow :stock="stock" @toggle-watchlist="toggleWatchlist" :in-watchlist="watchlist.has(stock.id)" />
          </div>
        </TransitionGroup>

        <!-- 空狀態 -->
        <div v-if="store.signals.length === 0" class="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
          <span class="text-5xl">🔍</span>
          <p class="text-sm">目前無符合條件的股票</p>
          <p class="text-xs">降低門檻或等待訊號出現</p>
        </div>
      </template>

      <!-- ════════════════════════════════════════════════════════
           收盤模式：顯示全部母池（依昨日量排序）
           ════════════════════════════════════════════════════════ -->
      <template v-else>
        <div class="divide-y divide-slate-800">
          <div
            v-for="stock in store.allPoolStocks"
            :key="stock.id"
            class="px-4 py-3 bg-slate-900 border-l-4 border-transparent"
          >
            <StockRow :stock="stock" @toggle-watchlist="toggleWatchlist" :in-watchlist="watchlist.has(stock.id)" />
          </div>
        </div>
      </template>

    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, defineComponent, h } from 'vue'
import { useScannerStore } from '@/stores/scanner.js'
import { useWatchlistStore } from '@/stores/watchlist.js'
import { getMarketStatus, isMarketOpen } from '@/composables/useMarketHours.js'
import {
  fmtPrice, fmtPercent, fmtRatio, fmtTurnover, fmtTick, fmtVol, fmtDeltaVol,
  changeColor, tickColor, volColor, ratioColor,
} from '@/utils/formatters.js'

const store     = useScannerStore()
const watchlist = useWatchlistStore()

const tabs = [
  { value: 'strong', label: '強勢股 🔴' },
  { value: 'weak',   label: '弱勢股 🟢' },
  { value: 'all',    label: '全部'       },
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

// ── 最後更新時間 ───────────────────────────────────────────────
const lastUpdateStr = computed(() => {
  if (!store.lastUpdate) return '--'
  return store.lastUpdate.toLocaleTimeString('zh-TW', { hour12: false })
})

// ── 自選股切換 ─────────────────────────────────────────────────
function toggleWatchlist(id) {
  watchlist.has(id) ? watchlist.remove(id) : watchlist.add(id)
}

// ── 股票列元件（抽出避免重複 template 邏輯）────────────────────
const StockRow = defineComponent({
  props: {
    stock:         { type: Object,  required: true },
    inWatchlist:   { type: Boolean, default: false },
  },
  emits: ['toggle-watchlist'],
  setup(props, { emit }) {
    return () => {
      const s = props.stock

      const row1 = h('div', { class: 'flex items-center justify-between mb-1.5' }, [
        h('div', { class: 'flex items-center gap-2 min-w-0' }, [
          s.isNew
            ? h('span', { class: 'text-amber-400 text-xs font-bold animate-flash shrink-0' }, '⚡')
            : null,
          h('span', { class: 'text-white font-mono font-bold text-sm shrink-0' }, s.id),
          h('span', { class: 'text-slate-300 text-sm truncate' }, s.name),
        ]),
        h('div', { class: 'flex items-center gap-2 shrink-0 ml-2' }, [
          h('span', { class: `font-mono font-bold text-sm ${changeColor(s.changePercent)}` },
            fmtPrice(s.price)),
          h('span', { class: `font-mono text-xs font-medium ${changeColor(s.changePercent)}` },
            fmtPercent(s.changePercent)),
          h('button', {
            class: `text-base leading-none transition-colors ${props.inWatchlist ? 'text-yellow-400' : 'text-slate-600'}`,
            onClick: () => emit('toggle-watchlist', s.id),
          }, '★'),
        ]),
      ])

      const row2 = h('div', { class: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs' }, [
        h('span', { class: `font-bold ${tickColor(s.consecutiveTicks)}` },
          fmtTick(s.consecutiveTicks)),
        h('span', { class: `font-bold ${volColor(s.consecutiveVolume)}` },
          fmtVol(s.consecutiveVolume)),
        h('span', { class: 'text-slate-400' }, [
          '每筆 ',
          h('b', { class: 'text-white' }, fmtDeltaVol(s.lastDeltaVol)),
        ]),
        h('span', { class: 'text-slate-400' }, [
          '週轉 ',
          h('b', { class: 'text-slate-200' }, fmtTurnover(s.turnoverRate)),
        ]),
        h('span', { class: ratioColor(s.volumeVsYesterday) }, [
          '昨量 ',
          h('b', {}, fmtRatio(s.volumeVsYesterday)),
        ]),
        h('span', { class: changeColor(s.yesterdayChangePercent) },
          `昨漲 ${fmtPercent(s.yesterdayChangePercent)}`),
      ])

      return h('div', {}, [row1, row2])
    }
  },
})
</script>

<style scoped>
.list-move         { transition: transform 0.4s ease; }
.list-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.list-leave-active { transition: opacity 0.2s ease; position: absolute; width: 100%; }
.list-enter-from   { opacity: 0; transform: translateX(-16px); }
.list-leave-to     { opacity: 0; }
</style>
