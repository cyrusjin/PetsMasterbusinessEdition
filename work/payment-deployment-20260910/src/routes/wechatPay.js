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

router.post('/orders/notify', express.text({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  try {
    if (typeof req.body !== 'string' || !req.body) throw new Error('通知内容为空');
    await require('../services/orderPaymentService').notification(req.body, req.headers);
    res.status(200).json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    console.warn('[wechatpay] order notify failed', err.message);
    res.status(500).json({ code: 'FAIL', message: '通知未处理，请重试' });
  }
});
module.exports = router;
