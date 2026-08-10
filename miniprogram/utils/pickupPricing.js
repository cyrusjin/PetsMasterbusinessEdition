const PICKUP_PRICING_MODE = {
  FLAT: 'flat',
  DISTANCE: 'distance'
};

const DEFAULT_PICKUP_FREE_MAX_KM = 200;
const DEFAULT_PICKUP_FREE_MIN_DAYS = 7;

function parsePositiveMoney(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return NaN;
  return Math.round(num * 100) / 100;
}

function parsePickupFreeMinDays(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
}

function parsePickupFreeMaxKm(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 10) / 10;
}

const PICKUP_FREE_TRIP = {
  ONE_WAY: 'oneWay',
  ROUND_TRIP: 'roundTrip'
};

/** 兼容旧档位 includeOutbound/includeReturn；新字段 tripType，默认往返 */
function normalizeTripType(item) {
  if (item && item.tripType === PICKUP_FREE_TRIP.ROUND_TRIP) return PICKUP_FREE_TRIP.ROUND_TRIP;
  if (item && item.tripType === PICKUP_FREE_TRIP.ONE_WAY) return PICKUP_FREE_TRIP.ONE_WAY;
  if (item && (Object.prototype.hasOwnProperty.call(item, 'includeOutbound')
    || Object.prototype.hasOwnProperty.call(item, 'includeReturn'))) {
    const out = item.includeOutbound !== false;
    const ret = item.includeReturn !== false;
    return out && ret ? PICKUP_FREE_TRIP.ROUND_TRIP : PICKUP_FREE_TRIP.ONE_WAY;
  }
  return PICKUP_FREE_TRIP.ROUND_TRIP;
}

function formatTierCoverageText(tier) {
  return normalizeTripType(tier) === PICKUP_FREE_TRIP.ROUND_TRIP ? '往返' : '单程';
}

function formatTierCoverageDetail(tier) {
  return normalizeTripType(tier) === PICKUP_FREE_TRIP.ROUND_TRIP
    ? '往返（接+送）'
    : '单程（接或送由客人选）';
}

function createEmptyPickupFreeTier() {
  return {
    minDays: '',
    maxKm: '',
    tripType: PICKUP_FREE_TRIP.ROUND_TRIP
  };
}

function createDefaultPickupFreeTiersForEdit() {
  return [{
    minDays: String(DEFAULT_PICKUP_FREE_MIN_DAYS),
    maxKm: String(DEFAULT_PICKUP_FREE_MAX_KM),
    tripType: PICKUP_FREE_TRIP.ROUND_TRIP
  }];
}

function legacyPickupFreeToTiers(source) {
  const minDays = parsePickupFreeMinDays(source && source.pickupFreeMinDays);
  if (!minDays) return [];
  const maxKm = parsePickupFreeMaxKm(source && source.pickupFreeMaxKm) || DEFAULT_PICKUP_FREE_MAX_KM;
  // 旧单档原先整单免费，兼容为往返
  return [{
    minDays,
    maxKm,
    tripType: PICKUP_FREE_TRIP.ROUND_TRIP
  }];
}

function withTripTypeFields(tier) {
  const tripType = normalizeTripType(tier);
  return {
    minDays: tier.minDays,
    maxKm: tier.maxKm,
    tripType,
    // 兼容旧字段占位；是否免几程以 tripType 为准，接/送由客人选择
    includeOutbound: true,
    includeReturn: true
  };
}

/** 持久化/计价用：数字档位，按天数升序 */
function normalizePickupFreeTiers(list, source) {
  let raw = Array.isArray(list) ? list : null;
  if (!raw || !raw.length) {
    raw = legacyPickupFreeToTiers(source || {});
  }
  const mapped = raw.map((tier) => {
    const item = tier && typeof tier === 'object' ? tier : {};
    const minDays = parsePickupFreeMinDays(item.minDays);
    const maxKm = parsePickupFreeMaxKm(item.maxKm);
    if (!minDays || !maxKm) return null;
    return withTripTypeFields({
      minDays,
      maxKm,
      tripType: item.tripType,
      includeOutbound: item.includeOutbound,
      includeReturn: item.includeReturn
    });
  }).filter(Boolean);

  const byKey = {};
  mapped.forEach((tier) => {
    byKey[`${tier.minDays}_${tier.maxKm}_${tier.tripType}`] = tier;
  });
  return Object.keys(byKey)
    .map((k) => byKey[k])
    .sort((a, b) => {
      if (a.minDays !== b.minDays) return a.minDays - b.minDays;
      return a.maxKm - b.maxKm;
    });
}

/** 表单编辑用：保留输入字符串，兼容旧单档 */
function normalizePickupFreeTiersForEdit(shop) {
  const source = shop || {};
  let list = Array.isArray(source.pickupFreeTiers) ? source.pickupFreeTiers : null;
  if (!list || !list.length) {
    const legacy = legacyPickupFreeToTiers(source);
    if (legacy.length) {
      return legacy.map((t) => ({
        minDays: String(t.minDays),
        maxKm: String(t.maxKm),
        tripType: t.tripType || PICKUP_FREE_TRIP.ROUND_TRIP
      }));
    }
    return createDefaultPickupFreeTiersForEdit();
  }
  const edited = list.map((tier) => {
    const item = tier && typeof tier === 'object' ? tier : {};
    return {
      minDays: item.minDays != null && item.minDays !== '' ? String(item.minDays) : '',
      maxKm: item.maxKm != null && item.maxKm !== '' ? String(item.maxKm) : '',
      tripType: normalizeTripType(item)
    };
  });
  return edited.length ? edited : createDefaultPickupFreeTiersForEdit();
}

function addPickupFreeTier(tiers) {
  const list = Array.isArray(tiers) ? tiers.slice() : [];
  list.push(createEmptyPickupFreeTier());
  return list;
}

function removePickupFreeTier(tiers, index) {
  const list = Array.isArray(tiers) ? tiers.slice() : [];
  if (list.length <= 1) return list;
  if (index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  return list;
}

function updatePickupFreeTierField(tiers, index, field, value) {
  const list = Array.isArray(tiers) ? tiers.map((t) => ({ ...t })) : [];
  if (index < 0 || index >= list.length) return list;
  if (field !== 'minDays' && field !== 'maxKm') return list;
  let next = String(value == null ? '' : value);
  if (field === 'minDays') {
    next = next.replace(/[^\d]/g, '');
  } else {
    next = next.replace(/[^\d.]/g, '');
    const dot = next.indexOf('.');
    if (dot >= 0) {
      next = `${next.slice(0, dot + 1)}${next.slice(dot + 1).replace(/\./g, '').slice(0, 1)}`;
    }
  }
  list[index] = { ...list[index], [field]: next };
  return list;
}

function setPickupFreeTierTripType(tiers, index, tripType) {
  const list = Array.isArray(tiers) ? tiers.map((t) => ({ ...t })) : [];
  if (index < 0 || index >= list.length) return list;
  const nextType = tripType === PICKUP_FREE_TRIP.ROUND_TRIP
    ? PICKUP_FREE_TRIP.ROUND_TRIP
    : PICKUP_FREE_TRIP.ONE_WAY;
  list[index] = { ...list[index], tripType: nextType };
  return list;
}

function validatePickupFreeTiers(tiers) {
  const list = Array.isArray(tiers) ? tiers : [];
  if (!list.length) return '请至少添加一档满天免费接送';
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] || {};
    if (!parsePickupFreeMinDays(item.minDays)) {
      return `第 ${i + 1} 档请填写有效天数（至少 1 天）`;
    }
    if (!parsePickupFreeMaxKm(item.maxKm)) {
      return `第 ${i + 1} 档请填写有效免费距离（大于 0 公里）`;
    }
    if (item.tripType && item.tripType !== PICKUP_FREE_TRIP.ONE_WAY
      && item.tripType !== PICKUP_FREE_TRIP.ROUND_TRIP) {
      return `第 ${i + 1} 档请选择单程或往返`;
    }
  }
  const normalized = normalizePickupFreeTiers(list);
  if (!normalized.length) return '请填写有效的满天免费接送档位';
  return '';
}

function getPickupFreeTiers(store) {
  return normalizePickupFreeTiers(store && store.pickupFreeTiers, store);
}

function hasPickupFreeOffer(store) {
  return getPickupFreeTiers(store).length > 0;
}

/** 寄养天数已达到任一免费档位（仍需校验距离） */
function meetsPickupFreeStayDays(store, stayDays) {
  const days = parseFloat(stayDays);
  if (!Number.isFinite(days) || days <= 0) return false;
  return getPickupFreeTiers(store).some((tier) => days >= tier.minDays);
}

/**
 * 命中档位：仅按寄养天数；超出免费公里仍命中，计费时减免免费区间。
 * 多档命中时优先天数更高，其次免费公里更大。
 */
function matchPickupFreeTier(store, stayDays) {
  const days = parseFloat(stayDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  const candidates = getPickupFreeTiers(store).filter((tier) => days >= tier.minDays);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (b.minDays !== a.minDays) return b.minDays - a.minDays;
    return b.maxKm - a.maxKm;
  });
  return candidates[0];
}

/** 计费公里 = max(0, 驾车公里 − 免费区间) */
function resolveBillableDistanceKm(distanceKm, freeMaxKm) {
  const km = normalizeDrivingDistanceKm(distanceKm);
  if (km == null) return null;
  const allowance = Math.max(0, parseFloat(freeMaxKm) || 0);
  const billable = Math.max(0, km - allowance);
  return Math.ceil(billable * 10) / 10;
}

/**
 * 解析享受免费公里减免的行程（接/送）。
 * 往返：所选接送都减免；单程：仅减免一程（优先接）。
 */
function resolveCoveredLegs(matched, flags) {
  const empty = {
    coveredOutbound: false,
    coveredReturn: false,
    uncoveredOutbound: false,
    uncoveredReturn: false,
    coveredLegCount: 0,
    uncoveredLegCount: 0
  };
  if (!matched) return empty;

  const wantOut = !flags || flags.pickupIncludeOutbound !== false;
  const wantRet = !flags || flags.pickupIncludeReturn !== false;
  const tripType = normalizeTripType(matched);
  let coveredOutbound = false;
  let coveredReturn = false;

  if (tripType === PICKUP_FREE_TRIP.ROUND_TRIP) {
    coveredOutbound = !!wantOut;
    coveredReturn = !!wantRet;
  } else if (wantOut && wantRet) {
    coveredOutbound = true;
    coveredReturn = false;
  } else {
    coveredOutbound = !!wantOut;
    coveredReturn = !!wantRet;
  }

  const uncoveredOutbound = !!(wantOut && !coveredOutbound);
  const uncoveredReturn = !!(wantRet && !coveredReturn);
  return {
    coveredOutbound,
    coveredReturn,
    uncoveredOutbound,
    uncoveredReturn,
    coveredLegCount: (coveredOutbound ? 1 : 0) + (coveredReturn ? 1 : 0),
    uncoveredLegCount: (uncoveredOutbound ? 1 : 0) + (uncoveredReturn ? 1 : 0)
  };
}

/** @deprecated 兼容旧调用：仅在「计费公里为 0」时视为行程全免 */
function resolveFreeLegs(matched, flags, distanceKm) {
  const covered = resolveCoveredLegs(matched, flags);
  const km = normalizeDrivingDistanceKm(distanceKm);
  if (!matched || km == null) {
    return {
      distanceOk: false,
      freeOutbound: false,
      freeReturn: false,
      chargedOutbound: false,
      chargedReturn: false,
      chargedLegCount: 0,
      freeLegCount: 0
    };
  }
  const billableKm = resolveBillableDistanceKm(km, matched.maxKm);
  const fullyWaived = billableKm <= 0;
  const freeOutbound = !!(covered.coveredOutbound && fullyWaived);
  const freeReturn = !!(covered.coveredReturn && fullyWaived);
  const wantOut = !flags || flags.pickupIncludeOutbound !== false;
  const wantRet = !flags || flags.pickupIncludeReturn !== false;
  const chargedOutbound = !!(wantOut && !freeOutbound);
  const chargedReturn = !!(wantRet && !freeReturn);
  return {
    distanceOk: true,
    freeOutbound,
    freeReturn,
    chargedOutbound,
    chargedReturn,
    chargedLegCount: (chargedOutbound ? 1 : 0) + (chargedReturn ? 1 : 0),
    freeLegCount: (freeOutbound ? 1 : 0) + (freeReturn ? 1 : 0),
    billableKm,
    covered
  };
}

/** 满天免费且计费公里为 0（所选行程均被覆盖时视为全免） */
function isPickupFreeByStayDays(store, stayDays, distanceKm, flags) {
  const matched = matchPickupFreeTier(store, stayDays);
  if (!matched) return false;
  const km = normalizeDrivingDistanceKm(distanceKm);
  if (km == null) return false;
  const billableKm = resolveBillableDistanceKm(km, matched.maxKm);
  if (billableKm > 0) return false;
  if (!flags) return true;
  const covered = resolveCoveredLegs(matched, flags);
  const legCount = countPickupLegs(flags);
  return legCount > 0 && covered.uncoveredLegCount === 0;
}

function formatPickupFreeTiersText(tiers) {
  const list = Array.isArray(tiers) ? tiers : [];
  if (!list.length) return '';
  return list
    .map((tier) => `满 ${tier.minDays} 天减免 ${tier.maxKm} 公里免费${formatTierCoverageText(tier)}`)
    .join('，');
}

function normalizePickupPricingMode(mode) {
  return mode === PICKUP_PRICING_MODE.DISTANCE
    ? PICKUP_PRICING_MODE.DISTANCE
    : PICKUP_PRICING_MODE.FLAT;
}

function normalizePickupPricing(shop) {
  const source = shop || {};
  const pickupFreeTiers = normalizePickupFreeTiers(source.pickupFreeTiers, source);
  const legacy = pickupFreeTiers[0] || null;
  return {
    pickupPricingMode: normalizePickupPricingMode(source.pickupPricingMode),
    pickupFlatPrice: source.pickupFlatPrice != null && source.pickupFlatPrice !== ''
      ? String(source.pickupFlatPrice)
      : '',
    pickupPricePerKm: source.pickupPricePerKm != null && source.pickupPricePerKm !== ''
      ? String(source.pickupPricePerKm)
      : '',
    pickupFreeTiers,
    pickupFreeMinDays: legacy ? legacy.minDays : '',
    pickupFreeMaxKm: legacy ? legacy.maxKm : ''
  };
}

function validatePickupPricing(shop) {
  if (!shop || shop.pickupService !== 'yes') return '';
  const mode = normalizePickupPricingMode(shop.pickupPricingMode);
  if (mode === PICKUP_PRICING_MODE.FLAT) {
    if (!parsePositiveMoney(shop.pickupFlatPrice)) return '请填写接送单程一口价';
  } else if (!parsePositiveMoney(shop.pickupPricePerKm)) {
    return '请填写接送每公里价格';
  }
  const tiers = Array.isArray(shop.pickupFreeTiers) ? shop.pickupFreeTiers : null;
  const hasLegacy = shop.pickupFreeMinDays !== '' && shop.pickupFreeMinDays != null;
  if ((tiers && tiers.length) || hasLegacy) {
    const err = validatePickupFreeTiers(
      tiers && tiers.length ? tiers : legacyPickupFreeToTiers(shop)
    );
    if (err) return err;
  }
  return '';
}

function countPickupLegs(flags) {
  const outbound = flags && flags.pickupIncludeOutbound !== false;
  const ret = flags && flags.pickupIncludeReturn !== false;
  return (outbound ? 1 : 0) + (ret ? 1 : 0);
}

function formatLegCountLabel(legCount) {
  if (legCount <= 1) return '1 程';
  return `${legCount} 程`;
}

function formatCoveredLegsLabel(covered) {
  if (covered.coveredOutbound && covered.coveredReturn) return '接+送';
  if (covered.coveredOutbound) return '接';
  if (covered.coveredReturn) return '送';
  return '';
}

function formatUncoveredLegsLabel(covered) {
  if (covered.uncoveredOutbound && covered.uncoveredReturn) return '接+送';
  if (covered.uncoveredOutbound) return '接';
  if (covered.uncoveredReturn) return '送';
  return '';
}

function parseCoordPair(latitude, longitude) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseStoreCoords(store) {
  return parseCoordPair(store && store.latitude, store && store.longitude);
}

function parsePickupCoords(pickupLatitude, pickupLongitude) {
  return parseCoordPair(pickupLatitude, pickupLongitude);
}

/** 球面直线距离（公里），仅作兜底/调试；计费请用驾车导航距离 */
function calcDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = r * c;
  return Math.ceil(km * 10) / 10;
}

function normalizeDrivingDistanceKm(value) {
  const km = parseFloat(value);
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.ceil(km * 10) / 10;
}

function hasPickupService(store) {
  return !!(store && (store.pickupService === 'yes' || store.hasPickup));
}

function buildDistanceMeta(km, distanceMode) {
  const resolvedMode = distanceMode === 'straight' ? 'straight' : 'driving';
  if (km == null) {
    return { distanceKm: null, distanceText: '', distanceMode: '' };
  }
  return {
    distanceKm: km,
    distanceMode: resolvedMode,
    distanceText: resolvedMode === 'straight'
      ? `直线约 ${km} 公里`
      : `驾车约 ${km} 公里`
  };
}

function buildAllowanceQuote({
  matched,
  covered,
  mode,
  distanceKm,
  distanceMode,
  pricePerKm,
  flatPrice,
  legCount
}) {
  const km = normalizeDrivingDistanceKm(distanceKm);
  const distanceMeta = buildDistanceMeta(km, distanceMode);
  const billableKm = resolveBillableDistanceKm(km, matched.maxKm);
  const coveredLabel = formatCoveredLegsLabel(covered);
  const uncoveredLabel = formatUncoveredLegsLabel(covered);
  const standardText = `寄养满 ${matched.minDays} 天及以上，${matched.maxKm} 公里内免费${formatTierCoverageText(matched)}（超出减免免费区间）`;

  if (mode === PICKUP_PRICING_MODE.FLAT) {
    // 一口价：仍在免费区间内才免对应行程；超出则整程按一口价
    if (billableKm > 0) {
      const fee = Math.round(flatPrice * legCount * 100) / 100;
      return {
        ready: true,
        fee,
        freeByStay: false,
        freePartial: false,
        freeMinDays: matched.minDays,
        freeMaxKm: matched.maxKm,
        freeCoverageText: formatTierCoverageText(matched),
        mode,
        standardText,
        ...distanceMeta,
        distancePending: false,
        perLegFee: flatPrice,
        perLegFeeText: String(flatPrice),
        legCount,
        legCountText: formatLegCountLabel(legCount),
        chargedLegCount: legCount,
        billableKm,
        calcText: legCount > 1
          ? `超出免费 ${matched.maxKm} 公里，¥${flatPrice} × ${legCount} 程`
          : `超出免费 ${matched.maxKm} 公里，单程 ¥${flatPrice}`,
        storeLocationMissing: false
      };
    }
    const chargedLegCount = covered.uncoveredLegCount;
    const fee = Math.round(flatPrice * chargedLegCount * 100) / 100;
    const fullyFree = chargedLegCount === 0;
    let calcText = `寄养满 ${matched.minDays} 天且 ${matched.maxKm} 公里内，${coveredLabel}免费`;
    if (!fullyFree) {
      calcText += `；${uncoveredLabel} ¥${flatPrice}${chargedLegCount > 1 ? ` × ${chargedLegCount}` : ''}`;
    }
    return {
      ready: true,
      fee,
      freeByStay: fullyFree,
      freePartial: !fullyFree && covered.coveredLegCount > 0,
      freeMinDays: matched.minDays,
      freeMaxKm: matched.maxKm,
      freeCoverageText: formatTierCoverageText(matched),
      mode,
      standardText,
      ...distanceMeta,
      distancePending: false,
      perLegFee: fullyFree ? 0 : flatPrice,
      perLegFeeText: fullyFree ? '0' : String(flatPrice),
      legCount,
      legCountText: formatLegCountLabel(legCount),
      chargedLegCount,
      billableKm: 0,
      calcText,
      storeLocationMissing: false
    };
  }

  const fullPerLeg = Math.round(km * pricePerKm * 100) / 100;
  const discountedPerLeg = Math.round(billableKm * pricePerKm * 100) / 100;
  let fee = 0;
  if (covered.coveredOutbound) fee += discountedPerLeg;
  if (covered.coveredReturn) fee += discountedPerLeg;
  if (covered.uncoveredOutbound) fee += fullPerLeg;
  if (covered.uncoveredReturn) fee += fullPerLeg;
  fee = Math.round(fee * 100) / 100;

  const fullyFree = fee <= 0;
  let calcText = '';
  if (fullyFree) {
    calcText = `寄养满 ${matched.minDays} 天，驾车 ${km} 公里（免费区间 ${matched.maxKm} 公里内），${coveredLabel}免费`;
  } else if (billableKm < km) {
    const coveredPart = covered.coveredLegCount > 0
      ? `${coveredLabel} 计费 ${billableKm} 公里×¥${pricePerKm}/公里`
      : '';
    const uncoveredPart = covered.uncoveredLegCount > 0
      ? `${uncoveredLabel} ${km} 公里×¥${pricePerKm}/公里`
      : '';
    calcText = `驾车 ${km} 公里，减免免费 ${matched.maxKm} 公里；${[coveredPart, uncoveredPart].filter(Boolean).join('；')}`;
    if (covered.coveredLegCount > 1) {
      calcText = `驾车 ${km} 公里，减免免费 ${matched.maxKm} 公里，计费 ${billableKm} 公里 × ¥${pricePerKm}/公里 × ${covered.coveredLegCount} 程`;
      if (covered.uncoveredLegCount > 0) {
        calcText += `；${uncoveredLabel}按全距计费`;
      }
    } else if (covered.coveredLegCount === 1 && covered.uncoveredLegCount === 0) {
      calcText = `驾车 ${km} 公里，减免免费 ${matched.maxKm} 公里，计费 ${billableKm} 公里 × ¥${pricePerKm}/公里`;
    }
  } else {
    calcText = covered.coveredLegCount > 1
      ? `${km} 公里 × ¥${pricePerKm}/公里 × ${legCount} 程`
      : `${km} 公里 × ¥${pricePerKm}/公里`;
  }

  return {
    ready: true,
    fee,
    freeByStay: fullyFree,
    freePartial: !fullyFree && billableKm < km,
    freeMinDays: matched.minDays,
    freeMaxKm: matched.maxKm,
    freeCoverageText: formatTierCoverageText(matched),
    mode,
    standardText,
    ...distanceMeta,
    distancePending: false,
    perLegFee: fullyFree ? 0 : discountedPerLeg,
    perLegFeeText: fullyFree ? '0' : discountedPerLeg.toFixed(2),
    legCount,
    legCountText: formatLegCountLabel(legCount),
    chargedLegCount: fullyFree ? 0 : legCount,
    billableKm,
    calcText,
    storeLocationMissing: false
  };
}

function buildPickupFeeQuote(store, options) {
  const empty = {
    ready: false,
    fee: 0,
    freeByStay: false,
    freePartial: false,
    freeMinDays: 0,
    freeMaxKm: 0,
    freeCoverageText: '',
    mode: PICKUP_PRICING_MODE.FLAT,
    standardText: '',
    distanceKm: null,
    distanceText: '',
    distanceMode: '',
    distancePending: false,
    perLegFee: 0,
    perLegFeeText: '0',
    legCount: 0,
    legCountText: '',
    chargedLegCount: 0,
    calcText: '',
    storeLocationMissing: false
  };

  if (!hasPickupService(store)) return empty;

  const {
    pickupIncludeOutbound,
    pickupIncludeReturn,
    pickupLatitude,
    pickupLongitude,
    distanceKm: distanceKmOpt,
    distanceMode: distanceModeOpt,
    stayDays
  } = options || {};

  const pickupFlags = { pickupIncludeOutbound, pickupIncludeReturn };
  const legCount = countPickupLegs(pickupFlags);
  if (!legCount) return empty;

  const mode = normalizePickupPricingMode(store.pickupPricingMode);
  const stayMayFree = meetsPickupFreeStayDays(store, stayDays);
  const matchedTier = stayMayFree ? matchPickupFreeTier(store, stayDays) : null;
  const covered = matchedTier ? resolveCoveredLegs(matchedTier, pickupFlags) : null;
  const distanceMode = distanceModeOpt === 'straight' ? 'straight' : 'driving';
  const km = normalizeDrivingDistanceKm(distanceKmOpt);
  const freeStandardText = matchedTier
    ? `寄养满 ${matchedTier.minDays} 天及以上，${matchedTier.maxKm} 公里内免费${formatTierCoverageText(matchedTier)}（超出减免免费区间）`
    : '';

  if (mode === PICKUP_PRICING_MODE.FLAT) {
    const flat = parsePositiveMoney(store.pickupFlatPrice);
    if (!Number.isFinite(flat)) return empty;
    if (stayMayFree && km == null) {
      const storeCoords = parseStoreCoords(store);
      const pickupCoords = parsePickupCoords(pickupLatitude, pickupLongitude);
      if (!storeCoords) {
        return {
          ...empty,
          mode,
          freeMinDays: matchedTier ? matchedTier.minDays : 0,
          freeMaxKm: matchedTier ? matchedTier.maxKm : 0,
          standardText: freeStandardText,
          storeLocationMissing: true
        };
      }
      if (!pickupCoords) return empty;
      return {
        ...empty,
        mode,
        freeMinDays: matchedTier ? matchedTier.minDays : 0,
        freeMaxKm: matchedTier ? matchedTier.maxKm : 0,
        standardText: freeStandardText,
        distancePending: true
      };
    }
    if (matchedTier && covered && covered.coveredLegCount > 0 && km != null) {
      return buildAllowanceQuote({
        matched: matchedTier,
        covered,
        mode,
        distanceKm: km,
        distanceMode,
        flatPrice: flat,
        legCount
      });
    }
    const fee = Math.round(flat * legCount * 100) / 100;
    const distanceMeta = stayMayFree && km != null
      ? buildDistanceMeta(km, distanceMode)
      : { distanceKm: null, distanceText: '', distanceMode: '' };
    return {
      ready: true,
      fee,
      freeByStay: false,
      freePartial: false,
      freeMinDays: 0,
      freeMaxKm: 0,
      freeCoverageText: '',
      mode,
      standardText: `¥${flat}/单程`,
      ...distanceMeta,
      distancePending: false,
      perLegFee: flat,
      perLegFeeText: String(flat),
      legCount,
      legCountText: formatLegCountLabel(legCount),
      chargedLegCount: legCount,
      calcText: legCount > 1 ? `¥${flat} × ${legCount} 程` : `单程 ¥${flat}`,
      storeLocationMissing: false
    };
  }

  const pricePerKm = parsePositiveMoney(store.pickupPricePerKm);
  if (!Number.isFinite(pricePerKm)) return empty;

  const storeCoords = parseStoreCoords(store);
  const pickupCoords = parsePickupCoords(pickupLatitude, pickupLongitude);
  if (!storeCoords) {
    return {
      ...empty,
      mode,
      freeMinDays: matchedTier ? matchedTier.minDays : 0,
      freeMaxKm: matchedTier ? matchedTier.maxKm : 0,
      standardText: `¥${pricePerKm}/公里`,
      storeLocationMissing: true
    };
  }
  if (!pickupCoords) return empty;

  if (km == null) {
    return {
      ...empty,
      mode,
      freeMinDays: matchedTier ? matchedTier.minDays : 0,
      freeMaxKm: matchedTier ? matchedTier.maxKm : 0,
      standardText: stayMayFree ? freeStandardText || `¥${pricePerKm}/公里` : `¥${pricePerKm}/公里`,
      distancePending: true
    };
  }

  if (matchedTier && covered && covered.coveredLegCount > 0) {
    return buildAllowanceQuote({
      matched: matchedTier,
      covered,
      mode,
      distanceKm: km,
      distanceMode,
      pricePerKm,
      legCount
    });
  }

  const perLegFee = Math.round(km * pricePerKm * 100) / 100;
  const fee = Math.round(perLegFee * legCount * 100) / 100;
  const distanceMeta = buildDistanceMeta(km, distanceMode);
  return {
    ready: true,
    fee,
    freeByStay: false,
    freePartial: false,
    freeMinDays: 0,
    freeMaxKm: 0,
    freeCoverageText: '',
    mode,
    standardText: `¥${pricePerKm}/公里`,
    ...distanceMeta,
    distancePending: false,
    perLegFee,
    perLegFeeText: perLegFee.toFixed(2),
    legCount,
    legCountText: formatLegCountLabel(legCount),
    chargedLegCount: legCount,
    calcText: legCount > 1
      ? `${km} 公里 × ¥${pricePerKm}/公里 × ${legCount} 程`
      : `${km} 公里 × ¥${pricePerKm}/公里`,
    storeLocationMissing: false
  };
}

function calcPickupShippingFee(options) {
  const quote = buildPickupFeeQuote(options && options.store, options);
  return quote.ready ? quote.fee : 0;
}

function formatPickupPricingSummary(store) {
  if (!hasPickupService(store)) return '';
  const mode = normalizePickupPricingMode(store.pickupPricingMode);
  let base = '';
  if (mode === PICKUP_PRICING_MODE.FLAT) {
    const flat = parsePositiveMoney(store.pickupFlatPrice);
    base = flat ? `接送收费：¥${flat}/单程` : '';
  } else {
    const perKm = parsePositiveMoney(store.pickupPricePerKm);
    base = perKm ? `接送收费：¥${perKm}/公里（按驾车导航距离计算）` : '';
  }
  const tiers = getPickupFreeTiers(store);
  if (!tiers.length) return base;
  const freeText = formatPickupFreeTiersText(tiers);
  return base ? `${base}；${freeText}` : freeText;
}

function canCalcDistancePickupFee(store, pickupLatitude, pickupLongitude, distanceKm, stayDays) {
  if (isPickupFreeByStayDays(store, stayDays, distanceKm)) return true;
  if (meetsPickupFreeStayDays(store, stayDays)) {
    if (!parseStoreCoords(store)) return false;
    if (!parsePickupCoords(pickupLatitude, pickupLongitude)) return false;
    return normalizeDrivingDistanceKm(distanceKm) != null;
  }
  if (!store || normalizePickupPricingMode(store.pickupPricingMode) !== PICKUP_PRICING_MODE.DISTANCE) {
    return true;
  }
  if (!parseStoreCoords(store)) return false;
  if (!parsePickupCoords(pickupLatitude, pickupLongitude)) return false;
  return normalizeDrivingDistanceKm(distanceKm) != null;
}

function buildPickupFeeDetail(store, options) {
  const quote = buildPickupFeeQuote(store, options);
  if (!quote.ready) return '';
  if (quote.freeByStay || quote.freePartial) return quote.calcText;
  if (quote.mode === PICKUP_PRICING_MODE.FLAT) {
    return quote.calcText;
  }
  const label = quote.distanceMode === 'straight' ? '直线' : '驾车';
  return `${label} ${quote.distanceKm} 公里 · ${quote.calcText}`;
}

module.exports = {
  PICKUP_PRICING_MODE,
  DEFAULT_PICKUP_FREE_MAX_KM,
  DEFAULT_PICKUP_FREE_MIN_DAYS,
  normalizePickupPricing,
  normalizePickupPricingMode,
  normalizePickupFreeTiers,
  normalizePickupFreeTiersForEdit,
  createDefaultPickupFreeTiersForEdit,
  PICKUP_FREE_TRIP,
  addPickupFreeTier,
  removePickupFreeTier,
  updatePickupFreeTierField,
  setPickupFreeTierTripType,
  validatePickupFreeTiers,
  getPickupFreeTiers,
  hasPickupFreeOffer,
  parsePickupFreeMinDays,
  parsePickupFreeMaxKm,
  matchPickupFreeTier,
  meetsPickupFreeStayDays,
  isPickupFreeByStayDays,
  normalizeTripType,
  formatTierCoverageText,
  formatTierCoverageDetail,
  validatePickupPricing,
  countPickupLegs,
  calcDistanceKm,
  normalizeDrivingDistanceKm,
  calcPickupShippingFee,
  formatPickupPricingSummary,
  canCalcDistancePickupFee,
  buildPickupFeeDetail,
  buildPickupFeeQuote,
  parseStoreCoords,
  parsePickupCoords
};
