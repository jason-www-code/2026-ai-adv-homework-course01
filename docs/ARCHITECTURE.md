# 架構說明

本文件說明「花漾生活 Flower Life」花卉電商的系統架構、目錄結構、啟動流程、API 路由、認證機制、資料庫 schema 與資料流。

---

## 1. 系統總覽

```
瀏覽器
 ├─ 頁面請求 (GET /, /cart, /admin/...) ──▶ pageRoutes ──▶ EJS 頁面 + layout ──▶ HTML 外殼
 │                                                                              │
 │   HTML 載入 Vue 3 (CDN) + auth.js + api.js + notification.js + 頁面腳本 ◀─────┘
 │
 └─ 頁面腳本 apiFetch('/api/...') ──▶ Express API routes ──▶ better-sqlite3 (database.sqlite)
                                         │
                                         └─ 回傳 { data, error, message } JSON
```

- **伺服器端**：Express 4.16，同時負責「頁面外殼渲染」與「JSON REST API」。
- **頁面**：EJS 只渲染靜態 HTML 外殼，**不注入任何業務資料**（只注入 `productId`、`orderId`、`paymentResult` 這類 URL 參數）。所有資料都由瀏覽器端 Vue 透過 API 取得。
- **前端**：Vue 3 global build（`https://unpkg.com/vue@3/dist/vue.global.prod.js`），沒有打包工具、沒有 SFC、沒有模組系統，所有前端腳本都是全域 `<script>`。
- **樣式**：Tailwind CSS v4，透過 `@tailwindcss/cli` 把 `public/css/input.css` 編譯成 `public/css/output.css`。
- **資料庫**：SQLite（better-sqlite3，同步 API），檔案位於專案根目錄 `database.sqlite`。

---

## 2. 目錄結構

```
.
├── server.js                 # 程式進入點：檢查 JWT_SECRET、app.listen(PORT)
├── app.js                    # 建立 Express app：middleware、路由掛載、404、錯誤處理；匯出 app 供測試使用
├── generate-openapi.js       # 讀取 swagger-config.js，輸出 openapi.json 到專案根目錄
├── swagger-config.js         # swagger-jsdoc 設定：OpenAPI 3.0.3、securitySchemes、掃描 ./src/routes/*.js
├── vitest.config.js          # Vitest 設定（globals、不平行執行檔案、hookTimeout）
├── package.json
├── .env.example              # 環境變數範本
├── database.sqlite           # 執行時自動產生（gitignore），另有 -wal / -shm 檔
│
├── src/
│   ├── database.js           # 開啟 SQLite、設定 pragma、建表、seed，匯出單例 db
│   ├── services/
│   │   ├── ecpay.js              # 綠界 AIO：CheckMacValue、建單參數、QueryTradeInfo 查詢
│   │   └── ecpayPayment.js       # 付款嘗試建立與狀態同步（verify / notify 共用）
│   ├── middleware/
│   │   ├── authMiddleware.js     # 驗證 Bearer JWT，設定 req.user
│   │   ├── adminMiddleware.js    # 要求 req.user.role === 'admin'
│   │   ├── sessionMiddleware.js  # 讀取 X-Session-Id 標頭，設定 req.sessionId（全域）
│   │   └── errorHandler.js       # 全域錯誤處理，避免洩漏內部錯誤訊息
│   └── routes/
│       ├── authRoutes.js         # /api/auth：註冊、登入、個人資料
│       ├── productRoutes.js      # /api/products：公開商品列表與詳情
│       ├── cartRoutes.js         # /api/cart：購物車（內含 dualAuth 雙模式認證）
│       ├── orderRoutes.js        # /api/orders：建立訂單、訂單列表/詳情、模擬付款、綠界 checkout / verify
│       ├── adminProductRoutes.js # /api/admin/products：商品 CRUD
│       ├── adminOrderRoutes.js   # /api/admin/orders：訂單列表（可篩選）與詳情
│       ├── ecpayRoutes.js        # /api/ecpay：綠界 ReturnURL 付款通知
│       └── pageRoutes.js         # 頁面路由：渲染 EJS 頁面並包進 layout
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs         # 前台 layout：header、footer、通知、載入共用腳本 + header-init.js
│   │   └── admin.ejs         # 後台 layout：admin header/sidebar、inline 的 requireAdmin 檢查
│   ├── pages/                # 每個頁面的主體（含 Vue template，掛在 #app）
│   │   ├── index.ejs, product-detail.ejs, cart.ejs, checkout.ejs,
│   │   ├── login.ejs, orders.ejs, order-detail.ejs, 404.ejs
│   │   └── admin/products.ejs, admin/orders.ejs
│   └── partials/             # head（字型、output.css）、header、footer、notification、admin-header、admin-sidebar
│
├── public/
│   ├── css/input.css         # Tailwind 入口與 @theme 色彩 token
│   ├── css/output.css        # 編譯產物（gitignore，需先 build）
│   ├── stylesheets/style.css # Express generator 遺留檔，沒有任何頁面引用
│   └── js/
│       ├── auth.js           # 全域 Auth 物件：localStorage 中的 token、user、session id
│       ├── api.js            # 全域 apiFetch()：自動加標頭、處理 401
│       ├── notification.js   # 全域 Notification.show(message, type)：右上角 toast
│       ├── header-init.js    # 前台 header：登入狀態導覽列、購物車徽章
│       └── pages/*.js        # 各頁面的 Vue app（檔名 = pageScript）
│
├── tests/                    # Vitest + supertest 整合測試（見 TESTING.md）
└── docs/                     # 專案文件
```

---

## 3. 啟動流程

1. `node server.js` → `require('./app')`。
2. `app.js` 第一行 `require('dotenv').config()` 載入 `.env`。
3. `require('./src/database')` 執行 `database.js`：
   - 開啟 `<repo>/database.sqlite`（不存在就建立）。
   - `PRAGMA journal_mode = WAL`、`PRAGMA foreign_keys = ON`。
   - `CREATE TABLE IF NOT EXISTS` 建立 5 張表。
   - `seedAdminUser()`：若 `ADMIN_EMAIL` 帳號不存在則建立管理員（`NODE_ENV=test` 時 bcrypt salt rounds = 1，否則 10）。
   - `seedProducts()`：若 `products` 表為空，以 transaction 寫入 8 筆花卉商品。
4. `app.js` 設定 view engine、靜態檔、CORS、body parser、`sessionMiddleware`，掛載 API 與頁面路由、404、`errorHandler`。
5. 回到 `server.js`：只有在 `require.main === module`（直接執行）時才檢查 `JWT_SECRET` 並 `listen(PORT)`。被測試 `require` 時不會 listen。

> `JWT_SECRET` 檢查只存在於 `server.js`。測試直接用 `app.js`，若 `.env` 中沒有 `JWT_SECRET`，`jwt.sign` 會拋錯導致註冊/登入回傳 500。

### Middleware 順序（app.js）

| 順序 | Middleware | 作用 |
|---|---|---|
| 1 | `express.static('public')` | 靜態檔，優先於所有路由 |
| 2 | `cors({ origin: FRONTEND_URL \|\| 'http://localhost:3001' })` | 只允許單一來源 |
| 3 | `express.json()` | 解析 JSON body |
| 4 | `express.urlencoded({ extended: false })` | 解析表單 body |
| 5 | `sessionMiddleware` | `X-Session-Id` → `req.sessionId` |
| 6 | API 路由（見下表） | |
| 7 | `pageRoutes`（掛在 `/`） | |
| 8 | 404 handler | `/api/*` 回 JSON；其他路徑渲染 `pages/404` 並包進 front layout |
| 9 | `errorHandler` | 全域錯誤處理 |

---

## 4. API 路由總覽

| 前綴 | 檔案 | 認證 | 說明 |
|---|---|---|---|
| `/api/auth` | `src/routes/authRoutes.js` | `register`、`login` 公開；`profile` 需 `authMiddleware` | 註冊、登入、取得個人資料 |
| `/api/products` | `src/routes/productRoutes.js` | 公開 | 商品列表（分頁）、商品詳情 |
| `/api/cart` | `src/routes/cartRoutes.js` | 每個路由都套 `dualAuth`（JWT 或 `X-Session-Id`） | 查看、加入、修改數量、移除 |
| `/api/orders` | `src/routes/orderRoutes.js` | `router.use(authMiddleware)`，全部需登入 | 從購物車建立訂單、訂單列表/詳情、模擬付款、綠界付款建立與查詢 |
| `/api/ecpay` | `src/routes/ecpayRoutes.js` | 無 JWT，以 CheckMacValue 驗證 | 綠界 ReturnURL 付款通知 |
| `/api/admin/products` | `src/routes/adminProductRoutes.js` | `router.use(authMiddleware, adminMiddleware)` | 商品列表、新增、更新、刪除 |
| `/api/admin/orders` | `src/routes/adminOrderRoutes.js` | `router.use(authMiddleware, adminMiddleware)` | 全站訂單列表（可依狀態篩選）、訂單詳情（含下單者） |
| `/` | `src/routes/pageRoutes.js` | 無（伺服器端不檢查） | EJS 頁面 |

> 掛載順序上 `/api/admin/products` 在 `/api/products` 之前，兩者前綴不同，不會互相攔截。

### 完整端點清單

| 方法 | 路徑 | 認證 | 成功狀態碼 |
|---|---|---|---|
| POST | `/api/auth/register` | 公開 | 201 |
| POST | `/api/auth/login` | 公開 | 200 |
| GET | `/api/auth/profile` | JWT | 200 |
| GET | `/api/products` | 公開 | 200 |
| GET | `/api/products/:id` | 公開 | 200 |
| GET | `/api/cart` | JWT 或 Session | 200 |
| POST | `/api/cart` | JWT 或 Session | 200（新增與累加都是 200） |
| PATCH | `/api/cart/:itemId` | JWT 或 Session | 200 |
| DELETE | `/api/cart/:itemId` | JWT 或 Session | 200 |
| POST | `/api/orders` | JWT | 201 |
| GET | `/api/orders` | JWT | 200 |
| GET | `/api/orders/:id` | JWT | 200 |
| PATCH | `/api/orders/:id/pay` | JWT | 200 |
| POST | `/api/orders/:id/ecpay/checkout` | JWT | 200 |
| POST | `/api/orders/:id/ecpay/verify` | JWT | 200 |
| POST | `/api/ecpay/notify` | CheckMacValue | 200（純文字 `1\|OK`） |
| GET | `/api/admin/products` | JWT + admin | 200 |
| POST | `/api/admin/products` | JWT + admin | 201 |
| PUT | `/api/admin/products/:id` | JWT + admin | 200 |
| DELETE | `/api/admin/products/:id` | JWT + admin | 200 |
| GET | `/api/admin/orders` | JWT + admin | 200 |
| GET | `/api/admin/orders/:id` | JWT + admin | 200 |

### 頁面路由

| 路徑 | EJS | Layout | pageScript | 注入變數 | 前端權限檢查 |
|---|---|---|---|---|---|
| `/` | `pages/index` | front | `index` | — | 無 |
| `/products/:id` | `pages/product-detail` | front | `product-detail` | `productId` | 無 |
| `/cart` | `pages/cart` | front | `cart` | — | 無（結帳按鈕才要求登入） |
| `/checkout` | `pages/checkout` | front | `checkout` | — | `Auth.requireAuth()` |
| `/login` | `pages/login` | front | `login` | — | 無 |
| `/orders` | `pages/orders` | front | `orders` | — | `Auth.requireAuth()` |
| `/orders/:id` | `pages/order-detail` | front | `order-detail` | `orderId`、`paymentResult`（來自 `?payment=`） | `Auth.requireAuth()` |
| `/admin/products` | `pages/admin/products` | admin | `admin-products` | `currentPath` | layout 中 `Auth.requireAdmin()` |
| `/admin/orders` | `pages/admin/orders` | admin | `admin-orders` | `currentPath` | layout 中 `Auth.requireAdmin()` |
| `POST /ecpay/result/:orderId` | —（302 導回 `/orders/:orderId?payment=return`） | — | — | — | 無 |

注入變數透過 `#app` 的 `data-*` 屬性傳給 Vue，例如 `<div id="app" data-order-id="<%= orderId %>" data-payment-result="<%= paymentResult %>">`，頁面腳本以 `document.getElementById('app').dataset.orderId` 讀取。

---

## 5. 統一回應格式

所有 API（包含 404 與錯誤處理）都回傳相同的三欄位結構：

```json
{
  "data": <物件 | 陣列包在物件中 | null>,
  "error": <null | "錯誤代碼字串">,
  "message": "給使用者看的繁體中文訊息"
}
```

成功範例（`GET /api/products?page=1&limit=2`）：

```json
{
  "data": {
    "products": [
      { "id": "uuid", "name": "粉色玫瑰花束", "description": "...", "price": 1680, "stock": 30,
        "image_url": "https://...", "created_at": "2026-11-10 14:37:49", "updated_at": "2026-11-10 14:37:49" }
    ],
    "pagination": { "total": 8, "page": 1, "limit": 2, "totalPages": 4 }
  },
  "error": null,
  "message": "成功"
}
```

失敗範例（`POST /api/cart` 庫存不足）：

```json
{ "data": null, "error": "STOCK_INSUFFICIENT", "message": "庫存不足" }
```

### 錯誤代碼一覽

| 錯誤代碼 | HTTP | 出現位置 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 欄位缺失或格式錯誤（auth、cart、orders、admin products） |
| `UNAUTHORIZED` | 401 | 未帶 token、token 無效/過期、使用者已不存在、登入帳密錯誤、購物車未提供任何身分 |
| `FORBIDDEN` | 403 | 非 admin 存取 `/api/admin/*` |
| `NOT_FOUND` | 404 | 商品、購物車項目、訂單、使用者不存在；未知的 `/api/*` 路徑 |
| `CONFLICT` | 409 | Email 已註冊；刪除仍有 pending 訂單的商品 |
| `CART_EMPTY` | 400 | 建立訂單時購物車為空 |
| `STOCK_INSUFFICIENT` | 400 | 加入/修改購物車或建立訂單時庫存不足 |
| `INVALID_STATUS` | 400 | 對非 `pending` 訂單呼叫付款或建立綠界付款 |
| `ECPAY_RATE_LIMITED` | 429 | 綠界查詢 API 回 403（呼叫太頻繁） |
| `ECPAY_QUERY_FAILED` | 502 | 綠界查詢連線失敗、逾時、非 2xx 或回應 CheckMacValue 驗證失敗 |
| `INTERNAL_ERROR` | 任何 | `errorHandler` 統一使用此代碼（**不論實際狀態碼**） |

### errorHandler 行為

- 狀態碼取 `err.status || err.statusCode || 500`。
- 500 一律回 `伺服器內部錯誤`。
- 非 500：若 `err.isOperational === true` 則使用 `err.message`，否則使用 `SAFE_MESSAGES[statusCode]`（400 `請求格式錯誤`、401、403、404、409、422、429），都沒有則 `請求處理失敗`。
- `error` 欄位永遠是 `INTERNAL_ERROR`。例如送出格式錯誤的 JSON，body-parser 拋出 status 400 的錯誤，回應會是 `400 { error: 'INTERNAL_ERROR', message: '請求格式錯誤' }`。
- 多數路由是同步程式碼，Express 4 會自動把同步拋出的錯誤（例如 SQLite constraint error）交給 errorHandler。**async 路由（目前只有 `ecpay/verify` 與 `/api/ecpay/notify`）必須自行 `try/catch`**，Express 4 不會捕捉 rejected promise。

---

## 6. 認證與授權

### JWT

| 項目 | 值 |
|---|---|
| 簽發位置 | `authRoutes.js` 的 `register` 與 `login` |
| 演算法 | HS256（`jwt.sign` 預設；驗證時明確限制 `algorithms: ['HS256']`） |
| 密鑰 | `process.env.JWT_SECRET` |
| 有效期 | `expiresIn: '7d'` |
| Payload | `{ userId, email, role }`（+ `iat`、`exp`） |
| 傳遞方式 | `Authorization: Bearer <token>` |
| 前端保存 | `localStorage['flower_token']`，使用者資訊存於 `localStorage['flower_user']` |
| 撤銷機制 | 無。登出只清除 localStorage；伺服器端沒有黑名單 |

### authMiddleware（`src/middleware/authMiddleware.js`）

1. 沒有 `Authorization` 或不以 `Bearer ` 開頭 → `401 UNAUTHORIZED「請先登入」`。
2. `jwt.verify` 失敗（簽章錯誤、過期）→ `401 UNAUTHORIZED「Token 無效或已過期」`。
3. 以 `decoded.userId` 查 `users` 表，不存在 → `401 UNAUTHORIZED「使用者不存在，請重新登入」`。
4. 設定 `req.user = { userId, email, role }` 後 `next()`。

> `req.user.role` **來自 token payload，而不是資料庫**。若在資料庫中變更使用者角色，舊 token 在到期前仍保有舊角色。

### adminMiddleware（`src/middleware/adminMiddleware.js`）

- 必須接在 `authMiddleware` 之後。`!req.user || req.user.role !== 'admin'` → `403 FORBIDDEN「權限不足」`。

### sessionMiddleware（`src/middleware/sessionMiddleware.js`）

- 全域套用。若有 `X-Session-Id` 標頭，設定 `req.sessionId`。不做任何格式驗證或伺服器端 session 儲存——session id 完全由前端產生（`crypto.randomUUID()`，存於 `localStorage['flower_session_id']`）。

### dualAuth（`src/routes/cartRoutes.js`，僅購物車使用）

```
有 Authorization: Bearer？
 ├─ 是 → jwt.verify
 │        ├─ 失敗 → 401「Token 無效或已過期」（不會退回 session 模式）
 │        ├─ 使用者不存在 → 401「使用者不存在，請重新登入」
 │        └─ 成功 → req.user，購物車以 user_id 為擁有者
 └─ 否 → 有 req.sessionId？
          ├─ 是 → 購物車以 session_id 為擁有者
          └─ 否 → 401「請提供有效的登入 Token 或 X-Session-Id」
```

`getOwnerCondition(req)` 回傳 `{ field: 'user_id' | 'session_id', value }`，路由以字串插值把 `field` 放進 SQL（`WHERE ci.${owner.field} = ?`）。`field` 只會是這兩個固定值，值本身仍使用參數綁定。

> 前端的 `Auth.getAuthHeaders()` **永遠**同時送出 `Authorization`（若已登入）與 `X-Session-Id`。登入後 JWT 優先，因此訪客時期的購物車（`session_id`）不會出現在登入後的購物車中，**目前沒有合併機制**。

### 前端權限

- 伺服器端頁面路由**沒有**任何權限檢查，任何人都能取得 `/admin/*` 的 HTML 外殼。
- `Auth.requireAuth()`：未登入導向 `/login?redirect=<目前路徑>`。
- `Auth.requireAdmin()`：未登入或非 admin 導向 `/login`（不帶 redirect）。
- 真正的資料保護由 API 的 `authMiddleware` / `adminMiddleware` 負責。

---

## 7. 資料庫 Schema

設定：`journal_mode = WAL`、`foreign_keys = ON`。所有主鍵都是 `uuid v4` 字串（應用程式端產生）。時間欄位為 SQLite `datetime('now')` 產生的 UTC 字串，格式 `YYYY-MM-DD HH:MM:SS`（無時區標記）。金額皆為整數（新台幣元）。

### users

| 欄位 | 型別 | 約束 | 說明 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | uuid |
| `email` | TEXT | UNIQUE NOT NULL | 登入帳號（大小寫敏感比對） |
| `password_hash` | TEXT | NOT NULL | bcrypt hash |
| `name` | TEXT | NOT NULL | 顯示名稱 |
| `role` | TEXT | NOT NULL DEFAULT `'user'`，CHECK IN (`'user'`, `'admin'`) | 角色 |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

### products

| 欄位 | 型別 | 約束 | 說明 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | uuid |
| `name` | TEXT | NOT NULL | |
| `description` | TEXT | 可為 NULL | |
| `price` | INTEGER | NOT NULL，CHECK `price > 0` | 單價 |
| `stock` | INTEGER | NOT NULL DEFAULT 0，CHECK `stock >= 0` | 庫存 |
| `image_url` | TEXT | 可為 NULL | 外部圖片網址（Unsplash） |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | 列表排序依據（DESC） |
| `updated_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | 只有 admin PUT 會更新 |

### cart_items

| 欄位 | 型別 | 約束 | 說明 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | uuid |
| `session_id` | TEXT | 可為 NULL | 訪客購物車擁有者 |
| `user_id` | TEXT | 可為 NULL，FK → `users(id)` | 會員購物車擁有者 |
| `product_id` | TEXT | NOT NULL，FK → `products(id)` | |
| `quantity` | INTEGER | NOT NULL DEFAULT 1，CHECK `quantity > 0` | |

- 沒有 `UNIQUE(owner, product_id)` 約束；「同商品只有一筆」由 `POST /api/cart` 的程式邏輯保證。
- 沒有 `CHECK` 確保 `user_id` 與 `session_id` 至少一個不為 NULL。
- 外鍵沒有 `ON DELETE`，因此**刪除仍存在於任何購物車中的商品會觸發 `SQLITE_CONSTRAINT_FOREIGNKEY`，回傳 500**。

### orders

| 欄位 | 型別 | 約束 | 說明 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | uuid |
| `order_no` | TEXT | UNIQUE NOT NULL | `ORD-YYYYMMDD-XXXXX`（UTC 日期 + uuid 前 5 碼大寫） |
| `user_id` | TEXT | NOT NULL，FK → `users(id)` | 下單者 |
| `recipient_name` | TEXT | NOT NULL | |
| `recipient_email` | TEXT | NOT NULL | |
| `recipient_address` | TEXT | NOT NULL | |
| `total_amount` | INTEGER | NOT NULL | 下單時計算的總額 |
| `status` | TEXT | NOT NULL DEFAULT `'pending'`，CHECK IN (`'pending'`, `'paid'`, `'failed'`) | |
| `created_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

### order_items

| 欄位 | 型別 | 約束 | 說明 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | uuid |
| `order_id` | TEXT | NOT NULL，FK → `orders(id)` | |
| `product_id` | TEXT | NOT NULL（**無 FK**） | 商品被刪除後仍保留 |
| `product_name` | TEXT | NOT NULL | 下單時的商品名稱快照 |
| `product_price` | INTEGER | NOT NULL | 下單時的單價快照 |
| `quantity` | INTEGER | NOT NULL | |

### ecpay_payments

每次「前往綠界付款」建立一筆（`MerchantTradeNo` 綠界要求永久唯一，重試必須換號）。

| 欄位 | 型別 | 約束 | 說明 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | uuid |
| `order_id` | TEXT | NOT NULL，FK → `orders(id)`，有索引 | |
| `merchant_trade_no` | TEXT | UNIQUE NOT NULL | 送給綠界的特店交易編號（20 碼英數） |
| `total_amount` | INTEGER | NOT NULL | 建立時的訂單金額，查詢時比對 `TradeAmt` |
| `status` | TEXT | NOT NULL DEFAULT `'pending'`，CHECK IN (`'pending'`, `'paid'`, `'failed'`) | |
| `trade_no` | TEXT | 可為 NULL | 綠界交易編號 |
| `payment_type` | TEXT | 可為 NULL | 如 `Credit_CreditCard` |
| `payment_date` | TEXT | 可為 NULL | 綠界回傳付款時間（UTC+8 字串） |
| `trade_status` | TEXT | 可為 NULL | 最後一次查詢的 `TradeStatus` |
| `rtn_msg` | TEXT | 可為 NULL | 備註（如金額不符） |
| `created_at` / `updated_at` | TEXT | NOT NULL DEFAULT `datetime('now')` | |

### 關聯

```
users 1 ──< cart_items >── 1 products
users 1 ──< orders 1 ──< order_items ··· products（僅邏輯關聯，無 FK）
               orders 1 ──< ecpay_payments
```

### Schema 變更注意

- 沒有 migration 工具，`CREATE TABLE IF NOT EXISTS` 不會修改既有表。
- 修改既有表結構時，開發環境需刪除 `database.sqlite`（以及 `database.sqlite-wal`、`database.sqlite-shm`）讓程式重建；或在 `initializeDatabase()` 中自行撰寫 `ALTER TABLE`。
- 資料庫路徑寫死為 `path.join(__dirname, '..', 'database.sqlite')`，沒有環境變數可切換（測試也使用同一個檔案）。

---

## 8. 核心資料流

### 8.1 訪客瀏覽並加入購物車

1. 瀏覽器載入 `/` → 前台 layout → `index.js` 呼叫 `GET /api/products?page=1&limit=9`。
2. `header-init.js` 在每個前台頁面呼叫 `GET /api/cart` 更新購物車徽章。
3. 第一次呼叫 `Auth.getSessionId()` 時產生 UUID 存進 localStorage。
4. 點擊「加入購物車」→ `POST /api/cart { productId, quantity: 1 }`，帶 `X-Session-Id` → `cart_items.session_id`。

### 8.2 登入 → 結帳 → 付款

1. `/cart` 點「結帳」：未登入導向 `/login?redirect=/checkout`。
2. `login.js` 呼叫 `POST /api/auth/login`，成功後 `Auth.login(token, user)`，導回 `redirect` 參數。
3. `/checkout`：`checkout.js` 讀取 `GET /api/cart`（此時以 `user_id` 查詢；空車則導回 `/cart`）。
4. 送出 `POST /api/orders { recipientName, recipientEmail, recipientAddress }`：
   - 驗證欄位與 Email 格式。
   - 讀取該使用者的購物車並 JOIN 商品取得目前價格與庫存。
   - 檢查空車、逐項檢查庫存。
   - **單一 transaction**：建立 `orders`（status = pending）→ 逐項寫入 `order_items`（名稱、價格快照）並 `UPDATE products SET stock = stock - qty` → 清空該使用者購物車。
5. 導向 `/orders/:id`，`order-detail.js` 顯示訂單；pending 狀態提供「前往綠界付款」→ `POST /api/orders/:id/ecpay/checkout` → 表單跳轉綠界付款 → 導回後 `POST /api/orders/:id/ecpay/verify` 主動查詢確認（詳見 §9）。

### 8.3 後台管理

1. `/admin/*` layout 先執行 `Auth.requireAdmin()`。
2. `admin-products.js`：`GET/POST/PUT/DELETE /api/admin/products`，表單以 `v-model.number` 綁定 `price`、`stock`，確保送出整數。
3. `admin-orders.js`：`GET /api/admin/orders?page=&limit=10&status=`，切換狀態篩選時自動重新載入第 1 頁；點擊列可開啟詳情 modal（`GET /api/admin/orders/:id`，含 `user: { name, email }`）。

---

## 9. 金流與第三方整合

### 綠界 ECPay AIO（信用卡，本地端主動查詢驗證）

本專案只在本機執行，綠界的 Server Notify（ReturnURL）無法送達 localhost，因此**付款結果的唯一採信來源是後端主動呼叫 `QueryTradeInfo/V5` 並驗證 CheckMacValue 的結果**。詳細行為見 [FEATURES.md §8.1](./FEATURES.md#81-綠界-ecpay-金流aio-信用卡主動查詢驗證)。

```
訂單頁 /orders/:id（pending）── 前往綠界付款
  → POST /api/orders/:id/ecpay/checkout
      建立 ecpay_payments（新 MerchantTradeNo）+ 組 AIO 參數 + CheckMacValue(SHA256)
  → 瀏覽器以表單 POST 到 payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5
  → 消費者在綠界輸入信用卡、3D 驗證
  → 綠界以瀏覽器 POST 導回 OrderResultURL：/ecpay/result/:orderId → 302 /orders/:id?payment=return
     （ClientBackURL「返回商店」也導到同一網址）
  → order-detail.js 呼叫 POST /api/orders/:id/ecpay/verify
      → QueryTradeInfo/V5（TimeStamp 3 分鐘有效）→ 驗證回應 CheckMacValue
      → TradeStatus='1' 且 TradeAmt 相符 → transaction：payment=paid、order pending→paid
```

| 項目 | 說明 |
|---|---|
| 協議 | CMV-SHA256，`application/x-www-form-urlencoded` |
| 實作 | `src/services/ecpay.js`（CheckMacValue 由 `.claude/skills/ecpay/guides/13-checkmacvalue.md` Node.js 版翻譯，通過官方測試向量） |
| URL encode | `ecpayUrlEncode`：`encodeURIComponent` → `%20→+`、`~→%7e`、`'→%27` → 轉小寫 → .NET 字元還原（**不可**與 AES 服務的 encode 混用） |
| 比對 | `crypto.timingSafeEqual`，禁止 `==` |
| 付款方式 | 固定 `ChoosePayment=Credit`（ATM/CVS/BARCODE 需等 Server Notify，本地不適用） |
| 環境 | `ECPAY_ENV=staging` → `payment-stage.ecpay.com.tw`；`production` → `payment.ecpay.com.tw` |
| 限速 | 查詢太頻繁回 HTTP 403，需等 30 分鐘；verify 每次最多查 5 筆付款嘗試，前端只在導回時自動查一次 |
| ReturnURL | `/api/ecpay/notify` 已實作（驗證 CMV → 再查詢一次 → 回 `1\|OK`），`BASE_URL` 設為公開網址時才會收到 |
| 已驗證 | 2026-11-11 對 stage 實測：建單參數被接受並顯示付款頁（含 `:3001` 的 OrderResultURL / ClientBackURL）；真實 QueryTradeInfo 回應 CheckMacValue 驗證通過 |

### 模擬付款（保留）

- `PATCH /api/orders/:id/pay`，body `{ action: 'success' | 'fail' }`，對應 `paid` / `failed`，只有 `pending` 可轉換。前端已不再顯示按鈕，供開發與測試使用。
- 付款失敗**不會**回補庫存，庫存在建立訂單時就已扣除。

### 其他外部資源

| 資源 | 用途 |
|---|---|
| `unpkg.com/vue@3` | 前端 Vue 3 global build（未鎖定版本） |
| Google Fonts | Noto Sans TC / Noto Serif TC |
| `images.unsplash.com` | 商品與首頁圖片 |
