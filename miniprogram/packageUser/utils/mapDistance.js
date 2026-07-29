const { request, ensureLogin } = require('../../utils/api');
const {
  parseStoreCoords,
  parsePickupCoords,
  normalizeDrivingDistanceKm,
  calcDistanceKm
} = require('../../utils/pickupPricing');

const memoryCache = new Map();

function coordKey(fromLat, fromLng, toLat, toLng) {
  const r = (n) => Number(n).toFixed(5);
  return `${r(fromLat)},${r(fromLng)}|${r(toLat)},${r(toLng)}`;
}

function getCachedDrivingDistance(fromLat, fromLng, toLat, toLng) {
  const hit = memoryCache.get(coordKey(fromLat, fromLng, toLat, toLng));
  if (!hit || hit.distanceKm == null) return null;
  return hit;
}

function setCachedDrivingDistance(fromLat, fromLng, toLat, toLng, km) {
  const normalized = normalizeDrivingDistanceKm(km);
  if (normalized == null) return null;
  const value = { distanceKm: normalized, distanceMode: 'driving' };
  memoryCache.set(coordKey(fromLat, fromLng, toLat, toLng), value);
  return value;
}

function buildStraightFallback(fromLat, fromLng, toLat, toLng, apiErrMsg) {
  const km = calcDistanceKm(fromLat, fromLng, toLat, toLng);
  if (!Number.isFinite(km)) {
    return {
      success: false,
      errMsg: apiErrMsg || '获取距离失败'
    };
  }
  return {
    success: true,
    distanceKm: km,
    distanceMode: 'straight',
    fallback: true,
    apiErrMsg: apiErrMsg || ''
  };
}

function fetchDrivingDistanceKm(fromLat, fromLng, toLat, toLng) {
  const cached = getCachedDrivingDistance(fromLat, fromLng, toLat, toLng);
  if (cached) {
    return Promise.resolve({
      success: true,
      distanceKm: cached.distanceKm,
      distanceMode: 'driving',
      cached: true
    });
  }

  return ensureLogin()
    .then(() => request('/api/map/driving-distance', {
      fromLat,
      fromLng,
      toLat,
      toLng
    }, { method: 'GET', timeout: 15000 }))
    .then((res) => {
      if (res && res.unauthorized) {
        return ensureLogin(true).then(() => request('/api/map/driving-distance', {
          fromLat,
          fromLng,
          toLat,
          toLng
        }, { method: 'GET', timeout: 15000 }));
      }
      return res;
    })
    .then((res) => {
      if (!res || res.success === false) {
        return buildStraightFallback(
          fromLat,
          fromLng,
          toLat,
          toLng,
          (res && res.errMsg) || '获取导航距离失败'
        );
      }
      const cachedValue = setCachedDrivingDistance(fromLat, fromLng, toLat, toLng, res.distanceKm);
      if (!cachedValue) {
        return buildStraightFallback(fromLat, fromLng, toLat, toLng, '导航距离无效');
      }
      return {
        success: true,
        distanceKm: cachedValue.distanceKm,
        distanceMeters: res.distanceMeters,
        distanceMode: 'driving',
        cached: !!res.cached
      };
    })
    .catch((err) => buildStraightFallback(
      fromLat,
      fromLng,
      toLat,
      toLng,
      (err && err.message) || '获取导航距离失败'
    ));
}

function resolveStorePickupDrivingDistance(store, pickupLatitude, pickupLongitude) {
  const storeCoords = parseStoreCoords(store);
  const pickupCoords = parsePickupCoords(pickupLatitude, pickupLongitude);
  if (!storeCoords || !pickupCoords) {
    return Promise.resolve({ success: false, errMsg: '缺少坐标', missingCoords: true });
  }

  const cached = getCachedDrivingDistance(
    storeCoords.lat,
    storeCoords.lng,
    pickupCoords.lat,
    pickupCoords.lng
  );
  if (cached) {
    return Promise.resolve({
      success: true,
      distanceKm: cached.distanceKm,
      distanceMode: 'driving',
      cached: true
    });
  }

  return fetchDrivingDistanceKm(
    storeCoords.lat,
    storeCoords.lng,
    pickupCoords.lat,
    pickupCoords.lng
  );
}

module.exports = {
  fetchDrivingDistanceKm,
  getCachedDrivingDistanceKm: (fromLat, fromLng, toLat, toLng) => {
    const hit = getCachedDrivingDistance(fromLat, fromLng, toLat, toLng);
    return hit ? hit.distanceKm : null;
  },
  resolveStorePickupDrivingDistance
};
