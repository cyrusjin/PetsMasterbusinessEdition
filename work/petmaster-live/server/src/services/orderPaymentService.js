const crypto = require('crypto');
const db = require('../db');
const identity = require('./identity');
const pay = require('./partnerPayService');
const collection = require('./collectionService');
const newId = (prefix) => prefix + crypto.randomBytes(15).toString('hex');
const payableStatuses = ['confirmed', 'awaiting_arrival'];
function amountFen(order) {
  const amount = Number(order.totalFee);
  const fen = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(fen) || fen > 100000000 || Math.abs(amount * 100 - fen) > 0.00001) throw new Error('订单金额无效，请商家重新确认');
  return fen;
}
function publicPayment(order) {
  const p = order.payment || {};
  return { mode: order.paymentMode || 'offline', status: p.status || 'unpaid', amountFen: p.amountFen || 0,
    confirmedAt: order.paymentConfirmedAt || 0, paidAt: p.paidAt || 0,
    refundRequested: !!p.refundRequested, refundError: p.refundError || '',
    canPay: order.paymentMode === 'online' && !!order.paymentConfirmedAt && payableStatuses.includes(order.status)
      && !order.pricePendingConfirm && !order.editPendingConfirm && !['paid', 'refunding', 'refunded', 'partial_refunded', 'refund_failed'].includes(p.status)
      && Number(order.totalFee) > 0 };
}
// 所有本地订单修改和支付操作使用同一个持久化锁；网络请求最长 12 秒。
// 不自动夺取过期锁：进程异常后由运维确认无在途请求，再释放，避免资金竞态。
async function withOrderLock(id, fn) {
  if (!id) throw new Error('缺少订单编号');
  const token = newId('L');
  const now = Date.now();
  const result = await db.collection('orders').updateOne({
    order_id: id,
    $or: [
      { paymentLock: { $exists: false } },
      { paymentLockAt: { $lt: now - 2 * 60 * 1000 } }
    ]
  }, { $set: { paymentLock: token, paymentLockAt: now } });
  if (!result.matchedCount) throw new Error('订单不存在或正在处理，请稍后刷新重试');
  try { return await fn(); }
  finally { await db.collection('orders').updateOne({ order_id: id, paymentLock: token }, { $unset: { paymentLock: '', paymentLockAt: '' } }); }
}
async function getOrder(id) {
  const order = await db.findOne('orders', { order_id: id });
  if (!order) throw new Error('订单不存在');
  return order;
}
async function assertUser(order, openid) {
  const user = await identity.findPrimaryUserByOpenid(openid);
  const ids = user ? identity.collectOpenids(user) : [openid];
  if (!ids.includes(order.userOpenid)) throw new Error('无权支付或查看该订单');
  // 支付使用当前小程序对应 openid，不使用另一个 AppID 下的主账号 openid。
  return user && user.openids && user.openids.merchant || openid;
}
async function savePayment(order, patch) {
  const fields = {};
  Object.keys(patch).forEach((key) => { fields[`payment.${key}`] = patch[key]; });
  await db.updateById('orders', order._id, fields);
  order.payment = { ...(order.payment || {}), ...patch };
  return order;
}
function verifyTransaction(p, t) {
  if (t.out_trade_no !== p.tradeNo || t.sp_mchid !== p.spMchId || t.sub_mchid !== p.subMchId || t.sp_appid !== p.appId
    || !t.amount || t.amount.total !== p.amountFen || t.amount.currency !== 'CNY') throw new Error('微信支付交易身份或金额不匹配');
  if (t.trade_state === 'SUCCESS' && (!t.transaction_id || !t.payer || t.payer.sp_openid !== p.payerOpenid)) throw new Error('微信支付付款人不匹配');
}
async function settle(order, t) {
  const p = order.payment || {};
  verifyTransaction(p, t);
  if (t.trade_state === 'SUCCESS') {
    if (['paid', 'refunding', 'refunded', 'partial_refunded', 'refund_failed'].includes(p.status)) return order;
    return savePayment(order, { status: 'paid', transactionId: t.transaction_id, paidAt: Date.parse(t.success_time) || Date.now(), lastCheckedAt: Date.now() });
  }
  // 商户后台发生退款，也不能仍显示已全额付款；进入核对状态，禁止重复支付。
  if (t.trade_state === 'REFUND' && p.status !== 'refunded') {
    return savePayment(order, { status: p.refundNo ? 'refunding' : 'partial_refunded', lastCheckedAt: Date.now() });
  }
  if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(t.trade_state) && !['paid', 'refunding', 'refunded', 'partial_refunded', 'refund_failed'].includes(p.status)) {
    return savePayment(order, { status: 'closed', prepayId: '', lastRemoteState: t.trade_state, lastCheckedAt: Date.now() });
  }
  if (t.trade_state === 'NOTPAY') {
    return savePayment(order, { lastRemoteState: 'NOTPAY', lastCheckedAt: Date.now() });
  }
  return order;
}
async function reconcile(order) {
  const p = order.payment || {};
  if (!p.tradeNo) return order;
  if (p.refundNo && ['refunding', 'refund_failed'].includes(p.status)) {
    let r;
    try { r = await pay.queryRefund(p); }
    catch (err) {
      if (err.code !== 'RESOURCE_NOT_EXISTS') throw err;
      r = await pay.refund(p); // 固定退款单号，超时或重启后幂等重试
    }
    return settleRefund(order, r);
  }
  try { return await settle(order, await pay.query(p)); }
  catch (err) {
    if (err.code !== 'ORDER_NOT_EXIST') throw err;
    // 下单超时可能在微信侧仍处理中，保留原单号并幂等重试，不产生新单号。
    return savePayment(order, { lastRemoteState: 'NOT_EXIST', lastCheckedAt: Date.now() });
  }
}
async function closeUnpaid(order) {
  if (!(order.payment || {}).tradeNo) return order;
  order = await reconcile(order);
  const p = order.payment;
  if (['paid', 'refunding', 'refunded', 'partial_refunded', 'refund_failed'].includes(p.status)) throw new Error('订单已有付款，请通过退款流程处理');
  if (p.status === 'closed') return order;
  try { await pay.close(p); }
  catch (err) {
    if (!['ORDERCLOSED', 'ORDER_CLOSED'].includes(err.code)) {
      // ORDER_NOT_EXIST 不能视作安全关闭：另一请求可能仍在微信侧创建。
      throw new Error('原支付单尚未确认关闭，请稍后刷新重试');
    }
  }
  return savePayment(order, { status: 'closed', prepayId: '', createUncertain: false, lastRemoteState: 'CLOSED' });
}
async function createPayment(event, openid) {
  return withOrderLock(event.order_id, async () => {
    let order = await getOrder(event.order_id);
    const payerOpenid = await assertUser(order, openid);
    if (!pay.ready()) throw new Error('在线支付暂未开放，请联系门店');
    order = await reconcile(order);
    if ((order.payment || {}).status === 'paid') return { success: true, payment: publicPayment(order) };
    if (!publicPayment(order).canPay) throw new Error('请等待商家确认订单及金额后再支付');
    const total = amountFen(order);
    let p = order.payment || {};
    // 上次下单请求超时且微信侧已经生成未支付订单时，先关闭该订单，
    // 再使用新单号创建支付，避免“同号重试但拿不到 prepay_id”导致卡死。
    if (p.createUncertain && !p.prepayId && p.lastRemoteState === 'NOTPAY') {
      order = await closeUnpaid(order);
      p = order.payment;
    }
    if (p.tradeNo && (p.amountFen !== total || p.expiresAt <= Date.now() || p.payerOpenid !== payerOpenid)) {
      order = await closeUnpaid(order); p = order.payment;
    }
    if (!p.tradeNo || p.status === 'closed') {
      const previous = p.tradeNo ? { tradeNo: p.tradeNo, amountFen: p.amountFen, subMchId: p.subMchId, closedAt: Date.now() } : null;
      if (previous) await db.collection('orders').updateOne({ _id: order._id }, { $push: { paymentHistory: previous } });
      p = { status: 'pending', tradeNo: newId('P'), amountFen: total,
        subMchId: order.paymentSubMchId, appId: pay.appId(), spMchId: pay.mchId(), payerOpenid,
        expiresAt: Date.now() + 15 * 60000, description: `${order.storeName || '宠物门店'}-${order.serviceType || '服务订单'}`.slice(0, 100), prepayId: '' };
      if (!/^\d{8,32}$/.test(p.subMchId || '')) throw new Error('门店收款账户未配置');
      await savePayment(order, p); // 先持久化，后调用微信
    }
    if (!p.prepayId) {
      try {
        const remote = await pay.create(p);
        if (!remote.prepay_id) throw new Error('微信未返回支付凭据，请稍后重试');
        await savePayment(order, { prepayId: remote.prepay_id, createUncertain: false });
      } catch (err) {
        await savePayment(order, { createUncertain: true });
        throw err;
      }
    }
    return { success: true, payment: publicPayment(order), payParams: pay.buildPayment(order.payment.prepayId) };
  });
}
async function queryPayment(event, openid) {
  return withOrderLock(event.order_id, async () => {
    let order = await getOrder(event.order_id);
    try { await assertUser(order, openid); }
    catch (_) { await collection.storeForOwner(order.store_id, openid); }
    if (pay.ready()) order = await reconcile(order);
    return { success: true, payment: publicPayment(order) };
  });
}
async function settleRefund(order, r) {
  const p = order.payment;
  if (r.out_refund_no !== p.refundNo || r.out_trade_no !== p.tradeNo || !r.amount || r.amount.refund !== p.amountFen || r.amount.total !== p.amountFen) throw new Error('退款金额或订单不匹配');
  if (r.status === 'SUCCESS') {
    await savePayment(order, { status: 'refunded', refundError: '', refundedAt: Date.now(), lastCheckedAt: Date.now() });
    await db.updateById('orders', order._id, { status: 'cancelled', updateTime: Date.now() });
    order.status = 'cancelled';
  } else {
    await savePayment(order, { status: ['CLOSED', 'ABNORMAL'].includes(r.status) ? 'refund_failed' : 'refunding', refundError: ['CLOSED', 'ABNORMAL'].includes(r.status) ? '退款异常，请联系微信支付处理并刷新核对' : '', lastCheckedAt: Date.now() });
  }
  return order;
}
async function refundOrder(event, openid) {
  return withOrderLock(event.order_id, async () => {
    let order = await getOrder(event.order_id);
    await collection.storeForOwner(order.store_id, openid);
    order = await reconcile(order);
    if (['refunded', 'refunding', 'refund_failed'].includes((order.payment || {}).status)) return { success: true, payment: publicPayment(order) };
    if ((order.payment || {}).status !== 'paid') throw new Error('该订单暂无可原路退款的付款');
    if (event.confirmFullRefund !== true) throw new Error('请确认整单原路退款');
    await savePayment(order, { status: 'refunding', refundNo: order.payment.refundNo || newId('R'), refundRequested: true });
    // 网络超时不回滚：查询或 worker 用同一退款单号恢复。
    order = await settleRefund(order, await pay.refund(order.payment));
    return { success: true, payment: publicPayment(order) };
  });
}
async function requestRefund(event, openid) {
  return withOrderLock(event.order_id, async () => {
    let order = await getOrder(event.order_id);
    await assertUser(order, openid);
    order = await reconcile(order);
    if ((order.payment || {}).status !== 'paid') throw new Error('订单尚未付款或正在退款处理中');
    await savePayment(order, { refundRequested: true, refundRequestedAt: Date.now() });
    return { success: true, payment: publicPayment(order) };
  });
}
async function notification(raw, headers) {
  const { transaction: t } = pay.parseNotification(raw, headers);
  const order = await db.findOne('orders', { 'payment.tradeNo': t.out_trade_no });
  if (!order) throw new Error('未找到支付单');
  return withOrderLock(order.order_id, async () => settle(await getOrder(order.order_id), t));
}
// 在原订单接口写入之前调用；客户端不能直接写付款状态或收款账户。
async function guardUpdate(order, patch, isMerchant) {
  if (order.paymentMode !== 'online') return;
  if (!isMerchant && patch.status && patch.status !== 'cancelled') throw new Error('仅商家可确认订单或开始服务');
  const p = order.payment || {};
  const moneyLocked = ['paid', 'refunding', 'refunded', 'partial_refunded', 'refund_failed'].includes(p.status);
  const changedAmount = ['totalFee', 'boardingFee', 'shippingFee', 'washFee', 'visitFee', 'valueAddedFee', 'pendingEdit'].some(k => patch[k] != null);
  if (moneyLocked && changedAmount) throw new Error('在线付款后不可直接改价或改单，请与顾客协商退款后重新预约');
  if (patch.status === 'cancelled' && moneyLocked) throw new Error('已付款订单请通过申请退款或整单退款处理');
  if (patch.status && patch.status !== order.status && !['cancelled', 'confirmed', 'awaiting_arrival', 'boarding', 'completed'].includes(patch.status)) throw new Error('在线订单不支持此状态变更');
  if (['boarding', 'completed'].includes(patch.status) && (p.status !== 'paid' || p.refundRequested) && amountFen(order) > 0) throw new Error('请等待顾客完成支付并处理退款申请后再开始或完成服务');
  if (['refunding', 'refunded', 'partial_refunded', 'refund_failed'].includes(p.status) && patch.status && patch.status !== order.status) throw new Error('请先完成退款核对');
  if (changedAmount) amountFen({ ...order, ...patch });
  if (changedAmount || patch.status === 'cancelled') await closeUnpaid(order);
  if (isMerchant && payableStatuses.includes(patch.status) && !order.paymentConfirmedAt) {
    amountFen({ ...order, ...patch });
    patch.paymentConfirmedAt = Date.now();
  }
}
let running = false;
async function reconcileBatch() {
  if (!pay.ready() || running) return;
  running = true;
  try {
    const rows = await db.findMany('orders', { paymentMode: 'online', 'payment.status': { $in: ['pending', 'refunding', 'refund_failed'] } }, { limit: 100, sort: { 'payment.lastCheckedAt': 1 } });
    for (const row of rows) {
      try { await withOrderLock(row.order_id, async () => {
        let current = await reconcile(await getOrder(row.order_id));
        if (current.payment?.status === 'pending' && current.payment.expiresAt <= Date.now()) current = await closeUnpaid(current);
        await savePayment(current, { lastCheckedAt: Date.now() });
      }); }
      catch (err) {
        console.warn('[order-payment] reconcile', row.order_id, err.message);
        await db.collection('orders').updateOne({ _id: row._id }, { $set: { 'payment.lastCheckedAt': Date.now() } });
      }
    }
  } finally { running = false; }
}
async function initialize() {
  await db.collection('orders').createIndex({ 'payment.tradeNo': 1 }, { unique: true, partialFilterExpression: { 'payment.tradeNo': { $type: 'string' } } });
  await db.collection('orders').createIndex({ paymentMode: 1, 'payment.status': 1, 'payment.lastCheckedAt': 1 });
  // 对每店收款账户作唯一约束，避免误将同一个特约商户关联至不同经营主体。
  await db.collection('stores').createIndex({ 'collection.applymentId': 1 }, { unique: true, partialFilterExpression: { 'collection.applymentId': { $type: 'string' } } });
  const timer = setInterval(() => reconcileBatch().catch(e => console.error('[order-payment]', e.message)), 60000);
  timer.unref();
}
const handlers = { createOrderPayment: createPayment, queryOrderPayment: queryPayment, requestOrderRefund: requestRefund, refundOrderPayment: refundOrder };
module.exports = { publicPayment, amountFen, withOrderLock, guardUpdate, notification, initialize, reconcileBatch, verifyTransaction,
  handle: (event, openid) => handlers[event.action](event, openid) };
