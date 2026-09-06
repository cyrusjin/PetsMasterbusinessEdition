const fs = require('fs');
const path = require('path');
const db = require('../db');
const oss = require('../oss');
const wechat = require('../wechat');
const config = require('../config');

const COLLECTION = 'media_checks';
const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp)(\?|$)/i;

function sceneForFolder(folderOrKey) {
  const text = String(folderOrKey || '').toLowerCase();
  if (text.includes('store') || text.includes('license') || text.includes('logo')) {
    return 1; // 资料
  }
  if (text.includes('chat') || text.includes('comment')) {
    return 2; // 评论
  }
  return 4; // 社交日志（日常打卡等）
}

function isImageUrl(url) {
  return IMAGE_EXT.test(String(url || ''));
}

async function ensureCollection() {
  await db.ensureCollections([COLLECTION]);
  try {
    await db.collection(COLLECTION).createIndex({ trace_id: 1 }, { unique: true, sparse: true });
    await db.collection(COLLECTION).createIndex({ media_url: 1 });
    await db.collection(COLLECTION).createIndex({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
  } catch (_) {
    // index may already exist
  }
}

function resolveAppOpenid(req) {
  if (!req) return '';
  const auth = req.auth || {};
  return auth.appOpenid || req.openid || '';
}

/**
 * 上传后审图：
 * 1) 可选同步 imgSecCheck（压缩后），违规则删文件并抛错 → 客户端拿不到 URL
 * 2) 异步 mediaCheckAsync，违规回调后再删文件 → 已展示的图会 404/空白
 */
async function moderateUploadedMedia({ publicUrl, req, folder }) {
  if (!publicUrl || config.devMockWechat) {
    return { skipped: true };
  }

  let checkUrl = publicUrl;
  let localPath = '';

  if (oss.isVideoMedia(publicUrl)) {
    const cover = await oss.ensureVideoCoverUrl(publicUrl);
    if (!cover) {
      console.warn('[mediaCheck] skip video without cover', publicUrl);
      return { skipped: true, reason: 'no_cover' };
    }
    checkUrl = cover;
  } else if (!isImageUrl(publicUrl)) {
    return { skipped: true, reason: 'not_image' };
  }

  const key = oss.extractObjectKey(checkUrl);
  if (key) {
    try {
      localPath = oss.absolutePathForKey(key);
    } catch (_) {
      localPath = '';
    }
  }

  const client = wechat.normalizeClient(req && req.client);
  const appOpenid = resolveAppOpenid(req);
  const scene = sceneForFolder(folder || key || publicUrl);

  // 同步拦截：压缩后调 imgSecCheck
  if (config.wxMp.syncImageCheck && localPath && fs.existsSync(localPath)) {
    let checkCopy = '';
    try {
      checkCopy = await oss.createImageCheckCopy(localPath);
      const syncRes = await wechat.imgSecCheck(checkCopy, client);
      if (syncRes && Number(syncRes.errcode) === 87014) {
        removeRiskyMedia(publicUrl);
        const err = new Error('图片含违规内容，请更换后重试');
        err.code = 'MEDIA_RISKY';
        throw err;
      }
      if (syncRes && syncRes.errcode && Number(syncRes.errcode) !== 0) {
        console.warn('[mediaCheck] imgSecCheck warn', syncRes.errcode, syncRes.errmsg);
      }
    } catch (err) {
      if (err && err.code === 'MEDIA_RISKY') throw err;
      console.warn('[mediaCheck] sync check skipped', err.message || err);
    } finally {
      if (checkCopy) {
        try { fs.unlinkSync(checkCopy); } catch (_) { /* ignore */ }
      }
    }
  }

  // 异步抽检（需小程序消息推送配置才能收结果）
  if (!appOpenid) {
    console.warn('[mediaCheck] skip async: missing appOpenid');
    return { sync: 'done', async: 'skipped_no_openid' };
  }

  try {
    await ensureCollection();
    const asyncRes = await wechat.mediaCheckAsync({
      mediaUrl: checkUrl,
      mediaType: 2,
      openid: appOpenid,
      scene,
      client
    });
    const traceId = asyncRes && asyncRes.trace_id;
    if (traceId) {
      await db.insertOne(COLLECTION, {
        trace_id: traceId,
        media_url: checkUrl,
        source_url: publicUrl,
        client,
        openid: appOpenid,
        scene,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    return { sync: 'done', async: 'submitted', trace_id: traceId || '' };
  } catch (err) {
    console.warn('[mediaCheck] async submit failed', err.message || err);
    return { sync: 'done', async: 'failed', errMsg: err.message || String(err) };
  }
}

function removeRiskyMedia(publicUrl) {
  if (!publicUrl) return;
  oss.deleteStoredMedia(publicUrl);
  if (oss.isVideoMedia(publicUrl)) {
    const key = oss.extractObjectKey(publicUrl);
    if (key) {
      const parsed = path.posix.parse(key.replace(/\\/g, '/'));
      const dir = parsed.dir ? `${parsed.dir}/` : '';
      oss.deleteStoredMedia(`${dir}${parsed.name}_cover.jpg`);
    }
  } else {
    // 若审的是封面，也尝试删对应视频（source 在回调里处理）
  }
}

function isRiskySuggest(suggest, isrisky) {
  // 仅删除明确违规。review/空字符串都放行（微信偶发空 suggest，review 只是疑似）
  const s = String(suggest || '').toLowerCase().trim();
  if (s === 'risky' || s === 'block') return true;
  if (Number(isrisky) === 1) return true;
  return false;
}

async function handleMediaCheckEvent(event) {
  if (!event) return { handled: false };
  const eventName = String(event.Event || event.event || '').toLowerCase();
  if (eventName !== 'wxa_media_check') {
    return { handled: false };
  }

  const traceId = event.trace_id || event.traceId || '';
  const result = event.result || {};
  const suggest = result.suggest || event.suggest || '';
  const isrisky = event.isrisky;
  const errcode = event.errcode != null ? Number(event.errcode) : 0;
  const risky = errcode === 0 && isRiskySuggest(suggest, isrisky);

  await ensureCollection();
  let doc = null;
  if (traceId) {
    doc = await db.findOne(COLLECTION, { trace_id: traceId });
  }

  const mediaUrl = (doc && (doc.source_url || doc.media_url)) || '';
  const status = risky ? 'risky' : (errcode === 0 ? 'pass' : 'error');

  if (doc) {
    await db.updateOne(COLLECTION, { trace_id: traceId }, {
      status,
      suggest: suggest || '',
      isrisky: isrisky != null ? Number(isrisky) : null,
      errcode,
      detail: event.detail || null,
      result,
      updated_at: new Date()
    });
  } else {
    console.warn('[mediaCheck] result without pending record', traceId, suggest);
  }

  if (risky && mediaUrl) {
    removeRiskyMedia(mediaUrl);
    if (doc && doc.media_url && doc.media_url !== mediaUrl) {
      oss.deleteStoredMedia(doc.media_url);
    }
    console.warn('[mediaCheck] removed risky media', mediaUrl, traceId);
  }

  return { handled: true, status, trace_id: traceId, media_url: mediaUrl };
}

module.exports = {
  moderateUploadedMedia,
  handleMediaCheckEvent,
  removeRiskyMedia,
  sceneForFolder
};
