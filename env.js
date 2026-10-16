/**
 * ==============================================================================
 * 智慧校園 學生常規優缺點管理系統 - 前端環境變數配置 (env.js)
 * ==============================================================================
 * 說明：
 * 1. 當使用本機 HTTP 伺服器 (如 Live Server, serve, vite) 執行時，系統會自動非同步讀取 .env 檔案。
 * 2. 若直接以滑鼠雙擊 index.html (file:// 協議) 開啟時，瀏覽器安全性原則會限制讀取本機 .env 檔案，
 *    此時您可以直接在此檔案中的 window.__ENV__ 物件設定 GOOGLE_APP_SCRIPT_URL。
 * ==============================================================================
 */

window.__ENV__ = Object.assign(window.__ENV__ || {}, {
  // Google Apps Script 的後端連結 (格式以 /exec 結尾)
  GOOGLE_APP_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzrYm9sOZ5Ff13Vg8RF4SZkX4rkuqnz60_7cl0XZ39Vc3G-WQi2LjJi2DP0rBHoBjk_/exec"
});
