const { normalizeReceptionRange, formatReceptionRangeText } = require('./receptionRange');
const { isCloudFileId } = require('./storePhotos');

const MERGE_TEXT_FIELDS = [
  'name',
  'intro',
  'notice',
  'pickupNotice',
  'address',
  'locationName',
  'addressRegion',
  'contactPhone',
  'legalName',
  'hours',
  'logo',
  'boardingContractClauseText'
];

function hasOwn(shop, key) {
  return shop && Object.prototype.hasOwnProperty.call(shop, key);
}

function hasReceptionRange(shop) {
  return normalizeReceptionRange(shop && (shop.receptionRange || shop.range)).length > 0;
}

function hasStorePhotos(shop) {
  return Array.isArray(shop && shop.storePhotos) && shop.storePhotos.length > 0;
}

function hasBillingRules(shop) {
  return !!(shop && shop.billingRules && Object.keys(shop.billingRules).length);
}

function hasBusinessHours(shop) {
  const hours = shop && shop.businessHours;
  return !!(hours && (hours.openTime || hours.closeTime || (Array.isArray(hours.weekdays) && hours.weekdays.length)));
}

/**
 * 服务端与本地店铺数据合并：服务端优先，但避免用空数据覆盖有效本地缓存。
 */
function mergeMerchantShop(local, remote) {
  if (!remote || !remote.store_id) return local || remote || {};
  if (!local || !local.store_id || local.store_id !== remote.store_id) {
    return { ...remote };
  }

  const merged = {
    ...local,
    ...remote,
    store_id: remote.store_id
  };

  MERGE_TEXT_FIELDS.forEach((key) => {
    const remoteVal = (remote[key] || '').trim();
    const localVal = (local[key] || '').trim();
    if (!remoteVal && localVal) merged[key] = local[key];
  });

  if (!hasReceptionRange(remote) && hasReceptionRange(local)) {
    merged.receptionRange = local.receptionRange || local.range;
    merged.range = local.range || formatReceptionRangeText(local.receptionRange);
  } else {
    merged.receptionRange = normalizeReceptionRange(remote.receptionRange || remote.range);
    merged.range = formatReceptionRangeText(merged.receptionRange);
  }

  if (!hasStorePhotos(remote) && hasStorePhotos(local)) {
    merged.storePhotos = local.storePhotos;
  } else if (Array.isArray(remote.storePhotos) && Array.isArray(local.storePhotos)) {
    merged.storePhotos = remote.storePhotos.map((url, index) => {
      if (isCloudFileId(local.storePhotos[index]) && !isCloudFileId(url)) {
        return local.storePhotos[index];
      }
      return url;
    });
  }

  if (isCloudFileId(local.logo) && remote.logo && !isCloudFileId(remote.logo)) {
    merged.logo = local.logo;
  }

  if (!hasBillingRules(remote) && hasBillingRules(local)) {
    merged.billingRules = local.billingRules;
  }

  if (!hasBusinessHours(remote) && hasBusinessHours(local)) {
    merged.businessHours = local.businessHours;
    if ((local.hours || '').trim()) merged.hours = local.hours;
  }

  if (remote.pickupService == null && local.pickupService != null) {
    merged.pickupService = local.pickupService;
  }

  if (remote.deposit == null && local.deposit != null) {
    merged.deposit = local.deposit;
  }

  if (remote.compensationLimit == null && local.compensationLimit != null) {
    merged.compensationLimit = local.compensationLimit;
  }

  return merged;
}

module.exports = {
  mergeMerchantShop,
  hasOwn
};
