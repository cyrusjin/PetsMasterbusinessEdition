const app = getApp();
const membershipApi = require('../utils/membership');
const { hideHomeButton } = require('../../utils/navBar');

const DEFAULT_MEMBERSHIP = {
  active: false,
  accessActive: false,
  subscriptionActive: false,
  trialActive: false,
  migrationActive: false,
  promotionActive: false,
  statusType: 'expired',
  statusLabel: '试用已结束',
  statusTitle: '开通会员，继续使用全部功能',
  statusDesc: '试用结束后需订阅会员才能继续使用平台',
  expireAtText: '',
  trialExpireAtText: '',
  trialDaysRemaining: 0,
  enabled: true,
  payConfigured: false,
  canPurchase: false
};

const DEFAULT_PLANS = [
  { code: 'pro_monthly', name: '月付', priceYuan: '19.9', originalPriceYuan: '', periodText: '1个月', priceUnit: '月', badge: '' },
  { code: 'pro_half_yearly', name: '半年付', priceYuan: '99', originalPriceYuan: '119.4', periodText: '6个月', priceUnit: '半年', badge: '省¥20.4' },
  { code: 'pro_yearly', name: '年付', priceYuan: '169', originalPriceYuan: '238.8', periodText: '1年', priceUnit: '年', badge: '省¥69.8' }
];

function normalizeMembership(raw) {
  const source = raw || {};
  const trialActive = !!(source.trialActive || source.trial_active || source.accessType === 'trial');
  const migrationActive = !!(source.migrationActive || source.migration_active || source.accessType === 'migration');
  const promotionActive = !!(source.promotionActive || source.promotion_active || source.accessType === 'promotion');
  const subscriptionActive = source.subscriptionActive != null
    ? !!source.subscriptionActive
    : (source.subscription_active != null ? !!source.subscription_active : (!!source.active && !trialActive && !migrationActive && !promotionActive));
  const accessActive = trialActive || subscriptionActive || migrationActive || promotionActive || !!source.active;
  const expireAtText = source.expireAtText || source.expire_at_text || '';
  const trialExpireAtText = source.trialExpireAtText || source.trial_expire_at_text || expireAtText;
  let statusType = 'expired';
  let statusLabel = '试用已结束';
  let statusTitle = '开通会员，继续使用全部功能';
  let statusDesc = '试用结束后需订阅会员才能继续使用平台';
  if (subscriptionActive) {
    statusType = 'subscribed';
    statusLabel = '会员生效中';
    statusTitle = '会员权益已生效';
    statusDesc = expireAtText ? `订阅有效期至 ${expireAtText}` : '已解锁平台全部经营功能';
  } else if (promotionActive) {
    statusType = 'granted';
    statusLabel = '推广权益中';
    statusTitle = '推广奖励已生效';
    statusDesc = expireAtText ? `使用权限有效期至 ${expireAtText}` : '推广审核已通过，平台功能已开放';
  } else if (migrationActive) {
    statusType = 'granted';
    statusLabel = '老用户限免';
    statusTitle = '老用户免费使用中';
    statusDesc = expireAtText ? `限免权益有效期至 ${expireAtText}` : '可免费使用至 2026 年 9 月 10 日';
  } else if (trialActive) {
    const days = Number(source.trialDaysRemaining != null ? source.trialDaysRemaining : source.trial_days_remaining) || 0;
    statusType = 'trial';
    statusLabel = '免费试用中';
    statusTitle = days > 0 ? `还剩 ${days} 天免费试用` : '7 天免费试用中';
    statusDesc = trialExpireAtText ? `试用有效期至 ${trialExpireAtText}` : '试用期内可使用平台全部功能';
  }
  return {
    ...DEFAULT_MEMBERSHIP,
    ...source,
    active: accessActive,
    accessActive,
    subscriptionActive,
    trialActive,
    migrationActive,
    promotionActive,
    statusType,
    statusLabel,
    statusTitle,
    statusDesc,
    expireAtText,
    trialExpireAtText,
    trialDaysRemaining: Number(source.trialDaysRemaining != null ? source.trialDaysRemaining : source.trial_days_remaining) || 0
  };
}

function normalizePlans(plans) {
  const source = Array.isArray(plans) ? plans : [];
  const remoteByCode = {};
  source.forEach((plan) => {
    if (plan && plan.code) remoteByCode[plan.code] = plan;
  });
  return DEFAULT_PLANS.map((plan) => {
    const remote = remoteByCode[plan.code] || {};
    return {
      ...plan,
      ...['name', 'priceYuan', 'originalPriceYuan', 'periodText', 'badge'].reduce((result, key) => {
        if (remote[key] != null) result[key] = remote[key];
        return result;
      }, {})
    };
  });
}

Page({
  data: {
    unavailable: false,
    accessRequired: false,
    membership: { ...DEFAULT_MEMBERSHIP },
    plans: DEFAULT_PLANS,
    selectedPlan: 'pro_yearly',
    redeemCode: '',
    paying: false,
    redeeming: false
  },

  onLoad(options) {
    const accessRequired = !!(options && String(options.required || '') === '1');
    this.setData({ accessRequired });
    if (accessRequired) hideHomeButton();
  },

  onShow() {
    if (this.data.accessRequired) hideHomeButton();
    this.load();
  },

  _getStoreId() {
    const shop = app.getShop ? app.getShop() : (app.globalData.shop || {});
    return (shop && shop.store_id) || '';
  },

  _leaveLockedPageIfActive(membership, delay = 300) {
    if (!this.data.accessRequired || !(membership && membership.accessActive)) return;
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
    }, delay);
  },

  load() {
    const storeId = this._getStoreId();
    if (!storeId) {
      this.setData({ unavailable: true });
      return;
    }
    membershipApi.getMembershipStatus(storeId)
      .then((res) => {
        const membership = normalizeMembership(res.membership);
        const plans = normalizePlans(res.plans);
        this.setData({ unavailable: false, membership, plans });
        this._leaveLockedPageIfActive(membership);
      })
      .catch((err) => {
        this.setData({ unavailable: true });
        wx.showToast({ title: (err && err.message) || '订阅服务暂不可用', icon: 'none' });
      });
  },

  onSelectPlan(e) {
    if (!this.data.membership.canPurchase) return;
    const code = e.currentTarget.dataset.code;
    if (code) this.setData({ selectedPlan: code });
  },

  onGoPromotion() {
    wx.navigateTo({ url: '/packageExtra/promotion-tasks/promotion-tasks' });
  },

  onRedeemInput(e) {
    this.setData({ redeemCode: String(e.detail.value || '').replace(/\s/g, '').toUpperCase() });
  },

  onRedeem() {
    if (this.data.redeeming) return;
    if (!this.data.membership.canPurchase) {
      wx.showToast({ title: '请联系店主兑换会员', icon: 'none' });
      return;
    }
    const code = String(this.data.redeemCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入兑换码', icon: 'none' });
      return;
    }
    this.setData({ redeeming: true });
    wx.showLoading({ title: '兑换中...', mask: true });
    membershipApi.redeemMembershipCode(this._getStoreId(), code)
      .then((res) => {
        wx.hideLoading();
        const membership = normalizeMembership(res.membership);
        this.setData({
          redeeming: false,
          redeemCode: '',
          unavailable: false,
          membership
        });
        const grantText = res.grantedDays
          ? `已增加${res.grantedDays}天`
          : (res.grantedMonths ? `已增加${res.grantedMonths}个月` : '兑换成功');
        wx.showToast({ title: grantText, icon: 'success' });
        if (app.refreshMerchantStore) app.refreshMerchantStore().catch(() => {});
        this._leaveLockedPageIfActive(membership, 700);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ redeeming: false });
        wx.showToast({ title: (err && err.message) || '兑换失败', icon: 'none', duration: 2500 });
      });
  },

  onPay() {
    if (this.data.paying) return;
    if (!this.data.membership.canPurchase) {
      wx.showToast({ title: '请联系店主开通会员', icon: 'none' });
      return;
    }
    if (this.data.unavailable || !this.data.membership.enabled) {
      wx.showToast({ title: '订阅服务暂不可用', icon: 'none' });
      return;
    }
    if (!this.data.membership.payConfigured) {
      wx.showToast({ title: '微信支付暂未配置，可使用兑换码开通会员', icon: 'none' });
      return;
    }
    this.setData({ paying: true });
    wx.showLoading({ title: '拉起支付...', mask: true });
    membershipApi.createMembershipPay(this._getStoreId(), this.data.selectedPlan)
      .then((res) => membershipApi.requestMembershipPayment(res.payment)
        .then(() => membershipApi.pollMembershipPaid(res.order_id)))
      .then((paidRes) => {
        wx.hideLoading();
        this.setData({ paying: false });
        const paid = !!(paidRes && (paidRes.status === 'paid' || (paidRes.membership && paidRes.membership.active)));
        if (!paid) {
          wx.showToast({ title: '支付结果确认中，请稍后刷新查看', icon: 'none', duration: 2500 });
          this.load();
          return;
        }
        let membership = null;
        if (paidRes.membership) {
          membership = normalizeMembership(paidRes.membership);
          this.setData({ membership });
        } else {
          this.load();
        }
        wx.showToast({ title: '开通成功', icon: 'success' });
        if (app.refreshMerchantStore) app.refreshMerchantStore().catch(() => {});
        this._leaveLockedPageIfActive(membership, 700);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ paying: false });
        wx.showToast({ title: err && err.cancelled ? '已取消支付' : ((err && err.message) || '支付失败'), icon: 'none', duration: 2500 });
      });
  }
});
