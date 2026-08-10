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
const { validateCustomPricing } = require('./customPricing');
const { validatePickupPricing } = require('./pickupPricing');
const { validateWashService } = require('./washPricing');
const { validateMultiPetDiscount } = require('./multiPetPricing');
const { validateLongTermDiscount } = require('./longTermDiscount');
const { validateValueAddedServices } = require('./valueAddedServices');
const { validateMobilePhone } = require('./phone');

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

function receptionAllowsCustomBilling(_receptionRange) {
  return true;
}

function validateBillingRules(billingRules) {
  const rules = billingRules || {};
  const mode = rules.billingMode;

  if (mode !== 'weight' && mode !== 'room' && mode !== 'custom') {
    return '请选择收费模式';
  }

  if (mode === 'weight') {
    return validateWeightPricing(rules.weightPricing);
  }

  if (mode === 'room') {
    return validateRoomPricing(rules.roomPricing);
  }

  if (mode === 'custom') {
    return validateCustomPricing(rules.customPricing);
  }

  return '';
}

function buildBillingRulesFromPayload(payload, shop) {
  return {
    ...payload.billingRules,
    departureCharge: normalizeDepartureCharge(
      (payload.billingRules && payload.billingRules.departureCharge) || payload.departureCharge
    ),
    checkInDayCharge: (payload.billingRules && payload.billingRules.checkInDayCharge) || payload.checkInDayCharge,
    departureDayCharge: (payload.billingRules && payload.billingRules.departureDayCharge) || payload.departureDayCharge,
    billingMode: (payload.billingRules && payload.billingRules.billingMode)
      || payload.billingMode
      || (shop && shop.billingRules && shop.billingRules.billingMode)
  };
}

/** 开店必填的基础设置 */
function validateBasicStoreForm(payload) {
  const shop = payload.shop || {};
  const receptionRange = normalizeReceptionRange(payload.receptionRange || shop.receptionRange || shop.range);
  const storePhotos = normalizeStorePhotos(payload.storePhotos || shop.storePhotos);
  const introPhotos = normalizeIntroPhotos(payload.introPhotos || shop.introPhotos);
  const billingRules = buildBillingRulesFromPayload(payload, shop);

  if (!hasValidLogo(shop.logo)) return '请上传店铺头像';
  if (!(shop.name || '').trim()) return '请填写店铺名称';
  if (!(shop.address || '').trim()) return '请选择营业地址';
  const lat = parseFloat(shop.latitude);
  const lng = parseFloat(shop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '请通过地图选择营业地址';
  if (isVagueAddress((shop.address || '').trim())) {
    return '营业地址不够详细，请重新在地图中选择具体位置';
  }

  const intro = (shop.intro || '').trim();
  if (intro.length > MAX_INTRO_TEXT) return `店铺介绍不超过${MAX_INTRO_TEXT}字`;
  if (!intro && !introPhotos.length) return '请填写店铺介绍或上传介绍图片';
  if (!receptionRange.length) return '请选择接待范围';
  if (!storePhotos.length) return '请至少上传1张店铺照片';

  const billingError = validateBillingRules(billingRules);
  if (billingError) return billingError;

  const contactPhone = (shop.contactPhone || '').trim();
  const phoneError = validateMobilePhone(contactPhone, {
    emptyMsg: '请填写联系电话',
    invalidMsg: '联系电话需为标准的11位手机号'
  });
  if (phoneError) return phoneError;

  if (!(shop.legalName || '').trim()) return '请填写负责人姓名';

  // 老店可能只有签署标记/时间，无 snapshot；有签署记录即可保存
  if (!shop.coopContractSigned && !(shop.coopContractSignTime || '').trim()) {
    return '请先签署入驻合作协议';
  }

  const notice = (shop.notice || '').trim();
  if (notice.length > MAX_NOTICE_TEXT) return `寄养须知不超过${MAX_NOTICE_TEXT}字`;

  return '';
}

/** 高级设置：只校验已开启/已填写的项 */
function validateAdvancedStoreForm(payload) {
  const shop = payload.shop || {};
  const businessHours = normalizeBusinessHours(payload.businessHours || shop.businessHours, shop.hours);
  const billingRules = buildBillingRulesFromPayload(payload, shop);

  const wechatId = (shop.wechatId || '').trim();
  if (wechatId.length > 30) return '微信号不超过30个字符';

  if (!businessHours.weekdays || !businessHours.weekdays.length) return '请选择营业时间（周几）';
  if (!businessHours.openTime || !businessHours.closeTime) return '请设置营业起止时间';

  const multiPetError = validateMultiPetDiscount(billingRules.multiPetDiscount);
  if (multiPetError) return multiPetError;
  const longTermError = validateLongTermDiscount(billingRules.longTermDiscount);
  if (longTermError) return longTermError;

  const pickupService = shop.pickupService === 'yes' ? 'yes' : 'no';
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

  const valueAdded = payload.valueAddedServices != null
    ? payload.valueAddedServices
    : shop.valueAddedServices;
  if (Array.isArray(valueAdded) && valueAdded.length) {
    const valueAddedError = validateValueAddedServices(valueAdded);
    if (valueAddedError) return valueAddedError;
  }

  return '';
}

function validateStoreForm(payload) {
  const basicError = validateBasicStoreForm(payload);
  if (basicError) return basicError;
  return validateAdvancedStoreForm(payload);
}

function isBasicStoreComplete(shop, billingRules) {
  if (!shop) return false;
  return !validateBasicStoreForm({
    shop,
    billingRules: billingRules || shop.billingRules || {},
    receptionRange: shop.receptionRange || shop.range,
    storePhotos: shop.storePhotos,
    introPhotos: shop.introPhotos
  });
}

module.exports = {
  DEFAULT_LOGO,
  normalizeDeposit,
  hasValidLogo,
  validateStoreForm,
  validateBasicStoreForm,
  validateAdvancedStoreForm,
  validateBillingRules,
  receptionAllowsCustomBilling,
  isBasicStoreComplete,
  MAX_INTRO_TEXT,
  MAX_NOTICE_TEXT,
  MAX_PICKUP_NOTICE_TEXT
};
