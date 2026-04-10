@echo off
echo ================================================
echo   部署到 GitHub Pages + 更新 Cloudflare Worker
echo ================================================
echo.
echo 請輸入你的 GitHub Personal Access Token：
set /p TOKEN=TOKEN: 

echo.
echo [1/6] 建立 GitHub Actions workflow...
if not exist ".github\workflows" mkdir ".github\workflows"
python -c "
import os
yml = '''name: Deploy to GitHub Pages

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
          node-version: \'20\'
          cache: \'npm\'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_PROXY_URL: \${{ secrets.VITE_PROXY_URL }}
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
'''
os.makedirs('.github/workflows', exist_ok=True)
with open('.github/workflows/deploy.yml', 'w', newline='\n') as f:
    f.write(yml)
print('deploy.yml created!')
"

echo [2/6] 初始化 git...
git init
git branch -M main

echo [3/6] 加入所有變更...
git add .

echo [4/6] Commit...
git commit -m "chore: add GitHub Actions workflow"

echo [5/6] 設定 remote 並 Push 到 GitHub...
git remote remove origin 2>nul
git remote add origin https://engineerjohnson:%TOKEN%@github.com/engineerjohnson/stock-signal-app.git
git push -f -u origin main

echo.
echo ================================================
echo   更新 Cloudflare Worker CORS 白名單...
echo ================================================
wrangler deploy

echo.
echo ================================================
echo   完成！
echo   等 1-2 分鐘後，網站會在：
echo   https://engineerjohnson.github.io/stock-signal-app/
echo ================================================
pause
