const merchantDemo = require('./merchantDemo');

const MERCHANT_ORDERS_POLL_MS = 60 * 1000;

function refreshUserOrders(app, options = {}) {
  const force = !!(options && options.force);
  const skipDailyLogs = !!(options && options.skipDailyLogs);
  return app.ensureCloudAndLogin({ silent: !force })
    .then(() => app.syncUserFeed({ force, skipDailyLogs }));
}

function refreshMerchantOrders(app, options = {}) {
  const force = !!(options && options.force);
  if (app.isMerchantDemoMode()) {
    merchantDemo.ensureDemoData();
    return Promise.resolve(app.getOrders());
  }
  return app.ensureCloudAndLogin({ silent: !force })
    .then(() => {
      if (!app.canAccessMerchantBackend()) return null;
      return app.ensureMerchantStore().then((shop) => {
        if (!shop || !shop.store_id) return null;
        return app.loadOrders({ force });
      });
    });
}

function refreshSingleOrder(app, orderId, options = {}) {
  const force = !!(options && options.force);
  if (!orderId) return Promise.resolve(null);
  const loader = (app.isUserClientMode && app.isUserClientMode())
    ? refreshUserOrders(app, { force })
    : refreshMerchantOrders(app, { force });
  return loader.then(() => (
    app.getOrders().find((o) => o.id === orderId) || null
  ));
}

/** 商家端页面停留时定时拉订单；页面隐藏/卸载时务必 stop */
function startMerchantOrdersPoll(page, onTick, intervalMs) {
  stopMerchantOrdersPoll(page);
  if (!page || typeof onTick !== 'function') return;
  const ms = intervalMs || MERCHANT_ORDERS_POLL_MS;
  page._merchantOrdersPollTimer = setInterval(() => {
    if (page._merchantOrdersPolling) return;
    page._merchantOrdersPolling = true;
    Promise.resolve()
      .then(() => onTick())
      .catch((err) => {
        console.error('[商家轮询] 刷新失败', err);
      })
      .finally(() => {
        page._merchantOrdersPolling = false;
      });
  }, ms);
}

function stopMerchantOrdersPoll(page) {
  if (!page) return;
  if (page._merchantOrdersPollTimer) {
    clearInterval(page._merchantOrdersPollTimer);
    page._merchantOrdersPollTimer = null;
  }
  page._merchantOrdersPolling = false;
}

module.exports = {
  MERCHANT_ORDERS_POLL_MS,
  refreshUserOrders,
  refreshMerchantOrders,
  refreshSingleOrder,
  startMerchantOrdersPoll,
  stopMerchantOrdersPoll
};
