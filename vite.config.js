import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const repoName = env.VITE_REPO_NAME  // 空字串 = Vercel，有值 = GitHub Pages

  return {
    // Vercel 時 base = '/'，GitHub Pages 時 base = '/repo-name/'
    base: mode === 'production' && repoName ? `/${repoName}/` : '/',

    // 開發模式：透過 Vite dev server proxy 繞過 TWSE MIS 的 CORS 限制
    // 不需要 Cloudflare Worker 也能在本地正常跑
    server: {
      proxy: {
        '/api/twse-mis': {
          target: 'https://mis.twse.com.tw',
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api\/twse-mis/, ''),
          headers: {
            Referer: 'https://mis.twse.com.tw/',
          },
        },
        '/api/twse-openapi': {
          target: 'https://openapi.twse.com.tw',
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api\/twse-openapi/, ''),
        },
        '/api/twse-www': {
          target: 'https://www.twse.com.tw',
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api\/twse-www/, ''),
        },
      },
    },

    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: '當沖飆股神手',
          short_name: '飆股神手',
          description: '台股即時連次連量掃描',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '.',
          icons: [
            { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/openapi\.twse\.com\.tw\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'twse-api', expiration: { maxAgeSeconds: 300 } },
            },
          ],
        },
      }),
    ],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
