/**
 * 綠界 ECPay 全方位金流（AIO，CheckMacValue SHA256）工具
 *
 * 規格來源（web_fetch 2026-11-11）：
 *   - 產生訂單       https://developers.ecpay.com.tw/2862.md
 *   - 查詢訂單       https://developers.ecpay.com.tw/2890.md
 *   - 介接注意事項   https://developers.ecpay.com.tw/2858.md
 *   - CheckMacValue  .claude/skills/ecpay/guides/13-checkmacvalue.md（Node.js 版，line 202-262）
 *
 * 本專案只在本機執行，收不到綠界 Server Notify（ReturnURL），
 * 因此付款結果一律以 queryTradeInfo() 主動查詢並驗證 CheckMacValue 後才採信。
 */
const crypto = require('crypto');

const TEST_DEFAULTS = {
  // 綠界官方公開測試帳號（AIO），正式環境必須以環境變數覆寫
  merchantId: '3002607',
  hashKey: 'pwFHCqoQZGmho4w6',
  hashIv: 'EkRm7iFT261dpevs'
};

function getConfig() {
  const env = process.env.ECPAY_ENV || 'staging';
  const isProduction = env === 'production';
  const host = isProduction ? 'https://payment.ecpay.com.tw' : 'https://payment-stage.ecpay.com.tw';
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID || TEST_DEFAULTS.merchantId,
    hashKey: process.env.ECPAY_HASH_KEY || TEST_DEFAULTS.hashKey,
    hashIv: process.env.ECPAY_HASH_IV || TEST_DEFAULTS.hashIv,
    isProduction,
    checkoutUrl: host + '/Cashier/AioCheckOut/V5',
    queryUrl: host + '/Cashier/QueryTradeInfo/V5',
    baseUrl: (process.env.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '')
  };
}

// ---------------------------------------------------------------------------
// CheckMacValue（翻譯自 guides/13 Node.js 版）
// ---------------------------------------------------------------------------

/**
 * ECPay 專用 URL encode（CMV 專用，不可與 AES 的 aesUrlEncode 混用）：
 * encodeURIComponent → %20→+、~→%7e、'→%27 → 轉小寫 → .NET 字元還原
 */
function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27')
    .toLowerCase();
  const replacements = {
    '%2d': '-', '%5f': '_', '%2e': '.', '%21': '!',
    '%2a': '*', '%28': '(', '%29': ')'
  };
  for (const [from, to] of Object.entries(replacements)) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = keys.map((k) => `${k}=${params[k]}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  return crypto.createHash('sha256').update(ecpayUrlEncode(raw), 'utf8').digest('hex').toUpperCase();
}

/** timing-safe 比對，禁止用 == / === */
function verifyCheckMacValue(params, hashKey, hashIv) {
  const received = Buffer.from(String(params.CheckMacValue || '').toUpperCase());
  const calculated = Buffer.from(generateCheckMacValue(params, hashKey, hashIv));
  if (received.length !== calculated.length) return false;
  return crypto.timingSafeEqual(received, calculated);
}

// ---------------------------------------------------------------------------
// 參數工具
// ---------------------------------------------------------------------------

/** 取得台灣時間（UTC+8）的各欄位，不依賴伺服器時區 */
function taipeiParts(date) {
  const t = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    yyyy: String(t.getUTCFullYear()),
    MM: pad(t.getUTCMonth() + 1),
    dd: pad(t.getUTCDate()),
    HH: pad(t.getUTCHours()),
    mm: pad(t.getUTCMinutes()),
    ss: pad(t.getUTCSeconds())
  };
}

/** MerchantTradeDate：UTC+8，格式 yyyy/MM/dd HH:mm:ss */
function formatTradeDate(date = new Date()) {
  const p = taipeiParts(date);
  return `${p.yyyy}/${p.MM}/${p.dd} ${p.HH}:${p.mm}:${p.ss}`;
}

/**
 * MerchantTradeNo：永久唯一、僅英數字、最長 20 字元。
 * 格式：FL + yyMMddHHmmss（UTC+8）+ 6 碼隨機英數 = 20 字元
 */
function generateMerchantTradeNo(date = new Date()) {
  const p = taipeiParts(date);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) random += chars[bytes[i] % chars.length];
  return `FL${p.yyyy.slice(2)}${p.MM}${p.dd}${p.HH}${p.mm}${p.ss}${random}`;
}

/** 移除 HTML tag、控制字元與 ECPay 用於分隔商品的 # */
function sanitizeText(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/#/g, '')
    .trim();
}

/**
 * ItemName：多項以 # 分隔。上限 400 字元（超過被截斷會造成亂碼與 CheckMacValue 不符），
 * 官方建議 200 字元內，這裡以 200 為上限。
 */
function buildItemName(items, maxLength = 200) {
  const name = items
    .map((item) => `${sanitizeText(item.product_name)} x${item.quantity}`)
    .join('#');
  if (name.length <= maxLength) return name;
  return Array.from(name).slice(0, maxLength - 1).join('') + '…';
}

/** 組出 AioCheckOut/V5 表單參數（含 CheckMacValue） */
function buildCheckoutParams(order, items, merchantTradeNo, now = new Date()) {
  const config = getConfig();
  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatTradeDate(now),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: '花漾生活訂單',
    ItemName: buildItemName(items),
    // ReturnURL 為必填；本機收不到，但使用 ngrok 等公開網址時可直接生效
    ReturnURL: `${config.baseUrl}/api/ecpay/notify`,
    // 瀏覽器端導回（與 ReturnURL 不可相同）
    OrderResultURL: `${config.baseUrl}/ecpay/result/${order.id}`,
    ClientBackURL: `${config.baseUrl}/orders/${order.id}?payment=return`,
    // 固定信用卡：ATM / CVS / BARCODE 為離線付款，只能靠 Server Notify 確認，本地端無法使用
    ChoosePayment: 'Credit',
    EncryptType: '1',
    CustomField1: order.id
  };
  params.CheckMacValue = generateCheckMacValue(params, config.hashKey, config.hashIv);
  return { action: config.checkoutUrl, params };
}

// ---------------------------------------------------------------------------
// 查詢訂單 QueryTradeInfo/V5
// ---------------------------------------------------------------------------

class EcpayError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * 主動查詢交易狀態。
 * - TimeStamp 有效期僅 3 分鐘，每次呼叫重新產生（Unix 秒數）
 * - 回應為 URL-encoded 字串，必須驗證 CheckMacValue
 * - 呼叫太頻繁會收到 HTTP 403，需等 30 分鐘
 */
async function queryTradeInfo(merchantTradeNo) {
  const config = getConfig();
  const params = {
    MerchantID: config.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000))
  };
  params.CheckMacValue = generateCheckMacValue(params, config.hashKey, config.hashIv);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(config.queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal
    });
  } catch (err) {
    throw new EcpayError('ECPAY_QUERY_FAILED', '無法連線至綠界查詢 API：' + err.message);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 403) {
    throw new EcpayError('ECPAY_RATE_LIMITED', '綠界查詢 API 呼叫過於頻繁，請稍後再試');
  }
  if (!res.ok) {
    throw new EcpayError('ECPAY_QUERY_FAILED', `綠界查詢 API 回應 HTTP ${res.status}`);
  }

  const text = (await res.text()).trim();
  const result = Object.fromEntries(new URLSearchParams(text));
  if (!result.CheckMacValue || !verifyCheckMacValue(result, config.hashKey, config.hashIv)) {
    throw new EcpayError('ECPAY_QUERY_FAILED', '綠界查詢回應 CheckMacValue 驗證失敗');
  }
  return result;
}

module.exports = {
  getConfig,
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  formatTradeDate,
  generateMerchantTradeNo,
  buildItemName,
  buildCheckoutParams,
  queryTradeInfo,
  EcpayError
};
