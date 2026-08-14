const { isRemotePhoto, isLocalTempPath } = require('../../utils/photoPath');
const { uploadFileToServer } = require('../../utils/upload');
const { deriveVideoCoverUrl } = require('../../utils/mediaUrl');

const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;
const SKIP_COMPRESS_BELOW_BYTES = 20 * 1024 * 1024;
const VIDEO_TOO_LARGE_MSG = '视频过大，请换短一点的';
const VIDEO_UPLOAD_CONCURRENCY = 3;

function compressImage(filePath) {
  if (!filePath || isRemotePhoto(filePath)) {
    return Promise.resolve(filePath || '');
  }
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 80,
      compressedWidth: 1280,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath)
    });
  });
}

function getLocalFileSize(filePath) {
  if (!filePath || isRemotePhoto(filePath)) {
    return Promise.resolve(0);
  }
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(0)
    });
  });
}

function compressVideoOnce(filePath) {
  return new Promise((resolve) => {
    if (typeof wx.compressVideo !== 'function') {
      resolve(filePath);
      return;
    }
    wx.compressVideo({
      src: filePath,
      quality: 'medium',
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath)
    });
  });
}

function compressVideoIfNeeded(filePath) {
  if (!filePath || isRemotePhoto(filePath)) {
    return Promise.resolve(filePath || '');
  }
  return getLocalFileSize(filePath).then((size) => {
    if (size > 0 && size <= SKIP_COMPRESS_BELOW_BYTES) {
      return filePath;
    }
    return compressVideoOnce(filePath);
  });
}

function uploadToCloud(localPath, folder, forcedExt) {
  if (!localPath) return Promise.resolve('');
  if (isRemotePhoto(localPath)) return Promise.resolve(localPath);
  const ext = forcedExt || (localPath.split('.').pop() || 'jpg').split('?')[0];
  return uploadFileToServer(localPath, folder, ext)
    .catch((err) => {
      const msg = (err && (err.errMsg || err.message)) || '文件上传失败';
      return Promise.reject(new Error(msg));
    });
}

function buildFolder(storeId, orderId) {
  const store = (storeId || 'store').replace(/[^\w-]/g, '_');
  const order = (orderId || 'common').replace(/[^\w-]/g, '_');
  return `daily/${store}/${order}`;
}

function uploadDailyImages(images, storeId, orderId) {
  const folder = buildFolder(storeId, orderId);
  const list = (images || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);

  return Promise.all(list.map((image) => compressImage(image)
    .then((compressed) => uploadToCloud(compressed, folder))));
}

function uploadDailyVideo(videoPath, storeId, orderId, options = {}) {
  if (!videoPath) return Promise.resolve('');
  if (isRemotePhoto(videoPath)) return Promise.resolve(videoPath);
  const folder = buildFolder(storeId, orderId);
  const prepare = options.skipCompress
    ? Promise.resolve(videoPath)
    : compressVideoIfNeeded(videoPath);
  return prepare.then((compressedPath) => {
    return getLocalFileSize(compressedPath).then((size) => {
      if (size > MAX_VIDEO_UPLOAD_BYTES) {
        return Promise.reject(new Error(VIDEO_TOO_LARGE_MSG));
      }
      return uploadToCloud(compressedPath, folder);
    });
  });
}

function uploadDailyVideoCover(thumbPath, storeId, orderId) {
  if (!thumbPath) return Promise.resolve('');
  const folder = buildFolder(storeId, orderId);
  // 微信临时缩略图常无扩展名，强制 jpg，避免上传成错误后缀
  return compressImage(thumbPath)
    .then((compressed) => uploadToCloud(compressed, folder, 'jpg'));
}

function isVideoFilePath(localPath) {
  return /\.(mp4|mov|m4v|avi|mkv|webm)(\?|$)/i.test(localPath || '');
}

function shouldUploadVideoCover(videoPath, thumbPath) {
  if (!videoPath || !thumbPath || thumbPath === videoPath) return false;
  return !isVideoFilePath(thumbPath);
}

function isUploadedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  // 绝不能把微信临时路径当成已上传公网地址
  if (isLocalTempPath(url)) return false;
  return url.startsWith('https://')
    || url.startsWith('http://')
    || url.startsWith('cloud://');
}

function normalizeVideoInputs(videoOrVideos, videoThumbOrThumbs, videoSkipCompressOrFlags) {
  const videos = Array.isArray(videoOrVideos)
    ? videoOrVideos.filter(Boolean)
    : (videoOrVideos ? [videoOrVideos] : []);
  const thumbs = Array.isArray(videoThumbOrThumbs)
    ? videoThumbOrThumbs
    : (videoThumbOrThumbs ? [videoThumbOrThumbs] : []);
  const skipFlags = Array.isArray(videoSkipCompressOrFlags)
    ? videoSkipCompressOrFlags
    : videos.map(() => !!videoSkipCompressOrFlags);
  return { videos, thumbs, skipFlags };
}

function uploadOneDailyVideoPair(videoPath, thumbPath, storeId, orderId, skipCompress) {
  return Promise.all([
    uploadDailyVideo(videoPath, storeId, orderId, { skipCompress: !!skipCompress }),
    shouldUploadVideoCover(videoPath, thumbPath)
      ? uploadDailyVideoCover(thumbPath, storeId, orderId)
      : Promise.resolve('')
  ]).then(([uploadedVideo, uploadedCover]) => {
    if (videoPath && uploadedVideo && !isUploadedUrl(uploadedVideo)) {
      return Promise.reject(new Error('视频上传失败，请检查网络后重试'));
    }
    const safeVideo = uploadedVideo && isUploadedUrl(uploadedVideo) ? uploadedVideo : '';
    if (!safeVideo) {
      return Promise.reject(new Error('视频上传失败，请检查网络后重试'));
    }
    const safeCover = uploadedCover && isUploadedUrl(uploadedCover) ? uploadedCover : '';
    const fallbackCover = safeCover || deriveVideoCoverUrl(safeVideo) || '';
    return {
      video: safeVideo,
      videoCover: fallbackCover && isUploadedUrl(fallbackCover) ? fallbackCover : ''
    };
  });
}

function mapPool(items, concurrency, worker) {
  const list = items || [];
  if (!list.length) return Promise.resolve([]);
  const limit = Math.max(1, Math.min(concurrency || 1, list.length));
  const results = new Array(list.length);
  let nextIndex = 0;

  function runNext() {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= list.length) return Promise.resolve();
    return Promise.resolve()
      .then(() => worker(list[index], index))
      .then((result) => {
        results[index] = result;
        return runNext();
      });
  }

  const starters = [];
  for (let i = 0; i < limit; i += 1) {
    starters.push(runNext());
  }
  return Promise.all(starters).then(() => results);
}

function resolveUploadConcurrency() {
  return new Promise((resolve) => {
    if (typeof wx.getNetworkType !== 'function') {
      resolve(VIDEO_UPLOAD_CONCURRENCY);
      return;
    }
    wx.getNetworkType({
      success: (res) => {
        const type = String((res && res.networkType) || '').toLowerCase();
        if (type === 'wifi') {
          resolve(4);
          return;
        }
        if (type === '5g' || type === '4g') {
          resolve(3);
          return;
        }
        resolve(2);
      },
      fail: () => resolve(VIDEO_UPLOAD_CONCURRENCY)
    });
  });
}

function uploadDailyVideos(videoOrVideos, storeId, orderId, videoThumbOrThumbs, options = {}) {
  const { videos, thumbs, skipFlags } = normalizeVideoInputs(
    videoOrVideos,
    videoThumbOrThumbs,
    options.skipCompressFlags
  );
  if (!videos.length) {
    return Promise.resolve({ videos: [], videoCovers: [], video: '', videoCover: '' });
  }

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  let doneCount = 0;
  onProgress && onProgress({ done: 0, total: videos.length });

  return resolveUploadConcurrency().then((concurrency) => (
    mapPool(videos, concurrency, (videoPath, index) => {
      const prepare = typeof options.prepareItem === 'function'
        ? Promise.resolve()
          .then(() => options.prepareItem(index, videoPath))
          .then((ready) => ({
            path: (ready && ready.path) || videoPath,
            thumb: (ready && ready.thumb) || thumbs[index] || '',
            skipCompress: !!(ready && ready.skipCompress)
          }))
        : Promise.resolve({
          path: videoPath,
          thumb: thumbs[index] || '',
          skipCompress: !!skipFlags[index]
        });

      return prepare.then((ready) => uploadOneDailyVideoPair(
        ready.path,
        ready.thumb,
        storeId,
        orderId,
        ready.skipCompress
      )).then((pair) => {
        doneCount += 1;
        onProgress && onProgress({ done: doneCount, total: videos.length });
        return pair;
      });
    })
  )).then((pairs) => {
    const uploadedVideos = pairs.map((item) => item.video).filter(Boolean);
    const uploadedCovers = pairs.map((item) => item.videoCover);
    return {
      videos: uploadedVideos,
      videoCovers: uploadedCovers,
      video: uploadedVideos[0] || '',
      videoCover: uploadedCovers[0] || ''
    };
  });
}

function uploadDailyMedia(images, videoOrVideos, storeId, orderId, videoThumbOrThumbs, options = {}) {
  // 图片与视频并行上传，缩短总等待
  return Promise.all([
    uploadDailyImages(images, storeId, orderId),
    uploadDailyVideos(videoOrVideos, storeId, orderId, videoThumbOrThumbs, options)
  ]).then(([uploadedImages, videoResult]) => {
    const cloudImages = uploadedImages.filter((item) => isUploadedUrl(item));
    if ((images || []).filter(Boolean).length && !cloudImages.length) {
      return Promise.reject(new Error('图片上传失败，请检查网络后重试'));
    }
    return {
      images: cloudImages,
      ...videoResult
    };
  });
}

module.exports = {
  compressImage,
  compressVideoIfNeeded,
  getLocalFileSize,
  uploadDailyImages,
  uploadDailyVideo,
  uploadDailyVideoCover,
  uploadDailyVideos,
  uploadDailyMedia,
  MAX_VIDEO_UPLOAD_BYTES,
  VIDEO_TOO_LARGE_MSG
};
