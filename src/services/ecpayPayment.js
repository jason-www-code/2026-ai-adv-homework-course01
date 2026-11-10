/**
 * 綠界付款嘗試的建立與狀態同步（verify API 與 ReturnURL notify 共用）。
 * 付款結果唯一採信來源：queryTradeInfo()（已驗證 CheckMacValue 的查詢回應）。
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const ecpay = require('./ecpay');

// QueryTradeInfo TradeStatus（字串）
const TRADE_STATUS = {
  UNPAID: '0',
  PAID: '1',
  NOT_ESTABLISHED: '10200095'
};

function createPaymentAttempt(order) {
  const items = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(order.id);
  const merchantTradeNo = ecpay.generateMerchantTradeNo();

  db.prepare(
    `INSERT INTO ecpay_payments (id, order_id, merchant_trade_no, total_amount)
     VALUES (?, ?, ?, ?)`
  ).run(uuidv4(), order.id, merchantTradeNo, order.total_amount);

  return ecpay.buildCheckoutParams(order, items, merchantTradeNo);
}

const markPaid = db.transaction((payment, result) => {
  db.prepare(
    `UPDATE ecpay_payments
     SET status = 'paid', trade_no = ?, payment_type = ?, payment_date = ?, trade_status = ?,
         rtn_msg = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(result.TradeNo || null, result.PaymentType || null, result.PaymentDate || null,
    result.TradeStatus, payment.id);
  // 只從 pending 轉為 paid，重複呼叫不會有副作用
  db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'").run(payment.order_id);
});

function recordStatus(payment, status, tradeStatus, message) {
  db.prepare(
    `UPDATE ecpay_payments SET status = ?, trade_status = ?, rtn_msg = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, tradeStatus || null, message || null, payment.id);
}

/**
 * 查詢一筆付款嘗試並同步狀態。
 * 回傳 { status: 'paid' | 'pending' | 'failed' | 'mismatch', tradeStatus }
 */
async function syncPayment(payment) {
  const result = await ecpay.queryTradeInfo(payment.merchant_trade_no);
  const tradeStatus = result.TradeStatus;

  if (tradeStatus === TRADE_STATUS.PAID) {
    if (Number(result.TradeAmt) !== payment.total_amount) {
      console.error(
        `[ECPay] 金額不符 MerchantTradeNo=${payment.merchant_trade_no} 預期=${payment.total_amount} 實際=${result.TradeAmt}`
      );
      recordStatus(payment, 'pending', tradeStatus, '綠界回傳金額與訂單不符');
      return { status: 'mismatch', tradeStatus };
    }
    markPaid(payment, result);
    return { status: 'paid', tradeStatus };
  }

  if (tradeStatus === TRADE_STATUS.NOT_ESTABLISHED) {
    recordStatus(payment, 'failed', tradeStatus, '交易未成立');
    return { status: 'failed', tradeStatus };
  }

  // 0 = 未付款（銀行可能尚未回覆）；其他如 10200047 = 綠界查無此單（使用者未進入付款頁）
  recordStatus(payment, 'pending', tradeStatus, null);
  return { status: 'pending', tradeStatus };
}

/**
 * 同步一筆訂單所有尚未完成的付款嘗試（由新到舊）。
 * 回傳 { status: 'paid' | 'pending' | 'failed' | 'mismatch' | 'none', tradeStatus }
 */
async function syncOrderPayments(orderId) {
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
  if (order && order.status === 'paid') return { status: 'paid', tradeStatus: TRADE_STATUS.PAID };

  const payments = db.prepare(
    "SELECT * FROM ecpay_payments WHERE order_id = ? AND status = 'pending' ORDER BY created_at DESC, rowid DESC LIMIT 5"
  ).all(orderId); // 限制查詢筆數，避免短時間大量呼叫被綠界限速（HTTP 403）
  if (payments.length === 0) return { status: 'none', tradeStatus: null };

  let summary = null;
  for (const payment of payments) {
    const outcome = await syncPayment(payment);
    if (outcome.status === 'paid') return outcome;
    // 以最新一筆的結果作為回報；金額不符優先回報
    if (!summary || outcome.status === 'mismatch') summary = outcome;
  }
  return summary;
}

module.exports = { createPaymentAttempt, syncPayment, syncOrderPayments, TRADE_STATUS };
