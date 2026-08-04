const {
  getDefaultWeightPricing,
  normalizeWeightPricing,
  validateWeightPricing,
  findWeightPrice,
  addWeightRange,
  removeWeightRange,
  updateWeightRangeField
} = require('./weightPricing');

function hasWashService(store) {
  return !!(store && (store.washService === 'yes' || store.hasWash));
}

function parseWashFreeMinDays(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
}

function normalizeWashFreeMinDays(value) {
  const days = parseWashFreeMinDays(value);
  return days > 0 ? days : '';
}

function isWashFreeByStayDays(store, stayDays) {
  const minDays = parseWashFreeMinDays(store && store.washFreeMinDays);
  if (!minDays) return false;
  const days = parseFloat(stayDays);
  if (!Number.isFinite(days) || days <= 0) return false;
  return days >= minDays;
}

function getDefaultWashPricing() {
  return getDefaultWeightPricing();
}

function normalizeWashPricing(list) {
  if (!Array.isArray(list) || !list.length) {
    return getDefaultWashPricing();
  }
  return normalizeWeightPricing(list);
}

function findWashPrice(list, petWeight) {
  return findWeightPrice(list, petWeight);
}

function normalizeWashFields(shop) {
  const source = shop || {};
  const washService = source.washService === 'yes' ? 'yes' : 'no';
  return {
    washService,
    washPricing: washService === 'yes'
      ? normalizeWashPricing(source.washPricing)
      : (Array.isArray(source.washPricing) && source.washPricing.length
        ? normalizeWashPricing(source.washPricing)
        : getDefaultWashPricing()),
    washFreeMinDays: washService === 'yes'
      ? normalizeWashFreeMinDays(source.washFreeMinDays)
      : '',
    washNotice: source.washNotice != null ? String(source.washNotice) : '',
    washNoticePhotos: Array.isArray(source.washNoticePhotos)
      ? source.washNoticePhotos.filter(Boolean)
      : []
  };
}

function validateWashPricing(list) {
  const err = validateWeightPricing(list);
  if (!err) return '';
  return `洗护定价：${err}`;
}

function validateWashService(shop) {
  if (!shop || shop.washService !== 'yes') return '';
  const pricingErr = validateWashPricing(shop.washPricing);
  if (pricingErr) return pricingErr;
  if (shop.washFreeMinDays !== '' && shop.washFreeMinDays != null) {
    if (!parseWashFreeMinDays(shop.washFreeMinDays)) {
      return '请填写有效的免费洗护天数（至少 1 天）';
    }
  }
  return '';
}

function formatWashPricingSummary(store) {
  if (!hasWashService(store)) return '';
  const pricing = normalizeWashPricing(store.washPricing);
  const parts = pricing.map((item) => {
    if (item.isAbove) return `${item.label} ¥${item.price}/次`;
    return `${item.label} ¥${item.price}/次`;
  });
  const freeMin = parseWashFreeMinDays(store.washFreeMinDays);
  const freeText = freeMin > 0 ? `；寄养满 ${freeMin} 天及以上免费洗护` : '';
  return `洗护收费：${parts.join('，')}${freeText}`;
}

function roundMoney(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
}

/**
 * 按宠物体重匹配洗护单价；满天赠送时 fee=0。
 * needWash=false 时返回 0。
 */
function calcWashFee({ store, petWeight, stayDays, needWash }) {
  const empty = {
    fee: 0,
    freeByStay: false,
    unitPrice: 0,
    freeMinDays: 0,
    text: '',
    ready: false
  };

  if (!needWash || !hasWashService(store)) {
    return empty;
  }

  const pricing = normalizeWashPricing(store.washPricing);
  const unitPrice = roundMoney(findWashPrice(pricing, petWeight));
  const freeMinDays = parseWashFreeMinDays(store.washFreeMinDays);
  const freeByStay = isWashFreeByStayDays(store, stayDays);
  const fee = freeByStay ? 0 : unitPrice;

  let text = '';
  if (freeByStay) {
    text = `寄养满 ${freeMinDays} 天，洗护免费`;
  } else if (unitPrice > 0) {
    text = `洗护 ¥${unitPrice}/次`;
  }

  return {
    fee,
    freeByStay,
    unitPrice,
    freeMinDays,
    text,
    ready: true
  };
}

function calcWashFeeForPets({ store, pets, stayDays, needWash }) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (!needWash || !hasWashService(store) || !list.length) {
    return {
      fee: 0,
      freeByStay: false,
      freeMinDays: parseWashFreeMinDays(store && store.washFreeMinDays),
      text: '',
      ready: false,
      items: []
    };
  }

  const items = list.map((pet) => {
    const quote = calcWashFee({
      store,
      petWeight: pet.weight,
      stayDays,
      needWash: true
    });
    return {
      petId: pet.id,
      petName: pet.name || '',
      ...quote
    };
  });

  const fee = roundMoney(items.reduce((sum, item) => sum + (item.fee || 0), 0));
  const freeByStay = items.length > 0 && items.every((item) => item.freeByStay);
  const freeMinDays = parseWashFreeMinDays(store.washFreeMinDays);
  let text = '';
  if (freeByStay) {
    text = `寄养满 ${freeMinDays} 天，洗护免费`;
  } else if (fee > 0) {
    text = list.length > 1 ? `洗护合计 ¥${fee}` : `洗护 ¥${fee}/次`;
  }

  return {
    fee,
    freeByStay,
    freeMinDays,
    text,
    ready: true,
    items
  };
}

module.exports = {
  hasWashService,
  parseWashFreeMinDays,
  normalizeWashFreeMinDays,
  isWashFreeByStayDays,
  getDefaultWashPricing,
  normalizeWashPricing,
  findWashPrice,
  normalizeWashFields,
  validateWashPricing,
  validateWashService,
  formatWashPricingSummary,
  calcWashFee,
  calcWashFeeForPets,
  addWashRange: addWeightRange,
  removeWashRange: removeWeightRange,
  updateWashRangeField: updateWeightRangeField
};
