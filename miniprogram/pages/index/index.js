const app = getApp();
const { guardUserTabPage } = require('../../utils/shell');
const { buildStoreShareConfig, buildTimelineShareConfig, resolveShareStoreId, listGuestShareCards, prefetchStoreShareImage } = require('../../utils/storeShare');
const storeDebug = require('../../utils/storeDebug');
const { refreshUserOrders } = require('../../utils/orderRefresh');
const { resolveEntryStoreId, enterStoreAndRefresh } = require('../../utils/storeEntry');
const { formatOrderCreateTime } = require('../../utils/util');
const { formatServiceStatus } = require('../../utils/dailyCheckable');
const {
  isAuthorizedNickName,
  getDisplayNickName,
  getNickNameCapability
} = require('../../utils/userAuth');
const { copyText } = require('../../utils/clipboard');
const { hideHomeButton, getCustomNavMetrics } = require('../../utils/navBar');
const petApi = require('../../utils/pet');
const butler = require('../../utils/petButler');
const { claimProxyOrdersForGuest, extractProxyClaimToken } = require('../../utils/proxyOrder');
const {
  getMiniProgramMeta,
  fetchRemoteAppConfig,
  applyRemoteConfigToApp,
  readCachedEnabled,
  isAuditMode
} = require('../../utils/merchantSwitch');
const {
  applyUserBannerAdPadding,
  shouldShowUserNativeAd,
  hasShownNativeAdThisLaunch,
  markNativeAdShown
} = require('../../utils/userAds');

/** 超过该字数时首页店铺介绍截断，点击查看完整 */
const INTRO_EXPAND_CHARS = 72;

function isIntroExpandable(intro) {
  const text = String(intro || '').trim();
  if (!text) return false;
  return text.length > INTRO_EXPAND_CHARS;
}

Page({
  data: {
    userInfo: {},
    displayNickName: '小主',
    needsNickName: false,
    nickCapMode: 'nickname-input',
    currentStore: null,
    boardingPets: [],
    petsCount: 0,
    previewPets: [],
    petsMoreCount: 0,
    petPreviewSize: 'single',
    butlerDueCount: 0,
    butlerTitle: '宠物管家',
    butlerSubText: '提醒 · 指南 · 小工具',
    butlerFootText: '点开看看',
    showMerchantSwitch: false,
    auditMode: true,
    introExpandable: false,
    introPreviewVisible: false,
    introPreviewContent: '',
    inviteModalVisible: false,
    sharePets: [],
    shareSelectedCount: 0,
    invitePreparing: false,
    homeServiceCards: [],
    reservePickerVisible: false,
    reserveCardTitle: '预约服务',
    reserveCardSub: '通过商家分享链接进入后预约',
    reserveButtonText: '请先绑定店铺',
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    navTitlePad: 96,
    navTitle: '宠物寄养',
    showUserBannerAd: false,
    userTabBarHidden: false,
    userNativeAdVisible: false
  },

  _syncUserTabBar(index) {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (tabBar) tabBar.setData({ selected: index });
  },

  _initCustomNav() {
    const metrics = getCustomNavMetrics();
    let windowWidth = 375;
    try {
      const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
      windowWidth = Number(sys.windowWidth) || windowWidth;
    } catch (err) {
      // ignore
    }
    const menuLeft = metrics.menuButton && metrics.menuButton.left;
    const navTitlePad = menuLeft
      ? Math.max(12, windowWidth - menuLeft + 8)
      : 96;
    this.setData({
      statusBarHeight: metrics.statusBarHeight,
      navBarHeight: metrics.navBarHeight,
      navTotalHeight: metrics.totalHeight,
      navTitlePad
    });
  },

  _syncNavTitle(currentStore) {
    const name = currentStore && currentStore.name ? String(currentStore.name).trim() : '';
    this.setData({ navTitle: name || '宠物寄养' });
  },

  _getEntryContext() {
    const enterOptions = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {};
    const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    // 优先本次进入参数；仅当本次没有 store_id 时才回退冷启动参数
    const fromEnter = resolveEntryStoreId(app, enterOptions);
    const storeId = fromEnter || resolveEntryStoreId(app, launchOptions);
    return { storeId, enterOptions, launchOptions, fromEnter: !!fromEnter };
  },

  _isProxyClaimEntry(options) {
    return !!(
      extractProxyClaimToken(options)
      || extractProxyClaimToken(options && options.query)
      || (app.globalData && app.globalData.pendingProxyClaimToken)
    );
  },

  _applyStoreEntry(storeId, options) {
    if (!storeId) return Promise.resolve();
    if (app.shouldIgnoreShareEntry && app.shouldIgnoreShareEntry()) {
      storeDebug.log('首页 忽略客人店铺入口', { storeId });
      return refreshUserOrders(app, { force: false }).then(() => this._refreshPage());
    }
    const prevId = app.getStoreId();
    const silent = !!(options && options.silent) || this._isProxyClaimEntry(options);
    const gen = (this._storeEntryGen = (this._storeEntryGen || 0) + 1);
    this._storeEntryId = storeId;
    this._storeEntryPromise = enterStoreAndRefresh(app, storeId, options)
      .then((result) => {
        if (gen !== this._storeEntryGen) return;
        const store = (result && result.store) || app.getCurrentStore();
        const switched = !!(storeId && storeId !== prevId);
        storeDebug.log('首页分享换绑完成', {
          storeId,
          prevId,
          switched,
          storeName: (store && store.name) || '',
          silent
        });
        if (!silent && switched && store && store.name) {
          wx.showToast({ title: `已进入${store.name}`, icon: 'none' });
        }
        return this._refreshPage();
      })
      .finally(() => {
        if (gen === this._storeEntryGen) {
          this._storeEntryPromise = null;
        }
      });
    return this._storeEntryPromise;
  },

  _consumeProxyClaim(options) {
    const token = extractProxyClaimToken(options)
      || extractProxyClaimToken(wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {})
      || (app.globalData && app.globalData.pendingProxyClaimToken)
      || '';
    if (!token) return Promise.resolve();
    if (this._consumedProxyToken === token || this._proxyClaiming === token) {
      return this._proxyClaimPromise || Promise.resolve();
    }
    this._proxyClaiming = token;
    if (app.globalData) app.globalData.pendingProxyClaimToken = token;
    this._proxyClaimPromise = app.ensureCloudAndLogin()
      .then(() => claimProxyOrdersForGuest(app, token))
      .then(() => {
        this._consumedProxyToken = token;
        if (app.globalData && app.globalData.pendingProxyClaimToken === token) {
          app.globalData.pendingProxyClaimToken = '';
        }
        const refreshPets = app.loadPets ? app.loadPets({ force: true }) : Promise.resolve();
        const refreshOrders = app.loadOrders ? app.loadOrders({ force: true }) : Promise.resolve();
        return Promise.all([refreshPets.catch(() => {}), refreshOrders.catch(() => {})]);
      })
      .then(() => this._refreshPage())
      .catch((err) => {
        console.error('[代下单] 绑定到客人账号失败', err);
      })
      .finally(() => {
        if (this._proxyClaiming === token) this._proxyClaiming = '';
        this._proxyClaimPromise = null;
      });
    return this._proxyClaimPromise;
  },

  _applyAuditUi() {
    // 与商家开关同源：false 去 AI 字样，true 展示 AI
    const auditMode = isAuditMode(app);
    this.setData({
      auditMode,
      butlerTitle: auditMode ? '宠物管家' : 'AI 宠物管家'
    });
    return auditMode;
  },

  _syncMerchantSwitch(options = {}) {
    const meta = getMiniProgramMeta();
    console.log('[首页] 当前小程序版本信息', {
      envVersion: meta.envVersion || '(空)',
      localVersion: meta.version || '(空)',
      wxVersion: meta.wxVersion || '(空)',
      tip: '商家入口按 localVersion 向服务器查询；后台版本管理添加同名条目即可单独开关'
    });

    const cachedEnabled = readCachedEnabled();
    if (cachedEnabled !== null) {
      applyRemoteConfigToApp(app, {
        merchantSwitchEnabled: cachedEnabled,
        auditMode: !cachedEnabled
      });
      this.setData({ showMerchantSwitch: cachedEnabled });
      this._applyAuditUi();
    }
    return fetchRemoteAppConfig(options).then((cfg) => {
      applyRemoteConfigToApp(app, cfg);
      this.setData({ showMerchantSwitch: !!cfg.merchantSwitchEnabled });
      this._applyAuditUi();
      // 开关会影响管家标题/副文案，重新铺一遍缓存数据
      this._refreshPageFromCache();
      return cfg.merchantSwitchEnabled;
    });
  },

  onLoad(options) {
    hideHomeButton();
    this._initCustomNav();
    storeDebug.logEntryOptions('首页 onLoad', options);

    const petInvite = String((options && (options.pet_invite || options.inviteId)) || '').trim();
    if (petInvite) {
      wx.navigateTo({
        url: `/packageUser/user/pet-invite/pet-invite?pet_invite=${encodeURIComponent(petInvite)}`
      });
    }

    const sceneStoreId = options.scene ? decodeURIComponent(String(options.scene)) : '';
    const storeId = options.store_id || (sceneStoreId.startsWith('store_') ? sceneStoreId : '');

    storeDebug.log('首页 onLoad 解析 store_id', {
      fromQuery: options.store_id || '',
      fromScene: sceneStoreId,
      resolved: storeId || '(无)'
    });

    // 先用缓存铺屏，避免等网络时白屏
    this._syncNickNameCapability();
    this._refreshPageFromCache();
    this._syncMerchantSwitch();

    const proxyToken = extractProxyClaimToken(options);
    if (proxyToken && app.globalData) {
      app.globalData.pendingProxyClaimToken = proxyToken;
    }

    if (storeId) {
      // 尽早登记，避免 App 并行刷新用户时冲掉绑店
      if (app.globalData) {
        app.globalData.pendingEntryStoreId = storeId;
      }
      this._lastAppliedEnterSig = `${storeId}|onload`;
      this._applyStoreEntry(storeId, { query: options, silent: !!proxyToken })
        .then(() => this._consumeProxyClaim(options));
      return;
    }
    storeDebug.logStoreState('首页 onLoad', app);
    this._consumeProxyClaim(options);
  },

  onShow() {
    hideHomeButton();
    this._syncUserTabBar(0);
    this._setTabBarHidden(!!this.data.introPreviewVisible);
    storeDebug.log('首页 onShow');
    if (guardUserTabPage()) return;
    applyUserBannerAdPadding(this);
    this._maybeShowNativeAd();

    // 始终先渲染缓存，再静默刷新（切 Tab 回首页不阻塞 UI）
    this._refreshPageFromCache();
    this._syncMerchantSwitch();

    const { storeId, enterOptions, fromEnter } = this._getEntryContext();
    if (fromEnter && storeId) {
      const enterSig = `${storeId}|${enterOptions.scene || ''}|${(enterOptions.query && enterOptions.query.store_id) || ''}`;
      const needRebind = storeId !== app.getStoreId()
        || !app.getCurrentStore()
        || this._lastAppliedEnterSig !== enterSig;
      storeDebug.log('首页 onShow 检测到本次进入 store_id', {
        storeId,
        needRebind,
        current: app.getStoreId()
      });
      if (needRebind) {
        this._lastAppliedEnterSig = enterSig;
        this._applyStoreEntry(storeId, {
          ...enterOptions,
          query: (enterOptions && enterOptions.query) || enterOptions,
          silent: this._isProxyClaimEntry(enterOptions)
        })
          .then(() => this._consumeProxyClaim(enterOptions));
        return;
      }
    }

    this._consumeProxyClaim(enterOptions);

    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;
    const HOME_REFRESH_TTL = 45 * 1000;
    const now = Date.now();
    if (this._lastHomeRefreshAt && now - this._lastHomeRefreshAt < HOME_REFRESH_TTL) {
      return;
    }

    app.ensureCloudAndLogin({ silent: true }).then(() => {
      if (gen !== this._showGen || guardUserTabPage()) return;
      this._lastHomeRefreshAt = Date.now();

      const tasks = [
        refreshUserOrders(app, { force: false, skipDailyLogs: true }),
        app.loadPets({ force: false })
      ];
      if (app.isUserClientMode && app.isUserClientMode()) {
        const cachedStoreId = app.getStoreId();
        if (cachedStoreId) {
          // 店铺绑定后台进行，不串在关键刷新链上
          tasks.push(
            app.bindStore(cachedStoreId, {
              syncUser: false,
              force: !app.getCurrentStore()
            }).then(() => {
              app._flushPendingStoreBinding();
            })
          );
        }
      }
      return Promise.all(tasks).finally(() => {
        if (gen !== this._showGen) return;
        this._refreshPage();
      });
    });
  },

  onPullDownRefresh() {
    if (guardUserTabPage()) {
      wx.stopPullDownRefresh();
      return;
    }
    this._lastHomeRefreshAt = 0;
    refreshUserOrders(app, { force: true })
      .then(() => this._refreshPage())
      .catch((err) => {
        console.error('[首页] 下拉刷新失败', err);
        this._refreshPageFromCache();
      })
      .finally(() => wx.stopPullDownRefresh());
  },

  _syncNickNameCapability() {
    const cap = getNickNameCapability();
    this.setData({ nickCapMode: cap.mode });
  },

  _buildUserViewState(userInfo) {
    const user = userInfo || {};
    const needsNickName = !isAuthorizedNickName(user.nickName);
    return {
      userInfo: user,
      displayNickName: getDisplayNickName(user),
      needsNickName
    };
  },

  _saveNickNameFromApi(nickName) {
    const name = (nickName || '').trim();
    if (!isAuthorizedNickName(name)) return;
    if (name === (this.data.userInfo.nickName || '')) {
      this.setData(this._buildUserViewState({ ...this.data.userInfo, nickName: name }));
      return;
    }
    app.updateProfile({ nickName: name })
      .then(() => {
        this._refreshPageFromCache();
      })
      .catch((err) => {
        console.error('[首页] 保存昵称失败', err);
      });
  },

  _hashSeed(value) {
    const text = String(value || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  },

  _buildPetPreview(pets) {
    const list = Array.isArray(pets) ? pets : [];
    const maxShow = 3;
    const sliced = list.slice(0, maxShow);
    const count = sliced.length;
    const sizeMap = { 0: 'single', 1: 'single', 2: 'double', 3: 'triple' };

    // 第一只固定在初始位置；第 2 只起在区域内水平随机选槽（位置按 id 稳定）
    const firstFixed = { top: 116, right: 36 };
    const extraSlots = [
      { top: 48, left: 210 },
      { top: 52, left: 280 },
      { top: 44, left: 340 },
      { top: 178, left: 200 },
      { top: 186, left: 270 },
      { top: 172, left: 330 },
      { top: 100, left: 220 },
      { top: 196, left: 380 }
    ];

    const usedSlotIndexes = new Set();
    const previewPets = sliced.map((pet, index) => {
      if (index === 0) {
        return {
          ...pet,
          cardStyle: `top:${firstFixed.top}rpx;right:${firstFixed.right}rpx;z-index:4;`
        };
      }

      const seed = this._hashSeed(pet.id || pet.name || index);
      let slotIndex = seed % extraSlots.length;
      let guard = 0;
      while (usedSlotIndexes.has(slotIndex) && guard < extraSlots.length) {
        slotIndex = (slotIndex + 1) % extraSlots.length;
        guard += 1;
      }
      usedSlotIndexes.add(slotIndex);
      const slot = extraSlots[slotIndex];
      return {
        ...pet,
        cardStyle: `top:${slot.top}rpx;left:${slot.left}rpx;z-index:${3 + index};`
      };
    });

    const upcoming = butler.collectUpcoming(list, 7);
    const dueCount = upcoming.length;
    const auditMode = isAuditMode(app);
    let butlerSubText = auditMode ? '提醒 · 指南 · 小工具' : 'AI 问诊 · 提醒 · 小工具';
    let butlerFootText = '点开看看';
    if (list.length === 0) {
      butlerSubText = auditMode ? '提醒 · 指南 · 趣味工具' : 'AI 问诊 · 指南 · 趣味工具';
      butlerFootText = '养宠小帮手';
    } else if (dueCount > 0) {
      butlerSubText = `${dueCount} 项近期待办`;
      butlerFootText = upcoming[0].status === 'overdue' ? '有逾期事项' : '记得打卡哦';
    } else {
      butlerSubText = auditMode
        ? `${list.length} 只宝贝的管家`
        : `${list.length} 只宝贝的 AI 管家`;
      butlerFootText = '一切安好';
    }

    return {
      petsCount: list.length,
      previewPets,
      petsMoreCount: Math.max(0, list.length - maxShow),
      petPreviewSize: sizeMap[count] || 'triple',
      butlerDueCount: dueCount,
      butlerTitle: auditMode ? '宠物管家' : 'AI 宠物管家',
      butlerSubText,
      butlerFootText,
      auditMode
    };
  },

  _homeServiceCards(store) {
    return listGuestShareCards(store);
  },

  _reserveCardCopy(store, cards) {
    if (!store) {
      return {
        reserveCardTitle: '预约服务',
        reserveCardSub: '通过商家分享链接进入后预约',
        reserveButtonText: '请先绑定店铺'
      };
    }
    const list = cards || [];
    if (list.length === 1) {
      return {
        reserveCardTitle: '预约服务',
        reserveCardSub: list[0].homeSub || '点此选择服务并预约',
        reserveButtonText: '立即预约'
      };
    }
    const names = list.map((item) => item.name).filter(Boolean);
    return {
      reserveCardTitle: '预约服务',
      reserveCardSub: names.length ? `${names.join('、')}，点选后预约` : '专业照护，到店安心寄养',
      reserveButtonText: '立即预约'
    };
  },

  _applyPageData(payload) {
    const currentStore = payload.currentStore;
    const homeServiceCards = this._homeServiceCards(currentStore);
    this.setData({
      ...this._buildUserViewState(payload.userInfo),
      currentStore,
      boardingPets: payload.boardingPets,
      petsCount: payload.petsCount,
      previewPets: payload.previewPets || [],
      petsMoreCount: payload.petsMoreCount || 0,
      petPreviewSize: payload.petPreviewSize || 'single',
      butlerDueCount: payload.butlerDueCount || 0,
      butlerTitle: payload.butlerTitle || (isAuditMode(app) ? '宠物管家' : 'AI 宠物管家'),
      butlerSubText:
        payload.butlerSubText ||
        (isAuditMode(app) ? '提醒 · 指南 · 小工具' : 'AI 问诊 · 提醒 · 小工具'),
      butlerFootText: payload.butlerFootText || '点开看看',
      auditMode: typeof payload.auditMode === 'boolean' ? payload.auditMode : isAuditMode(app),
      introExpandable: isIntroExpandable(currentStore && currentStore.intro),
      homeServiceCards,
      ...this._reserveCardCopy(currentStore, homeServiceCards)
    });
    this._syncNavTitle(currentStore);
    prefetchStoreShareImage(currentStore);
  },

  _refreshPageFromCache() {
    const userInfo = app.globalData.userInfo || {};
    const pets = app.getPets();
    const storeId = app.getStoreId();
    const currentStore = app.getUserStoreView();
    const orders = app.getOrders()
      .filter((o) => !storeId || o.store_id === storeId)
      .filter((o) => o.status === 'boarding' || o.status === 'awaiting_arrival')
      .map((o) => {
        const pet = pets.find((p) => p.id === o.petId);
        return {
          ...o,
          petPhoto: pet ? pet.photo : '',
          createTimeText: formatOrderCreateTime(o) || '--',
          statusLabel: formatServiceStatus(o)
        };
      });
    this._applyPageData({
      userInfo,
      currentStore,
      boardingPets: orders,
      ...this._buildPetPreview(pets)
    });
  },

  _refreshPage() {
    // 先用本地店铺视图出字，图片解析完成后再增量更新
    this._refreshPageFromCache();
    app.getUserStoreViewDisplay().then((currentStore) => {
        const userInfo = app.globalData.userInfo || {};
        const pets = app.getPets();
        const storeId = app.getStoreId();
        storeDebug.logStoreState('首页 _refreshPage', app);
        storeDebug.log('首页店铺信息', {
          storeId,
          storeName: currentStore?.name || '',
          storeStatus: currentStore?.status || '',
          photoCount: (currentStore && currentStore.storePhotos && currentStore.storePhotos.length) || 0
        });
        const orders = app.getOrders()
          .filter((o) => !storeId || o.store_id === storeId)
          .filter((o) => o.status === 'boarding' || o.status === 'awaiting_arrival')
          .map((o) => {
            const pet = pets.find((p) => p.id === o.petId);
            return {
              ...o,
              petPhoto: pet ? pet.photo : '',
              createTimeText: formatOrderCreateTime(o) || '--',
              statusLabel: formatServiceStatus(o)
            };
          });
        this._applyPageData({
          userInfo,
          currentStore,
          boardingPets: orders,
          ...this._buildPetPreview(pets)
        });
      });
  },

  onNickNameFromApi(e) {
    // type=nickname 即微信官方昵称 API（键盘上方点选）；不提供普通手填入口
    const nickName = ((e.detail && e.detail.value) || '').trim();
    if (!isAuthorizedNickName(nickName)) return;
    this._saveNickNameFromApi(nickName);
  },

  onNickNameReview(e) {
    if (e && e.detail && e.detail.pass === false) {
      wx.showToast({ title: '昵称未通过安全检测', icon: 'none' });
    }
  },

  onGetNickNameProfile() {
    if (typeof wx.getUserProfile !== 'function') {
      this.onNickNameUnsupported();
      return;
    }
    wx.getUserProfile({
      desc: '用于展示你的昵称',
      success: (res) => {
        const nickName = ((res && res.userInfo && res.userInfo.nickName) || '').trim();
        if (!isAuthorizedNickName(nickName)) {
          wx.showToast({
            title: '请升级微信后重试',
            icon: 'none'
          });
          return;
        }
        this._saveNickNameFromApi(nickName);
      },
      fail: () => {
        wx.showToast({ title: '需要授权微信昵称', icon: 'none' });
      }
    });
  },

  onNickNameUnsupported() {
    wx.showToast({
      title: '请升级微信后获取昵称',
      icon: 'none'
    });
  },

  onPreviewStorePhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.currentStore && this.data.currentStore.storePhotos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onPreviewIntroPhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.currentStore && this.data.currentStore.introPhotos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  _setTabBarHidden(hidden) {
    const next = !!hidden;
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar();
      if (tabBar && typeof tabBar.setData === 'function') {
        tabBar.setData({ hidden: next });
      }
    }
    if (this.data.userTabBarHidden !== next) {
      this.setData({ userTabBarHidden: next });
    }
  },

  _maybeShowNativeAd() {
    if (!shouldShowUserNativeAd()) return;
    if (hasShownNativeAdThisLaunch()) return;
    if (this.data.inviteModalVisible || this.data.introPreviewVisible || this.data.reservePickerVisible) {
      return;
    }
    setTimeout(() => {
      if (hasShownNativeAdThisLaunch()) return;
      if (this.data.inviteModalVisible || this.data.introPreviewVisible || this.data.reservePickerVisible) {
        return;
      }
      if (!markNativeAdShown()) return;
      this.setData({ userNativeAdVisible: true });
    }, 360);
  },

  onCloseUserNativeAd() {
    this.setData({ userNativeAdVisible: false });
  },

  onOpenIntroPreview(e) {
    const expandable = e.currentTarget.dataset.expandable;
    if (!(expandable === true || expandable === 'true')) return;
    const content = String((this.data.currentStore && this.data.currentStore.intro) || '').trim();
    if (!content) return;
    this._setTabBarHidden(true);
    this.setData({
      introPreviewVisible: true,
      introPreviewContent: content
    });
  },

  onCloseIntroPreview() {
    this._setTabBarHidden(false);
    this.setData({
      introPreviewVisible: false,
      introPreviewContent: ''
    });
  },

  onIntroPreviewTouchMove() {},

  onHide() {
    if (!this.data.inviteModalVisible && !this.data.introPreviewVisible) {
      this._setTabBarHidden(false);
    }
  },

  onOpenStoreLocation() {
    const store = this.data.currentStore;
    if (!store || !store.hasLocation) {
      if (store && store.address) {
        wx.showToast({ title: '暂无地图定位，请联系商家', icon: 'none' });
      }
      return;
    }
    wx.openLocation({
      latitude: parseFloat(store.latitude),
      longitude: parseFloat(store.longitude),
      name: store.name || '店铺',
      address: store.address || '',
      scale: 18
    });
  },

  onCallStore(e) {
    const phone = String(e.currentTarget.dataset.phone || '').trim();
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onCopyStoreWechat() {
    const wechatId = this.data.currentStore && this.data.currentStore.wechatId;
    copyText(wechatId, '已复制微信号');
  },

  _navigateToReserve(line) {
    const key = String(line || '').trim();
    const url = key
      ? `/packageUser/user/reserve/reserve?serviceLine=${encodeURIComponent(key)}`
      : '/packageUser/user/reserve/reserve';
    wx.navigateTo({ url });
  },

  onGoReserve() {
    const storeId = app.getStoreId();
    const currentStore = app.getCurrentStore();
    if (!storeId || !currentStore) {
      wx.showModal({
        title: '暂无法预约',
        content: '您还未绑定店铺，请先通过商家分享链接进入店铺后再预约服务。',
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }
    const cards = this.data.homeServiceCards || [];
    if (cards.length > 1) {
      this.setData({ reservePickerVisible: true });
      return;
    }
    this._navigateToReserve(cards.length === 1 ? cards[0].key : '');
  },

  onCloseReservePicker() {
    this.setData({ reservePickerVisible: false });
  },

  onReservePickerTouchMove() {},

  onPickReserveService(e) {
    const line = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.line) || '').trim();
    this.setData({ reservePickerVisible: false });
    this._navigateToReserve(line);
  },
  onGoPets() { wx.navigateTo({ url: '/packageUser/user/pets/pets' }); },
  onGoPetButler() { wx.navigateTo({ url: '/packageUser/user/pet-butler/pet-butler' }); },
  onGoOrders() { wx.switchTab({ url: '/pages/orders/orders' }); },
  onGoDaily(e) { wx.navigateTo({ url: '/packageUser/user/pet-daily/pet-daily?id=' + e.currentTarget.dataset.id }); },

  _countSelectedSharePets(sharePets) {
    return (sharePets || []).filter((item) => item.selected).length;
  },

  _ownedShareablePets(pets) {
    return (pets || []).filter((pet) => pet && pet.id && pet.isOwner !== false && !pet.isShared);
  },

  onOpenInviteFamily() {
    wx.showLoading({ title: '加载中', mask: true });
    app.loadPets({ force: true })
      .then((pets) => {
        const owned = this._ownedShareablePets(pets);
        if (!owned.length) {
          wx.hideLoading();
          wx.showToast({ title: '请先添加自己的宠物', icon: 'none' });
          return;
        }
        const sharePets = owned.map((pet) => ({
          id: pet.id,
          name: pet.name || '我的宝贝',
          photo: pet.photo || '',
          type: pet.type || '',
          selected: true,
          inviteId: ''
        }));
        this._setTabBarHidden(true);
        this.setData({
          inviteModalVisible: true,
          sharePets,
          shareSelectedCount: sharePets.length,
          invitePreparing: true
        });
        wx.hideLoading();
        return this._prepareInvitesForSelected();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '加载失败',
          icon: 'none'
        });
      });
  },

  onCloseInviteFamily() {
    this._setTabBarHidden(!!this.data.introPreviewVisible);
    this.setData({
      inviteModalVisible: false,
      sharePets: [],
      shareSelectedCount: 0,
      invitePreparing: false
    });
  },

  onInviteModalTouchMove() {},

  onToggleSharePet(e) {
    const id = e.currentTarget.dataset.id;
    const sharePets = (this.data.sharePets || []).map((item) => (
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
    this.setData({
      sharePets,
      shareSelectedCount: this._countSelectedSharePets(sharePets)
    });
    const target = sharePets.find((item) => item.id === id);
    if (target && target.selected && !target.inviteId) {
      this._prepareInvitesForSelected();
    }
  },

  onSelectAllSharePets() {
    const sharePets = (this.data.sharePets || []).map((item) => ({ ...item, selected: true }));
    this.setData({
      sharePets,
      shareSelectedCount: sharePets.length
    });
    this._prepareInvitesForSelected();
  },

  onClearSharePets() {
    const sharePets = (this.data.sharePets || []).map((item) => ({ ...item, selected: false }));
    this.setData({
      sharePets,
      shareSelectedCount: 0
    });
  },

  _prepareInvitesForSelected() {
    const need = (this.data.sharePets || []).filter((item) => item.selected && !item.inviteId);
    if (!need.length) {
      this.setData({ invitePreparing: false });
      return Promise.resolve();
    }
    this.setData({ invitePreparing: true });
    return Promise.all(need.map((pet) => (
      petApi.createPetShareInvite(pet.id)
        .then((res) => ({ id: pet.id, inviteId: (res && res.inviteId) || '' }))
        .catch(() => ({ id: pet.id, inviteId: '' }))
    ))).then((results) => {
      const map = {};
      results.forEach((item) => {
        if (item.inviteId) map[item.id] = item.inviteId;
      });
      const sharePets = (this.data.sharePets || []).map((item) => (
        map[item.id] ? { ...item, inviteId: map[item.id] } : item
      ));
      this.setData({ sharePets, invitePreparing: false });
      const failed = need.filter((pet) => !map[pet.id]);
      if (failed.length) {
        wx.showToast({ title: '部分邀请生成失败', icon: 'none' });
      }
    });
  },

  onSwitchToMerchant() {
    // 统一走 enterMerchantMode：非正式版 / 开关关闭都会拦截（含已入驻）
    if (app.enterMerchantMode) {
      app.enterMerchantMode();
      return;
    }
    fetchRemoteAppConfig({ force: true }).then((cfg) => {
      applyRemoteConfigToApp(app, cfg);
      this.setData({ showMerchantSwitch: !!cfg.merchantSwitchEnabled });
      this._applyAuditUi();
      if (!cfg.merchantSwitchEnabled) {
        wx.showToast({ title: '商家入口暂未开放', icon: 'none' });
        return;
      }
      wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
    });
  },

  onShareAppMessage() {
    const selected = (this.data.sharePets || []).filter((item) => item.selected && item.inviteId);
    if (this.data.inviteModalVisible && selected.length) {
      const ids = selected.map((item) => item.inviteId).join(',');
      const title = selected.length === 1
        ? `邀请你一起照顾${selected[0].name}`
        : `邀请你一起照顾我家的${selected.length}只毛孩子`;
      return {
        title,
        path: `/packageUser/user/pet-invite/pet-invite?pet_invite=${encodeURIComponent(ids)}`
      };
    }
    const store = app.getUserStoreView() || app.getShop() || {};
    const storeId = app.getShareStoreId();
    const config = buildStoreShareConfig(store, storeId);
    storeDebug.logShareConfig(storeId ? '转发好友' : '转发好友-无店铺', config);
    return config;
  },

  onShareTimeline() {
    const store = app.getUserStoreView() || app.getShop() || {};
    const storeId = app.getShareStoreId();
    const config = buildTimelineShareConfig(store, storeId);
    storeDebug.logShareConfig(storeId ? '朋友圈' : '朋友圈-无店铺', config);
    return config;
  }
});
