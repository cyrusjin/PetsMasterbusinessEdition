/**
 * 上门喂养基础计价：统一服务项（名称、时长、平日价、服务范围）+ 可选距离加价。
 * 旧数据仍从 catPricing / dogPricing 迁移。
 */

const {
  resolveVisitServices,
  isVisitServicesStarted,
  isVisitServiceDraftEmpty,
  validateVisitServices,
  compactVisitServices
} = require('./homeVisitServices');

let visitIdSeed = 0;

function createVisitId(prefix) {
  visitIdSeed += 1;
  return `${prefix}_${Date.now()}_${visitIdSeed}`;
}

function sanitizeDecimalInput(value, maxDecimals) {
  let text = String(value == null ? '' : value).replace(/[^\d.]/g, '');
  const dot = text.indexOf('.');
  if (dot >= 0) {
    text = `${text.slice(0, dot + 1)}${text.slice(dot + 1).replace(/\./g, '')}`;
    const [intPart, decPart = ''] = text.split('.');
    text = `${intPart}.${decPart.slice(0, maxDecimals)}`;
  }
  return text;
}

function parsePositiveMoney(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function parsePositiveKm(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 10) / 10;
}

function parsePositiveInt(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function createDefaultDistanceTiers() {
  return [
    { minKm: '0', maxKm: '3', amount: '', isAbove: false },
    { minKm: '3', maxKm: '5', amount: '', isAbove: false },
    { minKm: '5', maxKm: '', amount: '', isAbove: true }
  ];
}

function createDefaultSurchargeTiers(includedKm) {
  const start = includedKm != null && String(includedKm).trim() !== '' ? String(includedKm) : '3';
  const mid = suggestNextMaxKm(start);
  return [
    { minKm: start, maxKm: mid, amount: '', isAbove: false, perKm: false },
    { minKm: mid, maxKm: '', amount: '', isAbove: true, perKm: false }
  ];
}

function roundMoney(value) {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
}

function isPerKmTier(item) {
  return !!(item && (item.perKm === true || item.mode === 'perKm' || item.unit === 'km'));
}

function createEmptyDogPackage(overrides) {
  return {
    id: createVisitId('dogpkg'),
    name: '',
    durationMin: '',
    description: '',
    basePrice: '',
    ...(overrides || {})
  };
}

function createDefaultDogPackages() {
  return [
    createEmptyDogPackage({ name: '基础遛狗', durationMin: '40' }),
    createEmptyDogPackage({ name: '进阶遛狗', durationMin: '60' })
  ];
}

function suggestNextMaxKm(minKm) {
  const n = parsePositiveKm(minKm);
  if (n == null) return '2';
  const step = n >= 10 ? 5 : 2;
  return String(Math.round((n + step) * 10) / 10);
}

function normalizeTier(raw, forEdit) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const explicitAbove = item.isAbove === true;
  const explicitRange = item.isAbove === false;
  const isAbove = explicitAbove || (!explicitRange && (item.maxKm === '' || item.maxKm == null));
  const minKm = item.minKm == null || item.minKm === '' ? '' : String(item.minKm);
  const maxKm = isAbove ? '' : (item.maxKm == null || item.maxKm === '' ? '' : String(item.maxKm));
  const amountRaw = item.amount != null ? item.amount : (item.price != null ? item.price : item.extra);
  const amount = amountRaw == null || amountRaw === '' ? '' : String(amountRaw);
  const perKm = isPerKmTier(item);
  if (forEdit) {
    return { minKm, maxKm, amount, isAbove, perKm };
  }
  const min = parsePositiveKm(minKm);
  const max = isAbove ? null : parsePositiveKm(maxKm);
  const money = parsePositiveMoney(amount);
  if (min == null || money == null) return null;
  if (!isAbove && (max == null || max <= min)) return null;
  return {
    minKm: min,
    maxKm: isAbove ? null : max,
    amount: money,
    isAbove,
    perKm
  };
}

function normalizeTiers(list, forEdit, createDefault) {
  const fallback = createDefault || createDefaultDistanceTiers;
  const raw = Array.isArray(list) && list.length ? list : fallback();
  if (forEdit) {
    const edited = raw.map((item) => normalizeTier(item, true));
    if (!edited.length) return fallback();
    if (!edited[edited.length - 1].isAbove) {
      const last = edited[edited.length - 1];
      edited.push({
        minKm: last.maxKm || last.minKm || '',
        maxKm: '',
        amount: '',
        isAbove: true,
        perKm: false
      });
    }
    return edited.map((item, index, arr) => {
      const isLast = index === arr.length - 1;
      if (isLast) {
        return { ...item, isAbove: true, maxKm: '' };
      }
      return { ...item, isAbove: false };
    });
  }
  return raw.map((item) => normalizeTier(item, false)).filter(Boolean);
}

function cloneTiers(list) {
  return (Array.isArray(list) ? list : []).map((tier) => ({ ...tier }));
}

function addTierToList(tiers, createDefault) {
  const list = cloneTiers(Array.isArray(tiers) && tiers.length ? tiers : createDefault());
  const last = list[list.length - 1] || {
    minKm: '0',
    maxKm: '',
    amount: '',
    isAbove: true,
    perKm: false
  };
  const startKm = last.minKm || (list.length > 1 && list[list.length - 2].maxKm) || '0';
  const endKm = suggestNextMaxKm(startKm);
  const insert = {
    minKm: startKm,
    maxKm: endKm,
    amount: '',
    isAbove: false,
    perKm: false
  };
  return [
    ...list.slice(0, -1),
    insert,
    {
      ...last,
      minKm: endKm,
      maxKm: '',
      isAbove: true
    }
  ];
}

function removeTierFromList(tiers, index) {
  const list = cloneTiers(tiers);
  if (list.length <= 1 || index < 0 || index >= list.length - 1) return list;
  return list.filter((_, idx) => idx !== index);
}

function updateTierInList(tiers, index, field, rawValue) {
  const list = cloneTiers(tiers);
  if (index < 0 || index >= list.length) return list;
  const target = { ...list[index] };
  if (field === 'minKm' || field === 'maxKm') {
    target[field] = sanitizeDecimalInput(rawValue, 1);
  } else if (field === 'amount') {
    target.amount = sanitizeDecimalInput(rawValue, 2);
  }
  list[index] = target;
  return list;
}

function createEmptyCatPackage(overrides) {
  return {
    id: createVisitId('catpkg'),
    name: '',
    durationMin: '',
    description: '',
    ...(overrides || {})
  };
}

function createDefaultCatPackages(description) {
  return [
    createEmptyCatPackage({
      name: '上门喂猫',
      description: description != null ? String(description) : ''
    })
  ];
}

function normalizeCatPackage(raw, forEdit) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (forEdit) {
    return {
      id: src.id || createVisitId('catpkg'),
      name: src.name != null ? String(src.name) : '',
      durationMin: src.durationMin != null && src.durationMin !== '' ? String(src.durationMin) : '',
      description: src.description != null ? String(src.description) : ''
    };
  }
  const name = ((src.name || '') + '').trim();
  if (!name) return null;
  const durationMin = parsePositiveInt(src.durationMin);
  return {
    id: src.id || createVisitId('catpkg'),
    name,
    durationMin: durationMin || 0,
    description: ((src.description || '') + '').trim().slice(0, 200)
  };
}

function isCatPackageDraftEmpty(item) {
  const src = item || {};
  const name = ((src.name || '') + '').trim();
  const desc = ((src.description || '') + '').trim();
  const isDefaultName = name === '上门喂猫';
  return (!name || isDefaultName) && !desc && !parsePositiveInt(src.durationMin);
}

function emptyDogForUi() {
  return {
    includedKm: '3',
    packages: createDefaultDogPackages(),
    surchargeEnabled: false,
    surchargeTiers: createDefaultSurchargeTiers('3')
  };
}

function normalizeDogPackage(raw, forEdit) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (forEdit) {
    return {
      id: src.id || createVisitId('dogpkg'),
      name: src.name != null ? String(src.name) : '',
      durationMin: src.durationMin != null && src.durationMin !== '' ? String(src.durationMin) : '',
      description: src.description != null ? String(src.description) : '',
      basePrice: src.basePrice != null && src.basePrice !== '' ? String(src.basePrice) : ''
    };
  }
  const name = ((src.name || '') + '').trim();
  const basePrice = parsePositiveMoney(src.basePrice);
  if (!name || !(basePrice > 0)) return null;
  const durationMin = parsePositiveInt(src.durationMin);
  return {
    id: src.id || createVisitId('dogpkg'),
    name,
    durationMin: durationMin || 0,
    description: ((src.description || '') + '').trim().slice(0, 200),
    basePrice
  };
}

function isCatStarted(cat) {
  const src = cat || {};
  const hasAmount = (src.distanceTiers || []).some((tier) => parsePositiveMoney(tier && tier.amount) > 0);
  const desc = ((src.description || '') + '').trim();
  const hasPackage = (src.packages || []).some((item) => !isCatPackageDraftEmpty(item));
  return hasAmount || !!desc || hasPackage;
}

function isDogPackageDraftEmpty(item) {
  const src = item || {};
  const name = ((src.name || '') + '').trim();
  const desc = ((src.description || '') + '').trim();
  const price = parsePositiveMoney(src.basePrice);
  const isDefaultName = name === '基础遛狗' || name === '进阶遛狗';
  return (!name || isDefaultName) && !desc && !(price > 0);
}

function hasFilledSurcharge(dog) {
  return ((dog && dog.surchargeTiers) || []).some((tier) => parsePositiveMoney(tier && tier.amount) > 0);
}

function isSurchargeEnabled(dog) {
  const src = dog || {};
  if (src.surchargeEnabled === true || src.surchargeEnabled === 'yes' || src.surchargeEnabled === 1 || src.surchargeEnabled === '1') {
    return true;
  }
  if (src.surchargeEnabled === false || src.surchargeEnabled === 'no' || src.surchargeEnabled === 0 || src.surchargeEnabled === '0') {
    return false;
  }
  return hasFilledSurcharge(src);
}

function isDogStarted(dog) {
  const src = dog || {};
  return (src.packages || []).some((item) => !isDogPackageDraftEmpty(item));
}

function normalizeCatPricing(raw, forEdit) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (forEdit) {
    const packages = Array.isArray(src.packages) && src.packages.length
      ? src.packages.map((item) => normalizeCatPackage(item, true))
      : createDefaultCatPackages(src.description);
    return {
      durationMin: src.durationMin != null && src.durationMin !== '' ? String(src.durationMin) : '',
      description: src.description != null ? String(src.description) : '',
      packages,
      distanceTiers: normalizeTiers(src.distanceTiers, true, createDefaultDistanceTiers)
    };
  }
  const durationMin = parsePositiveInt(src.durationMin);
  const packages = (Array.isArray(src.packages) ? src.packages : [])
    .map((item) => normalizeCatPackage(item, false))
    .filter(Boolean);
  const description = packages.length
    ? (packages.map((item) => item.description).filter(Boolean).join('；')
      || ((src.description || '') + '').trim().slice(0, 200))
    : ((src.description || '') + '').trim().slice(0, 200);
  return {
    durationMin: durationMin || 0,
    description,
    packages,
    distanceTiers: normalizeTiers(src.distanceTiers, false, createDefaultDistanceTiers)
  };
}

function normalizeDogPricing(raw, forEdit) {
  const src = raw && typeof raw === 'object' ? raw : {};
  if (forEdit) {
    const packages = Array.isArray(src.packages) && src.packages.length
      ? src.packages.map((item) => normalizeDogPackage(item, true))
      : createDefaultDogPackages();
    return {
      includedKm: src.includedKm != null && src.includedKm !== '' ? String(src.includedKm) : '3',
      packages,
      surchargeEnabled: isSurchargeEnabled(src),
      surchargeTiers: alignSurchargeTiersToIncluded(
        normalizeTiers(src.surchargeTiers, true, () => createDefaultSurchargeTiers(src.includedKm)),
        src.includedKm != null && src.includedKm !== '' ? String(src.includedKm) : '3'
      )
    };
  }
  const includedKm = parsePositiveKm(src.includedKm);
  return {
    includedKm: includedKm == null ? 0 : includedKm,
    packages: (Array.isArray(src.packages) ? src.packages : [])
      .map((item) => normalizeDogPackage(item, false))
      .filter(Boolean),
    surchargeEnabled: isSurchargeEnabled(src),
    surchargeTiers: normalizeTiers(src.surchargeTiers, false, createDefaultSurchargeTiers)
  };
}

function readVisitEnabled(src, inferred) {
  if (!src || typeof src !== 'object') return !!inferred;
  if (src.enabled === true || src.enabled === 'yes' || src.enabled === 1 || src.enabled === '1') return true;
  if (src.enabled === false || src.enabled === 'no' || src.enabled === 0 || src.enabled === '0') return false;
  return !!inferred;
}

function isCatEnabled(cat) {
  return readVisitEnabled(cat, isCatComplete(cat));
}

function isDogEnabled(dog) {
  return readVisitEnabled(dog, isDogComplete(dog));
}

function compactCatPricing(raw) {
  const cat = normalizeCatPricing(raw, false);
  const enabled = readVisitEnabled(raw, isCatComplete(cat));
  if (!cat.distanceTiers.length) {
    return {
      durationMin: cat.durationMin || 0,
      description: cat.description,
      packages: cat.packages || [],
      distanceTiers: [],
      enabled
    };
  }
  return { ...cat, enabled };
}

function compactDogPricing(raw) {
  const dog = normalizeDogPricing(raw, false);
  const enabled = readVisitEnabled(raw, isDogComplete({ ...(raw || {}), ...dog }));
  const surchargeEnabled = isSurchargeEnabled(raw);
  if (!dog.packages.length) {
    return {
      includedKm: dog.includedKm || 0,
      packages: [],
      surchargeEnabled,
      surchargeTiers: surchargeEnabled ? dog.surchargeTiers : [],
      enabled
    };
  }
  return { ...dog, enabled, surchargeEnabled };
}

function migrateVisitServices(list) {
  const items = Array.isArray(list) ? list : [];
  const catSrc = items.find((item) => item && item.priceMode !== 'base');
  const dogItems = items.filter((item) => item && item.priceMode === 'base');
  return {
    catPricing: compactCatPricing(catSrc
      ? {
        durationMin: catSrc.durationMin,
        description: catSrc.description,
        distanceTiers: catSrc.distanceTiers
      }
      : null),
    dogPricing: compactDogPricing(dogItems.length
      ? {
        includedKm: dogItems[0].includedKm,
        surchargeTiers: dogItems[0].surchargeTiers,
        packages: dogItems.map((item) => ({
          id: item.id,
          name: item.name,
          durationMin: item.durationMin,
          description: item.description,
          basePrice: item.basePrice
        }))
      }
      : null)
  };
}

function pickSurchargeSource(raw, dogPricing) {
  if (raw && (raw.surchargeEnabled != null || (Array.isArray(raw.surchargeTiers) && raw.surchargeTiers.length)
    || (raw.includedKm != null && raw.includedKm !== ''))) {
    return raw;
  }
  return dogPricing || {};
}

function compactVisitSurcharge(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const includedKm = parsePositiveKm(src.includedKm);
  return {
    includedKm: includedKm == null ? 0 : includedKm,
    surchargeEnabled: isSurchargeEnabled(src),
    surchargeTiers: normalizeTiers(src.surchargeTiers, false, createDefaultSurchargeTiers)
  };
}

function pickPrimaryVisitSurcharge(items, fallback) {
  const list = Array.isArray(items) ? items : [];
  const enabled = list.find((item) => isSurchargeEnabled(item));
  return compactVisitSurcharge(enabled || list[0] || fallback || {});
}

function resolveHomeVisitPricing(src) {
  const raw = src && typeof src === 'object' ? src : {};
  const hasNew = raw.catPricing != null || raw.dogPricing != null;
  const legacy = hasNew
    ? {
      catPricing: compactCatPricing(raw.catPricing),
      dogPricing: compactDogPricing(raw.dogPricing)
    }
    : migrateVisitServices(raw.visitServices);
  const serviceItems = resolveVisitServices({
    ...raw,
    catPricing: legacy.catPricing,
    dogPricing: legacy.dogPricing
  });
  const surcharge = pickPrimaryVisitSurcharge(
    serviceItems,
    pickSurchargeSource(raw, legacy.dogPricing)
  );
  return {
    catPricing: legacy.catPricing,
    dogPricing: {
      ...(legacy.dogPricing || {}),
      includedKm: surcharge.includedKm,
      surchargeEnabled: surcharge.surchargeEnabled,
      surchargeTiers: surcharge.surchargeTiers
    },
    serviceItems,
    includedKm: surcharge.includedKm,
    surchargeEnabled: surcharge.surchargeEnabled,
    surchargeTiers: surcharge.surchargeTiers
  };
}

function normalizeCatPricingForUi(raw) {
  return normalizeCatPricing(raw, true);
}

function normalizeDogPricingForUi(raw) {
  return normalizeDogPricing(raw, true);
}

function updateCatField(cat, field, rawValue) {
  const next = normalizeCatPricingForUi(cat);
  if (field === 'durationMin') next.durationMin = String(rawValue || '').replace(/[^\d]/g, '').slice(0, 3);
  else if (field === 'description') next.description = String(rawValue || '').slice(0, 200);
  return next;
}

function updateCatTierField(cat, index, field, rawValue) {
  const next = normalizeCatPricingForUi(cat);
  next.distanceTiers = updateTierInList(next.distanceTiers, index, field, rawValue);
  return next;
}

function addCatTier(cat) {
  const next = normalizeCatPricingForUi(cat);
  next.distanceTiers = addTierToList(next.distanceTiers, createDefaultDistanceTiers);
  return next;
}

function removeCatTier(cat, index) {
  const next = normalizeCatPricingForUi(cat);
  next.distanceTiers = removeTierFromList(next.distanceTiers, index);
  return next;
}

function updateCatPackageField(cat, index, field, rawValue) {
  const next = normalizeCatPricingForUi(cat);
  if (index < 0 || index >= next.packages.length) return next;
  const target = { ...next.packages[index] };
  if (field === 'name') target.name = String(rawValue || '').slice(0, 30);
  else if (field === 'description') target.description = String(rawValue || '').slice(0, 200);
  else if (field === 'durationMin') target.durationMin = String(rawValue || '').replace(/[^\d]/g, '').slice(0, 3);
  next.packages = next.packages.map((item, idx) => (idx === index ? target : item));
  return next;
}

function addCatPackage(cat) {
  const next = normalizeCatPricingForUi(cat);
  next.packages = [...next.packages, createEmptyCatPackage()];
  return next;
}

function removeCatPackage(cat, index) {
  const next = normalizeCatPricingForUi(cat);
  if (next.packages.length <= 1 || index < 0 || index >= next.packages.length) return next;
  next.packages = next.packages.filter((_, idx) => idx !== index);
  return next;
}

function alignSurchargeTiersToIncluded(tiers, includedKm) {
  const start = includedKm == null || String(includedKm).trim() === '' ? '0' : String(includedKm);
  const list = cloneTiers(Array.isArray(tiers) && tiers.length
    ? tiers
    : createDefaultSurchargeTiers(start));
  const first = { ...list[0], minKm: start };
  if (!first.isAbove) {
    const oldMax = first.maxKm;
    const min = parsePositiveKm(first.minKm);
    const max = parsePositiveKm(first.maxKm);
    if (min != null && (max == null || max <= min)) {
      first.maxKm = suggestNextMaxKm(first.minKm);
      if (list.length > 1) {
        const second = { ...list[1] };
        if (second.minKm === '' || second.minKm === oldMax || parsePositiveKm(second.minKm) <= min) {
          second.minKm = first.maxKm;
          list[1] = second;
        }
      }
    }
  }
  list[0] = first;
  return list;
}

function updateDogField(dog, field, rawValue) {
  const next = normalizeDogPricingForUi(dog);
  if (field === 'includedKm') {
    next.includedKm = sanitizeDecimalInput(rawValue, 1);
    next.surchargeTiers = alignSurchargeTiersToIncluded(next.surchargeTiers, next.includedKm);
  }
  return next;
}

function updateDogPackageField(dog, index, field, rawValue) {
  const next = normalizeDogPricingForUi(dog);
  if (index < 0 || index >= next.packages.length) return next;
  const target = { ...next.packages[index] };
  if (field === 'name') target.name = String(rawValue || '').slice(0, 30);
  else if (field === 'description') target.description = String(rawValue || '').slice(0, 200);
  else if (field === 'durationMin') target.durationMin = String(rawValue || '').replace(/[^\d]/g, '').slice(0, 3);
  else if (field === 'basePrice') target.basePrice = sanitizeDecimalInput(rawValue, 2);
  next.packages = next.packages.map((item, idx) => (idx === index ? target : item));
  return next;
}

function addDogPackage(dog) {
  const next = normalizeDogPricingForUi(dog);
  next.packages = [...next.packages, createEmptyDogPackage()];
  return next;
}

function removeDogPackage(dog, index) {
  const next = normalizeDogPricingForUi(dog);
  if (next.packages.length <= 1 || index < 0 || index >= next.packages.length) return next;
  next.packages = next.packages.filter((_, idx) => idx !== index);
  return next;
}

function updateDogSurchargeField(dog, index, field, rawValue) {
  const next = normalizeDogPricingForUi(dog);
  next.surchargeTiers = updateTierInList(next.surchargeTiers, index, field, rawValue);
  if (index === 0 && field === 'minKm') {
    next.includedKm = sanitizeDecimalInput(rawValue, 1);
    next.surchargeTiers = alignSurchargeTiersToIncluded(next.surchargeTiers, next.includedKm);
  }
  return next;
}

function addDogSurchargeTier(dog) {
  const next = normalizeDogPricingForUi(dog);
  next.surchargeTiers = addTierToList(next.surchargeTiers, createDefaultSurchargeTiers);
  return next;
}

function removeDogSurchargeTier(dog, index) {
  const next = normalizeDogPricingForUi(dog);
  next.surchargeTiers = removeTierFromList(next.surchargeTiers, index);
  return next;
}

function toggleDogSurchargeEnabled(dog, enabled) {
  const next = normalizeDogPricingForUi(dog);
  next.surchargeEnabled = !!enabled;
  if (next.surchargeEnabled && !(next.surchargeTiers || []).length) {
    next.surchargeTiers = createDefaultSurchargeTiers(next.includedKm);
  } else if (next.surchargeEnabled) {
    next.surchargeTiers = alignSurchargeTiersToIncluded(next.surchargeTiers, next.includedKm);
  }
  return next;
}

function toggleDogSurchargePerKm(dog, index) {
  const next = normalizeDogPricingForUi(dog);
  if (index < 0 || index >= next.surchargeTiers.length) return next;
  next.surchargeTiers = next.surchargeTiers.map((item, idx) => (
    idx === index ? { ...item, perKm: !item.perKm } : item
  ));
  return next;
}

function validateCatPricing(cat, options) {
  const required = !!(options && options.required);
  const started = isCatStarted(cat);
  if (!started) return required ? '请完善上门喂猫的距离价格' : '';
  const tiers = normalizeTiers((cat || {}).distanceTiers, false, createDefaultDistanceTiers);
  if (!tiers.length) return '请完善上门喂猫的距离价格（几公里、多少钱）';
  const packages = (Array.isArray((cat || {}).packages) ? cat.packages : [])
    .map((item) => normalizeCatPackage(item, false))
    .filter(Boolean);
  if (!packages.length) return '请至少添加一个喂猫服务内容并填写名称';
  return '';
}

function validateDogPricing(dog, options) {
  const required = !!(options && options.required);
  const started = isDogStarted(dog);
  if (!started) return required ? '请完善上门遛狗套餐价格' : '';
  const packages = (Array.isArray((dog || {}).packages) ? dog.packages : [])
    .filter((item) => !isDogPackageDraftEmpty(item));
  if (!packages.length) return '请至少添加一个遛狗套餐并填写价格和时长';
  for (let i = 0; i < packages.length; i += 1) {
    const item = packages[i];
    const label = ((item.name || '') + '').trim() || `第${i + 1}个遛狗套餐`;
    if (!((item.name || '') + '').trim()) return `请填写第${i + 1}个遛狗套餐的名称`;
    if (!(parsePositiveMoney(item.basePrice) > 0)) return `请填写「${label}」的平日价格`;
    if (!parsePositiveInt(item.durationMin)) return `请填写「${label}」的服务时长`;
  }
  if (!isSurchargeEnabled(dog)) return '';
  if (parsePositiveKm((dog || {}).includedKm) == null) return '请填写上门遛狗基础价包含的公里数';
  const surcharges = normalizeTiers((dog || {}).surchargeTiers, false, createDefaultSurchargeTiers);
  if (!surcharges.length) return '请完善上门遛狗距离加价档';
  return '';
}

function isCatComplete(cat) {
  return !validateCatPricing(cat, { required: true });
}

function isDogComplete(dog) {
  return !validateDogPricing(dog, { required: true });
}

function hasHomeVisitPricingDraft(homeFeeding) {
  const resolved = resolveHomeVisitPricing(homeFeeding);
  if (isVisitServicesStarted(homeFeeding && homeFeeding.serviceItems != null
    ? homeFeeding.serviceItems
    : resolved.serviceItems)) {
    return true;
  }
  return isCatStarted(homeFeeding && homeFeeding.catPricing != null
    ? homeFeeding.catPricing
    : resolved.catPricing)
    || isDogStarted(homeFeeding && homeFeeding.dogPricing != null
      ? homeFeeding.dogPricing
      : resolved.dogPricing);
}

function validateVisitItemSurcharge(item) {
  if (!isSurchargeEnabled(item)) return '';
  const label = ((item && item.name) || '').trim() || '上门服务';
  if (parsePositiveKm((item || {}).includedKm) == null) {
    return `请填写「${label}」基础价包含的公里数`;
  }
  const surcharges = normalizeTiers((item || {}).surchargeTiers, false, createDefaultSurchargeTiers);
  if (!surcharges.length) return `请完善「${label}」的距离加价档`;
  return '';
}

function validateVisitSurcharge(homeFeeding) {
  const items = homeFeeding && homeFeeding.serviceItems != null
    ? homeFeeding.serviceItems
    : (resolveHomeVisitPricing(homeFeeding).serviceItems || []);
  const drafts = Array.isArray(items) ? items.filter((item) => !isVisitServiceDraftEmpty(item)) : [];
  for (let i = 0; i < drafts.length; i += 1) {
    const err = validateVisitItemSurcharge(drafts[i]);
    if (err) return err;
  }
  return '';
}

function validateHomeVisitPricing(homeFeeding, options) {
  const required = !!(options && options.required);
  const resolved = resolveHomeVisitPricing(homeFeeding);
  const items = homeFeeding && homeFeeding.serviceItems != null
    ? homeFeeding.serviceItems
    : resolved.serviceItems;
  const itemErr = validateVisitServices(items, { required });
  if (itemErr) return itemErr;
  if (isVisitServicesStarted(items) || required) {
    const surchargeErr = validateVisitSurcharge(homeFeeding);
    if (surchargeErr) return surchargeErr;
  }
  return '';
}

function isHomeVisitPricingComplete(homeFeeding) {
  return !validateHomeVisitPricing(homeFeeding, { required: true });
}

function matchVisitTierAmount(tiers, distanceKm) {
  const km = parsePositiveKm(distanceKm);
  if (km == null) return null;
  const list = normalizeTiers(tiers, false, createDefaultDistanceTiers);
  let matched = null;
  list.forEach((tier) => {
    if (km < tier.minKm) return;
    if (!tier.isAbove && km > tier.maxKm) return;
    if (!matched || tier.minKm > matched.minKm) matched = tier;
  });
  return matched ? matched.amount : null;
}

function calcSurchargeExtra(tiers, distanceKm, includedKm) {
  const km = parsePositiveKm(distanceKm);
  if (km == null) return null;
  const included = parsePositiveKm(includedKm) || 0;
  if (km <= included) return 0;
  const list = normalizeTiers(tiers, false, createDefaultSurchargeTiers);
  if (!list.length) return 0;
  let matched = null;
  list.forEach((tier) => {
    if (km < tier.minKm) return;
    if (!tier.isAbove && km > tier.maxKm) return;
    if (!matched || tier.minKm > matched.minKm) matched = tier;
  });
  if (!matched) return 0;
  if (matched.perKm) {
    const from = Math.max(included, matched.minKm || 0);
    return roundMoney(Math.max(0, km - from) * matched.amount);
  }
  return matched.amount;
}

function calcCatVisitFee(catPricing, distanceKm) {
  const cat = normalizeCatPricing(catPricing, false);
  if (!cat.distanceTiers.length) return null;
  return matchVisitTierAmount(cat.distanceTiers, distanceKm);
}

function calcDogVisitFee(dogPricing, packageIdOrIndex, distanceKm) {
  const dog = normalizeDogPricing(dogPricing, false);
  if (!dog.packages.length) return null;
  let pkgs = [];
  if (Array.isArray(packageIdOrIndex)) {
    pkgs = packageIdOrIndex
      .map((id) => dog.packages.find((item) => item.id === id))
      .filter(Boolean);
  } else if (typeof packageIdOrIndex === 'number') {
    const pkg = dog.packages[packageIdOrIndex];
    if (pkg) pkgs = [pkg];
  } else if (packageIdOrIndex) {
    const pkg = dog.packages.find((item) => item.id === packageIdOrIndex);
    pkgs = pkg ? [pkg] : [dog.packages[0]];
  } else {
    pkgs = [dog.packages[0]];
  }
  if (!pkgs.length) return null;
  const extra = dog.surchargeEnabled
    ? (calcSurchargeExtra(dog.surchargeTiers, distanceKm, dog.includedKm) || 0)
    : 0;
  const base = pkgs.reduce((sum, pkg) => sum + (pkg.basePrice || 0), 0);
  return roundMoney(base + extra);
}

function calcVisitServiceFee(homeFeeding, serviceItemId, distanceKm) {
  const resolved = resolveHomeVisitPricing(homeFeeding);
  const items = compactVisitServices(resolved.serviceItems);
  if (!items.length) return null;
  const selected = serviceItemId
    ? items.find((item) => item.id === serviceItemId)
    : items[0];
  if (!selected) return null;
  const extra = isSurchargeEnabled(selected)
    ? (calcSurchargeExtra(selected.surchargeTiers, distanceKm, selected.includedKm) || 0)
    : 0;
  return roundMoney((selected.basePrice || 0) + extra);
}

function deriveLegacyPricingFromItems(homeFeeding) {
  const resolved = resolveHomeVisitPricing(homeFeeding);
  const items = compactVisitServices(resolved.serviceItems);
  const catPkgs = items
    .filter((item) => (item.petTypes || []).includes('猫咪'))
    .map((item) => ({
      id: item.id,
      name: item.name,
      durationMin: item.durationMin,
      description: item.description,
      basePrice: item.basePrice,
      valueAddedServices: item.valueAddedServices
    }));
  const dogPkgs = items
    .filter((item) => (item.petTypes || []).some((type) => String(type).indexOf('犬') >= 0))
    .map((item) => ({
      id: item.id,
      name: item.name,
      durationMin: item.durationMin,
      description: item.description,
      basePrice: item.basePrice,
      valueAddedServices: item.valueAddedServices
    }));
  const surcharge = pickPrimaryVisitSurcharge(items, resolved);
  return {
    catPricing: compactCatPricing({
      enabled: catPkgs.length > 0,
      packages: catPkgs,
      distanceTiers: [],
      description: catPkgs.map((item) => item.description).filter(Boolean).join('；')
    }),
    dogPricing: compactDogPricing({
      enabled: dogPkgs.length > 0,
      packages: dogPkgs,
      includedKm: surcharge.includedKm,
      surchargeEnabled: surcharge.surchargeEnabled,
      surchargeTiers: surcharge.surchargeTiers
    })
  };
}

module.exports = {
  resolveHomeVisitPricing,
  normalizeCatPricingForUi,
  normalizeDogPricingForUi,
  compactCatPricing,
  compactDogPricing,
  updateCatField,
  updateCatTierField,
  addCatTier,
  removeCatTier,
  updateCatPackageField,
  addCatPackage,
  removeCatPackage,
  updateDogField,
  updateDogPackageField,
  addDogPackage,
  removeDogPackage,
  updateDogSurchargeField,
  addDogSurchargeTier,
  removeDogSurchargeTier,
  toggleDogSurchargeEnabled,
  toggleDogSurchargePerKm,
  validateHomeVisitPricing,
  isHomeVisitPricingComplete,
  hasHomeVisitPricingDraft,
  isCatComplete,
  isDogComplete,
  isCatEnabled,
  isDogEnabled,
  calcCatVisitFee,
  calcDogVisitFee,
  calcVisitServiceFee,
  deriveLegacyPricingFromItems,
  compactVisitSurcharge,
  isSurchargeEnabled
};
