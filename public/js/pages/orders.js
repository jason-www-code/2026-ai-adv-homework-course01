const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const orders = ref([]);
    const loading = ref(true);

    // 深色底狀態膠囊：外框與文字同色
    const statusMap = {
      pending: { label: '待付款', cls: 'border-pending text-pending', dot: 'bg-pending' },
      paid: { label: '已付款', cls: 'border-paid text-paid', dot: 'bg-paid' },
      failed: { label: '付款失敗', cls: 'border-failed text-failed', dot: 'bg-failed' },
    };

    function formatDate(value) {
      return new Date(value).toLocaleDateString('zh-TW');
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders');
        orders.value = res.data.orders;
      } catch (e) {
        orders.value = [];
      } finally {
        loading.value = false;
      }
    });

    return { orders, loading, statusMap, formatDate };
  }
}).mount('#app');
