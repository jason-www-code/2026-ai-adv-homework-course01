const path = require('path');
const { app, request, registerUser } = require('./setup');
const db = require('../src/database');
const ecpay = require('../src/services/ecpay');

const vectors = require(path.join(__dirname, '..', '.claude', 'skills', 'ecpay', 'test-vectors', 'checkmacvalue.json'))
  .vectors.filter((v) => v.method === 'SHA256' && v.params);

/** 建立使用者 + 1 件商品的 pending 訂單 */
async function createPendingOrder() {
  const { token } = await registerUser();
  const prodRes = await request(app).get('/api/products');
  const product = prodRes.body.data.products.find((p) => p.stock > 0);

  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 1 });

  const orderRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      recipientName: '綠界測試',
      recipientEmail: 'ecpay@example.com',
      recipientAddress: '台北市測試路 1 號',
    });
  return { token, order: orderRes.body.data };
}

/** 模擬綠界 QueryTradeInfo/V5 回應（URL-encoded，附合法 CheckMacValue） */
function mockQueryResponse(fields, { tamper = false, status = 200 } = {}) {
  const config = ecpay.getConfig();
  const params = {
    MerchantID: config.merchantId,
    StoreID: '',
    TradeNo: '2611111234567890',
    PaymentDate: '2026/11/11 10:00:00',
    PaymentType: 'Credit_CreditCard',
    HandlingCharge: '0',
    PaymentTypeChargeFee: '0',
    TradeDate: '2026/11/11 09:59:00',
    ItemName: 'test',
    CustomField1: '', CustomField2: '', CustomField3: '', CustomField4: '',
    ...fields,
  };
  params.CheckMacValue = ecpay.generateCheckMacValue(params, config.hashKey, config.hashIv);
  if (tamper) params.TradeAmt = String(Number(params.TradeAmt) + 1);
  const body = new URLSearchParams(params).toString();
  return vi.fn(async () => new Response(body, { status }));
}

describe('ECPay CheckMacValue', () => {
  it('should match official SHA256 test vectors', () => {
    expect(vectors.length).toBeGreaterThan(0);
    for (const v of vectors) {
      expect(ecpay.generateCheckMacValue(v.params, v.hashKey, v.hashIV)).toBe(v.expected);
    }
  });

  it('should verify signed params and reject tampered ones', () => {
    const v = vectors[0];
    const signed = { ...v.params, CheckMacValue: v.expected };
    expect(ecpay.verifyCheckMacValue(signed, v.hashKey, v.hashIV)).toBe(true);
    expect(ecpay.verifyCheckMacValue({ ...signed, TotalAmount: '101' }, v.hashKey, v.hashIV)).toBe(false);
    expect(ecpay.verifyCheckMacValue({ ...v.params }, v.hashKey, v.hashIV)).toBe(false);
  });
});

describe('ECPay helpers', () => {
  it('should generate a 20-char alphanumeric MerchantTradeNo', () => {
    const no = ecpay.generateMerchantTradeNo();
    expect(no).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(ecpay.generateMerchantTradeNo()).not.toBe(no);
  });

  it('should format MerchantTradeDate in UTC+8', () => {
    expect(ecpay.formatTradeDate(new Date('2026-01-01T16:30:05Z'))).toBe('2026/01/02 00:30:05');
  });

  it('should sanitize and truncate ItemName', () => {
    const name = ecpay.buildItemName([
      { product_name: '<b>玫瑰</b>#花束', quantity: 2 },
      { product_name: '百合', quantity: 1 },
    ]);
    expect(name).toBe('玫瑰花束 x2#百合 x1');

    const long = ecpay.buildItemName([{ product_name: '花'.repeat(500), quantity: 1 }]);
    expect(long.length).toBeLessThanOrEqual(200);
  });
});

describe('ECPay checkout API', () => {
  let token;
  let order;

  beforeAll(async () => {
    ({ token, order } = await createPendingOrder());
  });

  it('should return signed AioCheckOut params', async () => {
    const res = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data.action).toMatch(/\/Cashier\/AioCheckOut\/V5$/);

    const { params } = res.body.data;
    const config = ecpay.getConfig();
    expect(params.ChoosePayment).toBe('Credit');
    expect(params.PaymentType).toBe('aio');
    expect(params.EncryptType).toBe('1');
    expect(params.TotalAmount).toBe(String(order.total_amount));
    expect(params.MerchantTradeNo).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(params.ReturnURL).not.toBe(params.OrderResultURL);
    expect(ecpay.verifyCheckMacValue(params, config.hashKey, config.hashIv)).toBe(true);

    const payment = db.prepare('SELECT * FROM ecpay_payments WHERE merchant_trade_no = ?').get(params.MerchantTradeNo);
    expect(payment).toBeTruthy();
    expect(payment.order_id).toBe(order.id);
    expect(payment.status).toBe('pending');
  });

  it('should create a new MerchantTradeNo for every attempt', async () => {
    const a = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    const b = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    expect(a.body.data.params.MerchantTradeNo).not.toBe(b.body.data.params.MerchantTradeNo);
  });

  it("should return 404 for another user's order", async () => {
    const other = await registerUser();
    const res = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
  });

  it('should require auth', async () => {
    const res = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`);
    expect(res.status).toBe(401);
  });
});

describe('ECPay verify API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should keep order pending when TradeStatus is 0', async () => {
    const { token, order } = await createPendingOrder();
    await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    const fetchMock = mockQueryResponse({ MerchantTradeNo: 'x', TradeAmt: String(order.total_amount), TradeStatus: '0' });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.result.status).toBe('pending');
    expect(res.body.data.order.status).toBe('pending');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/Cashier\/QueryTradeInfo\/V5$/);
    const sent = Object.fromEntries(new URLSearchParams(init.body));
    expect(sent.TimeStamp).toMatch(/^\d{10}$/);
  });

  it('should mark order paid when TradeStatus is 1 and amount matches', async () => {
    const { token, order } = await createPendingOrder();
    const checkout = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    const merchantTradeNo = checkout.body.data.params.MerchantTradeNo;
    vi.stubGlobal('fetch', mockQueryResponse({ MerchantTradeNo: merchantTradeNo, TradeAmt: String(order.total_amount), TradeStatus: '1' }));

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data.result.status).toBe('paid');
    expect(res.body.data.order.status).toBe('paid');
    expect(Array.isArray(res.body.data.order.items)).toBe(true);

    const payment = db.prepare('SELECT * FROM ecpay_payments WHERE merchant_trade_no = ?').get(merchantTradeNo);
    expect(payment.status).toBe('paid');
    expect(payment.trade_no).toBe('2611111234567890');
    expect(payment.payment_type).toBe('Credit_CreditCard');

    // 已付款後再查詢：不再呼叫綠界
    const fetchAgain = vi.fn();
    vi.stubGlobal('fetch', fetchAgain);
    const again = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);
    expect(again.body.data.result.status).toBe('paid');
    expect(fetchAgain).not.toHaveBeenCalled();

    // 已付款訂單不可再建立綠界付款
    const checkoutAgain = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    expect(checkoutAgain.status).toBe(400);
    expect(checkoutAgain.body).toHaveProperty('error', 'INVALID_STATUS');
  });

  it('should not mark paid when amount mismatches', async () => {
    const { token, order } = await createPendingOrder();
    await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    vi.stubGlobal('fetch', mockQueryResponse({ MerchantTradeNo: 'x', TradeAmt: String(order.total_amount + 1), TradeStatus: '1' }));

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.result.status).toBe('mismatch');
    expect(res.body.data.order.status).toBe('pending');
  });

  it('should return 502 when response CheckMacValue is invalid', async () => {
    const { token, order } = await createPendingOrder();
    await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    vi.stubGlobal('fetch', mockQueryResponse({ MerchantTradeNo: 'x', TradeAmt: String(order.total_amount), TradeStatus: '1' }, { tamper: true }));

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'ECPAY_QUERY_FAILED');
    const check = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${token}`);
    expect(check.body.data.status).toBe('pending');
  });

  it('should return 429 when ECPay rate limits', async () => {
    const { token, order } = await createPendingOrder();
    await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error', 'ECPAY_RATE_LIMITED');
  });

  it('should report none when no payment was created', async () => {
    const { token, order } = await createPendingOrder();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/verify`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.result.status).toBe('none');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ECPay notify (ReturnURL)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should respond 1|OK and confirm payment via query', async () => {
    const { token, order } = await createPendingOrder();
    const checkout = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`).set('Authorization', `Bearer ${token}`);
    const merchantTradeNo = checkout.body.data.params.MerchantTradeNo;
    vi.stubGlobal('fetch', mockQueryResponse({ MerchantTradeNo: merchantTradeNo, TradeAmt: String(order.total_amount), TradeStatus: '1' }));

    const config = ecpay.getConfig();
    const notify = { MerchantID: config.merchantId, MerchantTradeNo: merchantTradeNo, RtnCode: '1', RtnMsg: 'Succeeded', TradeAmt: String(order.total_amount) };
    notify.CheckMacValue = ecpay.generateCheckMacValue(notify, config.hashKey, config.hashIv);

    const res = await request(app).post('/api/ecpay/notify').type('form').send(notify);
    expect(res.status).toBe(200);
    expect(res.text).toBe('1|OK');
    expect(res.headers['content-type']).toMatch(/text\/plain/);

    const check = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${token}`);
    expect(check.body.data.status).toBe('paid');
  });

  it('should respond 1|OK but ignore invalid CheckMacValue', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await request(app).post('/api/ecpay/notify').type('form').send({ MerchantTradeNo: 'FAKE', RtnCode: '1', CheckMacValue: 'BAD' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1|OK');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ECPay OrderResultURL page route', () => {
  it('should redirect back to order detail page', async () => {
    const res = await request(app).post('/ecpay/result/abc-123').type('form').send({ RtnCode: '1' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/orders/abc-123?payment=return');
  });
});
