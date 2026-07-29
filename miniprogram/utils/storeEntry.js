const MERCHANT_APP_ID = 'wx327ccf77cdedc252';

function isFromMerchantShare(options) {
  const ref = options && options.referrerInfo;
  return !!(ref && ref.appId === MERCHANT_APP_ID);
}

function resolveEntryStoreId(app, options) {
  if (!app || !options) return '';
  const fromQuery = app.extractStoreIdFromOptions(options);
  if (fromQuery) return fromQuery;
  const extra = options.referrerInfo && options.referrerInfo.extraData;
  if (extra && extra.store_id) return String(extra.store_id).trim();
  return '';
}

/** 分享带 store_id 进入：一律强制换绑并刷新 */
function shouldRefreshStoreEntry(app, storeId, options) {
  if (!storeId) return false;
  return true;
}

function enterStoreAndRefresh(app, storeId, options = {}) {
  if (!storeId) return Promise.resolve(null);
  const prevId = app.getStoreId ? app.getStoreId() : '';
  const forceData = shouldRefreshStoreEntry(app, storeId, options) || storeId !== prevId;
  return app.enterUserStore(storeId, { forceData: true })
    .then((store) => Promise.all([
      // 首页只需订单+宠物；动态日志后台补，不串行阻塞首屏
      app.syncUserFeed({ force: forceData, skipDailyLogs: true }),
      app.loadPets({ force: forceData })
    ]).then(() => ({ store: store || app.getCurrentStore(), prevId, storeId })));
}

module.exports = {
  MERCHANT_APP_ID,
  isFromMerchantShare,
  resolveEntryStoreId,
  shouldRefreshStoreEntry,
  enterStoreAndRefresh
};
