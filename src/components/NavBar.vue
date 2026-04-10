<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 flex">
    <router-link
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
      :class="isActive(item.to) ? 'text-blue-400' : 'text-slate-500'"
    >
      <span class="text-xl leading-none">{{ item.icon }}</span>
      <span class="text-xs">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { to: '/',          icon: '📈', label: '掃描' },
  { to: '/watchlist', icon: '⭐', label: '自選股' },
]

function isActive(path) {
  return route.path === path
}
</script>
