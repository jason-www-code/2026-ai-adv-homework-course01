# 全站重新設計切版（夜色花房）

> 狀態：✅ 已完成（2026-11-19）。`npm test` 50 個測試通過；以 Playwright 在 1920／1440／1024／768／576／390 檢查前後台頁面。

## User Story

身為花漾生活的顧客與管理員，我想要看到依新設計稿實作的頁面（夜色花房），以便在手機到大螢幕上都有一致、好讀、好操作的購物與後台體驗。

## Spec

依據：已歸檔設計稿規格 `docs/plans/archive/2026-11-19-pencil-redesign.md`（Pencil 檔 `design/flower-life/flower-life.pen`）。

- **API**：不新增、不修改端點與回應格式。
- **資料庫**：schema 不變。seed 商品圖片改為本機 `/images/products/*.jpg`（設計稿的暗調商品照）；啟動時把「仍是舊 seed Unsplash 網址」的商品更新為新圖，管理員自行改過的圖片不動。
- **樣式**：`public/css/input.css` 改用新 token（梅夜、深梅、梅線、象牙、霧藕、金盞、紙面系列、三種狀態色），斷點改為 576／768／1024／1440／1920，字體改為 Cactus Classical Serif＋Noto Sans TC，並抽出按鈕、輸入框等共用 class。
- **版型**：前台 `main` 不再限制寬度，由各頁自行控制外距（20／24／40／96／160）；header 在 768 以下改為選單按鈕與全螢幕選單；後台在 768 以下改為頂部列＋分頁，768–1439 為圖示軌，1440 以上為完整側欄，移除後台 footer。
- **頁面**：10 個頁面全部依設計稿改寫，保留現有 Vue 資料流與 API 呼叫；新增 `views/partials/icon.ejs`（lucide 線條圖示）。
- **前端 JS**：只調整 class 對應（狀態膠囊、付款橫幅、toast、header 登入狀態），以及少量顯示用欄位（例如購物車是否已登入、首頁精選固定取第一頁前 4 項）；後台訂單的狀態篩選由下拉選單改為分段按鈕（同一個 `statusFilter`）。
- **不在範圍**：功能變更、已知問題修正（登入失敗訊息、訪客購物車合併等）。

## Tasks

- [x] 匯出設計稿照片到 `public/images/`
- [x] Tailwind token、共用 class、字體
- [x] 前台 layout、header（含行動版選單）、footer、toast
- [x] 首頁、商品詳情、購物車、結帳、登入、我的訂單、訂單詳情、404
- [x] 後台 layout、商品管理、訂單管理
- [x] seed 圖片與既有資料升級
- [x] 測試（`npm test`）與各斷點實際畫面檢查
- [x] 文件更新（FEATURES、ARCHITECTURE、DEVELOPMENT、CHANGELOG），完成後歸檔

## 實作備註

- 768 後台表格：價格與「庫存」表頭會換行，改為 `px-4 whitespace-nowrap`（1440 以上恢復 `px-6`）。
- 768–1023 前台 header：管理員登入時導覽與帳號名稱擠在一起，名稱與「購物車」文字改到 1024 以上才顯示（購物車圖示與徽章保留）。
- 頁尾「登入／註冊」加上 `data-auth="guest"`，登入後隱藏。
- 登入頁行動版橫幅圖片焦點下移（`bg-position-[center_70%]`），讓玫瑰完整出現。
