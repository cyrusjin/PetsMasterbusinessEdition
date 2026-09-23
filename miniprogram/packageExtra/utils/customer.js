const { callApiService } = require('../../utils/api');

function callCustomerService(action, data = {}) {
  return callApiService('customerService', { action, ...data });
}

module.exports = {
  saveCustomer: (data) => callCustomerService('saveCustomer', data),
  customerLedger: (data) => callCustomerService('customerLedger', data),
  consumeCustomerBalance: (data) => callCustomerService('consumeCustomerBalance', data),
  listCustomers: (data) => callCustomerService('listCustomers', data),
  rechargeCustomer: (data) => callCustomerService('rechargeCustomer', data),
  issueCustomerCoupon: (data) => callCustomerService('issueCustomerCoupon', data),
  redeemCustomerCoupon: (data) => callCustomerService('redeemCustomerCoupon', data)
};
