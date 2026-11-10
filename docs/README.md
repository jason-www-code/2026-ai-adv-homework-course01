# 花漾生活 Flower Life

花卉電商示範專案。提供商品瀏覽、訪客/會員雙模式購物車、結帳下單、模擬付款，以及管理員後台（商品 CRUD、訂單查詢）。後端同時提供 EJS 頁面與 REST API，前端以 Vue 3（CDN）在瀏覽器端呼叫 API。

## 技術棧

| 層級 | 技術 | 版本（package.json） |
|---|---|---|
| Runtime | Node.js（CommonJS） | — |
| Web 框架 | Express | `~4.16.1` |
| 資料庫 | SQLite via better-sqlite3（同步 API、WAL） | `^12.8.0` |
| 認證 | jsonwebtoken（HS256，7 天）、bcrypt | `^9.0.2`、`^6.0.0` |
| 頁面模板 | EJS | `^5.0.1` |
| 前端 | Vue 3 global build（unpkg CDN，無建置） | 未鎖定 |
| 樣式 | Tailwind CSS v4（`@tailwindcss/cli`） | `^4.2.2` |
| API 文件 | swagger-jsdoc（OpenAPI 3.0.3） | `^6.2.8` |
| 測試 | Vitest + supertest | `^2.1.9`、`^7.2.2` |
| 其他 | cors、dotenv、uuid | |

## 快速開始

```bash
git clone <repo-url>
cd 2026-ai-adv-homework-course01
npm install
cp .env.example .env
# 編輯 .env，把 JWT_SECRET 改成隨機字串，例如：
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

開啟 <http://localhost:3001>。

- 第一次啟動會自動建立 `database.sqlite`，並寫入 8 筆商品與管理員帳號。
- 管理員：`admin@hexschool.com` / `12345678`，登入後從 header 的「後台管理」進入 `/admin/products`。
- 一般會員可在 `/login` 的註冊分頁建立。

開發時建議開兩個終端機：

```bash
npm run dev:css      # Tailwind watch
npm run dev:server   # 伺服器（修改後端需手動重啟）
```

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm start` | 建置壓縮版 CSS 後啟動伺服器 |
| `npm run dev:server` | 只啟動伺服器（不建置 CSS） |
| `npm run dev:css` | Tailwind watch：`public/css/input.css` → `public/css/output.css` |
| `npm run css:build` | 建置壓縮版 CSS |
| `npm test` | 執行全部測試 |
| `npx vitest run tests/<file>.test.js` | 執行單一測試檔 |
| `npx vitest run tests/<file>.test.js -t "<名稱>"` | 執行名稱符合的測試 |
| `npm run openapi` | 產生 `openapi.json` |
| `rm database.sqlite*` | 重置資料庫（停止伺服器後執行，下次啟動重新 seed） |

## 文件索引

| 文件 | 內容 |
|---|---|
| [README.md](./README.md) | 專案介紹、技術棧、快速開始、常用指令 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、API 路由總覽、回應格式、認證授權、資料庫 schema、資料流、金流 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 環境變數、模組系統、命名規則、新增 API/middleware/資料表/頁面的步驟、JSDoc 格式、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 各功能的完成狀態、行為描述、參數、業務邏輯、錯誤情境與已知問題 |
| [TESTING.md](./TESTING.md) | 測試檔案、依賴關係、輔助函式、撰寫範例、常見陷阱 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/) | 進行中的開發計畫；完成後移至 [plans/archive/](./plans/archive/) |
