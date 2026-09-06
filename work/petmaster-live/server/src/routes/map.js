const express = require('express');
const { authRequired } = require('../middleware/auth');
const mapService = require('../services/mapService');
const membershipService = require('../services/membershipService');

const router = express.Router();

router.use(authRequired, async (req, res, next) => {
  try {
    if (req.client === 'merchant') {
      const blocked = await membershipService.guardMerchantAction({}, req.openid);
      if (blocked) return res.json(blocked);
    }
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '服务异常' });
  }
});

router.get('/driving-distance', async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query || {};
    const result = await mapService.getDrivingDistanceKm(fromLat, fromLng, toLat, toLng);
    return res.json({
      success: true,
      distanceKm: result.distanceKm,
      distanceMeters: result.distanceMeters,
      mode: 'driving',
      cached: result.cached
    });
  } catch (err) {
    const code = err && err.code;
    const status = code === 'INVALID_COORDS' || code === 'MAP_KEY_MISSING' ? 400 : 502;
    console.error('[map] driving-distance failed', err.message || err);
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '获取导航距离失败',
      code: code || 'MAP_ERROR'
    });
  }
});

router.post('/driving-distance', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await mapService.getDrivingDistanceKm(
      body.fromLat,
      body.fromLng,
      body.toLat,
      body.toLng
    );
    return res.json({
      success: true,
      distanceKm: result.distanceKm,
      distanceMeters: result.distanceMeters,
      mode: 'driving',
      cached: result.cached
    });
  } catch (err) {
    const code = err && err.code;
    const status = code === 'INVALID_COORDS' || code === 'MAP_KEY_MISSING' ? 400 : 502;
    console.error('[map] driving-distance failed', err.message || err);
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '获取导航距离失败',
      code: code || 'MAP_ERROR'
    });
  }
});

router.get('/reverse-geocode', async (req, res) => {
  try {
    const { latitude, longitude, lat, lng } = req.query || {};
    const result = await mapService.reverseGeocode(
      latitude != null ? latitude : lat,
      longitude != null ? longitude : lng
    );
    return res.json({
      success: true,
      province: result.province,
      city: result.city,
      district: result.district,
      address: result.address,
      cached: result.cached
    });
  } catch (err) {
    const code = err && err.code;
    const status = code === 'INVALID_COORDS' || code === 'MAP_KEY_MISSING' ? 400 : 502;
    console.error('[map] reverse-geocode failed', err.message || err);
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '逆地理编码失败',
      code: code || 'MAP_ERROR'
    });
  }
});

module.exports = router;
