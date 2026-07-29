const { STORAGE_KEYS } = require('./utils/constants');
const { getDefaultWeightPricing } = require('./utils/weightPricing');
const { getDefaultRoomPricing } = require('./utils/roomPricing');
const auth = require('./utils/auth');
const storeApi = require('./utils/store');
const { API_BASE_URL, API_CLIENT } = require('./config/api');
const { ensureLogin } = require('./utils/api');
const { normalizeIsMerchant, resolveRole, isMerchantApproved, isMerchantPending, isMerchantRejected, isMerchantDisabled, isMerchantStaff, isStaffOfStore, isStoreOwner, getMerchantStoreId, getVisitStoreId, hasMerchantCapability } = require('./utils/role');
const { applyRoleShell: applyTabShell } = require('./utils/shell');
const { mergeBillingRules } = require('./utils/storeContext');
const storeDebug = require('./utils/storeDebug');
const { isCloudFileId } = require('./utils/mediaResolve');
const petApi = require('./utils/pet');
const orderApi = require('./utils/order');
const dailyApi = require('./utils/daily');
const { dedupeDailyLogs, getLogId } = require('./utils/dailyLogUtil');
const merchantDemo = require('./utils/merchantDemo');
const { mergeMerchantShop } = require('./utils/storeSync');
const { resolveTargetEnvVersion } = require('./utils/miniProgramNavigate');
const { clearImageFileCache } = require('./utils/imageCache');
const { attachOrderDisplayNo, attachStoreDisplayNo, buildOrderDisplayNo } = require('./utils/displayNo');

/** 宠主端小程序 AppID（分享给客人时跳转） */
const USER_MINI_PROGRAM_APPID = 'wx95d01c319ed4f686';

const USER_INFO_TTL = 5 * 60 * 1000;
const ORDERS_TTL = 15 * 1000;
const DAILY_LOGS_TTL = 15 * 1000;
const PETS_TTL = 30 * 1000;
const MERCHANT_STORE_TTL = 30 * 1000;
const STORAGE_PERSIST_MS = 3 * 1000;
const ASYNC_STORAGE_KEYS = {
  [STORAGE_KEYS.ORDERS]: true,
  [STORAGE_KEYS.DAILY_LOGS]: true,
  [STORAGE_KEYS.PETS]: true,
  [STORAGE_KEYS.DEMO_ORDERS]: true,
  [STORAGE_KEYS.DEMO_DAILY_LOGS]: true,
  [STORAGE_KEYS.DEMO_PETS]: true
};

App({
  globalData: {
    env: '',
    role: 'user',
    isMerchant: false,
    userInfo: null,
    isLoggedIn: false,
    storeId: '',
    currentStore: null,
    merchantStoreId: '',
    pendingEntryStoreId: '',
    pendingStaffInviteStoreId: '',
    merchantAccessRole: '',
    apiReady: false,
    lastApiError: ''
  },

  onLaunch(options) {
    this._staffInviteHandled = {};
    this._staffInviteInFlight = '';
    this._staffInvitePromise = null;
    this._initCloud();
    this._loadAllData();
    this._restoreCachedStore();
    storeDebug.logEntryOptions('App onLaunch', options);
    const cachedUser = this.getData(STORAGE_KEYS.USER);
    if (cachedUser) {
      this.globalData.userInfo = cachedUser;
      this._hydrateRoleFromUser(cachedUser);
    }
    this._userInfoFetchedAt = 0;
    // 标记冷启动：紧随其后的 onShow 不再重复 bootstrap
    this._skipNextAppShowBootstrap = true;
    this._bootstrapSession(options, { force: true });
  },

  onShow(options) {
    storeDebug.logEntryOptions('App onShow', options);
    if (this._skipNextAppShowBootstrap) {
      this._skipNextAppShowBootstrap = false;
      return;
    }
    // 前后台切换走 TTL，避免每次强制登录打穿缓存
    this._bootstrapSession(options, { force: false });
  },

  _hydrateRoleFromUser(user) {
    if (!user) return;
    if (isMerchantApproved(user)) {
      this.globalData.isMerchant = true;
      this.globalData.role = 'merchant';
      return;
    }
    this.globalData.isMerchant = false;
    this.globalData.role = 'user';
  },

  _bootstrapSession(options, bootOptions = {}) {
    const force = !!(bootOptions && bootOptions.force);
    return this.ensureCloudAndLogin(force ? { force: true } : {})
      .then(() => {
        this._reconcileClientModeFromCloudUser();
        this._handleEntryOptions(options);
        this._applyEntrySideEffects(options);
        applyTabShell();
      });
  },

  _applyEntrySideEffects() {
    const staffInviteStoreId = this.globalData.pendingStaffInviteStoreId;
    if (staffInviteStoreId && !this.shouldIgnoreShareEntry()) {
      this._redirectStaffInviteIfNeeded(staffInviteStoreId);
    }
  },

  _reconcileClientModeFromCloudUser() {
    const user = this.globalData.userInfo;
    if (isMerchantApproved(user)) {
      this.globalData.isMerchant = true;
      this.globalData.role = 'merchant';
      if (isMerchantStaff(user)) {
        this.globalData.merchantAccessRole = 'staff';
      } else if (!this.globalData.merchantAccessRole) {
        this.globalData.merchantAccessRole = 'owner';
      }
    }
  },

  isMerchantBackendUser(user) {
    const current = user || this.globalData.userInfo;
    return isMerchantApproved(current);
  },

  shouldIgnoreShareEntry() {
    return false;
  },

  _entryOptionsSignature(options) {
    if (!options) return '';
    const query = options.query || {};
    const staff = this._parseStaffInviteStoreId(options);
    const store = this._extractStoreId(options);
    const path = options.path || '';
    const scene = options.scene || query.scene || '';
    return `${path}|${staff}|${store}|${scene}`;
  },

  _redirectStaffInviteIfNeeded(storeId) {
    const pages = getCurrentPages();
    const route = pages.length ? pages[pages.length - 1].route : '';
    if (route === 'pages/merchant/tab-daily/tab-daily') return;
    wx.reLaunch({
      url: `/pages/merchant/tab-daily/tab-daily?staff_invite=1&store_id=${encodeURIComponent(storeId)}`
    });
  },

  _initCloud() {
    const baseUrl = (API_BASE_URL || '').trim();
    if (!baseUrl) {
      console.error('[API] 请在 miniprogram/config/api.js 配置 API_BASE_URL');
      this.globalData.env = '';
      return;
    }
    this.globalData.env = baseUrl;
  },

  _bootstrapCloud() {
    if (!this.globalData.env) {
      return Promise.resolve(false);
    }
    return ensureLogin()
      .then(() => auth.initDatabase())
      .then((res) => {
        if (!res.success) {
          console.error('[API] 初始化数据库失败', res.errMsg);
          return false;
        }
        return dailyApi.initDatabase()
          .then((dailyRes) => {
            if (dailyRes && !dailyRes.success) {
              console.error('[API] 初始化打卡数据表失败', dailyRes.errMsg);
            }
            this.globalData.apiReady = true;
            return true;
          });
      })
      .catch((err) => {
        console.error('[API] 初始化失败，请确认服务端已启动', err);
        return false;
      });
  },

  _extractStoreId(options) {
    if (!options) return '';
    const query = options.query || {};
    if (query.store_id) return query.store_id;

    if (query.scene) {
      const sceneParam = decodeURIComponent(String(query.scene));
      if (sceneParam.includes('store_id=')) {
        return sceneParam.split('store_id=')[1].split('&')[0];
      }
      if (sceneParam.startsWith('store_')) return sceneParam;
    }

    const scene = options.scene;
    if (scene && scene !== 1001 && scene !== 1089) {
      const decoded = decodeURIComponent(String(scene));
      if (decoded.includes('store_id=')) {
        return decoded.split('store_id=')[1].split('&')[0];
      }
      if (decoded.startsWith('store_')) return decoded;
    }
    return '';
  },

  _isStaffInviteEntry(options) {
    return !!this._parseStaffInviteStoreId(options);
  },

  extractStoreIdFromOptions(options) {
    return this._extractStoreId(options);
  },

  openUserMiniProgram(path = 'pages/index/index', extraData = {}) {
    return new Promise((resolve) => {
      wx.navigateToMiniProgram({
        appId: USER_MINI_PROGRAM_APPID,
        path,
        extraData,
        envVersion: resolveTargetEnvVersion(),
        success: resolve,
        fail: (err) => {
          wx.showToast({ title: '请搜索打开宠主端小程序', icon: 'none' });
          resolve(err);
        }
      });
    });
  },

  enterUserStore(storeId) {
    if (!storeId) return Promise.resolve(null);
    const path = `pages/index/index?store_id=${encodeURIComponent(storeId)}`;
    return this.openUserMiniProgram(path, {
      store_id: storeId,
      from: 'merchant_share'
    });
  },

  _handleEntryOptions(options) {
    if (!options) return;

    const signature = this._entryOptionsSignature(options);
    const staffStoreId = this._parseStaffInviteStoreId(options);

    if (staffStoreId && this.shouldIgnoreShareEntry()) {
      this.globalData.pendingStaffInviteStoreId = '';
      this.globalData.pendingEntryStoreId = '';
      if (signature) this._lastHandledEntrySignature = signature;
      storeDebug.log('忽略分享入口：商家/员工身份保持不变');
      return;
    }

    if (signature && signature === this._lastHandledEntrySignature) {
      return;
    }

    if (this._isStaffInviteEntry(options)) {
      if (staffStoreId) {
        this.globalData.pendingStaffInviteStoreId = staffStoreId;
      }
      if (signature) this._lastHandledEntrySignature = signature;
      return;
    }

    if (signature) {
      this._lastHandledEntrySignature = signature;
    }
  },

  _restoreCachedStore() {
    const storeId = this.getData(STORAGE_KEYS.STORE_ID);
    const currentStore = this.getData(STORAGE_KEYS.CURRENT_STORE);
    const shop = this.getShop();
    if (shop && shop.store_id) {
      this.globalData.merchantStoreId = shop.store_id;
    }
    if (storeId) {
      this.globalData.storeId = storeId;
    }
    if (currentStore) {
      this.globalData.currentStore = currentStore;
    }
  },

  getShareStoreId() {
    const shop = this.getShop() || {};
    const user = this.globalData.userInfo || {};
    const current = this.getCurrentStore();
    if (this.globalData.isMerchant) {
      return (
        shop.store_id
        || this.globalData.merchantStoreId
        || user.store_id
        || ''
      );
    }
    return (
      this.getStoreId()
      || user.store_id
      || (current && current.store_id)
      || ''
    );
  },

  getStoreId() {
    return this.globalData.storeId || this.getData(STORAGE_KEYS.STORE_ID) || '';
  },

  getCurrentStore() {
    return this.globalData.currentStore || this.getData(STORAGE_KEYS.CURRENT_STORE) || null;
  },

  _cacheStore(store) {
    if (!store || !store.store_id) return;
    this.globalData.storeId = store.store_id;
    this.globalData.currentStore = store;
    this.setData(STORAGE_KEYS.STORE_ID, store.store_id);
    this.setData(STORAGE_KEYS.CURRENT_STORE, store);
  },

  bindStore(storeId, options = {}) {
    const force = !!(options && options.force);
    const syncUser = options.syncUser !== false;
    if (!storeId) {
      return Promise.resolve(this.getCurrentStore());
    }

    const cachedId = this.getStoreId();
    if (!force && cachedId === storeId && this.getCurrentStore()) {
      return Promise.resolve(this.getCurrentStore());
    }

    if (!this.globalData.env) {
      return Promise.resolve(this.getCurrentStore());
    }

    return storeApi.getStore(storeId)
      .then((res) => {
        if (res.success && res.store) {
          this._cacheStore(res.store);
          storeDebug.log('bindStore 成功', {
            storeId: res.store.store_id,
            storeName: res.store.name
          });
          if (syncUser) {
            return this._maybeSyncUserStore(storeId).then(() => res.store);
          }
          return res.store;
        }
        storeDebug.log('bindStore 失败', { storeId, errMsg: res.errMsg || '店铺不存在' });
        return this.getCurrentStore();
      })
      .catch((err) => {
        console.error('bindStore failed', err);
        return this.getCurrentStore();
      });
  },

  _shouldSyncUserStore() {
    return false;
  },

  _maybeSyncUserStore(storeId) {
    if (!this._shouldSyncUserStore()) {
      return Promise.resolve(null);
    }
    if (this.globalData.isLoggedIn) {
      return this._syncUserStoreBinding(storeId);
    }
    this.globalData.pendingEntryStoreId = storeId;
    return Promise.resolve(null);
  },

  _flushPendingStoreBinding() {
    return Promise.resolve(null);
  },

  _syncUserStoreBinding() {
    return Promise.resolve(null);
  },

  refreshCurrentStore() {
    const storeId = this.getStoreId();
    if (!storeId) return Promise.resolve(null);
    return this.bindStore(storeId, { force: true });
  },

  getStoreBillingRules() {
    const store = this.getCurrentStore();
    return mergeBillingRules(store, this._defaultBillingRules());
  },

  ensureMerchantStore(options = {}) {
    const force = !!(options && options.force);

    // 体验模式才走本地 demo；待审/已拒绝/已关闭必须拉真实店铺
    if (
      this.isMerchantDemoMode()
      && !this.isMerchantPending()
      && !isMerchantRejected(this.globalData.userInfo)
      && !this.isMerchantDisabled()
    ) {
      merchantDemo.ensureDemoData();
      const shop = merchantDemo.getDemoShop();
      this.globalData.merchantStoreId = shop.store_id;
      return Promise.resolve(shop);
    }

    const shop = this.getShop();

    if (!this.globalData.env) {
      return Promise.resolve(shop);
    }

    if (this._merchantStorePromise) {
      return this._merchantStorePromise;
    }

    const cacheFresh = !force
      && this._merchantStoreFetchedAt
      && Date.now() - this._merchantStoreFetchedAt < MERCHANT_STORE_TTL;

    if (cacheFresh && shop.store_id) {
      return Promise.resolve(shop);
    }

    this._merchantStorePromise = this._fetchMerchantStoreFromCloud()
      .then((result) => {
        this._merchantStoreFetchedAt = Date.now();
        return result;
      })
      .finally(() => {
        this._merchantStorePromise = null;
      });
    return this._merchantStorePromise;
  },

  refreshMerchantStore() {
    this._merchantStoreFetchedAt = 0;
    return this.ensureMerchantStore({ force: true });
  },

  _fetchMerchantStoreFromCloud() {
    const localShop = this.getShop() || {};
    return storeApi.getMyStore()
      .then((res) => {
        if (res.success && res.store) {
          const merged = mergeMerchantShop(localShop, {
            ...res.store,
            store_id: res.store.store_id
          });
          this.saveShop(merged);
          this.globalData.merchantStoreId = merged.store_id;
          this.globalData.merchantAccessRole = res.accessRole || (
            isStoreOwner(this.globalData.userInfo) ? 'owner' : 'staff'
          );
          this._merchantStoreFetchedAt = Date.now();
          if (merged.billingRules && Object.keys(merged.billingRules).length) {
            const localRules = this.getBillingRules();
            this.saveBillingRules({ ...localRules, ...merged.billingRules });
          }
          return merged;
        }
        if (res && res.errMsg) {
          console.error('[店铺] 拉取服务端店铺失败', res.errMsg);
        }
        if (localShop.store_id) {
          console.warn('[店铺] 服务端未返回店铺，保留本地缓存');
          return localShop;
        }
        this.clearMerchantLocalCache();
        return {};
      })
      .catch((err) => {
        console.error('fetchMerchantStore failed', err);
        return localShop.store_id ? localShop : (this.getShop() || {});
      });
  },

  syncShopToCloud(shop) {
    if (
      this.isMerchantDemoMode()
      && !this.isMerchantPending()
      && !isMerchantRejected(this.globalData.userInfo)
      && !this.isMerchantDisabled()
    ) {
      const saved = merchantDemo.saveDemoShop(shop);
      this.globalData.merchantStoreId = saved.store_id;
      this._merchantStoreFetchedAt = Date.now();
      return Promise.resolve(saved);
    }
    if (!this.globalData.env) {
      this.saveShop(shop);
      this._merchantStoreFetchedAt = Date.now();
      return Promise.resolve(shop);
    }
    return storeApi.saveStore(shop)
      .then((res) => {
        if (res.success && res.store) {
          const localShop = this.getShop() || {};
          const merged = mergeMerchantShop(localShop, {
            ...shop,
            ...res.store,
            store_id: res.store.store_id
          });
          this.saveShop(merged);
          this.globalData.merchantStoreId = merged.store_id;
          this._merchantStoreFetchedAt = Date.now();
          auth.setMerchantProfile(res.store.store_id).catch((err) => {
            console.error('setMerchantProfile failed', err);
          });
          return merged;
        }
        const errMsg = (res && res.errMsg) || '保存店铺失败';
        return Promise.reject(new Error(errMsg));
      });
  },

  _loadAllData() {
    Object.values(STORAGE_KEYS).forEach((key) => {
      this.globalData[key] = wx.getStorageSync(key) || null;
    });
  },

  _applyRemoteUser(remoteUser, meta = {}) {
    const approved = isMerchantApproved(remoteUser);
    const isMerchant = approved;
    const role = isMerchant ? 'merchant' : 'user';
    this.globalData.isLoggedIn = true;
    this.globalData.authMeta = meta;

    const cached = this.globalData.userInfo || {};
    const prevApproved = isMerchantApproved(cached);
    const pickRemoteString = (key) => (
      Object.prototype.hasOwnProperty.call(remoteUser, key)
        ? (remoteUser[key] || '')
        : (cached[key] || '')
    );
    const user = {
      openid: remoteUser.openid || meta.requestOpenid || cached.openid || '',
      nickName: remoteUser.nickName || cached.nickName || '微信用户',
      avatarUrl: remoteUser.avatarUrl || cached.avatarUrl || '',
      phone: remoteUser.phone || cached.phone || '',
      realName: remoteUser.realName || cached.realName || '',
      idCard: remoteUser.idCard || cached.idCard || '',
      address: remoteUser.address || cached.address || '',
      store_id: pickRemoteString('store_id'),
      merchantStoreId: pickRemoteString('merchantStoreId'),
      pet_ids: Array.isArray(remoteUser.pet_ids) ? remoteUser.pet_ids : (cached.pet_ids || []),
      merchantStatus: pickRemoteString('merchantStatus'),
      merchantRole: pickRemoteString('merchantRole'),
      role,
      isMerchant,
      oaBound: Object.prototype.hasOwnProperty.call(remoteUser, 'oaBound')
        ? !!remoteUser.oaBound
        : !!cached.oaBound,
      oaQrcodeUrl: Object.prototype.hasOwnProperty.call(remoteUser, 'oaQrcodeUrl')
        ? (remoteUser.oaQrcodeUrl || '')
        : (cached.oaQrcodeUrl || ''),
      createTime: remoteUser.createTime || cached.createTime || Date.now()
    };

    this.globalData.role = role;
    this.globalData.isMerchant = isMerchant;
    if (!prevApproved && isMerchantApproved(user)) {
      merchantDemo.onMerchantApproved(this);
    }

    this.globalData.userInfo = user;
    this.setData(STORAGE_KEYS.USER, user);
    console.log('[auth] 角色同步', {
      openid: user.openid,
      isMerchant: user.isMerchant,
      role: user.role,
      store_id: user.store_id,
      merchantStoreId: user.merchantStoreId,
      merchantStatus: user.merchantStatus,
      meta
    });
    storeDebug.logStoreState('_applyRemoteUser', this);

    const linkedMerchantStoreId = getMerchantStoreId(user);
    if (linkedMerchantStoreId) {
      this.globalData.merchantStoreId = linkedMerchantStoreId;
    }

    if (user.isMerchant) {
      this.ensureMerchantStore().then((shop) => {
        if (shop && shop.store_id) {
          this.globalData.merchantStoreId = shop.store_id;
        }
      });
    } else if (
      !isMerchantPending(user)
      && !isMerchantRejected(user)
      && !isMerchantDisabled(user)
    ) {
      // 待审/已拒绝/已关闭仍需保留店铺缓存（驳回理由、重新提交、关闭原因）
      this.clearMerchantLocalCache();
    }

    applyTabShell();
    return Promise.resolve(isMerchant ? 'merchant' : 'user');
  },

  forceRefreshRole() {
    wx.removeStorageSync(STORAGE_KEYS.USER);
    this.globalData.userInfo = null;
    this.globalData.role = 'user';
    this.globalData.isMerchant = false;
    this.globalData.apiReady = false;
    this._userInfoFetchedAt = 0;
    return this.ensureCloudAndLogin();
  },

  ensureCloudAndLogin(options = {}) {
    if (!this.globalData.env) {
      this.globalData.lastApiError = 'API 未配置，请检查 config/api.js';
      return this.silentLogin(options);
    }
    return this.silentLogin(options);
  },

  silentLogin(options = {}) {
    const force = !!(options && options.force);
    if (this._silentLoginPromise && !force) {
      return this._silentLoginPromise;
    }
    if (this._silentLoginPromise && force) {
      return this._silentLoginPromise
        .finally(() => {
          this._silentLoginPromise = null;
          this._userInfoFetchedAt = 0;
        })
        .then(() => this.silentLogin({ force: true }));
    }
    this._silentLoginPromise = this._doSilentLogin(force).finally(() => {
      this._silentLoginPromise = null;
    });
    return this._silentLoginPromise;
  },

  _hasCachedUser() {
    const cached = this.globalData.userInfo;
    return !!(cached && cached.openid);
  },

  _isUserInfoFresh() {
    return !!(this._userInfoFetchedAt && Date.now() - this._userInfoFetchedAt < USER_INFO_TTL);
  },

  _resolveCachedRole() {
    const cached = this.globalData.userInfo || {};
    if (this.globalData.role) return this.globalData.role;
    return cached.isMerchant ? 'merchant' : 'user';
  },

  _backgroundRefreshUser() {
    if (this._backgroundRefreshPromise) {
      return this._backgroundRefreshPromise;
    }
    this._backgroundRefreshPromise = auth.getUserInfo()
      .then((res) => {
        if (res.success && res.user) {
          this.globalData.lastApiError = '';
          this.globalData.apiReady = true;
          this._userInfoFetchedAt = Date.now();
          const meta = {
            requestOpenid: res.requestOpenid,
            matchedCount: res.matchedCount,
            dbIsMerchant: res.dbIsMerchant
          };
          return this._applyRemoteUser(res.user, meta);
        }
        return this._resolveCachedRole();
      })
      .catch((err) => {
        console.error('[API] 后台刷新用户失败', err);
        return this._resolveCachedRole();
      })
      .finally(() => {
        this._backgroundRefreshPromise = null;
      });
    return this._backgroundRefreshPromise;
  },

  _fetchCloudUser() {
    return auth.getUserInfo()
      .then((res) => {
        if (res.success && res.user) {
          this.globalData.lastApiError = '';
          this.globalData.apiReady = true;
          this._userInfoFetchedAt = Date.now();
          if (res.deduped) {
            console.log('[auth] 已自动合并重复用户记录');
          }
          const meta = {
            requestOpenid: res.requestOpenid,
            matchedCount: res.matchedCount,
            dbIsMerchant: res.dbIsMerchant
          };
          return this._applyRemoteUser(res.user, meta);
        }
        return this._resolveCachedRole();
      });
  },

  _doSilentLogin(force = false) {
    if (!this.globalData.env) {
      this.globalData.role = 'user';
      this.globalData.isMerchant = false;
      this.globalData.lastApiError = this.globalData.lastApiError || 'API 未连接';
      if (!this.globalData.userInfo) {
        this.globalData.userInfo = { nickName: '微信用户', role: 'user', isMerchant: false, merchantStatus: '' };
      }
      return Promise.resolve('user');
    }

    const afterLogin = () => {
      if (this._hasCachedUser()) {
        this.globalData.isLoggedIn = true;
        if (!force && this._isUserInfoFresh()) {
          return Promise.resolve(this._resolveCachedRole());
        }
        if (force) {
          return this._fetchCloudUser();
        }
        this._backgroundRefreshUser();
        return Promise.resolve(this._resolveCachedRole());
      }

      return this._fetchCloudUser()
        .catch((err) => {
          const errMsg = (err && (err.errMsg || err.message)) || '接口调用异常';
          this.globalData.lastApiError = errMsg;
          console.error('[API] silentLogin 失败', err);
          this.globalData.role = 'user';
          this.globalData.isMerchant = false;
          applyTabShell();
          return 'user';
        });
    };

    return ensureLogin(force).then(afterLogin).catch((err) => {
      const errMsg = (err && (err.errMsg || err.message)) || '登录失败';
      this.globalData.lastApiError = errMsg;
      console.error('[API] ensureLogin 失败', err);
      this.globalData.role = 'user';
      this.globalData.isMerchant = false;
      if (!this.globalData.userInfo) {
        this.globalData.userInfo = { nickName: '微信用户', role: 'user', isMerchant: false, merchantStatus: '' };
      }
      applyTabShell();
      return 'user';
    });
  },

  isMerchantApproved() {
    return isMerchantApproved(this.globalData.userInfo);
  },

  isMerchantPending() {
    return isMerchantPending(this.globalData.userInfo);
  },

  isMerchantDisabled() {
    return isMerchantDisabled(this.globalData.userInfo);
  },

  isMerchantDemoMode() {
    return merchantDemo.isMerchantDemoMode(this.globalData.userInfo);
  },

  canAccessMerchantBackend() {
    const user = this.globalData.userInfo;
    if (isMerchantApproved(user)) return true;
    if (merchantDemo.isMerchantDemoMode(user)) return true;
    if (isMerchantPending(user) || isMerchantRejected(user) || isMerchantDisabled(user)) return true;
    return false;
  },

  isStoreOwner() {
    if ((this.globalData.merchantAccessRole || '') === 'staff') return false;
    return isStoreOwner(this.globalData.userInfo);
  },

  isMerchantStaffUser() {
    if ((this.globalData.merchantAccessRole || '') === 'staff') return true;
    return isMerchantStaff(this.globalData.userInfo);
  },

  _parseStaffInviteStoreId(options) {
    if (!options) return '';
    const query = options.query || options;
    const flag = query.staff_invite;
    const isInvite = flag === '1' || flag === 1 || flag === true || flag === 'true';
    const storeId = (query.store_id || this._extractStoreId(options) || '').trim();
    return isInvite && storeId ? storeId : '';
  },

  isStaffForStore(storeId) {
    const user = this.globalData.userInfo || this.getData(STORAGE_KEYS.USER) || {};
    return isStaffOfStore(user, storeId);
  },

  _keepStaffMerchantMode() {
    this.globalData.role = 'merchant';
    this.globalData.isMerchant = true;
    if (this.globalData.userInfo) {
      this.globalData.userInfo = {
        ...this.globalData.userInfo,
        role: 'merchant',
        isMerchant: true,
        merchantRole: 'staff'
      };
      this.setData(STORAGE_KEYS.USER, this.globalData.userInfo);
    }
    applyTabShell();
  },

  acceptStaffInvite(storeId) {
    const id = (storeId || '').trim();
    if (!id) return Promise.resolve(false);
    if (!this.globalData.env) {
      wx.showToast({ title: '请先配置 API 地址', icon: 'none' });
      return Promise.resolve(false);
    }
    if (this.isStaffForStore(id) || (this._staffInviteHandled && this._staffInviteHandled[id])) {
      return Promise.resolve(true);
    }
    if (this._staffInviteInFlight === id && this._staffInvitePromise) {
      return this._staffInvitePromise;
    }

    const wasAlreadyStaff = this.isStaffForStore(id);
    this._userInfoFetchedAt = 0;
    this._staffInviteInFlight = id;
    this._staffInvitePromise = storeApi.acceptStaffInvite(id)
      .then((res) => {
        if (!res || !res.success) {
          wx.showToast({ title: (res && res.errMsg) || '加入失败', icon: 'none' });
          return false;
        }
        if (res.accessRole) {
          this.globalData.merchantAccessRole = res.accessRole;
        }
        if (res.store) {
          this.saveShop(res.store);
          this.globalData.merchantStoreId = res.store.store_id;
        }
        return this.forceRefreshRole().then(() => {
          this.globalData.role = 'merchant';
          this.globalData.isMerchant = true;
          applyTabShell();
          this._merchantStoreFetchedAt = 0;
          if (!wasAlreadyStaff) {
            wx.showToast({ title: res.alreadyOwner ? '您已是店铺负责人' : '已获得员工权限', icon: 'success' });
          }
          this._staffInviteHandled = this._staffInviteHandled || {};
          this._staffInviteHandled[id] = true;
          return true;
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' });
        return false;
      })
      .finally(() => {
        if (this._staffInviteInFlight === id) {
          this._staffInviteInFlight = '';
          this._staffInvitePromise = null;
        }
      });

    return this._staffInvitePromise;
  },

  refreshUserRole() {
    return this.silentLogin();
  },

  getData(key) {
    return this.globalData[key] || wx.getStorageSync(key) || null;
  },

  setData(key, value) {
    this.globalData[key] = value;
    // 大列表走异步节流落盘，避免主线程被 setStorageSync 卡住
    if (ASYNC_STORAGE_KEYS[key]) {
      this._schedulePersist(key, value);
      return;
    }
    wx.setStorageSync(key, value);
  },

  _schedulePersist(key, value) {
    if (!this._pendingStorage) this._pendingStorage = {};
    this._pendingStorage[key] = value;
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      const pending = this._pendingStorage || {};
      this._pendingStorage = {};
      Object.keys(pending).forEach((k) => {
        try {
          wx.setStorage({ key: k, data: pending[k] });
        } catch (err) {
          try {
            wx.setStorageSync(k, pending[k]);
          } catch (e) {
            // ignore
          }
        }
      });
    }, STORAGE_PERSIST_MS);
  },

  /** 立即刷盘（退出登录 / 清缓存前调用） */
  _flushPendingStorage() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    const pending = this._pendingStorage || {};
    this._pendingStorage = {};
    Object.keys(pending).forEach((k) => {
      try {
        wx.setStorageSync(k, pending[k]);
      } catch (err) {
        // ignore
      }
    });
  },

  clearMerchantLocalCache() {
    this.globalData.merchantStoreId = '';
    this._merchantStoreFetchedAt = 0;
    this.setData(STORAGE_KEYS.SHOP, {});
  },

  clearLocalAppCache() {
    this._flushPendingStorage();
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        wx.removeStorageSync(key);
      } catch (err) {
        // ignore
      }
      this.globalData[key] = null;
    });
    clearImageFileCache();

    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.role = 'user';
    this.globalData.isMerchant = false;
    this.globalData.storeId = '';
    this._ordersDisplayCache = null;
    this.globalData.currentStore = null;
    this.globalData.merchantStoreId = '';
    this.globalData.pendingEntryStoreId = '';
    this.globalData.pendingStaffInviteStoreId = '';
    this.globalData.merchantAccessRole = '';
    this._userInfoFetchedAt = 0;
    this._ordersFetchedAt = 0;
    this._petsFetchedAt = 0;
    this._dailyLogsFetchedAt = 0;
    this._merchantStoreFetchedAt = 0;
    this._loadOrdersPromise = null;
    this._loadPetsPromise = null;
    this._loadDailyLogsPromise = null;
    this._merchantStorePromise = null;
    this._silentLoginPromise = null;
    this._backgroundRefreshPromise = null;
    this._staffInviteHandled = {};
    this._staffInviteInFlight = '';
    this._staffInvitePromise = null;

    return this.ensureCloudAndLogin().then(() => {
      applyTabShell();
      return true;
    });
  },

  updateProfile(userInfo) {
    const user = {
      ...(this.globalData.userInfo || {}),
      ...userInfo,
      createTime: this.globalData.userInfo?.createTime || Date.now()
    };
    this.globalData.userInfo = user;
    this.globalData.isLoggedIn = true;
    this.setData(STORAGE_KEYS.USER, user);

    return auth.syncProfile(userInfo)
      .then((res) => {
        if (res.success && res.user) {
          return this._applyRemoteUser(res.user);
        }
        return this.globalData.role;
      })
      .catch((err) => {
        console.error('updateProfile failed', err);
        return this.globalData.role;
      });
  },

  login(userInfo) {
    return this.updateProfile(userInfo);
  },

  getPets() {
    if (this.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      return merchantDemo.getDemoPets();
    }
    const raw = this.getData(STORAGE_KEYS.PETS);
    return Array.isArray(raw) ? raw : [];
  },

  _cachePets(pets) {
    this.setData(STORAGE_KEYS.PETS, pets || []);
  },

  _upsertLocalPet(pet) {
    const pets = this.getPets();
    const idx = pets.findIndex((p) => p.id === pet.id);
    if (idx >= 0) pets[idx] = pet;
    else pets.push(pet);
    this._cachePets(pets);
  },

  _syncUserPetIds(petId, action = 'add') {
    const user = this.globalData.userInfo;
    if (!user || !petId) return;
    const current = Array.isArray(user.pet_ids) ? user.pet_ids : [];
    const pet_ids = action === 'remove'
      ? current.filter((id) => id !== petId)
      : current.includes(petId) ? current : [...current, petId];
    this.globalData.userInfo = { ...user, pet_ids };
    this.setData(STORAGE_KEYS.USER, this.globalData.userInfo);
  },

  _mergePetList(localPets, remotePets) {
    const map = new Map();
    const put = (pet) => {
      if (!pet) return;
      const id = pet.id || pet.pet_id;
      if (!id) return;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, { ...pet, id });
        return;
      }
      map.set(id, {
        ...existing,
        ...pet,
        id,
        weight: pet.weight || existing.weight,
        updateTime: Math.max(pet.updateTime || 0, existing.updateTime || 0)
      });
    };
    (localPets || []).forEach(put);
    (remotePets || []).forEach(put);
    return Array.from(map.values()).sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));
  },

  loadPets(options = {}) {
    const force = !!(options && options.force);
    const localPets = this.getPets();
    if (!this.globalData.env) {
      return Promise.resolve(localPets);
    }
    if (!force && this._petsFetchedAt && Date.now() - this._petsFetchedAt < PETS_TTL) {
      return Promise.resolve(localPets);
    }
    if (this._loadPetsPromise) {
      return this._loadPetsPromise;
    }
    this._loadPetsPromise = petApi.listPets()
      .then((res) => {
        if (res.success && Array.isArray(res.pets)) {
          if (!res.pets.length && localPets.length) {
            return localPets;
          }
          const merged = this._mergePetList(localPets, res.pets);
          this._cachePets(merged);
          this._petsFetchedAt = Date.now();
          return merged;
        }
        return localPets;
      })
      .catch((err) => {
        console.error('[宠物] 拉取服务端档案失败', err);
        return localPets;
      })
      .finally(() => {
        this._loadPetsPromise = null;
      });
    return this._loadPetsPromise;
  },

  savePet(pet) {
    if (!this.globalData.env) {
      return Promise.reject(new Error('API 未连接，无法保存'));
    }
    return petApi.savePet(pet)
      .then((res) => {
        if (!res.success || !res.pet) {
          throw new Error(res.errMsg || '保存失败');
        }
        this._upsertLocalPet(res.pet);
        this._syncUserPetIds(res.pet.id, 'add');
        this._petsFetchedAt = 0;
        return res.pet;
      });
  },

  deletePet(id) {
    if (!this.globalData.env) {
      return Promise.reject(new Error('API 未连接，无法删除'));
    }
    return petApi.deletePet(id)
      .then((res) => {
        if (!res.success) {
          throw new Error(res.errMsg || '删除失败');
        }
        this._cachePets(this.getPets().filter((p) => p.id !== id));
        this._syncUserPetIds(id, 'remove');
        this._petsFetchedAt = 0;
      });
  },

  getOrders() {
    if (this.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      return merchantDemo.getDemoOrders();
    }
    if (Array.isArray(this._ordersDisplayCache)) {
      return this._ordersDisplayCache;
    }
    const raw = this.getData(STORAGE_KEYS.ORDERS);
    const list = Array.isArray(raw) ? raw : [];
    const orders = list.map(attachOrderDisplayNo);
    this._ordersDisplayCache = orders;
    return orders;
  },

  _cacheOrders(orders) {
    const list = Array.isArray(orders) ? orders : [];
    const normalized = list.map(attachOrderDisplayNo);
    this._ordersDisplayCache = normalized;
    this.setData(STORAGE_KEYS.ORDERS, normalized);
  },

  _upsertLocalOrder(order) {
    if (!order || !order.id) return;
    const normalized = attachOrderDisplayNo(order);
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => o.id === normalized.id);
    if (idx >= 0) orders[idx] = normalized;
    else orders.push(normalized);
    this._cacheOrders(orders);
  },

  loadOrders(options = {}) {
    const force = !!(options && options.force);
    if (this.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      return Promise.resolve(merchantDemo.getDemoOrders());
    }
    if (!this.globalData.env) {
      return Promise.resolve(this.getOrders());
    }
    if (!force && this._ordersFetchedAt && Date.now() - this._ordersFetchedAt < ORDERS_TTL) {
      return Promise.resolve(this.getOrders());
    }
    if (this._loadOrdersPromise) {
      return this._loadOrdersPromise;
    }

    const loader = this.globalData.isMerchant
      ? (() => {
        const storeId = this.globalData.merchantStoreId
          || (this.getShop() && this.getShop().store_id);
        if (storeId) {
          return orderApi.listMerchantOrders(storeId);
        }
        return this.ensureMerchantStore().then((shop) => {
          const sid = (shop && shop.store_id) || this.globalData.merchantStoreId;
          if (!sid) return { success: false };
          return orderApi.listMerchantOrders(sid);
        });
      })()
      : orderApi.listUserOrders();

    this._loadOrdersPromise = loader
      .then((res) => {
        if (res && res.success && Array.isArray(res.orders)) {
          this._cacheOrders(res.orders);
          this._ordersFetchedAt = Date.now();
          return res.orders;
        }
        if (res && res.errMsg) {
          console.error('[订单] 拉取服务端订单失败', res.errMsg);
        }
        return this.getOrders();
      })
      .catch((err) => {
        console.error('[订单] 拉取服务端订单失败', err);
        return this.getOrders();
      })
      .finally(() => {
        this._loadOrdersPromise = null;
      });
    return this._loadOrdersPromise;
  },

  patchDailyLogs(logs) {
    this.setData(STORAGE_KEYS.DAILY_LOGS, dedupeDailyLogs(logs || []));
  },

  saveOrder(order) {
    const userProfile = this.globalData.userInfo || {};
    if (!this.globalData.env) {
      return Promise.resolve(this._saveOrderLocal(order));
    }
    return orderApi.createOrder(order, userProfile)
      .then((res) => {
        if (res && res.success && res.order) {
          this._upsertLocalOrder(res.order);
          this._ordersFetchedAt = 0;
          return res.order;
        }
        const errMsg = (res && res.errMsg) || '创建订单失败';
        console.error('[订单] 创建失败', errMsg, res);
        throw new Error(errMsg);
      })
      .catch((err) => {
        if (err && err.message) throw err;
        throw new Error((err && err.errMsg) || '创建订单失败');
      });
  },

  _saveOrderLocal(order) {
    const orders = this.getOrders();
    if (order.id) {
      const idx = orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) orders[idx] = order;
      else orders.push(order);
    } else {
      const shop = this.getShop() || {};
      const storeDisplayNo = shop.displayNo || order.storeDisplayNo || '';
      order.id = `ord_${Date.now()}`;
      order.displayNo = order.displayNo || buildOrderDisplayNo(storeDisplayNo);
      order.status = order.status || 'pending';
      order.createTime = Date.now();
      orders.push(order);
    }
    this._cacheOrders(orders);
    return order;
  },

  updateOrder(id, updates) {
    const applyLocal = () => {
      const orders = this.getOrders();
      const idx = orders.findIndex((o) => o.id === id);
      if (idx >= 0) {
        Object.assign(orders[idx], updates);
        if (this.isMerchantDemoMode()) {
          wx.setStorageSync(STORAGE_KEYS.DEMO_ORDERS, orders);
        } else {
          this._cacheOrders(orders);
        }
        return orders[idx];
      }
      return null;
    };

    if (this.isMerchantDemoMode()) {
      return Promise.resolve(merchantDemo.updateDemoOrder(id, updates));
    }

    if (merchantDemo.isDemoEntityId(id)) {
      return Promise.resolve(null);
    }

    if (!this.globalData.env) {
      return Promise.resolve(applyLocal());
    }

    return orderApi.updateOrder(id, updates)
      .then((res) => {
        if (res.success && res.order) {
          this._upsertLocalOrder(res.order);
          this._ordersFetchedAt = 0;
          return res.order;
        }
        throw new Error(res.errMsg || '更新订单失败');
      });
  },

  getBills() { return this.getData(STORAGE_KEYS.BILLS) || []; },

  saveBill(bill) {
    const bills = this.getBills();
    bill.id = 'bill_' + Date.now();
    bill.createTime = Date.now();
    bills.push(bill);
    this.setData(STORAGE_KEYS.BILLS, bills);
    return bill;
  },

  getContracts() {
    if (this.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      return merchantDemo.getDemoContracts();
    }
    return this.getData(STORAGE_KEYS.CONTRACTS) || [];
  },

  getContractByOrderId(orderId) {
    const contracts = this.getContracts();
    return contracts.find((c) => c.orderId === orderId) || null;
  },

  getContractById(id) {
    return this.getContracts().find((c) => c.id === id) || null;
  },

  saveContract(contract) {
    if (this.isMerchantDemoMode()) {
      return merchantDemo.saveDemoContract(contract);
    }
    const contracts = this.getData(STORAGE_KEYS.CONTRACTS) || [];
    if (!contract.id) contract.id = 'ctr_' + Date.now();
    contract.createTime = contract.createTime || Date.now();
    const idx = contracts.findIndex((c) => c.id === contract.id);
    if (idx >= 0) contracts[idx] = contract;
    else contracts.push(contract);
    this.setData(STORAGE_KEYS.CONTRACTS, contracts);
    return contract;
  },

  updateContract(id, updates) {
    if (this.isMerchantDemoMode()) {
      const contracts = merchantDemo.getDemoContracts();
      const idx = contracts.findIndex((c) => c.id === id);
      if (idx >= 0) {
        Object.assign(contracts[idx], updates);
        wx.setStorageSync(STORAGE_KEYS.DEMO_CONTRACTS, contracts);
      }
      return;
    }
    const contracts = this.getContracts();
    const idx = contracts.findIndex((c) => c.id === id);
    if (idx >= 0) {
      Object.assign(contracts[idx], updates);
      this.setData(STORAGE_KEYS.CONTRACTS, contracts);
    }
  },

  getDailyLogs() {
    if (this.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      return merchantDemo.getDemoDailyLogs();
    }
    return this.getData(STORAGE_KEYS.DAILY_LOGS) || [];
  },

  saveDailyLog(log) {
    if (this.isMerchantDemoMode()) {
      return Promise.resolve(merchantDemo.saveDemoDailyLog(log));
    }
    if (!this.globalData.env) {
      return Promise.resolve(this._saveDailyLogLocal(log));
    }
    return dailyApi.saveDailyLog(log)
      .then((res) => {
        if (res.success && res.log) {
          const merged = { ...log, ...res.log };
          if (log.isScheduled || log.status === 'scheduled' || log.scheduledAt) {
            merged.isScheduled = true;
            merged.status = merged.status === 'published' ? merged.status : 'scheduled';
            merged.scheduledAt = Number(merged.scheduledAt) || Number(log.scheduledAt) || 0;
          }
          this._upsertLocalDailyLog(merged);
          return { ...res, log: merged };
        }
        throw new Error(res.errMsg || '打卡失败');
      });
  },

  updateDailyLog(log) {
    const id = String((log && (log.id || log.log_id)) || '').trim();
    if (!id) return Promise.reject(new Error('缺少打卡记录'));

    if (this.isMerchantDemoMode()) {
      const updated = merchantDemo.updateDemoDailyLog(log);
      if (!updated) return Promise.reject(new Error('仅未发送的定时打卡可修改'));
      return Promise.resolve({ success: true, log: updated, scheduled: true });
    }
    if (!this.globalData.env) {
      const logs = this.getDailyLogs();
      const idx = logs.findIndex((item) => getLogId(item) === id);
      if (idx < 0) return Promise.reject(new Error('打卡记录不存在'));
      const target = logs[idx];
      if (!(target.status === 'scheduled' || target.isScheduled)) {
        return Promise.reject(new Error('仅未发送的定时打卡可修改'));
      }
      const merged = {
        ...target,
        ...log,
        id,
        log_id: id,
        status: 'scheduled',
        isScheduled: true,
        updateTime: Date.now()
      };
      const next = logs.slice();
      next[idx] = merged;
      this.setData(STORAGE_KEYS.DAILY_LOGS, dedupeDailyLogs(next));
      this._dailyLogsFetchedAt = 0;
      return Promise.resolve({ success: true, log: merged, scheduled: true });
    }

    return dailyApi.updateDailyLog(log)
      .then((res) => {
        if (res.success && res.log) {
          const merged = {
            ...log,
            ...res.log,
            isScheduled: true,
            status: 'scheduled',
            scheduledAt: Number(res.log.scheduledAt) || Number(log.scheduledAt) || 0
          };
          this._upsertLocalDailyLog(merged);
          return { ...res, log: merged };
        }
        throw new Error((res && res.errMsg) || '修改失败');
      });
  },

  deleteDailyLog(logId) {
    const id = String(logId || '').trim();
    if (!id) return Promise.reject(new Error('缺少打卡记录'));

    if (this.isMerchantDemoMode()) {
      const ok = merchantDemo.deleteDemoDailyLog(id);
      if (!ok) return Promise.reject(new Error('仅未发送的定时打卡可删除'));
      return Promise.resolve({ success: true, logId: id });
    }
    if (!this.globalData.env) {
      const logs = this.getDailyLogs();
      const target = logs.find((item) => getLogId(item) === id);
      if (!target || !(target.status === 'scheduled' || target.isScheduled)) {
        return Promise.reject(new Error('仅未发送的定时打卡可删除'));
      }
      this.setData(
        STORAGE_KEYS.DAILY_LOGS,
        dedupeDailyLogs(logs.filter((item) => getLogId(item) !== id))
      );
      this._dailyLogsFetchedAt = 0;
      return Promise.resolve({ success: true, logId: id });
    }

    return dailyApi.deleteDailyLog(id)
      .then((res) => {
        if (!res || !res.success) {
          throw new Error((res && res.errMsg) || '删除失败');
        }
        const logs = this.getDailyLogs();
        this.setData(
          STORAGE_KEYS.DAILY_LOGS,
          dedupeDailyLogs(logs.filter((item) => getLogId(item) !== id))
        );
        this._dailyLogsFetchedAt = 0;
        return res;
      });
  },

  _upsertLocalDailyLog(log) {
    if (!log || !getLogId(log)) return;
    const logs = dedupeDailyLogs(this.getDailyLogs().filter((item) => getLogId(item) !== getLogId(log)));
    logs.push(log);
    this.setData(STORAGE_KEYS.DAILY_LOGS, dedupeDailyLogs(logs));
    this._dailyLogsFetchedAt = 0;
  },

  _saveDailyLogLocal(log) {
    const logs = this.getDailyLogs();
    log.id = log.id || `log_${Date.now()}`;
    log.createTime = log.createTime || Date.now();
    logs.push(log);
    this.setData(STORAGE_KEYS.DAILY_LOGS, logs);
    return log;
  },

  loadDailyLogs(orderId) {
    const matchOrder = (item) => item.orderId === orderId || item.order_id === orderId;
    if (this.isMerchantDemoMode() || !this.globalData.env || !orderId) {
      return Promise.resolve(dedupeDailyLogs(this.getDailyLogs().filter(matchOrder)));
    }
    return dailyApi.listDailyLogs(orderId)
      .then((res) => {
        if (!res.success || !Array.isArray(res.logs)) {
          return dedupeDailyLogs(this.getDailyLogs().filter(matchOrder));
        }
        const others = this.getDailyLogs().filter((item) => !matchOrder(item));
        const merged = dedupeDailyLogs(others.concat(res.logs));
        this.setData(STORAGE_KEYS.DAILY_LOGS, merged);
        return dedupeDailyLogs(res.logs);
      })
      .catch((err) => {
        console.error('[打卡] 拉取服务端记录失败', err);
        return dedupeDailyLogs(this.getDailyLogs().filter(matchOrder));
      });
  },

  loadDailyLogsForOrders(orderIds, options = {}) {
    const force = !!(options && options.force);
    const ids = [...new Set((orderIds || []).filter(Boolean))];
    const filterScoped = () => {
      const idSet = new Set(ids);
      return dedupeDailyLogs(
        this.getDailyLogs().filter((item) => idSet.has(item.orderId || item.order_id))
      );
    };

    if (!ids.length) {
      return Promise.resolve(dedupeDailyLogs(this.getDailyLogs()));
    }
    if (this.isMerchantDemoMode() || !this.globalData.env) {
      return Promise.resolve(filterScoped());
    }
    if (!force && this._dailyLogsFetchedAt && Date.now() - this._dailyLogsFetchedAt < DAILY_LOGS_TTL) {
      return Promise.resolve(filterScoped());
    }
    if (!force && this._loadDailyLogsPromise) {
      return this._loadDailyLogsPromise;
    }

    this._loadDailyLogsPromise = dailyApi.fetchDailyLogsForOrders(ids)
      .then((fetched) => {
        const idSet = new Set(ids);
        const others = this.getDailyLogs().filter((item) => {
          const oid = item.orderId || item.order_id;
          return !oid || !idSet.has(oid);
        });
        const merged = dedupeDailyLogs(others.concat(fetched || []));
        this.setData(STORAGE_KEYS.DAILY_LOGS, merged);
        this._dailyLogsFetchedAt = Date.now();
        return filterScoped();
      })
      .catch((err) => {
        console.error('[打卡] 批量拉取记录失败', err);
        return filterScoped();
      })
      .finally(() => {
        this._loadDailyLogsPromise = null;
      });
    return this._loadDailyLogsPromise;
  },

  getChats() { return this.getData(STORAGE_KEYS.CHATS) || []; },

  saveChat(msg) {
    const chats = this.getChats();
    msg.id = 'msg_' + Date.now();
    msg.time = Date.now();
    chats.push(msg);
    this.setData(STORAGE_KEYS.CHATS, chats);
    return msg;
  },

  getShop() {
    if (
      this.isMerchantDemoMode()
      && !this.isMerchantPending()
      && !isMerchantRejected(this.globalData.userInfo)
      && !this.isMerchantDisabled()
    ) {
      merchantDemo.ensureDemoData();
      return attachStoreDisplayNo(merchantDemo.getDemoShop());
    }
    return attachStoreDisplayNo(this.getData(STORAGE_KEYS.SHOP) || {});
  },

  saveShop(shop) {
    const normalized = attachStoreDisplayNo(shop || {});
    if (
      this.isMerchantDemoMode()
      && !this.isMerchantPending()
      && !isMerchantRejected(this.globalData.userInfo)
      && !this.isMerchantDisabled()
    ) {
      const saved = merchantDemo.saveDemoShop(normalized);
      this.globalData.merchantStoreId = saved.store_id;
      this._merchantStoreFetchedAt = Date.now();
      return attachStoreDisplayNo(saved);
    }
    this.setData(STORAGE_KEYS.SHOP, normalized);
    if (normalized && normalized.store_id) {
      this.globalData.merchantStoreId = normalized.store_id;
      this._merchantStoreFetchedAt = Date.now();
    }
    return normalized;
  },

  getBillingRules() {
    return this.getData(STORAGE_KEYS.BILLING_RULES) || this._defaultBillingRules();
  },

  saveBillingRules(rules) { this.setData(STORAGE_KEYS.BILLING_RULES, rules); },

  _defaultBillingRules() {
    return {
      billingMode: 'weight',
      timeMode: 'daily',
      weightPricing: getDefaultWeightPricing(),
      roomPricing: getDefaultRoomPricing(),
      checkInDayCharge: 'full',
      departureDayCharge: 'full',
      departureCharge: {
        freeUntil: '12:00',
        halfUntil: '18:00',
        fullFrom: '18:00'
      },
      pricing: { cat: 60, smallDog: 80, midDog: 100, largeDog: 150, other: 50 },
      holidayRate: 1.5,
      overtimeRate: 20,
      extras: { pickup: 30, medicine: 20, wash: 80, extraMeal: 15, walk: 25, specialCare: 50 }
    };
  },

  getContractTemplate() { return this.getData(STORAGE_KEYS.CONTRACT_TEMPLATE) || ''; },

  saveContractTemplate(tpl) { this.setData(STORAGE_KEYS.CONTRACT_TEMPLATE, tpl); }
});
