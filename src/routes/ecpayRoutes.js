const express = require('express');
const db = require('../database');
const ecpay = require('../services/ecpay');
const { syncPayment } = require('../services/ecpayPayment');

const router = express.Router();

/**
 * @openapi
 * /api/ecpay/notify:
 *   post:
 *     summary: 綠界付款結果通知（ReturnURL，Server-to-Server）
 *     description: >
 *       AIO 建單的必填 ReturnURL。本專案在本機執行時綠界無法打進來，主要流程改用
 *       /api/orders/{id}/ecpay/verify 主動查詢；若之後以 ngrok 等公開網址設定 BASE_URL，此端點即可生效。
 *       收到通知後先驗證 CheckMacValue，再以 MerchantTradeNo 主動查詢一次才更新訂單（不直接信任通知內容）。
 *       一律回應純文字 1|OK、HTTP 200，避免綠界重送。
 *     tags: [ECPay]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               MerchantTradeNo:
 *                 type: string
 *               RtnCode:
 *                 type: string
 *               CheckMacValue:
 *                 type: string
 *     responses:
 *       200:
 *         description: 固定回應 1|OK
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: 1|OK
 */
router.post('/notify', async (req, res) => {
  const body = req.body || {};
  const config = ecpay.getConfig();

  try {
    if (!ecpay.verifyCheckMacValue(body, config.hashKey, config.hashIv)) {
      console.error('[ECPay] notify CheckMacValue 驗證失敗');
    } else {
      const payment = db.prepare('SELECT * FROM ecpay_payments WHERE merchant_trade_no = ?').get(body.MerchantTradeNo);
      if (!payment) {
        console.error('[ECPay] notify 找不到付款紀錄 MerchantTradeNo=', body.MerchantTradeNo);
      } else if (payment.status !== 'paid') {
        await syncPayment(payment);
      }
    }
  } catch (err) {
    console.error('[ECPay] notify 處理失敗:', err.message);
  }

  // AIO 規格：必須回應純文字 1|OK 且 HTTP 200
  res.status(200).type('text/plain').send('1|OK');
});

module.exports = router;
