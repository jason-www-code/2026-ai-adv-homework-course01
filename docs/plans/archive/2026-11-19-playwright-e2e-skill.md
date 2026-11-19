# Playwright E2E 測試 skill（`playwright-e2e-test`）

> 狀態：✅ 已完成（2026-11-19）。skill 已實際執行驗證，訂單 `ORD-20261119-57E57` 顯示「已付款」。

## User Story

身為開發者，我想要用一個指令讓 Claude 以 Playwright MCP 開瀏覽器跑完「加入購物車 → 註冊 → 結帳 → 綠界信用卡付款」的完整流程，並留下一張截圖，以便在改動後快速確認整條購物流程仍然正常。

## Spec

### Skill 位置與設定

- `.claude/skills/playwright-e2e-test/SKILL.md`：流程主體。
- `.claude/skills/playwright-e2e-test/references/ecpay-stage.md`：綠界 stage 付款頁操作細節與疑難排解，執行到付款步驟才讀取。
- frontmatter：`model: sonnet`、`effort: high`、`allowed-tools`（預先允許腳本與 Playwright 工具）；允許 Claude 自動觸發，也可用 `/playwright-e2e-test [商品名稱]` 手動觸發。
- 不使用 `context: fork`（背景子代理看不到過程、權限提示會卡住）；不使用 `browser_run_code_unsafe`。

### 流程

1. 前置檢查：確認瀏覽器（`.mcp.json` 為 `--isolated`，沒有 Edge 時用 Chrome）；`health-check.sh` 確認伺服器，未執行則以 `dev-server.sh` 啟動並記下「由本 skill 啟動」；以 `date` 產生時間戳。
2. 首頁加入第一個有庫存的商品 → `/cart` → 前往結帳。
3. 註冊 `e2e-<ts>@example.com`；因訪客購物車不合併，被導回空購物車後以會員身分重新加入商品。
4. `/checkout` 填收件資訊並送出訂單。
5. 訂單頁「前往綠界付款」→ 綠界 stage 信用卡（`4311-9522-2222-2222`、3D 驗證碼 `1234`）。
6. 導回訂單頁，確認顯示「已付款」（未更新時最多重查一次，避免綠界查詢 403）。
7. 收尾：拍 `screenshots/playwright-e2e-<ts>.png` → 關閉瀏覽器 → `clean-screenshots.sh` → 確認根目錄無殘留 .png → 若伺服器由 skill 啟動則停止。

### 實測發現的注意事項（已寫入 skill）

- `./scripts/*.sh` 必須單獨當成整條指令執行，串接 `cd`、`&&`、環境變數前綴會不符合 sandbox `excludedCommands`，在沙箱內執行而失效（nvm 找不到、`lsof` 看不到行程）。
- `browser_take_screenshot` 的 `filename` 相對專案根目錄，需寫成 `screenshots/<name>.png`。
- 綠界卡號四段必須用 `browser_type` + `slowly: true` 逐字輸入，`fill` 會觸發「請輸入信用卡卡號」。
- 綠界持卡人姓名只能是英文字母，含數字會報錯。
- 測試環境提示 modal 會擋住第一次「立即付款」，需先關閉。

### 副作用

每次執行會寫入正式 `database.sqlite`（一個測試使用者、一筆已付款訂單、商品庫存 −1），並連線綠界 stage。商品全部售完時 skill 會停止，由使用者停伺服器後 `rm database.sqlite*` 重建。

### 文件影響

- `CLAUDE.md` 常用指令新增 `/playwright-e2e-test`。
- `docs/TESTING.md` 新增 §8「手動 E2E（Playwright MCP）」，並更新 §1 的描述。
- `docs/CHANGELOG.md` `[Unreleased] / Added` 新增一條。

## Tasks

- [x] 建立 `SKILL.md`（流程、必守規則、收尾順序）
- [x] 建立 `references/ecpay-stage.md`
- [x] 更新 `CLAUDE.md`、`docs/TESTING.md`、`docs/CHANGELOG.md`
- [x] 實際執行 skill 驗證（訂單已付款、`screenshots/` 只留一張 .png、伺服器已停止）
- [x] 計畫歸檔至 `docs/plans/archive/`
