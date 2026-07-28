const PICKUP_PRICING_MODE = {
  FLAT: 'flat',
  DISTANCE: 'distance'
};

function parsePositiveMoney(value) {
  if (value === '' || value === null || value === undefined) return NaN;
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return NaN;
  return Math.round(num * 100) / 100;
}

function normalizePickupPricingMode(mode) {
  return mode === PICKUP_PRICING_MODE.DISTANCE
    ? PICKUP_PRICING_MODE.DISTANCE
    : PICKUP_PRICING_MODE.FLAT;
}

function normalizePickupPricing(shop) {
  const source = shop || {};
  return {
    pickupPricingMode: normalizePickupPricingMode(source.pickupPricingMode),
    pickupFlatPrice: source.pickupFlatPrice != null && source.pickupFlatPrice !== ''
      ? String(source.pickupFlatPrice)
      : '',
    pickupPricePerKm: source.pickupPricePerKm != null && source.pickupPricePerKm !== ''
      ? String(source.pickupPricePerKm)
      : ''
  };
}

function validatePickupPricing(shop) {
  if (!shop || shop.pickupService !== 'yes') return '';
  const mode = normalizePickupPricingMode(shop.pickupPricingMode);
  if (mode === PICKUP_PRICING_MODE.FLAT) {
    if (!parsePositiveMoney(shop.pickupFlatPrice)) return '请填写接送单程一口价';
    return '';
  }
  if (!parsePositiveMoney(shop.pickupPricePerKm)) return '请填写接送每公里价格';
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

function buildPickupFeeQuote(store, options) {
  const empty = {
    ready: false,
    fee: 0,
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
    distanceMode: distanceModeOpt
  } = options || {};

  const legCount = countPickupLegs({ pickupIncludeOutbound, pickupIncludeReturn });
  if (!legCount) return empty;

  const mode = normalizePickupPricingMode(store.pickupPricingMode);
  const legCountText = formatLegCountLabel(legCount);

  if (mode === PICKUP_PRICING_MODE.FLAT) {
    const flat = parsePositiveMoney(store.pickupFlatPrice);
    if (!Number.isFinite(flat)) return empty;
    const fee = Math.round(flat * legCount * 100) / 100;
    return {
      ready: true,
      fee,
      mode,
      standardText: `¥${flat}/单程`,
      distanceKm: null,
      distanceText: '',
      distanceMode: '',
      distancePending: false,
      perLegFee: flat,
      perLegFeeText: String(flat),
      legCount,
      legCountText,
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
      standardText: `¥${pricePerKm}/公里`,
      storeLocationMissing: true
    };
  }
  if (!pickupCoords) return empty;

  const km = normalizeDrivingDistanceKm(distanceKmOpt);
  if (km == null) {
    return {
      ...empty,
      mode,
      standardText: `¥${pricePerKm}/公里`,
      distancePending: true
    };
  }

  const distanceMode = distanceModeOpt === 'straight' ? 'straight' : 'driving';
  const perLegFee = Math.round(km * pricePerKm * 100) / 100;
  const fee = Math.round(perLegFee * legCount * 100) / 100;

  return {
    ready: true,
    fee,
    mode,
    standardText: `¥${pricePerKm}/公里`,
    distanceKm: km,
    distanceMode,
    distanceText: distanceMode === 'straight'
      ? `直线约 ${km} 公里`
      : `驾车约 ${km} 公里`,
    distancePending: false,
    perLegFee,
    perLegFeeText: perLegFee.toFixed(2),
    legCount,
    legCountText,
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
  if (mode === PICKUP_PRICING_MODE.FLAT) {
    const flat = parsePositiveMoney(store.pickupFlatPrice);
    return flat ? `接送收费：¥${flat}/单程` : '';
  }
  const perKm = parsePositiveMoney(store.pickupPricePerKm);
  return perKm ? `接送收费：¥${perKm}/公里（按驾车导航距离计算）` : '';
}

function canCalcDistancePickupFee(store, pickupLatitude, pickupLongitude, distanceKm) {
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
  if (quote.mode === PICKUP_PRICING_MODE.FLAT) {
    return quote.calcText;
  }
  const label = quote.distanceMode === 'straight' ? '直线' : '驾车';
  return `${label} ${quote.distanceKm} 公里 · ${quote.calcText}`;
}

module.exports = {
  PICKUP_PRICING_MODE,
  normalizePickupPricing,
  normalizePickupPricingMode,
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
