Component({
  data: {
    selected: 0,
    isDemoMode: false
  },

  methods: {
    onSwitchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      if (typeof index === 'number' && index === this.data.selected) return;
      wx.switchTab({ url: path });
    },

    onAdminSecretTap() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page && typeof page.onAdminSecretTap === 'function') {
        page.onAdminSecretTap();
      }
    }
  }
});
