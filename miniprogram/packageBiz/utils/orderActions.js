const { ORDER_STATUS } = require('../../utils/orderStatus');
const { getOrderServiceKind } = require('../../utils/dailyCheckable');

const USER_CANCEL_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.AWAITING_ARRIVAL
];

const USER_EDIT_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.AWAITING_ARRIVAL,
  ORDER_STATUS.BOARDING
];

function canUserCancelOrder(status) {
  return USER_CANCEL_STATUSES.includes(status);
}

function canUserEditOrder(status, order) {
  if (!USER_EDIT_STATUSES.includes(status)) return false;
  if (order && order.pricePendingConfirm) return false;
  const kind = getOrderServiceKind(order);
  if (kind === 'wash' || kind === 'homeFeeding') return false;
  return true;
}

function isOrderEditTimeOnly(status) {
  return status === ORDER_STATUS.BOARDING;
}

function canShowUserOrderActions(status, order) {
  return canUserCancelOrder(status) || canUserEditOrder(status, order);
}

function canMerchantModifyOrder(order) {
  return !!(order && !order.pricePendingConfirm && !order.editPendingConfirm);
}

module.exports = {
  USER_CANCEL_STATUSES,
  USER_EDIT_STATUSES,
  canUserCancelOrder,
  canUserEditOrder,
  isOrderEditTimeOnly,
  canShowUserOrderActions,
  canMerchantModifyOrder
};
