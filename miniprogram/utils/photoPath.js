/**
 * 图片路径判断（独立模块，避免 upload ↔ storePhotos 循环依赖）
 */

function isLocalTempPath(url) {
  if (!url || typeof url !== 'string') return false;
  const text = url.trim();
  return text.startsWith('wxfile://')
    || text.startsWith('http://tmp/')
    || text.startsWith('https://tmp/')
    || text.startsWith('http://usr/')
    || text.startsWith('https://usr/')
    || (text.startsWith('/') && !text.startsWith('//'));
}

function isRemotePhoto(url) {
  if (!url || typeof url !== 'string') return false;
  if (isLocalTempPath(url)) return false;
  return url.startsWith('cloud://') || url.startsWith('https://') || url.startsWith('http://');
}

function isCloudFileId(url) {
  return typeof url === 'string' && (
    url.startsWith('cloud://')
    || url.startsWith('https://')
    || url.startsWith('http://')
  ) && !isLocalTempPath(url);
}

module.exports = {
  isLocalTempPath,
  isRemotePhoto,
  isCloudFileId
};
