const { isStoreOpenForUsers } = require('./storeStatus');
const { formatReceptionRangeText, normalizeReceptionRange } = require('./receptionRange');
const { normalizeDepartureCharge } = require('./billing');
const { formatLocationAddress } = require('./location');
const { resolveStoreDisplayUrls, isCloudFileId } = require('./mediaResolve');
const { normalizeWeightPricing } = require('./weightPricing');
const { normalizeRoomPricing } = require('./roomPricing');
const { normalizeCustomPricing } = require('./customPricing');
const { attachStoreDisplayNo } = require('./displayNo');
const { normalizeMultiPetDiscount, getDefaultMultiPetDiscount } = require('./multiPetPricing');
const { normalizeLongTermDiscount, getDefaultLongTermDiscount } = require('./longTermDiscount');
const {
  getDefaultHolidayPricing,
  normalizeHolidayPricing
} = require('./legalHolidays');
const { normalizeWashPricing, normalizeWashFreeMinDays } = require('./washPricing');
const { resolveStoreValueAddedServices } = require('./valueAddedServices');
const { normalizePickupFreeTiers } = require('./pickupPricing');
const { compactWashProducts } = require('./washProducts');
const { normalizeHomeFeeding } = require('./homeFeeding');
const { normalizeServiceLines, getBookableServiceOptions } = require('./serviceLines');
const { isHomeVisitPricingComplete } = require('./homeVisitPricing');

function mergeBillingRules(store, defaults) {
  const fromStore = (store && store.billingRules) || {};
  const defaultDiscount = (defaults && defaults.multiPetDiscount) || getDefaultMultiPetDiscount();
  const defaultLongTerm = (defaults && defaults.longTermDiscount) || getDefaultLongTermDiscount();
  const defaultHolidayPricing = (defaults && defaults.holidayPricing) || getDefaultHolidayPricing();
  const valueAddedServices = resolveStoreValueAddedServices(store);
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
    customPricing: normalizeCustomPricing(
      (fromStore.customPricing && fromStore.customPricing.length)
        ? fromStore.customPricing
        : defaults.customPricing
    ),
    extras: {
      ...defaults.extras,
      ...(fromStore.extras || {})
    },
    valueAddedServices,
    holidayPricing: normalizeHolidayPricing(
      fromStore.holidayPricing != null ? fromStore.holidayPricing : defaultHolidayPricing
    ),
    multiPetDiscount: normalizeMultiPetDiscount(
      fromStore.multiPetDiscount != null ? fromStore.multiPetDiscount : defaultDiscount
    ),
    longTermDiscount: normalizeLongTermDiscount(
      fromStore.longTermDiscount != null ? fromStore.longTermDiscount : defaultLongTerm
    )
  };
}

function buildUserStoreView(store) {
  const normalized = attachStoreDisplayNo(store);
  if (!normalized || !normalized.store_id) return null;

  const receptionRange = normalizeReceptionRange(normalized.receptionRange || normalized.range);
  const storePhotos = Array.isArray(normalized.storePhotos) ? normalized.storePhotos.filter(Boolean) : [];
  const introPhotos = Array.isArray(normalized.introPhotos) ? normalized.introPhotos.filter(Boolean) : [];
  const noticePhotos = Array.isArray(normalized.noticePhotos) ? normalized.noticePhotos.filter(Boolean) : [];
  const washNoticePhotos = Array.isArray(normalized.washNoticePhotos)
    ? normalized.washNoticePhotos.filter(Boolean)
    : [];
  const washProducts = compactWashProducts(normalized.washProducts);
  const washValueAddedServices = compactWashProducts(normalized.washValueAddedServices);
  const homeFeeding = normalizeHomeFeeding(normalized.homeFeeding);
  const serviceLines = normalizeServiceLines(normalized.serviceLines);
  const serviceOptions = getBookableServiceOptions(normalized, {
    washComplete: washProducts.length > 0,
    homeFeedingComplete: isHomeVisitPricingComplete(homeFeeding)
  });
  const hasWashLine = serviceOptions.some((item) => item.key === 'wash');
  const hasHomeFeedingLine = serviceOptions.some((item) => item.key === 'homeFeeding');
  const hasBoardingLine = serviceOptions.some((item) => item.key === 'boarding');
  const homeNoticePhotos = Array.isArray(homeFeeding.noticePhotos)
    ? homeFeeding.noticePhotos.filter(Boolean)
    : [];
  const valueAddedServices = resolveStoreValueAddedServices(normalized);
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
    wechatId: (normalized.wechatId || '').trim(),
    hasLocation: Number.isFinite(latitude) && Number.isFinite(longitude),
    receptionRange,
    receptionRangeText: formatReceptionRangeText(receptionRange) || normalized.range || '',
    storePhotos,
    introPhotos,
    notice: (normalized.notice || '').trim(),
    noticePhotos,
    hasPickup: normalized.pickupService === 'yes',
    pickupNotice: (normalized.pickupNotice || '').trim(),
    pickupPricingMode: normalized.pickupPricingMode === 'distance' ? 'distance' : 'flat',
    pickupFlatPrice: normalized.pickupFlatPrice != null ? normalized.pickupFlatPrice : '',
    pickupPricePerKm: normalized.pickupPricePerKm != null ? normalized.pickupPricePerKm : '',
    ...(() => {
      const pickupFreeTiers = normalizePickupFreeTiers(normalized.pickupFreeTiers, normalized);
      return {
        pickupFreeTiers,
        pickupFreeMinDays: pickupFreeTiers[0] ? pickupFreeTiers[0].minDays : '',
        pickupFreeMaxKm: pickupFreeTiers[0] ? pickupFreeTiers[0].maxKm : ''
      };
    })(),
    hasWash: normalized.washService === 'yes',
    washPricing: normalizeWashPricing(normalized.washPricing || []),
    washFreeMinDays: normalized.washFreeMinDays != null && normalized.washFreeMinDays !== ''
      ? normalizeWashFreeMinDays(normalized.washFreeMinDays)
      : '',
    washNotice: (normalized.washNotice || '').trim(),
    washNoticePhotos,
    washProducts,
    washValueAddedServices,
    homeFeeding: {
      ...homeFeeding,
      noticePhotos: homeNoticePhotos
    },
    serviceLines,
    serviceOptions,
    hasWashLine,
    hasHomeFeedingLine,
    hasBoardingLine,
    hasBoardingExtraWash: hasWashLine || normalized.washService === 'yes',
    valueAddedServices,
    hasValueAddedServices: valueAddedServices.length > 0,
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
  const listHasCloud = (list) => (list || []).some((url) => isCloudFileId(url));
  const washProductPhotos = (view.washProducts || []).map((item) => item && item.photo).filter(Boolean);
  const washVasPhotos = (view.washValueAddedServices || []).map((item) => item && item.photo).filter(Boolean);
  const homeNoticePhotos = (view.homeFeeding && view.homeFeeding.noticePhotos) || [];
  const photosOk = !listHasCloud(view.storePhotos)
    && !listHasCloud(view.introPhotos)
    && !listHasCloud(view.noticePhotos)
    && !listHasCloud(view.washNoticePhotos)
    && !listHasCloud(washProductPhotos)
    && !listHasCloud(washVasPhotos)
    && !listHasCloud(homeNoticePhotos);
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
