const app = getApp();
const { listGuestShareCards, resolveShareImageUrl } = require('../../utils/storeShare');

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function createToken() {
  return `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildRecommendedNotes(service, petType) {
  const line = String((service && service.key) || '').toLowerCase();
  const type = petType === '猫' ? '猫咪' : petType === '其他' ? '宠物' : '狗狗';
  if (line === 'wash') {
    return [
      `${type}本次洗护已完成，回家后请保持毛发干燥，避免立即受凉。`,
      `本次已完成洗护和基础护理，建议观察${type}回家后的饮食与精神状态。`,
      `毛发状态良好，建议约 3～4 周后安排下一次洗护。`
    ];
  }
  if (line === 'homeFeeding') {
    return [
      `本次上门照护已完成，${type}状态正常，用品和环境已整理。`,
      `本次已完成喂食、饮水和基础陪伴，建议继续观察${type}的精神状态。`,
      `如${type}出现食欲或状态变化，欢迎随时联系我们。`
    ];
  }
  return [
    `本次寄养服务已完成，${type}状态正常，已平安回家。`,
    `本次照护期间${type}适应良好，回家后建议先安静休息并补充饮水。`,
    `建议下次出行提前预约，方便我们为${type}安排熟悉的照护。`
  ];
}

Page({
  data: {
    petName: '', petType: '狗', contactName: '', note: '', services: [], serviceNames: [],
    serviceIndex: 0, recommendedNotes: [], formReady: false, submitting: false, createdOrder: null
  },

  onLoad() {
    const services = listGuestShareCards(app.getShop() || {});
    const serviceNames = services.map((item) => item.pickerTitle || item.name || '宠物服务');
    this.setData({
      services,
      serviceNames,
      recommendedNotes: buildRecommendedNotes(services[0], this.data.petType)
    });
    if (!services.length) {
      wx.showModal({ title: '还没有可用服务', content: '请先在门店设置中开通至少一项服务。', showCancel: false, success: () => wx.navigateBack() });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const value = (e.detail && e.detail.value) || '';
    this.setData({
      [field]: value,
      formReady: field === 'petName' ? !!String(value).trim() && this.data.services.length > 0 : this.data.formReady
    });
  },

  onPetTypeChange(e) {
    const petType = ['狗', '猫', '其他'][Number(e.detail.value) || 0];
    this.setData({
      petType,
      recommendedNotes: buildRecommendedNotes(this.data.services[this.data.serviceIndex], petType)
    });
  },

  onServiceChange(e) {
    const serviceIndex = Number(e.detail.value) || 0;
    this.setData({
      serviceIndex,
      recommendedNotes: buildRecommendedNotes(this.data.services[serviceIndex], this.data.petType)
    });
  },

  onPickNote(e) {
    const index = Number(e.currentTarget.dataset.index);
    const note = this.data.recommendedNotes[index];
    if (note) this.setData({ note });
  },

  onValidate() { wx.showToast({ title: '请先填写宠物名字', icon: 'none' }); },

  onSubmitAndShare() {
    if (this.data.submitting || this.data.createdOrder) return;
    const petName = String(this.data.petName || '').trim();
    const service = (this.data.services || [])[this.data.serviceIndex];
    if (!petName || !service) return;
    const shop = app.getShop() || {};
    const date = today();
    const order = {
      store_id: shop.store_id,
      storeName: shop.name || '', storeLogo: shop.logo || shop.logoUrl || '', storeAddress: shop.address || '',
      serviceRecord: true, placedByMerchant: true, proxyClaimToken: createToken(), proxyClaimed: false,
      proxyOwnerPending: true, status: 'completed', serviceLine: service.key,
      serviceType: service.name || service.pickerTitle || '宠物服务', petName, petType: this.data.petType,
      contactName: String(this.data.contactName || '').trim(), specialNeeds: String(this.data.note || '').trim(),
      startDate: date, endDate: date, startTime: '00:00', endTime: '23:59', days: 1,
      totalFee: 0, basePrice: 0, billingMode: 'custom'
    };
    this._shareOrder = order;
    this.setData({ submitting: true });
    app.saveOrder(order).then((created) => {
      this.setData({ createdOrder: created });
    }).catch((err) => {
      this._shareOrder = null;
      this.setData({ createdOrder: null });
      wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' });
    }).finally(() => this.setData({ submitting: false }));
  },

  onShareAppMessage() {
    const order = this.data.createdOrder || this._shareOrder || {};
    const shop = app.getShop() || {};
    const name = order.petName ? `${order.petName}的服务记录` : '服务完成记录';
    const storeId = encodeURIComponent(order.store_id || shop.store_id || '');
    const serviceLine = encodeURIComponent(order.serviceLine || 'boarding');
    return {
      title: `${name}，点击即可再次预约`,
      path: `/packageUser/user/reserve/reserve?store_id=${storeId}&serviceLine=${serviceLine}`,
      imageUrl: resolveShareImageUrl(shop)
    };
  }
});
