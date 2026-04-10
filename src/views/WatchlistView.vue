<template>
  <div class="min-h-screen bg-slate-900 pb-16">

    <!-- ── Header ───────────────────────────────────────────── -->
    <header class="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-4 py-2.5">
      <div class="flex items-center justify-between">
        <h1 class="text-white font-bold text-base">⭐ 自選股</h1>
        <button
          class="btn btn-sm btn-outline border-slate-600 text-slate-300 hover:bg-slate-700"
          @click="showAddModal = true"
        >
          + 新增
        </button>
      </div>
    </header>

    <!-- ── 新增自選股 Modal ─────────────────────────────────── -->
    <dialog :open="showAddModal" class="modal modal-bottom">
      <div class="modal-box bg-slate-800 pb-6">
        <h3 class="font-bold text-white mb-4">新增自選股</h3>
        <div class="flex gap-2">
          <input
            v-model="addInput"
            type="text"
            inputmode="numeric"
            placeholder="輸入股票代碼（如 2330）"
            maxlength="6"
            class="input input-bordered flex-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            @keyup.enter="confirmAdd"
          />
          <button class="btn btn-primary" @click="confirmAdd">加入</button>
        </div>
        <p v-if="addError" class="text-red-400 text-xs mt-2">{{ addError }}</p>
        <div class="modal-action mt-4">
          <button class="btn btn-ghost text-slate-400" @click="closeModal">取消</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop bg-black/50" @click="closeModal">
        <button>close</button>
      </form>
    </dialog>

    <!-- ── 載入中 ─────────────────────────────────────────────── -->
    <div v-if="store.isLoading" class="flex justify-center py-24">
      <span class="loading loading-spinner loading-md text-blue-400"></span>
    </div>

    <!-- ── 空狀態 ─────────────────────────────────────────────── -->
    <div
      v-else-if="watchlist.items.length === 0"
      class="flex flex-col items-center justify-center py-24 gap-3 text-slate-500"
    >
      <span class="text-5xl">⭐</span>
      <p class="text-sm">尚無自選股</p>
      <p class="text-xs">點右上角「+ 新增」加入監控</p>
    </div>

    <!-- ── 自選股清單 ─────────────────────────────────────────── -->
    <div v-else class="divide-y divide-slate-800">
      <WatchlistRow
        v-for="id in watchlist.items"
        :key="id"
        :stock-id="id"
        @remove="watchlist.remove(id)"
      />
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, defineComponent, h, computed } from 'vue'
import { useScannerStore } from '@/stores/scanner.js'
import { useWatchlistStore } from '@/stores/watchlist.js'
import {
  fmtPrice, fmtPercent, fmtRatio, fmtTurnover, fmtTick, fmtVol, fmtDeltaVol,
  changeColor, tickColor, volColor, ratioColor,
} from '@/utils/formatters.js'

const store     = useScannerStore()
const watchlist = useWatchlistStore()

const showAddModal = ref(false)
const addInput     = ref('')
const addError     = ref('')

onMounted(() => {
  if (!store.isInitialized) store.init()
})

function confirmAdd() {
  addError.value = ''
  const id = watchlist.add(addInput.value)
  if (!id) {
    addError.value = '代碼無效或已在清單中（請輸入 4 位數字）'
    return
  }
  addInput.value = ''
  closeModal()
}

function closeModal() {
  showAddModal.value = false
  addInput.value    = ''
  addError.value    = ''
}

// ── 自選股單行元件（避免 template 內反覆呼叫 getStock）──────────
const WatchlistRow = defineComponent({
  props: {
    stockId: { type: String, required: true },
  },
  emits: ['remove'],
  setup(props, { emit }) {
    const stock = computed(() => store.getStock(props.stockId))

    return () => {
      const s = stock.value

      // 尚未載入時的佔位列
      if (!s) {
        return h('div', { class: 'flex items-center gap-2 px-4 py-3' }, [
          h('span', { class: 'text-white font-mono font-bold text-sm' }, props.stockId),
          h('span', { class: 'text-slate-500 text-xs' }, '載入中...'),
          h('button', {
            class: 'text-red-400 hover:text-red-300 text-sm ml-auto',
            onClick: () => emit('remove'),
          }, '✕'),
        ])
      }

      // 第一行
      const row1 = h('div', { class: 'flex items-center justify-between mb-1.5' }, [
        h('div', { class: 'flex items-center gap-2 min-w-0' }, [
          h('span', { class: 'text-white font-mono font-bold text-sm shrink-0' }, s.id),
          h('span', { class: 'text-slate-300 text-sm truncate' }, s.name),
        ]),
        h('div', { class: 'flex items-center gap-2 shrink-0 ml-2' }, [
          h('span', { class: `font-mono font-bold text-sm ${changeColor(s.changePercent)}` },
            fmtPrice(s.price)),
          h('span', { class: `font-mono text-xs ${changeColor(s.changePercent)}` },
            fmtPercent(s.changePercent)),
          h('button', {
            class: 'text-red-400 hover:text-red-300 text-sm leading-none ml-1',
            onClick: () => emit('remove'),
            title: '移除',
          }, '✕'),
        ]),
      ])

      // 第二行
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

      return h('div', { class: 'px-4 py-3 bg-slate-900' }, [row1, row2])
    }
  },
})
</script>
