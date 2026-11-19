const Notification = {
  _timeout: null,

  // lucide 圖示路徑（與 views/partials/icon.ejs 相同）
  _icons: {
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
  },

  show(message, type = 'info') {
    const el = document.getElementById('notification-toast');
    if (!el) return;

    const styles = {
      success: { icon: 'circle-check', cls: 'text-paid' },
      error: { icon: 'circle-x', cls: 'text-failed' },
      warning: { icon: 'triangle-alert', cls: 'text-pending' },
      info: { icon: 'info', cls: 'text-mauve' }
    };
    const s = styles[type] || styles.info;

    el.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" ' +
      'stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 shrink-0 ' + s.cls + '" aria-hidden="true">' +
      this._icons[s.icon] + '</svg><span></span>';
    // 訊息可能來自 API，用 textContent 避免插入 HTML
    el.querySelector('span').textContent = message;

    el.hidden = false;
    // 先讓 hidden 移除生效，再觸發淡入
    requestAnimationFrame(() => { el.style.opacity = '1'; });

    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.hidden = true; }, 300);
    }, 3000);
  }
};
