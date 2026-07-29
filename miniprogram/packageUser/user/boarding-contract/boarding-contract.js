const app = getApp();
const { buildContractDraft, buildContractFromOrder, ensureContractPetInfo } = require('../../../utils/boardingContract');

Page({
  data: {
    mode: 'view',
    doc: {},
    scrollHeight: 600
  },

  onLoad(options) {
    const mode = options.mode || 'view';
    const sys = wx.getSystemInfoSync();
    const scrollHeight = sys.windowHeight - (mode === 'sign' ? 140 : 0);
    this.setData({ mode, scrollHeight });

    if (options.orderId) {
      this._loadFromOrder(options.orderId, options.contractId);
      return;
    }

    if (mode === 'sign' || mode === 'preview') {
      const draft = app.globalData.contractSignDraft;
      if (!draft) {
        wx.showToast({ title: '协议信息已失效', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({ doc: draft });
      return;
    }

    if (options.contractId) {
      const contract = app.getContracts().find((c) => c.id === options.contractId);
      if (contract) {
        this.setData({ doc: contract });
      }
    }
  },

  _loadFromOrder(orderId, contractId) {
    const order = app.getOrders().find((o) => o.id === orderId);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }

    const id = contractId || order.contractId;
    let contract = id ? app.getContractById(id) : app.getContractByOrderId(orderId);

    if (!contract && order.contractSnapshot) {
      contract = order.contractSnapshot;
    }

    if (!contract) {
      const store = app.getCurrentStore() || {
        name: order.storeName,
        address: order.storeAddress,
        store_id: order.store_id
      };
      const user = app.globalData.userInfo || {};
      contract = buildContractFromOrder(order, user, store);
    }

    if (order.contractSigned && !contract.signed) {
      contract = {
        ...contract,
        signed: true,
        signTime: order.contractSignTime || contract.signTime || ''
      };
    }

    const store = app.getCurrentStore() || {
      name: order.storeName,
      address: order.storeAddress,
      store_id: order.store_id
    };
    const user = app.globalData.userInfo || {};
    contract = ensureContractPetInfo(contract, order, user, store);

    this.setData({ doc: contract });
  },

  onConfirmSign() {
    const doc = {
      ...this.data.doc,
      signed: true,
      signTime: new Date().toLocaleString('zh-CN'),
      signMethod: 'electronic'
    };

    app.globalData.signedContractDraft = doc;
    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && eventChannel.emit) {
      eventChannel.emit('signed', doc);
    }

    wx.showToast({ title: '签署成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  }
});
