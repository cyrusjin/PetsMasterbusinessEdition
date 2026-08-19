const { normalizeReceptionRange, formatReceptionRangeText } = require('./receptionRange');
const { isCloudFileId } = require('./storePhotos');
const { compactWashProducts } = require('./washProducts');
const {
  hasHomeVisitPricingDraft,
  isHomeVisitPricingComplete
} = require('./homeVisitPricing');
const {
  normalizeServiceLines,
  hasEnabledServiceLine,
  DEFAULT_SERVICE_LINES
} = require('./serviceLines');

const MERGE_TEXT_FIELDS = [
  'name',
  'intro',
  'notice',
  'pickupNotice',
  'washNotice',
  'address',
  'locationName',
  'addressRegion',
  'contactPhone',
  'wechatId',
  'legalName',
  'hours',
  'logo',
  'boardingContractClauseText'
];

const MERGE_PHOTO_LIST_FIELDS = [
  'storePhotos',
  'introPhotos',
  'noticePhotos',
  'washNoticePhotos'
];

function hasOwn(shop, key) {
  return shop && Object.prototype.hasOwnProperty.call(shop, key);
}

function isBlankShopText(value) {
  const text = String(value == null ? '' : value).trim();
  return !text || text === '——' || text === '-';
}

function getCoopPartyA(shop) {
  const snapshot = shop && shop.coopContractSnapshot;
  const partyA = snapshot && snapshot.partyA;
  return partyA && typeof partyA === 'object' ? partyA : null;
}

/**
 * 入驻协议快照里有店名/地址/负责人，但顶层字段被后续保存冲空时，回填到表单。
 */
function hydrateShopProfileFromCoop(shop) {
  if (!shop || typeof shop !== 'object') return shop || {};
  const partyA = getCoopPartyA(shop);
  const next = { ...shop };
  if (partyA) {
    if (isBlankShopText(next.name) && !isBlankShopText(partyA.shopName)) {
      next.name = String(partyA.shopName).trim();
    }
    if (isBlankShopText(next.address) && !isBlankShopText(partyA.address)) {
      next.address = String(partyA.address).trim();
    }
    if (isBlankShopText(next.legalName) && !isBlankShopText(partyA.name)) {
      next.legalName = String(partyA.name).trim();
    }
    if (isBlankShopText(next.contactPhone) && !isBlankShopText(partyA.phone)) {
      next.contactPhone = String(partyA.phone).trim();
    }
  }
  if (!next.coopContractSigned && shop.coopContractSnapshot) {
    next.coopContractSigned = true;
  }
  return next;
}

function hasReceptionRange(shop) {
  return normalizeReceptionRange(shop && (shop.receptionRange || shop.range)).length > 0;
}

function hasPhotoList(shop, key) {
  return Array.isArray(shop && shop[key]) && shop[key].length > 0;
}

function mergePhotoListField(merged, local, remote, key) {
  if (!hasPhotoList(remote, key) && hasPhotoList(local, key)) {
    merged[key] = local[key];
    return;
  }
  if (Array.isArray(remote[key]) && Array.isArray(local[key])) {
    merged[key] = remote[key].map((url, index) => {
      if (isCloudFileId(local[key][index]) && !isCloudFileId(url)) {
        return local[key][index];
      }
      return url;
    });
  }
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
  if (!remote || !remote.store_id) return hydrateShopProfileFromCoop(local || remote || {});
  if (!local || !local.store_id || local.store_id !== remote.store_id) {
    return hydrateShopProfileFromCoop({ ...remote });
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

  MERGE_PHOTO_LIST_FIELDS.forEach((key) => {
    mergePhotoListField(merged, local, remote, key);
  });

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

  if (remote.washService == null && local.washService != null) {
    merged.washService = local.washService;
  }

  if ((!Array.isArray(remote.washProducts) || !remote.washProducts.length)
    && Array.isArray(local.washProducts) && local.washProducts.length) {
    merged.washProducts = local.washProducts;
  }
  if ((!Array.isArray(remote.washValueAddedServices) || !remote.washValueAddedServices.length)
    && Array.isArray(local.washValueAddedServices) && local.washValueAddedServices.length) {
    merged.washValueAddedServices = local.washValueAddedServices;
  }

  const remoteHome = remote.homeFeeding && typeof remote.homeFeeding === 'object'
    ? remote.homeFeeding
    : null;
  const localHome = local.homeFeeding && typeof local.homeFeeding === 'object'
    ? local.homeFeeding
    : null;
  if ((!remoteHome || !Object.keys(remoteHome).length) && localHome && Object.keys(localHome).length) {
    merged.homeFeeding = localHome;
  } else if (remoteHome && localHome) {
    merged.homeFeeding = { ...localHome, ...remoteHome };
    if ((!remoteHome.billingRules || !Object.keys(remoteHome.billingRules).length)
      && localHome.billingRules && Object.keys(localHome.billingRules).length) {
      merged.homeFeeding.billingRules = localHome.billingRules;
    }
    const remoteCat = remoteHome.catPricing && typeof remoteHome.catPricing === 'object'
      ? remoteHome.catPricing
      : null;
    const localCat = localHome.catPricing && typeof localHome.catPricing === 'object'
      ? localHome.catPricing
      : null;
    if ((!remoteCat || !Object.keys(remoteCat).length) && localCat && Object.keys(localCat).length) {
      merged.homeFeeding.catPricing = localCat;
    }
    const remoteDog = remoteHome.dogPricing && typeof remoteHome.dogPricing === 'object'
      ? remoteHome.dogPricing
      : null;
    const localDog = localHome.dogPricing && typeof localHome.dogPricing === 'object'
      ? localHome.dogPricing
      : null;
    if ((!remoteDog || !Object.keys(remoteDog).length) && localDog && Object.keys(localDog).length) {
      merged.homeFeeding.dogPricing = localDog;
    }
    const remoteItems = Array.isArray(remoteHome.serviceItems) ? remoteHome.serviceItems : [];
    const localItems = Array.isArray(localHome.serviceItems) ? localHome.serviceItems : [];
    if (!remoteItems.length && localItems.length) {
      merged.homeFeeding.serviceItems = localItems;
    }
  }

  if (!remote.serviceLines && local.serviceLines) {
    merged.serviceLines = local.serviceLines;
  } else if (remote.serviceLines && local.serviceLines && typeof remote.serviceLines === 'object') {
    const remoteLines = remote.serviceLines;
    const localLines = local.serviceLines;
    merged.serviceLines = {
      boarding: remoteLines.boarding != null ? remoteLines.boarding : localLines.boarding,
      wash: remoteLines.wash != null ? remoteLines.wash : localLines.wash,
      homeFeeding: remoteLines.homeFeeding != null ? remoteLines.homeFeeding : localLines.homeFeeding
    };
  }

  // billingRules 整包覆盖时，保留本地已有的增值服务列表
  if (merged.billingRules || local.billingRules || remote.billingRules) {
    const localRules = local.billingRules || {};
    const remoteRules = remote.billingRules || {};
    const mergedRules = merged.billingRules || { ...localRules, ...remoteRules };
    const localVas = Array.isArray(localRules.valueAddedServices) ? localRules.valueAddedServices : [];
    const remoteVas = Array.isArray(remoteRules.valueAddedServices) ? remoteRules.valueAddedServices : [];
    const topVas = Array.isArray(merged.valueAddedServices) ? merged.valueAddedServices : [];
    if ((!remoteVas.length && (localVas.length || topVas.length))) {
      merged.billingRules = {
        ...mergedRules,
        valueAddedServices: topVas.length ? topVas : localVas
      };
    } else if (remoteVas.length && !topVas.length) {
      merged.valueAddedServices = remoteVas;
      merged.billingRules = mergedRules;
    } else if (topVas.length) {
      merged.billingRules = {
        ...mergedRules,
        valueAddedServices: topVas
      };
    }
  }

  if ((remote.pickupFreeMinDays == null || remote.pickupFreeMinDays === '')
    && local.pickupFreeMinDays != null && local.pickupFreeMinDays !== '') {
    merged.pickupFreeMinDays = local.pickupFreeMinDays;
  }

  if ((remote.pickupFreeMaxKm == null || remote.pickupFreeMaxKm === '')
    && local.pickupFreeMaxKm != null && local.pickupFreeMaxKm !== '') {
    merged.pickupFreeMaxKm = local.pickupFreeMaxKm;
  }

  const remoteTiers = Array.isArray(remote.pickupFreeTiers) ? remote.pickupFreeTiers : [];
  const localTiers = Array.isArray(local.pickupFreeTiers) ? local.pickupFreeTiers : [];
  if (!remoteTiers.length && localTiers.length) {
    merged.pickupFreeTiers = localTiers;
  }

  if ((remote.washFreeMinDays == null || remote.washFreeMinDays === '')
    && local.washFreeMinDays != null && local.washFreeMinDays !== '') {
    merged.washFreeMinDays = local.washFreeMinDays;
  }

  if (remote.deposit == null && local.deposit != null) {
    merged.deposit = local.deposit;
  }

  if (remote.compensationLimit == null && local.compensationLimit != null) {
    merged.compensationLimit = local.compensationLimit;
  }

  return hydrateShopProfileFromCoop(merged);
}

function hasVisitPricing(homeFeeding) {
  return !!(homeFeeding && (
    isHomeVisitPricingComplete(homeFeeding) || hasHomeVisitPricingDraft(homeFeeding)
  ));
}

/**
 * 保存到云端前：避免用空的新业务字段覆盖线上已有洗护商品 / 上门价 / 服务开关。
 * 旧店没有这些字段时保持现状，首次保存会写入默认 serviceLines（开通到店寄养）。
 */
function preserveOutgoingShopFields(outgoing, cached) {
  const next = hydrateShopProfileFromCoop(
    outgoing && typeof outgoing === 'object' ? { ...outgoing } : {}
  );
  const remote = hydrateShopProfileFromCoop(
    cached && typeof cached === 'object' ? cached : {}
  );

  MERGE_TEXT_FIELDS.forEach((key) => {
    if (isBlankShopText(next[key]) && !isBlankShopText(remote[key])) {
      next[key] = remote[key];
    }
  });
  if ((next.latitude == null || next.latitude === '') && remote.latitude != null && remote.latitude !== '') {
    next.latitude = remote.latitude;
  }
  if ((next.longitude == null || next.longitude === '') && remote.longitude != null && remote.longitude !== '') {
    next.longitude = remote.longitude;
  }
  if (!next.coopContractSigned && remote.coopContractSigned) {
    next.coopContractSigned = true;
    if (!next.coopContractSnapshot && remote.coopContractSnapshot) {
      next.coopContractSnapshot = remote.coopContractSnapshot;
      next.coopContractSignTime = remote.coopContractSignTime || next.coopContractSignTime;
    }
  }

  const localWash = compactWashProducts(next.washProducts);
  const remoteWash = compactWashProducts(remote.washProducts);
  if (!localWash.length && remoteWash.length) {
    next.washProducts = remote.washProducts;
  }
  const localWashVas = compactWashProducts(next.washValueAddedServices);
  const remoteWashVas = compactWashProducts(remote.washValueAddedServices);
  if (!localWashVas.length && remoteWashVas.length) {
    next.washValueAddedServices = remote.washValueAddedServices;
  }

  const localHome = next.homeFeeding && typeof next.homeFeeding === 'object'
    ? next.homeFeeding
    : null;
  const remoteHome = remote.homeFeeding && typeof remote.homeFeeding === 'object'
    ? remote.homeFeeding
    : null;
  if (!hasVisitPricing(localHome) && hasVisitPricing(remoteHome)) {
    next.homeFeeding = {
      ...(localHome || {}),
      ...remoteHome,
      catPricing: remoteHome.catPricing,
      dogPricing: remoteHome.dogPricing,
      serviceItems: remoteHome.serviceItems
    };
  } else if (localHome && remoteHome) {
    const localCat = localHome.catPricing;
    const remoteCat = remoteHome.catPricing;
    const localDog = localHome.dogPricing;
    const remoteDog = remoteHome.dogPricing;
    const localItems = Array.isArray(localHome.serviceItems) ? localHome.serviceItems : [];
    const remoteItems = Array.isArray(remoteHome.serviceItems) ? remoteHome.serviceItems : [];
    if ((!localCat || !Object.keys(localCat).length) && remoteCat && Object.keys(remoteCat).length) {
      next.homeFeeding = { ...localHome, catPricing: remoteCat };
    }
    if ((!localDog || !Object.keys(localDog).length) && remoteDog && Object.keys(remoteDog).length) {
      next.homeFeeding = { ...(next.homeFeeding || localHome), dogPricing: remoteDog };
    }
    if (!localItems.length && remoteItems.length) {
      next.homeFeeding = { ...(next.homeFeeding || localHome), serviceItems: remoteItems };
    }
  }

  const localLines = normalizeServiceLines(next.serviceLines);
  if (!hasEnabledServiceLine(localLines)) {
    if (!remote.serviceLines) {
      next.serviceLines = { ...DEFAULT_SERVICE_LINES };
    } else if (hasEnabledServiceLine(remote.serviceLines)) {
      next.serviceLines = normalizeServiceLines(remote.serviceLines);
    } else {
      next.serviceLines = localLines;
    }
  } else {
    next.serviceLines = localLines;
  }

  return next;
}

module.exports = {
  mergeMerchantShop,
  preserveOutgoingShopFields,
  hydrateShopProfileFromCoop,
  hasOwn
};
