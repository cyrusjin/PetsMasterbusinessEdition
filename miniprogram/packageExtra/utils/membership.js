const { callApiService, rejectOnFailure } = require('../../utils/api');

function callStoreMembership(action, data = {}) {
  return callApiService('storeService', { action, ...data });
}

function getMembershipStatus(storeId) {
  return callStoreMembership('getMembershipStatus', { store_id: storeId || '' })
    .then((res) => rejectOnFailure(res, '加载会员信息失败'));
}

function createMembershipPay(storeId, planCode) {
  return callStoreMembership('createMembershipPay', {
    store_id: storeId || '',
    plan_code: planCode || 'pro_monthly'
  })
    .then((res) => rejectOnFailure(res, '创建支付失败'));
}

function redeemMembershipCode(storeId, code) {
  return callStoreMembership('redeemMembershipCode', {
    store_id: storeId || '',
    code: String(code || '').trim().toUpperCase()
  }).then((res) => rejectOnFailure(res, '兑换失败'));
}

function queryMembershipPay(orderId) {
  return callStoreMembership('queryMembershipPay', { order_id: orderId || '' })
    .then((res) => rejectOnFailure(res, '查询支付结果失败'));
}

function isMembershipRequiredError(err) {
  if (!err) return false;
  if (err.errCode === 'MEMBERSHIP_REQUIRED') return true;
  const res = err.response || err;
  return !!(res && res.errCode === 'MEMBERSHIP_REQUIRED');
}

function getMembershipPageUrl() {
  return '/packageExtra/membership/membership';
}

function getPromotionTasks(storeId) {
  return callStoreMembership('getPromotionTasks', { store_id: storeId || '' })
    .then((res) => rejectOnFailure(res, '加载推广任务失败'));
}

function submitPromotionProof(storeId, taskCode, proofUrl) {
  return callStoreMembership('submitPromotionProof', {
    store_id: storeId || '',
    task_code: taskCode || '',
    proof_url: proofUrl || ''
  }).then((res) => rejectOnFailure(res, '提交审核失败'));
}

/** 试用或订阅到期时，直接进入会员订阅页。 */
function handleMembershipRequiredError(err) {
  if (!isMembershipRequiredError(err)) return false;
  wx.reLaunch({ url: `${getMembershipPageUrl()}?required=1` });
  return true;
}

function requestMembershipPayment(payment) {
  if (!payment || !payment.timeStamp || !payment.paySign) {
    return Promise.reject(new Error('支付参数无效'));
  }
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType || 'RSA',
      paySign: payment.paySign,
      success: resolve,
      fail: (err) => {
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) {
          const cancelErr = new Error('已取消支付');
          cancelErr.cancelled = true;
          reject(cancelErr);
          return;
        }
        reject(new Error((err && err.errMsg) || '支付失败'));
      }
    });
  });
}

function pollMembershipPaid(orderId, tries = 6) {
  let left = tries;
  const tick = () => queryMembershipPay(orderId).then((res) => {
    if (res.status === 'paid' || (res.membership && res.membership.active)) {
      return res;
    }
    if (['failed', 'closed', 'revoked', 'refunded'].includes(res.status)) {
      return Promise.reject(new Error(res.status === 'refunded' ? '该订单已退款' : '支付未完成，请重新发起'));
    }
    left -= 1;
    if (left <= 0) {
      return Promise.reject(new Error('支付结果确认超时，请稍后刷新会员页查看'));
    }
    return new Promise((resolve) => {
      setTimeout(() => resolve(tick()), 1200);
    });
  });
  return tick();
}

module.exports = {
  getMembershipStatus,
  createMembershipPay,
  redeemMembershipCode,
  queryMembershipPay,
  isMembershipRequiredError,
  handleMembershipRequiredError,
  getMembershipPageUrl,
  getPromotionTasks,
  submitPromotionProof,
  requestMembershipPayment,
  pollMembershipPaid
};
