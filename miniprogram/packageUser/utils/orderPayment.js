const { callApiService, rejectOnFailure } = require('../../utils/api');

function call(action, data) {
  return callApiService('orderService', { action, ...data }).then((result) => rejectOnFailure(result, '支付操作失败'));
}

function query(orderId) { return call('queryOrderPayment', { order_id: orderId }); }
function requestRefund(orderId) { return call('requestOrderRefund', { order_id: orderId }); }

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

function poll(orderId, attempts = 5) {
  return query(orderId).then((result) => {
    if (['paid', 'refunding', 'refunded', 'partial_refunded'].includes(result.payment.status)) return result;
    if (attempts <= 1) throw new Error('支付结果确认中，请稍后点“刷新支付状态”，不要重复付款');
    return new Promise((resolve) => setTimeout(resolve, 1200)).then(() => poll(orderId, attempts - 1));
  });
}

async function pay(orderId) {
  const result = await call('createOrderPayment', { order_id: orderId });
  if (result.payment.status === 'paid') return result;
  if (!result.payParams || !result.payParams.paySign) throw new Error('支付参数未就绪');
  await new Promise((resolve, reject) => wx.requestPayment({
    ...result.payParams,
    success: resolve,
    fail: (error) => reject(new Error(/cancel/i.test(error.errMsg || '') ? '已取消支付，可稍后继续' : '支付未完成，请刷新状态后重试'))
  }));
  return poll(orderId);
}

module.exports = { pay, query, requestRefund, paymentLabel };
