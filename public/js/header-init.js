// 購物車徽章：顯示購物車「項目筆數」（不是總件數）。頁面腳本加入商品後呼叫 CartBadge.increment()。
var CartBadge = {
  set: function (count) {
    document.querySelectorAll('[data-cart-badge]').forEach(function (el) {
      el.textContent = count;
      el.hidden = !(count > 0);
    });
  },
  increment: function () {
    var el = document.querySelector('[data-cart-badge]');
    var count = parseInt((el && el.textContent) || '0', 10) || 0;
    this.set(count + 1);
  }
};

document.addEventListener('DOMContentLoaded', function () {
  var loggedIn = Auth.isLoggedIn();
  var isAdmin = Auth.isAdmin();
  var user = Auth.getUser();

  // data-auth="guest" | "user" | "admin"：依登入狀態顯示
  document.querySelectorAll('[data-auth]').forEach(function (el) {
    var role = el.dataset.auth;
    var visible = role === 'guest' ? !loggedIn : role === 'user' ? loggedIn : role === 'admin' ? isAdmin : true;
    el.hidden = !visible;
  });

  document.querySelectorAll('[data-user-name]').forEach(function (el) {
    el.textContent = (user && user.name) || '';
  });

  document.querySelectorAll('[data-logout]').forEach(function (el) {
    el.addEventListener('click', function () { Auth.logout(); });
  });

  // 行動版選單
  var menu = document.getElementById('mobile-menu');
  var openBtn = document.getElementById('menu-open');
  var closeBtn = document.getElementById('menu-close');

  function setMenu(open) {
    if (!menu || !openBtn) return;
    menu.hidden = !open;
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open && closeBtn) closeBtn.focus();
    if (!open) openBtn.focus();
  }

  if (menu && openBtn && closeBtn) {
    openBtn.addEventListener('click', function () { setMenu(true); });
    closeBtn.addEventListener('click', function () { setMenu(false); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) setMenu(false);
    });
  }

  if (document.querySelector('[data-cart-badge]')) {
    apiFetch('/api/cart').then(function (res) {
      if (res && res.data && res.data.items) CartBadge.set(res.data.items.length);
    }).catch(function () {});
  }
});
