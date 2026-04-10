import axios from 'axios'

const PROXY_URL = import.meta.env.VITE_PROXY_URL

/**
 * 透過 Proxy 轉發請求，繞過 TWSE MIS 的 CORS 限制。
 *
 * 優先順序：
 *  1. 設定了 VITE_PROXY_URL → 使用 Cloudflare Worker（或任何自訂 proxy URL）
 *  2. 開發模式（import.meta.env.DEV）→ 使用 Vite dev server proxy（/api/twse-mis）
 *  3. 正式環境（Vercel 等）→ 使用 /api/proxy（Vercel Serverless Function）
 *
 * @param {string} targetUrl 實際要呼叫的 TWSE MIS URL
 * @returns {Promise<any>} 解析後的 JSON 資料
 */
export async function proxyGet(targetUrl) {
  let url

  if (PROXY_URL) {
    url = `${PROXY_URL}?url=${encodeURIComponent(targetUrl)}`
  } else if (import.meta.env.DEV) {
    // Vite dev server proxy：/api/twse-mis → https://mis.twse.com.tw
    url = targetUrl.replace('https://mis.twse.com.tw', '/api/twse-mis')
  } else {
    // 正式環境（Vercel）：走同域的 serverless function
    url = `/api/proxy?url=${encodeURIComponent(targetUrl)}`
  }

  const response = await axios.get(url, {
    timeout: 6000,
    headers: { Accept: 'application/json' },
  })

  return response.data
}
