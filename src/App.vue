<template>
  <div class="max-w-lg mx-auto relative">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <NavBar />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useScannerStore } from '@/stores/scanner.js'
import { useWatchlistStore } from '@/stores/watchlist.js'

const scanner   = useScannerStore()
const watchlist = useWatchlistStore()

// 應用啟動時初始化 scanner，完成後同步自選股
onMounted(async () => {
  await scanner.init()
  watchlist.syncToScanner()
})
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
