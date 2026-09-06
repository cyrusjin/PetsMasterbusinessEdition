const express = require('express');
const oss = require('../oss');
const oaShareService = require('../services/oaShareService');

const router = express.Router();

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSharePage({ storeName, storeLogo, qrcodeUrl, loadError }) {
  const name = escapeHtml(storeName || '宠物寄养');
  const logo = escapeHtml(storeLogo || '');
  const qr = escapeHtml(qrcodeUrl || '');
  const err = escapeHtml(loadError || '');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>${name} · 关注服务号预约</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
      background: linear-gradient(180deg, #e8f6ef 0%, #f7faf8 42%, #ffffff 100%);
      color: #1f2a24;
    }
    .wrap { max-width: 420px; margin: 0 auto; padding: 28px 20px 40px; }
    .brand { font-size: 13px; letter-spacing: 0.08em; color: #5f7a6c; margin-bottom: 18px; }
    .card {
      background: rgba(255,255,255,0.92);
      border-radius: 20px;
      padding: 24px 20px 28px;
      box-shadow: 0 12px 40px rgba(31, 74, 52, 0.08);
      text-align: center;
    }
    .logo {
      width: 72px; height: 72px; border-radius: 18px; object-fit: cover;
      background: #eef5f0; margin: 0 auto 14px; display: block;
    }
    .logo-fallback {
      width: 72px; height: 72px; border-radius: 18px; margin: 0 auto 14px;
      background: #d9ebe1; display: flex; align-items: center; justify-content: center;
      font-size: 28px; color: #3d6b54;
    }
    h1 { font-size: 22px; margin: 0 0 8px; font-weight: 700; }
    .desc { margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #5b6b62; }
    .qr-wrap {
      width: 220px; height: 220px; margin: 0 auto 16px; padding: 12px;
      background: #fff; border-radius: 16px; border: 1px solid #e5efe9;
    }
    .qr-wrap img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .hint { font-size: 13px; color: #6a7c72; line-height: 1.7; margin: 0; }
    .error { color: #b42318; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">熠森宠物管家 · 猫森宠物服务号</div>
    <div class="card">
      ${err ? `<p class="error">${err}</p>` : `
        ${logo ? `<img class="logo" src="${logo}" alt="" />` : `<div class="logo-fallback">宠</div>`}
        <h1>${name}</h1>
        <p class="desc">长按识别下方二维码关注服务号<br/>关注后可通过商家分享进入小程序预约</p>
        ${qr ? `<div class="qr-wrap"><img src="${qr}" alt="服务号二维码" /></div>` : ''}
        <p class="hint">打开微信扫一扫 / 长按识别二维码即可关注</p>
      `}
    </div>
  </div>
</body>
</html>`;
}

router.get('/:storeId/qrcode.png', async (req, res) => {
  const storeId = decodeURIComponent(String((req.params && req.params.storeId) || '').trim());
  if (!storeId) {
    res.status(400).send('missing store_id');
    return;
  }
  try {
    const storeDoc = await oaShareService.findStoreById(storeId);
    if (!storeDoc) {
      res.status(404).send('store not found');
      return;
    }
    const qr = await oaShareService.ensureStoreOaQr(storeDoc);
    const wechat = require('../wechat');
    const downloaded = await wechat.downloadToBuffer(qr.showQrcodeUrl);
    res
      .type(downloaded.contentType || 'image/jpeg')
      .set('Cache-Control', 'public, max-age=86400')
      .send(downloaded.buffer);
  } catch (err) {
    console.error('[share] proxy qrcode failed', err.message || err);
    res.status(500).send('qrcode unavailable');
  }
});

router.get('/:storeId/poster.jpg', async (req, res) => {
  const storeId = decodeURIComponent(String((req.params && req.params.storeId) || '').trim());
  if (!storeId) {
    res.status(400).send('missing store_id');
    return;
  }
  try {
    const storeDoc = await oaShareService.findStoreById(storeId);
    if (!storeDoc) {
      res.status(404).send('store not found');
      return;
    }
    const qr = await oaShareService.ensureStoreOaQr(storeDoc);
    const fresh = (await oaShareService.findStoreById(storeId)) || storeDoc;
    const oaPosterService = require('../services/oaPosterService');
    const poster = await oaPosterService.buildStoreSharePoster({
      storeDoc: fresh,
      showQrcodeUrl: qr.showQrcodeUrl
    });
    res
      .type(poster.contentType || 'image/jpeg')
      .set('Cache-Control', 'public, max-age=3600')
      .send(poster.buffer);
  } catch (err) {
    console.error('[share] poster failed', err.message || err);
    res.status(500).send('poster unavailable');
  }
});

router.get('/:storeId', async (req, res) => {
  const storeId = decodeURIComponent(String((req.params && req.params.storeId) || '').trim());
  if (!storeId) {
    res.status(400).type('html').send(renderSharePage({
      loadError: '邀请链接无效，请联系商家重新分享'
    }));
    return;
  }

  try {
    const storeDoc = await oaShareService.findStoreById(storeId);
    if (!storeDoc) {
      res.status(404).type('html').send(renderSharePage({
        loadError: '店铺不存在或已下线，请联系商家'
      }));
      return;
    }

    const qr = await oaShareService.ensureStoreOaQr(storeDoc);
    const logoRaw = storeDoc.logo || '';
    const storeLogo = (await oss.resolveMediaUrl(logoRaw)) || logoRaw;
    res
      .type('html')
      .set('Cache-Control', 'public, max-age=300')
      .send(renderSharePage({
        storeName: storeDoc.name || '宠物寄养',
        storeLogo,
        qrcodeUrl: qr.qrcodeUrl || qr.showQrcodeUrl
      }));
  } catch (err) {
    console.error('[share] render store page failed', err.message || err);
    res.status(500).type('html').send(renderSharePage({
      loadError: '页面暂时无法打开，请稍后重试'
    }));
  }
});

module.exports = router;
