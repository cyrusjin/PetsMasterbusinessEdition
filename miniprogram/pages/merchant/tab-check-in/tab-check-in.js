const { callApiService, rejectOnFailure } = require('../../../utils/api');
const { hideHomeButton } = require('../../../utils/navBar');
const { writeCheckInHint } = require('../../../utils/checkInHint');
const {
  redirectToStoreAuthIfNeeded,
  redirectToUserIfMerchantUiBlocked,
  ensureMerchantPageAllowed,
  redirectToUserIfClientMode,
  isCurrentPage,
  beginMerchantTabStay
} = require('../../../utils/shell');

function getAppSafe() {
  try {
    return typeof getApp === 'function' ? getApp() : null;
  } catch (err) {
    return null;
  }
}

function getDailyCheckInStatus(storeId) {
  return callApiService('storeService', { action: 'getDailyCheckInStatus', store_id: storeId || '' })
    .then((res) => rejectOnFailure(res, '加载签到活动失败'));
}

function claimDailyCheckIn(storeId) {
  return callApiService('storeService', { action: 'claimDailyCheckIn', store_id: storeId || '' })
    .then((res) => rejectOnFailure(res, '签到失败'));
}

const CYCLE_DAYS = 21;
const MERCHANT_HOME = '/pages/merchant/tab-daily/tab-daily';
const CHECK_IN_CACHE_TTL = 2 * 60 * 1000;

let checkInCache = null;
let checkInInflight = null;

function chinaDateKey(timestamp = Date.now()) {
  try {
    return new Date(Number(timestamp) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  } catch (err) {
    return '';
  }
}

function readCheckInCache(storeId) {
  if (!checkInCache || checkInCache.storeId !== storeId) return null;
  if (checkInCache.dateKey !== chinaDateKey()) return null;
  return checkInCache;
}

function writeCheckInCache(storeId, payload) {
  if (!storeId || !payload) return;
  checkInCache = {
    storeId,
    dateKey: chinaDateKey(),
    at: Date.now(),
    payload
  };
}

function fetchCheckInStatus(storeId) {
  if (checkInInflight && checkInInflight.storeId === storeId) return checkInInflight.promise;
  const promise = getDailyCheckInStatus(storeId).finally(() => {
    if (checkInInflight && checkInInflight.promise === promise) checkInInflight = null;
  });
  checkInInflight = { storeId, promise };
  return promise;
}

function chinaDateParts(timestamp) {
  const ms = Number(timestamp) || 0;
  if (!ms) return null;
  try {
    const iso = new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const parts = iso.split('-').map((item) => Number(item));
    if (parts.length !== 3 || parts.some((item) => !item)) return null;
    return { year: parts[0], month: parts[1], day: parts[2] };
  } catch (err) {
    return null;
  }
}

function formatCampaignExpire(expireAt, daysLeft = CYCLE_DAYS) {
  const fallbackAt = Date.now() + Math.max(1, Number(daysLeft) || CYCLE_DAYS) * 86400000;
  const parts = chinaDateParts(Number(expireAt) || fallbackAt);
  if (!parts) return { text: '', short: '' };
  return {
    text: `${parts.year}年${parts.month}月${parts.day}日`,
    short: `${parts.month}月${parts.day}日`
  };
}

function campaignDeadlineFrom(membership = {}) {
  const daysLeft = Math.max(0, Number(membership.checkInCampaignDaysLeft) || 0);
  const remaining = daysLeft > 0
    ? daysLeft
    : (Number(membership.checkInCampaignExpireAt) ? 0 : CYCLE_DAYS);
  const formatted = formatCampaignExpire(membership.checkInCampaignExpireAt, remaining || CYCLE_DAYS);
  return {
    checkInCampaignDaysLeft: remaining,
    checkInCampaignExpireText: formatted.text,
    checkInCampaignExpireShort: formatted.short
  };
}

function buildProgress(cycleDay = 0, checkedToday = false) {
  const completed = Math.max(0, Math.min(CYCLE_DAYS, Number(cycleDay) || 0));
  const currentDay = Math.min(completed + 1, CYCLE_DAYS);
  return Array.from({ length: CYCLE_DAYS }, (_, index) => {
    const day = index + 1;
    const isCompleted = day <= completed;
    const isCurrent = day === currentDay && !checkedToday;
    const isMilestone = day === 7 || day === 14 || day === CYCLE_DAYS;
    let nodeClass = 'trail-node';
    if (isCompleted) nodeClass += ' completed';
    if (isCurrent) nodeClass += ' current';
    if (isMilestone) nodeClass += ' milestone';
    return {
      day,
      nodeClass,
      showCheck: isCompleted,
      showGift: !isCompleted && day === CYCLE_DAYS,
      rewardText: day === CYCLE_DAYS ? '1个月' : '+1天'
    };
  });
}

function normalizeCheckIn(source) {
  const value = source || {};
  const cycleDay = Math.max(0, Math.min(CYCLE_DAYS, Number(value.cycleDay) || 0));
  const checkedToday = !!value.checkedToday;
  return {
    checkedToday,
    currentStreak: Math.max(0, Number(value.currentStreak) || 0),
    cycleDay,
    daysToBonus: Math.max(0, Number(value.daysToBonus != null ? value.daysToBonus : CYCLE_DAYS - cycleDay) || 0),
    totalCheckIns: Math.max(0, Number(value.totalCheckIns) || 0),
    todayRewardDays: Number(value.todayRewardDays) || 1,
    streakRewardMonths: Number(value.streakRewardMonths) || 1,
    cycleDays: Number(value.cycleDays) || CYCLE_DAYS,
    progress: buildProgress(cycleDay, checkedToday)
  };
}

function statusPaintKey(res, fromExpired, restoredAccess) {
  const checkIn = (res && res.checkIn) || {};
  const membership = (res && res.membership) || {};
  return [
    !!checkIn.checkedToday,
    Number(checkIn.cycleDay) || 0,
    Number(checkIn.currentStreak) || 0,
    Number(checkIn.totalCheckIns) || 0,
    Number(checkIn.daysToBonus) || 0,
    Number(membership.checkInCampaignExpireAt) || 0,
    !!membership.active,
    !!membership.accessActive,
    !!fromExpired,
    !!restoredAccess
  ].join('|');
}

function demoCheckIn() {
  return normalizeCheckIn({
    checkedToday: false,
    currentStreak: 6,
    cycleDay: 6,
    daysToBonus: 15,
    totalCheckIns: 18,
    todayRewardDays: 1,
    streakRewardMonths: 1,
    cycleDays: CYCLE_DAYS
  });
}

function viewStateFrom(checkIn, extra = {}) {
  const checkedToday = !!(checkIn && checkIn.checkedToday);
  let checkHintText = '';
  if (checkedToday && Number(checkIn.daysToBonus) > 0) {
    checkHintText = `能量已补给，明天继续 · 再签到 ${checkIn.daysToBonus} 天解锁月卡`;
  } else if (checkedToday) {
    checkHintText = '本轮月卡宝箱已解锁，明天开启新一轮冒险';
  }
  return {
    checkIn,
    checkButtonText: checkedToday ? '今日已签到' : '签到领取 1 天会员',
    checkDisabled: extra.checking || extra.loading || checkedToday,
    checkHintText,
    ...extra,
    showExpiredBanner: extra.showExpiredBanner != null
      ? extra.showExpiredBanner
      : !!(extra.membershipExpired && !checkedToday),
    hideTabBar: extra.hideTabBar != null
      ? extra.hideTabBar
      : !!(!extra.isDemoMode && extra.membershipExpired)
  };
}

Page({
  data: viewStateFrom(normalizeCheckIn({}), {
    loading: true,
    checking: false,
    isDemoMode: false,
    fromExpired: false,
    membershipExpired: false,
    restoredAccess: false,
    checkInCampaignDaysLeft: 21,
    checkInCampaignExpireText: '',
    checkInCampaignExpireShort: '',
    rewardVisible: false,
    rewardDays: 1,
    bonusMonths: 0,
    showRewardProgress: true,
    rewardConfirmText: '开心收下'
  }),

  onLoad(options) {
    try {
      hideHomeButton();
      beginMerchantTabStay('pages/merchant/tab-check-in/tab-check-in');
      const fromExpired = !!(options && String(options.fromExpired || '') === '1');
      const app = getAppSafe();
      const shop = (app && app.getShop && app.getShop()) || (app && app.globalData && app.globalData.shop) || {};
      this.setData({
        fromExpired,
        membershipExpired: fromExpired,
        showExpiredBanner: fromExpired,
        hideTabBar: fromExpired,
        ...campaignDeadlineFrom(shop.membership)
      });
      const storeId = String((shop && shop.store_id) || '').trim();
      const cached = storeId ? readCheckInCache(storeId) : null;
      if (cached && cached.payload) this._paintStatus(cached.payload);
    } catch (err) {
      // keep defaults so the page still paints
    }
  },

  onShow() {
    try {
      hideHomeButton();
      beginMerchantTabStay('pages/merchant/tab-check-in/tab-check-in');
      if (redirectToUserIfMerchantUiBlocked()) return;
      ensureMerchantPageAllowed({ skipMembership: true }).then((blocked) => {
        if (blocked || !isCurrentPage(this) || redirectToUserIfClientMode()) return;
        if (redirectToStoreAuthIfNeeded()) return;
        this.loadStatus();
      }).catch(() => {
        if (isCurrentPage(this)) this.loadStatus();
      });
    } catch (err) {
      this.loadStatus();
    }
  },

  _getStoreId() {
    try {
      const app = getAppSafe();
      const shop = (app && app.getShop && app.getShop()) || (app && app.globalData && app.globalData.shop) || {};
      return String((shop && shop.store_id) || '').trim();
    } catch (err) {
      return '';
    }
  },

  _isAccessActive(membership) {
    if (!membership || typeof membership !== 'object') return false;
    return !!(membership.active
      || membership.accessActive
      || membership.subscriptionActive
      || membership.trialActive
      || membership.migrationActive
      || membership.promotionActive);
  },

  _applyMembership(membership) {
    if (!membership) return;
    try {
      const currentApp = getAppSafe();
      const shop = (currentApp && currentApp.getShop && currentApp.getShop()) || (currentApp && currentApp.globalData && currentApp.globalData.shop) || {};
      const storeId = String((shop && shop.store_id) || this._getStoreId() || '').trim();
      if (typeof membership.checkedToday === 'boolean' && storeId) {
        writeCheckInHint(storeId, membership.checkedToday);
      }
      if (!shop.store_id || !currentApp || !currentApp.saveShop) return;
      currentApp.saveShop({ ...shop, membership: { ...(shop.membership || {}), ...membership } });
    } catch (err) {
      // ignore
    }
  },

  _leaveIfCampaignEnded(membership) {
    if (this.data.isDemoMode) return false;
    if (!membership || membership.checkInCampaignActive !== false) return false;
    this._applyMembership(membership);
    this._syncCheckInTab();
    // 用户刚点进签到页时不要自动踢回日常；活动结束只同步底栏
    return false;
  },

  _syncCheckInTab() {
    const tabBar = this.selectComponent('#merchantTabBar');
    if (tabBar && typeof tabBar._syncBizTabs === 'function') tabBar._syncBizTabs();
  },

  _paintStatus(res) {
    const key = statusPaintKey(res, this.data.fromExpired, this.data.restoredAccess);
    if (this._statusPaintKey === key) return false;
    this._statusPaintKey = key;
    const remoteMembership = (res && res.membership) || {};
    const checkIn = normalizeCheckIn(res && res.checkIn);
    writeCheckInHint(this._getStoreId(), !!checkIn.checkedToday);
    this._applyMembership({ ...remoteMembership, checkedToday: !!checkIn.checkedToday });
    if (this._leaveIfCampaignEnded(remoteMembership)) return true;
    const membershipExpired = !this._isAccessActive(remoteMembership);
    const hideTabBar = membershipExpired || (this.data.fromExpired && !this.data.restoredAccess);
    this.setData(viewStateFrom(checkIn, {
      loading: false,
      checking: false,
      isDemoMode: false,
      membershipExpired,
      showExpiredBanner: membershipExpired && !(res.checkIn && res.checkIn.checkedToday),
      hideTabBar,
      ...campaignDeadlineFrom(remoteMembership)
    }));
    this._syncCheckInTab();
    return false;
  },

  loadStatus() {
    const app = getAppSafe();
    const isDemoMode = !!(app && app.isMerchantDemoMode && app.isMerchantDemoMode());
    if (isDemoMode) {
      this.setData(viewStateFrom(demoCheckIn(), {
        loading: false,
        checking: false,
        isDemoMode: true,
        membershipExpired: false,
        showExpiredBanner: false,
        hideTabBar: false,
        ...campaignDeadlineFrom({
          checkInCampaignExpireAt: Date.now() + CYCLE_DAYS * 86400000,
          checkInCampaignDaysLeft: CYCLE_DAYS
        })
      }));
      return Promise.resolve();
    }
    const storeId = this._getStoreId();
    if (!storeId) {
      this.setData({ loading: false, checkDisabled: !!this.data.checkIn.checkedToday });
      return Promise.resolve();
    }
    const cached = readCheckInCache(storeId);
    if (cached && cached.payload) {
      this._paintStatus(cached.payload);
      if (Date.now() - cached.at < CHECK_IN_CACHE_TTL) return Promise.resolve();
      return fetchCheckInStatus(storeId)
        .then((res) => {
          if (!isCurrentPage(this)) return;
          writeCheckInCache(storeId, res);
          this._paintStatus(res);
        })
        .catch(() => {});
    }
    this.setData({ loading: true, isDemoMode: false, checkDisabled: true });
    return fetchCheckInStatus(storeId)
      .then((res) => {
        if (!isCurrentPage(this)) return;
        writeCheckInCache(storeId, res);
        this._paintStatus(res);
      })
      .catch(() => {
        if (!isCurrentPage(this)) return;
        this.setData({
          loading: false,
          checkDisabled: !!this.data.checkIn.checkedToday
        });
      });
  },

  onCheckIn() {
    if (this.data.checking || this.data.checkIn.checkedToday) return;
    if (this.data.isDemoMode) {
      const nextDay = Math.min(CYCLE_DAYS, this.data.checkIn.cycleDay + 1);
      const restoredAccess = this.data.fromExpired || this.data.membershipExpired;
      const next = normalizeCheckIn({
        ...this.data.checkIn,
        checkedToday: true,
        currentStreak: this.data.checkIn.currentStreak + 1,
        cycleDay: nextDay,
        daysToBonus: nextDay === CYCLE_DAYS ? 0 : CYCLE_DAYS - nextDay,
        totalCheckIns: this.data.checkIn.totalCheckIns + 1
      });
        this.setData(viewStateFrom(next, {
          rewardDays: 1,
          bonusMonths: nextDay === CYCLE_DAYS ? 1 : 0,
          rewardVisible: true,
          showRewardProgress: nextDay !== CYCLE_DAYS,
          membershipExpired: false,
          showExpiredBanner: false,
          hideTabBar: false,
          restoredAccess,
          rewardConfirmText: restoredAccess ? '进入日常管理' : '开心收下'
        }));
      this._applyMembership({ checkedToday: true, checkInCampaignActive: true });
      this._syncCheckInTab();
      wx.vibrateShort({ type: 'light' });
      return;
    }
    const storeId = this._getStoreId();
    if (!storeId) return;
    const wasExpired = this.data.membershipExpired || this.data.fromExpired;
    this.setData({ checking: true, checkDisabled: true });
    claimDailyCheckIn(storeId)
      .then((res) => {
        const checkIn = normalizeCheckIn(res.checkIn);
        const membership = res.membership || {};
        const accessActive = this._isAccessActive(membership);
        const restoredAccess = wasExpired && accessActive && !res.duplicate;
        this._applyMembership({ ...membership, checkedToday: true });
        writeCheckInCache(storeId, { checkIn, membership: { ...membership, checkedToday: true } });
        this._statusPaintKey = statusPaintKey(
          { checkIn, membership },
          this.data.fromExpired,
          restoredAccess
        );
        this.setData(viewStateFrom(checkIn, {
          checking: false,
          rewardDays: Number(res.rewardDays) || 1,
          bonusMonths: Number(res.bonusMonths) || 0,
          rewardVisible: !res.duplicate,
          showRewardProgress: !(Number(res.bonusMonths) > 0),
          membershipExpired: !accessActive,
          hideTabBar: !accessActive,
          restoredAccess,
          rewardConfirmText: restoredAccess ? '进入日常管理' : '开心收下'
        }));
        this._syncCheckInTab();
        if (res.duplicate) wx.showToast({ title: '今天已经签到啦', icon: 'none' });
        else wx.vibrateShort({ type: 'medium' });
      })
      .catch((err) => {
        this.setData({
          checking: false,
          checkDisabled: !!this.data.checkIn.checkedToday
        });
        wx.showToast({ title: (err && err.message) || '签到失败，请稍后重试', icon: 'none', duration: 2500 });
      });
  },

  onCloseReward() {
    this.setData({ rewardVisible: false });
  },

  onConfirmReward() {
    if (this.data.restoredAccess) {
      wx.reLaunch({ url: MERCHANT_HOME });
      return;
    }
    this.setData({ rewardVisible: false });
  },

  onEnterMerchant() {
    wx.reLaunch({ url: MERCHANT_HOME });
  },

  onBackMembership() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/packageExtra/membership/membership?required=1' });
      }
    });
  },

  preventMove() {}
});
