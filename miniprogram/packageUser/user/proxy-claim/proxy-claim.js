Page({
  onLoad(options) {
    const token = String((options && (options.token || options.proxy_token)) || '').trim();
    const storeId = String((options && options.store_id) || '').trim();
    const parts = [];
    if (storeId) parts.push(`store_id=${encodeURIComponent(storeId)}`);
    if (token) parts.push(`token=${encodeURIComponent(token)}`);
    wx.reLaunch({
      url: `/pages/index/index${parts.length ? `?${parts.join('&')}` : ''}`
    });
  }
});
