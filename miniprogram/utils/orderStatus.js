const ORDER_STATUS = {
  PENDING: 'pending',
  AWAITING_ARRIVAL: 'awaiting_arrival',
  BOARDING: 'boarding',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  CONFIRMED: 'confirmed',
  TO_PAY: 'toPay'
};

const STATUS_LABELS = {
  pending: '待确认',
  awaiting_arrival: '待到店',
  confirmed: '待签协议',
  boarding: '寄养中',
  toPay: '待支付',
  completed: '已完成',
  cancelled: '已取消'
};

function formatOrderStatus(status) {
  return STATUS_LABELS[status] || status || '--';
}

function isBoardingActive(status) {
  return status === ORDER_STATUS.BOARDING;
}

function isAwaitingArrival(status) {
  return status === ORDER_STATUS.AWAITING_ARRIVAL;
}

function isInStayPipeline(status) {
  return status === ORDER_STATUS.BOARDING || status === ORDER_STATUS.AWAITING_ARRIVAL;
}

function isBeforeBoarding(status) {
  return [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.AWAITING_ARRIVAL].includes(status);
}

module.exports = {
  ORDER_STATUS,
  STATUS_LABELS,
  formatOrderStatus,
  isBoardingActive,
  isAwaitingArrival,
  isInStayPipeline,
  isBeforeBoarding
};
