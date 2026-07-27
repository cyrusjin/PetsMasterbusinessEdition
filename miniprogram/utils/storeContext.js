const { isStoreOpenForUsers } = require('./storeStatus');
const { formatReceptionRangeText, normalizeReceptionRange } = require('./receptionRange');
const { normalizeDepartureCharge } = require('./billing');
const { formatLocationAddress } = require('./location');
const { resolveStoreDisplayUrls, isCloudFileId } = require('./mediaResolve');
const { normalizeWeightPricing } = require('./weightPricing');
const { normalizeRoomPricing } = require('./roomPricing');
const { attachStoreDisplayNo } = require('./displayNo');

function mergeBillingRules(store, defaults) {
  const fromStore = (store && store.billingRules) || {};
  return {
    ...defaults,
    ...fromStore,
    billingMode: fromStore.billingMode || defaults.billingMode,
    checkInDayCharge: fromStore.checkInDayCharge || defaults.checkInDayCharge,
    departureDayCharge: fromStore.departureDayCharge || defaults.departureDayCharge,
    departureCharge: normalizeDepartureCharge({
      ...defaults.departureCharge,
      ...(fromStore.departureCharge || {})
    }),
    weightPricing: normalizeWeightPricing(
      (fromStore.weightPricing && fromStore.weightPricing.length)
        ? fromStore.weightPricing
        : defaults.weightPricing
    ),
    roomPricing: normalizeRoomPricing(
      (fromStore.roomPricing && (
        Array.isArray(fromStore.roomPricing) ? fromStore.roomPricing.length : Object.keys(fromStore.roomPricing).length
      ))
        ? fromStore.roomPricing
        : defaults.roomPricing
    ),
    extras: {
      ...defaults.extras,
      ...(fromStore.extras || {})
    }
  };
}

function buildUserStoreView(store) {
  const normalized = attachStoreDisplayNo(store);
  if (!normalized || !normalized.store_id) return null;

  const receptionRange = normalizeReceptionRange(normalized.receptionRange || normalized.range);
  const storePhotos = Array.isArray(normalized.storePhotos) ? normalized.storePhotos.filter(Boolean) : [];
  const address = formatLocationAddress({
    name: normalized.locationName,
    address: normalized.addressRegion || normalized.address
  }) || (normalized.address || '').trim();
  const latitude = parseFloat(normalized.latitude);
  const longitude = parseFloat(normalized.longitude);

  return {
    ...normalized,
    address,
    contactPhone: (normalized.contactPhone || '').trim(),
    hasLocation: Number.isFinite(latitude) && Number.isFinite(longitude),
    receptionRange,
    receptionRangeText: formatReceptionRangeText(receptionRange) || normalized.range || '',
    storePhotos,
    hasPickup: normalized.pickupService === 'yes',
    pickupNotice: (normalized.pickupNotice || '').trim(),
    pickupPricingMode: normalized.pickupPricingMode === 'distance' ? 'distance' : 'flat',
    pickupFlatPrice: normalized.pickupFlatPrice != null ? normalized.pickupFlatPrice : '',
    pickupPricePerKm: normalized.pickupPricePerKm != null ? normalized.pickupPricePerKm : '',
    isOpen: isStoreOpenForUsers(normalized.status),
    deposit: normalized.deposit != null ? normalized.deposit : 0,
    depositText: `${normalized.deposit != null ? normalized.deposit : 0}元`
  };
}

function getExtraServiceList(rules) {
  const extras = (rules && rules.extras) || {};
  const labelMap = {
    pickup: '宠物接送',
    medicine: '定时喂药',
    wash: '洗护服务',
    extraMeal: '加餐',
    walk: '单独遛弯',
    specialCare: '特殊护理'
  };
  return Object.entries(extras).map(([key, price]) => ({
    key,
    label: labelMap[key] || key,
    price,
    checked: false
  }));
}

function prepareUserStoreView(store) {
  const view = buildUserStoreView(store);
  if (!view) return Promise.resolve(null);
  const hasHttpsMedia = (url) => typeof url === 'string' && url.startsWith('https://');
  const photosOk = !(view.storePhotos || []).some((url) => isCloudFileId(url));
  const logoOk = !view.logo || hasHttpsMedia(view.logo);
  if (photosOk && logoOk) {
    return Promise.resolve(view);
  }
  return resolveStoreDisplayUrls(view);
}

module.exports = {
  mergeBillingRules,
  buildUserStoreView,
  prepareUserStoreView,
  getExtraServiceList
};
