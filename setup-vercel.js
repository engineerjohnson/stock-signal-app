// 執行此腳本建立 Vercel serverless function：node setup-vercel.js
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, 'api')
if (!fs.existsSync(dir)) fs.mkdirSync(dir)

const content = `/**
 * Vercel Serverless Function — CORS Proxy for TWSE MIS API
 * 部署到 Vercel 後，此函式自動掛載在 /api/proxy
 */

const ALLOWED_TARGET_HOSTS = [
  'mis.twse.com.tw',
  'www.twse.com.tw',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url: targetUrl } = req.query
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter' })
  }

  let targetHost
  try {
    targetHost = new URL(targetUrl).hostname
  } catch {
    return res.status(400).json({ error: 'Invalid url parameter' })
  }

  if (!ALLOWED_TARGET_HOSTS.includes(targetHost)) {
    return res.status(403).json({ error: \`Target host not allowed\` })
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://mis.twse.com.tw/',
        'Accept':     'application/json, text/plain, */*',
      },
    })
    const body = await upstream.text()
    res.setHeader('Content-Type', 'application/json; charset=UTF-8')
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(upstream.status).send(body)
  } catch (err) {
    res.status(502).json({ error: \`Upstream fetch failed: \${err.message}\` })
  }
}
`

fs.writeFileSync(path.join(dir, 'proxy.js'), content)
console.log('✅ api/proxy.js 建立完成！')
console.log('接下來：')
console.log('  1. 去 https://vercel.com 用 GitHub 帳號登入')
console.log('  2. Import 你的 GitHub repo')
console.log('  3. 部署完成後，把 Vercel 網址填入 .env 的 VITE_PROXY_URL')
