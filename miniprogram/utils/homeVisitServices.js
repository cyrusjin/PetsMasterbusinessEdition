/**
 * 上门喂养统一服务项：名称、时长、平日价、描述、服务范围、按项增值服务。
 * 旧数据从 catPricing / dogPricing 迁移。
 */

const {
  RECEPTION_RANGE_OPTIONS,
  normalizeReceptionRange,
  isPetAllowedByReceptionRange
} = require('./receptionRange');
const { normalizeValueAddedServices, validateValueAddedServices } = require('./valueAddedServices');
const { formatMoney } = require('./billing');

const CAT_PET_TYPES = ['猫咪'];
const DOG_PET_TYPES = ['小型犬', '中型犬', '大型犬'];
const VISIT_PET_TYPE_OPTIONS = RECEPTION_RANGE_OPTIONS.map((item) => ({
  value: item.value,
  label: item.label
}));

let visitServiceIdSeed = 0;

function createVisitServiceId() {
  visitServiceIdSeed += 1;
  return `visit_${Date.now()}_${visitServiceIdSeed}`;
}

function parsePositiveMoney(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function parsePositiveInt(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
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

function normalizeVisitPetTypes(list) {
  return normalizeReceptionRange(Array.isArray(list) ? list : []);
}

function visitPetTypeOptions(selected, shopRange) {
  const petTypes = normalizeVisitPetTypes(selected);
  const allowed = normalizeReceptionRange(shopRange);
  const source = allowed.length
    ? VISIT_PET_TYPE_OPTIONS.filter((opt) => allowed.includes(opt.value))
    : VISIT_PET_TYPE_OPTIONS;
  return source.map((opt) => ({
    ...opt,
    checked: petTypes.includes(opt.value)
  }));
}

function createEmptyVisitService(overrides) {
  return {
    id: createVisitServiceId(),
    name: '',
    durationMin: '',
    description: '',
    basePrice: '',
    petTypes: [],
    valueAddedServices: [],
    includedKm: '3',
    surchargeEnabled: false,
    surchargeTiers: [],
    ...(overrides || {})
  };
}

function createDefaultVisitServices() {
  return [
    createEmptyVisitService({ name: '上门喂猫', durationMin: '30', petTypes: CAT_PET_TYPES.slice() }),
    createEmptyVisitService({ name: '基础遛狗', durationMin: '40', petTypes: DOG_PET_TYPES.slice() })
  ];
}

function pickItemSurcharge(src) {
  const item = src && typeof src === 'object' ? src : {};
  return {
    includedKm: item.includedKm != null && item.includedKm !== '' ? item.includedKm : '3',
    surchargeEnabled: item.surchargeEnabled === true
      || item.surchargeEnabled === 'yes'
      || item.surchargeEnabled === 1
      || item.surchargeEnabled === '1',
    surchargeTiers: Array.isArray(item.surchargeTiers)
      ? item.surchargeTiers.map((tier) => ({ ...tier }))
      : []
  };
}

function normalizeVisitService(raw, forEdit) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const petTypes = normalizeVisitPetTypes(src.petTypes);
  const valueAddedServices = normalizeValueAddedServices(src.valueAddedServices);
  const surcharge = pickItemSurcharge(src);
  if (forEdit) {
    return {
      id: src.id || createVisitServiceId(),
      name: src.name != null ? String(src.name) : '',
      durationMin: src.durationMin != null && src.durationMin !== '' ? String(src.durationMin) : '',
      description: src.description != null ? String(src.description) : '',
      basePrice: src.basePrice != null && src.basePrice !== '' ? String(src.basePrice) : '',
      petTypes,
      valueAddedServices,
      includedKm: String(surcharge.includedKm),
      surchargeEnabled: surcharge.surchargeEnabled,
      surchargeTiers: surcharge.surchargeTiers
    };
  }
  const name = ((src.name || '') + '').trim();
  const basePrice = parsePositiveMoney(src.basePrice);
  if (!name || !(basePrice > 0)) return null;
  const durationMin = parsePositiveInt(src.durationMin);
  return {
    id: src.id || createVisitServiceId(),
    name,
    durationMin: durationMin || 0,
    description: ((src.description || '') + '').trim().slice(0, 200),
    basePrice,
    petTypes,
    valueAddedServices: valueAddedServices.filter(isBookableVisitVas),
    includedKm: surcharge.includedKm,
    surchargeEnabled: surcharge.surchargeEnabled,
    surchargeTiers: surcharge.surchargeTiers
  };
}

function isVisitServiceDraftEmpty(item) {
  const src = item || {};
  const name = ((src.name || '') + '').trim();
  const desc = ((src.description || '') + '').trim();
  const price = parsePositiveMoney(src.basePrice);
  const hasVas = Array.isArray(src.valueAddedServices) && src.valueAddedServices.some((row) => {
    const vasName = ((row && row.name) || '').trim();
    return !!vasName || parsePositiveMoney(row && row.price) > 0;
  });
  const hasSurcharge = src.surchargeEnabled === true
    || src.surchargeEnabled === 'yes'
    || (Array.isArray(src.surchargeTiers) && src.surchargeTiers.some((tier) => (
      parsePositiveMoney(tier && (tier.amount != null ? tier.amount : tier.price)) > 0
    )));
  const isDefaultName = name === '上门喂猫' || name === '基础遛狗' || name === '进阶遛狗';
  return (!name || isDefaultName)
    && !desc
    && !(price > 0)
    && !hasVas
    && !hasSurcharge
    && !parsePositiveInt(src.durationMin);
}

function decorateVisitServiceForUi(item, shopRange) {
  const normalized = normalizeVisitService(item, true);
  return {
    ...normalized,
    petTypeOptions: visitPetTypeOptions(normalized.petTypes, shopRange)
  };
}

function normalizeVisitServicesForUi(input, shopRange) {
  const list = Array.isArray(input) && input.length
    ? input.map((item) => normalizeVisitService(item, true))
    : createDefaultVisitServices();
  return list.map((item) => decorateVisitServiceForUi(item, shopRange));
}

function compactVisitServices(input) {
  if (!Array.isArray(input) || !input.length) return [];
  return uniquifyVisitServiceIds(
    input.map((item) => normalizeVisitService(item, false)).filter(Boolean)
  );
}

function uniquifyVisitServiceIds(list) {
  const seen = {};
  return (Array.isArray(list) ? list : []).map((item, index) => {
    if (!item || typeof item !== 'object') return item;
    let id = String(item.id || '').trim();
    if (!id || seen[id]) {
      const base = id || `visit_${index + 1}`;
      let next = id ? `${base}_${index + 1}` : base;
      let n = 2;
      while (seen[next]) {
        next = `${base}_${n}`;
        n += 1;
      }
      id = next;
    }
    seen[id] = true;
    return { ...item, id };
  });
}

function cloneVisitServiceList(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    ...item,
    petTypes: Array.isArray(item.petTypes) ? item.petTypes.slice() : [],
    petTypeOptions: Array.isArray(item.petTypeOptions)
      ? item.petTypeOptions.map((opt) => ({ ...opt }))
      : visitPetTypeOptions(item.petTypes),
    valueAddedServices: Array.isArray(item.valueAddedServices)
      ? item.valueAddedServices.map((row) => ({ ...row }))
      : [],
    surchargeTiers: Array.isArray(item.surchargeTiers)
      ? item.surchargeTiers.map((tier) => ({ ...tier }))
      : []
  }));
}

function addVisitService(list, shopRange) {
  const petTypes = normalizeVisitPetTypes(shopRange);
  return [
    ...cloneVisitServiceList(list),
    decorateVisitServiceForUi(createEmptyVisitService({ petTypes }), shopRange)
  ];
}

function removeVisitService(list, index) {
  const next = cloneVisitServiceList(list);
  if (next.length <= 1 || index < 0 || index >= next.length) return next;
  return next.filter((_, idx) => idx !== index);
}

function updateVisitServiceField(list, index, field, rawValue) {
  const next = cloneVisitServiceList(list);
  if (index < 0 || index >= next.length) return next;
  const target = { ...next[index] };
  if (field === 'name') target.name = String(rawValue || '').slice(0, 30);
  else if (field === 'description') target.description = String(rawValue || '').slice(0, 200);
  else if (field === 'durationMin') target.durationMin = String(rawValue || '').replace(/[^\d]/g, '').slice(0, 3);
  else if (field === 'basePrice') target.basePrice = sanitizeDecimalInput(rawValue, 2);
  next[index] = target;
  return next;
}

function toggleVisitServicePetType(list, index, type, shopRange) {
  const next = cloneVisitServiceList(list);
  if (index < 0 || index >= next.length) return next;
  const target = { ...next[index] };
  const value = String(type || '').trim();
  const options = visitPetTypeOptions(target.petTypes, shopRange);
  if (!options.some((item) => item.value === value)) return next;
  const current = Array.isArray(target.petTypes) ? target.petTypes.slice() : [];
  const pos = current.indexOf(value);
  if (pos >= 0) current.splice(pos, 1);
  else current.push(value);
  target.petTypes = normalizeVisitPetTypes(current);
  target.petTypeOptions = visitPetTypeOptions(target.petTypes, shopRange);
  next[index] = target;
  return next;
}

function patchVisitServiceSurcharge(list, index, surcharge) {
  const next = cloneVisitServiceList(list);
  if (index < 0 || index >= next.length) return next;
  const src = surcharge || {};
  next[index] = {
    ...next[index],
    includedKm: src.includedKm,
    surchargeEnabled: !!src.surchargeEnabled,
    surchargeTiers: Array.isArray(src.surchargeTiers)
      ? src.surchargeTiers.map((tier) => ({ ...tier }))
      : next[index].surchargeTiers
  };
  return next;
}

function inheritItemSurcharge(item, fallback) {
  const src = item && typeof item === 'object' ? item : {};
  const hasOwn = src.surchargeEnabled === true
    || src.surchargeEnabled === false
    || src.surchargeEnabled === 'yes'
    || src.surchargeEnabled === 'no'
    || (Array.isArray(src.surchargeTiers) && src.surchargeTiers.length)
    || (src.includedKm != null && String(src.includedKm).trim() !== '');
  if (hasOwn) return src;
  const fb = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    ...src,
    includedKm: fb.includedKm,
    surchargeEnabled: fb.surchargeEnabled,
    surchargeTiers: Array.isArray(fb.surchargeTiers)
      ? fb.surchargeTiers.map((tier) => ({ ...tier }))
      : []
  };
}

function refreshVisitServicePetTypeOptions(list, shopRange) {
  return cloneVisitServiceList(list).map((item) => decorateVisitServiceForUi(item, shopRange));
}

function updateVisitServiceVasField(list, index, vasIndex, field, rawValue) {
  const next = cloneVisitServiceList(list);
  if (index < 0 || index >= next.length) return next;
  const target = { ...next[index] };
  target.valueAddedServices = updateValueAddedServiceFieldSafe(
    target.valueAddedServices,
    vasIndex,
    field,
    rawValue
  );
  next[index] = target;
  return next;
}

function addVisitServiceVas(list, index) {
  const next = cloneVisitServiceList(list);
  if (index < 0 || index >= next.length) return next;
  const target = { ...next[index] };
  const { addValueAddedService } = require('./valueAddedServices');
  target.valueAddedServices = addValueAddedService(target.valueAddedServices);
  next[index] = target;
  return next;
}

function removeVisitServiceVas(list, index, vasIndex) {
  const next = cloneVisitServiceList(list);
  if (index < 0 || index >= next.length) return next;
  const target = { ...next[index] };
  const { removeValueAddedService } = require('./valueAddedServices');
  target.valueAddedServices = removeValueAddedService(target.valueAddedServices, vasIndex);
  next[index] = target;
  return next;
}

function updateValueAddedServiceFieldSafe(list, vasIndex, field, rawValue) {
  const { updateValueAddedServiceField } = require('./valueAddedServices');
  return updateValueAddedServiceField(list, vasIndex, field, rawValue);
}

function firstFilledAmount(tiers) {
  const list = Array.isArray(tiers) ? tiers : [];
  for (let i = 0; i < list.length; i += 1) {
    const amount = parsePositiveMoney(list[i] && (list[i].amount != null ? list[i].amount : list[i].price));
    if (amount > 0) return amount;
  }
  return 0;
}

function pickFallbackSurcharge(src) {
  const raw = src && typeof src === 'object' ? src : {};
  const hasTop = raw.surchargeEnabled != null
    || (Array.isArray(raw.surchargeTiers) && raw.surchargeTiers.length)
    || (raw.includedKm != null && String(raw.includedKm).trim() !== '');
  if (hasTop) return raw;
  return raw.dogPricing || {};
}

function buildServiceItemsFromLegacy(catPricing, dogPricing, globalVas, surchargeFallback) {
  const items = [];
  const sharedVas = normalizeValueAddedServices(globalVas);
  const surcharge = pickItemSurcharge(surchargeFallback || dogPricing || {});
  const catPkgs = Array.isArray(catPricing && catPricing.packages) ? catPricing.packages : [];
  const catAmount = firstFilledAmount(catPricing && catPricing.distanceTiers);
  if (catPkgs.length) {
    catPkgs.forEach((pkg) => {
      const name = ((pkg && pkg.name) || '').trim() || '上门喂猫';
      items.push(createEmptyVisitService({
        id: (pkg && pkg.id) || createVisitServiceId(),
        name,
        durationMin: pkg && pkg.durationMin != null ? pkg.durationMin : (catPricing && catPricing.durationMin) || '',
        description: (pkg && pkg.description) || (catPricing && catPricing.description) || '',
        basePrice: (pkg && pkg.basePrice) || catAmount || '',
        petTypes: CAT_PET_TYPES.slice(),
        valueAddedServices: Array.isArray(pkg && pkg.valueAddedServices) && pkg.valueAddedServices.length
          ? pkg.valueAddedServices
          : sharedVas,
        includedKm: surcharge.includedKm,
        surchargeEnabled: surcharge.surchargeEnabled,
        surchargeTiers: surcharge.surchargeTiers
      }));
    });
  } else if (catPricing && (catPricing.enabled || catAmount || ((catPricing.description || '') + '').trim())) {
    items.push(createEmptyVisitService({
      name: '上门喂猫',
      durationMin: catPricing.durationMin || '',
      description: catPricing.description || '',
      basePrice: catAmount || '',
      petTypes: CAT_PET_TYPES.slice(),
      valueAddedServices: sharedVas,
      includedKm: surcharge.includedKm,
      surchargeEnabled: surcharge.surchargeEnabled,
      surchargeTiers: surcharge.surchargeTiers
    }));
  }
  const dogPkgs = Array.isArray(dogPricing && dogPricing.packages) ? dogPricing.packages : [];
  dogPkgs.forEach((pkg) => {
    items.push(createEmptyVisitService({
      id: (pkg && pkg.id) || createVisitServiceId(),
      name: (pkg && pkg.name) || '',
      durationMin: pkg && pkg.durationMin != null ? pkg.durationMin : '',
      description: (pkg && pkg.description) || '',
      basePrice: pkg && pkg.basePrice != null ? pkg.basePrice : '',
      petTypes: DOG_PET_TYPES.slice(),
      valueAddedServices: Array.isArray(pkg && pkg.valueAddedServices) && pkg.valueAddedServices.length
        ? pkg.valueAddedServices
        : sharedVas,
      includedKm: surcharge.includedKm,
      surchargeEnabled: surcharge.surchargeEnabled,
      surchargeTiers: surcharge.surchargeTiers
    }));
  });
  return items;
}

function resolveVisitServices(homeFeeding) {
  const src = homeFeeding && typeof homeFeeding === 'object' ? homeFeeding : {};
  const fallback = pickFallbackSurcharge(src);
  if (Array.isArray(src.serviceItems) && src.serviceItems.length) {
    return src.serviceItems.map((item) => inheritItemSurcharge(item, fallback));
  }
  return buildServiceItemsFromLegacy(src.catPricing, src.dogPricing, src.valueAddedServices, fallback);
}

function isVisitServicesStarted(list) {
  return (Array.isArray(list) ? list : []).some((item) => !isVisitServiceDraftEmpty(item));
}

function validateVisitServices(list, options) {
  const required = !!(options && options.required);
  const started = isVisitServicesStarted(list);
  if (!started) return required ? '请至少添加一个上门服务项目并填写价格' : '';
  const drafts = Array.isArray(list) ? list.filter((item) => !isVisitServiceDraftEmpty(item)) : [];
  if (!drafts.length) return '请至少添加一个上门服务项目并填写价格';
  for (let i = 0; i < drafts.length; i += 1) {
    const item = drafts[i];
    const label = ((item.name || '') + '').trim() || `第${i + 1}个上门服务`;
    if (!((item.name || '') + '').trim()) return `请填写第${i + 1}个上门服务的名称`;
    if (!(parsePositiveMoney(item.basePrice) > 0)) return `请填写「${label}」的平日价格`;
    if (!parsePositiveInt(item.durationMin)) return `请填写「${label}」的服务时长`;
    if (!normalizeVisitPetTypes(item.petTypes).length) {
      return `请为「${label}」设置服务范围（宠物类别）`;
    }
    const vasErr = validateValueAddedServices(item.valueAddedServices, { requireContent: false });
    if (vasErr) return `「${label}」${vasErr}`;
  }
  return '';
}

function itemMatchesPet(item, pet) {
  const petTypes = normalizeVisitPetTypes(item && item.petTypes);
  if (!petTypes.length) return false;
  const petType = pet && (pet.type || pet.petType);
  return isPetAllowedByReceptionRange(petType, petTypes);
}

function itemMatchesPets(item, pets) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (!list.length) return true;
  return list.every((pet) => itemMatchesPet(item, pet));
}

function itemMatchesAnyPet(item, pets) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (!list.length) return true;
  return list.some((pet) => itemMatchesPet(item, pet));
}

function petsMatchingItem(item, pets) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  return list.filter((pet) => itemMatchesPet(item, pet));
}

function petsNotMatchingItem(item, pets) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  return list.filter((pet) => !itemMatchesPet(item, pet));
}

function describeVisitCoverGap(itemOrItems, pets) {
  const selected = Array.isArray(itemOrItems)
    ? itemOrItems.filter(Boolean)
    : (itemOrItems ? [itemOrItems] : []);
  const unmatched = (Array.isArray(pets) ? pets.filter(Boolean) : []).filter(
    (pet) => !selected.some((item) => itemMatchesPet(item, pet))
  );
  if (!unmatched.length) return '';
  const names = unmatched.map((pet) => pet.name || '宠物').join('、');
  if (selected.length <= 1) {
    const serviceName = ((selected[0] && selected[0].name) || '该项目').trim() || '该项目';
    return `「${serviceName}」不适用于「${names}」，请再勾选适用项目，或取消勾选该宠物`;
  }
  return `请为「${names}」勾选适用的上门项目，或取消勾选该宠物`;
}

function normalizeVisitServiceIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim()).filter(Boolean);
  }
  const one = String(raw || '').trim();
  return one ? [one] : [];
}

function visitServicesShareTarget(left, right, pets) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (list.length) {
    return list.some((pet) => itemMatchesPet(left, pet) && itemMatchesPet(right, pet));
  }
  const typesA = normalizeVisitPetTypes(left && left.petTypes);
  const typesB = normalizeVisitPetTypes(right && right.petTypes);
  if (!typesA.length || !typesB.length) return true;
  return typesA.some((type) => typesB.indexOf(type) >= 0);
}

function toggleVisitServiceSelection(services, selectedIds, nextId, pets) {
  const list = Array.isArray(services) ? services : [];
  const id = String(nextId || '').trim();
  if (!id || !list.some((item) => String(item.id || '') === id)) {
    return normalizeVisitServiceIds(selectedIds);
  }
  const current = normalizeVisitServiceIds(selectedIds).filter((itemId) => (
    list.some((item) => String(item.id || '') === itemId)
  ));
  if (current.indexOf(id) >= 0) {
    return current.filter((itemId) => itemId !== id);
  }
  const nextItem = list.find((item) => String(item.id || '') === id);
  const kept = current.filter((itemId) => {
    const item = list.find((row) => String(row.id || '') === itemId);
    return item && !visitServicesShareTarget(item, nextItem, pets);
  });
  kept.push(id);
  return kept;
}

function ensureVisitServiceSelection(services, selectedIds, pets) {
  const list = Array.isArray(services) ? services : [];
  const petsList = Array.isArray(pets) ? pets.filter(Boolean) : [];
  const ids = [];
  normalizeVisitServiceIds(selectedIds).forEach((id) => {
    const item = list.find((row) => String(row.id || '') === id);
    if (!item) return;
    const conflict = ids.some((keptId) => {
      const kept = list.find((row) => String(row.id || '') === keptId);
      return kept && visitServicesShareTarget(kept, item, petsList);
    });
    if (!conflict) ids.push(id);
  });
  petsList.forEach((pet) => {
    const covered = ids.some((id) => {
      const item = list.find((row) => String(row.id || '') === id);
      return item && itemMatchesPet(item, pet);
    });
    if (covered) return;
    const extra = list.find((item) => {
      const extraId = String((item && item.id) || '');
      if (!extraId || !itemMatchesPet(item, pet) || ids.indexOf(extraId) >= 0) return false;
      return !ids.some((keptId) => {
        const kept = list.find((row) => String(row.id || '') === keptId);
        return kept && visitServicesShareTarget(kept, item, petsList);
      });
    });
    if (extra) ids.push(String(extra.id || ''));
  });
  if (!ids.length && list[0] && list[0].id) ids.push(String(list[0].id));
  return ids;
}

function isBookableVisitVas(row) {
  if (!row || typeof row !== 'object') return false;
  const name = String(row.name || '').trim();
  const price = parseFloat(row.price);
  return !!name && Number.isFinite(price) && price > 0;
}

function mergeVisitValueAddedServices(services) {
  const seen = {};
  const list = [];
  (Array.isArray(services) ? services : []).forEach((item) => {
    const serviceId = String((item && item.id) || '').trim();
    (item && Array.isArray(item.valueAddedServices) ? item.valueAddedServices : []).forEach((row) => {
      if (!isBookableVisitVas(row)) return;
      const rawId = String(row.id || row.name || '').trim();
      const key = serviceId ? `${serviceId}__${rawId}` : rawId;
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push({ ...row, id: key });
    });
  });
  return list;
}

function listVisitServices(homeFeeding, pets) {
  const items = compactVisitServices(resolveVisitServices(homeFeeding));
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  return items
    .filter((item) => (list.length ? itemMatchesAnyPet(item, list) : true))
    .map((item) => ({
      ...item,
      id: String(item.id || ''),
      priceText: formatMoney(item.basePrice),
      durationText: item.durationMin ? `${item.durationMin}分钟` : '',
      description: ((item.description || '') + '').trim()
    }));
}

module.exports = {
  CAT_PET_TYPES,
  DOG_PET_TYPES,
  VISIT_PET_TYPE_OPTIONS,
  createEmptyVisitService,
  createDefaultVisitServices,
  normalizeVisitService,
  normalizeVisitServicesForUi,
  compactVisitServices,
  addVisitService,
  removeVisitService,
  updateVisitServiceField,
  toggleVisitServicePetType,
  patchVisitServiceSurcharge,
  refreshVisitServicePetTypeOptions,
  updateVisitServiceVasField,
  addVisitServiceVas,
  removeVisitServiceVas,
  resolveVisitServices,
  buildServiceItemsFromLegacy,
  isVisitServicesStarted,
  isVisitServiceDraftEmpty,
  validateVisitServices,
  itemMatchesPet,
  itemMatchesPets,
  itemMatchesAnyPet,
  petsMatchingItem,
  describeVisitCoverGap,
  normalizeVisitServiceIds,
  toggleVisitServiceSelection,
  ensureVisitServiceSelection,
  mergeVisitValueAddedServices,
  listVisitServices,
  visitPetTypeOptions
};
