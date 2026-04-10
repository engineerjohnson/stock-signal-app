/**
 * Cloudflare Worker — CORS Proxy for TWSE MIS API
 *
 * 部署：
 *   wrangler deploy proxy.js --name stock-proxy --compatibility-date 2024-01-01
 *
 * 使用：
 *   GET https://stock-proxy.你的帳號.workers.dev/?url=https://mis.twse.com.tw/...
 */

// ── 設定：允許呼叫此 proxy 的前端來源 ────────────────────────────
const ALLOWED_ORIGINS = [
  'https://engineerjohnson.github.io',          // GitHub Pages（若改為 Public）
  'https://stock-signal-app.vercel.app',         // Vercel 主網址
  'https://stock-signal-app-engineerjohnson.vercel.app', // Vercel 備用網址
  'http://localhost:5173',
  'http://localhost:4173',
]

// 安全白名單：只允許代理這些 host
const ALLOWED_TARGET_HOSTS = [
  'mis.twse.com.tw',
  'www.twse.com.tw',
]

// ─────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // 只接受 GET
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    // 從 query string 取目標 URL
    const reqUrl    = new URL(request.url)
    const targetUrl = reqUrl.searchParams.get('url')

    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400 })
    }

    // 驗證目標 host 在白名單內
    let targetHost
    try {
      targetHost = new URL(targetUrl).hostname
    } catch {
      return new Response('Invalid url parameter', { status: 400 })
    }

    if (!ALLOWED_TARGET_HOSTS.includes(targetHost)) {
      return new Response(`Target host "${targetHost}" not allowed`, { status: 403 })
    }

    // 轉發請求到 TWSE
    let upstream
    try {
      upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer':    'https://mis.twse.com.tw/',
          'Accept':     'application/json, text/plain, */*',
        },
      })
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 })
    }

    const body = await upstream.text()

    return new Response(body, {
      status:  upstream.status,
      headers: {
        'Content-Type':  'application/json; charset=UTF-8',
        'Cache-Control': 'no-store, no-cache',
        ...corsHeaders(origin),
      },
    })
  },
}

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age':       '86400',
  }
}
