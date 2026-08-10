const { isCloudFileId } = require('./imageCache');
const { resolveImageUrl } = require('./imageCache');
const { resolveVideoUrl } = require('./mediaUrl');

function resolveImageForPreview(url) {
  const source = (url || '').trim();
  if (!source) return Promise.resolve('');
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('wxfile://')) {
    return Promise.resolve(source);
  }
  if (isCloudFileId(source)) {
    return resolveVideoUrl(source).then((tempUrl) => tempUrl || resolveImageUrl(source));
  }
  return resolveImageUrl(source);
}

function resolveVideoForPreview(url) {
  const source = (url || '').trim();
  if (!source) return Promise.resolve('');
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return Promise.resolve(source);
  }
  return resolveVideoUrl(source);
}

function previewImages(currentUrl, urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return Promise.resolve(false);

  return Promise.all(list.map((item) => resolveImageForPreview(item)))
    .then((resolved) => {
      const valid = resolved.filter(Boolean);
      if (!valid.length) {
        wx.showToast({ title: '图片加载失败', icon: 'none' });
        return false;
      }
      const index = list.indexOf(currentUrl);
      wx.previewImage({
        current: valid[index >= 0 ? index : 0] || valid[0],
        urls: valid
      });
      return true;
    });
}

function previewVideo(source, sources, currentIndex) {
  const list = (Array.isArray(sources) && sources.length
    ? sources
    : [source]
  ).filter(Boolean);
  if (!list.length) return Promise.resolve(false);

  return Promise.all(list.map((item) => resolveVideoForPreview(item)))
    .then((resolved) => {
      const valid = resolved.filter(Boolean);
      if (!valid.length) {
        wx.showToast({ title: '视频加载失败', icon: 'none' });
        return false;
      }
      if (!wx.previewMedia) {
        wx.showToast({ title: '当前版本不支持视频预览', icon: 'none' });
        return false;
      }
      const preferred = (source || '').trim();
      let index = Number(currentIndex);
      if (!Number.isFinite(index) || index < 0) {
        index = preferred ? list.indexOf(preferred) : 0;
      }
      if (index < 0 || index >= valid.length) index = 0;
      wx.previewMedia({
        sources: valid.map((url) => ({ url, type: 'video' })),
        current: index
      });
      return true;
    });
}

module.exports = {
  resolveImageForPreview,
  resolveVideoForPreview,
  previewImages,
  previewVideo
};
