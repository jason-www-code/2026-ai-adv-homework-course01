# 更新日誌

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。新增項目寫在最上方的 `[Unreleased]`，發布或完成一個階段時改為日期標題。

分類：`Added`（新增）、`Changed`（變更）、`Fixed`（修正）、`Removed`（移除）。文件異動依性質歸入 `Added` 或 `Changed`。

## [Unreleased]

### Added

- Claude Code skill `playwright-e2e-test`（2026-11-19）：以 Playwright MCP 跑「首頁加入購物車 → 註冊 → 結帳 → 綠界 stage 信用卡付款 → 訂單已付款」的手動 E2E，預設 Sonnet／high effort，結束時 `screenshots/` 只留一張截圖；說明見 `docs/TESTING.md` §8。
- 專案層級 Playwright MCP 設定 `.mcp.json`（2026-11-19）：`npx @playwright/mcp@latest --isolated --output-dir ./screenshots`。
- Claude Code 沙箱輔助腳本 `scripts/`（2026-11-19）：`dev-server.sh`（依 `.nvmrc` 切 Node 後啟動）、`health-check.sh`（等待 HTTP 200）、`stop-server.sh`（依埠號停止）、`clean-screenshots.sh`（`screenshots/` 只留最新一張 .png）；前三支列入 `.claude/settings.json` 的 `sandbox.excludedCommands` 與 `permissions.allow`，`permissions.allow` 另加入 E2E 用到的 Playwright 工具。說明見 `docs/DEVELOPMENT.md` §1.1。
- `.nvmrc`（2026-11-19）：固定 Node `v24.22.2`，避免 `better-sqlite3` 原生模組與 Node 版本不符。
- 文件：已歸檔計畫 `docs/plans/archive/2026-11-19-playwright-e2e-skill.md`；`DEVELOPMENT.md` 新增 §1.1「Claude Code 沙箱與輔助腳本」；`TESTING.md` 新增 §8「手動 E2E（Playwright MCP）」；`CLAUDE.md` 常用指令加入 `scripts/` 與 `/playwright-e2e-test`。
- 全站重新設計切版（2026-11-19）：依「夜色花房」設計稿改寫 10 個頁面與前後台版型，計畫已歸檔為 `docs/plans/archive/2026-11-19-redesign-implementation.md`。新增 Tailwind token 與共用 class（`public/css/input.css`）、`views/partials/icon.ejs`（lucide 線條圖示）、`public/images/`（設計稿暗調照片）、前台 768 以下的全螢幕選單、全域 `CartBadge`（`header-init.js`）。
- 全站重新設計設計稿（2026-11-19）：使用 Pencil 繪製「夜色花房」視覺方向（梅夜底、象牙紙面單據、金盞主要動作，標題用仙人掌明體），涵蓋前台 8 頁與後台 2 頁、各 5 個斷點（1920／1440／768／576／390），另含 21 張狀態稿。設計稿為 `docs/design/flower-life/flower-life.pen`（同層 `images/` 為 Pencil 產生的圖片），規格見已歸檔計畫 `docs/plans/archive/2026-11-19-pencil-redesign.md`。
- 綠界 ECPay AIO 信用卡金流（2026-11-11）：`POST /api/orders/:id/ecpay/checkout` 產生付款參數、`POST /api/orders/:id/ecpay/verify` 主動呼叫 `QueryTradeInfo/V5` 驗證 CheckMacValue 與金額後更新訂單、`POST /api/ecpay/notify`（ReturnURL）、`POST /ecpay/result/:orderId` 導回。因本地端收不到 Server Notify，付款結果一律以主動查詢為準。
- `ecpay_payments` 資料表，記錄每次付款嘗試（新表，既有資料庫不需重建）。
- `src/services/ecpay.js`、`src/services/ecpayPayment.js`。
- 新錯誤代碼：`ECPAY_QUERY_FAILED`（502）、`ECPAY_RATE_LIMITED`（429）。
- `tests/ecpay.test.js`（18 個測試，模擬綠界回應，不連外網）；全套測試由 32 個增為 50 個。
- 文件：`docs/` 文件結構（`README.md`、`ARCHITECTURE.md`、`DEVELOPMENT.md`、`FEATURES.md`、`TESTING.md`、`CHANGELOG.md`，以及 `plans/`、`plans/archive/` 計畫目錄，2026-11-10）。
- 文件：已歸檔計畫 `docs/plans/archive/2026-11-11-ecpay-aio-integration.md`。
- 文件：記錄已知問題——登入失敗訊息被 `apiFetch` 的 401 跳轉吞掉、刪除仍在購物車中的商品回傳 500、訪客購物車登入後不合併、`vitest.config.js` 的 `sequence.files` 不會控制測試檔順序。

### Changed

- Pencil 設計稿由專案根目錄 `design/flower-life/` 移至 `docs/design/flower-life/`（`.pen` 與同層 `images/` 一起搬移，2026-11-19）；README、ARCHITECTURE、DEVELOPMENT 的路徑已同步更新，已歸檔計畫保留當時的舊路徑。
- `.gitignore` 加入 `screenshots/`（E2E 截圖輸出，2026-11-19）。
- 文件：README 技術棧標示 Node 版本（`.nvmrc`）並新增手動 E2E、常用指令加入 `scripts/` 與 `/playwright-e2e-test`；ARCHITECTURE 目錄結構加入 `.nvmrc`、`.mcp.json`、`.claude/`、`scripts/`、`screenshots/`；FEATURES 狀態總覽加入端對端購物流程 E2E。
- 全站視覺改為「夜色花房」：梅夜底、象牙紙面單據（購物車摘要、結帳訂購單、訂單收據、後台內容區）、金盞只用於主要動作；字體改為 Cactus Classical Serif（標題）＋ Noto Sans TC；斷點改為 576／768／1024／1440／1920。原 `rose-primary`、`sage`、`apricot`、`cream` 等 token 移除。
- seed 商品圖片由 Unsplash 外部網址改為本機 `/images/products/*.jpg`；啟動時把「仍是舊 seed 網址」的商品改為新圖（管理員改過的圖片不動），既有資料庫不需重建。
- 後台版型：768 以下為頂部列＋分頁，768–1439 為圖示軌，1440 以上為完整側欄；「返回前台」移到側欄，移除後台 footer。後台訂單的狀態篩選由下拉選單改為分段按鈕。
- 所有 Vue 頁面根元素加上 `v-cloak`，載入前不再閃現模板語法；購物車與後台的刪除確認框顯示商品名稱。
- 訂單詳情頁改以「前往綠界付款」與「重新查詢付款結果」進行付款；導回時（`?payment=return`）自動查詢一次付款結果。
- 環境變數 `BASE_URL`、`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV` 由「預留未使用」改為實際使用。
- 文件：FEATURES、ARCHITECTURE、DEVELOPMENT、TESTING、README 補上綠界金流內容；`CLAUDE.md` 改為專案概述 + 常用指令 + 關鍵規則 + 文件引用，並新增綠界付款確認規則。

### Removed

- 訂單詳情頁的「付款成功／付款失敗」模擬付款按鈕（`PATCH /api/orders/:id/pay` API 保留，供開發與測試使用）。

## [1.0.0] - 2026-04-07

初始版本（commit `004e507 init`）。

### Added

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
