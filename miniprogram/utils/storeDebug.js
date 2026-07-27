const TAG = '[用户端 store_id]';

function log(step, detail) {
  if (detail === undefined) {
    console.log(TAG, step);
    return;
  }
  console.log(TAG, step, detail);
}

function logShareConfig(type, config) {
  const storeId = extractStoreIdFromShare(config);
  console.log(TAG, `分享配置(${type})`, {
    ...config,
    hasStoreId: !!storeId,
    store_id: storeId || '(无)'
  });
}

function extractStoreIdFromShare(config) {
  if (!config) return '';
  if (config.path) {
    if (config.path.includes('store_id=')) {
      return decodeURIComponent(config.path.split('store_id=')[1].split('&')[0]);
    }
    return '';
  }
  if (config.query && String(config.query).includes('store_id=')) {
    return decodeURIComponent(String(config.query).split('store_id=')[1].split('&')[0]);
  }
  if (config.query && String(config.query).startsWith('store_')) {
    return decodeURIComponent(String(config.query));
  }
  return '';
}

function logEntryOptions(source, options) {
  const query = (options && options.query) || {};
  const scene = options && options.scene;
  log(`${source} 启动参数`, {
    path: options && options.path,
    scene,
    query,
    store_id: query.store_id || '',
    sceneParam: query.scene || ''
  });
}

function logStoreState(source, app) {
  const user = (app && app.globalData && app.globalData.userInfo) || {};
  log(`${source} 当前状态`, {
    localStoreId: app.getStoreId ? app.getStoreId() : '',
    userStoreId: user.store_id || '',
    storeName: (app.getUserStoreView && app.getUserStoreView())?.name || '',
    isMerchant: app.globalData?.isMerchant,
    storeVisitEntry: false
  });
}

module.exports = {
  TAG,
  log,
  logShareConfig,
  logEntryOptions,
  logStoreState,
  extractStoreIdFromShare
};
