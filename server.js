const app = require('./app');
const ecpay = require('./src/services/ecpay');

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    console.error('Fatal: JWT_SECRET is not set');
    process.exit(1);
  }

  // 綠界設定錯誤（正式環境缺金鑰、使用測試帳號、ECPAY_ENV 拼錯）時直接結束，不默默退回測試帳號
  let ecpayConfig;
  try {
    ecpayConfig = ecpay.getConfig();
  } catch (err) {
    console.error('Fatal: ' + err.message);
    process.exit(1);
  }
  console.log(
    `[ECPay] 環境：${ecpayConfig.env}，特店 ${ecpayConfig.merchantId}` +
      (ecpayConfig.usingTestDefaults ? '（未設定金鑰，使用綠界官方測試帳號）' : '')
  );

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
