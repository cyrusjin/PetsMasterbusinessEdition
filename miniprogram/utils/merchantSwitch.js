const { request } = require('./api');

const CACHE_KEY = 'pet_merchant_switch_enabled';
const CACHE_AT_KEY = 'pet_merchant_switch_fetched_at';
const CACHE_ENV_KEY = 'pet_merchant_switch_env';
const CACHE_VER_KEY = 'pet_merchant_switch_ver';
const CACHE_TTL = 60 * 1000;

/**
 * 本地构建版本号（提审控制用）。
 * 每次提审前改这个号；后台「版本管理」添加同名条目并关闭「商家版」，
 * 过审后再打开。不要依赖 getAccountInfoSync().version——
 * 审核期微信常仍返回线上旧版或空，会误命中 default=开启。
 */
const LOCAL_APP_VERSION = '1.0.8';

let cachedMiniProgramMeta = null;

function getMiniProgramMeta() {
  if (cachedMiniProgramMeta) return cachedMiniProgramMeta;
  try {
    const info = wx.getAccountInfoSync && wx.getAccountInfoSync();
    const mp = (info && info.miniProgram) || {};
    const wxVersion = String(mp.version || '').trim();
    cachedMiniProgramMeta = {
      envVersion: String(mp.envVersion || '').trim(),
      // 始终用本地构建号请求服务端，保证可按本包单独关商家入口
      version: LOCAL_APP_VERSION,
      wxVersion,
      appId: String(mp.appId || '').trim()
    };
    return cachedMiniProgramMeta;
  } catch (err) {
    console.warn('[merchantSwitch] getAccountInfoSync failed', err);
    cachedMiniProgramMeta = { envVersion: '', version: LOCAL_APP_VERSION, wxVersion: '', appId: '' };
    return cachedMiniProgramMeta;
  }
}

/**
 * 正式版（线上用户）。
 */
function isReleaseEnv() {
  return getMiniProgramMeta().envVersion === 'release';
}

/**
 * 开发版：跟随远程开关，方便本地调试。
 */
function isDevelopEnv() {
  return getMiniProgramMeta().envVersion === 'develop';
}

/**
 * 商家壳硬拦截：
 * - trial / 空 env：无论远程开关如何都禁止（审核常见环境）
 * - develop / release：不硬拦，交给远程开关
 */
function isMerchantUiBlocked() {
  const env = getMiniProgramMeta().envVersion;
  // develop 跟远程开关；release 跟远程开关；其余（trial/空/未知）硬拦截
  return env !== 'release' && env !== 'develop';
}

function parseBool(raw) {
  if (raw === true || raw === false) return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function readCachedEnabled() {
  try {
    const meta = getMiniProgramMeta();
    const env = meta.envVersion || '';
    const ver = meta.version || '';
    const cachedEnv = String(wx.getStorageSync(CACHE_ENV_KEY) || '');
    const cachedVer = String(wx.getStorageSync(CACHE_VER_KEY) || '');
    // 跨环境 / 跨本地构建号缓存一律作废
    if (cachedEnv !== env || cachedVer !== ver) return null;
    const at = Number(wx.getStorageSync(CACHE_AT_KEY) || 0);
    if (!at || Date.now() - at > CACHE_TTL) return null;
    return parseBool(wx.getStorageSync(CACHE_KEY));
  } catch (err) {
    return null;
  }
}

function writeCachedEnabled(enabled) {
  try {
    const meta = getMiniProgramMeta();
    wx.setStorageSync(CACHE_KEY, !!enabled);
    wx.setStorageSync(CACHE_AT_KEY, Date.now());
    wx.setStorageSync(CACHE_ENV_KEY, meta.envVersion || '');
    wx.setStorageSync(CACHE_VER_KEY, meta.version || '');
  } catch (err) {
    // ignore
  }
}

function defaultMerchantSwitchEnabled(envVersion) {
  // 正式版：接口失败时默认显示，避免影响线上用户
  // 体验版/开发版/空环境：接口失败时默认隐藏，便于过审
  return envVersion === 'release';
}

/**
 * 远端开关再叠加本地硬门槛：
 * trial / 空环境永远 false；develop / release 尊重远端。
 */
function resolveMerchantSwitchEnabled(remoteEnabled, envVersion) {
  const env = envVersion != null ? envVersion : getMiniProgramMeta().envVersion;
  if (env !== 'release' && env !== 'develop') return false;
  return !!remoteEnabled;
}

/**
 * 拉取商家入口开关。
 * 同一开关同时控制用户端 AI 文案 / AI 问诊：
 *   false → 隐藏「切换商家版」+ 隐藏 AI 字样与问诊
 *   true  → 展示商家入口 + 展示 AI 问诊
 * trial/空环境客户端强制 false；develop/release 走远端（服务端 default 可保持开启）。
 */
function fetchRemoteAppConfig(options = {}) {
  const force = !!(options && options.force);
  const meta = getMiniProgramMeta();

  // trial / 空 / 未知：不依赖远端/缓存，直接关死商家入口
  if (meta.envVersion !== 'release' && meta.envVersion !== 'develop') {
    return Promise.resolve({
      merchantSwitchEnabled: false,
      auditMode: true,
      envVersion: meta.envVersion || '',
      version: meta.version
    });
  }

  if (!force) {
    const cachedEnabled = readCachedEnabled();
    if (cachedEnabled !== null) {
      const enabled = resolveMerchantSwitchEnabled(cachedEnabled, meta.envVersion);
      return Promise.resolve({
        merchantSwitchEnabled: enabled,
        auditMode: !enabled,
        envVersion: meta.envVersion,
        version: meta.version
      });
    }
  }

  const query = [];
  if (meta.envVersion) query.push(`envVersion=${encodeURIComponent(meta.envVersion)}`);
  // 始终带上本地构建号，供后台按版本精确控制
  query.push(`version=${encodeURIComponent(meta.version || LOCAL_APP_VERSION)}`);
  const path = `/api/config/merchant-switch?${query.join('&')}`;

  return request(path, {}, { method: 'GET', auth: false, timeout: 8000 })
    .then((res) => {
      if (!res || res.success === false) {
        const enabled = resolveMerchantSwitchEnabled(
          defaultMerchantSwitchEnabled(meta.envVersion),
          meta.envVersion
        );
        return {
          merchantSwitchEnabled: enabled,
          auditMode: !enabled,
          envVersion: meta.envVersion,
          version: meta.version
        };
      }
      const remoteEnabled = !!(res.merchantSwitchEnabled || res.merchant_switch_enabled);
      const merchantSwitchEnabled = resolveMerchantSwitchEnabled(remoteEnabled, meta.envVersion);
      writeCachedEnabled(merchantSwitchEnabled);
      console.log('[merchantSwitch] remote', {
        version: meta.version,
        wxVersion: meta.wxVersion || '(空)',
        envVersion: meta.envVersion,
        merchantSwitchEnabled
      });
      return {
        merchantSwitchEnabled,
        auditMode: !merchantSwitchEnabled,
        envVersion: meta.envVersion,
        version: meta.version
      };
    })
    .catch(() => {
      const enabled = resolveMerchantSwitchEnabled(
        defaultMerchantSwitchEnabled(meta.envVersion),
        meta.envVersion
      );
      return {
        merchantSwitchEnabled: enabled,
        auditMode: !enabled,
        envVersion: meta.envVersion,
        version: meta.version
      };
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
  const on = resolveMerchantSwitchEnabled(enabled);
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
  const enabled = resolveMerchantSwitchEnabled(cfg.merchantSwitchEnabled);
  applyMerchantSwitchToApp(app, enabled);
  return {
    merchantSwitchEnabled: enabled,
    auditMode: !enabled
  };
}

/** 商家开关是否开启（true 才展示 AI / 商家入口） */
function isMerchantSwitchEnabled(app) {
  if (isMerchantUiBlocked()) return false;
  const host = app || (typeof getApp === 'function' ? getApp() : null);
  if (host && host.globalData && typeof host.globalData.merchantSwitchEnabled === 'boolean') {
    return resolveMerchantSwitchEnabled(host.globalData.merchantSwitchEnabled);
  }
  const cached = readCachedEnabled();
  if (cached !== null) return resolveMerchantSwitchEnabled(cached);
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
  if (isMerchantUiBlocked()) return true;
  const cached = readCachedEnabled();
  if (cached === null) return null;
  return !resolveMerchantSwitchEnabled(cached);
}

/** 给页面 data 写入 showAiConsult，并在需要时刷新远程配置 */
function syncAiConsultFlag(page, options = {}) {
  const app = typeof getApp === 'function' ? getApp() : null;
  const apply = (visible) => {
    if (page && page.setData) page.setData({ showAiConsult: !!visible });
    return !!visible;
  };
  // 未确认前一律按关闭展示，避免首屏 / 扫包渲染出 AI 文案
  apply(false);
  if (options && options.fetch === false) {
    const known = isAiConsultVisible(app);
    return Promise.resolve(apply(known));
  }
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
  LOCAL_APP_VERSION,
  getMiniProgramMeta,
  isReleaseEnv,
  isDevelopEnv,
  isMerchantUiBlocked,
  resolveMerchantSwitchEnabled,
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
