const { callApiService, rejectOnFailure } = require('../../utils/api');

function callStoreMembership(action, data = {}) {
  return callApiService('storeService', { action, ...data });
}

function getMembershipStatus(storeId) {
  return callStoreMembership('getMembershipStatus', { store_id: storeId || '' })
    .then((res) => rejectOnFailure(res, '加载会员信息失败'));
}

function createMembershipPay(storeId) {
  return callStoreMembership('createMembershipPay', { store_id: storeId || '' })
    .then((res) => rejectOnFailure(res, '创建支付失败'));
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

/**
 * 接单/到店因免费额度拦截时引导开通会员
 * @returns {boolean} 是否已按会员错误处理
 */
function handleMembershipRequiredError(err, options = {}) {
  if (!isMembershipRequiredError(err)) return false;
  // 会员功能未上线：静默忽略专属提示（服务端 enabled=false 时本不应走到这里）
  if (options.forcePrompt !== true) {
    return true;
  }
  const res = err.response || err;
  const membership = (res && res.membership) || {};
  const limit = membership.freeDogLimit != null ? membership.freeDogLimit : 5;
  const content = (res && res.errMsg)
    || `免费版同时寄养中最多 ${limit} 只，开通会员后可无限接待`;
  const pageUrl = options.pageUrl || getMembershipPageUrl();
  wx.showModal({
    title: '需要开通会员',
    content,
    confirmText: options.showEntry === false ? '知道了' : '去开通',
    showCancel: options.showEntry !== false,
    cancelText: '取消',
    success: (r) => {
      if (r.confirm && options.showEntry !== false) {
        wx.navigateTo({ url: pageUrl });
      }
    }
  });
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
  queryMembershipPay,
  isMembershipRequiredError,
  handleMembershipRequiredError,
  getMembershipPageUrl,
  requestMembershipPayment,
  pollMembershipPaid
};
