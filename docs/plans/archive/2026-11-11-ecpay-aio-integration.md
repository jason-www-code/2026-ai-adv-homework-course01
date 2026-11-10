# 串接綠界 ECPay AIO 金流（本地端主動查詢驗證）

> 狀態：✅ 已完成（2026-11-11），已歸檔。

## User Story

身為顧客，我想要在結帳後用綠界信用卡付款，並在付完款回到網站時看到訂單變成「已付款」，以便確認交易完成；而網站即使只在本機執行、收不到綠界的伺服器通知，也能正確確認付款結果。

# Spec

## Context

目前訂單建立後只能用 `PATCH /api/orders/:id/pay` 按鈕「模擬付款」。需求是在既有「商品 → 購物車 → 結帳」流程後接上綠界真實金流（測試環境），並確保付款成功能反映到訂單狀態。

限制：專案只在本機執行，綠界的 Server Notify（ReturnURL）打不進 localhost。因此**付款結果改由後端主動呼叫綠界 `QueryTradeInfo/V5` 查詢並驗證 CheckMacValue 後才更新訂單**。

規格來源（已 web_fetch，2026-11-11）：
- 產生訂單 https://developers.ecpay.com.tw/2862.md
- 查詢訂單 https://developers.ecpay.com.tw/2890.md
- 介接注意事項 https://developers.ecpay.com.tw/2858.md
- Node.js CheckMacValue：`.claude/skills/ecpay/guides/13-checkmacvalue.md` line 202-262；測試向量 `.claude/skills/ecpay/test-vectors/checkmacvalue.json`

## 方案：AIO（CMV-SHA256）+ 信用卡 + 返回後主動查詢

選 AIO：專案是 SSR + 全頁跳轉最單純。**`ChoosePayment=Credit` 固定信用卡**：官方說明 ATM/CVS/BARCODE/BNPL 為離線付款「請待綠界通知」，查詢 API 無法確認，本地端架構不適用。

### 付款流程

```
/orders/:id (pending) ─ 點「前往綠界付款」
  → POST /api/orders/:id/ecpay/checkout（JWT）
      後端：產生新 MerchantTradeNo、寫 ecpay_payments、組參數 + CheckMacValue
      回傳 { action: AioCheckOut URL, params }
  → 前端動態建立 <form method=POST> 全頁 submit 到綠界（禁止 iframe）
  → 消費者在綠界輸入測試卡 4311-9522-2222-2222 / 3DS 1234
  → 綠界瀏覽器導回 OrderResultURL：POST /ecpay/result/:orderId（本地頁面路由）
      → 302 到 /orders/:orderId?payment=return
     （若未自動導回，ClientBackURL「返回商店」按鈕也導到同一網址）
  → order-detail.js 偵測 payment=return → POST /api/orders/:id/ecpay/verify
      後端：對該訂單所有 pending 付款嘗試呼叫 QueryTradeInfo/V5
            → 驗證回應 CheckMacValue（timing-safe）
            → TradeStatus='1' 且 TradeAmt === total_amount → transaction 內把 payment 與 order 設為 paid
      回傳更新後訂單 + 查詢結果
  → 頁面顯示付款成功 / 尚未確認（可按「重新查詢付款結果」）
```

### 狀態對應（QueryTradeInfo `TradeStatus`，字串比較）

| TradeStatus | 處理 |
|---|---|
| `1` 已付款 | 金額相符 → payment `paid`、order `paid`（存 TradeNo、PaymentType、PaymentDate）；金額不符 → 不更新，記 log，回 `ECPAY_AMOUNT_MISMATCH` |
| `0` 未付款 | 維持 pending，回傳「尚未確認付款」（官方：銀行可能延遲，10 分鐘後再查） |
| `10200095` 交易未成立 | payment 標 `failed`，**訂單維持 pending 可重新付款** |
| 其他（如查無訂單 `10200047`：使用者未進入綠界頁） | 維持 pending |

訂單 `failed` 不再由綠界流程寫入（保留給既有模擬 API），避免使用者放棄付款後無法重試。

## 實作項目

### 1. 設定與工具 — 新增 `src/services/ecpay.js`
- 讀 `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`（`staging` → `payment-stage.ecpay.com.tw`，否則 `payment.ecpay.com.tw`）、`BASE_URL`（預設 `http://localhost:3001`）。`.env.example` 已有這些變數，不需新增。
- `ecpayUrlEncode`、`generateCheckMacValue`、`verifyCheckMacValue`：照 guides/13 Node.js 版翻譯（`%20→+`、`~→%7e`、`'→%27`、轉小寫、.NET 字元還原、SHA256 大寫；`crypto.timingSafeEqual` 先比長度）。註解標註來源。
- `generateMerchantTradeNo()`：`FL` + UTC+8 `yyMMddHHmmss` + 6 碼隨機英數 = 20 字元，只用英數字。
- `formatTradeDate(date)`：UTC+8 的 `yyyy/MM/dd HH:mm:ss`（不依賴伺服器時區）。
- `buildItemName(items)`：`<名稱> x<數量>` 以 `#` 串接，先移除名稱中的 `#`、HTML tag、控制字元，截斷到 200 字元（避免 400 字截斷導致 CMV 不符）。
- `buildCheckoutParams(order, items, merchantTradeNo)`：MerchantID、MerchantTradeNo、MerchantTradeDate、`PaymentType=aio`、TotalAmount、`TradeDesc=花漾生活訂單`、ItemName、`ReturnURL=${BASE_URL}/api/ecpay/notify`、`OrderResultURL=${BASE_URL}/ecpay/result/${order.id}`、`ClientBackURL=${BASE_URL}/orders/${order.id}?payment=return`、`ChoosePayment=Credit`、`EncryptType=1`、`CustomField1=order.id`，最後加 CheckMacValue。
- `queryTradeInfo(merchantTradeNo)`：Node 內建 `fetch` POST form-urlencoded 到 `/Cashier/QueryTradeInfo/V5`，每次重新產生 `TimeStamp = Math.floor(Date.now()/1000)`；以 `URLSearchParams` 解析回應；驗證 CheckMacValue，失敗則拋錯；HTTP 403 拋出限速錯誤；`AbortController` 逾時 10 秒。

### 2. 資料庫 — `src/database.js`
新增表（`CREATE TABLE IF NOT EXISTS`，既有資料庫不用重建）：

```sql
CREATE TABLE IF NOT EXISTS ecpay_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  merchant_trade_no TEXT UNIQUE NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed')),
  trade_no TEXT, payment_type TEXT, payment_date TEXT,
  trade_status TEXT, rtn_msg TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

每次點「前往綠界付款」建一筆（MerchantTradeNo 永久唯一，重試必須換號）；verify 時查同一訂單所有 pending 嘗試，避免使用者在舊分頁付款後查不到。

### 3. API — 新增 `src/routes/ecpayRoutes.js`，掛在 `app.js`
| 方法 | 路徑 | 認證 | 行為 |
|---|---|---|---|
| POST | `/api/orders/:id/ecpay/checkout` | authMiddleware | 只允許本人 + `pending` 訂單（否則 404 / 400 `INVALID_STATUS`）；建立 payment；回 `{ action, params }` |
| POST | `/api/orders/:id/ecpay/verify` | authMiddleware | 已 paid 直接回傳（冪等）；否則依序查詢 pending 嘗試並依上表更新；回 `{ order(含 items), result: { status: 'paid'\|'pending'\|'failed', tradeStatus, message } }` |
| POST | `/api/ecpay/notify` | 無（CMV 驗證） | ReturnURL 必填所以要有實作：驗證 CMV → 以 MerchantTradeNo **再主動查詢一次**後更新（不直接信任 body）→ 一律回純文字 `1|OK`、HTTP 200。本地收不到，但之後用 ngrok 可直接生效 |

- 路由放 `app.js` 的 API 區塊，`/api/orders/:id/ecpay` 要放在 `/api/orders` **之前**（或寫在 `orderRoutes.js` 內）。為了就近共用 `authMiddleware` 與擁有者檢查，checkout/verify 加在 `orderRoutes.js`；notify 獨立放 `ecpayRoutes.js` 掛在 `/api/ecpay`。
- verify 與 notify 會呼叫外部 API，是 **async handler**：Express 4 不會捕捉 rejected promise，要 `try/catch` 後回統一格式（綠界錯誤回 `502 ECPAY_QUERY_FAILED`，403 限速回 `429 ECPAY_RATE_LIMITED`）。
- 付款確認的寫入（payment + order）包在 `db.transaction`，用 `UPDATE orders SET status='paid' WHERE id=? AND status='pending'` 確保冪等。
- 每個新端點補 `@openapi` JSDoc（tag `ECPay`）。

### 4. 頁面路由 — `src/routes/pageRoutes.js`
- `POST /ecpay/result/:orderId`：不信任 body，直接 `res.redirect(302, '/orders/' + encodeURIComponent(orderId) + '?payment=return')`。只做導回，付款狀態一律由 verify 決定。

### 5. 前端
- `public/js/pages/order-detail.js`
  - 新增 `goEcpay()`：呼叫 checkout API，用回傳的 `action` / `params` 動態建立隱藏 `<form>` 並 `submit()`。
  - 新增 `verifyPayment()`：呼叫 verify，更新 `order` 與提示訊息；`onMounted` 載入訂單後，若 `paymentResult === 'return'` 且訂單 pending 就自動呼叫一次，再用 `history.replaceState` 移除查詢參數，避免重新整理時重複查詢。
  - `paymentMessages` 新增 `pending`（「尚未收到付款確認，請稍後按『重新查詢付款結果』」）。
- `views/pages/order-detail.ejs`：pending 訂單的兩個模擬按鈕改成「前往綠界付款」（主要）與「重新查詢付款結果」（次要），處理中時 disabled，並提示測試卡號。
- 既有 `PATCH /api/orders/:id/pay` 模擬 API **保留**（只移除 UI 按鈕），開發與測試仍可使用。

### 6. 測試 — 新增 `tests/ecpay.test.js`（加入 `vitest.config.js` 的 `sequence.files`）
- CheckMacValue：用 `test-vectors/checkmacvalue.json` 的 SHA256 向量驗證 `generateCheckMacValue`，並測 verify 竄改後回 false。
- `generateMerchantTradeNo` 長度 20 且只含英數字；`formatTradeDate` 為 UTC+8 格式；`buildItemName` 會截斷與消毒。
- checkout API：非本人 404、非 pending 400、成功時 params 的 CheckMacValue 能通過 verify，`ChoosePayment=Credit`，金額相符。
- verify API：`vi.stubGlobal('fetch', ...)` 模擬綠界回傳（用同一組 key 產生合法 CMV），涵蓋 TradeStatus `1` → paid、`0` → pending、金額不符不更新、CMV 錯誤 → 502；測試不打外網。
- notify：合法 CMV 回 `1|OK` 純文字。

### 7. 文件（依 CLAUDE.md 規則）
- 實作開始時把本計畫存成 `docs/plans/2026-11-11-ecpay-aio-integration.md`；完成後移到 `docs/plans/archive/`。
- 更新 `docs/FEATURES.md`（新增綠界付款章節，狀態改為 ✅、模擬付款 UI 移除）、`docs/ARCHITECTURE.md` §4 路由表、§7 新表、§9 金流流程、`docs/DEVELOPMENT.md` §2 環境變數（ECPAY_* / BASE_URL 改為「使用中」）、`docs/TESTING.md`（新測試檔）、`docs/CHANGELOG.md`。

## 關鍵檔案

- 新增：`src/services/ecpay.js`、`src/routes/ecpayRoutes.js`、`tests/ecpay.test.js`
- 修改：`src/database.js`、`src/routes/orderRoutes.js`、`src/routes/pageRoutes.js`、`app.js`、`public/js/pages/order-detail.js`、`views/pages/order-detail.ejs`、`vitest.config.js`、docs/*
- 沿用：`authMiddleware`、`db.transaction`、`apiFetch`、`Notification.show`、`Auth.requireAuth`、統一回應格式

## 風險與處理

- **OrderResultURL 帶 `:3001` 埠**：官方只說 ReturnURL 不可指定 port；OrderResultURL 是瀏覽器端導向，理論上可用。實作後先用 curl 把建單參數 POST 到 stage AioCheckOut 確認不會報錯；若綠界拒絕，改成只用 ClientBackURL（使用者需按「返回商店」），流程其餘不變。
- **銀行延遲**：TradeStatus 可能暫時是 0，頁面保留「重新查詢」按鈕；查詢只在導回時自動呼叫一次加手動觸發，避免 403 限速。
- **測試金鑰**：沿用 `.env.example` 的官方公開測試帳號；正式環境需換成自己的金鑰，並放在環境變數中。

## 驗證

1. `npm test`：既有 32 個測試加新測試全部通過（新測試不連外網）。
2. 對照測試向量：`generateCheckMacValue` 產出 `291CBA32...57FB2`。
3. 實機（需使用者在瀏覽器操作）：`npm start` → 登入 → 加入購物車 → 結帳 → 訂單頁按「前往綠界付款」→ 綠界 stage 頁輸入 `4311-9522-2222-2222`、任意未來效期、CVV `222`、3DS `1234` → 導回訂單頁自動查詢 → 狀態顯示「已付款」。
4. 我在沙箱內可驗證的部分：啟動伺服器，用 curl 建立訂單並取得 checkout 參數，再 POST 到 stage AioCheckOut 確認回傳綠界付款頁而非錯誤（確認 CMV 與 URL 參數被接受）；對未付款的 MerchantTradeNo 呼叫 verify，確認拿到 TradeStatus 並維持 pending。需要網路存取 `payment-stage.ecpay.com.tw`。

# Tasks

- [x] `src/services/ecpay.js`：CheckMacValue（通過官方 5 個 AIO SHA256 測試向量）、MerchantTradeNo、UTC+8 日期、ItemName、建單參數、QueryTradeInfo
- [x] `src/services/ecpayPayment.js`：付款嘗試建立與狀態同步（verify / notify 共用）
- [x] `ecpay_payments` 資料表
- [x] `POST /api/orders/:id/ecpay/checkout`、`POST /api/orders/:id/ecpay/verify`（`orderRoutes.js`）
- [x] `POST /api/ecpay/notify`（`ecpayRoutes.js`）、`POST /ecpay/result/:orderId`（`pageRoutes.js`）
- [x] 訂單詳情頁改為「前往綠界付款」／「重新查詢付款結果」
- [x] `tests/ecpay.test.js`（18 個測試），全套 50 個測試通過
- [x] 對綠界 stage 實測：建單參數被接受並顯示「選擇支付方式」頁；真實 QueryTradeInfo 回應通過 CheckMacValue 驗證，未付款訂單回 `TradeStatus=0` 並維持 pending
- [x] 文件：FEATURES、ARCHITECTURE、DEVELOPMENT、TESTING、CHANGELOG、CLAUDE.md
- [ ] 使用者在瀏覽器以測試卡完成一筆實際付款（3D 驗證需人工操作）

## 實作備註

- 風險「OrderResultURL 帶 `:3001` 埠」已排除：stage 建單接受 `http://localhost:3001/...` 的 OrderResultURL 與 ClientBackURL。
- 開發機若需經 HTTP 代理連外，Node 內建 `fetch` 需設 `NODE_USE_ENV_PROXY=1` 才會走代理。
