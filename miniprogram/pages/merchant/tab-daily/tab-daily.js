const app = getApp();
const storeApi = require('../../../utils/store');
const { enableStoreShareMenu, buildMerchantTimelineShareConfig, buildStaffShareConfig, buildMerchantShareConfig } = require('../../../utils/storeShare');
const {
  buildBoardingListWithDailyStats,
  countUncheckedBoardingPets
} = require('../../../utils/dailyStats');
const badgeUtil = require('../../../utils/badge');
const merchantDemo = require('../../../utils/merchantDemo');
const { countPendingPickupTasks } = require('../../../utils/pickupManage');
const { hideHomeButton, getCustomNavMetrics } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');
const { startMerchantOrdersPoll, stopMerchantOrdersPoll } = require('../../../utils/orderRefresh');
const { isMerchantRejected } = require('../../../utils/role');
const { redirectToStoreAuthIfNeeded, redirectToUserIfMerchantUiBlocked, ensureMerchantPageAllowed } = require('../../../utils/shell');
const announcementApi = require('../../../utils/announcements');

const STAFF_COUNT_TTL = 60 * 1000;
const DAILY_POLL_MS = 60 * 1000;

function parseStaffInviteStoreId(options) {
  if (!options) return '';
  const flag = options.staff_invite;
  const isInvite = flag === '1' || flag === 1 || flag === true || flag === 'true';
  const storeId = String(options.store_id || '').trim();
  return isInvite && storeId ? storeId : '';
}

Page({
  data: {
    isDemoMode: false,
    isPendingReview: false,
    isApplyRejected: false,
    isAdminDisabled: false,
    adminDisableReason: '',
    isStoreOwner: false,
    shop: {},
    boardingList: [],
    staffCount: 0,
    pendingOrderCount: 0,
    pickupPendingCount: 0,
    uncheckedPetCount: 0,
    hasUnreadAnnouncement: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    navTitle: '日常管理'
  },

  onLoad(options) {
    hideHomeButton();
    this._initCustomNav();
    enableStoreShareMenu();
    this._pendingOpenOrders = options.openOrders === '1';
    this._pendingOrdersTab = (options.tab || 'pending').trim() || 'pending';
    const inviteFromOptions = parseStaffInviteStoreId(options);
    if (inviteFromOptions && !app.shouldIgnoreShareEntry()) {
      this._staffInviteStoreId = inviteFromOptions;
      app.globalData.pendingStaffInviteStoreId = inviteFromOptions;
      // 已是客人（用户版）时先退出，避免 onShow 被踢回首页导致邀请失效
      if (app.isUserClientMode && app.isUserClientMode() && app._exitUserClientMode) {
        app._exitUserClientMode();
      }
    } else {
      this._staffInviteStoreId = '';
      if (inviteFromOptions) {
        app.globalData.pendingStaffInviteStoreId = '';
      }
    }
    const shop = app.getShop();
    if (shop && shop.store_id) {
      app.globalData.merchantStoreId = shop.store_id;
      this.setData({ shop });
      this._syncNavTitle(shop);
    }
  },

  _initCustomNav() {
    const metrics = getCustomNavMetrics();
    this.setData({
      statusBarHeight: metrics.statusBarHeight,
      navBarHeight: metrics.navBarHeight,
      navTotalHeight: metrics.totalHeight
    });
  },

  _syncNavTitle(shop) {
    const name = (shop && String(shop.name || '').trim()) || '';
    this.setData({ navTitle: name || '日常管理' });
  },

  onShow() {
    hideHomeButton();
    this._syncTabBar();
    this._refreshAnnouncements();

    // 非正式版 / 开关关闭：硬拦截（含员工邀请路径也不进商家界面）
    if (redirectToUserIfMerchantUiBlocked()) return;
    ensureMerchantPageAllowed().then((blocked) => {
      if (blocked) return;
      this._onShowAfterGate();
    });
  },

  _onShowAfterGate() {
    const inviteId = this._staffInviteStoreId
      || app.globalData.pendingStaffInviteStoreId
      || parseStaffInviteStoreId(this._getPageEntryQuery());

    // 员工邀请优先于「用户版误入商家页」纠正，否则先成客人再点邀请会被踢回首页
    if (inviteId && !app.shouldIgnoreShareEntry()) {
      if (app.isUserClientMode && app.isUserClientMode() && app._exitUserClientMode) {
        app._exitUserClientMode();
      }
      this._staffInviteStoreId = '';
      app.globalData.pendingStaffInviteStoreId = '';
      app.ensureCloudAndLogin({ force: true }).then(() => {
        this._syncTabBar();
        return app.acceptStaffInvite(inviteId).then(() => this._bootstrapPage({ force: true }));
      }).then(() => {
        this._openOrdersFromNotify();
      }).catch((err) => {
        console.error('[日常管理] 员工邀请处理失败', err);
        this._bootstrapped = true;
        this._syncTabBar();
        redirectToStoreAuthIfNeeded();
      });
      startMerchantOrdersPoll(this, () => {
        if (!app.isMerchantApproved() || app.isMerchantDemoMode()) return Promise.resolve();
        return app.loadOrders({ force: false }).then(() => {
          const shop = app.getShop();
          if (!shop || !shop.store_id) return;
          return this._applyBoardingData(shop);
        });
      }, DAILY_POLL_MS);
      return;
    }

    if (inviteId && app.shouldIgnoreShareEntry()) {
      this._staffInviteStoreId = '';
      app.globalData.pendingStaffInviteStoreId = '';
    }

    if (app.isUserClientMode && app.isUserClientMode()) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }

    // 未入驻不再提供日常管理演示，统一回门店授权
    if (redirectToStoreAuthIfNeeded()) return;

    app.ensureCloudAndLogin({}).then(() => {
      this._syncTabBar();
      if (redirectToStoreAuthIfNeeded()) return null;

      // Tab 切回：页面实例还在，走轻量刷新
      if (this._bootstrapped) {
        return this._softRefresh();
      }

      return this._bootstrapPage();
    }).then(() => {
      this._openOrdersFromNotify();
    }).catch((err) => {
      console.error('[日常管理] onShow 初始化失败', err);
      this._bootstrapped = true;
      this._syncTabBar();
    });
    startMerchantOrdersPoll(this, () => {
      if (!app.isMerchantApproved() || app.isMerchantDemoMode()) return Promise.resolve();
      return app.loadOrders({ force: false }).then(() => {
        const shop = app.getShop();
        if (!shop || !shop.store_id) return;
        return this._applyBoardingData(shop);
      });
    }, DAILY_POLL_MS);
  },

  onHide() {
    stopMerchantOrdersPoll(this);
  },

  onUnload() {
    stopMerchantOrdersPoll(this);
  },

  _syncTabBar() {},

  onSwitchToUser() {
    if (app.enterUserMode) {
      app.enterUserMode();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  onGoAnnouncements() {
    wx.navigateTo({ url: '/packageExtra/announcements/announcements' });
  },

  _refreshAnnouncements() {
    return announcementApi.fetchMerchantAnnouncements({ force: true })
      .then((res) => {
        this.setData({ hasUnreadAnnouncement: !!(res && res.unread) });
      })
      .catch(() => {
        this.setData({ hasUnreadAnnouncement: false });
      });
  },

  _getPageEntryQuery() {
    try {
      const enter = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {};
      const launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
      const enterQuery = (enter && enter.query) || {};
      const launchQuery = (launch && launch.query) || {};
      return {
        staff_invite: enterQuery.staff_invite || launchQuery.staff_invite,
        store_id: enterQuery.store_id || launchQuery.store_id
      };
    } catch (err) {
      return {};
    }
  },

  onPullDownRefresh() {
    const wasPending = !!(this.data.isPendingReview || app.isMerchantPending());
    const wasRejected = !!(
      this.data.isApplyRejected
      || isMerchantRejected(app.globalData.userInfo)
    );

    // 审核中/已拒绝/体验模式都先强制同步用户角色，再决定走演示数据还是正式店铺
    if (this.data.isDemoMode || wasPending || wasRejected) {
      const wasPendingReview = wasPending;
      app.ensureCloudAndLogin({ force: true })
        .then(() => this._bootstrapPage({ force: true }))
        .then(() => {
          if (wasPendingReview && app.isMerchantApproved()) {
            wx.showToast({ title: '审核已通过', icon: 'success' });
          } else {
            wx.showToast({ title: '已刷新', icon: 'success' });
          }
        })
        .catch(() => {})
        .finally(() => wx.stopPullDownRefresh());
      return;
    }

    if (!app.canAccessMerchantBackend()) {
      wx.stopPullDownRefresh();
      return;
    }

    app.refreshMerchantStore()
      .then((shop) => {
        if (!shop || !shop.store_id) {
          this.setData({
            shop: shop || {},
            boardingList: [],
            pendingOrderCount: 0,
            pickupPendingCount: 0,
            uncheckedPetCount: 0,
            staffCount: 0
          });
          return null;
        }
        this.setData({ shop, isStoreOwner: app.isStoreOwner() });
        return Promise.all([
          app.loadOrders({ force: true }),
          app.loadPets({ force: true }),
          this._loadStaffCount({ force: true })
        ]).then(() => shop);
      })
      .then((shop) => {
        if (!shop) return;
        return this._applyBoardingData(shop, { forceLogs: true });
      })
      .then(() => {
        wx.showToast({ title: '已刷新', icon: 'success' });
      })
      .catch(() => {})
      .finally(() => wx.stopPullDownRefresh());
  },

  /** Tab 切回时的轻量路径：先渲染缓存，再按 TTL 后台刷新 */
  _softRefresh() {
    const isDemoMode = app.isMerchantDemoMode();
    const isPendingReview = app.isMerchantPending();
    const isApplyRejected = isMerchantRejected(app.globalData.userInfo);
    const isAdminDisabled = app.isMerchantDisabled();
    this.setData({ isDemoMode, isPendingReview, isApplyRejected, isAdminDisabled });
    this._syncTabBar();

    if (isAdminDisabled || isDemoMode || isPendingReview || isApplyRejected) {
      return this._bootstrapPage();
    }

    const shop = app.getShop();
    if (!shop || !shop.store_id) {
      return this._bootstrapPage();
    }

    this.setData({ shop, isStoreOwner: app.isStoreOwner() });
    // 先用本地订单立刻刷新列表（不堵网络）
    this._applyBoardingData(shop, { skipRemoteLogs: true });

    return app.loadOrders()
      .then(() => this._applyBoardingData(shop))
      .then(() => this._loadStaffCount())
      .catch(() => {});
  },

  _bootstrapPage(options = {}) {
    const force = !!(options && options.force);
    const isDemoMode = app.isMerchantDemoMode();
    const isPendingReview = app.isMerchantPending();
    const isApplyRejected = isMerchantRejected(app.globalData.userInfo);
    const isAdminDisabled = app.isMerchantDisabled();
    this.setData({ isDemoMode, isPendingReview, isApplyRejected, isAdminDisabled });
    this._syncTabBar();

    if (isAdminDisabled) {
      return app.ensureMerchantStore({ force: true }).then((shop) => {
        this._bootstrapped = true;
        this.setData({
          adminDisableReason: (shop && shop.adminDisableReason) || '',
          boardingList: [],
          pendingOrderCount: 0,
          pickupPendingCount: 0,
          uncheckedPetCount: 0,
          staffCount: 0,
          shop: shop || {}
        });
      });
    }

    if (isDemoMode) {
      merchantDemo.ensureDemoData();
      const shop = merchantDemo.getDemoShop();
      app.globalData.merchantStoreId = shop.store_id;
      this.setData({ shop, staffCount: 0, isStoreOwner: false });
      this._bootstrapped = true;
      return this._applyBoardingData(shop);
    }

    const cachedShop = app.getShop();
    if (cachedShop && cachedShop.store_id && !isPendingReview && !isApplyRejected) {
      this.setData({ shop: cachedShop, isStoreOwner: app.isStoreOwner() });
      this._applyBoardingData(cachedShop, { skipRemoteLogs: true });
    }

    return app.ensureMerchantStore(force ? { force: true } : {})
      .then((shop) => {
        const isStoreOwner = app.isStoreOwner();
        if (!shop || !shop.store_id) {
          if (app.isMerchantDemoMode()) {
            merchantDemo.ensureDemoData();
            const demoShop = merchantDemo.getDemoShop();
            app.globalData.merchantStoreId = demoShop.store_id;
            this._bootstrapped = true;
            this.setData({
              shop: demoShop,
              isStoreOwner: false,
              isDemoMode: true,
              boardingList: [],
              pendingOrderCount: 0,
              pickupPendingCount: 0,
              uncheckedPetCount: 0,
              staffCount: 0
            });
            return this._applyBoardingData(demoShop);
          }
          // 无店铺时停留在本页空态，避免 reLaunch 自身导致白屏循环
          this._bootstrapped = true;
          this.setData({
            shop: shop || {},
            isStoreOwner,
            boardingList: [],
            pendingOrderCount: 0,
            pickupPendingCount: 0,
            uncheckedPetCount: 0,
            staffCount: 0
          });
          return null;
        }
        this.setData({ shop, isStoreOwner });
        if (isPendingReview || isApplyRejected) {
          this._bootstrapped = true;
          this.setData({
            boardingList: [],
            pendingOrderCount: 0,
            pickupPendingCount: 0,
            uncheckedPetCount: 0,
            staffCount: 0
          });
          return null;
        }
        this._loadStaffCount(force ? { force: true } : {});
        return app.loadOrders(force ? { force: true } : {}).then(() => shop);
      })
      .then((shop) => {
        if (!shop || !shop.store_id) return;
        this._bootstrapped = true;
        return this._applyBoardingData(shop, force ? { forceLogs: true } : {});
      })
      .catch((err) => {
        console.error('[日常管理] bootstrap 失败', err);
        this._bootstrapped = true;
      });
  },

  _applyBoardingData(shop, options = {}) {
    const skipRemoteLogs = !!(options && options.skipRemoteLogs);
    const forceLogs = !!(options && options.forceLogs);
    const storeShop = shop || app.getShop();
    const orders = app.getOrders();
    const pendingOrderCount = badgeUtil.countMerchantPendingOrders(orders);
    const pickupPendingCount = countPendingPickupTasks(orders);
    const pets = app.getPets();
    const boardingOrders = orders.filter((o) => o.status === 'boarding');
    const orderIds = boardingOrders.map((o) => o.id || o.order_id).filter(Boolean);

    const finish = (logs) => {
      if (logs) this._cachedDailyLogs = logs;
      const boardingList = buildBoardingListWithDailyStats(
        boardingOrders,
        pets,
        logs || this._cachedDailyLogs || []
      );
      this.setData({
        shop: storeShop,
        boardingList,
        pendingOrderCount,
        pickupPendingCount,
        uncheckedPetCount: countUncheckedBoardingPets(boardingList)
      });
      this._syncNavTitle(storeShop);
    };

    if (app.isMerchantDemoMode()) {
      finish(merchantDemo.getDemoDailyLogs());
      return Promise.resolve();
    }

    if (!orderIds.length) {
      finish([]);
      return Promise.resolve();
    }

    if (skipRemoteLogs) {
      finish(this._cachedDailyLogs || []);
      return Promise.resolve();
    }

    // 复用 app 层打卡缓存（TTL / 进行中请求），进入打卡管理页可秒开
    return app.loadDailyLogsForOrders(orderIds, { force: forceLogs })
      .then((logs) => {
        finish(logs || []);
      })
      .catch(() => finish(this._cachedDailyLogs || app.getDailyLogs() || []));
  },

  _loadStaffCount(options = {}) {
    const force = !!(options && options.force);
    if (!this.data.isStoreOwner || this.data.isDemoMode) {
      this.setData({ staffCount: 0 });
      return Promise.resolve();
    }

    const cached = app.globalData._staffCountCache;
    if (!force && cached && Date.now() - cached.at < STAFF_COUNT_TTL) {
      this.setData({ staffCount: cached.count });
      return Promise.resolve();
    }

    return storeApi.listStoreStaff()
      .then((res) => {
        if (res && res.success) {
          const count = (res.staff || []).length;
          app.globalData._staffCountCache = { count, at: Date.now() };
          this.setData({ staffCount: count });
        }
      })
      .catch(() => {});
  },

  onShareAppMessage(res) {
    if (this.data.isDemoMode) {
      return { title: '萌宠寄养体验', path: '/pages/merchant/tab-daily/tab-daily' };
    }
    const shareType = res && res.target && res.target.dataset && res.target.dataset.shareType;
    if (shareType === 'staff') {
      if (!this.data.isStoreOwner) {
        wx.showToast({ title: '仅负责人可邀请员工', icon: 'none' });
        return {
          title: '萌宠寄养',
          path: '/pages/merchant/tab-daily/tab-daily'
        };
      }
      return buildStaffShareConfig(this);
    }
    if (shareType === 'customer') {
      if (!this._guardMerchantFeature()) {
        return {
          title: '萌宠寄养',
          path: '/pages/merchant/tab-daily/tab-daily'
        };
      }
      return buildMerchantShareConfig(this);
    }
    // 右上角菜单转发：默认按分享给客人
    return buildMerchantShareConfig(this);
  },

  onShareTimeline() {
    if (this.data.isDemoMode) {
      return { title: '萌宠寄养体验' };
    }
    return buildMerchantTimelineShareConfig(this);
  },

  onGoStaffManage() {
    if (!this.data.isStoreOwner) {
      wx.showToast({ title: '仅负责人可管理员工', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageExtra/staff-manage/staff-manage' });
  },

  _guardMerchantFeature() {
    if (this.data.isAdminDisabled) {
      wx.showToast({ title: '店铺已被平台关闭', icon: 'none' });
      return false;
    }
    if (this.data.isPendingReview) {
      wx.showToast({ title: '入驻审核中，请耐心等待', icon: 'none' });
      return false;
    }
    if (this.data.isApplyRejected) {
      wx.showToast({ title: '入驻未通过，请先修改资料后重新提交', icon: 'none' });
      return false;
    }
    return true;
  },

  onGoMerchantOrders() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageBiz/orders/orders' });
  },

  _openOrdersFromNotify() {
    if (!this._pendingOpenOrders) return;
    this._pendingOpenOrders = false;
    if (!this._guardMerchantFeature()) return;
    const tab = encodeURIComponent(this._pendingOrdersTab || 'pending');
    wx.navigateTo({ url: `/packageBiz/orders/orders?tab=${tab}` });
  },
  onGoDailyCheck() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageBiz/daily-check/daily-check' });
  },
  onGoDailyCheckForOrder(e) {
    if (!this._guardMerchantFeature()) return;
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageBiz/daily-check/daily-check?orderId=' + id });
  },
  onGoPickupManage() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageBiz/pickup-manage/pickup-manage' });
  },
  onGoDailyLogs() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageBiz/daily-logs/daily-logs' });
  },
  onGoCustomers() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageExtra/customers/customers' });
  },
  onGoLedger() {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageExtra/ledger/ledger' });
  },
  onGoDetail(e) {
    if (!this._guardMerchantFeature()) return;
    wx.navigateTo({ url: '/packageBiz/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },
  onAdminSecretTap() {
    handlePageSecretTap(this);
  }
});
