const { normalizeBusinessHours } = require('./businessHours');
const { normalizeReceptionRange } = require('./receptionRange');
const {
  normalizeStorePhotos,
  normalizeIntroPhotos,
  normalizeNoticePhotos,
  MAX_INTRO_TEXT,
  MAX_NOTICE_TEXT,
  MAX_PICKUP_NOTICE_TEXT
} = require('./storePhotos');
const { normalizeDepartureCharge } = require('./billing');
const { isVagueAddress } = require('./location');
const { validateWeightPricing } = require('./weightPricing');
const { validateRoomPricing } = require('./roomPricing');
const { validatePickupPricing } = require('./pickupPricing');
const { validateWashService } = require('./washPricing');
const { validateMultiPetDiscount } = require('./multiPetPricing');
const { validateLongTermDiscount } = require('./longTermDiscount');
const { validateValueAddedServices } = require('./valueAddedServices');

const DEFAULT_LOGO = '/images/default-avatar.png';

function normalizeDeposit(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function hasValidLogo(logo) {
  if (!logo || typeof logo !== 'string') return false;
  const text = logo.trim();
  if (!text || text === DEFAULT_LOGO) return false;
  return true;
}

function validateBillingRules(billingRules) {
  const rules = billingRules || {};
  const mode = rules.billingMode;

  if (mode !== 'weight' && mode !== 'room') {
    return '请选择收费模式';
  }

  if (mode === 'weight') {
    return validateWeightPricing(rules.weightPricing);
  }

  if (mode === 'room') {
    return validateRoomPricing(rules.roomPricing);
  }

  return '';
}

function validateStoreForm(payload) {
  const shop = payload.shop || {};
  const businessHours = normalizeBusinessHours(payload.businessHours || shop.businessHours, shop.hours);
  const receptionRange = normalizeReceptionRange(payload.receptionRange || shop.receptionRange || shop.range);
  const storePhotos = normalizeStorePhotos(payload.storePhotos || shop.storePhotos);
  const introPhotos = normalizeIntroPhotos(payload.introPhotos || shop.introPhotos);
  const noticePhotos = normalizeNoticePhotos(payload.noticePhotos || shop.noticePhotos);
  const billingRules = {
    ...payload.billingRules,
    departureCharge: normalizeDepartureCharge(
      (payload.billingRules && payload.billingRules.departureCharge) || payload.departureCharge
    ),
    checkInDayCharge: (payload.billingRules && payload.billingRules.checkInDayCharge) || payload.checkInDayCharge,
    departureDayCharge: (payload.billingRules && payload.billingRules.departureDayCharge) || payload.departureDayCharge
  };

  if (!hasValidLogo(shop.logo)) return '请上传店铺头像';
  if (!(shop.name || '').trim()) return '请填写店铺名称';
  const wechatId = (shop.wechatId || '').trim();
  if (wechatId.length > 30) return '微信号不超过30个字符';
  if (!(shop.address || '').trim()) return '请选择营业地址';
  const lat = parseFloat(shop.latitude);
  const lng = parseFloat(shop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '请通过地图选择营业地址';

  if (isVagueAddress((shop.address || '').trim())) {
    return '营业地址不够详细，请重新在地图中选择具体位置';
  }

  if (!businessHours.weekdays || !businessHours.weekdays.length) return '请选择营业时间（周几）';
  if (!businessHours.openTime || !businessHours.closeTime) return '请设置营业起止时间';

  const intro = (shop.intro || '').trim();
  if (intro.length > MAX_INTRO_TEXT) return `店铺介绍不超过${MAX_INTRO_TEXT}字`;
  if (!intro && !introPhotos.length) return '请填写店铺介绍或上传介绍图片';
  if (!receptionRange.length) return '请选择接待范围';
  if (!storePhotos.length) return '请至少上传1张店铺照片';

  const billingError = validateBillingRules(billingRules);
  if (billingError) return billingError;
  const multiPetError = validateMultiPetDiscount(billingRules.multiPetDiscount);
  if (multiPetError) return multiPetError;
  const longTermError = validateLongTermDiscount(billingRules.longTermDiscount);
  if (longTermError) return longTermError;

  const pickupService = shop.pickupService === 'yes' ? 'yes' : 'no';
  if (!pickupService) return '请选择接送设置';
  if (pickupService === 'yes') {
    const pickupNotice = (shop.pickupNotice || '').trim();
    if (!pickupNotice) return '请填写接送须知';
    if (pickupNotice.length > MAX_PICKUP_NOTICE_TEXT) {
      return `接送须知不超过${MAX_PICKUP_NOTICE_TEXT}字`;
    }
    const pickupPricingError = validatePickupPricing(shop);
    if (pickupPricingError) return pickupPricingError;
  }

  const washService = shop.washService === 'yes' ? 'yes' : 'no';
  if (washService === 'yes') {
    const washError = validateWashService(shop);
    if (washError) return washError;
    const washNotice = (shop.washNotice || '').trim();
    const washNoticePhotos = normalizeNoticePhotos(
      payload.washNoticePhotos || shop.washNoticePhotos
    );
    if (washNotice.length > MAX_NOTICE_TEXT) return `洗护须知不超过${MAX_NOTICE_TEXT}字`;
    if (!washNotice && !washNoticePhotos.length) return '请填写洗护须知或上传须知图片';
  }

  const valueAddedError = validateValueAddedServices(
    payload.valueAddedServices != null
      ? payload.valueAddedServices
      : shop.valueAddedServices
  );
  if (valueAddedError) return valueAddedError;

  const notice = (shop.notice || '').trim();
  if (notice.length > MAX_NOTICE_TEXT) return `寄养须知不超过${MAX_NOTICE_TEXT}字`;
  if (!notice && !noticePhotos.length) return '请填写寄养须知或上传须知图片';

  return '';
}

module.exports = {
  DEFAULT_LOGO,
  normalizeDeposit,
  hasValidLogo,
  validateStoreForm,
  validateBillingRules,
  MAX_INTRO_TEXT,
  MAX_NOTICE_TEXT,
  MAX_PICKUP_NOTICE_TEXT
};
