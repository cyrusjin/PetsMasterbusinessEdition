const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const config = require('../config');

function payConfig() {
  return config.membership.wechatPay || {};
}

function readRequiredFile(filePath, label) {
  if (!filePath) throw new Error(`${label}路径未配置`);
  const value = fs.readFileSync(filePath, 'utf8').trim();
  if (!value) throw new Error(`${label}为空`);
  return value;
}

function credentialsReady() {
  const cfg = payConfig();
  return !!(
    cfg.mchId && cfg.certSerial && cfg.privateKeyPath && cfg.apiV3KeyPath
    && cfg.publicKeyId && cfg.publicKeyPath && cfg.notifyUrl
    && config.wxApps && config.wxApps.merchant && config.wxApps.merchant.appId
  );
}

function assertEnabled() {
  if (!config.membership.payEnabled || !credentialsReady()) {
    const err = new Error('微信支付配置尚未完成');
    err.code = 'PAY_NOT_CONFIGURED';
    throw err;
  }
}

function merchantPrivateKey() {
  return readRequiredFile(payConfig().privateKeyPath, '商户私钥');
}

function wechatPayPublicKey() {
  return readRequiredFile(payConfig().publicKeyPath, '微信支付公钥');
}

function apiV3Key() {
  const value = readRequiredFile(payConfig().apiV3KeyPath, 'APIv3密钥');
  if (!/^[A-Za-z0-9]{32}$/.test(value)) throw new Error('APIv3密钥格式错误');
  return value;
}

function randomNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function merchantAuthorization(method, requestPath, rawBody) {
  const cfg = payConfig();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce();
  const message = `${method}\n${requestPath}\n${timestamp}\n${nonce}\n${rawBody}\n`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(message), merchantPrivateKey()).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${cfg.certSerial}",signature="${signature}"`;
}

function verifyWechatSignature(rawBody, headers) {
  const timestamp = String(headers['wechatpay-timestamp'] || '');
  const nonce = String(headers['wechatpay-nonce'] || '');
  const signature = String(headers['wechatpay-signature'] || '');
  const serial = String(headers['wechatpay-serial'] || '');
  if (!timestamp || !nonce || !signature || !serial) throw new Error('微信支付签名头缺失');
  if (serial !== payConfig().publicKeyId) throw new Error('微信支付公钥ID不匹配');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) throw new Error('微信支付通知时间戳已过期');
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(message),
    wechatPayPublicKey(),
    Buffer.from(signature, 'base64')
  );
  if (!valid) throw new Error('微信支付签名验证失败');
  return true;
}

function request(method, requestPath, body) {
  assertEnabled();
  const rawBody = body == null ? '' : JSON.stringify(body);
  const authorization = merchantAuthorization(method, requestPath, rawBody);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.mch.weixin.qq.com',
      port: 443,
      path: requestPath,
      method,
      timeout: 12000,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'PetMaster/1.0',
        ...(rawBody ? { 'Content-Length': Buffer.byteLength(rawBody) } : {})
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          if (res.headers['wechatpay-signature']) verifyWechatSignature(raw, res.headers);
          let parsed = {};
          if (raw) parsed = JSON.parse(raw);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(parsed.message || `微信支付请求失败 HTTP ${res.statusCode}`);
            err.code = parsed.code || 'WECHAT_PAY_ERROR';
            err.httpStatus = res.statusCode;
            throw err;
          }
          if (!res.headers['wechatpay-signature']) throw new Error('微信支付响应未签名');
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('微信支付请求超时')));
    req.on('error', reject);
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

async function createJsapiOrder(input) {
  const cfg = payConfig();
  return request('POST', '/v3/pay/transactions/jsapi', {
    appid: config.wxApps.merchant.appId,
    mchid: cfg.mchId,
    description: input.description,
    out_trade_no: input.orderId,
    notify_url: cfg.notifyUrl,
    attach: input.attach || '',
    ...(input.timeExpire ? { time_expire: input.timeExpire } : {}),
    amount: { total: input.amountFen, currency: 'CNY' },
    payer: { openid: input.openid }
  });
}

async function queryTransaction(orderId) {
  const cfg = payConfig();
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(cfg.mchId)}`;
  return request('GET', path);
}

async function closeTransaction(orderId) {
  const cfg = payConfig();
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}/close`;
  return request('POST', path, { mchid: cfg.mchId });
}

function buildMiniProgramPayment(prepayId) {
  assertEnabled();
  const appId = config.wxApps.merchant.appId;
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomNonce();
  const packageValue = `prepay_id=${prepayId}`;
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const paySign = crypto.sign('RSA-SHA256', Buffer.from(message), merchantPrivateKey()).toString('base64');
  return { timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign };
}

function decryptNotification(resource) {
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') throw new Error('不支持的微信支付通知算法');
  const packed = Buffer.from(String(resource.ciphertext || ''), 'base64');
  if (packed.length <= 16) throw new Error('微信支付通知密文无效');
  const authTag = packed.subarray(packed.length - 16);
  const ciphertext = packed.subarray(0, packed.length - 16);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key()),
    Buffer.from(String(resource.nonce || ''))
  );
  decipher.setAAD(Buffer.from(String(resource.associated_data || '')));
  decipher.setAuthTag(authTag);
  const raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(raw);
}

function parseNotification(rawBody, headers) {
  assertEnabled();
  verifyWechatSignature(rawBody, headers);
  const envelope = JSON.parse(rawBody);
  return { envelope, transaction: decryptNotification(envelope.resource) };
}

module.exports = {
  credentialsReady,
  createJsapiOrder,
  queryTransaction,
  closeTransaction,
  buildMiniProgramPayment,
  parseNotification,
  verifyWechatSignature
};
