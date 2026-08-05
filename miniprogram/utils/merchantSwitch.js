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

function parseBool(raw) {
  if (raw === true || raw === false) return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function readCachedEnabled() {
  try {
    const at = Number(wx.getStorageSync(CACHE_AT_KEY) || 0);
    if (!at || Date.now() - at > CACHE_TTL) return null;
    return parseBool(wx.getStorageSync(CACHE_KEY));
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

function defaultMerchantSwitchEnabled(envVersion) {
  // 正式版：接口失败时默认显示，避免影响线上用户
  // 体验版/开发版：接口失败时默认隐藏，便于过审
  return envVersion === 'release';
}

/**
 * 拉取商家入口开关。
 * 同一开关同时控制用户端 AI 文案 / AI 问诊：
 *   false → 隐藏「切换商家版」+ 隐藏 AI 字样与问诊
 *   true  → 展示商家入口 + 展示 AI 问诊
 */
function fetchRemoteAppConfig(options = {}) {
  const force = !!(options && options.force);
  if (!force) {
    const cachedEnabled = readCachedEnabled();
    if (cachedEnabled !== null) {
      return Promise.resolve({
        merchantSwitchEnabled: cachedEnabled,
        auditMode: !cachedEnabled
      });
    }
  }

  const meta = getMiniProgramMeta();
  const query = [];
  if (meta.envVersion) query.push(`envVersion=${encodeURIComponent(meta.envVersion)}`);
  if (meta.version) query.push(`version=${encodeURIComponent(meta.version)}`);
  const path = `/api/config/merchant-switch${query.length ? `?${query.join('&')}` : ''}`;

  return request(path, {}, { method: 'GET', auth: false, timeout: 8000 })
    .then((res) => {
      if (!res || res.success === false) {
        const enabled = defaultMerchantSwitchEnabled(meta.envVersion);
        return { merchantSwitchEnabled: enabled, auditMode: !enabled };
      }
      const merchantSwitchEnabled = !!(res.merchantSwitchEnabled || res.merchant_switch_enabled);
      writeCachedEnabled(merchantSwitchEnabled);
      return {
        merchantSwitchEnabled,
        auditMode: !merchantSwitchEnabled
      };
    })
    .catch(() => {
      const enabled = defaultMerchantSwitchEnabled(meta.envVersion);
      return { merchantSwitchEnabled: enabled, auditMode: !enabled };
    });
}

/**
 * 拉取是否展示「切换商家版」。
 */
function fetchMerchantSwitchEnabled(options = {}) {
  return fetchRemoteAppConfig(options).then((cfg) => cfg.merchantSwitchEnabled);
}

/** 审核态 = 商家开关关闭（false） */
function fetchAuditMode(options = {}) {
  return fetchRemoteAppConfig(options).then((cfg) => cfg.auditMode);
}

function applyMerchantSwitchToApp(app, enabled) {
  if (!app || !app.globalData) return !!enabled;
  const on = !!enabled;
  app.globalData.merchantSwitchEnabled = on;
  // 与商家开关同源：关闭时进入审核 UI（去 AI 字样 / 隐藏问诊）
  app.globalData.auditMode = !on;
  return on;
}

function applyAuditModeToApp(app, auditMode) {
  if (!app || !app.globalData) return !!auditMode;
  // 兼容旧调用：auditMode true ↔ 开关 false
  return !applyMerchantSwitchToApp(app, !auditMode);
}

function applyRemoteConfigToApp(app, config) {
  const cfg = config || {};
  const enabled = !!cfg.merchantSwitchEnabled;
  applyMerchantSwitchToApp(app, enabled);
  return {
    merchantSwitchEnabled: enabled,
    auditMode: !enabled
  };
}

/** 商家开关是否开启（true 才展示 AI / 商家入口） */
function isMerchantSwitchEnabled(app) {
  const host = app || (typeof getApp === 'function' ? getApp() : null);
  if (host && host.globalData && typeof host.globalData.merchantSwitchEnabled === 'boolean') {
    return host.globalData.merchantSwitchEnabled;
  }
  const cached = readCachedEnabled();
  if (cached !== null) return cached;
  return defaultMerchantSwitchEnabled(getMiniProgramMeta().envVersion);
}

/** 审核态：商家开关为 false */
function isAuditMode(app) {
  return !isMerchantSwitchEnabled(app);
}

/** AI 问诊是否可见：仅商家开关为 true 时展示 */
function isAiConsultVisible(app) {
  return isMerchantSwitchEnabled(app);
}

function readCachedAuditMode() {
  const cached = readCachedEnabled();
  if (cached === null) return null;
  return !cached;
}

/** 给页面 data 写入 showAiConsult，并在需要时刷新远程配置 */
function syncAiConsultFlag(page, options = {}) {
  const app = typeof getApp === 'function' ? getApp() : null;
  const apply = (visible) => {
    if (page && page.setData) page.setData({ showAiConsult: !!visible });
    return !!visible;
  };
  apply(isAiConsultVisible(app));
  if (options && options.fetch === false) return Promise.resolve(isAiConsultVisible(app));
  return fetchMerchantSwitchEnabled(options).then((enabled) => {
    applyMerchantSwitchToApp(app, enabled);
    return apply(!!enabled);
  });
}

function guardOpenAiConsult(app) {
  if (isAiConsultVisible(app)) return true;
  wx.showToast({ title: '功能暂未开放', icon: 'none' });
  return false;
}

module.exports = {
  getMiniProgramMeta,
  fetchMerchantSwitchEnabled,
  fetchAuditMode,
  fetchRemoteAppConfig,
  applyMerchantSwitchToApp,
  applyAuditModeToApp,
  applyRemoteConfigToApp,
  readCachedEnabled,
  readCachedAuditMode,
  isMerchantSwitchEnabled,
  isAuditMode,
  isAiConsultVisible,
  syncAiConsultFlag,
  guardOpenAiConsult
};
