const express = require('express');
const config = require('../config');
const wechat = require('../wechat');
const mediaCheckService = require('../services/mediaCheckService');

const router = express.Router();

function getMpToken() {
  return (config.wxMp && config.wxMp.token) || '';
}

function getMpAesKey() {
  return (config.wxMp && config.wxMp.aesKey) || '';
}

function parsePushBody(req) {
  if (req.body == null) return { raw: '', parsed: null };
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body) && !Array.isArray(req.body)) {
    return { raw: '', parsed: req.body };
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  const trimmed = raw.trim();
  if (!trimmed) return { raw, parsed: null };
  if (trimmed.startsWith('{')) {
    try {
      return { raw, parsed: JSON.parse(trimmed) };
    } catch (_) {
      return { raw, parsed: null };
    }
  }
  return { raw, parsed: wechat.parseOaXmlMessage(raw) };
}

function unwrapEncrypted(parsed, raw, query) {
  const token = getMpToken();
  const {
    signature,
    timestamp,
    nonce,
    msg_signature: msgSignature,
    encrypt_type: encryptType
  } = query || {};

  const encrypt = (parsed && parsed.Encrypt) || '';
  const isEncrypt = String(encryptType || '').toLowerCase() === 'aes' || !!encrypt;

  if (isEncrypt) {
    if (!wechat.verifyOaMsgSignature(token, timestamp, nonce, encrypt, msgSignature)) {
      const err = new Error('invalid msg_signature');
      err.status = 403;
      throw err;
    }
    // 解密时 AppID 可能是宠主端或商家端，先不强制校验 fromAppId
    const xml = wechat.decryptOaMessage(encrypt, getMpAesKey(), '');
    if (xml.trim().startsWith('{')) {
      return JSON.parse(xml);
    }
    return wechat.parseOaXmlMessage(xml);
  }

  if (!wechat.verifyOaSignature(token, timestamp, nonce, signature)) {
    const err = new Error('invalid signature');
    err.status = 403;
    throw err;
  }
  return parsed || wechat.parseOaXmlMessage(raw);
}

/** 微信服务器 URL 验证（宠主端 / 商家端消息推送） */
router.get('/', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = getMpToken();
  if (!token) {
    return res.status(500).send('WX_MP_TOKEN not configured');
  }
  if (!wechat.verifyOaSignature(token, timestamp, nonce, signature)) {
    return res.status(403).send('invalid signature');
  }
  return res.send(echostr || '');
});

/** 接收 wxa_media_check 等事件 */
router.post('/', async (req, res) => {
  const token = getMpToken();
  if (!token) {
    return res.status(500).send('WX_MP_TOKEN not configured');
  }

  try {
    const { raw, parsed } = parsePushBody(req);
    // 配置消息推送时的探活
    if (parsed && parsed.action === 'CheckContainerPath') {
      return res.send('success');
    }
    if (raw && raw.includes('<action>CheckContainerPath</action>')) {
      return res.send('success');
    }

    const event = unwrapEncrypted(parsed, raw, req.query || {});
    await mediaCheckService.handleMediaCheckEvent(event);
  } catch (err) {
    console.error('[mp] callback error', err.message || err);
    if (err.status === 403) {
      return res.status(403).send(err.message || 'forbidden');
    }
  }

  return res.send('success');
});

module.exports = router;
