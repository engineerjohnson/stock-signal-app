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
(
echo name: Deploy to GitHub Pages
echo.
echo on:
echo   push:
echo     branches: [main]
echo   workflow_dispatch:
echo.
echo permissions:
echo   contents: read
echo   pages: write
echo   id-token: write
echo.
echo concurrency:
echo   group: pages
echo   cancel-in-progress: false
echo.
echo jobs:
echo   build:
echo     runs-on: ubuntu-latest
echo     steps:
echo       - uses: actions/checkout@v4
echo.
echo       - name: Setup Node.js
echo         uses: actions/setup-node@v4
echo         with:
echo           node-version: '20'
echo           cache: 'npm'
echo.
echo       - name: Install dependencies
echo         run: npm ci
echo.
echo       - name: Build
echo         run: npm run build
echo         env:
echo           VITE_PROXY_URL: ${{ secrets.VITE_PROXY_URL }}
echo           VITE_REPO_NAME: ${{ github.event.repository.name }}
echo.
echo       - name: Upload Pages artifact
echo         uses: actions/upload-pages-artifact@v3
echo         with:
echo           path: dist
echo.
echo   deploy:
echo     needs: build
echo     runs-on: ubuntu-latest
echo     environment:
echo       name: github-pages
echo       url: ${{ steps.deployment.outputs.page_url }}
echo     steps:
echo       - name: Deploy to GitHub Pages
echo         id: deployment
echo         uses: actions/deploy-pages@v4
) > ".github\workflows\deploy.yml"

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
