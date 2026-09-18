const PREFIX = 'merchant_opening_guide_v2:';

function read(storeId) {
  if (!storeId) return '';
  try { return wx.getStorageSync(PREFIX + storeId) || ''; } catch (err) { return ''; }
}

function isLocalTest() {
  try {
    const info = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    return info.platform === 'devtools';
  } catch (err) { return false; }
}

function request(storeId, options = {}) {
  const repeatForLocalTest = options.repeatForLocalTest === true && isLocalTest();
  if (!storeId || (!repeatForLocalTest && read(storeId) === 'done')) return false;
  wx.setStorageSync(PREFIX + storeId, 'pending');
  return true;
}

function pending(storeId) { return read(storeId) === 'pending'; }

function finish(storeId) {
  if (storeId) wx.setStorageSync(PREFIX + storeId, 'done');
}

module.exports = { request, pending, finish, isLocalTest };
