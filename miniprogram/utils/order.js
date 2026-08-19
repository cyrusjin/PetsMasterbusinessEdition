const { callApiService } = require('./api');

function callOrderService(action, data = {}) {
  return callApiService('orderService', { action, ...data });
}

function createOrder(order, userProfile) {
  return callOrderService('createOrder', { order, userProfile });
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
