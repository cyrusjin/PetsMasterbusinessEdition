const { STORAGE_KEYS } = require('./utils/constants');
const { getDefaultWeightPricing } = require('./utils/weightPricing');
const { getDefaultRoomPricing } = require('./utils/roomPricing');
const { getDefaultCustomPricing } = require('./utils/customPricing');
const { getDefaultHolidayPricing } = require('./utils/legalHolidays');
const auth = require('./utils/auth');
const storeApi = require('./utils/store');
const { API_BASE_URL } = require('./config/api');
const { ensureLogin } = require('./utils/api');
const { normalizeIsMerchant, resolveRole, isMerchantApproved, isMerchantPending, isMerchantRejected, isMerchantDisabled, isMerchantStaff, isStaffOfStore, isStoreOwner, getMerchantStoreId, getVisitStoreId, hasMerchantCapability } = require('./utils/role');
const { applyRoleShell: applyTabShell, getMerchantLandingUrl, getUserLandingUrl, isUserTabRoute } = require('./utils/shell');
const { mergeBillingRules, buildUserStoreView, prepareUserStoreView } = require('./utils/storeContext');
const storeDebug = require('./utils/storeDebug');
const petApi = require('./utils/pet');
const orderApi = require('./utils/order');
const dailyApi = require('./utils/daily');
const { dedupeDailyLogs, getLogId } = require('./utils/dailyLogUtil');
const merchantDemo = require('./utils/merchantDemo');
const { mergeMerchantShop } = require('./utils/storeSync');
const { clearImageFileCache } = require('./utils/imageCache');
const { attachOrderDisplayNo, attachStoreDisplayNo, buildOrderDisplayNo } = require('./utils/displayNo');
const badgeUtil = require('./utils/badge');
const userFeed = require('./utils/userFeed');
const {
  fetchRemoteAppConfig,
  applyRemoteConfigToApp,
  isMerchantUiBlocked
} = require('./utils/merchantSwitch');

const USER_INFO_TTL = 5 * 60 * 1000;
const ORDERS_TTL = 60 * 1000;
const DAILY_LOGS_TTL = 60 * 1000;
const PETS_TTL = 2 * 60 * 1000;
const MERCHANT_STORE_TTL = 30 * 1000;
const STORE_BIND_TTL = 5 * 60 * 1000;
const STORAGE_PERSIST_MS = 3 * 1000;
const ASYNC_STORAGE_KEYS = {
  [STORAGE_KEYS.ORDERS]: true,
  [STORAGE_KEYS.USER_ORDERS]: true,
  [STORAGE_KEYS.MERCHANT_ORDERS]: true,
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
    pendingSharedDailyLogId: '',
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
    // 提前拉取商家入口开关与审核态，供首页与冷启动路由使用
    fetchRemoteAppConfig().then((cfg) => {
      applyRemoteConfigToApp(this, cfg);
    });
    // 标记冷启动：紧随其后的 onShow 不再重复 bootstrap
    this._skipNextAppShowBootstrap = true;
    this._bootstrapSession(options, { force: true });
  },

  onShow(options) {
    storeDebug.logEntryOptions('App onShow', options);
    if (this._skipNextAppShowBootstrap) {
      this._skipNextAppShowBootstrap = false;
      // 冷启动 onShow 偶发比 onLaunch 带更完整 query：先记下分享/员工邀请
      const entry = this._normalizeEntryOptions(options);
      const staffInviteId = this._parseStaffInviteStoreId(entry);
      if (staffInviteId && !this.shouldIgnoreShareEntry()) {
        this.globalData.pendingStaffInviteStoreId = staffInviteId;
        this.globalData.pendingEntryStoreId = '';
        this._exitUserClientMode();
      } else {
        this._rememberShareEntryStore(entry);
        if (this._rememberShareEntryDailyLog(entry) && !this._extractStoreId(entry)) {
          this._enterUserClientMode('', { persist: true, applyShell: false });
        }
      }
      return;
    }
    // 前后台切换走 TTL，避免每次强制登录打穿缓存
    this._bootstrapSession(options, { force: false });
  },

  /** 合并 App / 进入参数，兼容 tabBar 分享时 query 只在一侧出现 */
  _normalizeEntryOptions(options) {
    const base = options || {};
    if (
      this._extractStoreId(base)
      || this._parseStaffInviteStoreId(base)
      || this._isMerchantApplyEntry(base)
      || this._extractDailyLogId(base)
    ) {
      return base;
    }
    try {
      const enter = typeof wx.getEnterOptionsSync === 'function' ? (wx.getEnterOptionsSync() || {}) : {};
      if (
        this._extractStoreId(enter)
        || this._parseStaffInviteStoreId(enter)
        || this._isMerchantApplyEntry(enter)
        || this._extractDailyLogId(enter)
      ) {
        return this._mergeEntryOptions(base, enter);
      }
      const launch = typeof wx.getLaunchOptionsSync === 'function' ? (wx.getLaunchOptionsSync() || {}) : {};
      if (
        this._extractStoreId(launch)
        || this._parseStaffInviteStoreId(launch)
        || this._isMerchantApplyEntry(launch)
        || this._extractDailyLogId(launch)
      ) {
        return this._mergeEntryOptions(base, launch);
      }
    } catch (err) {
      // ignore
    }
    return base;
  },

  /** 商家入驻小程序码 / 申请页入口（含 getwxacodeunlimit 的 scene） */
  _getEntrySceneStr(options) {
    const query = (options && (options.query || options)) || {};
    const raw = query.scene != null ? query.scene : '';
    if (raw === '' || raw == null) return '';
    try {
      return decodeURIComponent(String(raw)).trim();
    } catch (err) {
      return String(raw).trim();
    }
  },

  _isMerchantApplyEntry(options) {
    const opts = options || {};
    const path = String(opts.path || opts.route || '').replace(/^\//, '');
    // 历史入驻页，或门店授权页带入驻 scene
    if (
      path === 'pages/merchant/apply/apply'
      || path.indexOf('pages/merchant/apply/apply?') === 0
    ) {
      return true;
    }
    const scene = this._getEntrySceneStr(opts).toLowerCase();
    if (!scene) return false;
    const isApplyScene = scene === 'merchant_apply'
      || scene === 'apply'
      || scene.indexOf('merchant_apply') === 0
      || scene.indexOf('apply=1') >= 0;
    if (!isApplyScene) return false;
    // scene 命中即可（小程序码 page 可为 tab-store / apply）
    return true;
  },

  _mergeEntryOptions(base, extra) {
    const baseQuery = (base && (base.query || base)) || {};
    const extraQuery = (extra && (extra.query || extra)) || {};
    const query = { ...baseQuery, ...extraQuery };
    return {
      ...base,
      ...extra,
      path: (extra && extra.path) || (base && base.path) || '',
      query,
      scene: (extra && extra.scene) || (base && base.scene)
    };
  },

  _rememberShareEntryStore(options) {
    const entry = this._normalizeEntryOptions(options);
    if (this._isStaffInviteEntry(entry)) return '';
    const storeId = this._extractStoreId(entry);
    if (!storeId) return '';
    if (!this._isUserEntryPath(entry) && (entry.path || '').includes('pages/merchant/')) {
      return '';
    }
    this.globalData.pendingEntryStoreId = storeId;
    storeDebug.log('记住分享入口 store_id', { storeId });
    return storeId;
  },

  _extractDailyLogId(options) {
    if (!options) return '';
    const query = options.query || options;
    const raw = query.log_id != null ? query.log_id : query.logId;
    return String(raw || '').trim();
  },

  _rememberShareEntryDailyLog(options) {
    const entry = this._normalizeEntryOptions(options);
    const logId = this._extractDailyLogId(entry);
    if (!logId) return '';
    this.globalData.pendingSharedDailyLogId = logId;
    storeDebug.log('记住分享打卡 log_id', { logId });
    return logId;
  },

  consumePendingSharedDailyLogId() {
    const logId = String(this.globalData.pendingSharedDailyLogId || '').trim();
    this.globalData.pendingSharedDailyLogId = '';
    return logId;
  },

  peekPendingSharedDailyLogId() {
    return String(this.globalData.pendingSharedDailyLogId || '').trim();
  },

  _hydrateRoleFromUser(user) {
    if (!user) return;
    // 非正式版强制用户壳，避免已入驻账号冷启动进商家界面
    if (isMerchantUiBlocked()) {
      this.globalData.isMerchant = false;
      this.globalData.role = 'user';
      return;
    }
    if (isMerchantApproved(user) && !this.isUserClientMode()) {
      this.globalData.isMerchant = true;
      this.globalData.role = 'merchant';
      return;
    }
    if (this.isUserClientMode()) {
      this.globalData.isMerchant = hasMerchantCapability(user);
      this.globalData.role = 'user';
      return;
    }
    if (this._prefersMerchantShell(user)) {
      this.globalData.role = 'merchant';
      this.globalData.isMerchant = isMerchantApproved(user);
      return;
    }
    this.globalData.isMerchant = false;
    this.globalData.role = 'user';
  },

  _prefersMerchantShell(user) {
    // 非正式版（develop/trial/空）禁止停留商家壳，避免审核误入
    if (isMerchantUiBlocked()) return false;
    if (this.getData(STORAGE_KEYS.MERCHANT_SHELL_MODE)) return true;
    const current = user || this.globalData.userInfo || {};
    return current.role === 'merchant';
  },

  _enterMerchantShellMode(options = {}) {
    if (isMerchantUiBlocked()) {
      this._exitMerchantShellMode();
      this.globalData.role = 'user';
      return;
    }
    const { persist = true } = options;
    this.globalData.role = 'merchant';
    if (persist) {
      this.setData(STORAGE_KEYS.MERCHANT_SHELL_MODE, true);
    }
    const user = this.globalData.userInfo;
    if (user) {
      const next = { ...user, role: 'merchant' };
      this.globalData.userInfo = next;
      this.setData(STORAGE_KEYS.USER, next);
    }
  },

  _exitMerchantShellMode() {
    this.globalData[STORAGE_KEYS.MERCHANT_SHELL_MODE] = null;
    try {
      wx.removeStorageSync(STORAGE_KEYS.MERCHANT_SHELL_MODE);
    } catch (err) {
      // ignore
    }
  },

  _bootstrapSession(options, bootOptions = {}) {
    const force = !!(bootOptions && bootOptions.force);
    const entry = this._normalizeEntryOptions(options);
    const staffInviteId = this._parseStaffInviteStoreId(entry);
    const merchantApplyEntry = this._isMerchantApplyEntry(entry);
    const merchantUiBlocked = isMerchantUiBlocked();
    // 非正式版：清掉商家壳偏好，避免缓存把审核员带进商家界面
    if (merchantUiBlocked) {
      this.globalData.pendingMerchantApplyEntry = false;
      this._exitMerchantShellMode();
      this.globalData.role = 'user';
    }
    // 员工邀请优先：立刻退出用户版，避免商家页 onShow 把人踢回首页
    if (!merchantUiBlocked && staffInviteId && !this.shouldIgnoreShareEntry()) {
      this.globalData.pendingStaffInviteStoreId = staffInviteId;
      this.globalData.pendingEntryStoreId = '';
      this._exitUserClientMode();
    } else if (!merchantUiBlocked && merchantApplyEntry) {
      // 入驻小程序码：强制商家壳，避免新用户被踢回用户首页
      this.globalData.pendingMerchantApplyEntry = true;
      this._exitUserClientMode();
      this._enterMerchantShellMode();
    } else {
      // 登录前先记下分享店，避免并行 getUserInfo 回写时冲掉绑店
      this._rememberShareEntryStore(entry);
      // 打卡分享：进用户壳但不绑店
      if (this._rememberShareEntryDailyLog(entry) && !this._extractStoreId(entry)) {
        this._enterUserClientMode('', { persist: true, applyShell: false });
      }
    }
    return this.ensureCloudAndLogin(force ? { force: true } : {})
      .then(() => {
        if (
          !isMerchantUiBlocked()
          && (this.globalData.pendingMerchantApplyEntry || this._isMerchantApplyEntry(entry))
        ) {
          this._exitUserClientMode();
          this._enterMerchantShellMode();
        }
        this._reconcileClientModeFromCloudUser();
        return this._handleEntryOptions(entry);
      })
      .then(() => {
        this._applyEntrySideEffects(entry);
        applyTabShell();
        this.refreshUserBadges();        return this._flushPendingStoreBinding();
      })
      .then(() => {
        if (!this.canAccessMerchantBackend() || this.isUserClientMode()) {
          return this.syncUserFeed();
        }
        return null;
      })
      .then(() => {
        this._ensureDefaultLanding(entry);
      });
  },

  _applyEntrySideEffects(options) {
    const staffInviteStoreId = this.globalData.pendingStaffInviteStoreId
      || this._parseStaffInviteStoreId(options);
    if (staffInviteStoreId && !this.shouldIgnoreShareEntry()) {
      this.globalData.pendingStaffInviteStoreId = staffInviteStoreId;
      this._exitUserClientMode();
      this._redirectStaffInviteIfNeeded(staffInviteStoreId);
      return;
    }

    if (this.isUserClientMode() && !this._extractStoreId(options)) {
      const storeId = this.getStoreId();
      if (storeId) {
        this.bindStore(storeId, { syncUser: false });
      }
    }
  },

  _reconcileClientModeFromCloudUser() {
    // 非正式版始终留在用户壳
    if (isMerchantUiBlocked()) {
      this.globalData.pendingStaffInviteStoreId = '';
      this.globalData.isMerchant = false;
      this.globalData.role = 'user';
      this._exitMerchantShellMode();
      return;
    }
    // 员工邀请进行中：不要被 USER_CLIENT_MODE 本地标记拉回用户版
    if (this.globalData.pendingStaffInviteStoreId) {
      this._exitUserClientMode();
      return;
    }
    const user = this.globalData.userInfo;
    if (isMerchantApproved(user) && !this.isUserClientMode()) {
      this._exitUserClientMode();
      this.globalData.isMerchant = true;
      this.globalData.role = 'merchant';
      if (isMerchantStaff(user)) {
        this.globalData.merchantAccessRole = 'staff';
      } else if (!this.globalData.merchantAccessRole) {
        this.globalData.merchantAccessRole = 'owner';
      }
      return;
    }
    if (this.getData(STORAGE_KEYS.USER_CLIENT_MODE)) {
      this._storeVisitEntry = true;
      this.globalData.role = 'user';
      this.globalData.isMerchant = hasMerchantCapability(user);
      return;
    }
    if (this._prefersMerchantShell(user)) {
      this.globalData.role = 'merchant';
      this.globalData.isMerchant = isMerchantApproved(user);
    }
  },

  _ensureDefaultLanding(options) {
    const pages = getCurrentPages();
    const route = pages.length ? pages[pages.length - 1].route : '';

    // 非正式版：任何路径都不进商家界面（含入驻码 / 员工邀请 / 已入驻冷启动）
    if (isMerchantUiBlocked()) {
      this.globalData.pendingMerchantApplyEntry = false;
      this.globalData.pendingStaffInviteStoreId = '';
      this._exitMerchantShellMode();
      this.globalData.role = 'user';
      if (route && route.indexOf('pages/merchant/') === 0) {
        wx.switchTab({ url: getUserLandingUrl() });
      }
      return;
    }

    const staffStoreId = this._parseStaffInviteStoreId(options)
      || String(this.globalData.pendingStaffInviteStoreId || '').trim();
    if (staffStoreId) return;
    const storeId = this._extractStoreId(options);
    if (storeId && this._isUserEntryPath(options)) return;
    // 打卡分享落地动态页：保持用户壳，勿踢回商家主页
    const sharedLogId = this._extractDailyLogId(options)
      || String(this.globalData.pendingSharedDailyLogId || '').trim();
    if (sharedLogId && (route === 'pages/daily/daily' || this._isUserEntryPath(options))) {
      return;
    }

    const merchantApplyEntry = !!(
      this.globalData.pendingMerchantApplyEntry
      || this._isMerchantApplyEntry(options)
      || route === 'pages/merchant/apply/apply'
    );

    // 入驻码 / 申请页：留在商家门店授权，不要踢回用户首页
    if (merchantApplyEntry) {
      this.globalData.pendingMerchantApplyEntry = false;
      this._exitUserClientMode();
      this._enterMerchantShellMode();
      if (route === 'pages/merchant/apply/apply') {
        wx.redirectTo({ url: getMerchantLandingUrl() });
      } else if (
        route
        && route.indexOf('pages/merchant/') !== 0
        && !this.isMerchantApproved()
      ) {
        wx.reLaunch({ url: getMerchantLandingUrl() });
      }
      return;
    }

    if (this.isUserClientMode()) {
      if (route && route.indexOf('pages/merchant/') === 0) {
        wx.switchTab({ url: getUserLandingUrl() });
      }
      return;
    }

    // 无商家工作区（新用户等）误入商家 Tab 时回到用户首页
    if (!this._hasMerchantWorkspace()) {
      if (route && route.indexOf('pages/merchant/') === 0) {
        wx.switchTab({ url: getUserLandingUrl() });
      }
      return;
    }

    // 仅纠正「商家态却停在用户 Tab」；分包页（打卡/订单等）必须保留。
    // chooseMedia 从相机/相册返回会触发 App.onShow，若按非 merchant Tab 一律 reLaunch，
    // 会把 packageBiz/daily-check 等业务页直接踢回商家主页。
    if (this._hasMerchantWorkspace() && !this.isUserClientMode()) {
      if (!isUserTabRoute(route)) return;
      if (this._defaultLandingScheduled) return;
      this._defaultLandingScheduled = true;
      wx.reLaunch({
        url: getMerchantLandingUrl(),
        complete: () => {
          this._defaultLandingScheduled = false;
        }
      });
    }
  },

  _hasMerchantWorkspace() {
    // 非正式版硬拦截，优先于商家身份 / 入驻码 / 本地壳缓存
    if (isMerchantUiBlocked()) return false;
    const user = this.globalData.userInfo;
    if (isMerchantApproved(user)) return true;
    if (isMerchantPending(user) || isMerchantRejected(user) || isMerchantDisabled(user)) return true;
    // 入驻小程序码进入：即使线上关闭首页「切换商家版」，仍允许停留在申请页
    if (this.globalData.pendingMerchantApplyEntry) return true;
    // 线上关闭商家入口时，未入驻不可再进商家壳
    if (this.globalData.merchantSwitchEnabled === false) return false;
    // 主动进入商家壳（未入驻仅门店授权）
    if (this.globalData.role === 'merchant') return true;
    if (this.getData(STORAGE_KEYS.MERCHANT_SHELL_MODE)) return true;
    return false;
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
    const logId = this._extractDailyLogId(options);
    const path = options.path || '';
    const scene = options.scene || query.scene || '';
    return `${path}|${staff}|${store}|${logId}|${scene}`;
  },

  _redirectStaffInviteIfNeeded(storeId) {
    if (isMerchantUiBlocked()) {
      this.globalData.pendingStaffInviteStoreId = '';
      return;
    }
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
    // 页面 onLoad 的 options 本身就是 query；App 启动参数则在 options.query
    const query = options.query || options;
    if (query.store_id) return String(query.store_id).trim();

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

  _isUserEntryPath(options) {
    if (!options) return false;
    if (this._isStaffInviteEntry(options)) return false;
    const path = options.path || '';
    if (
      path.includes('pages/index/index')
      || path.includes('pages/orders/orders')
      || path.includes('pages/daily/daily')
      || path.includes('pages/user/')
      || path.includes('packageUser/')
      || path.includes('pages/share/store-landing')
    ) {
      return true;
    }
    return !!this._extractStoreId(options) && !path.includes('pages/merchant/');
  },

  isUserClientMode() {
    return !!(this._storeVisitEntry || this.getData(STORAGE_KEYS.USER_CLIENT_MODE));
  },

  _exitUserClientMode() {
    this._storeVisitEntry = false;
    this.globalData[STORAGE_KEYS.USER_CLIENT_MODE] = null;
    try {
      wx.removeStorageSync(STORAGE_KEYS.USER_CLIENT_MODE);
    } catch (err) {
      // ignore
    }
  },

  _enterUserClientMode(storeId, options = {}) {
    const { persist = true, applyShell = true } = options;
    if (this.shouldIgnoreShareEntry()) {
      return;
    }
    if (storeId && this.isStaffForStore(storeId)) {
      this._keepStaffMerchantMode();
      return;
    }
    this._exitMerchantShellMode();
    this._storeVisitEntry = true;
    this.globalData.role = 'user';
    if (persist) {
      this.setData(STORAGE_KEYS.USER_CLIENT_MODE, true);
    }
    if (storeId) {
      this.globalData.pendingEntryStoreId = storeId;
      this.globalData.storeId = storeId;
      this.setData(STORAGE_KEYS.STORE_ID, storeId);
    }
    if (applyShell) {
      applyTabShell();
    }
  },

  enterMerchantMode() {
    // trial/空环境硬拦截；develop/release 再看远程开关
    if (isMerchantUiBlocked()) {
      wx.showToast({ title: '商家入口暂未开放', icon: 'none' });
      return;
    }

    const approved = isMerchantApproved(this.globalData.userInfo);
    if (!approved && this.globalData.merchantSwitchEnabled === false) {
      wx.showToast({ title: '商家入口暂未开放', icon: 'none' });
      return;
    }

    const proceed = () => {
      if (isMerchantUiBlocked()) {
        wx.showToast({ title: '商家入口暂未开放', icon: 'none' });
        return;
      }
      // 切商家前记住用户端正在访问的店，回来时恢复，避免被自家店/测试店覆盖
      this._rememberUserVisitStore();
      this._exitUserClientMode();
      // 进入商家壳：已完善基础设置进日常，否则进我的门店
      merchantDemo.clearDemoRuntimeData();
      if (merchantDemo.isDemoEntityId(this.globalData.merchantStoreId)) {
        this.globalData.merchantStoreId = '';
      }
      const cachedShop = this.getData(STORAGE_KEYS.SHOP);
      if (cachedShop && merchantDemo.isDemoEntityId(cachedShop.store_id)) {
        this.setData(STORAGE_KEYS.SHOP, {});
      }
      this.globalData.isMerchant = !!isMerchantApproved(this.globalData.userInfo);
      this._enterMerchantShellMode();
      this._resetOrdersFetchState();
      applyTabShell();
      // 先强制同步云端店铺，避免本地缓存把已删店铺当成「基础已完成」而落到日常页
      wx.showLoading({ title: '加载中', mask: true });
      this.refreshMerchantStore()
        .catch(() => ({}))
        .then(() => {
          wx.hideLoading();
          wx.reLaunch({ url: getMerchantLandingUrl() });
        });
    };

    if (approved) {
      proceed();
      return;
    }

    fetchRemoteAppConfig({ force: true }).then((cfg) => {
      applyRemoteConfigToApp(this, cfg);
      if (!cfg.merchantSwitchEnabled || isMerchantUiBlocked()) {
        wx.showToast({ title: '商家入口暂未开放', icon: 'none' });
        return;
      }
      proceed();
    });
  },

  _rememberUserVisitStore() {
    const visitId = String(
      this.getStoreId()
      || getVisitStoreId(this.globalData.userInfo)
      || ''
    ).trim();
    if (!visitId || merchantDemo.isDemoEntityId(visitId)) return;
    this.globalData.savedUserVisitStoreId = visitId;
    this.setData(STORAGE_KEYS.SAVED_USER_VISIT_STORE_ID, visitId);
  },

  _consumeSavedUserVisitStoreId() {
    const fromMem = String(this.globalData.savedUserVisitStoreId || '').trim();
    const fromStorage = String(this.getData(STORAGE_KEYS.SAVED_USER_VISIT_STORE_ID) || '').trim();
    const saved = fromMem || fromStorage;
    if (!saved || merchantDemo.isDemoEntityId(saved)) return '';
    return saved;
  },

  enterUserMode(storeId) {
    const hintId = String(storeId || '').trim();
    const savedVisitId = this._consumeSavedUserVisitStoreId();
    this._resetOrdersFetchState();
    this._petsFetchedAt = 0;

    return this.ensureCloudAndLogin({ silent: true })
      .then(() => {
        // 在仍处于商家壳时拉自家店，避免切用户版后 getShop 读不到 demo/缓存
        if (isMerchantApproved(this.globalData.userInfo)
          || isMerchantPending(this.globalData.userInfo)
          || isMerchantRejected(this.globalData.userInfo)
          || isMerchantDisabled(this.globalData.userInfo)
          || this.isMerchantDemoMode()) {
          return this.ensureMerchantStore({ force: true });
        }
        return this.getShop() || null;
      })
      .then((shop) => {
        const merchantOwnId = (
          getMerchantStoreId(this.globalData.userInfo)
          || this.globalData.merchantStoreId
          || (shop && shop.store_id)
          || ''
        ).trim();
        // 优先恢复切商家前的用户访问店；没有再回落到自家店预览
        const resolvedId = (
          savedVisitId
          || getVisitStoreId(this.globalData.userInfo)
          || hintId
          || merchantOwnId
          || this.getStoreId()
          || ''
        ).trim();
        const isDemo = !!(resolvedId && merchantDemo.isDemoEntityId(resolvedId));
        // 演示店只做本地预览，不写服务端 visitStoreId
        const bindId = (resolvedId && !isDemo) ? resolvedId : '';
        const modeStoreId = bindId || resolvedId;

        storeDebug.log('enterUserMode', {
          hintId,
          savedVisitId,
          resolvedId,
          bindId,
          isDemo,
          merchantStoreId: this.globalData.merchantStoreId,
          userMerchantStoreId: getMerchantStoreId(this.globalData.userInfo),
          shopId: shop && shop.store_id
        });

        this._enterUserClientMode(modeStoreId);
        this._resetOrdersFetchState();

        // 仅当恢复目标就是自家店时，才用商家店铺缓存铺屏
        if (shop && shop.store_id && modeStoreId && shop.store_id === modeStoreId) {
          this._cacheStore(shop);
        } else if (isDemo) {
          merchantDemo.ensureDemoData();
          const demoShop = merchantDemo.getDemoShop();
          if (demoShop && demoShop.store_id) {
            this._cacheStore(demoShop);
          }
        }

        if (!bindId) {
          applyTabShell();
          wx.switchTab({ url: getUserLandingUrl() });
          this.syncUserFeed({ force: true, skipDailyLogs: true }).catch(() => {});
          if (!this.getCurrentStore()) {
            wx.showToast({ title: '入驻通过后可预览本店', icon: 'none' });
          }
          return null;
        }

        return this.bindStore(bindId, { syncUser: true, force: true })
          .then((store) => {
            if ((!store || !store.store_id) && shop && shop.store_id === bindId) {
              this._cacheStore(shop);
            }
            return this._flushPendingStoreBinding();
          })
          .then(() => {
            applyTabShell();
            wx.switchTab({ url: getUserLandingUrl() });
            return this.syncUserFeed({ force: true, skipDailyLogs: true });
          });
      })
      .catch((err) => {
        console.error('enterUserMode failed', err);
        const fallbackId = savedVisitId || hintId;
        this._enterUserClientMode(fallbackId);
        this._resetOrdersFetchState();
        applyTabShell();
        wx.switchTab({ url: getUserLandingUrl() });
        this.syncUserFeed({ force: true, skipDailyLogs: true }).catch(() => {});
      });
  },

  enterUserStore(storeId, options = {}) {
    if (!storeId) return Promise.resolve(null);
    const id = String(storeId).trim();
    if (!id) return Promise.resolve(null);
    const currentId = this.getStoreId();
    const forceData = options.forceData !== false;
    storeDebug.log('enterUserStore 换绑', { storeId: id, currentId, forceData });
    // 允许重复点开同一分享卡片也重新走绑定
    this._lastHandledEntrySignature = '';
    this._resetOrdersFetchState();
    this._petsFetchedAt = 0;
    return this.ensureCloudAndLogin({ silent: true })
      .then(() => {
        if (this.isStaffForStore(id)) {
          this._keepStaffMerchantMode();
          return null;
        }
        this._enterUserClientMode(id);
        return this.bindStore(id, { syncUser: true, force: true })
          .then(() => this._flushPendingStoreBinding())
          .then(() => this.getCurrentStore());
      });
  },

  _handleEntryOptions(options) {
    if (!options) return Promise.resolve();

    const signature = this._entryOptionsSignature(options);
    const staffStoreId = this._parseStaffInviteStoreId(options);
    const storeId = this._extractStoreId(options)
      || String(this.globalData.pendingEntryStoreId || '').trim();
    const sharedLogId = this._extractDailyLogId(options)
      || String(this.globalData.pendingSharedDailyLogId || '').trim();
    const hasShareEntry = staffStoreId || (storeId && this._isUserEntryPath(options));

    if (hasShareEntry && this.shouldIgnoreShareEntry()) {
      this.globalData.pendingStaffInviteStoreId = '';
      this.globalData.pendingEntryStoreId = '';
      if (signature) this._lastHandledEntrySignature = signature;
      storeDebug.log('忽略分享入口：商家/员工身份保持不变');
      return Promise.resolve();
    }

    if (this._isStaffInviteEntry(options)) {
      if (staffStoreId) {
        this.globalData.pendingStaffInviteStoreId = staffStoreId;
        this.globalData.pendingEntryStoreId = '';
        this._exitUserClientMode();
      }
      if (signature) this._lastHandledEntrySignature = signature;
      return Promise.resolve();
    }

    // 客人点谁的分享就换绑谁：带 store_id 一律强制 enterUserStore
    if (storeId) {
      const currentId = this.getStoreId();
      storeDebug.log('_handleEntryOptions 分享换绑', {
        storeId,
        currentId,
        isUserEntry: this._isUserEntryPath(options),
        switched: storeId !== currentId
      });
      if (this.isStaffForStore(storeId)) {
        this._keepStaffMerchantMode();
        if (signature) this._lastHandledEntrySignature = signature;
        return Promise.resolve();
      }
      if (signature) this._lastHandledEntrySignature = signature;
      return this.enterUserStore(storeId, { forceData: true });
    }

    // 打卡分享：进用户动态，不绑店
    if (sharedLogId) {
      this.globalData.pendingSharedDailyLogId = sharedLogId;
      this._enterUserClientMode('', { persist: true, applyShell: true });
      if (signature) this._lastHandledEntrySignature = signature;
      return Promise.resolve();
    }

    if (signature && signature === this._lastHandledEntrySignature) {
      return Promise.resolve();
    }
    if (signature) {
      this._lastHandledEntrySignature = signature;
    }
    return Promise.resolve();
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
    if (this.globalData.isMerchant && !this.isUserClientMode()) {
      return (
        shop.store_id
        || this.globalData.merchantStoreId
        || user.merchantStoreId
        || user.store_id
        || ''
      );
    }
    return (
      this.getStoreId()
      || getVisitStoreId(user)
      || user.store_id
      || (current && current.store_id)
      || this.globalData.pendingEntryStoreId
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

  /** getStore 失败时，用商家缓存 / 演示店兜底，保证用户首页能展示店铺 */
  _resolveLocalStoreFallback(storeId) {
    const id = String(storeId || '').trim();
    if (!id) return null;
    const current = this.getCurrentStore();
    if (current && current.store_id === id) return current;
    const shop = this.getData(STORAGE_KEYS.SHOP) || {};
    if (shop.store_id === id) return shop;
    if (merchantDemo.isDemoEntityId(id)) {
      try {
        merchantDemo.ensureDemoData();
        const demo = merchantDemo.getDemoShop();
        if (demo && demo.store_id === id) return demo;
      } catch (err) {
        // ignore
      }
    }
    return null;
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

    const applyFallback = () => {
      const fallback = this._resolveLocalStoreFallback(storeId);
      if (fallback) {
        this._cacheStore(fallback);
        storeDebug.log('bindStore 使用本地兜底', {
          storeId: fallback.store_id,
          storeName: fallback.name || ''
        });
      }
      return this.getCurrentStore();
    };

    // 演示店：不打服务端，直接本地绑定
    if (merchantDemo.isDemoEntityId(storeId)) {
      const store = applyFallback();
      this.globalData.storeId = storeId;
      this.setData(STORAGE_KEYS.STORE_ID, storeId);
      return Promise.resolve(store);
    }

    if (!this.globalData.env) {
      return Promise.resolve(applyFallback());
    }

    return storeApi.getStore(storeId)
      .then((res) => {
        if (res.success && res.store) {
          const localShop = this.getData(STORAGE_KEYS.SHOP) || {};
          const store = (localShop.store_id && localShop.store_id === res.store.store_id)
            ? mergeMerchantShop(localShop, res.store)
            : res.store;
          this._cacheStore(store);
          storeDebug.log('bindStore 成功', {
            storeId: store.store_id,
            storeName: store.name
          });
          if (syncUser) {
            return this._maybeSyncUserStore(storeId).then(() => store);
          }
          return store;
        }
        storeDebug.log('bindStore 失败', { storeId, errMsg: res.errMsg || '店铺不存在' });
        if (this._isStoreMissingError(res.errMsg)) {
          return this._handleMissingStoreReference(storeId, { syncUser }).then(() => null);
        }
        const store = applyFallback();
        if (store && syncUser && !merchantDemo.isDemoEntityId(storeId)) {
          return this._maybeSyncUserStore(storeId).then(() => store);
        }
        return store;
      })
      .catch((err) => {
        console.error('bindStore failed', err);
        return applyFallback();
      });
  },

  _shouldSyncUserStore() {
    return !!(this.isUserClientMode() || !this.canAccessMerchantBackend());
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
    const storeId = (
      this.globalData.pendingEntryStoreId
      || (this.isUserClientMode() ? this.getStoreId() : '')
      || ''
    ).trim();
    if (!storeId || !this._shouldSyncUserStore()) {
      return Promise.resolve(null);
    }
    return this._syncUserStoreBinding(storeId).then((res) => {
      if (res && res.success) {
        this.globalData.pendingEntryStoreId = '';
      }
      return res;
    });
  },

  _syncUserStoreBinding(storeId) {
    if (!storeId || !this.globalData.env) return Promise.resolve();
    // 演示店仅本地预览，不写 users.visitStoreId
    if (merchantDemo.isDemoEntityId(storeId)) {
      return Promise.resolve({ success: true, skipped: true });
    }
    const now = Date.now();
    if (
      this._lastSyncedVisitStoreId === storeId
      && this._lastSyncedVisitStoreAt
      && now - this._lastSyncedVisitStoreAt < STORE_BIND_TTL
    ) {
      return Promise.resolve({ success: true, skipped: true });
    }
    if (this._syncUserStorePromise && this._syncingVisitStoreId === storeId) {
      return this._syncUserStorePromise;
    }
    this._syncingVisitStoreId = storeId;
    this._syncUserStorePromise = auth.bindUserStore(storeId)
      .then((res) => {
        if (res.success && res.user) {
          this._lastSyncedVisitStoreId = storeId;
          this._lastSyncedVisitStoreAt = Date.now();
          storeDebug.log('users 表已同步 visitStoreId', {
            store_id: res.user.store_id,
            visitStoreId: res.user.visitStoreId,
            isMerchant: res.user.isMerchant
          });
          const user = {
            ...(this.globalData.userInfo || {}),
            ...res.user,
            visitStoreId: res.user.visitStoreId || storeId,
            store_id: res.user.visitStoreId || res.user.store_id || storeId
          };
          const merchantCap = hasMerchantCapability(user);
          this.globalData.userInfo = user;
          this.globalData.isMerchant = merchantCap;
          this.globalData.role = this.isUserClientMode() ? 'user' : (merchantCap ? 'merchant' : 'user');
          this.setData(STORAGE_KEYS.USER, user);
          this._enterUserClientMode(storeId, { applyShell: false });
        } else {
          const errMsg = (res && res.errMsg) || '绑定店铺失败';
          if (this._isStoreMissingError(errMsg)) {
            return this._clearStaleVisitStore(storeId).then(() => res);
          }
          console.error('[bindUserStore] 失败', errMsg, res);
          wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
        }
        return res;
      })
      .catch((err) => {
        console.error('sync user store_id failed', err);
        return null;
      })
      .finally(() => {
        this._syncUserStorePromise = null;
        this._syncingVisitStoreId = '';
      });
    return this._syncUserStorePromise;
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

  getUserStoreView() {
    return buildUserStoreView(this.getCurrentStore());
  },

  getUserStoreViewDisplay() {
    // 展示层直接解析本地缓存（含 cloud:// → 临时 URL），避免每次回首页强制拉店
    return prepareUserStoreView(this.getCurrentStore());
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
            store_id: res.store.store_id,
            membership: res.store.membership || res.membership || null
          });
          if (res.membership && !merged.membership) {
            merged.membership = res.membership;
          }
          this.saveShop(merged);
          this.globalData.merchantStoreId = merged.store_id;
          this.globalData.merchantAccessRole = res.accessRole || (
            isStoreOwner(this.globalData.userInfo) ? 'owner' : 'staff'
          );
          this._merchantStoreFetchedAt = Date.now();
          if (merged.billingRules && Object.keys(merged.billingRules).length) {
            // 以云端为准，不要把上一店本地计费残留合并进来
            this.saveBillingRules({
              ...this._defaultBillingRules(),
              ...merged.billingRules
            });
          } else {
            this.saveBillingRules(this._defaultBillingRules());
          }
          return merged;
        }
        if (res.success && !res.store) {
          this._resetStaleStoreSession(!!res.reconciled);
          return {};
        }
        if (res && res.errMsg) {
          console.error('[店铺] 拉取服务端店铺失败', res.errMsg);
          if (this._isStoreMissingError(res.errMsg)) {
            this._resetStaleStoreSession(false);
            return {};
          }
        }
        if (localShop.store_id && !merchantDemo.isDemoEntityId(localShop.store_id)) {
          this._resetStaleStoreSession(false);
          return {};
        }
        this.clearMerchantLocalCache();
        return {};
      })
      .catch((err) => {
        console.error('fetchMerchantStore failed', err);
        if (localShop.store_id && !merchantDemo.isDemoEntityId(localShop.store_id)) {
          this._resetStaleStoreSession(false);
          return {};
        }
        return this.getShop() || {};
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
          // 开店后用户端也绑自家店（不切壳，仅同步本地 visit）
          this._bindOwnStoreAsVisit(merged.store_id);
          auth.setMerchantProfile(res.store.store_id).catch((err) => {
            console.error('setMerchantProfile failed', err);
          });
          return merged;
        }
        const errMsg = (res && res.errMsg) || '保存店铺失败';
        return Promise.reject(new Error(errMsg));
      });
  },

  /** 商家开店后：把宠主端 visitStoreId 指到自己的店铺，不切换用户壳 */
  _bindOwnStoreAsVisit(storeId) {
    const id = String(storeId || '').trim();
    if (!id || merchantDemo.isDemoEntityId(id)) return;
    const user = {
      ...(this.globalData.userInfo || {}),
      visitStoreId: id,
      store_id: id,
      merchantStoreId: id
    };
    this.globalData.userInfo = user;
    this.setData(STORAGE_KEYS.USER, user);
    this.globalData.savedUserVisitStoreId = id;
    this.setData(STORAGE_KEYS.SAVED_USER_VISIT_STORE_ID, id);
    this._lastSyncedVisitStoreId = id;
    this._lastSyncedVisitStoreAt = Date.now();
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
    const merchantStoreId = pickRemoteString('merchantStoreId') || getMerchantStoreId(remoteUser);
    // 分享绑店与后台刷新并发时，远端可能仍是旧 visitStoreId：优先保留本次入口/刚同步的店
    const remoteVisitStoreId = Object.prototype.hasOwnProperty.call(remoteUser, 'visitStoreId')
      ? String(remoteUser.visitStoreId || '').trim()
      : '';
    const pendingEntryStoreId = String(this.globalData.pendingEntryStoreId || '').trim();
    const recentlySyncedStoreId = (
      this._lastSyncedVisitStoreId
      && this._lastSyncedVisitStoreAt
      && (Date.now() - this._lastSyncedVisitStoreAt < STORE_BIND_TTL)
    ) ? String(this._lastSyncedVisitStoreId).trim() : '';
    const localVisitStoreId = (
      getVisitStoreId(cached)
      || (this.isUserClientMode() ? this.getStoreId() : '')
      || ''
    ).trim();
    const visitStoreId = (
      pendingEntryStoreId
      || recentlySyncedStoreId
      || remoteVisitStoreId
      || localVisitStoreId
    );
    const user = {
      openid: remoteUser.openid || meta.requestOpenid || cached.openid || '',
      nickName: remoteUser.nickName || cached.nickName || '微信用户',
      avatarUrl: remoteUser.avatarUrl || cached.avatarUrl || '',
      phone: remoteUser.phone || cached.phone || '',
      realName: remoteUser.realName || cached.realName || '',
      idCard: remoteUser.idCard || cached.idCard || '',
      address: remoteUser.address || cached.address || '',
      merchantStoreId,
      visitStoreId,
      store_id: visitStoreId,
      pet_ids: Array.isArray(remoteUser.pet_ids) ? remoteUser.pet_ids : (cached.pet_ids || []),
      merchantStatus: pickRemoteString('merchantStatus'),
      merchantRole: pickRemoteString('merchantRole'),
      role,
      isMerchant,
      hasMerchantCapability: isMerchant,
      oaBound: Object.prototype.hasOwnProperty.call(remoteUser, 'oaBound')
        ? !!remoteUser.oaBound
        : !!cached.oaBound,
      oaQrcodeUrl: Object.prototype.hasOwnProperty.call(remoteUser, 'oaQrcodeUrl')
        ? (remoteUser.oaQrcodeUrl || '')
        : (cached.oaQrcodeUrl || ''),
      createTime: remoteUser.createTime || cached.createTime || Date.now()
    };

    if (this.isUserClientMode()) {
      user.role = 'user';
      this.globalData.role = 'user';
      this.globalData.isMerchant = hasMerchantCapability(user);
    } else if (this._prefersMerchantShell(cached)) {
      user.role = 'merchant';
      this.globalData.role = 'merchant';
      this.globalData.isMerchant = isMerchant;
      this._enterMerchantShellMode({ persist: false });
    } else {
      if (isMerchantStaff(user) && isMerchantApproved(user)) {
        this._exitUserClientMode();
      }
      this.globalData.role = role;
      this.globalData.isMerchant = isMerchant;
    }

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
      visitStoreId: user.visitStoreId,
      merchantStatus: user.merchantStatus,
      meta
    });
    storeDebug.logStoreState('_applyRemoteUser', this);

    const linkedMerchantStoreId = getMerchantStoreId(user);
    if (linkedMerchantStoreId) {
      this.globalData.merchantStoreId = linkedMerchantStoreId;
    }

    const storeIdToBind = this.isUserClientMode()
      ? (this.getStoreId() || visitStoreId)
      : (visitStoreId && !isMerchantPending(user) ? visitStoreId : '');

    if (storeIdToBind) {
      this.bindStore(storeIdToBind, { syncUser: false, force: this.isUserClientMode() });
    }

    if (user.isMerchant && !this.isUserClientMode()) {
      this.ensureMerchantStore().then((shop) => {
        if (shop && shop.store_id) {
          this.globalData.merchantStoreId = shop.store_id;
        }
      });
    } else if (
      !this.isUserClientMode()
      && !isMerchantPending(user)
      && !isMerchantRejected(user)
      && !isMerchantDisabled(user)
      && !isMerchant
      && !this._prefersMerchantShell(cached)
    ) {
      // 纯客人：只清残留商家店铺缓存，绝不能把 visitStoreId 当「过期商家数据」清掉
      const hadStaleMerchantShop = !!(
        ((this.getData(STORAGE_KEYS.SHOP) || {}).store_id)
        || getMerchantStoreId(cached)
      );
      if (hadStaleMerchantShop) {
        this.clearMerchantLocalCache();
      }
      this._defaultToUserClientMode({ applyShell: false });
    }

    if (!isMerchantPending(user)) {
      const cachedPets = this.getPets();
      const petIds = Array.isArray(user.pet_ids) ? user.pet_ids : [];
      const petsStale = !this._petsFetchedAt || Date.now() - this._petsFetchedAt > PETS_TTL;
      const petsMismatch = petIds.length !== cachedPets.length;
      if (!cachedPets.length || petsStale || petsMismatch) {
        this.loadPets();
      }
    }

    applyTabShell();
    if (this.isUserClientMode()) {
      return this._flushPendingStoreBinding().then(() => 'user');
    }
    return this._flushPendingStoreBinding().then(() => (isMerchant ? 'merchant' : 'user'));
  },

  forceRefreshRole() {
    wx.removeStorageSync(STORAGE_KEYS.USER);
    this._exitUserClientMode();
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
    if (this.isUserClientMode()) return 'user';
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

  /** 强制重拉用户（服务号关注状态等需要绕过 TTL） */
  refreshCloudUser() {
    this._userInfoFetchedAt = 0;
    if (!this.globalData.isLoggedIn && !this._hasCachedUser()) {
      return this.ensureCloudAndLogin({ force: true, silent: true });
    }
    return this._fetchCloudUser().catch((err) => {
      console.error('[API] refreshCloudUser 失败', err);
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
    if (this.isUserClientMode()) return false;
    const user = this.globalData.userInfo;
    if (isMerchantDisabled(user)) return false;
    // 商家壳下即可访问；基础设置未完成由落地页约束
    if (this.globalData.role === 'merchant') return true;
    if (isMerchantApproved(user)) return true;
    if (isMerchantPending(user) || isMerchantRejected(user)) return true;
    return false;
  },

  hasCompletedBasicStoreSetup() {
    try {
      const shop = this.getShop();
      if (!shop || !shop.store_id) return false;
      const { isBasicStoreComplete } = require('./utils/storeForm');
      return isBasicStoreComplete(shop);
    } catch (err) {
      return false;
    }
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
    if (isMerchantUiBlocked()) {
      this.globalData.role = 'user';
      this._exitMerchantShellMode();
      return;
    }
    this._exitUserClientMode();
    this.globalData.isMerchant = true;
    this._enterMerchantShellMode();
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
    if (isMerchantUiBlocked()) {
      wx.showToast({ title: '商家入口暂未开放', icon: 'none' });
      return Promise.resolve(false);
    }
    if (!this.globalData.env) {
      wx.showToast({ title: '请先配置 API 地址', icon: 'none' });
      return Promise.resolve(false);
    }
    // 先成客人再点员工邀请：必须离开用户版，否则后续落地会被踢回首页
    this.globalData.pendingEntryStoreId = '';
    this._exitUserClientMode();
    if (this.isStaffForStore(id) || (this._staffInviteHandled && this._staffInviteHandled[id])) {
      this._keepStaffMerchantMode();
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
        this.globalData.pendingStaffInviteStoreId = '';
        return this.forceRefreshRole().then(() => {
          this._exitUserClientMode();
          this.globalData.role = 'merchant';
          this.globalData.isMerchant = true;
          this._enterMerchantShellMode();
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

  _isStoreMissingError(errMsg) {
    return String(errMsg || '').indexOf('店铺不存在') >= 0;
  },

  _handleMissingStoreReference(storeId, options = {}) {
    const id = String(storeId || '').trim();
    if (!id || merchantDemo.isDemoEntityId(id)) {
      return Promise.resolve(null);
    }
    const syncUser = options.syncUser !== false;
    storeDebug.log('handleMissingStoreReference', { storeId: id, syncUser });

    if (this.isUserClientMode() || (syncUser && this._shouldSyncUserStore())) {
      return this._clearStaleVisitStore(id);
    }

    if (!this.isUserClientMode()) {
      return Promise.resolve(this._resetStaleStoreSession(false));
    }

    if (this.getStoreId() === id) {
      this.globalData.storeId = '';
      this.globalData.currentStore = null;
      this.setData(STORAGE_KEYS.STORE_ID, '');
      this.setData(STORAGE_KEYS.CURRENT_STORE, null);
    }
    return Promise.resolve(null);
  },

  _clearStaleVisitStore(storeId) {
    const id = String(storeId || '').trim();
    const current = (
      this.getStoreId()
      || getVisitStoreId(this.globalData.userInfo)
      || ''
    ).trim();
    if (current && current !== id) {
      return Promise.resolve({ success: true, skipped: true });
    }
    this._lastSyncedVisitStoreId = '';
    this._lastSyncedVisitStoreAt = 0;
    this.globalData.pendingEntryStoreId = '';
    return this.clearVisitStoreBinding();
  },

  _defaultToUserClientMode(options = {}) {
    const { redirect = false, applyShell = true } = options;
    this._exitMerchantShellMode();
    this.globalData.role = 'user';
    this.globalData.isMerchant = false;
    const user = this.globalData.userInfo;
    if (user) {
      const next = {
        ...user,
        role: 'user',
        isMerchant: false,
        hasMerchantCapability: false
      };
      this.globalData.userInfo = next;
      this.setData(STORAGE_KEYS.USER, next);
    }
    this._enterUserClientMode('', { persist: true, applyShell });
    if (redirect) {
      const pages = getCurrentPages();
      const route = pages.length ? pages[pages.length - 1].route : '';
      if (route && route.indexOf('pages/merchant/') === 0) {
        wx.switchTab({ url: getUserLandingUrl() });
      }
    }
  },

  /** 服务端店铺已不存在：清本地缓存；可进商家壳时落到「我的门店」重填，否则回用户端 */
  _resetStaleStoreSession(reconciled = false) {
    const user = { ...(this.globalData.userInfo || {}) };
    const staleStoreId = (
      getMerchantStoreId(user)
      || this.globalData.merchantStoreId
      || (this.getData(STORAGE_KEYS.SHOP) || {}).store_id
      || ''
    ).trim();

    this.clearMerchantLocalCache();
    this.globalData.storeId = '';
    this.globalData.currentStore = null;
    this.setData(STORAGE_KEYS.STORE_ID, '');
    this.setData(STORAGE_KEYS.CURRENT_STORE, null);
    this.setData(STORAGE_KEYS.ORDERS, []);
    this.setData(STORAGE_KEYS.MERCHANT_ORDERS, []);
    this.setData(STORAGE_KEYS.PETS, []);
    this.setData(STORAGE_KEYS.DAILY_LOGS, []);
    this._resetOrdersFetchState();
    this._petsFetchedAt = 0;
    this._dailyLogsFetchedAt = 0;
    this._merchantStoreFetchedAt = Date.now();
    this.globalData.merchantAccessRole = '';
    this.globalData.pendingEntryStoreId = '';

    const nextUser = {
      ...user,
      merchantStoreId: '',
      visitStoreId: '',
      store_id: '',
      pet_ids: [],
      isMerchant: false,
      merchantStatus: '',
      merchantRole: '',
      hasMerchantCapability: false,
      role: 'user'
    };
    this.globalData.userInfo = nextUser;
    this.globalData.isMerchant = false;
    this.globalData.merchantStoreId = '';
    this.setData(STORAGE_KEYS.USER, nextUser);

    storeDebug.log('resetStaleStoreSession', { reconciled, staleStoreId });

    // 新版开店：无店铺时进「我的门店」填基础设置，而不是踢回用户首页
    const canOpenMerchantSetup = !isMerchantUiBlocked()
      && this.globalData.merchantSwitchEnabled !== false;
    if (canOpenMerchantSetup) {
      this._enterMerchantShellMode();
      applyTabShell();
      try {
        const pages = getCurrentPages();
        const route = pages.length ? (pages[pages.length - 1].route || '') : '';
        if (route !== 'pages/merchant/tab-store/tab-store') {
          wx.reLaunch({ url: getMerchantLandingUrl() });
        }
      } catch (err) {
        wx.reLaunch({ url: '/pages/merchant/tab-store/tab-store' });
      }
      return {};
    }

    this._exitMerchantShellMode();
    this._defaultToUserClientMode({ redirect: true });
    return {};
  },

  clearMerchantLocalCache() {
    this.globalData.merchantStoreId = '';
    this._merchantStoreFetchedAt = 0;
    this.setData(STORAGE_KEYS.SHOP, {});
    // 计费规则单独缓存，删店/无店时必须一并清掉，否则会污染新店
    try {
      wx.removeStorageSync(STORAGE_KEYS.BILLING_RULES);
    } catch (err) {
      // ignore
    }
    this.globalData[STORAGE_KEYS.BILLING_RULES] = null;
  },

  /** 仅清用户端访问店铺（本地 + 云端 visitStoreId），不影响商家身份 */
  clearVisitStoreBinding() {
    this.globalData.storeId = '';
    this.globalData.currentStore = null;
    this.globalData.pendingEntryStoreId = '';
    this.globalData.savedUserVisitStoreId = '';
    this.setData(STORAGE_KEYS.STORE_ID, '');
    this.setData(STORAGE_KEYS.CURRENT_STORE, null);
    this.setData(STORAGE_KEYS.SAVED_USER_VISIT_STORE_ID, '');

    const user = this.globalData.userInfo;
    if (user) {
      const merchantStoreId = getMerchantStoreId(user) || this.globalData.merchantStoreId || '';
      const next = {
        ...user,
        visitStoreId: '',
        store_id: ''
      };
      if (merchantStoreId && !(next.merchantStoreId || '').trim()) {
        next.merchantStoreId = merchantStoreId;
      }
      this.globalData.userInfo = next;
      this.setData(STORAGE_KEYS.USER, next);
    }

    if (!this.globalData.env || !this.globalData.isLoggedIn) {
      return Promise.resolve({ success: true, skipped: true });
    }
    return auth.unbindUserStore()
      .then((res) => {
        if (res && res.success && res.user) {
          const merged = {
            ...(this.globalData.userInfo || {}),
            ...res.user,
            visitStoreId: '',
            store_id: res.user.visitStoreId || ''
          };
          this.globalData.userInfo = merged;
          this.setData(STORAGE_KEYS.USER, merged);
        }
        return res;
      })
      .catch((err) => {
        console.error('unbindUserStore failed', err);
        return null;
      });
  },

  clearLocalAppCache() {
    // 先解绑云端 visit，否则重登会按 visitStoreId 绑回旧测试店
    const unbindPromise = (this.globalData.env && this.globalData.isLoggedIn)
      ? auth.unbindUserStore().catch((err) => {
        console.error('clearLocalAppCache unbind failed', err);
        return null;
      })
      : Promise.resolve(null);

    return unbindPromise.then(() => {
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
      this._userOrdersCache = null;
      this._merchantOrdersCache = null;
      this._ordersDisplayCache = null;
      this.globalData.currentStore = null;
      this.globalData.merchantStoreId = '';
      this.globalData.pendingEntryStoreId = '';
      this.globalData.pendingStaffInviteStoreId = '';
      this.globalData.merchantAccessRole = '';
      this._userInfoFetchedAt = 0;
      this._resetOrdersFetchState();
      this._petsFetchedAt = 0;
      this._dailyLogsFetchedAt = 0;
      this._merchantStoreFetchedAt = 0;
      this._loadPetsPromise = null;
      this._loadDailyLogsPromise = null;
      this._merchantStorePromise = null;
      this._silentLoginPromise = null;
      this._backgroundRefreshPromise = null;
      this._staffInviteHandled = {};
      this._staffInviteInFlight = '';
      this._staffInvitePromise = null;
      this._exitUserClientMode();

      return this.ensureCloudAndLogin().then(() => {
        applyTabShell();
        return true;
      });
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
    if (this.isMerchantDemoMode() && !this.isUserClientMode()) {
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
    if (!force && this._loadPetsPromise) {
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
    if (this.isMerchantDemoMode() && !this.isUserClientMode()) {
      merchantDemo.ensureDemoData();
      return merchantDemo.getDemoOrders();
    }
    const mem = this._getOrdersMemCache();
    if (Array.isArray(mem)) {
      return mem;
    }
    const storageKey = this._getOrdersStorageKey();
    let raw = this.getData(storageKey);
    // 兼容旧版共用 pet_orders：用户端首次迁移
    if ((!Array.isArray(raw) || !raw.length)
      && storageKey === STORAGE_KEYS.USER_ORDERS) {
      const legacy = this.getData(STORAGE_KEYS.ORDERS);
      if (Array.isArray(legacy) && legacy.length) {
        raw = legacy;
        this.setData(STORAGE_KEYS.USER_ORDERS, legacy);
      }
    }
    const list = Array.isArray(raw) ? raw : [];
    const orders = list.map(attachOrderDisplayNo);
    this._setOrdersMemCache(orders);
    return orders;
  },

  _cacheOrders(orders) {
    const list = Array.isArray(orders) ? orders : [];
    const normalized = list.map(attachOrderDisplayNo);
    this._setOrdersMemCache(normalized);
    this.setData(this._getOrdersStorageKey(), normalized);
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
    if (this.isMerchantDemoMode() && !this.isUserClientMode()) {
      merchantDemo.ensureDemoData();
      return Promise.resolve(merchantDemo.getDemoOrders());
    }
    if (!this.globalData.env) {
      return Promise.resolve(this.getOrders());
    }
    const fetchedAt = this._getOrdersFetchedAt();
    if (!force && fetchedAt && Date.now() - fetchedAt < ORDERS_TTL) {
      return Promise.resolve(this.getOrders());
    }
    const existingPromise = this._getOrdersLoadPromise();
    if (existingPromise) {
      return existingPromise;
    }

    const useMerchantOrders = this.canAccessMerchantBackend() && !this.isUserClientMode();
    const loader = useMerchantOrders
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

    const loadPromise = loader
      .then((res) => {
        // 模式已切换时丢弃过期响应，避免商家列表写进用户缓存
        if (useMerchantOrders !== (this.canAccessMerchantBackend() && !this.isUserClientMode())) {
          return this.getOrders();
        }
        if (res && res.success && Array.isArray(res.orders)) {
          this._cacheOrders(res.orders);
          this._setOrdersFetchedAt(Date.now());
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
        this._setOrdersLoadPromise(null);
        this.refreshUserBadges();
      });
    this._setOrdersLoadPromise(loadPromise);
    return loadPromise;
  },

  /** 商家端订单上下文（与用户端缓存隔离） */
  _isMerchantOrderContext() {
    return !!(this.canAccessMerchantBackend() && !this.isUserClientMode());
  },

  _getOrdersStorageKey() {
    return this._isMerchantOrderContext()
      ? STORAGE_KEYS.MERCHANT_ORDERS
      : STORAGE_KEYS.USER_ORDERS;
  },

  _getOrdersMemCache() {
    return this._isMerchantOrderContext()
      ? this._merchantOrdersCache
      : this._userOrdersCache;
  },

  _setOrdersMemCache(list) {
    if (this._isMerchantOrderContext()) {
      this._merchantOrdersCache = list;
    } else {
      this._userOrdersCache = list;
    }
  },

  _getOrdersFetchedAt() {
    return this._isMerchantOrderContext()
      ? (this._merchantOrdersFetchedAt || 0)
      : (this._userOrdersFetchedAt || 0);
  },

  _setOrdersFetchedAt(ts) {
    if (this._isMerchantOrderContext()) {
      this._merchantOrdersFetchedAt = ts;
    } else {
      this._userOrdersFetchedAt = ts;
    }
  },

  _getOrdersLoadPromise() {
    return this._isMerchantOrderContext()
      ? this._merchantLoadOrdersPromise
      : this._userLoadOrdersPromise;
  },

  _setOrdersLoadPromise(promise) {
    if (this._isMerchantOrderContext()) {
      this._merchantLoadOrdersPromise = promise;
    } else {
      this._userLoadOrdersPromise = promise;
    }
  },

  _resetOrdersFetchState() {
    this._merchantLoadOrdersPromise = null;
    this._userLoadOrdersPromise = null;
    this._loadOrdersPromise = null;
    this._merchantOrdersFetchedAt = 0;
    this._userOrdersFetchedAt = 0;
    this._ordersFetchedAt = 0;
  },

  getUserScopedOrders() {
    return userFeed.getUserScopedOrders(this);
  },

  syncUserFeed(options = {}) {
    const force = !!(options && options.force);
    const skipDailyLogs = !!(options && options.skipDailyLogs);
    this.refreshUserBadges();

    if (this.canAccessMerchantBackend() && !this.isUserClientMode()) {
      return Promise.resolve();
    }
    // 用户版即使曾进过商家体验模式，也拉真实用户数据
    if (this.isMerchantDemoMode() && !this.isUserClientMode()) {
      return Promise.resolve();
    }

    if (!force && this._syncUserFeedPromise) {
      return this._syncUserFeedPromise;
    }

    const run = () => this.ensureCloudAndLogin({ silent: true })
      .then(() => this.loadOrders({ force }))
      .then(() => {
        if (skipDailyLogs) {
          this.refreshUserBadges();
          const orders = this.getUserScopedOrders();
          const boardingIds = userFeed.getUserBoardingOrderIds(orders);
          if (boardingIds.length) {
            this.loadDailyLogsForOrders(boardingIds, { force: false })
              .then(() => this.refreshUserBadges())
              .catch(() => {});
          }
          return null;
        }
        const orders = this.getUserScopedOrders();
        const boardingIds = userFeed.getUserBoardingOrderIds(orders);
        if (!boardingIds.length) return this.getDailyLogs();
        return this.loadDailyLogsForOrders(boardingIds, { force });
      })
      .then(() => {
        this.refreshUserBadges();
      });

    if (force) {
      return run();
    }

    this._syncUserFeedPromise = run().finally(() => {
      this._syncUserFeedPromise = null;
    });
    return this._syncUserFeedPromise;
  },

  refreshUserBadges() {
    if (this.canAccessMerchantBackend() && !this.isUserClientMode()) {
      badgeUtil.clearUserTabBadges();
      return;
    }
    const orders = this.getUserScopedOrders();
    const logs = userFeed.getUserScopedDailyLogs(this, orders);
    badgeUtil.refreshUserTabBadges(orders, logs);
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
          this._setOrdersFetchedAt(0);
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
          this._setOrdersFetchedAt(0);
          return res.order;
        }
        const err = new Error((res && res.errMsg) || '更新订单失败');
        err.errCode = res && res.errCode;
        err.response = res;
        throw err;
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
    if (this.isMerchantDemoMode() && !this.isUserClientMode()) {
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
      && !this.isUserClientMode()
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
      this._syncCurrentStoreFromShop(saved);
      return attachStoreDisplayNo(saved);
    }
    this.setData(STORAGE_KEYS.SHOP, normalized);
    if (normalized && normalized.store_id) {
      this.globalData.merchantStoreId = normalized.store_id;
      this._merchantStoreFetchedAt = Date.now();
      this._syncCurrentStoreFromShop(normalized);
    }
    return normalized;
  },

  /** 商家保存店铺后，同步更新用户端绑定店铺缓存，避免预约页读到旧数据 */
  _syncCurrentStoreFromShop(shop) {
    if (!shop || !shop.store_id) return;
    const current = this.getCurrentStore();
    if (current && current.store_id && current.store_id !== shop.store_id) return;
    this._cacheStore(current ? { ...current, ...shop } : shop);
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
      customPricing: getDefaultCustomPricing(),
      checkInDayCharge: 'full',
      departureDayCharge: 'full',
      departureCharge: {
        freeUntil: '12:00',
        halfUntil: '18:00',
        fullFrom: '18:00'
      },
      pricing: { cat: 60, smallDog: 80, midDog: 100, largeDog: 150, other: 50 },
      holidayRate: 1.5,
      holidayPricing: getDefaultHolidayPricing(),
      overtimeRate: 20,
      extras: { pickup: 30, medicine: 20, wash: 80, extraMeal: 15, walk: 25, specialCare: 50 },
      multiPetDiscount: {
        enabled: false,
        mode: 'fromSecondPercent',
        percent: 0,
        amount: 0,
        applyTo: 'boarding'
      },
      longTermDiscount: { enabled: false, tiers: [], applyTo: 'boarding' }
    };
  },

  getContractTemplate() { return this.getData(STORAGE_KEYS.CONTRACT_TEMPLATE) || ''; },

  saveContractTemplate(tpl) { this.setData(STORAGE_KEYS.CONTRACT_TEMPLATE, tpl); }
});
