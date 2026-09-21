const app = getApp();
const personality = require('../../../../utils/petPersonality');
const { resolveImageUrl } = require('../../../../utils/imageCache');
const { capturePromotionEntry } = require('../../../../utils/growth');
const { RECEPTION_RANGE_OPTIONS } = require('../../../../utils/receptionRange');
const {
  buildUserHomeShareConfig,
  prefetchShareImage,
  resolvePrefetchedShareImage
} = require('../../../../utils/storeShare');

const PAGE_SIZE = personality.PAGE_SIZE || 5;
const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1200;
const PERSONALITY_SHARE_QR = '/images/personality-share-code.jpg';
const PERSONALITY_PAGE_PATH = '/packageUser/user/pet-butler/personality/personality';
const FUNNY_PERSONALITY_COPY = {
  ISTJ: '不是古板，是你没按饭点执行。',
  ISFJ: '默默守护全家，顺便监督你加餐。',
  INFJ: '看穿一切，但选择趴着不说。',
  INTJ: '家里每一步，都在本宠计划之中。',
  ISTP: '能自己解决的事，绝不叫铲屎官。',
  ISFP: '长得可爱，只是本宠最低调的技能。',
  INFP: '内心戏演了三季，你只看到它发呆。',
  INTP: '不是不理你，正在研究宇宙和罐头。',
  ESTP: '先冲再说，闯祸以后负责卖萌。',
  ESFP: '镜头在哪？本宠已经准备好营业。',
  ENFP: '朋友遍天下，注意力只有三秒。',
  ENTP: '拆家不是破坏，是空间改造实验。',
  ESTJ: '饭点必须准，家庭纪律本宠来抓。',
  ESFJ: '全家都要照顾，零食也要雨露均沾。',
  ENFJ: '你的情绪本宠懂，你的零食它也懂。',
  ENTJ: '这个家可以不开会，但不能没有本宠。'
};

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

function drawCover(ctx, image, x, y, width, height) {
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
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  String(text || '').split('\n').forEach((paragraph) => {
    if (!paragraph) {
      if (lines.length < maxLines) lines.push('');
      return;
    }
    let line = '';
    Array.from(paragraph).forEach((char) => {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) {
        if (lines.length < maxLines) lines.push(line);
        line = char;
      } else {
        line = next;
      }
    });
    if (line && lines.length < maxLines) lines.push(line);
  });
  return lines;
}

function getPetCategoryLabel(type) {
  const text = String(type || '').trim();
  if (text.includes('猫')) return '猫咪';
  if (text.includes('犬') || text.includes('狗')) return text.includes('犬') ? text : '犬类';
  if (!text || text === '其他') return '其他宠物';
  return text;
}

function getPosterSpeciesTitle(type) {
  const text = String(type || '').trim();
  if (text.includes('猫')) return '猫格';
  if (text.includes('犬') || text.includes('狗')) return '狗格';
  return '宠格';
}

function setFittedFont(ctx, text, maxWidth, startSize, minSize, weight) {
  let size = startSize;
  do {
    ctx.font = `${weight || 700} ${size}px sans-serif`;
    if (ctx.measureText(String(text || '')).width <= maxWidth) break;
    size -= 2;
  } while (size > minSize);
  return size;
}

function drawPawMark(ctx, x, y, scale, color, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation || 0);
  ctx.fillStyle = color;
  [[-16, -17, 7], [-5, -25, 7], [8, -24, 7], [19, -14, 7], [2, 1, 16]].forEach((part) => {
    ctx.beginPath();
    ctx.arc(part[0] * scale, part[1] * scale, part[2] * scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

Page({
  data: {
    step: 'intro',
    pets: [],
    hasSavedPets: false,
    petNames: [],
    petIndex: 0,
    petId: '',
    petName: '',
    petNameInitial: '宝',
    petPhoto: '',
    questions: [],
    answers: [],
    pageIndex: 0,
    pageCount: 0,
    pageQuestions: [],
    totalCount: 0,
    progressText: '',
    segments: [],
    nextLabel: '下一页',
    scaleOptions: personality.SCALE_OPTIONS,
    result: null,
    existing: null,
    quickPetName: '',
    quickPetType: '',
    petTypeOptions: RECEPTION_RANGE_OPTIONS,
    saving: false,
    sharingPoster: false
  },

  onLoad(options) {
    const petId = String((options && options.petId) || '').trim();
    this._entryPetId = petId;
    capturePromotionEntry(options || {});
  },

  onReady() {
    this._ensureCanvas().catch(() => {});
  },

  onShow() {
    this._hydrate(this._entryPetId);
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    }
  },

  _hydrate(preferredId) {
    const pets = personality.attachToPets(app.getPets() || []);
    if (!pets.length) {
      const draft = personality.getDraftPet();
      const keepStep = !!(
        draft
        && this.data.petId === draft.id
        && this.data.step !== 'intro'
      );
      this.setData({
        pets: draft ? [draft] : [],
        hasSavedPets: false,
        petNames: draft ? [draft.name] : [],
        petIndex: 0,
        petId: draft ? draft.id : '',
        petName: draft ? draft.name : '',
        petNameInitial: draft ? String(draft.name || '宝').charAt(0) : '宝',
        petPhoto: draft ? (draft.photo || '') : '',
        quickPetName: draft ? draft.name : this.data.quickPetName,
        quickPetType: draft ? draft.type : this.data.quickPetType,
        existing: draft ? (draft.personality || null) : null,
        result: keepStep ? this.data.result : (draft && draft.personality) || null,
        step: keepStep ? this.data.step : 'intro'
      });
      if (draft && !keepStep) this._prepareQuestions(draft);
      else if (draft && this.data.step === 'quiz') this._syncPage();
      prefetchShareImage('').catch(() => {});
      return;
    }
    let petIndex = pets.findIndex((item) => item.id === preferredId);
    if (petIndex < 0) petIndex = 0;
    const pet = pets[petIndex];
    const existing = pet.personality || null;
    const currentId = this.data.petId;
    const keepStep = currentId && currentId === pet.id && this.data.step !== 'intro';
    this.setData({
      pets,
      hasSavedPets: true,
      petNames: pets.map((item) => item.name || '宝贝'),
      petIndex,
      petId: pet.id,
      petName: pet.name || '宝贝',
      petNameInitial: String(pet.name || '宝').charAt(0),
      petPhoto: pet.photo || '',
      existing,
      result: keepStep ? this.data.result : existing,
      step: keepStep ? this.data.step : 'intro'
    });
    if (!keepStep) this._prepareQuestions(pet);
    else if (this.data.step === 'quiz') this._syncPage();
    this._prefetchPetShareImage(pet.photo);
    if (keepStep && this.data.step === 'result') {
      this._ensureShareQr({ silent: true }).catch(() => {});
    }
  },

  _prepareQuestions(pet) {
    const questions = personality.getQuestions(pet && pet.type);
    const pageCount = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
    this.setData({
      questions,
      answers: questions.map(() => 0),
      pageIndex: 0,
      pageCount,
      totalCount: questions.length
    });
  },

  _syncPage() {
    const { questions, pageIndex, answers } = this.data;
    const pageCount = Math.max(1, Math.ceil((questions.length || 1) / PAGE_SIZE));
    const start = pageIndex * PAGE_SIZE;
    const pageQuestions = questions.slice(start, start + PAGE_SIZE).map((item, offset) => ({
      ...item,
      globalIndex: start + offset,
      answer: Number(answers[start + offset]) || 0
    }));
    const isLast = pageIndex >= pageCount - 1;
    this.setData({
      pageQuestions,
      pageCount,
      totalCount: questions.length,
      progressText: `${pageIndex + 1}/${pageCount}`,
      segments: new Array(pageCount).fill(0).map((_, index) => ({ id: index, on: index <= pageIndex })),
      nextLabel: isLast ? '完成测试' : '下一页'
    });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    const pet = this.data.pets[petIndex];
    if (!pet) return;
    this._entryPetId = pet.id;
    this.setData({
      petIndex,
      petId: pet.id,
      petName: pet.name || '宝贝',
      petNameInitial: String(pet.name || '宝').charAt(0),
      petPhoto: pet.photo || '',
      existing: pet.personality || null,
      result: pet.personality || null,
      step: 'intro'
    });
    this._prepareQuestions(pet);
    this._prefetchPetShareImage(pet.photo);
  },

  onQuickPetNameInput(e) {
    this.setData({ quickPetName: String((e.detail && e.detail.value) || '').slice(0, 20) });
  },

  onQuickPetTypeTap(e) {
    const type = String((e.currentTarget.dataset && e.currentTarget.dataset.value) || '').trim();
    if (!type) return;
    this.setData({ quickPetType: type });
  },

  onStart() {
    if (!this.data.hasSavedPets) {
      const name = String(this.data.quickPetName || '').trim();
      const type = String(this.data.quickPetType || '').trim();
      if (!name) {
        wx.showToast({ title: '先写下宠物名称', icon: 'none' });
        return;
      }
      if (!type) {
        wx.showToast({ title: '请选择宠物类别', icon: 'none' });
        return;
      }
      const previous = personality.getDraftPet();
      const draft = personality.saveDraftPet({
        ...(previous || {}),
        name,
        type,
        personality: previous && previous.type === type ? previous.personality : null
      });
      if (!draft) {
        wx.showToast({ title: '宠物信息保存失败，请重试', icon: 'none' });
        return;
      }
      this.setData({
        pets: [draft],
        petNames: [draft.name],
        petIndex: 0,
        petId: draft.id,
        petName: draft.name,
        petNameInitial: String(draft.name || '宝').charAt(0),
        petPhoto: draft.photo || '',
        existing: draft.personality || null
      });
      this._prepareQuestions(draft);
    } else {
      this._prepareQuestions(this.data.pets[this.data.petIndex]);
    }
    this.setData({
      step: 'quiz',
      pageIndex: 0,
      result: null
    }, () => this._syncPage());
  },

  onViewExisting() {
    if (!this.data.existing) return;
    this.setData({
      step: 'result',
      result: this.data.existing
    });
    this._ensureShareQr({ silent: true }).catch(() => {});
  },

  onSelectScale(e) {
    const index = Number(e.currentTarget.dataset && e.currentTarget.dataset.index);
    const value = Number(e.currentTarget.dataset && e.currentTarget.dataset.value);
    if (!Number.isInteger(index) || index < 0 || value < 1 || value > 5) return;
    const answers = this.data.answers.slice();
    answers[index] = value;
    this.setData({ answers }, () => this._syncPage());
  },

  _pageComplete() {
    return (this.data.pageQuestions || []).every((item) => Number(item.answer) >= 1);
  },

  onPrevPage() {
    if (this.data.pageIndex <= 0) {
      this.setData({ step: 'intro' });
      return;
    }
    this.setData({ pageIndex: this.data.pageIndex - 1 }, () => this._syncPage());
  },

  onNextPage() {
    if (!this._pageComplete()) {
      wx.showToast({ title: '请先完成本页题目', icon: 'none' });
      return;
    }
    const lastIndex = Math.max(0, this.data.pageCount - 1);
    if (this.data.pageIndex >= lastIndex) {
      this._finish();
      return;
    }
    this.setData({ pageIndex: this.data.pageIndex + 1 }, () => this._syncPage());
  },

  _finish() {
    const pet = this.data.pets[this.data.petIndex];
    const result = personality.buildResult(this.data.answers, pet && pet.type);
    if (!result) {
      wx.showToast({ title: '还有题没选完', icon: 'none' });
      return;
    }
    this.setData({ result, step: 'result', saving: true });
    this._persist(result);
    this._ensureShareQr({ silent: true }).catch(() => {});
  },

  _persist(result) {
    const pet = this.data.pets[this.data.petIndex];
    if (!pet) {
      this.setData({ saving: false });
      return;
    }
    personality.saveLocal(pet.id, result, pet.type);
    const next = personality.persistToPet(pet, result);
    if (pet.isPersonalityDraft) {
      const draft = personality.saveDraftPet(next) || next;
      this.setData({
        pets: [draft],
        existing: result,
        result,
        saving: false
      });
      return;
    }
    if (typeof app._upsertLocalPet === 'function') {
      app._upsertLocalPet(next);
    }
    if (typeof app.savePet !== 'function') {
      this.setData({ saving: false, existing: result });
      return;
    }
    app.savePet(next)
      .then((saved) => {
        const merged = personality.persistToPet(saved, saved.personality || result);
        personality.saveLocal(merged.id, merged.personality, merged.type);
        if (typeof app._upsertLocalPet === 'function') {
          app._upsertLocalPet(merged);
        }
        const pets = personality.attachToPets(app.getPets() || []);
        this.setData({
          pets,
          petPhoto: merged.photo || this.data.petPhoto || '',
          existing: merged.personality,
          result: merged.personality,
          saving: false
        });
      })
      .catch(() => {
        this.setData({ saving: false, existing: result });
        wx.showToast({
          title: '先记在本机了，档案同步稍后再说',
          icon: 'none'
        });
      });
  },

  onRetake() {
    this.onStart();
  },

  _prefetchPetShareImage(photo) {
    prefetchShareImage(photo).catch(() => {});
  },

  _shareImageUrl() {
    const pet = this.data.pets[this.data.petIndex] || {};
    const photo = pet.photo || this.data.petPhoto || '';
    return resolvePrefetchedShareImage(photo) || photo || '';
  },

  _shareShop() {
    return (app.getUserStoreView && app.getUserStoreView())
      || (app.getCurrentStore && app.getCurrentStore())
      || {};
  },

  _shareTitle() {
    const petName = this.data.petName || '我家毛孩子';
    const result = this.data.result;
    return result && result.typeId
      ? `我家${petName}是 ${result.typeId} ${result.typeName}，你的呢？`
      : '测测你家毛孩子是哪种16型人格';
  },

  _personalityShareConfig() {
    const config = buildUserHomeShareConfig({
      title: this._shareTitle(),
      source: 'personality',
      imageUrl: this._shareImageUrl(),
      shop: this._shareShop()
    });
    const queryIndex = String(config.path || '').indexOf('?');
    const query = queryIndex >= 0 ? String(config.path).slice(queryIndex) : '?source=personality';
    return { ...config, path: `${PERSONALITY_PAGE_PATH}${query}` };
  },

  _ensureCanvas() {
    if (this._canvas && this._ctx) return Promise.resolve();
    if (this._canvasPromise) return this._canvasPromise;
    this._canvasPromise = new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#sharePosterCanvas').fields({ node: true, size: true }).exec((result) => {
        const item = result && result[0];
        if (!item || !item.node) {
          this._canvasPromise = null;
          reject(new Error('当前微信版本暂不支持生成海报'));
          return;
        }
        this._canvas = item.node;
        const dpr = (wx.getSystemInfoSync().pixelRatio || 2);
        this._canvas.width = POSTER_WIDTH * dpr;
        this._canvas.height = POSTER_HEIGHT * dpr;
        this._ctx = this._canvas.getContext('2d');
        this._ctx.scale(dpr, dpr);
        this._imageCache = {};
        resolve();
      });
    });
    return this._canvasPromise;
  },

  _loadCanvasImage(source) {
    if (!source || !this._canvas) return Promise.resolve(null);
    if (this._imageCache && this._imageCache[source]) return Promise.resolve(this._imageCache[source]);
    return new Promise((resolve) => {
      const image = this._canvas.createImage();
      image.onload = () => {
        if (!this._imageCache) this._imageCache = {};
        this._imageCache[source] = image;
        resolve(image);
      };
      image.onerror = () => resolve(null);
      image.src = source;
    });
  },

  _ensureShareQr() {
    this._qrPath = PERSONALITY_SHARE_QR;
    return Promise.resolve(this._qrPath);
  },

  _drawPoster(photoImage, qrImage) {
    const ctx = this._ctx;
    const result = this.data.result || {};
    const petName = this.data.petName || '我家毛孩子';
    const pet = this.data.pets[this.data.petIndex] || {};
    const category = getPetCategoryLabel(pet.type);
    const speciesTitle = getPosterSpeciesTitle(pet.type);
    const typeId = String(result.typeId || '????').toUpperCase();
    const typeName = String(result.typeName || '神秘型毛孩子');
    const funnyCopy = FUNNY_PERSONALITY_COPY[typeId]
      || String(result.tag || '身份很神秘，饭量很具体。');

    ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    const background = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    background.addColorStop(0, '#FFE2D2');
    background.addColorStop(0.48, '#FFF4E8');
    background.addColorStop(1, '#E8F1E5');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    ctx.beginPath();
    ctx.arc(690, 92, 126, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(233, 134, 87, 0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(36, 1120, 146, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(102, 145, 112, 0.14)';
    ctx.fill();
    drawPawMark(ctx, 664, 142, 0.72, 'rgba(255,255,255,0.7)', -0.28);
    drawPawMark(ctx, 78, 1098, 0.58, 'rgba(255,255,255,0.72)', 0.32);

    ctx.save();
    ctx.shadowColor = 'rgba(91, 62, 42, 0.15)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, 28, 28, 694, 1144, 42);
    ctx.fillStyle = '#FFFDF9';
    ctx.fill();
    ctx.restore();

    roundedRect(ctx, 64, 68, 400, 48, 24);
    ctx.fillStyle = '#4E3729';
    ctx.fill();
    ctx.fillStyle = '#FFFDF9';
    ctx.font = '800 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`熠森宠物 · ${speciesTitle}鉴定书`, 264, 92);

    ctx.font = '700 22px sans-serif';
    const categoryWidth = Math.min(190, Math.max(104, ctx.measureText(category).width + 44));
    roundedRect(ctx, 686 - categoryWidth, 68, categoryWidth, 48, 24);
    ctx.fillStyle = '#F7E0A6';
    ctx.fill();
    ctx.fillStyle = '#664925';
    ctx.fillText(category, 686 - categoryWidth / 2, 92);

    const photoX = 72;
    const photoY = 154;
    const photoSize = 196;
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (photoImage) {
      drawCover(ctx, photoImage, photoX, photoY, photoSize, photoSize);
    } else {
      ctx.fillStyle = '#FFF4E9';
      ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }
    ctx.restore();
    if (!photoImage) {
      ctx.fillStyle = '#D9774C';
      ctx.font = '800 68px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.data.petNameInitial || '宝').slice(0, 1), photoX + 98, photoY + 104);
    }

    ctx.beginPath();
    ctx.arc(photoX + 98, photoY + 98, 101, 0, Math.PI * 2);
    ctx.strokeStyle = '#F2C8A8';
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#A47A60';
    ctx.font = '700 23px sans-serif';
    ctx.fillText(`${petName}的人格类型`, 308, 185);
    ctx.fillStyle = '#D66E43';
    ctx.font = '900 82px sans-serif';
    ctx.fillText(typeId, 304, 274);
    ctx.fillStyle = '#4E3729';
    setFittedFont(ctx, typeName, 360, 37, 25, 800);
    ctx.fillText(typeName, 308, 324);

    const tag = String(result.tag || '本宠自有安排');
    ctx.font = '700 21px sans-serif';
    const tagWidth = Math.min(360, Math.max(156, ctx.measureText(tag).width + 46));
    roundedRect(ctx, 308, 344, tagWidth, 44, 22);
    ctx.fillStyle = '#EAF1E5';
    ctx.fill();
    ctx.fillStyle = '#56705C';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, 308 + tagWidth / 2, 366);

    const humorGradient = ctx.createLinearGradient(64, 430, 686, 610);
    humorGradient.addColorStop(0, '#F8D88B');
    humorGradient.addColorStop(1, '#F6C5A8');
    roundedRect(ctx, 64, 424, 622, 194, 30);
    ctx.fillStyle = humorGradient;
    ctx.fill();
    drawPawMark(ctx, 637, 475, 0.52, 'rgba(255,255,255,0.55)', 0.2);
    ctx.fillStyle = '#7A4B2F';
    ctx.font = '800 21px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('隐藏属性已解锁', 96, 468);
    ctx.fillStyle = '#4E3729';
    ctx.font = '900 34px sans-serif';
    const funnyLines = wrapLines(ctx, funnyCopy, 520, 2);
    funnyLines.forEach((line, index) => {
      ctx.fillText(line, 96, 522 + index * 48);
    });

    ctx.fillStyle = '#4E3729';
    ctx.font = '800 24px sans-serif';
    ctx.fillText('鉴定摘要', 76, 670);
    ctx.fillStyle = '#816451';
    ctx.font = '400 24px sans-serif';
    const summaryLines = wrapLines(ctx, result.summary || '测测你家毛孩子是哪种 16 型人格', 598, 4);
    summaryLines.forEach((line, index) => {
      ctx.fillText(line, 76, 716 + index * 37);
    });

    roundedRect(ctx, 64, 862, 622, 238, 30);
    ctx.fillStyle = '#F3F6EF';
    ctx.fill();

    if (qrImage) {
      ctx.save();
      roundedRect(ctx, 88, 886, 190, 190, 22);
      ctx.clip();
      ctx.drawImage(qrImage, 88, 886, 190, 190);
      ctx.restore();
    }

    ctx.fillStyle = '#4E3729';
    ctx.font = '900 29px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('你家毛孩子是哪一型？', 310, 934);
    ctx.fillStyle = '#D66E43';
    ctx.font = '800 24px sans-serif';
    ctx.fillText('扫码直接开始测试', 310, 980);
    ctx.fillStyle = '#81917E';
    ctx.font = '400 21px sans-serif';
    ctx.fillText('看看它藏着哪种有趣人格', 310, 1032);

    ctx.fillStyle = '#A58A77';
    ctx.font = '500 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('长按识别 · 解锁你家毛孩子的隐藏人格', 375, 1138);
  },

  _exportPoster() {
    return Promise.all([
      this._ensureCanvas(),
      this._ensureShareQr()
    ]).then(() => {
      const photo = this._shareImageUrl() || this.data.petPhoto || '';
      const loadPhoto = photo
        ? resolveImageUrl(photo).catch(() => photo).then((path) => this._loadCanvasImage(path))
        : Promise.resolve(null);
      return Promise.all([
        loadPhoto,
        this._loadCanvasImage(this._qrPath)
      ]);
    }).then(([photoImage, qrImage]) => {
      if (!qrImage) throw new Error('二维码加载失败');
      this._drawPoster(photoImage, qrImage);
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: this._canvas,
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          destWidth: POSTER_WIDTH * 2,
          destHeight: POSTER_HEIGHT * 2,
          fileType: 'jpg',
          quality: 0.92,
          success: (res) => {
            if (res && res.tempFilePath) {
              resolve(res.tempFilePath);
              return;
            }
            reject(new Error('海报导出失败'));
          },
          fail: (err) => reject(err || new Error('海报导出失败'))
        });
      });
    });
  },

  onShareToTimeline() {
    if (this.data.sharingPoster) return;
    if (!(this.data.step === 'result' && this.data.result)) {
      wx.showToast({ title: '先测出结果再分享', icon: 'none' });
      return;
    }
    this.setData({ sharingPoster: true });
    this._exportPoster().then((path) => {
      this._personalityShareConfig();
      if (typeof wx.showShareImageMenu === 'function') {
        wx.showShareImageMenu({ path });
        return;
      }
      wx.previewImage({ current: path, urls: [path] });
      wx.showToast({ title: '请长按图片发送到朋友圈', icon: 'none' });
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '分享图片生成失败', icon: 'none' });
    }).finally(() => this.setData({ sharingPoster: false }));
  },

  onShareAppMessage() {
    return this._personalityShareConfig();
  }
});
