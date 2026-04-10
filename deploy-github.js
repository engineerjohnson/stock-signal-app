// 執行此腳本部署到 GitHub Pages：node deploy-github.js YOUR_TOKEN
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const token = process.argv[2]
if (!token) {
  console.log('用法：node deploy-github.js YOUR_GITHUB_TOKEN')
  process.exit(1)
}

// 1. 建立 .github/workflows/deploy.yml
console.log('[1/5] 建立 GitHub Actions workflow...')
const workflowDir = path.join(__dirname, '.github', 'workflows')
if (!fs.existsSync(workflowDir)) {
  fs.mkdirSync(workflowDir, { recursive: true })
}

const deployYml = `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_PROXY_URL: \${{ secrets.VITE_PROXY_URL || 'https://stock-proxy.johnson-tw.workers.dev' }}
          VITE_REPO_NAME: \${{ github.event.repository.name }}

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`
fs.writeFileSync(path.join(workflowDir, 'deploy.yml'), deployYml)
console.log('✅ .github/workflows/deploy.yml 建立完成')

// 2. Git init & commit & push
const run = (cmd, ignoreError = false) => {
  console.log(`> ${cmd}`)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: __dirname })
  } catch (e) {
    if (!ignoreError) throw e
  }
}

const runSafe = (cmd) => run(cmd, true)

console.log('\n[2/5] 初始化 git...')
runSafe('git init')
run('git branch -M main')

console.log('\n[3/5] 清除不該追蹤的檔案...')
runSafe('git rm -r --cached node_modules')
runSafe('git rm --cached .env')

console.log('\n[4/5] 加入所有變更並 Commit...')
run('git add .')
runSafe('git commit -m "fix: use fallback worker URL, remove node_modules and .env from tracking"')

console.log('\n[5/5] Push 到 GitHub...')
runSafe('git remote remove origin')
run(`git remote add origin https://engineerjohnson:${token}@github.com/engineerjohnson/stock-signal-app.git`)
run('git push -f -u origin main')

console.log('\n✅ 完成！')
console.log('等 1-2 分鐘後，去 GitHub repo 的 Actions tab 查看部署狀態')
console.log('完成後網站在：https://engineerjohnson.github.io/stock-signal-app/')
