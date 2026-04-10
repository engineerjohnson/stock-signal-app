import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useScannerStore } from './scanner.js'

const STORAGE_KEY = 'stock_watchlist_v1'

export const useWatchlistStore = defineStore('watchlist', () => {
  const items = ref(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  )

  // 自動同步到 localStorage
  watch(items, val => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  }, { deep: true })

  /**
   * 加入自選股
   * @param {string} rawId 使用者輸入的代碼（自動清理空白）
   * @returns {string|null} 清理後的代碼，若重複或無效則回傳 null
   */
  function add(rawId) {
    const id = String(rawId).trim().replace(/\D/g, '').padStart(4, '0')
    if (!id || id.length !== 4) return null
    if (items.value.includes(id)) return null

    items.value.push(id)

    // 確保此股加入掃描母池
    const scanner = useScannerStore()
    if (scanner.isInitialized) scanner.addToPool(id)

    return id
  }

  /**
   * 移除自選股
   */
  function remove(id) {
    items.value = items.value.filter(i => i !== id)
    // 注意：不從 scanner 母池移除，因為 Top 100 可能也包含它
  }

  function has(id) {
    return items.value.includes(id)
  }

  /**
   * 初始化時將所有自選股加入掃描母池（scanner init 完成後呼叫）
   */
  function syncToScanner() {
    const scanner = useScannerStore()
    for (const id of items.value) {
      scanner.addToPool(id)
    }
  }

  return { items, add, remove, has, syncToScanner }
})
