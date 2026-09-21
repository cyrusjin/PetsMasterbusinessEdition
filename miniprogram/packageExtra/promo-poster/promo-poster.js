const app = getApp();
const storeApi = require('../../utils/store');
const { resolveImageUrl } = require('../../utils/imageCache');
const { SERVICE_LINE_DEFS, normalizeServiceLines } = require('../../utils/serviceLines');
const { buildMerchantShareConfig, buildMerchantTimelineShareConfig } = require('../../utils/storeShare');

const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1000;
const SERVICE_POSTERS = {
  boarding: {
    background: '/packageExtra/promo-poster/poster-boarding.jpg',
    accent: '#df7b50',
    badge: '到店寄养',
    copies: [
      { id: 'care', name: '安心托付', headline: '放心出发，安心托付', copyText: '像家一样自在的寄养空间\n每日用心照护，动态随时可见' },
      { id: 'holiday', name: '萌宠假期', headline: '给毛孩子放个小假', copyText: '舒适环境 · 贴心陪伴 · 科学照护\n让等待也变成一段快乐时光' },
      { id: 'professional', name: '专业照护', headline: '专业寄养，用心陪伴', copyText: '认真对待每一次托付\n扫码即可预约到店寄养' }
    ]
  },
  wash: {
    background: '/packageExtra/promo-poster/poster-wash.jpg',
    accent: '#49a99a',
    badge: '美容洗护',
    copies: [
      { id: 'fresh', name: '清爽焕新', headline: '洗个香香，清爽焕新', copyText: '温柔洗护 · 细致吹整 · 舒适体验\n让毛孩子干净又蓬松' },
      { id: 'beauty', name: '精致造型', headline: '精致造型，从毛发开始', copyText: '按毛发状态定制洗护方案\n扫码选择项目，轻松预约' },
      { id: 'gentle', name: '温柔洗护', headline: '温柔洗护，不只洗干净', copyText: '耐心安抚每一只小可爱\n从清洁到护理都认真对待' }
    ]
  },
  homeFeeding: {
    background: '/packageExtra/promo-poster/poster-home-feeding.jpg',
    accent: '#789172',
    badge: '上门喂养',
    copies: [
      { id: 'home', name: '安心在家', headline: '留在家里，也能被好好照顾', copyText: '添粮换水 · 环境清洁 · 陪伴互动\n猫猫狗狗，都能享受安心照护' },
      { id: 'travel', name: '放心出行', headline: '放心出行，照护到家', copyText: '按时上门，服务过程及时记录\n每一次照顾都有回应' },
      { id: 'door', name: '贴心上门', headline: '专业上门，贴心陪伴', copyText: '喂食、换水、遛狗等服务按需选择\n扫码即可预约上门时间' }
    ]
  }
};

function clean(value) {
  return String(value || '').trim();
}

function shopAddress(shop) {
  return clean(shop.locationName || shop.addressRegion || shop.address);
}

function shopContact(shop) {
  if (clean(shop.contactPhone)) return `电话 ${clean(shop.contactPhone)}`;
  if (clean(shop.wechatId)) return `微信 ${clean(shop.wechatId)}`;
  return '欢迎微信咨询预约';
}

function getEnvVersion() {
  try {
    const account = wx.getAccountInfoSync();
    const version = account && account.miniProgram && account.miniProgram.envVersion;
    if (['release', 'trial', 'develop'].includes(version)) return version;
  } catch (err) {
    // ignore
  }
  return 'trial';
}

function listPosterServices(shop) {
  const lines = normalizeServiceLines(shop && shop.serviceLines);
  const list = SERVICE_LINE_DEFS.filter((item) => lines[item.key] && SERVICE_POSTERS[item.key]);
  const source = list.length ? list : SERVICE_LINE_DEFS.filter((item) => item.key === 'boarding');
  return source.map((item) => ({
    key: item.key,
    name: item.name,
    desc: item.desc,
    emoji: item.emoji
  }));
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCover(ctx, image, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

function splitLines(ctx, text, maxWidth) {
  const output = [];
  String(text || '').split('\n').forEach((paragraph) => {
    if (!paragraph) {
      output.push('');
      return;
    }
    let line = '';
    Array.from(paragraph).forEach((char) => {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) {
        output.push(line);
        line = char;
      } else {
        line = next;
      }
    });
    if (line) output.push(line);
  });
  return output;
}

function drawTextLines(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = splitLines(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + Math.max(0, lines.length - 1) * lineHeight;
}

Page({
  data: {
    serviceOptions: [],
    serviceLine: 'boarding',
    copyTemplates: SERVICE_POSTERS.boarding.copies,
    selectedCopyId: SERVICE_POSTERS.boarding.copies[0].id,
    backgroundPath: SERVICE_POSTERS.boarding.background,
    headline: SERVICE_POSTERS.boarding.copies[0].headline,
    copyText: SERVICE_POSTERS.boarding.copies[0].copyText,
    contactText: '欢迎微信咨询预约',
    addressText: '',
    storeName: '宠物寄养小店',
    shop: {},
    rendering: true,
    qrLoading: false,
    saving: false,
    sharing: false
  },

  onLoad() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    const shop = (app.getShop && app.getShop()) || {};
    const serviceOptions = listPosterServices(shop);
    const serviceLine = serviceOptions[0].key;
    const config = SERVICE_POSTERS[serviceLine];
    const firstCopy = config.copies[0];
    this._imageCache = {};
    this._qrPaths = {};
    this._qrPromises = {};
    this._logoSource = clean(shop.logo);
    this.setData({
      shop,
      serviceOptions,
      serviceLine,
      copyTemplates: config.copies,
      selectedCopyId: firstCopy.id,
      backgroundPath: config.background,
      headline: firstCopy.headline,
      copyText: firstCopy.copyText,
      storeName: clean(shop.name) || '宠物寄养小店',
      contactText: shopContact(shop),
      addressText: shopAddress(shop)
    });
    this._ensureQr(serviceLine, { silent: true }).catch(() => {});
  },

  onReady() {
    wx.createSelectorQuery().in(this).select('#posterCanvas').fields({ node: true, size: true }).exec((result) => {
      const item = result && result[0];
      if (!item || !item.node) {
        this.setData({ rendering: false });
        wx.showToast({ title: '当前微信版本暂不支持生成海报', icon: 'none' });
        return;
      }
      this._canvas = item.node;
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      this._canvas.width = POSTER_WIDTH * dpr;
      this._canvas.height = POSTER_HEIGHT * dpr;
      this._ctx = this._canvas.getContext('2d');
      this._ctx.scale(dpr, dpr);
      this._renderPoster();
    });
  },

  onUnload() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
  },

  onSelectService(e) {
    const serviceLine = e.currentTarget.dataset.key;
    if (!SERVICE_POSTERS[serviceLine] || serviceLine === this.data.serviceLine) return;
    const config = SERVICE_POSTERS[serviceLine];
    const firstCopy = config.copies[0];
    this.setData({
      serviceLine,
      copyTemplates: config.copies,
      selectedCopyId: firstCopy.id,
      backgroundPath: config.background,
      headline: firstCopy.headline,
      copyText: firstCopy.copyText
    }, () => this._renderPoster());
    this._ensureQr(serviceLine, { silent: true }).catch(() => {});
  },

  onSelectCopy(e) {
    const id = e.currentTarget.dataset.id;
    const copy = this.data.copyTemplates.find((item) => item.id === id);
    if (!copy) return;
    this.setData({ selectedCopyId: id, headline: copy.headline, copyText: copy.copyText }, () => {
      this._scheduleRender(0);
    });
  },

  onChooseBackground() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({ backgroundPath: file.tempFilePath }, () => this._scheduleRender(0));
      }
    });
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!['headline', 'copyText', 'contactText', 'addressText'].includes(field)) return;
    this.setData({ [field]: e.detail.value });
    this._scheduleRender(180);
  },

  _scheduleRender(delay) {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      this._renderPoster();
    }, delay == null ? 120 : delay);
  },

  _ensureQr(serviceLine, options) {
    const line = serviceLine || this.data.serviceLine;
    if (this._qrPaths[line]) return Promise.resolve(this._qrPaths[line]);
    if (this._qrPromises[line]) return this._qrPromises[line];
    const storeId = clean(this.data.shop && this.data.shop.store_id);
    if (!storeId) return Promise.reject(new Error('请先开通店铺再生成预约二维码'));
    this.setData({ qrLoading: true, rendering: true });
    const promise = storeApi.getStoreQrCode(storeId, line, getEnvVersion()).then((res) => {
      if (!res || !res.success) throw new Error((res && res.errMsg) || '预约二维码生成失败');
      const source = res.tempFileURL || res.fileID || '';
      if (!source) throw new Error('预约二维码地址为空');
      return resolveImageUrl(source);
    }).then((path) => {
      this._qrPaths[line] = path;
      return this._renderPoster().then(() => path);
    }).catch((err) => {
      if (!(options && options.silent)) {
        wx.showToast({ title: err.message || '二维码生成失败', icon: 'none' });
      }
      throw err;
    }).finally(() => {
      delete this._qrPromises[line];
      if (line === this.data.serviceLine) this.setData({ qrLoading: false, rendering: false });
    });
    this._qrPromises[line] = promise;
    return promise;
  },

  _loadImage(source) {
    if (!source || !this._canvas) return Promise.resolve(null);
    if (this._imageCache[source]) return Promise.resolve(this._imageCache[source]);
    return new Promise((resolve) => {
      const image = this._canvas.createImage();
      image.onload = () => {
        this._imageCache[source] = image;
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = source;
    });
  },

  _resolveLogo() {
    if (!this._logoSource) return Promise.resolve('');
    return resolveImageUrl(this._logoSource).catch(() => '');
  },

  _renderPoster() {
    if (!this._ctx || !this._canvas) return Promise.resolve();
    const token = (this._renderToken || 0) + 1;
    this._renderToken = token;
    this.setData({ rendering: true });
    const qrPath = this._qrPaths[this.data.serviceLine] || '';
    return Promise.all([
      this._loadImage(this.data.backgroundPath),
      this._resolveLogo().then((path) => this._loadImage(path)),
      this._loadImage(qrPath)
    ]).then(([background, logo, qrImage]) => {
      if (token !== this._renderToken) return;
      this._drawPoster(background, logo, qrImage);
      this._posterPath = '';
    }).catch((err) => {
      console.error('[宣传海报] 生成失败', err);
      wx.showToast({ title: '海报生成失败，请重试', icon: 'none' });
    }).finally(() => {
      if (token === this._renderToken && !this.data.qrLoading) this.setData({ rendering: false });
    });
  },

  _drawPoster(background, logo, qrImage) {
    const ctx = this._ctx;
    const config = SERVICE_POSTERS[this.data.serviceLine] || SERVICE_POSTERS.boarding;
    ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    ctx.fillStyle = '#f6f2ed';
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    if (background) drawCover(ctx, background, POSTER_WIDTH, POSTER_HEIGHT);

    const wash = ctx.createLinearGradient(0, 0, 0, 540);
    wash.addColorStop(0, 'rgba(255,255,255,.74)');
    wash.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, POSTER_WIDTH, 540);

    roundedRect(ctx, 45, 42, 475, 86, 43);
    ctx.fillStyle = 'rgba(255,255,255,.90)';
    ctx.fill();
    if (logo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(88, 85, 29, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(59, 56);
      drawCover(ctx, logo, 58, 58);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(88, 85, 29, 0, Math.PI * 2);
      ctx.fillStyle = config.accent;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(clean(this.data.storeName).slice(0, 1) || '宠', 88, 87);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#46372f';
    ctx.font = '700 25px sans-serif';
    ctx.fillText(clean(this.data.storeName).slice(0, 18), 130, 79);
    ctx.fillStyle = '#9a877b';
    ctx.font = '18px sans-serif';
    ctx.fillText('用心照顾每一位毛孩子', 130, 106);

    roundedRect(ctx, 48, 157, 138, 42, 21);
    ctx.fillStyle = config.accent;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(config.badge, 117, 185);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#3e332d';
    ctx.font = '800 52px sans-serif';
    const titleEndY = drawTextLines(ctx, clean(this.data.headline), 48, 260, 620, 66, 2);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#6e5e55';
    drawTextLines(ctx, clean(this.data.copyText), 50, titleEndY + 48, 570, 38, 3);

    roundedRect(ctx, 38, 742, 674, 218, 30);
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.fill();
    roundedRect(ctx, 58, 761, 176, 176, 18);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (qrImage) {
      ctx.drawImage(qrImage, 68, 771, 156, 156);
    } else {
      ctx.fillStyle = '#f0ece8';
      ctx.fillRect(68, 771, 156, 156);
      ctx.fillStyle = '#aa9b91';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('预约码生成中', 146, 855);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#3f332c';
    ctx.font = '800 27px sans-serif';
    ctx.fillText(`扫码预约${config.badge}`, 266, 798);
    ctx.fillStyle = config.accent;
    ctx.font = '700 22px sans-serif';
    ctx.fillText(clean(this.data.contactText) || '欢迎微信咨询预约', 266, 841);
    const address = clean(this.data.addressText);
    if (address) {
      ctx.fillStyle = '#837269';
      ctx.font = '19px sans-serif';
      drawTextLines(ctx, `地址  ${address}`, 266, 880, 410, 28, 2);
    }
    ctx.fillStyle = '#a99a91';
    ctx.font = '17px sans-serif';
    ctx.fillText('微信扫码 · 选择时间 · 在线预约', 266, 931);
  },

  _exportPoster() {
    return this._ensureQr(this.data.serviceLine).then(() => this._renderPoster()).then(() => {
      if (this._posterPath) return this._posterPath;
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: this._canvas,
          fileType: 'jpg',
          quality: 0.95,
          destWidth: 1500,
          destHeight: 2000,
          success: (res) => {
            this._posterPath = res.tempFilePath;
            resolve(res.tempFilePath);
          },
          fail: reject
        });
      });
    });
  },

  onSavePoster() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    this._exportPoster().then((path) => new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject });
    })).then(() => {
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    }).catch((err) => {
      const message = String((err && (err.errMsg || err.message)) || '');
      if (message.includes('auth deny') || message.includes('authorize:fail')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存图片到相册。',
          confirmText: '去设置',
          success: (res) => { if (res.confirm) wx.openSetting(); }
        });
      } else if (!message.includes('cancel')) {
        wx.showToast({ title: message || '保存失败，请重试', icon: 'none' });
      }
    }).finally(() => this.setData({ saving: false }));
  },

  onSharePoster() {
    if (this.data.sharing) return;
    this.setData({ sharing: true });
    this._exportPoster().then((path) => {
      if (typeof wx.showShareImageMenu === 'function') {
        wx.showShareImageMenu({ path });
        return;
      }
      wx.previewImage({ current: path, urls: [path] });
      wx.showToast({ title: '请长按图片发送给好友或朋友圈', icon: 'none' });
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '分享图片生成失败', icon: 'none' });
    }).finally(() => this.setData({ sharing: false }));
  },

  onShareAppMessage() {
    const config = buildMerchantShareConfig(this, { serviceLine: this.data.serviceLine });
    return { ...config, imageUrl: this._posterPath || this.data.backgroundPath };
  },

  onShareTimeline() {
    const config = buildMerchantTimelineShareConfig(this);
    return { ...config, imageUrl: this._posterPath || this.data.backgroundPath };
  }
});
