const { callApiService } = require('./api');
const { getPromotionContext } = require('./growth');

function callOrderService(action, data = {}) {
  return callApiService('orderService', { action, ...data });
}

function createOrder(order, userProfile) {
  const context = getPromotionContext();
  const payload = context && context.store_id && context.store_id === String(order && order.store_id || '').trim()
    ? { ...order, promotion: { shareCode: context.shareCode, source: context.source } }
    : order;
  return callOrderService('createOrder', { order: payload, userProfile });
}

function listUserOrders() {
  return callOrderService('listUserOrders');
}

function listMerchantOrders(storeId) {
  return callOrderService('listMerchantOrders', { store_id: storeId });
}

function updateOrder(orderId, updates) {
  return callOrderService('updateOrder', { order_id: orderId, updates });
}

function getProxyOrderClaim(data) {
  return callOrderService('getProxyOrderClaim', data);
}

function claimProxyOrders(data) {
  return callOrderService('claimProxyOrders', data);
}

module.exports = {
  createOrder,
  listUserOrders,
  listMerchantOrders,
  updateOrder,
  getProxyOrderClaim,
  claimProxyOrders
};
