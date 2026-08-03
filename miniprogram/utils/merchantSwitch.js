const { request } = require('./api');

const CACHE_KEY = 'pet_merchant_switch_enabled';
const CACHE_AT_KEY = 'pet_merchant_switch_fetched_at';
const CACHE_TTL = 60 * 1000;

function getMiniProgramMeta() {
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    const mp = (info && info.miniProgram) || {};
    const meta = {
      envVersion: String(mp.envVersion || '').trim(),
      version: String(mp.version || '').trim(),
      appId: String(mp.appId || '').trim()
    };
    // 调试：开发版/体验版通常 version 为空，仅正式版有线上版本号
    console.log('[merchantSwitch] getAccountInfoSync', {
      raw: mp,
      envVersion: meta.envVersion || '(空)',
      version: meta.version || '(空)',
      appId: meta.appId || '(空)'
    });
    return meta;
  } catch (err) {
    console.warn('[merchantSwitch] getAccountInfoSync failed', err);
    return { envVersion: '', version: '', appId: '' };
  }
}

function readCachedEnabled() {
  try {
    const at = Number(wx.getStorageSync(CACHE_AT_KEY) || 0);
    if (!at || Date.now() - at > CACHE_TTL) return null;
    const raw = wx.getStorageSync(CACHE_KEY);
    if (raw === true || raw === false) return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch (err) {
    return null;
  }
}

function writeCachedEnabled(enabled) {
  try {
    wx.setStorageSync(CACHE_KEY, !!enabled);
    wx.setStorageSync(CACHE_AT_KEY, Date.now());
  } catch (err) {
    // ignore
  }
}

/**
 * 拉取是否展示「切换商家版」。
 * - 正式版 release：接口失败时默认显示，避免影响线上用户
 * - 体验版/开发版：接口失败时默认隐藏，便于过审
 */
function fetchMerchantSwitchEnabled(options = {}) {
  const force = !!(options && options.force);
  if (!force) {
    const cached = readCachedEnabled();
    if (cached !== null) {
      return Promise.resolve(cached);
    }
  }

  const meta = getMiniProgramMeta();
  const failOpen = meta.envVersion === 'release';
  const query = [];
  if (meta.envVersion) query.push(`envVersion=${encodeURIComponent(meta.envVersion)}`);
  if (meta.version) query.push(`version=${encodeURIComponent(meta.version)}`);
  const path = `/api/config/merchant-switch${query.length ? `?${query.join('&')}` : ''}`;

  return request(path, {}, { method: 'GET', auth: false, timeout: 8000 })
    .then((res) => {
      if (!res || res.success === false) {
        return failOpen;
      }
      const enabled = !!(res.merchantSwitchEnabled || res.merchant_switch_enabled);
      writeCachedEnabled(enabled);
      return enabled;
    })
    .catch(() => failOpen);
}

function applyMerchantSwitchToApp(app, enabled) {
  if (!app || !app.globalData) return enabled;
  app.globalData.merchantSwitchEnabled = !!enabled;
  return !!enabled;
}

module.exports = {
  getMiniProgramMeta,
  fetchMerchantSwitchEnabled,
  applyMerchantSwitchToApp,
  readCachedEnabled
};
