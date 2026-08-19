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
  const washProducts = Array.isArray(store.washProducts) ? store.washProducts.slice() : [];
  const washValueAddedServices = Array.isArray(store.washValueAddedServices)
    ? store.washValueAddedServices.slice()
    : [];
  const washProductPhotos = washProducts.map((item) => (item && item.photo) || '');
  const washVasPhotos = washValueAddedServices.map((item) => (item && item.photo) || '');
  const homeFeeding = store.homeFeeding && typeof store.homeFeeding === 'object'
    ? { ...store.homeFeeding }
    : null;
  const homeNoticePhotos = Array.isArray(homeFeeding && homeFeeding.noticePhotos)
    ? homeFeeding.noticePhotos.filter(Boolean)
    : [];
  const logo = store.logo || '';
  const remoteList = [
    logo,
    ...storePhotos,
    ...introPhotos,
    ...noticePhotos,
    ...washNoticePhotos,
    ...washProductPhotos,
    ...washVasPhotos,
    ...homeNoticePhotos
  ].filter((url) => url && (isCloudFileId(url) || isHttpUrl(url)));

  if (!remoteList.length) {
    return Promise.resolve({
      ...store,
      storePhotos,
      introPhotos,
      noticePhotos,
      washNoticePhotos,
      washProducts,
      washValueAddedServices,
      homeFeeding: homeFeeding
        ? { ...homeFeeding, noticePhotos: homeNoticePhotos }
        : store.homeFeeding,
      logo: logo || ''
    });
  }

  return Promise.all([
    resolveMediaUrls(storePhotos),
    resolveMediaUrls(introPhotos),
    resolveMediaUrls(noticePhotos),
    resolveMediaUrls(washNoticePhotos),
    resolveMediaUrls(washProductPhotos.filter(Boolean)),
    resolveMediaUrls(washVasPhotos.filter(Boolean)),
    resolveMediaUrls(homeNoticePhotos),
    logo ? resolveImageUrl(logo) : Promise.resolve('')
  ]).then(([
    resolvedPhotos,
    resolvedIntroPhotos,
    resolvedNoticePhotos,
    resolvedWashNoticePhotos,
    resolvedWashProductPhotos,
    resolvedWashVasPhotos,
    resolvedHomeNoticePhotos,
    resolvedLogo
  ]) => {
    let photoCursor = 0;
    const nextWashProducts = washProducts.map((item) => {
      if (!item || !item.photo) return item;
      const photo = resolvedWashProductPhotos[photoCursor] || item.photo;
      photoCursor += 1;
      return { ...item, photo };
    });
    let vasCursor = 0;
    const nextWashVas = washValueAddedServices.map((item) => {
      if (!item || !item.photo) return item;
      const photo = resolvedWashVasPhotos[vasCursor] || item.photo;
      vasCursor += 1;
      return { ...item, photo };
    });
    return {
      ...store,
      storePhotos: resolvedPhotos.filter(Boolean),
      introPhotos: resolvedIntroPhotos.filter(Boolean),
      noticePhotos: resolvedNoticePhotos.filter(Boolean),
      washNoticePhotos: resolvedWashNoticePhotos.filter(Boolean),
      washProducts: nextWashProducts,
      washValueAddedServices: nextWashVas,
      homeFeeding: homeFeeding
        ? { ...homeFeeding, noticePhotos: resolvedHomeNoticePhotos.filter(Boolean) }
        : store.homeFeeding,
      logo: resolvedLogo || logo || ''
    };
  });
}

module.exports = {
  isCloudFileId,
  isHttpUrl,
  resolveMediaUrl,
  resolveMediaUrls,
  resolveStoreDisplayUrls
};
