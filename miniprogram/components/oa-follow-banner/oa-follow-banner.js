const { isOaBound, openOfficialAccountProfile } = require('../../utils/officialAccount');

Component({
  data: {
    visible: false
  },

  lifetimes: {
    attached() {
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
    _readLocalUser() {
      try {
        const app = getApp();
        return (app.globalData && app.globalData.userInfo) || {};
      } catch (err) {
        return {};
      }
    },

    _syncVisible(user) {
      const bound = isOaBound(user || this._readLocalUser());
      this.setData({ visible: !bound });
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
      openOfficialAccountProfile({
        onComplete: () => {
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
      });
    }
  }
});
