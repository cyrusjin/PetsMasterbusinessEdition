const {
  isCloudFileId,
  isHttpUrl,
  resolveImageUrl,
  resolveImageUrls
} = require('./imageCache');

function resolveMediaUrl(fileID) {
  return resolveImageUrl(fileID || '');
}

function resolveMediaUrls(urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);
  return resolveImageUrls(list);
}

function resolveStoreDisplayUrls(store) {
  if (!store) return Promise.resolve(null);

  const storePhotos = Array.isArray(store.storePhotos) ? store.storePhotos.filter(Boolean) : [];
  const introPhotos = Array.isArray(store.introPhotos) ? store.introPhotos.filter(Boolean) : [];
  const noticePhotos = Array.isArray(store.noticePhotos) ? store.noticePhotos.filter(Boolean) : [];
  const washNoticePhotos = Array.isArray(store.washNoticePhotos)
    ? store.washNoticePhotos.filter(Boolean)
    : [];
  const logo = store.logo || '';
  const remoteList = [logo, ...storePhotos, ...introPhotos, ...noticePhotos, ...washNoticePhotos]
    .filter((url) => url && (isCloudFileId(url) || isHttpUrl(url)));

  if (!remoteList.length) {
    return Promise.resolve({
      ...store,
      storePhotos,
      introPhotos,
      noticePhotos,
      washNoticePhotos,
      logo: logo || ''
    });
  }

  return Promise.all([
    resolveMediaUrls(storePhotos),
    resolveMediaUrls(introPhotos),
    resolveMediaUrls(noticePhotos),
    resolveMediaUrls(washNoticePhotos),
    logo ? resolveImageUrl(logo) : Promise.resolve('')
  ]).then(([
    resolvedPhotos,
    resolvedIntroPhotos,
    resolvedNoticePhotos,
    resolvedWashNoticePhotos,
    resolvedLogo
  ]) => ({
    ...store,
    storePhotos: resolvedPhotos.filter(Boolean),
    introPhotos: resolvedIntroPhotos.filter(Boolean),
    noticePhotos: resolvedNoticePhotos.filter(Boolean),
    washNoticePhotos: resolvedWashNoticePhotos.filter(Boolean),
    logo: resolvedLogo || logo || ''
  }));
}

module.exports = {
  isCloudFileId,
  isHttpUrl,
  resolveMediaUrl,
  resolveMediaUrls,
  resolveStoreDisplayUrls
};
