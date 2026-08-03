const { uploadFileToServer } = require('./upload');
const { isCloudFileId, isLocalTempPath, isRemotePhoto } = require('./photoPath');

const MAX_STORE_PHOTOS = 5;
const MAX_INTRO_PHOTOS = 5;
const MAX_NOTICE_PHOTOS = 5;
/** 微信 textarea 默认 140；介绍/须知统一放宽到 1000 */
const MAX_INTRO_TEXT = 1000;
const MAX_NOTICE_TEXT = 1000;
const MAX_PICKUP_NOTICE_TEXT = 1000;

function normalizePhotoList(photos, maxCount) {
  const max = Number.isInteger(maxCount) && maxCount > 0 ? maxCount : MAX_STORE_PHOTOS;
  if (!Array.isArray(photos)) return [];
  return photos
    .filter((item) => typeof item === 'string' && item)
    .filter((item) => isCloudFileId(item) || isLocalTempPath(item) || isRemotePhoto(item))
    .slice(0, max);
}

function normalizeStorePhotos(photos) {
  return normalizePhotoList(photos, MAX_STORE_PHOTOS);
}

function normalizeIntroPhotos(photos) {
  return normalizePhotoList(photos, MAX_INTRO_PHOTOS);
}

function normalizeNoticePhotos(photos) {
  return normalizePhotoList(photos, MAX_NOTICE_PHOTOS);
}

function reorderPhotoList(photos, fromIndex, toIndex, maxCount) {
  const list = normalizePhotoList(photos, maxCount);
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) {
    return list;
  }
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function reorderStorePhotos(photos, fromIndex, toIndex) {
  return reorderPhotoList(photos, fromIndex, toIndex, MAX_STORE_PHOTOS);
}

function uploadPhotoList(photos, fallbackPhotos, folder, maxCount) {
  const list = normalizePhotoList(photos, maxCount);
  if (!list.length) return Promise.resolve([]);

  const fallback = normalizePhotoList(fallbackPhotos || [], maxCount);

  const tasks = list.map((photo, index) => {
    if (isRemotePhoto(photo) && !isLocalTempPath(photo)) return Promise.resolve(photo);

    if (isLocalTempPath(photo)) {
      const ext = (photo.split('.').pop() || 'jpg').split('?')[0];
      return uploadFileToServer(photo, folder, ext).then((url) => {
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

function uploadStorePhotos(photos, fallbackPhotos) {
  return uploadPhotoList(photos, fallbackPhotos, 'store-photos', MAX_STORE_PHOTOS);
}

function uploadIntroPhotos(photos, fallbackPhotos) {
  return uploadPhotoList(photos, fallbackPhotos, 'intro-photos', MAX_INTRO_PHOTOS);
}

function uploadNoticePhotos(photos, fallbackPhotos) {
  return uploadPhotoList(photos, fallbackPhotos, 'notice-photos', MAX_NOTICE_PHOTOS);
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

function normalizeBusinessLicense(url) {
  if (!url || typeof url !== 'string') return '';
  const text = url.trim();
  if (!text) return '';
  if (isCloudFileId(text) || isLocalTempPath(text) || isRemotePhoto(text)) return text;
  return '';
}

function uploadBusinessLicense(license, fallbackLicense) {
  const next = normalizeBusinessLicense(license);
  if (!next) return Promise.resolve('');
  if (isRemotePhoto(next) && !isLocalTempPath(next)) return Promise.resolve(next);
  if (isLocalTempPath(next)) {
    const ext = (next.split('.').pop() || 'jpg').split('?')[0];
    return uploadFileToServer(next, 'store-licenses', ext).then((url) => {
      if (!isRemotePhoto(url)) {
        return Promise.reject(new Error('营业执照上传失败，请重试'));
      }
      return url;
    });
  }
  const fallback = normalizeBusinessLicense(fallbackLicense);
  if (isRemotePhoto(fallback)) return Promise.resolve(fallback);
  return Promise.resolve('');
}

module.exports = {
  MAX_STORE_PHOTOS,
  MAX_INTRO_PHOTOS,
  MAX_NOTICE_PHOTOS,
  MAX_INTRO_TEXT,
  MAX_NOTICE_TEXT,
  MAX_PICKUP_NOTICE_TEXT,
  isCloudFileId,
  isLocalTempPath,
  isRemotePhoto,
  normalizePhotoList,
  normalizeStorePhotos,
  normalizeIntroPhotos,
  normalizeNoticePhotos,
  reorderPhotoList,
  reorderStorePhotos,
  uploadStorePhotos,
  uploadIntroPhotos,
  uploadNoticePhotos,
  uploadStoreLogo,
  normalizeBusinessLicense,
  uploadBusinessLicense
};
