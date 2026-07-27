const { registerSecretTap } = require('../../utils/hiddenAdmin');

const ADMIN_PASSWORD = 'jinsen';

Component({
  data: {
    showPasswordModal: false,
    passwordInput: ''
  },

  methods: {
    openPasswordModal() {
      this.setData({ showPasswordModal: true, passwordInput: '' });
    },

    onSecretTap() {
      registerSecretTap(() => this.openPasswordModal());
    },

    onPanelTap() {},

    onPasswordInput(e) {
      this.setData({ passwordInput: (e.detail.value || '').trim() });
    },

    onCancelPassword() {
      this.setData({ showPasswordModal: false, passwordInput: '' });
    },

    onConfirmPassword() {
      const { passwordInput } = this.data;
      if (passwordInput !== ADMIN_PASSWORD) {
        wx.showToast({ title: '密码错误', icon: 'none' });
        this.setData({ passwordInput: '' });
        return;
      }
      this.setData({ showPasswordModal: false, passwordInput: '' });
      wx.navigateTo({ url: '/pages/admin/merchant-auth/merchant-auth' });
    }
  }
});
