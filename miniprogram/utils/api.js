const { API_BASE_URL, API_CLIENT } = require('../config/api');
const CLIENT = API_CLIENT || 'merchant';

const TOKEN_KEY = 'petmaster_api_token';

const API_ROUTES = {
  userAuth: '/api/user',
  storeService: '/api/store',
  orderService: '/api/order',
  petService: '/api/pet',
  dailyService: '/api/daily',
  ledgerService: '/api/ledger',
  /** AI 问诊代理：服务端实现 action=petConsult 后可返回大模型回复 */
  aiService: '/api/ai'
};

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || '';
  } catch (err) {
    return '';
  }
}

function setToken(token) {
  try {
    if (token) {
      wx.setStorageSync(TOKEN_KEY, token);
    } else {
      wx.removeStorageSync(TOKEN_KEY);
    }
  } catch (err) {
    // ignore
  }
}

function clearToken() {
  setToken('');
}

function normalizeApiError(err, label) {
  const raw = (err && (err.errMsg || err.message)) || '接口调用失败';
  if (/timeout/i.test(raw)) {
    return `接口 ${label} 调用超时，请检查网络或服务器`;
  }
  return raw;
}

// 只合并完全相同的 GET 请求，避免首页/Tab onShow 同时触发重复网络请求。
// POST/PUT 等写操作永远不合并，保持原有语义和时序。
const pendingGetRequests = new Map();

function buildRequestKey(url, method, data, token) {
  let payload = '';
  try {
    payload = JSON.stringify(data || {});
  } catch (err) {
    payload = String(data || '');
  }
  return `${method}|${url}|${token || ''}|${payload}`;
}

function request(path, data = {}, options = {}) {
  const method = options.method || 'POST';
  const needAuth = options.auth !== false;
  const url = `${API_BASE_URL.replace(/\/$/, '')}${path}`;
  const token = needAuth ? getToken() : '';
  const canDedupe = method === 'GET' && options.dedupe !== false;
  const requestKey = canDedupe ? buildRequestKey(url, method, data, token) : '';
  if (canDedupe && pendingGetRequests.has(requestKey)) {
    return pendingGetRequests.get(requestKey);
  }

  const requestPromise = new Promise((resolve) => {
    const header = {
      'Content-Type': 'application/json'
    };
    if (needAuth) {
      if (token) {
        header.Authorization = `Bearer ${token}`;
      }
    }

    wx.request({
      url,
      method,
      data,
      header,
      timeout: options.timeout || 30000,
      success: (res) => {
        const status = res.statusCode || 0;
        const body = res.data;
        if (status === 401) {
          clearToken();
          resolve({ success: false, errMsg: '登录已过期', unauthorized: true });
          return;
        }
        if (status >= 200 && status < 300) {
          if (body === undefined || body === null) {
            resolve({ success: false, errMsg: `接口 ${path} 无返回` });
            return;
          }
          resolve(body);
          return;
        }
        const errMsg = (body && body.errMsg) || `HTTP ${status}`;
        resolve({ success: false, errMsg });
      },
      fail: (err) => {
        resolve({
          success: false,
          errMsg: normalizeApiError(err, path)
        });
      }
    });
  });

  if (canDedupe) {
    pendingGetRequests.set(requestKey, requestPromise);
    requestPromise.then(() => {
      if (pendingGetRequests.get(requestKey) === requestPromise) {
        pendingGetRequests.delete(requestKey);
      }
    });
  }
  return requestPromise;
}

let loginPromise = null;

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error('wx.login 未返回 code'));
      },
      fail: reject
    });
  });
}

function ensureLogin(force = false) {
  if (!force && getToken()) {
    return Promise.resolve(getToken());
  }
  // 强制刷新也复用正在进行的登录，避免多个 401 同时触发多次 wx.login。
  if (loginPromise) return loginPromise;

  loginPromise = wxLoginCode()
    .then((code) => request('/api/auth/login', { code, client: CLIENT }, { auth: false }))
    .then((res) => {
      if (!res.success || !res.token) {
        throw new Error(res.errMsg || '登录失败');
      }
      setToken(res.token);
      return res.token;
    })
    .finally(() => {
      loginPromise = null;
    });

  return loginPromise;
}

function callApiService(service, data = {}) {
  const path = API_ROUTES[service];
  if (!path) {
    return Promise.resolve({ success: false, errMsg: `未知服务 ${service}` });
  }
  if (!API_BASE_URL) {
    return Promise.resolve({ success: false, errMsg: '未配置 API_BASE_URL' });
  }

  return ensureLogin()
    .then(() => request(path, data))
    .then((res) => {
      if (res && res.unauthorized) {
        return ensureLogin(true).then(() => request(path, data));
      }
      return res;
    })
    .catch((err) => ({
      success: false,
      errMsg: normalizeApiError(err, service)
    }));
}

function requestUploadSign(folder, ext) {
  return ensureLogin()
    .then(() => request('/api/upload/sign', { folder, ext }))
    .then((res) => {
      if (res && res.unauthorized) {
        return ensureLogin(true).then(() => request('/api/upload/sign', { folder, ext }));
      }
      return res;
    });
}

function rejectOnFailure(res, fallbackMsg = '请求失败') {
  if (!res || res.success === false) {
    const err = new Error((res && res.errMsg) || fallbackMsg);
    err.response = res;
    return Promise.reject(err);
  }
  return res;
}

module.exports = {
  callApiService,
  normalizeApiError,
  ensureLogin,
  rejectOnFailure,
  getToken,
  setToken,
  clearToken,
  request,
  requestUploadSign,
  TOKEN_KEY
};
