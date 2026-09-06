const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function signAdminToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.adminJwtExpiresIn });
}

function adminRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ success: false, errMsg: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.role !== 'admin' || !decoded.username) {
      return res.status(403).json({ success: false, errMsg: '无权访问' });
    }
    req.admin = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, errMsg: '登录已过期，请重新登录' });
  }
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ success: false, errMsg: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.openid = decoded.openid;
    req.client = decoded.client === 'merchant' ? 'merchant' : 'user';
    req.auth = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, errMsg: '登录已过期，请重新登录' });
  }
}

function wrapAction(handler) {
  return async (req, res) => {
    try {
      const event = { ...(req.body || {}) };
      const result = await handler(event, req.openid, req);
      return res.json(result);
    } catch (err) {
      console.error('API error', err);
      return res.json({
        success: false,
        errMsg: (err && err.message) || '服务异常'
      });
    }
  };
}

module.exports = {
  signToken,
  signAdminToken,
  authRequired,
  adminRequired,
  wrapAction
};
