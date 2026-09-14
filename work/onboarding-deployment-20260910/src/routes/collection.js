const express = require('express');
const multer = require('multer');
const { authRequired } = require('../middleware/auth');
const { storeForOwner } = require('../services/collectionService');
const onboarding = require('../services/collectionOnboardingService');
const router = express.Router();
router.use(authRequired);
router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!req.openid || typeof req.query.store_id !== 'string') throw new Error('请先登录并选择门店');
    req.store = await storeForOwner(req.query.store_id, req.openid);
    next();
  } catch (_) { res.status(403).json({ success: false, errMsg: '仅店主可以管理开户资料' }); }
});
router.get('/banks', async (req, res) => {
  try { res.json({ success: true, banks: await onboarding.banks(req.query.type) }); }
  catch (_) { res.json({ success: false, errMsg: '银行列表暂时不可用，请稍后重试' }); }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024, files: 1, fields: 0 } }).single('file');
router.post('/materials', (req, res) => {
  if (req.query.consent !== 'v3') return res.status(400).json({ success: false, errMsg: '请先同意开户敏感个人信息处理授权' });
  upload(req, res, async err => {
    if (err || !req.file) return res.status(400).json({ success: false, errMsg: '请上传5MB以内的JPG或PNG图片' });
    try {
      const token = await onboarding.saveMaterial(req.store, req.query.kind, req.file.buffer, req.openid);
      res.json({ success: true, token });
    } catch (error) { res.json({ success: false, errMsg: /^(请|上传|资料|自动开户)/.test(error.message) ? error.message : '开户资料上传失败，请重试' }); }
  });
});
module.exports = router;
