const axios = require('axios');
const config = require('../config');

const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

function parseCoord(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function roundKm(meters) {
  const km = Number(meters) / 1000;
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.ceil(km * 10) / 10;
}

function cacheKey(fromLat, fromLng, toLat, toLng) {
  const r = (n) => Number(n).toFixed(5);
  return `${r(fromLat)},${r(fromLng)}|${r(toLat)},${r(toLng)}`;
}

function reverseGeocodeCacheKey(lat, lng) {
  return `rg:${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expireAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(key, value, ttlMs = CACHE_TTL_MS) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first != null) cache.delete(first);
  }
  cache.set(key, { value, expireAt: Date.now() + ttlMs });
}

function requireMapKey() {
  const key = config.tencentMapKey;
  if (!key) {
    const err = new Error('未配置 TENCENT_MAP_KEY');
    err.code = 'MAP_KEY_MISSING';
    throw err;
  }
  return key;
}

async function fetchDistanceMeters(fromLat, fromLng, toLat, toLng) {
  const key = requireMapKey();

  const from = `${fromLat},${fromLng}`;
  const to = `${toLat},${toLng}`;

  // 优先轻量距离矩阵；失败时回退驾车路线规划
  try {
    const { data } = await axios.get('https://apis.map.qq.com/ws/distance/v1/matrix/', {
      params: { mode: 'driving', from, to, key },
      timeout: 10000
    });
    if (data && data.status === 0) {
      const meters = data.result
        && data.result.rows
        && data.result.rows[0]
        && data.result.rows[0].elements
        && data.result.rows[0].elements[0]
        && data.result.rows[0].elements[0].distance;
      if (Number.isFinite(meters) && meters >= 0) return meters;
    }
    if (data && data.status !== 0) {
      console.warn('[map] distance matrix failed', data.status, data.message);
    }
  } catch (err) {
    console.warn('[map] distance matrix request error', err.message || err);
  }

  const { data } = await axios.get('https://apis.map.qq.com/ws/direction/v1/driving/', {
    params: { from, to, key },
    timeout: 10000
  });
  if (!data || data.status !== 0) {
    const err = new Error((data && data.message) || '获取导航距离失败');
    err.code = 'MAP_API_ERROR';
    err.status = data && data.status;
    throw err;
  }
  const meters = data.result && data.result.routes && data.result.routes[0] && data.result.routes[0].distance;
  if (!Number.isFinite(meters) || meters < 0) {
    const err = new Error('导航路线无有效距离');
    err.code = 'MAP_NO_ROUTE';
    throw err;
  }
  return meters;
}

async function getDrivingDistanceKm(fromLatRaw, fromLngRaw, toLatRaw, toLngRaw) {
  const fromLat = parseCoord(fromLatRaw);
  const fromLng = parseCoord(fromLngRaw);
  const toLat = parseCoord(toLatRaw);
  const toLng = parseCoord(toLngRaw);
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    const err = new Error('起终点坐标无效');
    err.code = 'INVALID_COORDS';
    throw err;
  }

  const key = cacheKey(fromLat, fromLng, toLat, toLng);
  const cached = getCached(key);
  if (cached != null) {
    return { distanceKm: cached, distanceMeters: Math.round(cached * 1000), cached: true };
  }

  const meters = await fetchDistanceMeters(fromLat, fromLng, toLat, toLng);
  const distanceKm = roundKm(meters);
  if (distanceKm == null) {
    const err = new Error('导航距离无效');
    err.code = 'MAP_INVALID_DISTANCE';
    throw err;
  }
  setCached(key, distanceKm);
  return { distanceKm, distanceMeters: meters, cached: false };
}

/**
 * 逆地理：坐标 → 省市区与格式化地址
 * @returns {{ province: string, city: string, district: string, address: string, cached: boolean }}
 */
async function reverseGeocode(latRaw, lngRaw) {
  const lat = parseCoord(latRaw);
  const lng = parseCoord(lngRaw);
  if (lat == null || lng == null) {
    const err = new Error('坐标无效');
    err.code = 'INVALID_COORDS';
    throw err;
  }

  const cacheKeyStr = reverseGeocodeCacheKey(lat, lng);
  const cached = getCached(cacheKeyStr);
  if (cached) {
    return { ...cached, cached: true };
  }

  const key = requireMapKey();
  const { data } = await axios.get('https://apis.map.qq.com/ws/geocoder/v1/', {
    params: {
      location: `${lat},${lng}`,
      key,
      get_poi: 0
    },
    timeout: 8000
  });

  if (!data || data.status !== 0 || !data.result) {
    const err = new Error((data && data.message) || '逆地理编码失败');
    err.code = 'MAP_API_ERROR';
    err.status = data && data.status;
    throw err;
  }

  const ac = data.result.address_component || {};
  const value = {
    province: String(ac.province || '').trim(),
    city: String(ac.city || '').trim(),
    district: String(ac.district || '').trim(),
    address: String(data.result.address || '').trim()
  };
  if (!value.province && !value.city && !value.address) {
    const err = new Error('逆地理结果无有效行政区');
    err.code = 'MAP_NO_REGION';
    throw err;
  }

  setCached(cacheKeyStr, value, GEOCODE_CACHE_TTL_MS);
  return { ...value, cached: false };
}

module.exports = {
  getDrivingDistanceKm,
  reverseGeocode,
  roundKm
};
