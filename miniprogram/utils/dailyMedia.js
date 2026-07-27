const { isRemotePhoto, isLocalTempPath } = require('./storePhotos');
const { uploadFileToServer } = require('./upload');
const { deriveVideoCoverUrl } = require('./mediaUrl');

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

function uploadDailyVideo(videoPath, storeId, orderId) {
  if (!videoPath) return Promise.resolve('');
  const folder = buildFolder(storeId, orderId);
  return uploadToCloud(videoPath, folder);
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

function uploadDailyMedia(images, video, storeId, orderId, videoThumb) {
  return uploadDailyImages(images, storeId, orderId)
    .then((uploadedImages) => {
      const cloudImages = uploadedImages.filter((item) => isUploadedUrl(item));
      if ((images || []).filter(Boolean).length && !cloudImages.length) {
        return Promise.reject(new Error('图片上传失败，请检查网络后重试'));
      }
      return Promise.all([
        uploadDailyVideo(video, storeId, orderId),
        video && shouldUploadVideoCover(video, videoThumb)
          ? uploadDailyVideoCover(videoThumb, storeId, orderId)
          : Promise.resolve('')
      ]).then(([uploadedVideo, uploadedCover]) => {
        if (video && uploadedVideo && !isUploadedUrl(uploadedVideo)) {
          return Promise.reject(new Error('视频上传失败，请检查网络后重试'));
        }
        const safeVideo = uploadedVideo && isUploadedUrl(uploadedVideo) ? uploadedVideo : '';
        const safeCover = uploadedCover && isUploadedUrl(uploadedCover) ? uploadedCover : '';
        // 无本地缩略图时，回退到服务端按视频派生的 _cover.jpg（上传接口会同步抽帧）
        const fallbackCover = safeCover || (safeVideo ? deriveVideoCoverUrl(safeVideo) : '');
        return {
          images: cloudImages,
          video: safeVideo,
          videoCover: fallbackCover && isUploadedUrl(fallbackCover) ? fallbackCover : ''
        };
      });
    });
}

module.exports = {
  compressImage,
  uploadDailyImages,
  uploadDailyVideo,
  uploadDailyVideoCover,
  uploadDailyMedia
};
