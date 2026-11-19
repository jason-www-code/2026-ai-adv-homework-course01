const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const products = ref([]);
    const featured = ref([]);
    const pagination = ref({ total: 0, page: 1, limit: 9, totalPages: 0 });
    const loading = ref(true);
    const fallbackImage = '/images/products/seasonal.jpg';

    const reviews = [
      { name: '小美', text: '花束非常漂亮，包裝精緻，送給媽媽她超開心的！配送也很準時。' },
      { name: '阿明', text: '第二次購買了，品質一如既往的好。花材新鮮，整體搭配很有美感。' },
      { name: '大衛', text: '女朋友收到花束超感動！會再回購的，推薦給大家！' }
    ];

    async function loadProducts(page) {
      page = page || 1;
      loading.value = true;
      try {
        const res = await apiFetch('/api/products?page=' + page + '&limit=9');
        products.value = res.data.products.map(function (p) {
          p._adding = false;
          return p;
        });
        pagination.value = res.data.pagination;
        // 本季精選固定取第一頁的前 4 項，切換分頁時不跟著變
        if (page === 1 && featured.value.length === 0) {
          featured.value = products.value.slice(0, 4);
        }
      } catch (e) {
        products.value = [];
      } finally {
        loading.value = false;
      }
    }

    async function addToCart(product) {
      if (product._adding) return;
      product._adding = true;
      try {
        await apiFetch('/api/cart', {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, quantity: 1 })
        });
        Notification.show('已加入購物車', 'success');
        CartBadge.increment();
      } catch (e) {
        Notification.show('加入購物車失敗', 'error');
      } finally {
        product._adding = false;
      }
    }

    onMounted(function () {
      loadProducts(1);
    });

    return {
      products, featured, pagination, loading, fallbackImage, reviews,
      loadProducts, addToCart
    };
  }
}).mount('#app');
