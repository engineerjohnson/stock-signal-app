/**
 * Cloudflare Worker — CORS Proxy for TWSE MIS API
 *
 * 部署：
 *   wrangler deploy
 *
 * 使用：
 *   GET https://stock-proxy.johnson-tw.workers.dev/?url=https://mis.twse.com.tw/...
 */

// 安全白名單：只允許代理這些 host
const ALLOWED_TARGET_HOSTS = [
  'mis.twse.com.tw',
  'www.twse.com.tw',
  'openapi.twse.com.tw',
]

// ─────────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // 只接受 GET
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() })
    }

    // 從 query string 取目標 URL
    const reqUrl    = new URL(request.url)
    const targetUrl = reqUrl.searchParams.get('url')

    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() })
    }

    // 驗證目標 host 在白名單內
    let targetHost
    try {
      targetHost = new URL(targetUrl).hostname
    } catch {
      return new Response('Invalid url parameter', { status: 400, headers: corsHeaders() })
    }

    if (!ALLOWED_TARGET_HOSTS.includes(targetHost)) {
      return new Response(`Target host "${targetHost}" not allowed`, { status: 403, headers: corsHeaders() })
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
      return new Response(`Upstream fetch failed: ${err.message}`, { status: 502, headers: corsHeaders() })
    }

    const body = await upstream.text()

    return new Response(body, {
      status:  upstream.status,
      headers: {
        'Content-Type':  'application/json; charset=UTF-8',
        'Cache-Control': 'no-store, no-cache',
        ...corsHeaders(),
      },
    })
  },
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age':       '86400',
  }
}
