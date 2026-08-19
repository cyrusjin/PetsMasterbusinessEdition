const { normalizeNoticePhotos } = require('./storePhotos');
const { normalizePickupPricing } = require('./pickupPricing');
const {
  normalizeWashPricing,
  normalizeWashFields,
  getDefaultWashPricing
} = require('./washPricing');
const { normalizeValueAddedServices } = require('./valueAddedServices');
const {
  resolveHomeVisitPricing,
  validateHomeVisitPricing
} = require('./homeVisitPricing');
const { compactVisitServices } = require('./homeVisitServices');
const { normalizeMultiPetDiscount, validateMultiPetDiscount } = require('./multiPetPricing');
const { normalizeHolidayPricing, getDefaultHolidayPricing } = require('./legalHolidays');

function withPetOffers(pricing, rawPricing, legacyRules) {
  const raw = rawPricing && typeof rawPricing === 'object' ? rawPricing : {};
  const legacy = legacyRules && typeof legacyRules === 'object' ? legacyRules : {};
  return {
    ...(pricing || {}),
    multiPetDiscount: normalizeMultiPetDiscount(
      raw.multiPetDiscount != null ? raw.multiPetDiscount : (legacy.multiPetDiscount || {})
    ),
    holidayPricing: normalizeHolidayPricing(
      raw.holidayPricing != null ? raw.holidayPricing : (legacy.holidayPricing || getDefaultHolidayPricing())
    )
  };
}

function pickHomeOffers(src, resolved) {
  const raw = src && typeof src === 'object' ? src : {};
  const dog = (raw.dogPricing && typeof raw.dogPricing === 'object') ? raw.dogPricing : {};
  const cat = (raw.catPricing && typeof raw.catPricing === 'object') ? raw.catPricing : {};
  const legacy = raw.billingRules && typeof raw.billingRules === 'object' ? raw.billingRules : {};
  return {
    multiPetDiscount: normalizeMultiPetDiscount(
      raw.multiPetDiscount != null
        ? raw.multiPetDiscount
        : (dog.multiPetDiscount != null ? dog.multiPetDiscount : (cat.multiPetDiscount || legacy.multiPetDiscount || {}))
    ),
    holidayPricing: normalizeHolidayPricing(
      raw.holidayPricing != null
        ? raw.holidayPricing
        : (dog.holidayPricing != null ? dog.holidayPricing : (cat.holidayPricing || legacy.holidayPricing || getDefaultHolidayPricing()))
    )
  };
}

function emptyHomeFeeding() {
  return {
    billingRules: {},
    notice: '',
    noticePhotos: [],
    pickupService: 'no',
    pickupPricingMode: 'flat',
    pickupFlatPrice: '',
    pickupPricePerKm: '',
    pickupNotice: '',
    pickupFreeTiers: [],
    pickupFreeMinDays: '',
    pickupFreeMaxKm: '',
    washService: 'no',
    washPricing: [],
    washFreeMinDays: '',
    washNotice: '',
    washNoticePhotos: [],
    valueAddedServices: [],
    serviceItems: [],
    includedKm: 0,
    surchargeEnabled: false,
    surchargeTiers: [],
    deposit: 0,
    contractClauseText: '',
    catPricing: { durationMin: 0, description: '', packages: [], distanceTiers: [] },
    dogPricing: { includedKm: 0, packages: [], surchargeEnabled: false, surchargeTiers: [] }
  };
}

function normalizeHomeFeeding(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const { visitServices, ...rest } = src;
  const resolved = resolveHomeVisitPricing(src);
  const offers = pickHomeOffers(src, resolved);
  const washFields = normalizeWashFields({
    washService: src.washService,
    washPricing: src.washPricing,
    washFreeMinDays: src.washFreeMinDays,
    washNotice: src.washNotice
  });
  return {
    ...emptyHomeFeeding(),
    ...rest,
    billingRules: src.billingRules && typeof src.billingRules === 'object' ? src.billingRules : {},
    notice: (src.notice || '').trim(),
    noticePhotos: normalizeNoticePhotos(src.noticePhotos),
    ...normalizePickupPricing(src),
    pickupNotice: (src.pickupNotice || '').trim(),
    washService: washFields.washService,
    washPricing: washFields.washService === 'yes'
      ? normalizeWashPricing(src.washPricing || getDefaultWashPricing())
      : (Array.isArray(src.washPricing) ? normalizeWashPricing(src.washPricing) : []),
    washFreeMinDays: washFields.washFreeMinDays,
    washNotice: washFields.washNotice,
    washNoticePhotos: normalizeNoticePhotos(src.washNoticePhotos),
    valueAddedServices: normalizeValueAddedServices(src.valueAddedServices),
    serviceItems: resolved.serviceItems || [],
    includedKm: resolved.includedKm,
    surchargeEnabled: !!resolved.surchargeEnabled,
    surchargeTiers: resolved.surchargeTiers || [],
    multiPetDiscount: offers.multiPetDiscount,
    holidayPricing: offers.holidayPricing,
    deposit: 0,
    contractClauseText: (src.contractClauseText || '').trim(),
    catPricing: withPetOffers(
      { ...(resolved.catPricing || {}), holidayPricing: offers.holidayPricing, multiPetDiscount: offers.multiPetDiscount },
      src.catPricing,
      src.billingRules
    ),
    dogPricing: withPetOffers(
      { ...(resolved.dogPricing || {}), holidayPricing: offers.holidayPricing, multiPetDiscount: offers.multiPetDiscount },
      src.dogPricing,
      src.billingRules
    )
  };
}

function remapHomeFeedingError(message) {
  return String(message || '')
    .replace(/接送单程一口价/g, '上门交通费一口价')
    .replace(/接送每公里价格/g, '上门每公里价格')
    .replace(/接送须知/g, '上门须知')
    .replace(/洗护须知/g, '上门洗护须知')
    .replace(/到店寄养须知/g, '上门喂养须知');
}

function validateHomeFeedingBasic(homeFeeding) {
  return validateHomeVisitPricing(homeFeeding, { required: true });
}

function validateHomeFeedingAdvanced(homeFeeding) {
  const hf = normalizeHomeFeeding(homeFeeding);
  const mpErr = validateMultiPetDiscount(hf.multiPetDiscount);
  if (mpErr) return mpErr;
  return '';
}

function compactHomeFeedingServices(homeFeeding) {
  const hf = normalizeHomeFeeding(homeFeeding);
  return compactVisitServices(hf.serviceItems);
}

module.exports = {
  emptyHomeFeeding,
  normalizeHomeFeeding,
  validateHomeFeedingBasic,
  validateHomeFeedingAdvanced,
  remapHomeFeedingError,
  compactHomeFeedingServices
};
