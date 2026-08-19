const { uploadLocalImage } = require('./upload');
const { isLocalTempPath, isRemotePhoto } = require('./photoPath');
const {
  RECEPTION_RANGE_OPTIONS,
  normalizeReceptionRange,
  isPetAllowedByReceptionRange
} = require('./receptionRange');

const MAX_WASH_TITLE = 30;
const MAX_WASH_BODY = 200;
const WASH_PET_TYPE_OPTIONS = RECEPTION_RANGE_OPTIONS.map((item) => ({
  value: item.value,
  label: item.label
}));

let productIdSeed = 0;

function createProductId() {
  productIdSeed += 1;
  return `wash_${Date.now()}_${productIdSeed}`;
}

function parsePrice(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

function sanitizeWeightInput(value) {
  let text = String(value == null ? '' : value).replace(/[^\d.]/g, '');
  const dot = text.indexOf('.');
  if (dot >= 0) {
    text = `${text.slice(0, dot + 1)}${text.slice(dot + 1).replace(/\./g, '')}`;
    const [intPart, decPart = ''] = text.split('.');
    text = `${intPart}.${decPart.slice(0, 2)}`;
  }
  return text;
}

function parseWeight(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const num = parseFloat(text);
  if (!Number.isFinite(num) || num < 0) return '';
  return String(Math.round(num * 100) / 100);
}

function normalizeWashPhoto(url) {
  if (!url || typeof url !== 'string') return '';
  const text = url.trim();
  if (!text) return '';
  if (isRemotePhoto(text) || isLocalTempPath(text)) return text;
  return '';
}

function normalizeWashPetTypes(list) {
  return normalizeReceptionRange(Array.isArray(list) ? list : []);
}

function hasWashWeightRange(item) {
  return !!(item && ((item.weightMin !== '' && item.weightMin != null)
    || (item.weightMax !== '' && item.weightMax != null)));
}

function hasWashPetTypes(item) {
  return !!(item && Array.isArray(item.petTypes) && item.petTypes.length);
}

function matchesWashWeight(item, weight) {
  if (!hasWashWeightRange(item)) return false;
  const num = parseFloat(weight);
  if (!Number.isFinite(num) || num < 0) return false;
  const min = item.weightMin === '' || item.weightMin == null ? null : parseFloat(item.weightMin);
  const max = item.weightMax === '' || item.weightMax == null ? null : parseFloat(item.weightMax);
  if (min != null && Number.isFinite(min) && num < min) return false;
  if (max != null && Number.isFinite(max) && num > max) return false;
  return true;
}

function matchesWashPetType(item, petType) {
  if (!hasWashPetTypes(item)) return false;
  return isPetAllowedByReceptionRange(petType, item.petTypes);
}

/** 体重区间与宠物类别为「或」：满足任一即可；只填了一项则只按该项判断 */
function matchesWashProductCondition(item, pet) {
  const product = normalizeWashProduct(item, item && item.id);
  if (!product.hasCondition) return true;
  const weight = pet && (pet.weight != null ? pet.weight : pet.petWeight);
  const petType = pet && (pet.petType || pet.type);
  const hasWeight = hasWashWeightRange(product);
  const hasTypes = hasWashPetTypes(product);
  const weightMatch = matchesWashWeight(product, weight);
  const typeMatch = matchesWashPetType(product, petType);
  if (hasWeight && hasTypes) return weightMatch || typeMatch;
  if (hasWeight) return weightMatch;
  if (hasTypes) return typeMatch;
  return true;
}

function normalizeWashProduct(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createProductId();
  const title = ((item && (item.title || item.name)) || '').trim().slice(0, MAX_WASH_TITLE);
  const bodyText = ((item && (item.bodyText || item.description)) || '').trim().slice(0, MAX_WASH_BODY);
  const price = parsePrice(item && item.price);
  const photo = normalizeWashPhoto(item && item.photo);
  const weightMin = parseWeight(item && item.weightMin);
  const weightMax = parseWeight(item && item.weightMax);
  const petTypes = normalizeWashPetTypes(item && item.petTypes);
  const draft = {
    id,
    title,
    bodyText,
    price,
    photo,
    hasCondition: !!(item && item.hasCondition),
    weightMin,
    weightMax,
    petTypes
  };
  if (draft.hasCondition && !hasWashWeightRange(draft) && !hasWashPetTypes(draft)) {
    draft.hasCondition = false;
  }
  return draft;
}

function isWashProductDraftEmpty(item) {
  const normalized = normalizeWashProduct(item, item && item.id);
  return !normalized.title && !normalized.bodyText && !(normalized.price > 0) && !normalized.photo;
}

function compactWashProducts(list) {
  return normalizeWashProducts(list).filter((item) => !isWashProductDraftEmpty(item));
}

function normalizeWashProducts(input) {
  if (!Array.isArray(input) || !input.length) return [];
  return input.map((item) => normalizeWashProduct(item));
}

function decorateWashProductForUi(item) {
  const normalized = normalizeWashProduct(item, item && item.id);
  return {
    ...normalized,
    petTypeOptions: WASH_PET_TYPE_OPTIONS.map((opt) => ({
      ...opt,
      checked: normalized.petTypes.includes(opt.value)
    }))
  };
}

function normalizeWashProductsForUi(input) {
  return normalizeWashProducts(input).map((item) => decorateWashProductForUi(item));
}

function cloneWashProductList(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    ...item,
    petTypes: Array.isArray(item.petTypes) ? item.petTypes.slice() : [],
    petTypeOptions: Array.isArray(item.petTypeOptions)
      ? item.petTypeOptions.map((opt) => ({ ...opt }))
      : WASH_PET_TYPE_OPTIONS.map((opt) => ({
        ...opt,
        checked: Array.isArray(item.petTypes) && item.petTypes.includes(opt.value)
      }))
  }));
}

function addWashProduct(list) {
  return [
    ...cloneWashProductList(list),
    {
      id: createProductId(),
      title: '',
      bodyText: '',
      price: '',
      photo: '',
      hasCondition: false,
      weightMin: '',
      weightMax: '',
      petTypes: [],
      petTypeOptions: WASH_PET_TYPE_OPTIONS.map((opt) => ({ ...opt, checked: false }))
    }
  ];
}

function removeWashProduct(list, index) {
  const next = cloneWashProductList(list);
  if (index < 0 || index >= next.length) return next;
  return next.filter((_, idx) => idx !== index);
}

function updateWashProductField(list, index, field, rawValue) {
  const next = cloneWashProductList(list);
  if (index < 0 || index >= next.length) return next;
  const target = next[index];

  if (field === 'title') {
    target.title = String(rawValue || '').slice(0, MAX_WASH_TITLE);
  } else if (field === 'bodyText') {
    target.bodyText = String(rawValue || '').slice(0, MAX_WASH_BODY);
  } else if (field === 'price') {
    const text = String(rawValue == null ? '' : rawValue).replace(/[^\d.]/g, '');
    const dot = text.indexOf('.');
    target.price = dot >= 0
      ? `${text.slice(0, dot + 1)}${text.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
      : text;
  } else if (field === 'photo') {
    target.photo = normalizeWashPhoto(rawValue);
  } else if (field === 'hasCondition') {
    target.hasCondition = !!rawValue;
  } else if (field === 'weightMin' || field === 'weightMax') {
    target[field] = sanitizeWeightInput(rawValue);
  }

  return next;
}

function toggleWashProductPetType(list, index, type) {
  const next = cloneWashProductList(list);
  if (index < 0 || index >= next.length) return next;
  const target = next[index];
  const value = String(type || '').trim();
  if (!WASH_PET_TYPE_OPTIONS.some((item) => item.value === value)) return next;
  const current = Array.isArray(target.petTypes) ? target.petTypes.slice() : [];
  const pos = current.indexOf(value);
  if (pos >= 0) current.splice(pos, 1);
  else current.push(value);
  target.hasCondition = true;
  target.petTypes = normalizeWashPetTypes(current);
  target.petTypeOptions = WASH_PET_TYPE_OPTIONS.map((opt) => ({
    ...opt,
    checked: target.petTypes.includes(opt.value)
  }));
  return next;
}

function validateWashProducts(list, options) {
  const opts = options || {};
  const required = opts.required === true;
  const noun = opts.noun || '洗护商品';
  const normalized = compactWashProducts(list);
  if (!normalized.length) {
    return required ? `请至少添加一个${noun}` : '';
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    const label = item.title || `第${i + 1}个${noun}`;
    if (!item.title) return `请填写第${i + 1}个${noun}的标题`;
    if (!(parseFloat(item.price) > 0)) return `请填写「${label}」的价格`;
    if (item.hasCondition) {
      const min = item.weightMin === '' ? null : parseFloat(item.weightMin);
      const max = item.weightMax === '' ? null : parseFloat(item.weightMax);
      if (min != null && !Number.isFinite(min)) return `「${label}」体重下限无效`;
      if (max != null && !Number.isFinite(max)) return `「${label}」体重上限无效`;
      if (min != null && max != null && min >= max) {
        return `「${label}」体重上限需大于下限`;
      }
      if (!hasWashWeightRange(item) && !hasWashPetTypes(item)) {
        return `请为「${label}」填写体重区间或选择宠物类别（满足任一即可）`;
      }
    }
  }

  const titles = normalized.map((item) => item.title);
  const duplicate = titles.find((title, index) => titles.indexOf(title) !== index);
  if (duplicate) return `${noun}「${duplicate}」标题重复，请修改`;
  return '';
}

function isWashProductsComplete(list) {
  return !validateWashProducts(list, { required: true });
}

function roundWashMoney(amount) {
  return Math.round((parseFloat(amount) || 0) * 100) / 100;
}

function buildWashProductOptions(list, pets) {
  const products = compactWashProducts(list);
  const petList = Array.isArray(pets) ? pets.filter(Boolean) : [];
  return products.map((item) => {
    const matched = petList.filter((pet) => matchesWashProductCondition(item, pet));
    const disabled = petList.length > 0 && matched.length === 0;
    return {
      ...item,
      priceText: String(item.price),
      disabled,
      disabledTip: disabled ? '不适用于已选宠物' : ''
    };
  });
}

function normalizeWashSelectedIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim()).filter(Boolean);
  }
  const one = String(raw || '').trim();
  return one ? [one] : [];
}

function washProductsShareTarget(left, right, pets) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (list.length) {
    return list.some((pet) => (
      matchesWashProductCondition(left, pet) && matchesWashProductCondition(right, pet)
    ));
  }
  const typesA = Array.isArray(left && left.petTypes) ? left.petTypes : [];
  const typesB = Array.isArray(right && right.petTypes) ? right.petTypes : [];
  if (!typesA.length || !typesB.length) return true;
  return typesA.some((type) => typesB.indexOf(type) >= 0);
}

function toggleWashProductSelection(products, selectedIds, nextId, pets) {
  const list = Array.isArray(products) ? products : [];
  const id = String(nextId || '').trim();
  if (!id || !list.some((item) => String(item.id || '') === id)) {
    return normalizeWashSelectedIds(selectedIds);
  }
  const current = normalizeWashSelectedIds(selectedIds).filter((itemId) => (
    list.some((item) => String(item.id || '') === itemId)
  ));
  if (current.indexOf(id) >= 0) {
    return current.filter((itemId) => itemId !== id);
  }
  const nextItem = list.find((item) => String(item.id || '') === id);
  const kept = current.filter((itemId) => {
    const item = list.find((row) => String(row.id || '') === itemId);
    return item && !washProductsShareTarget(item, nextItem, pets);
  });
  kept.push(id);
  return kept;
}

function ensureWashProductSelection(products, selectedIds, pets) {
  const list = (Array.isArray(products) ? products : []).filter((item) => item && !item.disabled);
  const ids = [];
  normalizeWashSelectedIds(selectedIds).forEach((id) => {
    const item = list.find((row) => String(row.id || '') === id);
    if (!item) return;
    const conflict = ids.some((keptId) => {
      const kept = list.find((row) => String(row.id || '') === keptId);
      return kept && washProductsShareTarget(kept, item, pets);
    });
    if (!conflict) ids.push(id);
  });
  return ids;
}

function findWashProductForPet(selected, pet) {
  return (Array.isArray(selected) ? selected : []).find(
    (product) => matchesWashProductCondition(product, pet)
  ) || null;
}

function calcWashProductsQuote({ products, pets, selectedProductId, selectedProductIds }) {
  const list = compactWashProducts(products);
  const petList = Array.isArray(pets) ? pets.filter(Boolean) : [];
  const ids = normalizeWashSelectedIds(
    selectedProductIds != null ? selectedProductIds : selectedProductId
  );
  const selected = ids.map((id) => list.find((item) => String(item.id || '') === id)).filter(Boolean);
  if (!selected.length) {
    return {
      ready: false,
      fee: 0,
      unitPrice: 0,
      count: 0,
      product: null,
      products: [],
      productIds: [],
      items: [],
      text: '',
      error: '请选择洗护项目'
    };
  }
  if (!petList.length) {
    const unitPrice = roundWashMoney(selected.reduce((sum, item) => sum + item.price, 0));
    return {
      ready: false,
      fee: 0,
      unitPrice,
      count: 0,
      product: selected[0],
      products: selected,
      productIds: selected.map((item) => item.id),
      items: [],
      text: '',
      error: '请选择宠物'
    };
  }
  const items = petList.map((pet) => {
    const product = findWashProductForPet(selected, pet);
    return {
      pet,
      petId: pet.id,
      name: pet.name || '宠物',
      title: product ? product.title : '',
      fee: product ? roundWashMoney(product.price) : 0,
      productId: product ? product.id : ''
    };
  });
  const missing = items.find((row) => !row.productId);
  if (missing) {
    return {
      ready: false,
      fee: 0,
      unitPrice: roundWashMoney(selected.reduce((sum, item) => sum + item.price, 0)),
      count: 0,
      product: selected[0],
      products: selected,
      productIds: selected.map((item) => item.id),
      items,
      text: '',
      error: `请为「${missing.name}」选择洗护项目`
    };
  }
  const fee = roundWashMoney(items.reduce((sum, row) => sum + row.fee, 0));
  const count = petList.length;
  const unitPrice = count > 0 ? roundWashMoney(fee / count) : fee;
  const text = items.map((row) => `${row.name} · ${row.title} ¥${row.fee}`).join(' ');
  return {
    ready: true,
    fee,
    unitPrice,
    count,
    product: selected[0],
    products: selected,
    productIds: selected.map((item) => item.id),
    items,
    text,
    error: ''
  };
}

function calcWashValueAddedQuote({ services, pets, selectedIds }) {
  const options = buildWashProductOptions(services, pets);
  const ids = normalizeWashSelectedIds(selectedIds);
  const selected = ids
    .map((id) => options.find((item) => String(item.id || '') === id))
    .filter((item) => item && !item.disabled);
  if (!selected.length) {
    return { ready: true, fee: 0, items: [], text: '' };
  }
  const fee = roundWashMoney(selected.reduce((sum, item) => sum + (item.price || 0), 0));
  return {
    ready: true,
    fee,
    items: selected.map((item) => ({
      id: item.id,
      name: item.title || item.name || '增值服务',
      title: item.title || item.name || '增值服务',
      price: item.price,
      description: item.bodyText || item.description || '',
      photo: item.photo || ''
    })),
    text: selected.map((item) => `${item.title} ¥${item.price}`).join(' ')
  };
}

function uploadWashProductPhotos(list, fallbackList) {
  const normalized = normalizeWashProducts(list);
  const fallback = normalizeWashProducts(fallbackList || []);
  const fallbackById = {};
  fallback.forEach((item) => {
    fallbackById[item.id] = item;
  });

  return Promise.all(normalized.map((item) => {
    const photo = item.photo;
    if (!photo) {
      return Promise.resolve(normalizeWashProduct({ ...item, photo: '' }, item.id));
    }
    if (isRemotePhoto(photo) && !isLocalTempPath(photo)) {
      return Promise.resolve(item);
    }
    if (isLocalTempPath(photo)) {
      return uploadLocalImage(photo, 'wash-product-photos').then((url) => {
        if (!isRemotePhoto(url)) {
          return Promise.reject(new Error('洗护商品图片上传失败，请重试'));
        }
        return normalizeWashProduct({ ...item, photo: url }, item.id);
      });
    }
    const fallbackItem = fallbackById[item.id];
    if (fallbackItem && isRemotePhoto(fallbackItem.photo)) {
      return Promise.resolve(normalizeWashProduct({ ...item, photo: fallbackItem.photo }, item.id));
    }
    return Promise.resolve(normalizeWashProduct({ ...item, photo: '' }, item.id));
  }));
}

module.exports = {
  MAX_WASH_TITLE,
  MAX_WASH_BODY,
  WASH_PET_TYPE_OPTIONS,
  normalizeWashProducts,
  normalizeWashProductsForUi,
  addWashProduct,
  removeWashProduct,
  updateWashProductField,
  toggleWashProductPetType,
  validateWashProducts,
  isWashProductsComplete,
  compactWashProducts,
  matchesWashProductCondition,
  buildWashProductOptions,
  toggleWashProductSelection,
  ensureWashProductSelection,
  calcWashProductsQuote,
  calcWashValueAddedQuote,
  uploadWashProductPhotos
};
