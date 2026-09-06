(function () {
  const TOKEN_KEY = 'petmaster_admin_token';
  const USER_KEY = 'petmaster_admin_user';

  function getApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    return 'https://api.petmaster.me';
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {}
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function getToken() {
    return readStorage(TOKEN_KEY);
  }

  function setSession(token, username) {
    writeStorage(TOKEN_KEY, token || '');
    writeStorage(USER_KEY, username || '');
  }

  function clearSession() {
    removeStorage(TOKEN_KEY);
    removeStorage(USER_KEY);
  }

  function getUsername() {
    return readStorage(USER_KEY);
  }

  function requireAuth() {
    if (!getToken()) {
      window.location.href = 'login.html';
      return false;
    }
    // 兼容旧 sessionStorage：迁移到 localStorage，新标签页可复用登录态
    setSession(getToken(), getUsername());
    return true;
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch(getApiBase() + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(function () {
      return { success: false, errMsg: '网络异常' };
    });

    if (res.status === 401) {
      clearSession();
      window.location.href = 'login.html';
      throw new Error(data.errMsg || '登录已过期');
    }
    return data;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.PetAdmin = {
    getApiBase,
    getToken,
    setSession,
    clearSession,
    getUsername,
    requireAuth,
    api,
    escapeHtml
  };
})();
