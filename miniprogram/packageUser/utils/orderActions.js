const { ORDER_STATUS } = require('../../utils/orderStatus');

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

function canUserEditOrder(status) {
  return USER_EDIT_STATUSES.includes(status);
}

function isOrderEditTimeOnly(status) {
  return status === ORDER_STATUS.BOARDING;
}

function canShowUserOrderActions(status) {
  return canUserCancelOrder(status) || canUserEditOrder(status);
}

function canMerchantModifyOrder(order) {
  return !!(order && !order.pricePendingConfirm);
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
