const { isCheckInCampaignActive, hasActiveMembershipAccess, isMembershipAccessKnown, beginMerchantTabStay } = require('../../utils/shell');
const { shouldShowCheckInHint, writeCheckInHint } = require('../../utils/checkInHint');

Component({
  properties: {
    active: {
      type: String,
      value: 'daily'
    },
    isDemoMode: {
      type: Boolean,
      value: false
    },
    hideBar: {
      type: Boolean,
      value: false
    }
  },
  data: {
    showBizTabs: true,
    showCheckInTab: true,
    showCheckInHint: false,
    basicReady: false,
    oaFollowSheetVisible: false
  },
  observers: {
    hideBar() {
      this._syncBizTabs();
    }
  },
  lifetimes: {
    attached() {
      this._syncBizTabs();
    }
  },
  pageLifetimes: {
    show() {
      this._syncBizTabs();
    }
  },
  methods: {
    preventMove() {},

    _go(url) {
      if (!url || this._navigating) return;
      this._navigating = true;
      beginMerchantTabStay(url);
      wx.redirectTo({
        url,
        complete: () => {
          setTimeout(() => { this._navigating = false; }, 400);
        }
      });
    },

    _syncBizTabs() {
      try {
        const app = getApp();
        const disabled = !!(app.isMerchantDisabled && app.isMerchantDisabled());
        const demo = !!(app.isMerchantDemoMode && app.isMerchantDemoMode());
        const basicReady = demo || !!(app.hasCompletedBasicStoreSetup && app.hasCompletedBasicStoreSetup());
        const shop = (app.getShop && app.getShop()) || {};
        const membership = shop.membership || {};
        const expired = !demo && isMembershipAccessKnown(membership) && !hasActiveMembershipAccess(membership);
        const showCheckInTab = demo || isCheckInCampaignActive();
        const showCheckInHint = showCheckInTab && shouldShowCheckInHint(membership, shop.store_id);
        if (membership.checkedToday === true && shop.store_id) {
          writeCheckInHint(shop.store_id, true);
        }
        const showBizTabs = !disabled && basicReady && !expired && !this.properties.hideBar;
        if (
          this.data.showBizTabs === showBizTabs
          && this.data.basicReady === basicReady
          && this.data.showCheckInTab === showCheckInTab
          && this.data.showCheckInHint === showCheckInHint
        ) return;
        this.setData({
          showBizTabs,
          basicReady,
          showCheckInTab,
          showCheckInHint
        });
      } catch (err) {
        this.setData({ showBizTabs: false, basicReady: false, showCheckInTab: false, showCheckInHint: false });
      }
    },

    onCloseOaFollowSheet() {
      this.setData({ oaFollowSheetVisible: false });
    },

    onOaFollowSheetFollowed() {},

    onTabCheckIn() {
      if (this._navigating) return;
      if (!this.data.showCheckInTab) return;
      if (!this.data.showBizTabs || !this.data.basicReady) {
        wx.showToast({ title: '请先完成基础设置', icon: 'none' });
        if (this.data.active !== 'store') {
          this._go('/pages/merchant/tab-store/tab-store');
        }
        return;
      }
      if (this.data.active === 'checkIn') return;
      this._go('/pages/merchant/tab-check-in/tab-check-in');
    },

    onTabDaily() {
      if (this._navigating) return;
      if (!this.data.showBizTabs || !this.data.basicReady) {
        wx.showToast({ title: '请先完成基础设置', icon: 'none' });
        if (this.data.active !== 'store') this._go('/pages/merchant/tab-store/tab-store');
        return;
      }
      if (this.data.active === 'daily') return;
      this._go('/pages/merchant/tab-daily/tab-daily');
    },
    onTabStatistics() {
      if (this._navigating) return;
      if (!this.data.showBizTabs || !this.data.basicReady) {
        wx.showToast({ title: '请先完成基础设置', icon: 'none' });
        if (this.data.active !== 'store') this._go('/pages/merchant/tab-store/tab-store');
        return;
      }
      if (this.data.active === 'statistics') return;
      this._go('/pages/merchant/tab-statistics/tab-statistics');
    },
    onTabStore() {
      if (this._navigating) return;
      if (this.data.active === 'store') return;
      this._go('/pages/merchant/tab-store/tab-store');
    }
  }
});
