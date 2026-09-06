const express = require('express');
const config = require('../config');
const wechat = require('../wechat');
const oaBindService = require('../services/oaBindService');
const oaBindTicketService = require('../services/oaBindTicketService');
const oaWelcomeService = require('../services/oaWelcomeService');
const oaShareService = require('../services/oaShareService');

const router = express.Router();

function getOaToken() {
  return (config.wxOa && config.wxOa.token) || '';
}

function getOaAesKey() {
  return (config.wxOa && config.wxOa.aesKey) || '';
}

function getOaAppId() {
  return (config.wxOa && config.wxOa.appId) || '';
}

function runFollowSideEffects(oaOpenid, storeId, eventUnionid, eventKey) {
  setImmediate(() => {
    Promise.resolve()
      .then(async () => {
        let ticketBind = null;
        // 优先消费小程序关注绑定码（不依赖 UnionID）
        try {
          ticketBind = await oaBindTicketService.consumeBindScene(eventKey, oaOpenid);
          if (ticketBind && ticketBind.bound) {
            console.log('[oa] ticket bind ok', {
              userId: ticketBind.userId,
              ticketId: ticketBind.ticketId,
              storeId: ticketBind.storeId || ''
            });
          }
        } catch (err) {
          console.error('[oa] ticket bind error', err.message || err);
        }

        let bindResult = { unionid: '', userId: '' };
        try {
          bindResult = await oaBindService.handleOaSubscribe(oaOpenid, {
            unionid: eventUnionid || ''
          });
        } catch (err) {
          console.error('[oa] subscribe bind error', err.message || err);
        }

        const userId = (ticketBind && ticketBind.userId) || (bindResult && bindResult.userId) || '';
        let resolvedStoreId = String(storeId || '').trim();
        if (!resolvedStoreId && ticketBind && ticketBind.storeId) {
          resolvedStoreId = String(ticketBind.storeId).trim();
        }
        if (!resolvedStoreId && userId) {
          try {
            resolvedStoreId = await oaWelcomeService.resolveStoreIdForUserId(userId);
          } catch (err) {
            console.warn('[oa] resolveStoreIdForUserId failed', err.message || err);
          }
        }

        try {
          await oaWelcomeService.handleStoreFollowSideEffects({
            oaOpenid,
            storeId: resolvedStoreId,
            unionid: (bindResult && bindResult.unionid) || eventUnionid || '',
            userId
          });
        } catch (err) {
          console.error('[oa] follow store side effects error', err.message || err);
        }
      })
      .catch((err) => {
        console.error('[oa] subscribe side effects error', err.message || err);
      });
  });
}

/** 微信服务器 URL 验证 */
router.get('/', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = getOaToken();
  if (!token) {
    return res.status(500).send('WX_OA_TOKEN not configured');
  }
  if (!wechat.verifyOaSignature(token, timestamp, nonce, signature)) {
    return res.status(403).send('invalid signature');
  }
  return res.send(echostr || '');
});

/** 关注/取关等事件回调（XML） */
router.post('/', async (req, res) => {
  const token = getOaToken();
  const { signature, timestamp, nonce, msg_signature: msgSignature, encrypt_type: encryptType } = req.query || {};

  if (!token) {
    return res.status(500).send('WX_OA_TOKEN not configured');
  }

  let rawXml = '';
  if (typeof req.body === 'string') {
    rawXml = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawXml = req.body.toString('utf8');
  } else if (req.body && typeof req.body === 'object') {
    rawXml = req.rawBody || '';
  }

  try {
    let xml = rawXml;
    const outer = wechat.parseOaXmlMessage(rawXml);
    const isEncrypt = String(encryptType || '').toLowerCase() === 'aes' || !!outer.Encrypt;

    if (isEncrypt) {
      const encrypt = outer.Encrypt;
      if (!wechat.verifyOaMsgSignature(token, timestamp, nonce, encrypt, msgSignature)) {
        return res.status(403).send('invalid msg_signature');
      }
      xml = wechat.decryptOaMessage(encrypt, getOaAesKey(), getOaAppId());
    } else if (!wechat.verifyOaSignature(token, timestamp, nonce, signature)) {
      return res.status(403).send('invalid signature');
    }

    const msg = wechat.parseOaXmlMessage(xml);
    const event = String(msg.Event || '').toLowerCase();
    const oaOpenid = msg.FromUserName || '';
    const eventKey = msg.EventKey || '';
    const storeId = oaShareService.parseStoreIdFromEventKey(eventKey);
    const eventUnionid = msg.UnionId || '';
    const isBindTicket = !!oaBindTicketService.parseTicketIdFromEventKey(eventKey);

    if (msg.MsgType === 'event' && event === 'subscribe') {
      const replyXml = oaWelcomeService.buildSubscribeReplyXml(msg, {
        encrypt: isEncrypt,
        timestamp,
        nonce
      });
      runFollowSideEffects(oaOpenid, storeId, eventUnionid, eventKey);
      if (replyXml) {
        return res.type('application/xml').send(replyXml);
      }
      return res.send('success');
    }

    // 已关注用户扫绑定码 / 店铺码
    if (msg.MsgType === 'event' && event === 'scan' && (storeId || isBindTicket)) {
      runFollowSideEffects(oaOpenid, storeId, eventUnionid, eventKey);
      return res.send('success');
    }

    // 已关注用户与服务号互动时也尝试补绑（UnionID 路径）
    if (
      oaOpenid
      && (
        msg.MsgType === 'text'
        || msg.MsgType === 'image'
        || msg.MsgType === 'voice'
        || (msg.MsgType === 'event' && (event === 'click' || event === 'view'))
      )
    ) {
      runFollowSideEffects(oaOpenid, storeId, eventUnionid, eventKey);
    }

    if (msg.MsgType === 'event' && event === 'unsubscribe') {
      await oaBindService.handleOaUnsubscribe(oaOpenid);
    }
  } catch (err) {
    console.error('[oa] callback error', err.message || err);
  }

  return res.send('success');
});

module.exports = router;
