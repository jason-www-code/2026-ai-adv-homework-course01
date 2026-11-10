# 更新日誌

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。新增項目寫在最上方的 `[Unreleased]`，發布或完成一個階段時改為日期標題。

分類：`新增`、`變更`、`修正`、`移除`、`文件`。

## [Unreleased]

### 新增

- 綠界 ECPay AIO 信用卡金流（2026-11-11）：`POST /api/orders/:id/ecpay/checkout` 產生付款參數、`POST /api/orders/:id/ecpay/verify` 主動呼叫 `QueryTradeInfo/V5` 驗證 CheckMacValue 與金額後更新訂單、`POST /api/ecpay/notify`（ReturnURL）、`POST /ecpay/result/:orderId` 導回。因本地端收不到 Server Notify，付款結果一律以主動查詢為準。
- `ecpay_payments` 資料表，記錄每次付款嘗試（新表，既有資料庫不需重建）。
- `src/services/ecpay.js`、`src/services/ecpayPayment.js`。
- `tests/ecpay.test.js`（18 個測試，模擬綠界回應，不連外網）。

### 變更

- 訂單詳情頁的「付款成功／付款失敗」模擬按鈕改為「前往綠界付款」與「重新查詢付款結果」；`PATCH /api/orders/:id/pay` API 保留。

### 文件

- 新增計畫 `docs/plans/archive/2026-11-11-ecpay-aio-integration.md`；更新 FEATURES、ARCHITECTURE、DEVELOPMENT、TESTING。
- 新增 `docs/` 文件結構：`README.md`、`ARCHITECTURE.md`、`DEVELOPMENT.md`、`FEATURES.md`、`TESTING.md`、`CHANGELOG.md`，以及 `plans/`、`plans/archive/` 計畫目錄（2026-11-10）。
- `CLAUDE.md` 改為專案概述 + 常用指令 + 關鍵規則 + 文件引用（2026-11-10）。
- 記錄已知問題：登入失敗訊息被 `apiFetch` 的 401 跳轉吞掉、刪除仍在購物車中的商品回傳 500、訪客購物車登入後不合併、`vitest.config.js` 的 `sequence.files` 不會控制測試檔順序。

## [1.0.0] - 2026-04-07

初始版本（commit `004e507 init`）。

### 新增

- 會員註冊、登入（JWT，7 天有效）、個人資料 API。
- 商品列表（分頁）與商品詳情。
- 購物車：訪客（`X-Session-Id`）與會員（JWT）雙模式；同商品加入時數量累加；庫存檢查。
- 結帳：以 transaction 建立訂單、寫入商品快照、扣庫存、清空購物車。
- 我的訂單列表/詳情，模擬付款（`pending → paid | failed`）。
- 管理員後台：商品新增/編輯/刪除（有 pending 訂單時禁止刪除）、訂單列表（狀態篩選）與詳情。
- EJS 前台/後台 layout、Vue 3 頁面腳本、Tailwind CSS v4 主題。
- SQLite 自動建表與 seed（管理員帳號、8 筆花卉商品）。
- swagger-jsdoc OpenAPI 文件產生。
- Vitest + supertest 整合測試 32 個。
