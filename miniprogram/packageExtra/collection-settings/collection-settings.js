const app = getApp();
const { callApiService, rejectOnFailure, request, ensureLogin, getToken } = require('../../utils/api');
const { API_BASE_URL } = require('../../config/api');
const prepareImage = require('./prepare-image');

const ACCOUNT_TYPES = [
  { value: 'operator_personal', label: '经营者个人银行卡' },
  { value: 'business', label: '对公银行账户' }
];

function splitDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? { year: match[1], month: match[2], day: match[3] } : { year: '', month: '', day: '' };
}
function joinDate(parts) {
  if (parts.year.length !== 4 || !parts.month || !parts.day) return '';
  return `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`;
}

function initialApplication(shop = {}) {
  return {
    subjectType: 'individual',
    industry: '居民生活服务', contactEmail: '', idNumber: '', idStart: '', idEnd: '', accountBank: '', bankName: '', accountNumber: '', license: '', idFront: '', idBack: '', qualification: '',
    licenseName: shop.name || '', licenseNumber: '', operatorName: shop.legalName || '',
    merchantShortName: shop.name || '', businessAddress: shop.address || '', servicePhone: shop.contactPhone || '',
    accountType: 'operator_personal', accountName: shop.legalName || '',
    contactName: shop.legalName || '', contactPhone: shop.contactPhone || '',
    businessLicenseUrl: shop.businessLicense || '', storefrontPhotos: (shop.storePhotos || []).slice(0, 3)
  };
}

Page({
  data: {
    dateParts: { idStart: splitDate(''), idEnd: splitDate('') }, idLongTerm: false,
    sensitiveAccepted: false, industries: ['居民生活服务', '零售', '宠物医院'], industryIndex: 0, banks: [], bankLabels: [], bankIndex: -1, bankLoading: false, needBranch: false, previews: {}, selectedPreviews: {},
    loading: true, busy: false, uploading: false, uploadingKind: '', uploadStage: '', collection: {}, agreement: {}, agreementHash: '',
    accepted: false, showAgreement: false, agreementDialogTitle: '', agreementDialogSections: [], application: initialApplication(),
    accountTypeLabels: ACCOUNT_TYPES.map(item => item.label), accountTypeIndex: 0, mode: 'offline', error: ''
  },
  onLoad() {
    this.visible = true;
    app.ensureCloudAndLogin().then(() => app.ensureMerchantStore()).then(() => {
      const shop = app.getShop() || {};
      this.storeId = shop.store_id;
      this.shopDefaults = initialApplication(shop);
      this.setData({ application: this.shopDefaults });
      return this.load(false);
    }).catch(err => this.setData({ loading: false, error: err.message || '加载失败' }));
  },
  call(action, data = {}) {
    return callApiService('storeService', { action, store_id: this.storeId, ...data }).then(r => rejectOnFailure(r, '操作失败'));
  },
  async load(refresh = true) {
    if (this.data.busy) return;
    this.setData({ loading: true, error: '' });
    try { this.applyResult(await this.call('getCollectionSettings', { refresh }), true); await this.loadBanks(); }
    catch (err) { this.setData({ error: err.message || '加载失败' }); }
    finally { this.setData({ loading: false }); this.schedulePoll(); }
  },
  onRefresh() { this.load(true); },
  applyResult(r, loadApplication = false) {
    const changed = this.data.agreementHash && this.data.agreementHash !== r.agreementHash;
    const patch = { collection: r.collection, mode: r.collection.mode, agreement: r.agreement, agreementHash: r.agreementHash,
      ...(changed ? { accepted: false, sensitiveAccepted: false } : {}) };
    if (loadApplication) {
      const application = { ...this.shopDefaults, ...(r.collection.application || {}) };
      patch.application = application;
      patch.dateParts = { idStart: splitDate(application.idStart), idEnd: splitDate(application.idEnd) };
      patch.idLongTerm = application.idEnd === '长期';
      patch.accountTypeIndex = Math.max(0, ACCOUNT_TYPES.findIndex(item => item.value === application.accountType));
      patch.industryIndex = Math.max(0, this.data.industries.indexOf(application.industry));
    }
    this.setData(patch);
    this.schedulePoll();
  },
  onField(e) {
    if (this.data.collection.applicationLocked) return;
    this.setData({ [`application.${e.currentTarget.dataset.field}`]: e.detail.value });
  },
  onDatePart(e) {
    const { field, part } = e.currentTarget.dataset;
    if (this.data.collection.applicationLocked || (field === 'idEnd' && this.data.idLongTerm)) return;
    if (!['idStart', 'idEnd'].includes(field) || !['year', 'month', 'day'].includes(part)) return;
    const value = String(e.detail.value || '').replace(/\D/g, '').slice(0, part === 'year' ? 4 : 2);
    const parts = { ...this.data.dateParts[field], [part]: value };
    this.setData({ [`dateParts.${field}`]: parts, [`application.${field}`]: joinDate(parts) });
    return value;
  },
  onLongTerm(e) {
    if (this.data.collection.applicationLocked) return;
    const idLongTerm = (e.detail.value || []).includes('longTerm');
    this.setData({ idLongTerm, 'application.idEnd': idLongTerm ? '长期' : joinDate(this.data.dateParts.idEnd) });
  },
  onAccountType(e) {
    if (this.data.collection.applicationLocked) return;
    const accountTypeIndex = Number(e.detail.value) || 0;
    this.setData({ accountTypeIndex, 'application.accountType': ACCOUNT_TYPES[accountTypeIndex].value, 'application.accountBank': '', 'application.bankName': '', bankIndex: -1 });
    this.loadBanks();
  },
  onMode(e) { this.setData({ mode: e.detail.value }); },
  onReadAgreement(e) {
    const sensitive = e.currentTarget.dataset.kind === 'sensitive';
    const sections = this.data.agreement.sections || [];
    const selected = sensitive ? sections.filter(section => section.title.includes('敏感个人信息处理授权')) : sections;
    wx.hideKeyboard();
    this.setData({
      showAgreement: true,
      agreementDialogTitle: sensitive ? '开户敏感个人信息处理授权' : this.data.agreement.title,
      agreementDialogSections: selected.length ? selected : sections
    });
  },
  onCloseAgreement() { this.setData({ showAgreement: false }); },
  onPreventTouchMove() {},
  onAccept(e) { this.setData({ accepted: (e.detail.value || []).includes('accepted') }); },
  validateApplication() {
    const a = this.data.application;
    if (!a.licenseName.trim()) return '请填写营业执照上的名称';
    if (!/^[0-9A-Z]{15,18}$/.test(a.licenseNumber.trim().toUpperCase())) return '请填写有效的统一社会信用代码或注册号';
    if (!a.operatorName.trim()) return '请填写经营者姓名';
    if (!a.merchantShortName.trim()) return '请填写商户简称';
    if (!a.businessAddress.trim()) return '请填写经营地址';
    if (!/^[\d+\-\s]{6,25}$/.test(a.servicePhone.trim())) return '请填写有效客服电话';
    for (const [field, label] of [['contactPhone','经营者手机号'],['contactEmail','经营者邮箱'],['idNumber','身份证号码'],['idStart','身份证有效期开始日期'],['idEnd','身份证有效期结束日期或长期'],['accountBank','开户银行'],['accountNumber','结算账号']]) if (!String(a[field] || '').trim()) return `请填写${label}`;
    if (!a.license || !a.idFront || !a.idBack) return '请上传执照及身份证正反面';
    if (this.data.needBranch && !a.bankName) return '请填写完整开户支行名称';
    if (a.industry === '宠物医院' && !a.qualification) return '请上传动物诊疗许可证';
    return '';
  },
  async onApply() {
    if (this.data.busy || this.data.loading || this.data.uploading) return;
    const error = this.validateApplication();
    if (error) return wx.showToast({ title: error, icon: 'none' });
    if (!this.data.accepted || !this.data.sensitiveAccepted) return wx.showToast({ title: '请阅读并勾选两项授权', icon: 'none' });
    this.setData({ busy: true, error: '' });
    try {
      const application = { ...this.data.application, licenseNumber: this.data.application.licenseNumber.trim().toUpperCase() };
      this.applyResult(await this.call('applyCollection', { application, accepted: true, sensitiveAccepted: true,
        agreementVersion: this.data.agreement.version, agreementHash: this.data.agreementHash }), true);
      wx.showModal({ title: '系统正在提交微信', content: '无需平台人工审核。微信受理后，本页会自动显示申请单号和审核进度；需要经营者核验或签约时，会显示微信官方入口。', showCancel: false });
    } catch (err) { this.setData({ error: err.message || '提交失败' }); }
    finally { this.setData({ busy: false }); }
  },
  async onSaveMode() {
    if (this.data.busy || this.data.loading) return;
    this.setData({ busy: true, error: '' });
    try {
      this.applyResult(await this.call('setCollectionMode', { mode: this.data.mode, accepted: this.data.accepted, agreementVersion: this.data.agreement.version, agreementHash: this.data.agreementHash }));
      wx.showToast({ title: '收款方式已保存', icon: 'success' });
    } catch (err) { this.setData({ error: err.message || '保存失败' }); }
    finally { this.setData({ busy: false }); }
  },
  onShow() { this.visible = true; this.schedulePoll(); },
  onHide() { this.visible = false; clearTimeout(this.pollTimer); },
  onUnload() { this.visible = false; clearTimeout(this.pollTimer); },
  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.visible || !this.storeId || !['submitting','auditing','signing'].includes(this.data.collection.state)) return;
    this.pollTimer = setTimeout(async () => {
      try { if (!this.data.busy) this.applyResult(await this.call('getCollectionSettings', { refresh: true })); } catch (_) {}
      this.schedulePoll();
    }, this.data.collection.state === 'submitting' ? 5000 : 30000);
  },
  onSensitiveAccept(e) { this.setData({ sensitiveAccepted: (e.detail.value || []).includes('sensitive') }); },
  onIndustry(e) { if (!this.data.collection.applicationLocked) { const industryIndex = Number(e.detail.value); this.setData({ industryIndex, 'application.industry': this.data.industries[industryIndex] }); } },
  async loadBanks() {
    if (!this.data.collection.configured || this.data.collection.applicationLocked) return;
    this.setData({ bankLoading: true });
    const type = this.data.application.accountType;
    try {
      const r = await request(`/api/collection/banks?store_id=${encodeURIComponent(this.storeId)}&type=${type}`, {}, { method: 'GET' }).then(rejectOnFailure);
      if (type !== this.data.application.accountType) return;
      const bankIndex = r.banks.findIndex(b => b.name === this.data.application.accountBank);
      this.setData({ banks: r.banks, bankLabels: r.banks.map(b => b.name), bankIndex, needBranch: !!(r.banks[bankIndex] && r.banks[bankIndex].needBranch) });
    } catch (_) { this.setData({ error: '银行列表加载失败，请点击重试银行列表' }); }
    finally { this.setData({ bankLoading: false }); }
  },
  onBank(e) {
    if (this.data.collection.applicationLocked) return;
    const bankIndex = Number(e.detail.value), b = this.data.banks[bankIndex]; if (!b) return;
    this.setData({ bankIndex, needBranch: b.needBranch, 'application.accountBank': b.name, 'application.bankName': '' });
  },
  async onUpload(e) {
    if (this.data.uploading || this.data.collection.applicationLocked) return;
    if (!this.data.sensitiveAccepted) {
      this.onReadAgreement({ currentTarget: { dataset: { kind: 'sensitive' } } });
      wx.showToast({ title: '阅读后请勾选资料处理授权', icon: 'none' });
      return;
    }
    const kind = e.currentTarget.dataset.kind;
    this.setData({ uploading: true, uploadingKind: kind, uploadStage: '正在选择照片…', error: '' });
    let preparationTimer;
    let preparationActive = true;
    try {
      const file = await new Promise((resolve, reject) => wx.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album','camera'], success: r => {
        const selected = (r.tempFiles || [])[0] || {};
        const tempFilePath = selected.path || (r.tempFilePaths || [])[0];
        if (tempFilePath) resolve({ tempFilePath, size: selected.size });
        else reject(new Error('未获取到照片，请重新选择'));
      }, fail: e => /cancel/i.test(e.errMsg || '') ? resolve(null) : reject(new Error('无法打开相册或相机，请检查微信权限后重试')) }));
      if (!file) return;
      this.setData({ uploadStage: '正在处理照片…', [`selectedPreviews.${kind}`]: file.tempFilePath });
      wx.showLoading({ title: '正在处理照片', mask: true });
      const filePath = await Promise.race([
        prepareImage(file, title => {
          if (!preparationActive) return;
          this.setData({ uploadStage: title });
          wx.showLoading({ title, mask: true });
        }),
        new Promise((_, reject) => { preparationTimer = setTimeout(() => reject(new Error('照片处理超时，请重新选择照片后再试')), 45000); })
      ]);
      clearTimeout(preparationTimer);
      preparationActive = false;
      this.setData({ uploadStage: '正在连接上传服务…' });
      wx.showLoading({ title: '正在连接上传服务', mask: true });
      await ensureLogin();
      this.setData({ uploadStage: '正在上传 0%' });
      wx.showLoading({ title: '正在上传 0%', mask: true });
      const r = await new Promise((resolve, reject) => {
        const task = wx.uploadFile({ url: `${API_BASE_URL.replace(/\/$/,'')}/api/collection/materials?store_id=${encodeURIComponent(this.storeId)}&kind=${kind}&consent=v3`, filePath, name: 'file', header: { Authorization: `Bearer ${getToken()}` }, timeout: 60000,
          success: response => {
            try {
              if (response.statusCode === 413) throw new Error('照片处理后仍超过上传限制，请重新拍摄后上传');
              let data;
              try { data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data; }
              catch (_) { throw new Error('上传服务返回异常，请稍后重试'); }
              if (response.statusCode < 200 || response.statusCode >= 300 || !data || !data.success || !data.token) throw new Error((data && data.errMsg) || '服务器未确认收到照片，请重试');
              resolve(data);
            } catch (error) { reject(error); }
          },
          fail: error => reject(new Error(/timeout/i.test(error.errMsg || '') ? '照片上传超时，请检查网络后重试' : '照片上传失败，请检查网络和微信上传权限后重试'))
        });
        if (task && task.onProgressUpdate) task.onProgressUpdate(progress => {
          const title = progress.progress >= 100 ? '正在保存照片' : `正在上传 ${progress.progress}%`;
          this.setData({ uploadStage: title });
          wx.showLoading({ title, mask: true });
        });
      });
      this.setData({ [`application.${kind}`]: r.token, [`previews.${kind}`]: filePath, [`selectedPreviews.${kind}`]: '' });
      wx.hideLoading();
      wx.showToast({ title: '照片上传成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      const message = err.message || '资料上传失败，请检查网络后重试';
      this.setData({ error: message });
      wx.showModal({ title: '照片上传未完成', content: message, showCancel: false });
    }
    finally {
      preparationActive = false;
      clearTimeout(preparationTimer);
      this.setData({ uploading: false, uploadingKind: '', uploadStage: '' });
    }
  },
  onPreview(e) { const url = this.data.previews[e.currentTarget.dataset.kind]; if (url) wx.previewImage({ urls: [url], current: url }); },
  onCopySign() {
    if (!this.data.collection.signUrl) return;
    wx.setClipboardData({ data: this.data.collection.signUrl, success: () => wx.showModal({ title: '签约链接已复制', content: '请由商户超级管理员在微信中打开官方链接完成确认与签约，再回到这里刷新状态。', showCancel: false }) });
  }
});
