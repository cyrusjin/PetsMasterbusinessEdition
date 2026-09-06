const express = require('express');
const membershipService = require('../services/membershipService');

const router = express.Router();

router.post('/membership/notify', express.text({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  try {
    const rawBody = typeof req.body === 'string' ? req.body : '';
    if (!rawBody) return res.status(400).json({ code: 'FAIL', message: '通知内容为空' });
    await membershipService.handleMembershipPayNotification(rawBody, req.headers || {});
    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    console.error('[wechatpay] membership notify failed', err && err.message ? err.message : err);
    return res.status(401).json({ code: 'FAIL', message: '通知验证失败' });
  }
});

module.exports = router;
