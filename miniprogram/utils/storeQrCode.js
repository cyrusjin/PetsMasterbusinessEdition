const storeApi = require('./store');
const { resolveImageUrl, peekCachedPath, isLocalImagePath } = require('./imageCache');
const { SERVICE_LINE_KEYS, normalizeServiceLines } = require('./serviceLines');

const STORAGE_PREFIX = 'promo_poster_qr_v1_';
const FAIL_COOLDOWN_MS = 15000;
const memoryPaths = Object.create(null);
const inflight = Object.create(null);
const failedAt = Object.create(null);

function clean(value) {
  return String(value || '').trim();
}

function getEnvVersion() {
  try {
    const account = wx.getAccountInfoSync();
    const version = account && account.miniProgram && account.miniProgram.envVersion;
    if (['release', 'trial', 'develop'].includes(version)) return version;
  } catch (err) {
    // ignore
  }
  return 'trial';
}

function cacheKey(storeId, line, env) {
  return `${storeId}::${line}::${env}`;
}

function fileAlive(path) {
  const filePath = clean(path);
  if (!filePath || !isLocalImagePath(filePath)) return false;
  if (filePath.startsWith('/') && !filePath.startsWith('/Users') && filePath.indexOf('://') < 0) {
    return true;
  }
  try {
    wx.getFileSystemManager().accessSync(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

function readStored(storeId) {
  try {
    const value = wx.getStorageSync(STORAGE_PREFIX + storeId);
    return value && typeof value === 'object' ? value : {};
  } catch (err) {
    return {};
  }
}

function writeStored(storeId, line, env, url, path) {
  const current = readStored(storeId);
  current[`${line}_${env}`] = { url: clean(url), path: clean(path), at: Date.now() };
  try {
    wx.setStorageSync(STORAGE_PREFIX + storeId, current);
  } catch (err) {
    // ignore quota
  }
}

function remember(storeId, line, env, url, path) {
  const resolved = clean(path) || clean(url);
  if (!resolved) return '';
  memoryPaths[cacheKey(storeId, line, env)] = resolved;
  writeStored(storeId, line, env, url, resolved);
  return resolved;
}

function peekStoreQrCode(storeId, line, envVersion) {
  const id = clean(storeId);
  const serviceLine = line || 'boarding';
  const env = envVersion || getEnvVersion();
  if (!id) return '';
  const key = cacheKey(id, serviceLine, env);
  const memoryPath = memoryPaths[key];
  if (memoryPath && (fileAlive(memoryPath) || !isLocalImagePath(memoryPath))) return memoryPath;

  const stored = readStored(id)[`${serviceLine}_${env}`] || {};
  if (stored.path && fileAlive(stored.path)) {
    memoryPaths[key] = stored.path;
    return stored.path;
  }
  if (stored.url) {
    const cached = peekCachedPath(stored.url);
    if (cached) {
      memoryPaths[key] = cached;
      return cached;
    }
  }
  return '';
}

function listQrServiceLines(shop) {
  const lines = normalizeServiceLines(shop && shop.serviceLines);
  const keys = SERVICE_LINE_KEYS.filter((key) => lines[key]);
  return keys.length ? keys : ['boarding'];
}

function envFallbackOrder(env) {
  const order = [];
  [env, 'release', 'trial'].forEach((item) => {
    if (item && !order.includes(item)) order.push(item);
  });
  return order;
}

function requestQr(storeId, line, env, aliasEnv) {
  return storeApi.getStoreQrCode(storeId, line, env).then((res) => {
    if (!res || !res.success) throw new Error((res && res.errMsg) || '预约二维码生成失败');
    const source = res.tempFileURL || res.fileID || '';
    if (!source) throw new Error('预约二维码地址为空');
    return resolveImageUrl(source).then((path) => {
      const resolved = remember(storeId, line, env, source, path || source);
      if (aliasEnv && aliasEnv !== env) remember(storeId, line, aliasEnv, source, path || source);
      return resolved;
    });
  });
}

function ensureStoreQrCode(storeId, line, envVersion) {
  const id = clean(storeId);
  const serviceLine = line || 'boarding';
  const env = envVersion || getEnvVersion();
  if (!id) return Promise.reject(new Error('请先开通店铺再生成预约二维码'));

  const hit = peekStoreQrCode(id, serviceLine, env);
  if (hit) return Promise.resolve(hit);

  const key = cacheKey(id, serviceLine, env);
  if (inflight[key]) return inflight[key];
  if (failedAt[key] && Date.now() - failedAt[key] < FAIL_COOLDOWN_MS) {
    return Promise.reject(new Error('预约二维码生成失败'));
  }

  const tryEnv = (envs, index) => requestQr(id, serviceLine, envs[index], env).catch((err) => {
    if (index >= envs.length - 1) throw err;
    return tryEnv(envs, index + 1);
  });
  const promise = tryEnv(envFallbackOrder(env), 0).then((path) => {
    delete failedAt[key];
    return path;
  }).catch((err) => {
    failedAt[key] = Date.now();
    throw err;
  }).finally(() => {
    delete inflight[key];
  });
  inflight[key] = promise;
  return promise;
}

function prefetchStoreQrCodes(shop, options) {
  const storeId = clean((shop && (shop.store_id || shop.storeId)) || (options && options.storeId));
  if (!storeId) return Promise.resolve([]);
  const env = (options && options.envVersion) || getEnvVersion();
  const preferred = (options && options.preferredLine) || '';
  const lines = listQrServiceLines(shop);
  const ordered = preferred && lines.includes(preferred)
    ? [preferred].concat(lines.filter((item) => item !== preferred))
    : lines;
  return Promise.all(ordered.map((line) => ensureStoreQrCode(storeId, line, env).catch(() => '')));
}

module.exports = {
  getEnvVersion,
  listQrServiceLines,
  peekStoreQrCode,
  ensureStoreQrCode,
  prefetchStoreQrCodes
};
