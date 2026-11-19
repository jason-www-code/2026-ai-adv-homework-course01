const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;
    // ?payment=return 表示剛從綠界導回，需主動查詢付款結果；其餘值（success/failed/cancel）直接顯示提示
    const initialPayment = el.dataset.paymentResult || '';
    const paymentResult = ref(initialPayment === 'return' ? null : (initialPayment || null));

    const order = ref(null);
    const loading = ref(true);
    const redirecting = ref(false);
    const verifying = ref(false);

    // 深色底狀態膠囊
    const statusMap = {
      pending: { label: '待付款', cls: 'border-pending text-pending', dot: 'bg-pending' },
      paid: { label: '已付款', cls: 'border-paid text-paid', dot: 'bg-paid' },
      failed: { label: '付款失敗', cls: 'border-failed text-failed', dot: 'bg-failed' },
    };

    // 象牙紙面（收據）上的狀態膠囊
    const paperStatusMap = {
      pending: { cls: 'bg-pending-tint text-pending-ink', dot: 'bg-pending-ink' },
      paid: { cls: 'bg-paid-tint text-paid-ink', dot: 'bg-paid-ink' },
      failed: { cls: 'bg-failed-tint text-failed-ink', dot: 'bg-failed-ink' },
    };

    const paymentMessages = {
      success: { text: '付款成功！感謝您的購買。', cls: 'border-paid bg-paid/10', icon: 'circle-check', iconCls: 'text-paid' },
      failed: { text: '付款未完成，請重新付款。', cls: 'border-failed bg-failed/10', icon: 'circle-x', iconCls: 'text-failed' },
      cancel: { text: '付款已取消。', cls: 'border-pending bg-pending/10', icon: 'circle-minus', iconCls: 'text-pending' },
      pending: { text: '尚未收到付款確認，若已完成付款請稍後按「重新查詢付款結果」。', cls: 'border-pending bg-pending/10', icon: 'clock', iconCls: 'text-pending' },
      mismatch: { text: '付款金額與訂單不符，請聯繫客服。', cls: 'border-failed bg-failed/10', icon: 'triangle-alert', iconCls: 'text-failed' },
    };

    function formatDate(value) {
      return new Date(value).toLocaleDateString('zh-TW');
    }

    // 查詢結果 → 提示訊息
    const resultToMessage = {
      paid: 'success',
      pending: 'pending',
      failed: 'failed',
      mismatch: 'mismatch',
      none: null
    };

    function submitToEcpay(action, params) {
      // 綠界付款頁禁止 iframe，必須以表單整頁 POST 跳轉
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      Object.keys(params).forEach(function (key) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    }

    async function goEcpay() {
      if (!order.value || redirecting.value) return;
      redirecting.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/checkout', { method: 'POST' });
        submitToEcpay(res.data.action, res.data.params);
      } catch (e) {
        Notification.show(e?.data?.message || '無法建立綠界付款', 'error');
        redirecting.value = false;
      }
    }

    async function verifyPayment(silent) {
      if (!order.value || verifying.value) return;
      verifying.value = true;
      try {
        const res = await apiFetch('/api/orders/' + order.value.id + '/ecpay/verify', { method: 'POST' });
        order.value = res.data.order;
        const key = resultToMessage[res.data.result.status];
        if (key) paymentResult.value = key;
        if (!silent || res.data.result.status === 'none') {
          Notification.show(res.message, res.data.result.status === 'paid' ? 'success' : 'info');
        }
      } catch (e) {
        Notification.show(e?.data?.message || '查詢付款結果失敗', 'error');
      } finally {
        verifying.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }

      if (initialPayment === 'return') {
        // 移除 ?payment=return，避免重新整理時重複查詢綠界
        history.replaceState(null, '', window.location.pathname);
        if (order.value && order.value.status === 'pending') {
          await verifyPayment(true);
        } else if (order.value && order.value.status === 'paid') {
          paymentResult.value = 'success';
        }
      }
    });

    return {
      order, loading, redirecting, verifying, paymentResult, statusMap, paperStatusMap, paymentMessages, formatDate,
      goEcpay, verifyPayment: function () { verifyPayment(false); }
    };
  }
}).mount('#app');
