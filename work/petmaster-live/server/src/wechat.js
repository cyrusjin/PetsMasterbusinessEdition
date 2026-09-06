const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');

const tokenCache = {
  user: { value: '', expireAt: 0 },
  merchant: { value: '', expireAt: 0 },
  oa: { value: '', expireAt: 0 }
};

function normalizeClient(client) {
  return client === 'merchant' ? 'merchant' : 'user';
}

function getAppCredentials(client = 'user') {
  const key = normalizeClient(client);
  const app = (config.wxApps && config.wxApps[key]) || {};
  const appId = app.appId || config.wxAppId;
  const secret = app.secret || config.wxSecret;
  return { client: key, appId, secret };
}

function getOaCredentials() {
  const oa = config.wxOa || {};
  return {
    appId: oa.appId || '',
    secret: oa.secret || '',
    token: oa.token || '',
    aesKey: oa.aesKey || ''
  };
}

async function code2Session(code, client = 'user') {
  const { client: appClient, appId, secret } = getAppCredentials(client);
  if (config.devMockWechat) {
    return {
      openid: appClient === 'merchant' ? 'dev_openid_merchant' : 'dev_openid_petmaster',
      unionid: 'dev_unionid_petmaster',
      session_key: 'mock_session_key',
      client: appClient
    };
  }
  if (!appId || !secret) {
    throw new Error(`未配置 ${appClient === 'merchant' ? 'WX_MERCHANT_APPID/WX_MERCHANT_SECRET' : 'WX_APPID/WX_SECRET'}`);
  }
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const { data } = await axios.get(url, {
    params: {
      appid: appId,
      secret,
      js_code: code,
      grant_type: 'authorization_code'
    },
    timeout: 10000
  });
  if (!data || data.errcode) {
    throw new Error((data && (data.errmsg || String(data.errcode))) || 'code2session 失败');
  }
  return {
    openid: data.openid,
    unionid: data.unionid || '',
    session_key: data.session_key || '',
    client: appClient
  };
}

async function fetchAccessToken(appId, secret, cacheKey) {
  const cached = tokenCache[cacheKey] || { value: '', expireAt: 0 };
  if (cached.value && cached.expireAt > Date.now()) {
    return cached.value;
  }
  if (!appId || !secret) {
    throw new Error(`未配置 ${cacheKey === 'oa' ? 'WX_OA_APPID/WX_OA_SECRET' : '微信 AppID/Secret'}`);
  }
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid: appId,
      secret
    },
    timeout: 10000
  });
  if (!data || !data.access_token) {
    throw new Error((data && data.errmsg) || '获取 access_token 失败');
  }
  tokenCache[cacheKey] = {
    value: data.access_token,
    expireAt: Date.now() + Math.max((data.expires_in || 7200) - 120, 60) * 1000
  };
  return tokenCache[cacheKey].value;
}

async function getAccessToken(client = 'user') {
  const { client: appClient, appId, secret } = getAppCredentials(client);
  return fetchAccessToken(appId, secret, appClient);
}

async function getOaAccessToken() {
  const { appId, secret } = getOaCredentials();
  return fetchAccessToken(appId, secret, 'oa');
}

async function getPhoneNumber(code, client = 'user') {
  const accessToken = await getAccessToken(client);
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
    { code },
    { timeout: 10000 }
  );
  if (!data || data.errcode) {
    throw new Error((data && data.errmsg) || '获取手机号失败');
  }
  return (data.phone_info && data.phone_info.phoneNumber) || '';
}

async function getUnlimitedQrCode({
  scene,
  page,
  envVersion = 'trial',
  width = 430,
  client = 'user'
}) {
  const accessToken = await getAccessToken(client);
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
    {
      scene,
      page,
      check_path: false,
      env_version: envVersion,
      width
    },
    { responseType: 'arraybuffer', timeout: 20000 }
  );

  const buffer = Buffer.from(data);
  const asText = buffer.slice(0, 100).toString('utf8');
  if (asText.includes('errcode')) {
    try {
      const err = JSON.parse(buffer.toString('utf8'));
      throw new Error(err.errmsg || '生成小程序码失败');
    } catch (parseErr) {
      if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
      throw new Error('生成小程序码失败');
    }
  }
  return buffer;
}

function buildTemplateData(fields) {
  const data = {};
  Object.keys(fields || {}).forEach((key) => {
    const value = fields[key];
    if (value == null) return;
    data[key] = { value: String(value) };
  });
  return data;
}

async function sendTemplateMessage({
  touser,
  templateId,
  data,
  miniprogram,
  url = ''
}) {
  if (!touser || !templateId) {
    throw new Error('缺少 touser 或 templateId');
  }
  const accessToken = await getOaAccessToken();
  const payload = {
    touser,
    template_id: templateId,
    data: buildTemplateData(data),
    url: url || ''
  };
  if (miniprogram && miniprogram.appid && miniprogram.pagepath) {
    payload.miniprogram = {
      appid: miniprogram.appid,
      pagepath: miniprogram.pagepath
    };
  }
  const { data: result } = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`,
    payload,
    { timeout: 10000 }
  );
  if (!result || result.errcode) {
    throw new Error((result && result.errmsg) || '发送模板消息失败');
  }
  return result;
}

async function sendSubscribeMessage({
  client = 'merchant',
  touser,
  templateId,
  page = '',
  data,
  miniprogramState = 'formal'
}) {
  if (!touser || !templateId) {
    throw new Error('缺少 touser 或 templateId');
  }
  const { appId, secret } = getAppCredentials(client);
  const accessToken = await fetchAccessToken(appId, secret, normalizeClient(client));
  const payload = {
    touser,
    template_id: templateId,
    page: page || 'pages/daily/daily',
    miniprogram_state: miniprogramState,
    data: buildTemplateData(data)
  };
  const { data: result } = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
    payload,
    { timeout: 10000 }
  );
  if (!result || result.errcode) {
    throw new Error((result && result.errmsg) || `发送订阅消息失败(${result && result.errcode})`);
  }
  return result;
}

async function getOaUserInfo(oaOpenid) {
  if (!oaOpenid) throw new Error('缺少公众号 openid');
  const accessToken = await getOaAccessToken();
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/user/info', {
    params: {
      access_token: accessToken,
      openid: oaOpenid,
      lang: 'zh_CN'
    },
    timeout: 10000
  });
  if (!data || data.errcode) {
    throw new Error((data && data.errmsg) || '获取公众号用户信息失败');
  }
  return {
    openid: data.openid || oaOpenid,
    unionid: data.unionid || '',
    subscribe: data.subscribe === 1,
    nickname: data.nickname || '',
    subscribeTime: data.subscribe_time || 0
  };
}

function verifyOaSignature(token, timestamp, nonce, signature) {
  if (!token || !timestamp || !nonce || !signature) return false;
  const sorted = [String(token), String(timestamp), String(nonce)].sort().join('');
  const hash = crypto.createHash('sha1').update(sorted).digest('hex');
  return hash === String(signature);
}

function parseXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = String(xml || '').match(re);
  if (!match) return '';
  return (match[1] != null && match[1] !== '' ? match[1] : match[2] || '').trim();
}

function parseOaXmlMessage(xml) {
  return {
    ToUserName: parseXmlTag(xml, 'ToUserName'),
    FromUserName: parseXmlTag(xml, 'FromUserName'),
    CreateTime: parseXmlTag(xml, 'CreateTime'),
    MsgType: parseXmlTag(xml, 'MsgType'),
    Event: parseXmlTag(xml, 'Event'),
    EventKey: parseXmlTag(xml, 'EventKey'),
    Content: parseXmlTag(xml, 'Content'),
    MsgId: parseXmlTag(xml, 'MsgId'),
    Encrypt: parseXmlTag(xml, 'Encrypt'),
    // 部分事件/授权场景可能带 UnionId；关注事件通常没有，仍作兜底解析
    UnionId: parseXmlTag(xml, 'UnionId') || parseXmlTag(xml, 'UnionID')
  };
}

function pkcs7Decode(buf) {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.slice(0, buf.length - pad);
}

function decryptOaMessage(encrypt, encodingAesKey, appId) {
  if (!encrypt || !encodingAesKey) {
    throw new Error('缺少加密消息或 AES Key');
  }
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (aesKey.length !== 32) {
    throw new Error('WX_OA_AES_KEY 无效');
  }
  const iv = aesKey.slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypt, 'base64')),
    decipher.final()
  ]);
  const content = pkcs7Decode(decrypted);
  const msgLen = content.readUInt32BE(16);
  const xml = content.slice(20, 20 + msgLen).toString('utf8');
  const fromAppId = content.slice(20 + msgLen).toString('utf8');
  if (appId && fromAppId && fromAppId !== appId) {
    throw new Error('解密消息 AppID 不匹配');
  }
  return xml;
}

function verifyOaMsgSignature(token, timestamp, nonce, encrypt, msgSignature) {
  if (!token || !timestamp || !nonce || !encrypt || !msgSignature) return false;
  const sorted = [String(token), String(timestamp), String(nonce), String(encrypt)].sort().join('');
  const hash = crypto.createHash('sha1').update(sorted).digest('hex');
  return hash === String(msgSignature);
}

function escapeXmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildPassiveTextReply({ toUser, fromUser, content, createTime }) {
  const ts = createTime || Math.floor(Date.now() / 1000);
  return (
    `<xml>` +
    `<ToUserName><![CDATA[${toUser || ''}]]></ToUserName>` +
    `<FromUserName><![CDATA[${fromUser || ''}]]></FromUserName>` +
    `<CreateTime>${ts}</CreateTime>` +
    `<MsgType><![CDATA[text]]></MsgType>` +
    `<Content><![CDATA[${content || ''}]]></Content>` +
    `</xml>`
  );
}

function pkcs7Encode(buf) {
  const blockSize = 32;
  const amount = blockSize - (buf.length % blockSize);
  const pad = Buffer.alloc(amount, amount);
  return Buffer.concat([buf, pad]);
}

function encryptOaReply(xml, encodingAesKey, appId, token, timestamp, nonce) {
  if (!xml || !encodingAesKey) {
    throw new Error('缺少明文回复或 AES Key');
  }
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (aesKey.length !== 32) {
    throw new Error('WX_OA_AES_KEY 无效');
  }
  const random = crypto.randomBytes(16);
  const msgBuf = Buffer.from(String(xml), 'utf8');
  const msgLen = Buffer.alloc(4);
  msgLen.writeUInt32BE(msgBuf.length, 0);
  const appIdBuf = Buffer.from(String(appId || ''), 'utf8');
  const raw = pkcs7Encode(Buffer.concat([random, msgLen, msgBuf, appIdBuf]));
  const iv = aesKey.slice(0, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypt = Buffer.concat([cipher.update(raw), cipher.final()]).toString('base64');
  const ts = String(timestamp || Math.floor(Date.now() / 1000));
  const n = String(nonce || crypto.randomBytes(8).toString('hex'));
  const sorted = [String(token || ''), ts, n, encrypt].sort().join('');
  const msgSignature = crypto.createHash('sha1').update(sorted).digest('hex');
  return (
    `<xml>` +
    `<Encrypt><![CDATA[${encrypt}]]></Encrypt>` +
    `<MsgSignature><![CDATA[${msgSignature}]]></MsgSignature>` +
    `<TimeStamp>${escapeXmlText(ts)}</TimeStamp>` +
    `<Nonce><![CDATA[${n}]]></Nonce>` +
    `</xml>`
  );
}

async function sendCustomMessage(payload) {
  if (!payload || !payload.touser || !payload.msgtype) {
    throw new Error('缺少客服消息 touser 或 msgtype');
  }
  const accessToken = await getOaAccessToken();
  const { data: result } = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`,
    payload,
    { timeout: 10000 }
  );
  if (!result || result.errcode) {
    throw new Error((result && result.errmsg) || '发送客服消息失败');
  }
  return result;
}

/**
 * 创建服务号带参二维码（scene_str，永久）
 * @see https://developers.weixin.qq.com/doc/offiaccount/Account_Management/Generating_a_Parametric_QR_Code.html
 */
async function createOaQrCode({ sceneStr, expireSeconds = 0 } = {}) {
  const scene = String(sceneStr || '').trim().slice(0, 64);
  if (!scene) throw new Error('缺少 scene_str');

  const accessToken = await getOaAccessToken();
  const isTemp = Number(expireSeconds) > 0;
  const body = isTemp
    ? {
        expire_seconds: Math.min(Number(expireSeconds) || 2592000, 2592000),
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: scene } }
      }
    : {
        action_name: 'QR_LIMIT_STR_SCENE',
        action_info: { scene: { scene_str: scene } }
      };

  const { data } = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${accessToken}`,
    body,
    { timeout: 15000 }
  );
  if (!data || data.errcode || !data.ticket) {
    throw new Error((data && data.errmsg) || '创建服务号二维码失败');
  }
  const ticket = data.ticket;
  return {
    ticket,
    url: data.url || '',
    expireSeconds: data.expire_seconds || 0,
    showQrcodeUrl: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`
  };
}

async function downloadToBuffer(url) {
  if (!url) throw new Error('缺少下载地址');
  const { data, headers } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 5 * 1024 * 1024
  });
  const contentType = String((headers && headers['content-type']) || 'image/jpeg').split(';')[0].trim();
  return {
    buffer: Buffer.from(data),
    contentType: contentType || 'image/jpeg'
  };
}

/**
 * 上传临时素材到服务号（客服消息小程序卡片封面用）
 */
async function uploadOaTempMedia({ buffer, filename = 'thumb.jpg', contentType = 'image/jpeg', type = 'image' } = {}) {
  if (!buffer || !buffer.length) throw new Error('缺少媒体内容');
  const FormData = require('form-data');
  const accessToken = await getOaAccessToken();
  const form = new FormData();
  form.append('media', buffer, {
    filename: filename || 'thumb.jpg',
    contentType: contentType || 'image/jpeg'
  });
  const { data } = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=${encodeURIComponent(type || 'image')}`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );
  if (!data || data.errcode || !data.media_id) {
    throw new Error((data && data.errmsg) || '上传服务号素材失败');
  }
  return {
    mediaId: data.media_id,
    type: data.type || type,
    createdAt: data.created_at || 0
  };
}

/**
 * 同步图片内容安全（旧接口，有体积/尺寸限制；调用方应先压缩）
 * errcode 87014 = 违规
 */
async function imgSecCheck(filePath, client = 'user') {
  if (config.devMockWechat) {
    return { errcode: 0, errmsg: 'ok', mock: true };
  }
  const accessToken = await getAccessToken(client);
  const FormData = require('form-data');
  const fs = require('fs');
  const form = new FormData();
  form.append('media', fs.createReadStream(filePath), {
    filename: 'check.jpg',
    contentType: 'image/jpeg'
  });
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${accessToken}`,
    form,
    {
      headers: form.getHeaders(),
      timeout: 20000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );
  return data || {};
}

/**
 * 异步多媒体内容安全（推荐）。结果经小程序消息推送 wxa_media_check 回传。
 * scene: 1资料 2评论 3论坛 4社交日志
 */
async function mediaCheckAsync({
  mediaUrl,
  mediaType = 2,
  openid,
  scene = 4,
  client = 'user'
}) {
  if (config.devMockWechat) {
    return { errcode: 0, errmsg: 'ok', trace_id: `mock_${Date.now()}`, mock: true };
  }
  if (!mediaUrl) throw new Error('缺少 media_url');
  if (!openid) throw new Error('缺少 openid');
  const accessToken = await getAccessToken(client);
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/media_check_async?access_token=${accessToken}`,
    {
      media_url: mediaUrl,
      media_type: mediaType,
      version: 2,
      scene: Number(scene) || 4,
      openid
    },
    { timeout: 15000 }
  );
  if (!data || data.errcode) {
    throw new Error((data && data.errmsg) || `mediaCheckAsync 失败(${data && data.errcode})`);
  }
  return data;
}

module.exports = {
  normalizeClient,
  getAppCredentials,
  getOaCredentials,
  code2Session,
  getAccessToken,
  getOaAccessToken,
  getPhoneNumber,
  getUnlimitedQrCode,
  sendTemplateMessage,
  sendSubscribeMessage,
  sendCustomMessage,
  createOaQrCode,
  downloadToBuffer,
  uploadOaTempMedia,
  getOaUserInfo,
  imgSecCheck,
  mediaCheckAsync,
  verifyOaSignature,
  verifyOaMsgSignature,
  parseOaXmlMessage,
  decryptOaMessage,
  buildPassiveTextReply,
  encryptOaReply
};
