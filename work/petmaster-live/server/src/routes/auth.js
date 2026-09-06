const express = require('express');
const { signToken, authRequired, wrapAction } = require('../middleware/auth');
const wechat = require('../wechat');
const userService = require('../services/userService');
const identity = require('../services/identity');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const code = (req.body && req.body.code) || '';
    const client = wechat.normalizeClient((req.body && req.body.client) || 'user');
    if (!code) {
      return res.status(400).json({ success: false, errMsg: '缺少 code' });
    }
    const session = await wechat.code2Session(code, client);
    if (!session.openid) {
      return res.status(400).json({ success: false, errMsg: '无法获取 openid' });
    }
    const user = await identity.resolveLoginUser({
      openid: session.openid,
      unionid: session.unionid || '',
      client
    });
    const canonicalOpenid = (user && user.openid) || session.openid;
    const token = signToken({
      openid: canonicalOpenid,
      client,
      appOpenid: session.openid,
      unionid: session.unionid || (user && user.unionid) || ''
    });
    return res.json({
      success: true,
      token,
      openid: canonicalOpenid,
      appOpenid: session.openid,
      client,
      unionid: session.unionid || ''
    });
  } catch (err) {
    console.error('login failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '登录失败'
    });
  }
});

router.post('/', authRequired, wrapAction((event, openid) => userService.handle(event, openid)));

module.exports = router;
