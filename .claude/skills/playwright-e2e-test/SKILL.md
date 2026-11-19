---
name: playwright-e2e-test
description: 用 Playwright MCP 開瀏覽器跑花漾生活的端對端購物流程：首頁加入購物車 → 購物車 → 註冊新會員 → 結帳 → 綠界 stage 信用卡付款與 3D 驗證 → 確認訂單「已付款」，結束時在 screenshots/ 只留一張截圖。當使用者要求跑 E2E、用瀏覽器測結帳／下單／綠界付款流程、或驗證改動後整條購物流程仍正常時使用。會寫入正式 database.sqlite 並連線綠界測試環境。
argument-hint: "[商品名稱（選填）]"
model: sonnet
effort: high
allowed-tools: Bash(./scripts/dev-server.sh) Bash(./scripts/health-check.sh) Bash(./scripts/stop-server.sh) Bash(./scripts/clean-screenshots.sh) Bash(date *) mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_fill_form mcp__playwright__browser_wait_for mcp__playwright__browser_take_screenshot mcp__playwright__browser_tabs mcp__playwright__browser_close
---

# Playwright E2E：購物 → 結帳 → 綠界付款

以 Playwright MCP（`mcp__playwright__*`）操作真實瀏覽器，跑完一次完整購物流程，最後在 `screenshots/` 留下**一張** .png。

指定商品（選填）：$ARGUMENTS

## 0. 必守規則

1. **`./scripts/*.sh` 必須單獨當成整條指令執行。** 不可加 `cd … &&`、環境變數前綴（`TIMEOUT=2 ./scripts/…`）、`;`、`&&`、`( … )` 或 `&`。這些腳本列在 `.claude/settings.json` 的 `sandbox.excludedCommands`，只有整條指令完全相符才會在沙箱外執行；否則會在沙箱內跑，結果是 nvm 找不到、`curl` 連不到伺服器、`lsof` 看不到行程，而且**看起來像成功了**（例如 stop-server 回報「沒有行程在監聽」，伺服器其實還在跑）。
2. **截圖路徑一律寫 `screenshots/<name>.png`。** `browser_take_screenshot` 的 `filename` 是相對專案根目錄，不是 `.mcp.json` 的 `--output-dir`；只寫檔名會落在專案根目錄。
3. 過程中用 `browser_snapshot` 判斷畫面；snapshot 太長時用 `target`（例如 `main`）或 `depth` 縮小範圍。盡量不拍除錯截圖，真的需要時也存到 `screenshots/`。
4. 不刪資料庫、不改程式碼、不用 `browser_run_code_unsafe`。遇到無法排除的阻礙就停下來，回報卡在哪一步與畫面上的訊息。

## 1. 前置檢查

1. **瀏覽器**：瀏覽器由專案 `.mcp.json` 的 Playwright MCP 參數決定，`--isolated` 代表不保留資料的設定檔（等同無痕）。執行 `ls -d /opt/microsoft/msedge`：
   - 存在、但 `.mcp.json` 沒有 `--browser msedge` → 告訴使用者可以在 args 加上 `"--browser", "msedge"` 並重啟 Claude Code 改用 Edge，本次先用目前設定繼續。
   - 不存在 → 直接用預設的 Chrome。
2. **伺服器**：執行 `./scripts/health-check.sh`。
   - 回 `server up` → 沿用，記下「伺服器不是本 skill 啟動的」，收尾時不要停。
   - 逾時 → 以 Bash `run_in_background: true` 執行 `./scripts/dev-server.sh`，再執行一次 `./scripts/health-check.sh` 確認就緒，並記下「由本 skill 啟動」。
3. **時間戳**：執行 `date +%Y%m%d%H%M%S`，記為 `<ts>`。測試 Email 用 `e2e-<ts>@example.com`，截圖檔名用 `playwright-e2e-<ts>.png`。

## 2. 首頁加入購物車

1. `browser_navigate` 到 `http://localhost:3001/`，`browser_snapshot`。
2. 在「所有花禮」區塊挑商品：有指定商品就用它，否則選**第一個按鈕是「加入購物車」**的商品（按鈕顯示「已售完」且 disabled 的跳過；測試會逐漸耗盡前幾項商品的庫存）。記下商品名稱與價格。
3. 點該商品的「加入購物車」。若 ref 不好找，可用選擇器 `article:has-text("<商品名稱>") button`。
4. 全部商品都售完 → 停止，請使用者先停伺服器，再執行 `rm database.sqlite*` 重建資料庫（不要自己刪）。

## 3. 購物車

1. `browser_navigate` 到 `http://localhost:3001/cart`，確認商品、數量與總計。
2. 按「前往結帳」。未登入時會被導到 `/login?redirect=/checkout`。

## 4. 註冊新會員

1. 在登入頁點「註冊」分頁，再 snapshot 取得欄位（切換分頁後 ref 會變）。
2. `browser_fill_form` 填寫：姓名 `E2E 測試員`、Email `e2e-<ts>@example.com`、密碼 `password123`，按「註冊」。
3. 若停在登入頁沒有跳轉，通常是 Email 已註冊（409）：重新產生時間戳換一個 Email 再送出。
4. **已知限制：訪客購物車登入後不會合併。** 註冊成功後會導向 `/checkout`，但會員購物車是空的，所以又被導回 `/cart`（空車）。這是預期行為，處理方式：
   - 回首頁，以會員身分**重新加入同一個商品**；
   - 進 `/cart` → 按「前往結帳」，這次會停在 `/checkout`。

## 5. 結帳

1. 在 `/checkout` snapshot `main`，確認訂購單內容與總計。
2. 填收件資訊：收件人姓名 `E2E 測試員`、Email 同註冊用的、地址 `台北市信義區測試路 1 號`。
3. 按「確認送出訂單」→ 導向 `/orders/<id>`。記下網址中的訂單 id、頁面上的訂單編號（`ORD-…`）與金額。

## 6. 綠界付款

1. 在訂單頁按「前往綠界付款」，頁面會整頁跳到 `payment-stage.ecpay.com.tw`。
2. **讀取 [references/ecpay-stage.md](references/ecpay-stage.md)**，依其中步驟完成信用卡付款與 3D 驗證。
3. 只用信用卡：專案固定 `ChoosePayment=Credit`，付款結果靠後端主動查詢確認，其他付款方式本地無法確認。

## 7. 確認付款結果

1. 3D 驗證送出後會導回 `http://localhost:3001/orders/<id>`，前端會自動呼叫一次 verify。
2. `browser_wait_for` 文字 `已付款`，`time: 30`。
3. 若仍顯示待付款：`browser_wait_for` `time: 10` 後，按一次「重新查詢付款結果」再等一次。**最多重查一次**，綠界查詢太頻繁會回 403，要等 30 分鐘才能再查。
4. 仍未付款就照實回報狀態與畫面上的提示訊息，不要繼續重試。

## 8. 收尾（順序固定）

1. 停在訂單詳情頁，拍**最後一張**截圖：`browser_take_screenshot`，`fullPage: true`、`scale: "css"`、`filename: "screenshots/playwright-e2e-<ts>.png"`。付款失敗時也要拍，用來呈現失敗畫面。
2. `browser_close`。
3. 執行 `./scripts/clean-screenshots.sh`：只保留最新的 .png，刪除 snapshot `.yml`、console `.log` 與舊截圖。確認輸出中保留的是剛拍的檔名。
4. 檢查專案根目錄沒有誤存的 .png（`ls *.png`）；有的話是本次除錯截圖，刪除它。
5. 只有在伺服器是本 skill 啟動的情況下，才執行 `./scripts/stop-server.sh`，並確認輸出是「已停止 port 3001 上的行程」。

## 9. 回報

用繁體中文簡要回報：

- 結果：成功／失敗（卡在哪一步）
- 測試帳號 Email、商品、訂單編號、金額、最終訂單狀態
- 截圖：`screenshots/playwright-e2e-<ts>.png`
- 過程中遇到、和本文件描述不同的狀況（例如綠界頁面改版、欄位名稱變了）
- 副作用：正式 `database.sqlite` 多了一個測試使用者與一筆已付款訂單，商品庫存 −1；伺服器目前是否仍在執行
