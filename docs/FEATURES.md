# 功能清單

狀態圖示：✅ 已完成　🟡 部分完成／有已知限制　⬜ 未實作

| 功能區塊 | 狀態 | API | 前端頁面 | 測試 |
|---|---|---|---|---|
| 會員註冊 | ✅ | `POST /api/auth/register` | `/login`（註冊分頁） | `auth.test.js` |
| 會員登入 | 🟡 | `POST /api/auth/login` | `/login` | `auth.test.js` |
| 個人資料 | ✅（僅 API） | `GET /api/auth/profile` | 無頁面使用 | `auth.test.js` |
| 商品列表 | ✅ | `GET /api/products` | `/` | `products.test.js` |
| 商品詳情 | ✅ | `GET /api/products/:id` | `/products/:id` | `products.test.js` |
| 購物車（訪客 + 會員） | 🟡 | `/api/cart` × 4 | `/cart`、header 徽章 | `cart.test.js` |
| 結帳建立訂單 | ✅ | `POST /api/orders` | `/checkout` | `orders.test.js` |
| 我的訂單列表/詳情 | ✅ | `GET /api/orders`、`GET /api/orders/:id` | `/orders`、`/orders/:id` | `orders.test.js` |
| 綠界 ECPay 金流（AIO 信用卡） | ✅ | `POST /api/orders/:id/ecpay/checkout`、`/verify`、`POST /api/ecpay/notify` | `/orders/:id` | `ecpay.test.js` |
| 模擬付款 | ✅（僅 API，UI 已移除） | `PATCH /api/orders/:id/pay` | — | **無測試** |
| 後台商品管理 | 🟡 | `/api/admin/products` × 4 | `/admin/products` | `adminProducts.test.js` |
| 後台訂單管理 | ✅（唯讀） | `/api/admin/orders` × 2 | `/admin/orders` | `adminOrders.test.js` |
| 訪客購物車合併至會員 | ⬜ | — | — | — |
| 後台修改訂單狀態 | ⬜ | — | — | — |
| OpenAPI 文件產生 | ✅ | `npm run openapi` | — | — |

---

## 1. 會員註冊

**`POST /api/auth/register`**（公開）

| 欄位 | 必填 | 規則 |
|---|---|---|
| `email` | ✅ | 符合 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `password` | ✅ | 長度 ≥ 6 |
| `name` | ✅ | 非空（未 trim） |

行為：

1. 依序檢查：三個欄位都存在 → Email 格式 → 密碼長度 → Email 是否已存在。
2. 以 bcrypt（salt rounds 固定 10）雜湊密碼，建立 `role = 'user'` 的使用者。**API 無法註冊 admin**。
3. 立即簽發 7 天有效的 JWT，回傳 `201 { data: { user: { id, email, name, role }, token } }`，等同「註冊即登入」。

錯誤情境：

| 情境 | 狀態 | error | message |
|---|---|---|---|
| 缺少任一欄位 | 400 | `VALIDATION_ERROR` | email、password、name 為必填欄位 |
| Email 格式錯誤 | 400 | `VALIDATION_ERROR` | Email 格式不正確 |
| 密碼少於 6 字元 | 400 | `VALIDATION_ERROR` | 密碼至少需要 6 個字元 |
| Email 已存在 | 409 | `CONFLICT` | Email 已被註冊 |

前端（`login.js` 註冊分頁）：前端驗證姓名、Email 非空、密碼 ≥ 6 字（**不檢查 Email 格式**，交由後端）。成功後 `Auth.login()` 並導向 `?redirect=` 或 `/`。

---

## 2. 會員登入

**`POST /api/auth/login`**（公開）

| 欄位 | 必填 |
|---|---|
| `email` | ✅ |
| `password` | ✅ |

行為：以 Email 查詢使用者，`bcrypt.compareSync` 比對密碼；帳號不存在與密碼錯誤回傳**相同訊息**（避免帳號列舉）。成功回傳 `200 { data: { user, token } }`。

錯誤情境：

| 情境 | 狀態 | error | message |
|---|---|---|---|
| 缺少欄位 | 400 | `VALIDATION_ERROR` | email 和 password 為必填欄位 |
| 帳號不存在或密碼錯誤 | 401 | `UNAUTHORIZED` | Email 或密碼錯誤 |

預設管理員：`admin@hexschool.com` / `12345678`（可由 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 覆寫，只在該 Email 不存在時建立）。

🟡 **已知問題**：`apiFetch` 收到任何 401 都會清除 token 並導向 `/login`，因此在登入頁輸入錯誤密碼時，頁面會直接重新載入，`login.js` 中的 `Notification.show(err.data.message)` 永遠不會執行，使用者看不到「Email 或密碼錯誤」。

登出：`Auth.logout()` 只清除 `flower_token`、`flower_user` 並導向 `/`；保留 `flower_session_id`。伺服器端沒有登出 API。

---

## 3. 個人資料

**`GET /api/auth/profile`**（`authMiddleware`）

回傳 `{ id, email, name, role, created_at }`。若 token 合法但使用者已被刪除，`authMiddleware` 會先回 401；路由內的 404 分支實際上不會被觸發。目前沒有前端頁面呼叫此 API（前端使用 localStorage 中的 `flower_user`）。

---

## 4. 商品列表與詳情

**`GET /api/products`**（公開）

| 查詢參數 | 預設 | 規則 |
|---|---|---|
| `page` | 1 | `parseInt` 失敗或 < 1 時視為 1 |
| `limit` | 10 | 限制在 1–100；`limit=0` 會因 `|| 10` 變成 10 |

- 排序：`created_at DESC`。seed 商品的 `created_at` 相同，彼此間順序不保證。
- 回傳 `{ products: [...完整商品欄位], pagination: { total, page, limit, totalPages } }`。
- 沒有搜尋、分類或價格篩選；也沒有「上架/下架」概念，庫存為 0 的商品仍會出現。

**`GET /api/products/:id`**：回傳單一商品；不存在 → `404 NOT_FOUND「商品不存在」`。

前端：

- `/`（`index.js`）：每頁 9 筆、分頁按鈕、卡片上的「加入購物車」固定數量 1；加入期間以 `product._adding` 防止重複點擊。
- `/products/:id`（`product-detail.js`）：數量選擇器範圍 1 ~ `stock`；API 404 時顯示「找不到商品」。

---

## 5. 購物車（雙模式）

所有購物車端點都使用 `dualAuth`：有 Bearer token 時以 `user_id` 識別，否則以 `X-Session-Id` 識別（流程見 [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-認證與授權)）。**帶了無效 token 會直接 401，不會退回訪客模式**；兩者都沒有 → `401「請提供有效的登入 Token 或 X-Session-Id」`。所有操作都只作用在「目前擁有者」的項目，其他人的 `itemId` 一律視為 404。

### 5.1 查看購物車 `GET /api/cart`

回傳：

```json
{
  "items": [
    { "id": "cartItemId", "product_id": "...", "quantity": 2,
      "product": { "name": "...", "price": 1680, "stock": 28, "image_url": "..." } }
  ],
  "total": 3360
}
```

`total` 以**目前**商品價格即時計算。

### 5.2 加入購物車 `POST /api/cart`

| 欄位 | 必填 | 預設 | 規則 |
|---|---|---|---|
| `productId` | ✅ | — | 必須存在 |
| `quantity` | — | 1 | `parseInt` 後須為正整數（字串 `"2"` 可接受） |

業務邏輯：

1. 若此擁有者購物車中**已有同一商品**：數量**累加**（`existing + qty`），累加後超過庫存 → `STOCK_INSUFFICIENT`。
2. 否則新增一筆，`qty` 超過庫存 → `STOCK_INSUFFICIENT`。
3. 不論新增或累加都回傳 `200 { data: { id, product_id, quantity }, message: '已加入購物車' }`（`quantity` 為累加後的值）。
4. 加入購物車**不會**預扣庫存。

### 5.3 修改數量 `PATCH /api/cart/:itemId`

| 欄位 | 必填 | 規則 |
|---|---|---|
| `quantity` | ✅ | 正整數；這是**設定**為該值，不是累加 |

檢查順序：數量格式 → 項目屬於目前擁有者 → 不超過庫存。

### 5.4 移除 `DELETE /api/cart/:itemId`

成功回傳 `200 { data: null, message: '已從購物車移除' }`。

### 錯誤情境

| 情境 | 狀態 | error |
|---|---|---|
| 無任何身分 / token 無效 / 使用者不存在 | 401 | `UNAUTHORIZED` |
| 缺 `productId` | 400 | `VALIDATION_ERROR` |
| `quantity` 非正整數 | 400 | `VALIDATION_ERROR` |
| 商品不存在 | 404 | `NOT_FOUND`（商品不存在） |
| 購物車項目不存在或不屬於自己 | 404 | `NOT_FOUND`（購物車項目不存在） |
| 超過庫存 | 400 | `STOCK_INSUFFICIENT` |

### 前端行為與限制 🟡

- `/cart`（`cart.js`）：數量 `- / +` 直接呼叫 PATCH；刪除前有確認 modal；結帳時未登入導向 `/login?redirect=/checkout`。
- header 徽章顯示**購物車項目筆數**（不是總件數）；但首頁/詳情頁加入成功時一律把徽章 +1，重複加入同一商品時徽章會暫時多算，重新整理後才正確。
- **訪客購物車不會在登入後合併**：登入後 API 改以 `user_id` 查詢，訪客時期加入的商品仍留在 `session_id` 下，使用者看不到，需登出後才會再出現。
- 前端每次請求都會帶 `X-Session-Id`，即使已登入。

---

## 6. 結帳建立訂單

**`POST /api/orders`**（`authMiddleware`）

| 欄位 | 必填 | 規則 |
|---|---|---|
| `recipientName` | ✅ | 非空 |
| `recipientEmail` | ✅ | Email 格式 |
| `recipientAddress` | ✅ | 非空 |

> 注意 body 欄位是 camelCase，資料庫欄位是 snake_case（`recipient_name` 等）。

業務邏輯：

1. 驗證欄位與 Email 格式。
2. 取出**該使用者（`user_id`）**的購物車並 JOIN 商品；訪客 `session_id` 購物車不參與結帳。
3. 空車 → `400 CART_EMPTY`。
4. 任一項目 `quantity > stock` → `400 STOCK_INSUFFICIENT`，message 列出所有不足的商品名稱（以 `, ` 分隔）。
5. `total_amount = Σ(目前單價 × 數量)`，產生 `order_no = ORD-YYYYMMDD-XXXXX`。
6. **單一 `db.transaction`**：
   - INSERT `orders`（status 預設 `pending`）
   - 每個項目 INSERT `order_items`（快照 `product_name`、`product_price`）並 `UPDATE products SET stock = stock - quantity`
   - DELETE 該使用者所有 `cart_items`
   - 任一步驟失敗（例如並發下 stock 變負數觸發 CHECK）整筆回滾，錯誤交給 errorHandler 回 500。
7. 回傳 `201 { data: { id, order_no, total_amount, status, items: [{ product_name, product_price, quantity }], created_at } }`。

前端（`checkout.js`）：`requireAuth()`；購物車為空或載入失敗導回 `/cart`；前端驗證三欄位與 Email 格式；成功後導向 `/orders/:id`；失敗顯示後端 message。

---

## 7. 我的訂單

- **`GET /api/orders`**：回傳 `{ orders: [{ id, order_no, total_amount, status, created_at }] }`，依 `created_at DESC`，**不分頁**、不含明細。
- **`GET /api/orders/:id`**：只能查自己的訂單（`WHERE id = ? AND user_id = ?`），他人或不存在的訂單 → `404 NOT_FOUND「訂單不存在」`。回傳訂單所有欄位 + `items`（`order_items` 全欄位）。
- 前端狀態標籤：`pending` 待付款、`paid` 已付款、`failed` 付款失敗。

---

## 8. 模擬付款

**`PATCH /api/orders/:id/pay`**（`authMiddleware`，只能操作自己的訂單）

| 欄位 | 必填 | 允許值 |
|---|---|---|
| `action` | ✅ | `success` → `paid`；`fail` → `failed` |

| 情境 | 狀態 | error | message |
|---|---|---|---|
| `action` 缺少或不合法 | 400 | `VALIDATION_ERROR` | action 必須為 success 或 fail |
| 訂單不存在／非本人 | 404 | `NOT_FOUND` | 訂單不存在 |
| 訂單不是 `pending` | 400 | `INVALID_STATUS` | 訂單狀態不是 pending，無法付款 |

成功回傳更新後的訂單 + `items`，message 為「付款成功」或「付款失敗」。狀態只能 `pending → paid` 或 `pending → failed` 一次；`failed` 不能重試，也**不會回補庫存**。

前端：訂單頁已不再顯示模擬付款按鈕（改為綠界付款，見下節）；此 API 保留供開發與測試直接改變訂單狀態。

---

## 8.1 綠界 ECPay 金流（AIO 信用卡，主動查詢驗證）

本專案只在本機執行，綠界的 Server Notify（ReturnURL）打不進 localhost，因此**付款結果一律由後端主動呼叫綠界 `QueryTradeInfo/V5` 查詢、驗證回應 CheckMacValue、比對金額後才更新訂單**。設計與規格來源見 [plans/archive/2026-11-11-ecpay-aio-integration.md](./plans/archive/2026-11-11-ecpay-aio-integration.md)。

- **付款方式固定 `ChoosePayment=Credit`**：ATM / 超商代碼 / 條碼為離線付款，官方規定只能等綠界通知，查詢 API 無法確認，本地架構不適用。
- 每次「前往綠界付款」都建立一筆 `ecpay_payments`，產生新的 `MerchantTradeNo`（`FL` + 台灣時間 `yyMMddHHmmss` + 6 碼英數 = 20 字元；綠界要求永久唯一，重試必須換號）。

### 建立付款 `POST /api/orders/:id/ecpay/checkout`（authMiddleware）

- 只能操作自己的訂單（否則 404 `NOT_FOUND`），且必須是 `pending`（否則 400 `INVALID_STATUS`）。
- 回傳 `{ action, params }`：`action` 為 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`（`ECPAY_ENV=production` 時為正式網域），`params` 為表單欄位（含 CheckMacValue）。
- 主要參數：`TotalAmount`（訂單金額）、`ItemName`（`<名稱> x<數量>` 以 `#` 串接，已移除 HTML／控制字元／`#`，截斷至 200 字）、`TradeDesc=花漾生活訂單`、`MerchantTradeDate`（UTC+8）、`ReturnURL=${BASE_URL}/api/ecpay/notify`、`OrderResultURL=${BASE_URL}/ecpay/result/:orderId`、`ClientBackURL=${BASE_URL}/orders/:id?payment=return`、`CustomField1=訂單 id`。
- 前端以隱藏 `<form>` 整頁 POST 到 `action`（綠界禁止 iframe）。

### 查詢並同步 `POST /api/orders/:id/ecpay/verify`（authMiddleware）

1. 訂單已 `paid` → 直接回傳，不呼叫綠界。
2. 否則查詢該訂單最新 5 筆 `pending` 付款嘗試（由新到舊），每筆呼叫 `QueryTradeInfo/V5`（`TimeStamp` 每次重產，有效 3 分鐘），並驗證回應 CheckMacValue（timing-safe）。
3. 依 `TradeStatus`（字串）處理：

| TradeStatus | 付款嘗試 | 訂單 | `result.status` |
|---|---|---|---|
| `1` 且 `TradeAmt` = 訂單金額 | `paid`，記錄 `trade_no`、`payment_type`、`payment_date` | `pending → paid`（transaction，冪等） | `paid` |
| `1` 但金額不符 | 維持 `pending`，記錄訊息並寫 log | 不變 | `mismatch` |
| `10200095` 交易未成立 | `failed` | 維持 `pending`，可重新付款 | `failed` |
| `0` 未付款 / 其他（如 `10200047` 查無訂單） | 維持 `pending` | 不變 | `pending` |
| 沒有任何付款嘗試 | — | 不變 | `none` |

回傳 `{ order: {...訂單, items}, result: { status, tradeStatus } }`，`message` 為對應中文說明。

錯誤情境：

| 情境 | 狀態 | error |
|---|---|---|
| 訂單不存在或非本人 | 404 | `NOT_FOUND` |
| 綠界回應 HTTP 403（呼叫太頻繁，需等 30 分鐘） | 429 | `ECPAY_RATE_LIMITED` |
| 連線失敗、逾時（10 秒）、非 2xx、回應 CheckMacValue 驗證失敗 | 502 | `ECPAY_QUERY_FAILED` |

> 官方提醒：信用卡付款後銀行可能延遲回覆，`TradeStatus` 會暫時為 `0`，請 10 分鐘後再查。

### 付款通知 `POST /api/ecpay/notify`（ReturnURL，無 JWT）

AIO 建單必填。驗證 CheckMacValue 後，以 `MerchantTradeNo` **再主動查詢一次**才更新訂單（不直接採信通知內容）；不論結果一律回純文字 `1|OK`、HTTP 200。本機收不到；若把 `BASE_URL` 設為 ngrok 等公開網址即可生效。

### 導回 `POST /ecpay/result/:orderId`（頁面路由）

綠界付款完成後以瀏覽器 Form POST 導回（OrderResultURL）。不採信 body，直接 302 到 `/orders/:orderId?payment=return`。

### 前端（`order-detail.js`）

- pending 訂單顯示「前往綠界付款」與「重新查詢付款結果」按鈕，以及測試卡號提示。
- 網址帶 `?payment=return` 時：載入訂單後自動呼叫一次 verify，並以 `history.replaceState` 移除參數，避免重新整理重複查詢。
- 提示橫幅：`success`、`failed`、`pending`、`mismatch`、`cancel`。

### 測試環境付款

卡號 `4311-9522-2222-2222`，有效期限任意未來月年，安全碼任意三碼，3D 驗證碼 `1234`。

---

## 9. 後台商品管理 🟡

全部需 `authMiddleware + adminMiddleware`。

### 列表 `GET /api/admin/products`

與公開列表完全相同（`page` 預設 1、`limit` 預設 10，上限 100）。前端每頁 10 筆。

### 新增 `POST /api/admin/products`

| 欄位 | 必填 | 規則 |
|---|---|---|
| `name` | ✅ | truthy（未 trim，空白字串 `" "` 可通過） |
| `price` | ✅ | **JSON number 且為整數**，> 0（字串 `"500"` 會被拒絕） |
| `stock` | ✅ | JSON number 整數，≥ 0 |
| `description` | — | 空值存為 NULL |
| `image_url` | — | 空值存為 NULL |

回傳 `201` 與完整商品。

### 更新 `PUT /api/admin/products/:id`

語意上是**部分更新**：只更新 body 中有出現（`!== undefined`）的欄位，其餘保留原值。驗證：`name` 若提供則 trim 後不可為空；`price`、`stock` 規則同新增。會更新 `updated_at`。商品不存在 → 404。

> 更新價格不會影響既有訂單（`order_items` 有快照），但會影響所有購物車的顯示價格與之後結帳的金額。

### 刪除 `DELETE /api/admin/products/:id`

1. 不存在 → 404。
2. 若此商品出現在任何 **`pending`** 訂單的明細中 → `409 CONFLICT「此商品存在未完成的訂單，無法刪除」`。`paid`/`failed` 訂單不會阻擋刪除（`order_items` 保留快照）。
3. 🟡 **已知問題**：若商品仍在任何人的購物車中，`DELETE` 會觸發 `cart_items.product_id` 外鍵約束，回傳 `500 INTERNAL_ERROR「伺服器內部錯誤」`，而不是友善的錯誤訊息。

前端（`admin-products.js`）：新增/編輯共用 modal，`price`、`stock` 使用 `v-model.number`；前端只檢查名稱非空且價格 > 0；刪除前確認；失敗一律顯示「儲存失敗」/「刪除失敗」（不顯示後端 message）。

---

## 10. 後台訂單管理

### 列表 `GET /api/admin/orders`

| 查詢參數 | 預設 | 規則 |
|---|---|---|
| `page` | 1 | 同商品列表 |
| `limit` | 10 | 1–100 |
| `status` | 無 | 只接受 `pending` / `paid` / `failed`；其他值**被忽略**（等同不篩選，不會報錯） |

回傳全站訂單（`orders` 全欄位，不含明細）與 `pagination`，依 `created_at DESC`。

### 詳情 `GET /api/admin/orders/:id`

回傳訂單全欄位 + `items` + `user: { name, email } | null`（下單者不存在時為 null）。

目前後台**只能查看**，沒有修改訂單狀態、取消訂單或出貨的功能。

前端（`admin-orders.js`）：狀態下拉選單變更時重新載入第 1 頁；詳情以 modal 顯示。

---

## 11. 頁面與共用 UI

| 元件 | 說明 |
|---|---|
| `Notification.show(message, type)` | `type` 為 `success` / `error` / `warning` / `info`；3 秒後淡出；同時只顯示一則 |
| header（前台） | 登入後顯示使用者名稱、登出；admin 另顯示「後台管理」連結；「我的訂單」只在登入時顯示 |
| admin header | 「返回前台」、使用者名稱、登出 |
| 404 頁 | 非 `/api` 的未知路徑渲染 `pages/404` 並包進前台 layout |
| 401 處理 | `apiFetch` 收到 401 → 清除 token/user → 導向 `/login`（任何頁面皆然，含 header 徽章請求） |

---

## 12. 未實作 / 待辦

- ⬜ 登入時合併訪客購物車
- ⬜ 後台修改訂單狀態
- ⬜ 付款失敗／取消時回補庫存
- ⬜ 模擬付款 API 的自動化測試
- ⬜ 綠界 ATM / 超商代碼 / 條碼付款（需要可接收 Server Notify 的公開網址）
- ⬜ 綠界信用卡退款（`/CreditDetail/DoAction`，stage 環境不可用）
- 🟡 登入失敗訊息無法顯示（`apiFetch` 401 處理）
- 🟡 刪除仍在購物車中的商品回傳 500
