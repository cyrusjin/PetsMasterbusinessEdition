const videoUrlCache = new Map();
const VIDEO_URL_TTL = 90 * 60 * 1000;

function isCloudFileId(url) {
  return typeof url === 'string' && url.startsWith('cloud://');
}

function resolveVideoUrl(source) {
  const fileID = (source || '').trim();
  if (!fileID) return Promise.resolve('');
  // HTTPS / 已解析地址直接返回；cloud:// 历史数据无法在自建后端解析
  if (!isCloudFileId(fileID)) return Promise.resolve(fileID);

  const cached = videoUrlCache.get(fileID);
  if (cached && cached.expireAt > Date.now()) {
    return Promise.resolve(cached.url);
  }

  console.warn('[mediaUrl] 仍为 cloud:// 地址，请迁移到 https://api.petmaster.me/media', fileID);
  return Promise.resolve(fileID);
}

function deriveVideoCoverUrl(videoUrl) {
  const source = (videoUrl || '').trim();
  if (!source) return '';
  if (/\.(mp4|mov|m4v|avi|mkv|webm)(\?.*)?$/i.test(source)) {
    return source.replace(/\.(mp4|mov|m4v|avi|mkv|webm)(\?.*)?$/i, '_cover.jpg');
  }
  return '';
}

function resolveVideoCoverUrl(videoUrl, storedCover) {
  const cover = (storedCover || '').trim();
  if (cover) return resolveVideoUrl(cover);
  const derived = deriveVideoCoverUrl(videoUrl);
  return derived ? Promise.resolve(derived) : Promise.resolve('');
}

function resolveVideoUrls(sources) {
  const list = (sources || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);
  return Promise.all(list.map((item) => resolveVideoUrl(item)));
}

function enrichLogsWithVideoUrls(logs) {
  const list = logs || [];
  if (!list.length) return Promise.resolve([]);

  return Promise.all(list.map((log) => {
    if (!log.video) {
      return { ...log, videoUrl: log.videoUrl || '', videoCoverUrl: log.videoCoverUrl || '' };
    }
    const videoPromise = log.videoUrl
      ? Promise.resolve(log.videoUrl)
      : resolveVideoUrl(log.video).then((videoUrl) => videoUrl || log.video);
    return videoPromise.then((videoUrl) => {
      if (log.videoCoverUrl) {
        return { ...log, videoUrl };
      }
      return resolveVideoCoverUrl(videoUrl, log.videoCover).then((videoCoverUrl) => ({
        ...log,
        videoUrl,
        videoCoverUrl: videoCoverUrl || ''
      }));
    });
  }));
}

module.exports = {
  resolveVideoUrl,
  resolveVideoUrls,
  deriveVideoCoverUrl,
  resolveVideoCoverUrl,
  enrichLogsWithVideoUrls
};
