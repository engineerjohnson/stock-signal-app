import { execSync } from 'child_process';
const opts = { cwd: 'D:\\測試', stdio: 'pipe', encoding: 'utf8' };

try {
  // Stage files
  let r = execSync('git add src/stores/scanner.js src/views/ScannerView.vue src/services/twse.js src/composables/useMarketHours.js src/utils/indicators.js vite.config.js', opts);
  console.log('add ok:', r);

  // Commit
  const msg = 'fix: 全面Bug審計+周轉率+盤後資料日期修正\n\n🔴 盤後資料顯示昨日問題（核心修正）:\n- init() 盤後還原 localStorage 時，非今日資料只補 tick 計算值\n- 不允許昨日盤中 price/volume/changePercent 蓋掉今日 STOCK_DAY_ALL 收盤資料\n- 今日曾掃描 → 完整覆蓋（保留連次/連量）；跨日 → 只補 tick，價格用 API 最新值\n\n🟡 UI：顯示 STOCK_DAY_ALL 資料日期:\n- twse.js fetchStockPool() 改用 www.twse.com.tw 帶日期參數（資料比 openapi 即時）\n- fetchDailyHistory 同步改用 www.twse.com.tw\n- scanner.js 儲存 dataDate，盤後 banner 顯示「📅 資料日期 2026/04/10」\n\n🔴 周轉率(sharesLots)修正:\n- twse.js 新增 fetchSharesOutstanding()，從 TWSE t187ap03_L 取在外流通股數\n- scanner.js init() 背景載入股本資料並更新 sharesLots → turnoverRate 有值\n- buildInitialQuote 用 yesterdayVolume/sharesLots 計算初始 turnoverRate\n- ScannerView 成交量欄位改顯示 週轉% 替換每筆量\n\n🔴 自選股MIS掃描Bug:\n- addToPool 新增自選股後同步 _scanIds，盤中才能即時掃描\n- removeFromPool 同步清理 _scanIds，不浪費掃描名額\n- 自選Tab改用 store.quotes 直接篩選，不受 yesterdayVolume>0 限制\n\n🔴 日K資料Bug:\n- loadAfterHoursHistory 完成後呼叫 saveQuotes，刷新頁面不重打100支API\n- loadAfterHoursHistory 改用 _scanIds（包含自選股），確保自選股也能取得日K\n\n🟠 邏輯修正:\n- twse.js filter 中用未定義 close 變數→改用 price（近漲停股票才進pool）\n- dayVolumeRatio 同日重開 app 不覆寫快取（避免量比變1）\n- 量比欄子行盤後改顯示「量比」標籤而非重複的今日漲跌幅\n\n🟡 效能優化:\n- _scanIds 快取量前100股票ID（盤中不再每3秒重排500支）\n- export applySort 供 ScannerView watchlistTab 直接排序\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';
  r = execSync(`git commit -m "${msg}"`, opts);
  console.log('commit ok:', r);

  // Push
  r = execSync('git push', opts);
  console.log('push ok:', r);
} catch(e) {
  console.error('FAILED:', e.stderr || e.message);
  try { console.log(execSync('git status', opts)); } catch(e2) {}
}
