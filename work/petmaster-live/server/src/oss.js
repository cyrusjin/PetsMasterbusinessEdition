const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('./config');

const execFileAsync = promisify(execFile);
const VIDEO_EXT_PATTERN = /\.(mp4|mov|m4v|avi|mkv|webm)(\?|$)/i;

function ensureMediaRoot() {
  const root = config.media.root;
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function sanitizeObjectKey(objectKey) {
  const key = String(objectKey || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
  if (!key || key.includes('..')) {
    throw new Error('非法文件路径');
  }
  return key;
}

function absolutePathForKey(objectKey) {
  const key = sanitizeObjectKey(objectKey);
  const full = path.join(config.media.root, key);
  const root = path.resolve(config.media.root);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('非法文件路径');
  }
  return resolved;
}

function buildPublicUrl(objectKey) {
  const key = sanitizeObjectKey(objectKey);
  return `${config.media.publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

function isLocalTempMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const text = url.trim();
  return text.startsWith('wxfile://')
    || text.startsWith('http://tmp/')
    || text.startsWith('https://tmp/')
    || text.startsWith('http://usr/')
    || text.startsWith('https://usr/');
}

function isOssUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('cloud://')) return false;
  if (isLocalTempMediaUrl(url)) return false;
  if (url.startsWith('https://') || url.startsWith('http://')) return true;
  return false;
}

function isStoredMedia(url) {
  if (!url || typeof url !== 'string') return false;
  if (isLocalTempMediaUrl(url)) return false;
  return url.startsWith('cloud://')
    || url.startsWith('https://')
    || url.startsWith('http://');
}

function extractObjectKey(url) {
  if (!url || typeof url !== 'string') return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  try {
    const parsed = new URL(url);
    const basePath = new URL(config.media.publicBaseUrl).pathname.replace(/\/$/, '');
    let pathname = decodeURIComponent(parsed.pathname);
    if (basePath && pathname.startsWith(basePath + '/')) {
      pathname = pathname.slice(basePath.length + 1);
    } else {
      pathname = pathname.replace(/^\//, '');
    }
    return pathname;
  } catch (err) {
    return '';
  }
}

async function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('cloud://')) return '';
  return url;
}

function coverKeyForVideoKey(videoKey) {
  const parsed = path.posix.parse(String(videoKey || '').replace(/\\/g, '/'));
  const dir = parsed.dir ? `${parsed.dir}/` : '';
  return `${dir}${parsed.name}_cover.jpg`;
}

function isVideoMedia(url) {
  return VIDEO_EXT_PATTERN.test(String(url || ''));
}

async function ensureVideoCoverUrl(videoUrl) {
  if (!videoUrl || !isVideoMedia(videoUrl)) return '';

  const videoKey = extractObjectKey(videoUrl);
  if (!videoKey) return '';

  const coverKey = coverKeyForVideoKey(videoKey);
  const coverPath = absolutePathForKey(coverKey);
  if (fs.existsSync(coverPath)) {
    return buildPublicUrl(coverKey);
  }

  const videoPath = absolutePathForKey(videoKey);
  if (!fs.existsSync(videoPath)) return '';

  try {
    fs.mkdirSync(path.dirname(coverPath), { recursive: true });
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', '0.1',
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      coverPath
    ], { timeout: 30000 });
    if (fs.existsSync(coverPath)) {
      return buildPublicUrl(coverKey);
    }
  } catch (err) {
    console.warn('[oss] generate video cover failed', videoKey, err.message || err);
  }
  return '';
}

async function resolveVideoCoverUrl(videoUrl, storedCoverUrl) {
  // 拒绝微信临时路径等非法封面，避免挡住 ffmpeg 抽帧兜底
  const cover = storedCoverUrl && isStoredMedia(storedCoverUrl)
    ? await resolveMediaUrl(storedCoverUrl)
    : '';
  if (cover) return cover;
  return ensureVideoCoverUrl(videoUrl);
}

/** 兼容旧名：返回小程序直传本地 API 所需字段 */
function createPostPolicy(folder = 'uploads', ext = 'jpg') {
  ensureMediaRoot();
  const safeFolder = String(folder || 'uploads').replace(/^\/+|\/+$/g, '').replace(/\.\./g, '');
  const safeExt = String(ext || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const objectKey = `${safeFolder}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${safeExt}`;
  const host = `${config.media.apiPublicBaseUrl.replace(/\/$/, '')}/api/upload`;
  const publicUrl = buildPublicUrl(objectKey);
  const expireAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return {
    host,
    key: objectKey,
    publicUrl,
    expireAt,
    // 兼容旧客户端字段（本地上传不再使用）
    policy: '',
    OSSAccessKeyId: '',
    signature: '',
    success_action_status: '200'
  };
}

async function uploadBuffer(objectKey, buffer, contentType = 'application/octet-stream') {
  ensureMediaRoot();
  const fullPath = absolutePathForKey(objectKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return buildPublicUrl(objectKey);
}

function saveUploadedFile(objectKey, tempPath) {
  ensureMediaRoot();
  const fullPath = absolutePathForKey(objectKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.copyFileSync(tempPath, fullPath);
  try {
    fs.unlinkSync(tempPath);
  } catch (err) {
    // ignore cleanup errors
  }
  return buildPublicUrl(objectKey);
}

function deleteStoredMedia(urlOrKey) {
  const key = extractObjectKey(urlOrKey) || sanitizeObjectKey(urlOrKey);
  if (!key) return false;
  try {
    const fullPath = absolutePathForKey(key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
  } catch (err) {
    console.warn('[oss] delete media failed', key, err.message || err);
  }
  return false;
}

function mediaFileExists(urlOrKey) {
  const key = extractObjectKey(urlOrKey) || '';
  if (!key) return false;
  try {
    return fs.existsSync(absolutePathForKey(key));
  } catch (_) {
    return false;
  }
}

/** 生成符合 imgSecCheck 限制的临时压缩图（≤750x1334，尽量 <1MB） */
async function createImageCheckCopy(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('源图片不存在');
  }
  ensureMediaRoot();
  const tmpDir = path.join(config.media.root, '_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, `sec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`);
  const qualities = ['6', '8', '10', '12'];
  let lastErr = null;
  for (const q of qualities) {
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', sourcePath,
        '-vf', "scale='min(750,iw)':'min(1334,ih)':force_original_aspect_ratio=decrease",
        '-frames:v', '1',
        '-q:v', q,
        outPath
      ], { timeout: 30000 });
      if (!fs.existsSync(outPath)) continue;
      const size = fs.statSync(outPath).size;
      if (size > 0 && size <= 1024 * 1024) {
        return outPath;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    return outPath;
  }
  throw lastErr || new Error('生成审图压缩副本失败');
}

async function resolveMediaUrls(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const resolved = [];
  for (const url of list) {
    resolved.push(await resolveMediaUrl(url));
  }
  return resolved.filter(Boolean);
}

module.exports = {
  ensureMediaRoot,
  buildPublicUrl,
  isOssUrl,
  isStoredMedia,
  isVideoMedia,
  extractObjectKey,
  resolveMediaUrl,
  resolveMediaUrls,
  resolveVideoCoverUrl,
  ensureVideoCoverUrl,
  createPostPolicy,
  uploadBuffer,
  saveUploadedFile,
  deleteStoredMedia,
  mediaFileExists,
  createImageCheckCopy,
  absolutePathForKey
};
