const config = require('../config');
const db = require('../db');
const wechat = require('../wechat');
const oss = require('../oss');

const SCENE_PREFIX = 's_';
const LOGO_THUMB_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function buildPublicShareUrl(storeId) {
  const base = String((config.media && config.media.apiPublicBaseUrl) || '').replace(/\/$/, '');
  const id = encodeURIComponent(String(storeId || '').trim());
  if (!base || !id) return '';
  return `${base}/s/${id}`;
}

function buildPublicQrcodeUrl(storeId) {
  const base = String((config.media && config.media.apiPublicBaseUrl) || '').replace(/\/$/, '');
  const id = encodeURIComponent(String(storeId || '').trim());
  if (!base || !id) return '';
  return `${base}/s/${id}/qrcode.png`;
}

function buildSceneStr(storeId) {
  const id = String(storeId || '').trim();
  if (!id) return '';
  const raw = `${SCENE_PREFIX}${id}`;
  return raw.slice(0, 64);
}

function parseStoreIdFromEventKey(eventKey) {
  let key = String(eventKey || '').trim();
  if (!key) return '';
  if (/^qrscene_/i.test(key)) {
    key = key.replace(/^qrscene_/i, '');
  }
  // 仅识别店铺分享场景 s_xxx；其它前缀（如 ob_ 绑定码）不算店铺
  if (!key.startsWith(SCENE_PREFIX)) return '';
  return key.slice(SCENE_PREFIX.length).trim();
}

async function ensureStoreOaQr(storeDoc) {
  if (!storeDoc || !storeDoc.store_id) {
    throw new Error('缺少店铺');
  }
  const storeId = String(storeDoc.store_id).trim();
  const sceneStr = buildSceneStr(storeId);
  const cached = storeDoc.oaShare || {};
  if (cached.ticket && cached.sceneStr === sceneStr && cached.showQrcodeUrl) {
    return {
      storeId,
      sceneStr,
      ticket: cached.ticket,
      weixinUrl: cached.weixinUrl || cached.url || '',
      showQrcodeUrl: cached.showQrcodeUrl,
      shareUrl: buildPublicShareUrl(storeId),
      qrcodeUrl: buildPublicQrcodeUrl(storeId)
    };
  }

  const created = await wechat.createOaQrCode({ sceneStr });
  const oaShare = {
    sceneStr,
    ticket: created.ticket,
    weixinUrl: created.url || '',
    showQrcodeUrl: created.showQrcodeUrl,
    updateTime: Date.now()
  };
  await db.updateById('stores', storeDoc._id, {
    oaShare,
    updateTime: Date.now()
  });

  return {
    storeId,
    sceneStr,
    ticket: created.ticket,
    weixinUrl: created.url || '',
    showQrcodeUrl: created.showQrcodeUrl,
    shareUrl: buildPublicShareUrl(storeId),
    qrcodeUrl: buildPublicQrcodeUrl(storeId)
  };
}

async function findStoreById(storeId) {
  const sid = String(storeId || '').trim();
  if (!sid) return null;
  const rows = await db.findMany('stores', { store_id: sid }, { limit: 1 });
  return rows[0] || null;
}

/**
 * 上传店铺 logo 为服务号临时素材，用作欢迎小程序卡片封面
 */
async function resolveStoreLogoThumbMediaId(storeDoc) {
  if (!storeDoc || !storeDoc.store_id) return '';
  const logoRaw = String(storeDoc.logo || '').trim();
  if (!logoRaw) return '';

  const cached = storeDoc.oaShare || {};
  const cacheValid = cached.logoThumbMediaId
    && cached.logoThumbSource === logoRaw
    && cached.logoThumbAt
    && (Date.now() - Number(cached.logoThumbAt)) < LOGO_THUMB_TTL_MS;
  if (cacheValid) return cached.logoThumbMediaId;

  const logoUrl = (await oss.resolveMediaUrl(logoRaw)) || logoRaw;
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return '';

  try {
    const { buffer, contentType } = await wechat.downloadToBuffer(logoUrl);
    const ext = String(contentType || '').includes('png') ? 'png' : 'jpg';
    const uploaded = await wechat.uploadOaTempMedia({
      buffer,
      filename: `store-logo-${storeDoc.store_id}.${ext}`,
      contentType: contentType || 'image/jpeg'
    });
    const oaShare = {
      ...cached,
      logoThumbMediaId: uploaded.mediaId,
      logoThumbSource: logoRaw,
      logoThumbAt: Date.now(),
      updateTime: Date.now()
    };
    await db.updateById('stores', storeDoc._id, { oaShare });
    return uploaded.mediaId;
  } catch (err) {
    console.warn('[oaShare] resolveStoreLogoThumbMediaId failed', err.message || err);
    return cached.logoThumbMediaId || '';
  }
}

module.exports = {
  SCENE_PREFIX,
  buildPublicShareUrl,
  buildPublicQrcodeUrl,
  buildSceneStr,
  parseStoreIdFromEventKey,
  ensureStoreOaQr,
  findStoreById,
  resolveStoreLogoThumbMediaId
};
