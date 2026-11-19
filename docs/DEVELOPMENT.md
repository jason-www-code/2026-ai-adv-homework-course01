# 開發規範

## 1. 開發環境

```bash
nvm use                     # 依 .nvmrc 切到 Node v24.22.2
npm install
cp .env.example .env        # 並把 JWT_SECRET 改成隨機字串
npm run css:build           # 或在另一個終端機執行 npm run dev:css
npm run dev:server          # http://localhost:3001
```

- Node 版本以專案根目錄的 `.nvmrc`（`v24.22.2`）為準（`package.json` 沒有 `engines`）。`better-sqlite3` 是原生模組，`npm install` 時取得的是對應當下 Node 版本的二進位檔；之後換了 Node 版本再啟動，會出現 `NODE_MODULE_VERSION` 不符的錯誤，需切回 `.nvmrc` 的版本，或在新版本下執行 `npm rebuild better-sqlite3`。
- 沒有 nodemon，修改後端程式需手動重啟 `dev:server`。
- 前端 JS 與 EJS 不需建置，重新整理即可（EJS 在非 production 模式不快取）。
- 新增 Tailwind class 後若未執行 `dev:css`，樣式不會出現在 `output.css`。

### 1.1 Claude Code 沙箱與輔助腳本（`scripts/`）

專案的 `.claude/settings.json` 開啟了 Claude Code 的 sandbox（`sandbox.enabled: true`）。沙箱內每條 Bash 指令各自有獨立的網路與行程視野，因此：在沙箱內啟動的伺服器，瀏覽器與後續指令都連不到；沙箱內的 `curl` 連不到沙箱外的伺服器；`lsof` 也看不到沙箱外的行程。為了讓 Claude Code 能啟動、檢查、停止開發伺服器，`scripts/` 提供下列腳本：

| 腳本 | 作用 | 參數（環境變數） | 執行位置 |
|---|---|---|---|
| `./scripts/dev-server.sh` | `source ~/.nvm/nvm.sh` → `nvm use`（讀 `.nvmrc`）→ `exec node server.js`。前景執行，不會自行結束 | 埠號沿用 `.env` 的 `PORT`（未設為 3001） | 沙箱外 |
| `./scripts/health-check.sh` | 每秒以 `curl` 請求 `http://localhost:$PORT/`，回 HTTP 200 時印 `server up` 並以 0 結束；逾時印錯誤並以 1 結束 | `PORT`（預設 3001）、`TIMEOUT`（秒，預設 15） | 沙箱外 |
| `./scripts/stop-server.sh` | 以 `lsof -ti tcp:$PORT -sTCP:LISTEN` 找出監聽該埠的行程並 `kill`；沒有行程時印「port … 沒有行程在監聽」並以 0 結束 | `PORT`（預設 3001） | 沙箱外 |
| `./scripts/clean-screenshots.sh` | 在 `screenshots/` 只保留修改時間最新的一張 `.png`，刪除其他一般檔案（Playwright 的 snapshot `.yml`、console `.log`、舊截圖），不碰子目錄；沒有任何 .png 時不刪檔並以 1 結束 | — | 沙箱內即可 |

使用規則：

- 前三個腳本同時列在 `.claude/settings.json` 的 `sandbox.excludedCommands`（在沙箱外執行）與 `permissions.allow`（不跳權限提示）。**只有整條指令與清單完全相符才會生效**，所以必須單獨執行：不可加 `cd … &&`、環境變數前綴（`TIMEOUT=2 ./scripts/…`）、`;`、`&&`、`( … )` 或 `&`。不相符時腳本會在沙箱內執行，而且**看起來像成功**（例如 `stop-server.sh` 回報沒有行程在監聽，伺服器其實還在跑；`dev-server.sh` 找不到 nvm）。
- 也因為不能加前綴，在 Claude Code 中 `health-check.sh`、`stop-server.sh` 一律使用預設埠 3001，不會讀 `.env`；若把 `.env` 的 `PORT` 改成其他值，這兩支腳本會找錯埠。在一般終端機手動執行時則可用 `PORT=4000 ./scripts/health-check.sh`。
- 在 Claude Code 中啟動伺服器：以 Bash 的背景執行（`run_in_background`）跑 `./scripts/dev-server.sh`，再執行 `./scripts/health-check.sh` 確認就緒。
- 停止伺服器一律用 `./scripts/stop-server.sh`（依埠號判斷），不要用 `pkill -f node` 之類的行程名稱比對，會比對到執行指令的 shell 本身。需要安裝 `lsof`。
- `dev-server.sh` 假設 nvm 安裝在 `~/.nvm`，沒有 nvm 時會直接失敗；在一般終端機可自行切好 Node 版本後改用 `npm run dev:server`（在 Claude Code 沙箱內這樣啟動的伺服器，瀏覽器連不到）。
- 這三個腳本在沙箱外執行，等同繞過沙箱保護：修改時保持最小，並經過 code review（腳本開頭的註解也有標註）。新增需要在沙箱外執行的腳本時，要同時加進 `excludedCommands` 與 `permissions.allow`。

## 2. 環境變數

| 變數 | 用途 | 必要性 | 預設值（程式內） | 使用位置 |
|---|---|---|---|---|
| `JWT_SECRET` | JWT 簽章密鑰 | **必要**：`server.js` 缺少時直接 `process.exit(1)`；測試缺少時註冊/登入會 500 | 無 | `authRoutes.js`、`authMiddleware.js`、`cartRoutes.js` |
| `PORT` | 伺服器埠號 | 選填 | `3001` | `server.js` |
| `FRONTEND_URL` | CORS 允許的唯一來源 | 選填 | `http://localhost:3001`（`.env.example` 設為 `http://localhost:5173`） | `app.js` |
| `ADMIN_EMAIL` | seed 管理員 Email | 選填 | `admin@hexschool.com` | `database.js` |
| `ADMIN_PASSWORD` | seed 管理員密碼 | 選填 | `12345678` | `database.js` |
| `NODE_ENV` | `test` 時 seed 管理員的 bcrypt rounds 降為 1 | 選填（Vitest 會自動設為 `test`） | — | `database.js` |
| `BASE_URL` | 組綠界 ReturnURL / OrderResultURL / ClientBackURL 的對外網址 | 選填 | `http://localhost:3001` | `src/services/ecpay.js` |
| `ECPAY_MERCHANT_ID` | 綠界特店編號 | 選填（正式環境必填） | `3002607`（官方公開測試帳號） | `src/services/ecpay.js` |
| `ECPAY_HASH_KEY` | 綠界 HashKey | 選填（正式環境必填） | `pwFHCqoQZGmho4w6`（測試） | `src/services/ecpay.js` |
| `ECPAY_HASH_IV` | 綠界 HashIV | 選填（正式環境必填） | `EkRm7iFT261dpevs`（測試） | `src/services/ecpay.js` |
| `ECPAY_ENV` | `production` 使用正式網域，其他值使用 stage | 選填 | `staging` | `src/services/ecpay.js` |

> `ADMIN_EMAIL` / `ADMIN_PASSWORD` 只在該 Email 不存在時生效。既有資料庫中修改這兩個值不會更新原本的管理員。
> 綠界 HashKey / HashIV 只能放在後端環境變數，不可出現在前端或版本控制（`.env.example` 內是官方公開測試值）。
> 若開發機需透過 HTTP 代理才能連外，Node 內建 `fetch` 預設不讀 `HTTPS_PROXY`，需設 `NODE_USE_ENV_PROXY=1`（Node 24+），否則查詢綠界會得到 `ECPAY_QUERY_FAILED`。
> 測試輔助函式 `getAdminToken()` 寫死 `admin@hexschool.com` / `12345678`，若覆寫這兩個變數，測試需一併調整。

## 3. 模組系統與程式風格

| 範圍 | 模組系統 | 說明 |
|---|---|---|
| 後端 `src/`、`app.js`、`server.js` | CommonJS（`require` / `module.exports`） | `package.json` 沒有 `"type": "module"` |
| 測試 `tests/*.test.js` | CommonJS + Vitest globals | `describe`/`it`/`expect`/`beforeAll` 不需 import |
| `vitest.config.js` | ESM（`import` / `export default`） | Vitest 設定檔例外 |
| 前端 `public/js/` | 無模組，全域 `<script>` | 互相透過全域變數（`Auth`、`apiFetch`、`Notification`、`Vue`）溝通 |

- 後端資料庫存取為**同步** API（better-sqlite3），路由 handler 原則上不使用 `async`；需要呼叫外部 API 時（目前只有綠界查詢）才用 `async`，並自行 `try/catch` 回統一格式。
- 共用商業邏輯放在 `src/services/`（目前為綠界相關）。
- 分號、單引號、2 空白縮排。專案沒有 ESLint / Prettier 設定。
- 前端頁面腳本統一寫法：`const { createApp, ref, ... } = Vue; createApp({ setup() { ... } }).mount('#app');`，多數使用 `function` 表達式與 `var`（舊式風格），新程式可沿用。

## 4. 命名規則

| 對象 | 規則 | 範例 |
|---|---|---|
| 路由檔 | camelCase + `Routes.js` | `adminOrderRoutes.js` |
| middleware 檔 | camelCase + `Middleware.js` | `authMiddleware.js` |
| 前端頁面腳本 / pageScript | kebab-case，與頁面名稱一致 | `order-detail.js`、`admin-products.js` |
| EJS 頁面 | kebab-case；後台放 `views/pages/admin/` | `product-detail.ejs`、`admin/orders.ejs` |
| 測試檔 | camelCase + `.test.js`，對應功能區塊 | `adminProducts.test.js` |
| 資料表 | snake_case 複數 | `cart_items`、`order_items` |
| 資料表欄位 | snake_case | `recipient_name`、`image_url` |
| API URL | 小寫複數名詞，admin 以 `/api/admin/` 前綴 | `/api/admin/products/:id` |
| 路由參數 | camelCase | `:itemId`、`:id` |
| **Request body** | **混用**：購物車/訂單用 camelCase，後台商品用 snake_case | `productId`、`recipientName`；`image_url` |
| Response 欄位 | 直接回傳資料庫欄位（snake_case），分頁物件例外 | `order_no`、`total_amount`；`pagination.totalPages` |
| 錯誤代碼 | UPPER_SNAKE_CASE | `STOCK_INSUFFICIENT` |
| localStorage key | `flower_` 前綴 | `flower_token`、`flower_session_id` |
| 訊息文字 | 繁體中文 | `訂單建立成功` |

> 新增 API 時，request body 請遵循同一資源既有的風格；若是新資源，建議使用 camelCase（與多數使用者端 API 一致）。

## 5. 新增 API 的步驟

1. **建立或選擇路由檔** `src/routes/<resource>Routes.js`：

   ```js
   const express = require('express');
   const { v4: uuidv4 } = require('uuid');
   const db = require('../database');
   const authMiddleware = require('../middleware/authMiddleware');

   const router = express.Router();
   router.use(authMiddleware);           // 整個 router 都需登入時

   /**
    * @openapi
    * /api/wishlist:
    *   get:
    *     ...
    */
   router.get('/', (req, res) => {
     const rows = db.prepare('SELECT * FROM wishlist WHERE user_id = ?').all(req.user.userId);
     res.json({ data: { items: rows }, error: null, message: '成功' });
   });

   module.exports = router;
   ```

2. **在 `app.js` 掛載**，放在 `// API Routes` 區塊、`pageRoutes` 與 404 handler **之前**：

   ```js
   app.use('/api/wishlist', require('./src/routes/wishlistRoutes'));
   ```

   若前綴有包含關係（例如 `/api/admin/xxx` 與 `/api/xxx`），較長的前綴放前面。

3. **遵守回應格式**：成功 `{ data, error: null, message }`；失敗 `return res.status(code).json({ data: null, error: 'CODE', message: '中文訊息' })`。錯誤代碼優先沿用 [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-統一回應格式) 既有清單。
4. **SQL 一律使用 `?` 參數綁定**；動態欄位名稱只能來自程式內固定白名單（參考 `getOwnerCondition`）。
5. **多步驟寫入包在 `db.transaction(() => { ... })()`** 中。
6. **撰寫 `@openapi` JSDoc**（見 §8），執行 `npm run openapi` 確認可產生。
7. **新增測試** `tests/<resource>.test.js`（見 [TESTING.md](./TESTING.md)）。
8. 更新 `docs/FEATURES.md`、`docs/CHANGELOG.md`，若影響架構也更新 `docs/ARCHITECTURE.md`。

## 6. 新增 Middleware 的步驟

1. 建立 `src/middleware/<name>Middleware.js`，匯出 `function (req, res, next)`。
2. 拒絕請求時直接回傳統一格式 JSON（不要 `throw`），例如：

   ```js
   function requireVerifiedMiddleware(req, res, next) {
     if (!req.user) {
       return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: '請先登入' });
     }
     next();
   }
   module.exports = requireVerifiedMiddleware;
   ```

3. 套用方式：
   - 全域：在 `app.js` 的 `// Global middleware` 區塊加入（注意 `sessionMiddleware` 之後、路由之前）。
   - 整個 router：`router.use(authMiddleware, yourMiddleware)`。
   - 單一路由：`router.get('/x', authMiddleware, handler)`。
4. 依賴 `req.user` 的 middleware 必須排在 `authMiddleware` 之後（同 `adminMiddleware`）。
5. 若要讓 `errorHandler` 回傳自訂訊息，拋出的錯誤需帶 `status` 與 `isOperational = true`：

   ```js
   const err = new Error('自訂訊息'); err.status = 422; err.isOperational = true; next(err);
   ```

## 7. 修改資料庫

1. 在 `src/database.js` 的 `initializeDatabase()` 內的 `db.exec` 加入 `CREATE TABLE IF NOT EXISTS`。
2. 需要預設資料時新增 `seedXxx()` 函式，**必須冪等**（先檢查是否已存在），並在 `initializeDatabase()` 中呼叫。
3. **修改既有表**（新增欄位、改約束）：`CREATE TABLE IF NOT EXISTS` 不會生效。開發環境刪除 `database.sqlite*` 重建；若要保留資料，需在 `initializeDatabase()` 中以 `PRAGMA table_info(...)` 檢查後執行 `ALTER TABLE`。
4. 外鍵已啟用（`foreign_keys = ON`）：新增指向 `products` 或 `users` 的外鍵時，需考慮刪除商品/使用者時的行為（目前所有外鍵都沒有 `ON DELETE`）。
5. 金額使用 INTEGER（元）；時間使用 `TEXT DEFAULT (datetime('now'))`（UTC）；主鍵使用應用端產生的 `uuidv4()`。
6. 同步更新 [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-資料庫-schema)。

## 8. 新增頁面的步驟

1. 建立 `views/pages/<page>.ejs`（後台放 `views/pages/admin/`），根元素為 `<div id="app" v-cloak>`（Vue 掛載前隱藏模板），需要的 URL 參數以 `data-*` 屬性注入。前台頁面自行加 `.page-x` 控制左右外距（layout 的 `main` 不限寬度）。
2. 建立 `public/js/pages/<page>.js`，以 `createApp(...).mount('#app')` 啟動；需登入的頁面在 `setup()` 開頭 `if (!Auth.requireAuth()) return {};`。
3. 在 `src/routes/pageRoutes.js` 加入路由，使用 `renderFront(res, '<page>', { title, pageScript: '<page>' })` 或 `renderAdmin(res, '<page>', { title, pageScript, currentPath })`。
4. 後台頁面需在 `views/partials/admin-sidebar.ejs` 加入連結（以 `currentPath` 判斷 active）。
5. EJS 的 `<%= %>` 與 Vue 的 `{{ }}` 可以並存；不要用 EJS 輸出使用者資料，資料一律由 API 取得。

## 9. JSDoc / OpenAPI 格式

- 每個路由 handler 上方都有一個 `/** @openapi ... */` 區塊，內容為 YAML 格式的 OpenAPI 3.0.3 path 定義。
- `swagger-config.js` 掃描 `./src/routes/*.js`，已定義兩種 security scheme：`bearerAuth`（JWT）、`sessionId`（`X-Session-Id` header）。
- `tags` 使用：`Auth`、`Products`、`Cart`、`Orders`、`Admin Products`、`Admin Orders`、`ECPay`（新增時沿用或新增 tag）。
- 執行 `npm run openapi` 會在專案根目錄產生 `openapi.json`。專案沒有掛載 Swagger UI。

範例（節錄自 `orderRoutes.js` 的付款 API 寫法）：

```js
/**
 * @openapi
 * /api/orders/{id}/pay:
 *   patch:
 *     summary: 模擬付款（更新訂單付款狀態）
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [success, fail]
 *     responses:
 *       200:
 *         description: 付款狀態更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: action 無效或訂單狀態不是 pending
 *       404:
 *         description: 訂單不存在
 */
router.patch('/:id/pay', (req, res) => { ... });
```

撰寫重點：

- YAML 縮排必須正確（每行以 ` * ` 開頭後的空白數量即 YAML 縮排），縮排錯誤時 swagger-jsdoc 會靜默略過或產生錯誤 spec。
- 支援購物車雙模式認證的端點，`security` 清單同時列出 `- bearerAuth: []` 與 `- sessionId: []`（參考 `cartRoutes.js`）。
- response schema 一律描述 `data` / `error`（`nullable: true`）/ `message` 三欄位。

## 10. 前端開發注意事項

- 所有 API 呼叫使用 `apiFetch(url, { method, body: JSON.stringify(...) })`；它會自動加上 `Content-Type`、`Authorization`、`X-Session-Id`。
- `apiFetch` 遇到 401 會清除登入資訊並跳轉 `/login`，並回傳 `undefined`；呼叫端在 401 情境下拿不到錯誤物件。
- 非 2xx 時拋出 `{ status, data }`，可用 `err?.data?.message` 顯示後端訊息。
- 視覺依「夜色花房」設計稿（`docs/design/flower-life/flower-life.pen`，規格見 [plans/archive/2026-11-19-pencil-redesign.md](./plans/archive/2026-11-19-pencil-redesign.md)）。色彩只用 `input.css` `@theme` 的 token，不要寫死色碼：

  | 用途 | token |
  |---|---|
  | 前台深色底、文字 | `plum-night`（底）、`plum-raised`（輸入框、頁尾）、`plum-line`（分隔線）、`ivory`（主要文字）、`mauve`（次要文字） |
  | 主要動作與選取狀態 | `marigold`（每個畫面只給一個主要動作）、`marigold-dark`（hover） |
  | 象牙紙面（購物車摘要、結帳訂購單、訂單收據、後台內容區） | `paper`、`paper-sunk`、`paper-line`、`paper-ink`、`paper-ink-2` |
  | 訂單狀態 | 深色底用 `pending`／`paid`／`failed`；紙面用 `*-ink` 文字配 `*-tint` 底 |

- 字體：標題與商品名稱用 `font-display`（Cactus Classical Serif，只有 400 字重，靠字級拉開層級）；內文、數字、按鈕用預設的 Noto Sans TC。
- 斷點：`sm` 576、`md` 768、`lg` 1024（桌機版型起點）、`xl` 1440、`2xl` 1920。前台左右外距用 `.page-x`（20／24／40／96／160）。
- 共用 class（`@layer components`）：`.btn-primary`（金盞）、`.btn-outline`、`.btn-paper`／`.btn-paper-outline`（紙面上）、`.btn-danger`、`.field-dark`／`.field-paper`（輸入框）、`.field-label`／`.field-label-paper`、`.field-error`、`.badge`（狀態膠囊）、`.spinner`／`.spinner-paper`、`.h-section`、`.h-page`。紙面區塊加 `theme-paper`，focus 外框會改為深色。
- 圖示用 `<%- include('../partials/icon', { name: 'truck', cls: 'h-5 w-5' }) %>`（路徑依頁面深度調整；可用名稱見 `views/partials/icon.ejs`），需要新圖示時從 lucide 複製 path 加入該檔。
- 照片 0 圓角、按鈕與輸入框 2px（`rounded-[2px]`）、只有狀態膠囊全圓角；不用「白卡＋陰影」。
- Vue 透過 unpkg 載入且未鎖定版本，需要網路連線。

## 11. 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`，放在 `docs/plans/`（例如 `docs/plans/2026-11-10-ecpay-integration.md`）。
2. 計畫文件結構：**User Story → Spec → Tasks**

   ```markdown
   # <功能名稱>

   ## User Story
   身為<角色>，我想要<行為>，以便<目的>。

   ## Spec
   - API：方法、路徑、認證、request/response、錯誤碼
   - 資料庫變更
   - 前端頁面與互動
   - 對既有模組的影響

   ## Tasks
   - [ ] 後端路由與驗證
   - [ ] 資料庫 schema / seed
   - [ ] 前端頁面
   - [ ] 測試
   - [ ] 文件更新
   ```

3. 功能完成後：在計畫檔開頭標註完成狀態、勾選 Tasks，再用 `mv` 移至 `docs/plans/archive/`（檔名不變）：

   ```bash
   mv docs/plans/2026-11-11-ecpay-aio-integration.md docs/plans/archive/
   ```

4. 更新 `docs/FEATURES.md`（狀態總覽表標記 ✅ 完成或 🚧 進行中，並寫行為描述：參數、業務邏輯、錯誤情境）和 `docs/CHANGELOG.md`（尚未定版放 `## [Unreleased]`，分類用 `### Added / Changed / Fixed / Removed`）；新增路由或資料表欄位時同步更新 `docs/ARCHITECTURE.md` 的路由表（REST API 與頁面路由）與 Schema。
