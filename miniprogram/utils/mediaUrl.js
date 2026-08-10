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

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

/** 兼容旧单字段与新 videos[] / videoUrls[] */
function normalizeLogVideos(log = {}) {
  const videos = asList(
    (Array.isArray(log.videos) && log.videos.length) ? log.videos : log.video
  );
  const resolvedUrls = asList(
    (Array.isArray(log.videoUrls) && log.videoUrls.length) ? log.videoUrls : log.videoUrl
  );
  const urls = resolvedUrls.length ? resolvedUrls : videos;
  const covers = asList(
    (Array.isArray(log.videoCoverUrls) && log.videoCoverUrls.length)
      ? log.videoCoverUrls
      : ((Array.isArray(log.videoCovers) && log.videoCovers.length)
        ? log.videoCovers
        : (log.videoCoverUrl || log.videoCover))
  );
  const videoItems = urls.map((url, index) => ({
    url,
    coverUrl: covers[index] || deriveVideoCoverUrl(url) || ''
  }));
  return {
    videos,
    videoUrls: urls,
    videoCovers: covers,
    videoCoverUrls: videoItems.map((item) => item.coverUrl),
    videoItems,
    video: videos[0] || '',
    videoUrl: urls[0] || '',
    videoCover: covers[0] || '',
    videoCoverUrl: videoItems[0] ? videoItems[0].coverUrl : ''
  };
}

function enrichLogsWithVideoUrls(logs) {
  const list = logs || [];
  if (!list.length) return Promise.resolve([]);

  return Promise.all(list.map((log) => {
    const normalized = normalizeLogVideos(log);
    if (!normalized.videos.length && !normalized.videoUrls.length) {
      return {
        ...log,
        ...normalized,
        videoUrl: '',
        videoCoverUrl: '',
        videoUrls: [],
        videoCoverUrls: [],
        videoItems: []
      };
    }

    const sourceList = normalized.videos.length ? normalized.videos : normalized.videoUrls;
    return resolveVideoUrls(sourceList).then((videoUrls) => {
      const urls = videoUrls.filter(Boolean);
      return Promise.all(urls.map((videoUrl, index) => (
        resolveVideoCoverUrl(videoUrl, normalized.videoCovers[index] || normalized.videoCoverUrls[index] || '')
      ))).then((videoCoverUrls) => {
        const videoItems = urls.map((url, index) => ({
          url,
          coverUrl: videoCoverUrls[index] || deriveVideoCoverUrl(url) || ''
        }));
        return {
          ...log,
          videos: sourceList,
          videoCovers: normalized.videoCovers,
          videoUrls: urls,
          videoCoverUrls: videoItems.map((item) => item.coverUrl),
          videoItems,
          video: sourceList[0] || '',
          videoUrl: urls[0] || '',
          videoCover: normalized.videoCovers[0] || '',
          videoCoverUrl: videoItems[0] ? videoItems[0].coverUrl : ''
        };
      });
    });
  }));
}

module.exports = {
  resolveVideoUrl,
  resolveVideoUrls,
  deriveVideoCoverUrl,
  resolveVideoCoverUrl,
  normalizeLogVideos,
  enrichLogsWithVideoUrls
};
