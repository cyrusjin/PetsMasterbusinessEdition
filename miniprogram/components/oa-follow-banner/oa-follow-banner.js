const { isOaBound } = require('../../utils/officialAccount');
const { hasMerchantApplication, hasMerchantCapability } = require('../../utils/role');

const SCENE_COPY = {
  user: {
    bannerText: '关注服务号接收毛孩子的服务动态',
    sheetTitle: '关注服务号',
    sheetHeadline: '关注服务号，接收服务动态',
    sheetDesc: '商家打卡后，服务号会第一时间通知你'
  },
  merchant: {
    bannerText: '关注服务号接收新订单提醒',
    sheetTitle: '关注服务号',
    sheetHeadline: '关注服务号，接收新订单提醒',
    sheetDesc: '有新预约或订单变更时，服务号会第一时间通知你'
  }
};

Component({
  properties: {
    scene: {
      type: String,
      value: 'user'
    }
  },

  data: {
    visible: false,
    showSheet: false,
    bannerText: SCENE_COPY.user.bannerText,
    sheetTitle: SCENE_COPY.user.sheetTitle,
    sheetHeadline: SCENE_COPY.user.sheetHeadline,
    sheetDesc: SCENE_COPY.user.sheetDesc
  },

  observers: {
    scene(value) {
      this._applySceneCopy(value);
    }
  },

  lifetimes: {
    attached() {
      this._applySceneCopy(this.properties.scene);
      this._syncVisible();
      if (this.data.visible) {
        this._refreshOaStatus();
      }
    }
  },

  pageLifetimes: {
    show() {
      this._syncVisible();
      if (this.data.visible) {
        this._refreshOaStatus();
      }
    }
  },

  methods: {
    _applySceneCopy(scene) {
      const copy = SCENE_COPY[scene] || SCENE_COPY.user;
      this.setData({
        bannerText: copy.bannerText,
        sheetTitle: copy.sheetTitle,
        sheetHeadline: copy.sheetHeadline,
        sheetDesc: copy.sheetDesc
      });
    },

    _readLocalUser() {
      try {
        const app = getApp();
        return (app.globalData && app.globalData.userInfo) || {};
      } catch (err) {
        return {};
      }
    },

    _syncVisible(user) {
      const info = user || this._readLocalUser();
      const bound = isOaBound(info);
      const isMerchantScene = this.properties.scene === 'merchant';
      const visible = !bound && (
        !isMerchantScene
        || hasMerchantApplication(info)
        || hasMerchantCapability(info)
      );
      this.setData({ visible });
      return bound;
    },

    _refreshOaStatus(options = {}) {
      const delayMs = Number(options.delayMs) || 0;
      let app = null;
      try {
        app = getApp();
      } catch (err) {
        app = null;
      }

      const run = () => {
        if (!app) {
          return Promise.resolve(this._syncVisible());
        }
        const refresh = () => {
          if (typeof app.refreshCloudUser === 'function') {
            return app.refreshCloudUser();
          }
          if (typeof app.ensureCloudAndLogin === 'function') {
            return app.ensureCloudAndLogin({ force: true, silent: true });
          }
          return Promise.resolve();
        };
        return refresh()
          .then(() => this._syncVisible())
          .catch(() => this._syncVisible());
      };

      if (delayMs > 0) {
        return new Promise((resolve) => {
          setTimeout(() => {
            run().then(resolve);
          }, delayMs);
        });
      }
      return run();
    },

    onFollowTap() {
      this.setData({ showSheet: true });
    },

    onSheetClose() {
      this.setData({ showSheet: false });
      this._refreshOaStatus();
    },

    onSheetFollowed() {
      const delays = [800, 2000, 4000];
      let chain = Promise.resolve(false);
      delays.forEach((ms) => {
        chain = chain.then((bound) => {
          if (bound) return true;
          return this._refreshOaStatus({ delayMs: ms });
        });
      });
      return chain;
    }
  }
});
