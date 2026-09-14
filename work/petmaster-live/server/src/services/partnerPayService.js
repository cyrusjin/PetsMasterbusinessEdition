const config = require('../config').orderPayments;
const client = require('./wechatPayService').createClient(config);
const enc = encodeURIComponent;
const merchant = () => config.wechatPay.mchId;
module.exports = {
  ready: () => config.enabled && client.credentialsReady(),
  appId: () => config.appId,
  mchId: merchant,
  buildPayment: client.buildMiniProgramPayment,
  parseNotification: client.parseNotification,
  create: (p) => client.request('POST', '/v3/pay/partner/transactions/jsapi', {
    sp_appid: config.appId, sp_mchid: merchant(), sub_mchid: p.subMchId,
    description: p.description, out_trade_no: p.tradeNo,
    notify_url: config.wechatPay.notifyUrl,
    time_expire: new Date(p.expiresAt).toISOString(),
    amount: { total: p.amountFen, currency: 'CNY' }, payer: { sp_openid: p.payerOpenid }
  }),
  query: (p) => client.request('GET', `/v3/pay/partner/transactions/out-trade-no/${enc(p.tradeNo)}?sp_mchid=${enc(merchant())}&sub_mchid=${enc(p.subMchId)}`),
  close: (p) => client.request('POST', `/v3/pay/partner/transactions/out-trade-no/${enc(p.tradeNo)}/close`, { sp_mchid: merchant(), sub_mchid: p.subMchId }),
  refund: (p) => client.request('POST', '/v3/refund/domestic/refunds', {
    sub_mchid: p.subMchId, out_trade_no: p.tradeNo, out_refund_no: p.refundNo,
    reason: '商家确认整单退款', amount: { refund: p.amountFen, total: p.amountFen, currency: 'CNY' }
  }),
  queryRefund: (p) => client.request('GET', `/v3/refund/domestic/refunds/${enc(p.refundNo)}?sub_mchid=${enc(p.subMchId)}`),
  queryApplication: (id) => client.request('GET', `/v3/applyment4sub/applyment/applyment_id/${enc(id)}`)
};
