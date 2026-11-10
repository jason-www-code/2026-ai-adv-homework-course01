# CLAUDE.md

本檔案為 Claude Code（claude.ai/code）在此儲存庫中處理程式碼時提供指引。

## 專案概述

花漾生活 Flower Life（花卉電商）— Express 4 + better-sqlite3（同步 API）提供 REST API 與 EJS 頁面外殼，前端為 Vue 3 CDN global build（無建置步驟）+ Tailwind CSS v4，JWT 認證，Vitest + supertest 整合測試。使用者介面文字與 API 訊息皆為繁體中文。

## 常用指令

```bash
cp .env.example .env                 # 必須設定 JWT_SECRET（server.js 缺少時直接結束；測試缺少時註冊/登入回 500）
npm start                            # 建置壓縮版 CSS 後啟動，PORT 預設 3001
npm run dev:server                   # 只啟動伺服器（無 hot reload，改後端需重啟）
npm run dev:css                      # Tailwind watch：public/css/input.css -> public/css/output.css
npm run css:build                    # 建置壓縮版 CSS
npm test                             # 執行全部測試
npx vitest run tests/cart.test.js    # 單一測試檔
npx vitest run tests/cart.test.js -t "guest mode"   # 依名稱執行（檔案內測試共用狀態，單跑中段測試可能失敗）
npm run openapi                      # 由 src/routes/*.js 的 @openapi JSDoc 產生 openapi.json
rm database.sqlite*                  # 重置資料庫（下次啟動自動建表與 seed）
```

## 關鍵規則

- 所有 API 回應必須是 `{ data, error, message }`：成功時 `error: null`；失敗時 `data: null`、`error` 為 UPPER_SNAKE_CASE 錯誤代碼、`message` 為繁體中文。錯誤直接 `return res.status(...).json(...)`，不要 throw（`errorHandler` 會把 `error` 一律設為 `INTERNAL_ERROR`）。
- 購物車使用 `cartRoutes.js` 內的 `dualAuth`：有 Bearer token 以 `user_id` 為擁有者（token 無效直接 401，不退回訪客模式），否則以 `X-Session-Id` 為擁有者；訪客購物車登入後不會合併。結帳只讀取 `user_id` 購物車。
- 資料庫沒有 migration：`CREATE TABLE IF NOT EXISTS` 不會修改既有表，改 schema 需刪除 `database.sqlite*` 或手寫 `ALTER TABLE`。外鍵已啟用且沒有 `ON DELETE`；SQL 一律使用 `?` 參數綁定，多步驟寫入包在 `db.transaction` 中。
- 測試直接讀寫正式的 `database.sqlite`，且 `vitest.config.js` 的 `sequence.files` 實際上不控制檔案順序——每個測試檔必須在 `beforeAll` 自行建立資料（`registerUser()`、`getAdminToken()`），不可依賴其他檔案。
- 綠界金流（`src/services/ecpay.js`）只在本機執行、收不到 Server Notify：付款結果只能以 `QueryTradeInfo/V5` 主動查詢並驗證 CheckMacValue、比對金額後才改訂單狀態，不可直接採信導回或通知的 body；付款方式固定 `Credit`。改動綠界相關程式前先載入 `ecpay` skill（未納入 git，安裝方式見 `docs/README.md`）並查官方規格。
- 新增或修改端點時，同步更新該路由上方的 `@openapi` JSDoc；`/admin/*` 頁面只有前端檢查，資料保護必須靠 API 的 `authMiddleware` + `adminMiddleware`。
- 功能開發使用 `docs/plans/` 記錄計畫（`YYYY-MM-DD-<feature-name>.md`，User Story → Spec → Tasks）；完成後移至 `docs/plans/archive/`，並更新 `docs/FEATURES.md` 與 `docs/CHANGELOG.md`。

## 詳細文件

- @docs/README.md — 項目介紹與快速開始
- @docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- @docs/DEVELOPMENT.md — 開發規範、命名規則
- @docs/FEATURES.md — 功能列表與完成狀態
- @docs/TESTING.md — 測試規範與指南
- @docs/CHANGELOG.md — 更新日誌
