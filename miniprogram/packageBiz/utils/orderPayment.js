const { callApiService, rejectOnFailure } = require('../../utils/api');

function call(action, data) {
  return callApiService('orderService', { action, ...data }).then((result) => rejectOnFailure(result, '支付操作失败'));
}

function query(orderId) {
  return call('queryOrderPayment', { order_id: orderId });
}

function refund(orderId) {
  return call('refundOrderPayment', { order_id: orderId, confirmFullRefund: true });
}

function paymentLabel(order) {
  if (!order || order.paymentMode !== 'online') return '按门店约定结算';
  const payment = order.payment || {};
  if (payment.refundRequested && payment.status === 'paid') return '已申请退款，待商家处理';
  const labels = { paid: '已支付', pending: '待支付', refunding: '退款处理中', refunded: '已退款', partial_refunded: '退款待核对', refund_failed: '退款异常，待处理' };
  if (labels[payment.status]) return labels[payment.status];
  if (order.status === 'cancelled') return '已取消，未付款';
  if (!payment.confirmedAt) return '待商家确认后付款';
  if (Number(order.totalFee) === 0) return '无需支付';
  return '待支付';
}

module.exports = { query, refund, paymentLabel };
