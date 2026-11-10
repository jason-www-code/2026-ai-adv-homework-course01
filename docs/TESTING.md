# 測試規範與指南

## 1. 技術與設定

- **Vitest 2**（`vitest run`）+ **supertest**：直接對 `app.js` 匯出的 Express app 發送 HTTP 請求，不需啟動伺服器。
- 所有測試都是 **API 整合測試**，打到真實的 SQLite 資料庫，沒有 mock，也沒有前端/E2E 測試。
- `vitest.config.js`：

| 設定 | 值 | 影響 |
|---|---|---|
| `globals` | `true` | `describe`、`it`、`expect`、`beforeAll` 不需 import |
| `fileParallelism` | `false` | 測試檔**一次只跑一個**，避免同時寫入 SQLite |
| `sequence.files` | 6 個檔案的陣列 | **Vitest 不支援用此選項指定順序**，實際執行順序由 Vitest 自行決定（實測為 orders → cart → adminProducts → auth → adminOrders → products） |
| `hookTimeout` | `10000` | `beforeAll` 最長 10 秒 |

> 因為檔案順序不受控制，**每個測試檔都必須能單獨執行**，不能依賴其他檔案建立的資料。目前所有測試檔都符合這點。

## 2. 執行方式

```bash
npm test                                         # 全部
npx vitest run tests/cart.test.js                # 單一檔案
npx vitest run tests/cart.test.js -t "guest mode"  # 名稱符合的測試（子字串比對）
npx vitest                                       # watch 模式
```

前置條件：

- `.env` 必須存在且有 `JWT_SECRET`（由 `app.js` 的 `dotenv` 載入；缺少時註冊/登入會回 500，幾乎所有測試失敗）。
- 不需要先啟動伺服器，也不需要建置 CSS。
- 若 `database.sqlite` 不存在，第一次 `require('../app')` 時會自動建立並寫入 seed 資料。

## 3. 測試檔案

| 檔案 | 測試數 | 涵蓋端點 | 主要情境 |
|---|---|---|---|
| `tests/auth.test.js` | 6 | `/api/auth/register`、`/login`、`/profile` | 註冊成功（role = user）、重複 Email 409、admin 登入、密碼錯誤 401、帶 token 取得 profile、無 token 401 |
| `tests/products.test.js` | 4 | `/api/products`、`/api/products/:id` | 列表與分頁欄位、`page=1&limit=2`、詳情、不存在 404 |
| `tests/cart.test.js` | 6 | `/api/cart` 全部 | 訪客模式新增 → 查詢 → 修改數量為 3 → 刪除後為空；會員模式新增；不存在商品 404 |
| `tests/orders.test.js` | 6 | `/api/orders`、`/api/orders/:id` | 從購物車建立訂單（status pending）、空車 400、未登入 401、列表、詳情、不存在 404 |
| `tests/adminProducts.test.js` | 6 | `/api/admin/products` 全部 | 列表、新增、部分更新、刪除後公開 API 404、一般使用者 403、無 token 401 |
| `tests/adminOrders.test.js` | 4 | `/api/admin/orders`、`/:id` | 列表、`status=pending` 篩選、詳情含 `user`、一般使用者 403 |
| `tests/ecpay.test.js` | 18 | `ecpay/checkout`、`ecpay/verify`、`/api/ecpay/notify`、`POST /ecpay/result/:orderId`、`src/services/ecpay.js` | 官方 CheckMacValue 測試向量、竄改偵測、MerchantTradeNo 格式、UTC+8 日期、ItemName 消毒截斷、checkout 參數簽章與權限、verify 的 paid / pending / 金額不符 / CMV 錯誤 502 / 限速 429 / none、notify 回 `1\|OK`、導回 302 |

合計 50 個測試。**未涵蓋**：`PATCH /api/orders/:id/pay`、庫存不足（`STOCK_INSUFFICIENT`）、購物車累加、刪除有 pending 訂單的商品（409）、欄位驗證錯誤（`VALIDATION_ERROR`）、無效 token、`dualAuth` 無任何身分的 401。

## 4. 檔案內的依賴關係

單一檔案內的 `it` 會**依序執行並共用變數**，後面的測試依賴前面的結果：

| 檔案 | 依賴鏈 |
|---|---|
| `auth.test.js` | 註冊（存 `registeredEmail`、`userToken`）→ 重複註冊用同一 Email → profile 用 `userToken` |
| `products.test.js` | 列表取得 `productId` → 詳情使用 |
| `cart.test.js` | `beforeAll` 取 `productId` → 訪客新增（存 `cartItemId`）→ 查詢 → 修改 → 刪除，全部使用同一個 `sessionId` |
| `orders.test.js` | `beforeAll` 註冊使用者並加入 1 件商品 → 建立訂單（存 `orderId`）→ 「空車」測試依賴上一步已清空購物車 → 詳情用 `orderId` |
| `adminProducts.test.js` | 新增（存 `createdProductId`）→ 更新 → 刪除 |
| `adminOrders.test.js` | `beforeAll` 自行註冊使用者、加入購物車、下單，取得 `orderId` |
| `ecpay.test.js` | 各 `describe` 用 `createPendingOrder()` 自建使用者與訂單；verify / notify 每個測試各自建立訂單，互不依賴 |

因此用 `-t` 單獨執行依賴鏈中段的測試（例如只跑 "should get order detail"）會失敗。

## 5. 輔助函式（`tests/setup.js`）

```js
const { app, request, getAdminToken, registerUser } = require('./setup');
```

| 匯出 | 說明 |
|---|---|
| `app` | `require('../app')`，同時觸發資料庫初始化 |
| `request` | supertest |
| `getAdminToken()` | 以寫死的 `admin@hexschool.com` / `12345678` 登入，回傳 JWT 字串 |
| `registerUser(overrides?)` | 註冊新使用者，回傳 `{ token, user }`。預設 Email 為 `test-<timestamp>-<random>@example.com`（保證唯一）、密碼 `password123`、名稱「測試使用者」；可用 `{ email, password, name }` 覆寫 |

## 6. 撰寫新測試

### 步驟

1. 建立 `tests/<feature>.test.js`（camelCase）。
2. 從 `./setup` 取得 `app`、`request` 與需要的輔助函式。
3. 在 `beforeAll` 中**自行建立**所需資料（使用者、購物車、訂單），不依賴其他測試檔。
4. 每個成功回應都驗證統一格式：`data` 存在、`error` 為 `null`、`message` 存在。
5. 每個錯誤回應驗證狀態碼、`data` 為 `null`、`error` 不為 `null`（必要時比對具體錯誤代碼）。
6. 把新檔案加入 `vitest.config.js` 的 `sequence.files`（維持既有慣例；實際上不影響順序）。

### 範例：模擬付款（目前缺少的測試）

```js
const { app, request, registerUser } = require('./setup');

describe('Order Payment API', () => {
  let token;
  let orderId;

  beforeAll(async () => {
    ({ token } = await registerUser());

    const prodRes = await request(app).get('/api/products');
    const productId = prodRes.body.data.products[0].id;

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '付款測試',
        recipientEmail: 'pay@example.com',
        recipientAddress: '台北市測試路 1 號',
      });
    orderId = orderRes.body.data.id;
  });

  it('should reject invalid action', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'maybe' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should mark order as paid', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'success' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('status', 'paid');
  });

  it('should not pay a non-pending order', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'success' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'INVALID_STATUS');
  });
});
```

### 認證標頭寫法

| 模式 | 寫法 |
|---|---|
| 會員 | `.set('Authorization', \`Bearer ${token}\`)` |
| 管理員 | `const adminToken = await getAdminToken();` 後同上 |
| 訪客購物車 | `.set('X-Session-Id', 'test-session-' + Date.now())` |

## 7. 常見陷阱

1. **測試寫入正式資料庫**：測試與開發伺服器共用 `<repo>/database.sqlite`，跑測試會留下測試使用者、訂單與商品異動。需要乾淨資料時，停止伺服器後刪除 `database.sqlite`、`database.sqlite-wal`、`database.sqlite-shm`。
2. **庫存會被測試逐漸耗盡**：`orders.test.js` 與 `adminOrders.test.js` 每次各對 `products[0]` 下單 1 件，扣除的庫存不會回補，每跑一次全套測試該商品庫存就 −2。seed 商品庫存為 15–100，多次執行後可能出現 `STOCK_INSUFFICIENT`，導致 `orderId` 為 undefined、後續測試連鎖失敗。遇到時刪除資料庫重建。
3. **`products[0]` 不固定**：列表依 `created_at DESC` 排序，seed 商品的時間相同，且 `adminProducts.test.js` 會新增後刪除商品；不要假設 `products[0]` 是特定商品或特定價格。
4. **`sequence.files` 不會控制順序**：不要撰寫依賴其他檔案先執行的測試。
5. **缺少 `.env`**：測試不會走 `server.js` 的 `JWT_SECRET` 檢查，而是在 `jwt.sign` 時拋錯並回 500，症狀是大量 `Cannot read properties of null (reading 'token')`。
6. **bcrypt 速度**：`NODE_ENV=test` 只讓 seed 管理員使用 1 round；`/api/auth/register` 固定 10 rounds，大量呼叫 `registerUser()` 會拖慢測試。
7. **apiFetch 401 行為無法在此測試**：前端行為（例如 401 自動跳轉）沒有自動化測試，修改 `public/js/` 需手動在瀏覽器驗證。
8. **刪除商品前確認購物車**：在測試中刪除曾被加入購物車的商品會因外鍵約束得到 500。
9. **不可連綠界外網**：會呼叫綠界的測試必須用 `vi.stubGlobal('fetch', vi.fn(...))` 模擬 `QueryTradeInfo/V5` 回應（用 `ecpay.generateCheckMacValue` 產生合法簽章），並在 `afterEach` 呼叫 `vi.unstubAllGlobals()`。真實綠界 stage 的驗證屬於手動測試。
10. **CheckMacValue 測試向量**：`.claude/skills/ecpay/test-vectors/checkmacvalue.json` 中只有含 `params` 的 SHA256 向量適用 AIO；ECTicket 向量（`formula: ecticket`）公式不同，需排除。
