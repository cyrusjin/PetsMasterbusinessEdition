const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { authRequired, wrapAction } = require('../middleware/auth');
const storeService = require('../services/storeService');
const orderService = require('../services/orderService');
const petService = require('../services/petService');
const dailyService = require('../services/dailyService');
const ledgerService = require('../services/ledgerService');
const mediaCheckService = require('../services/mediaCheckService');
const membershipService = require('../services/membershipService');
const oss = require('../oss');
const config = require('../config');

function guardedAction(actions, handler) {
  const protectAll = actions === '*';
  const protectedActions = new Set(protectAll ? [] : actions);
  return wrapAction(async (event, openid, req) => {
    if (req && req.client === 'merchant' && (protectAll || protectedActions.has(String(event.action || '')))) {
      const blocked = await membershipService.guardMerchantAction(event, openid);
      if (blocked) return blocked;
    }
    return handler(event, openid);
  });
}

function guardedExceptActions(allowedActions, handler) {
  const allowed = new Set(allowedActions);
  return wrapAction(async (event, openid, req) => {
    if (req && req.client === 'merchant' && !allowed.has(String(event.action || ''))) {
      const blocked = await membershipService.guardMerchantAction(event, openid);
      if (blocked) return blocked;
    }
    return handler(event, openid);
  });
}

const storeRouter = express.Router();
storeRouter.post('/', authRequired, guardedExceptActions([
  'getMyStore',
  'submitMerchantApply',
  'acceptStaffInvite',
  'getMembershipStatus',
  'getPromotionTasks',
  'submitPromotionProof',
  'createMembershipPay',
  'queryMembershipPay',
  'redeemMembershipCode'
], (event, openid) => storeService.handle(event, openid)));

const orderRouter = express.Router();
orderRouter.post('/', authRequired, guardedAction('*', (event, openid) => orderService.handle(event, openid)));

const petRouter = express.Router();
petRouter.post('/', authRequired, guardedAction('*', (event, openid) => petService.handle(event, openid)));

const dailyRouter = express.Router();
dailyRouter.post('/', authRequired, guardedAction('*', (event, openid) => dailyService.handle(event, openid)));

const ledgerRouter = express.Router();
ledgerRouter.post('/', authRequired, guardedAction('*', (event, openid) => ledgerService.handle(event, openid)));

const uploadDir = path.join(config.media.root, '_tmp');

function ensureUploadTmpDir() {
  fs.mkdirSync(uploadDir, { recursive: true });
}

ensureUploadTmpDir();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        ensureUploadTmpDir();
        cb(null, uploadDir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const uploadRouter = express.Router();
uploadRouter.post('/sign', authRequired, async (req, res) => {
  try {
    const folder = (req.body && req.body.folder) || 'uploads';
    const ext = String((req.body && req.body.ext) || 'jpg').toLowerCase();
    if (folder === 'promotion-proofs' && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return res.status(400).json({ success: false, errMsg: '推广凭证仅支持 JPG、PNG 或 WebP 图片' });
    }
    if (req.client === 'merchant' && folder !== 'promotion-proofs') {
      const blocked = await membershipService.guardMerchantAction({}, req.openid);
      if (blocked) return res.json(blocked);
    }
    const signed = oss.createPostPolicy(folder, ext);
    return res.json({
      success: true,
      upload: signed
    });
  } catch (err) {
    console.error('upload sign failed', err);
    return res.json({
      success: false,
      errMsg: (err && err.message) || '获取上传签名失败'
    });
  }
});

uploadRouter.post('/', authRequired, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        errMsg: '文件过大，请换小一点的'
      });
    }
    return res.status(400).json({
      success: false,
      errMsg: (err && err.message) || '上传失败'
    });
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, errMsg: '未收到文件' });
    }
    const key = (req.body && req.body.key) || '';
    if (!key) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      return res.status(400).json({ success: false, errMsg: '缺少文件 key' });
    }
    if (req.client === 'merchant' && !String(key).startsWith('promotion-proofs/')) {
      const blocked = await membershipService.guardMerchantAction({}, req.openid);
      if (blocked) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        return res.json(blocked);
      }
    }
    if (String(key).startsWith('promotion-proofs/')) {
      const validImage = /^image\/(jpeg|png|webp)$/i.test(String(req.file.mimetype || ''));
      const validSize = Number(req.file.size) > 0 && Number(req.file.size) <= 10 * 1024 * 1024;
      const validExt = /\.(jpe?g|png|webp)$/i.test(String(key));
      if (!validImage || !validSize || !validExt) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        return res.status(400).json({ success: false, errMsg: '推广凭证必须是 10MB 以内的 JPG、PNG 或 WebP 图片' });
      }
    }
    const publicUrl = oss.saveUploadedFile(key, req.file.path);
    const isVideo = oss.isVideoMedia(publicUrl);

    // 视频：先返回上传成功，抽帧与安审放到后台，避免拖慢小程序上传
    if (isVideo) {
      setImmediate(() => {
        mediaCheckService.moderateUploadedMedia({
          publicUrl,
          req,
          folder: String(key).split('/')[0] || ''
        }).catch((err) => {
          console.warn('[upload] async video moderate failed', publicUrl, err && err.message || err);
        });
      });
      return res.status(200).json({ success: true, url: publicUrl });
    }

    // 图片仍同步安审，违规可立刻拦截
    await mediaCheckService.moderateUploadedMedia({
      publicUrl,
      req,
      folder: String(key).split('/')[0] || ''
    });
    return res.status(200).json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('upload failed', err);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    const status = err && err.code === 'MEDIA_RISKY' ? 400 : 500;
    return res.status(status).json({
      success: false,
      errMsg: (err && err.message) || '上传失败'
    });
  }
});

module.exports = {
  storeRouter,
  orderRouter,
  petRouter,
  dailyRouter,
  ledgerRouter,
  uploadRouter
};
