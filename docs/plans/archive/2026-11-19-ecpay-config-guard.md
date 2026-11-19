# 綠界設定防呆：正式環境不再默默退回測試帳號

> 狀態：✅ 已完成（2026-11-19）。`tests/ecpay.test.js` 27 個測試通過；啟動檢查已實測（production 使用測試帳號、`ECPAY_ENV=prod`、production 缺 HashKey、staging 只設部分金鑰都會 exit 1；staging 正常啟動並印出環境）。

## User Story

身為部署花漾生活的維運人員，我想要在綠界金鑰缺少、仍是官方測試帳號或 `ECPAY_ENV` 拼錯時讓伺服器直接無法啟動，以便在上線前就發現設定錯誤，而不是在正式環境默默使用測試帳號、把測試交易當成已付款訂單。

## 背景

`src/services/ecpay.js` 的 `getConfig()` 原本寫成 `process.env.X || TEST_DEFAULTS.x`，有三種情況會靜默出錯：

1. `ECPAY_ENV=production` 但漏設金鑰：測試帳號的簽章被送到正式網域，交易全部被拒（`ecpay` skill `guides/16-go-live-checklist.md` 紅燈第 2 項）。
2. `ECPAY_ENV` 拼錯（`prod`、`Production`）：默默改走 stage 加上測試帳號。消費者用測試卡付款，verify 查 stage 得到 `TradeStatus=1`，訂單被標成已付款，但實際上沒有收到錢。
3. 只設定一部分金鑰：正式 MerchantID 搭配測試 HashKey，CheckMacValue 必定不符，而且錯誤很難追。

另外，`/api/ecpay/notify` 在 `try` 外呼叫 `getConfig()`。如果它拋錯，async handler 的 rejection 不會被 Express 4 接住，請求會卡住不回應。

## Spec

### 設定規則（`getConfig()`）

| 情境 | 結果 |
|---|---|
| `ECPAY_ENV` 不是 `staging`／`production`（未設定時視為 `staging`） | 拋錯 |
| `production`，三個金鑰缺任一個（空字串、只有空白都算缺） | 拋錯，訊息列出缺少的變數名稱 |
| `production`，任一個值等於官方測試帳號 | 拋錯「不可使用綠界官方測試帳號」 |
| `staging`，三個都沒設 | 使用官方測試帳號，並回傳 `usingTestDefaults: true` |
| `staging`，只設一部分 | 拋錯 |

- 錯誤統一為 `EcpayError('ECPAY_NOT_CONFIGURED', <原因>)`。原因只列變數名稱，不含金鑰值，而且只寫進 server log。
- 回傳物件新增 `env`、`usingTestDefaults` 兩個欄位，其他欄位不變。

### 啟動檢查（`server.js`）

在 `JWT_SECRET` 檢查之後呼叫 `getConfig()`。拋錯時印出 `Fatal: <原因>` 並 `process.exit(1)`；成功時印出 `[ECPay] 環境：<env>，特店 <MerchantID>`，使用測試帳號時另外註明。

### API

| 端點 | 設定錯誤時 |
|---|---|
| `POST /api/orders/:id/ecpay/checkout` | `503 { data: null, error: 'ECPAY_NOT_CONFIGURED', message: '付款服務設定未完成，暫時無法付款' }`，不建立 `ecpay_payments` |
| `POST /api/orders/:id/ecpay/verify` | 同上 503，不呼叫綠界 |
| `POST /api/ecpay/notify` | 照常回 `1\|OK`、HTTP 200，原因寫進 log |

- 資料庫：無變更。
- 前端：無變更（`order-detail.js` 本來就會顯示後端回傳的 `message`）。
- 對既有模組的影響：`createPaymentAttempt()` 改成先組參數再寫入付款嘗試。staging 已設定三個金鑰的環境（`.env.example` 的預設）行為不變。

## Tasks

- [x] `src/services/ecpay.js`：`getConfig()` 驗證規則、`EcpayError` 移到檔案上方
- [x] `server.js`：啟動時檢查並印出目前的綠界環境
- [x] `src/services/ecpayPayment.js`：先組參數再 INSERT
- [x] `src/routes/orderRoutes.js`：checkout／verify 回 503，並更新 `@openapi`
- [x] `src/routes/ecpayRoutes.js`：`getConfig()` 移進 `try`
- [x] `.env.example`：註解說明允許值與 production 規則
- [x] `tests/ecpay.test.js`：新增 `ECPay config`（9 個測試，`vi.stubEnv` 控制環境變數），全套 50 → 59 個
- [x] 文件：DEVELOPMENT §2、FEATURES §8.1、ARCHITECTURE §3／§5／§9、TESTING §3／§7、CHANGELOG、README、CLAUDE.md
- [x] `npm run openapi`：checkout、verify 有 503
