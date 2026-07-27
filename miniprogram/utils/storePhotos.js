const { uploadFileToServer } = require('./upload');

const MAX_STORE_PHOTOS = 6;

function isCloudFileId(url) {
  return typeof url === 'string' && (
    url.startsWith('cloud://')
    || url.startsWith('https://')
    || url.startsWith('http://')
  ) && !isLocalTempPath(url);
}

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

function normalizeStorePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter((item) => typeof item === 'string' && item)
    .filter((item) => isCloudFileId(item) || isLocalTempPath(item) || isRemotePhoto(item))
    .slice(0, MAX_STORE_PHOTOS);
}

function uploadStorePhotos(photos, fallbackPhotos) {
  const list = normalizeStorePhotos(photos);
  if (!list.length) return Promise.resolve([]);

  const fallback = normalizeStorePhotos(fallbackPhotos || []);

  const tasks = list.map((photo, index) => {
    if (isRemotePhoto(photo) && !isLocalTempPath(photo)) return Promise.resolve(photo);

    if (isLocalTempPath(photo)) {
      const ext = (photo.split('.').pop() || 'jpg').split('?')[0];
      return uploadFileToServer(photo, 'store-photos', ext).then((url) => {
        if (!isRemotePhoto(url)) {
          return Promise.reject(new Error('图片上传失败'));
        }
        return url;
      });
    }

    const fallbackPhoto = fallback[index];
    if (isRemotePhoto(fallbackPhoto)) return Promise.resolve(fallbackPhoto);

    return Promise.reject(new Error('部分图片未上传成功，请重试'));
  });

  return Promise.all(tasks).then((uploaded) => {
    if (!uploaded.every(isRemotePhoto)) {
      return Promise.reject(new Error('部分图片未上传成功，请重试'));
    }
    return uploaded;
  });
}

function uploadStoreLogo(logo, fallbackLogo) {
  if (!logo) return Promise.resolve(logo || '');
  if (isRemotePhoto(logo) && !isLocalTempPath(logo)) return Promise.resolve(logo);
  if (isLocalTempPath(logo)) {
    const ext = (logo.split('.').pop() || 'png').split('?')[0];
    return uploadFileToServer(logo, 'store-logos', ext).then((url) => {
      if (!isRemotePhoto(url)) {
        return Promise.reject(new Error('店铺头像上传失败，请重试'));
      }
      return url;
    });
  }
  if (isRemotePhoto(fallbackLogo)) return Promise.resolve(fallbackLogo);
  return Promise.resolve(logo);
}

module.exports = {
  MAX_STORE_PHOTOS,
  isCloudFileId,
  isLocalTempPath,
  isRemotePhoto,
  normalizeStorePhotos,
  uploadStorePhotos,
  uploadStoreLogo
};
