const fs = require('fs');
const path = require('path');
const config = require('../config');
const oss = require('../oss');
const wechat = require('../wechat');

const POSTER_WIDTH = 750;
const POSTER_HEIGHT = 1200;

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxChars) {
  const raw = String(text || '').trim() || '宠物寄养';
  if (raw.length <= maxChars) return [raw];
  const lines = [];
  let rest = raw;
  while (rest.length > maxChars && lines.length < 2) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (lines.length < 2 && rest) {
    lines.push(rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest);
  } else if (rest && lines.length >= 2) {
    lines[1] = `${lines[1].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

function bufferToDataUri(buffer, contentType) {
  const type = contentType || 'image/jpeg';
  return `data:${type};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function loadImageDataUri(url, fallbackType = 'image/jpeg') {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const downloaded = await wechat.downloadToBuffer(url);
    return bufferToDataUri(downloaded.buffer, downloaded.contentType || fallbackType);
  } catch (err) {
    console.warn('[oa] load poster image failed', url, err.message || err);
    return '';
  }
}

function buildPosterSvg({ storeName, logoDataUri, qrDataUri }) {
  const nameLines = wrapText(storeName, 12);
  const nameTspans = nameLines
    .map((line, index) => {
      const y = 318 + index * 52;
      return `<tspan x="375" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  const logoBlock = logoDataUri
    ? `<image href="${logoDataUri}" x="303" y="148" width="144" height="144" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : `<rect x="303" y="148" width="144" height="144" rx="28" fill="#d9ebe1"/>
       <text x="375" y="236" text-anchor="middle" font-size="48" fill="#3d6b54" font-family="PingFang SC, sans-serif">宠</text>`;

  const qrBlock = qrDataUri
    ? `<image href="${qrDataUri}" x="175" y="560" width="400" height="400" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="175" y="560" width="400" height="400" fill="#f2f2f2"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8f6ef"/>
      <stop offset="45%" stop-color="#f7faf8"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    <clipPath id="logoClip">
      <rect x="303" y="148" width="144" height="144" rx="28"/>
    </clipPath>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#1f4a34" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="48" y="64" font-size="24" fill="#5f7a6c" letter-spacing="2"
        font-family="PingFang SC, Helvetica Neue, sans-serif">熠森宠物管家 · 猫森宠物服务号</text>
  <rect x="40" y="96" width="670" height="1040" rx="36" fill="#ffffff" filter="url(#cardShadow)"/>
  ${logoBlock}
  <text text-anchor="middle" font-size="44" font-weight="700" fill="#1f2a24"
        font-family="PingFang SC, Helvetica Neue, sans-serif">${nameTspans}</text>
  <text x="375" y="450" text-anchor="middle" font-size="26" fill="#5b6b62"
        font-family="PingFang SC, Helvetica Neue, sans-serif">长按识别二维码，关注服务号</text>
  <text x="375" y="492" text-anchor="middle" font-size="26" fill="#5b6b62"
        font-family="PingFang SC, Helvetica Neue, sans-serif">关注后可通过商家分享进入小程序预约</text>
  <rect x="163" y="548" width="424" height="424" rx="28" fill="#ffffff" stroke="#e5efe9" stroke-width="2"/>
  ${qrBlock}
  <text x="375" y="1030" text-anchor="middle" font-size="24" fill="#6a7c72"
        font-family="PingFang SC, Helvetica Neue, sans-serif">扫码关注 · 打开商家分享即可绑定本店</text>
</svg>`;
}

async function rasterizeSvg(svg) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    throw new Error('服务端未安装 sharp，无法生成海报');
  }
  return sharp(Buffer.from(svg, 'utf8'))
    .resize(POSTER_WIDTH, POSTER_HEIGHT)
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

function posterCachePath(storeId) {
  const root = (config.media && config.media.root) || path.join(__dirname, '..', '..', 'data', 'media');
  const dir = path.join(root, 'store-posters');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${storeId}.jpg`);
}

function buildPublicPosterUrl(storeId) {
  const base = String((config.media && config.media.apiPublicBaseUrl) || '').replace(/\/$/, '');
  const id = encodeURIComponent(String(storeId || '').trim());
  if (!base || !id) return '';
  return `${base}/s/${id}/poster.jpg`;
}

/**
 * 生成落地页风格邀请海报（含带 store_id 的服务号二维码）
 */
async function buildStoreSharePoster({ storeDoc, showQrcodeUrl }) {
  if (!storeDoc || !storeDoc.store_id) {
    throw new Error('缺少店铺');
  }
  if (!showQrcodeUrl) {
    throw new Error('缺少服务号二维码');
  }

  const storeId = String(storeDoc.store_id).trim();
  const storeName = String(storeDoc.name || '宠物寄养').trim() || '宠物寄养';
  const logoRaw = storeDoc.logo || '';
  const logoUrl = (await oss.resolveMediaUrl(logoRaw)) || logoRaw;
  const ticket = (storeDoc.oaShare && storeDoc.oaShare.ticket) || '';
  const logoKey = logoRaw || '';
  const cacheFile = posterCachePath(storeId);
  const metaFile = `${cacheFile}.meta.json`;

  try {
    if (fs.existsSync(cacheFile) && fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (meta && meta.ticket === ticket && meta.logoKey === logoKey && meta.name === storeName) {
        return {
          buffer: fs.readFileSync(cacheFile),
          contentType: 'image/jpeg',
          posterUrl: buildPublicPosterUrl(storeId),
          cached: true
        };
      }
    }
  } catch (err) {
    // ignore cache read errors
  }

  const [logoDataUri, qrDataUri] = await Promise.all([
    loadImageDataUri(logoUrl),
    loadImageDataUri(showQrcodeUrl, 'image/jpeg')
  ]);
  if (!qrDataUri) {
    throw new Error('下载服务号二维码失败');
  }

  const svg = buildPosterSvg({ storeName, logoDataUri, qrDataUri });
  const buffer = await rasterizeSvg(svg);
  fs.writeFileSync(cacheFile, buffer);
  fs.writeFileSync(metaFile, JSON.stringify({
    ticket,
    logoKey,
    name: storeName,
    updateTime: Date.now()
  }));

  return {
    buffer,
    contentType: 'image/jpeg',
    posterUrl: buildPublicPosterUrl(storeId),
    cached: false
  };
}

module.exports = {
  buildPublicPosterUrl,
  buildStoreSharePoster,
  POSTER_WIDTH,
  POSTER_HEIGHT
};
