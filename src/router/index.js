import { createRouter, createWebHashHistory } from 'vue-router'

// Hash 模式：URL 如 /#/watchlist，GitHub Pages 靜態主機不需後端路由
const routes = [
  {
    path: '/',
    component: () => import('@/views/ScannerView.vue'),
    name: 'scanner',
  },
  {
    path: '/watchlist',
    component: () => import('@/views/WatchlistView.vue'),
    name: 'watchlist',
  },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
