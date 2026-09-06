const config = require('../config');
const db = require('../db');
const wechat = require('../wechat');
const identity = require('./identity');
const oaBindService = require('./oaBindService');
const oaBindTicketService = require('./oaBindTicketService');
const notifyLogService = require('./notifyLogService');

const ORDER_STATUS_LABELS = {
  pending: '待确认',
  confirmed: '待签协议',
  awaiting_arrival: '待到店',
  boarding: '寄养中',
  toPay: '待支付',
  completed: '已完成',
  cancelled: '已取消'
};

const CHECK_STATUS_MAP = {
  feed: '喂食',
  water: '饮水',
  walk: '遛弯',
  poop: '排便',
  play: '玩耍',
  medicine: '喂药',
  care: '护理',
  clean: '清洁',
  spirit: '精神状态'
};

function truncate(value, max = 20) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '-';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(max - 1, 1))}…`;
}

function formatDateTime(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWechatTime(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapTemplateData(fieldMap, values) {
  const data = {};
  Object.keys(fieldMap || {}).forEach((logicalKey) => {
    const wxKey = fieldMap[logicalKey];
    if (!wxKey) return;
    data[wxKey] = values[logicalKey] != null ? values[logicalKey] : '-';
  });
  return data;
}

function isOaConfigured() {
  const oa = config.wxOa || {};
  return !!(oa.appId && oa.secret);
}

/** 双端合并后，用户版与商家版同属商家小程序 */
function merchantAppId() {
  const apps = config.wxApps || {};
  return (apps.merchant && apps.merchant.appId)
    || (apps.user && apps.user.appId)
    || config.wxAppId
    || '';
}

function mpLink(pagepath) {
  const appid = merchantAppId();
  const path = String(pagepath || '').trim();
  if (!appid || !path) return undefined;
  return { appid, pagepath: path };
}

function userOrderDetailPath(orderId) {
  const id = encodeURIComponent(String(orderId || '').trim());
  return `packageUser/user/order-detail/order-detail?id=${id}`;
}

function orderMeta(order) {
  return {
    storeId: (order && order.store_id) || '',
    storeName: (order && order.storeName) || '',
    orderId: (order && (order.order_id || order.id)) || '',
    orderDisplayNo: (order && order.displayNo) || ''
  };
}

async function resolveOaOpenidForUserOpenid(openid) {
  if (!openid) return '';
  let user = await identity.findPrimaryUserByOpenid(openid);
  let oaOpenid = oaBindService.getOaOpenidFromUser(user);
  if (oaOpenid) return oaOpenid;
  // 用户扫过绑定码但 openids.oa 丢失时，不依赖 UnionID 自动补绑
  try {
    user = await oaBindTicketService.repairOaBindFromTickets(openid);
    oaOpenid = oaBindService.getOaOpenidFromUser(user);
  } catch (err) {
    console.warn('[notify] repair oa bind failed', err.message || err);
  }
  return oaOpenid || '';
}

async function resolveStoreName(order) {
  if (order && order.storeName) return order.storeName;
  const storeId = order && order.store_id;
  if (!storeId) return '店铺';
  const rows = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  return (rows[0] && rows[0].name) || '店铺';
}

async function collectMerchantOaOpenids(order) {
  const set = new Set();
  const storeId = order && order.store_id;
  let store = null;
  if (storeId) {
    const rows = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
    store = rows[0] || null;
  }

  const candidateOpenids = new Set();
  if (order && order.merchantOpenid) candidateOpenids.add(order.merchantOpenid);
  if (store && store.ownerOpenid) candidateOpenids.add(store.ownerOpenid);
  if (store && Array.isArray(store.staffOpenids)) {
    store.staffOpenids.filter(Boolean).forEach((id) => candidateOpenids.add(id));
  }

  for (const openid of candidateOpenids) {
    const oaOpenid = await resolveOaOpenidForUserOpenid(openid);
    if (oaOpenid) set.add(oaOpenid);
  }
  return [...set];
}

async function safeSend(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[notify] ${label} failed:`, err.message || err);
    return null;
  }
}

async function skipNotify(entry) {
  await notifyLogService.writeLog({
    ...entry,
    status: 'skipped',
    errMsg: entry.reason || entry.errMsg || ''
  });
  console.log(`[notify] skip ${entry.type}: ${entry.reason || entry.errMsg || ''}`);
}

async function deliverTemplate({
  type,
  storeId,
  storeName,
  orderId,
  orderDisplayNo,
  touser,
  recipientRole,
  templateId,
  data,
  miniprogram,
  summary
}) {
  const base = {
    type,
    storeId,
    storeName,
    orderId,
    orderDisplayNo,
    touser,
    recipientRole,
    templateId,
    data,
    summary
  };
  try {
    const result = await wechat.sendTemplateMessage({
      touser,
      templateId,
      data,
      miniprogram
    });
    await notifyLogService.writeLog({
      ...base,
      status: 'sent',
      msgid: result && (result.msgid || result.msgId)
    });
    return result;
  } catch (err) {
    await notifyLogService.writeLog({
      ...base,
      status: 'failed',
      errMsg: (err && err.message) || String(err)
    });
    throw err;
  }
}

function formatOrderServiceTime(order) {
  const date = String((order && order.startDate) || '').trim();
  const time = String((order && order.startTime) || '').trim();
  if (date && time) {
    const match = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      return `${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${time}`;
    }
    return truncate(`${date} ${time}`, 32);
  }
  if (date) return truncate(date, 32);
  return formatWechatTime((order && order.createTime) || Date.now());
}

function buildNewOrderNotifyValues(order) {
  const serviceLabel = String((order && order.serviceType) || '寄养预约').trim();
  const roomName = String((order && order.roomName) || '').trim();
  const petName = String((order && order.petName) || '').trim();
  let projectName = serviceLabel;
  if (roomName) {
    projectName = `${serviceLabel} · ${roomName}`;
  } else if (petName) {
    projectName = `${serviceLabel} · ${petName}`;
  }

  return {
    customerName: truncate((order && (order.contactName || order.userNickName)) || '客户', 20),
    userPhone: truncate((order && (order.contactPhone || order.userPhone)) || '-', 20),
    projectName: truncate(projectName, 20),
    serviceTime: formatOrderServiceTime(order)
  };
}

async function notifyMerchantNewOrder(order) {
  return safeSend('newOrder', async () => {
    const meta = orderMeta(order);
    if (!isOaConfigured()) {
      await skipNotify({ type: 'newOrder', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.newOrder;
    if (!templateId || !order) {
      await skipNotify({ type: 'newOrder', ...meta, reason: 'missing template or order' });
      return null;
    }
    const recipients = await collectMerchantOaOpenids(order);
    if (!recipients.length) {
      await skipNotify({ type: 'newOrder', ...meta, reason: 'no merchant oa openid' });
      return null;
    }

    const data = mapTemplateData(
      config.wxOa.templateFields.newOrder,
      buildNewOrderNotifyValues(order)
    );
    const miniprogram = mpLink('pages/merchant/tab-daily/tab-daily?openOrders=1&tab=pending');
    const summary = `新订单 ${meta.orderDisplayNo || meta.orderId || ''}`.trim();

    const results = [];
    for (const touser of recipients) {
      results.push(await deliverTemplate({
        type: 'newOrder',
        ...meta,
        touser,
        recipientRole: 'merchant',
        templateId,
        data,
        miniprogram,
        summary
      }));
    }
    return results;
  });
}

function buildOrderCancelNotifyValues(order) {
  const serviceLabel = String((order && order.serviceType) || '寄养预约').trim();
  const roomName = String((order && order.roomName) || '').trim();
  const petName = String((order && order.petName) || '').trim();
  let projectName = serviceLabel;
  if (roomName) {
    projectName = `${serviceLabel} · ${roomName}`;
  } else if (petName) {
    projectName = `${serviceLabel} · ${petName}`;
  }

  return {
    projectName: truncate(projectName, 20),
    userPhone: truncate((order && (order.contactPhone || order.userPhone)) || '-', 20),
    cancelTime: formatWechatTime((order && order.updateTime) || Date.now())
  };
}

async function notifyOrderCancelled(order, options = {}) {
  return safeSend('orderCancel', async () => {
    const meta = orderMeta(order);
    if (!isOaConfigured()) {
      await skipNotify({ type: 'orderCancel', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.orderCancel;
    if (!templateId || !order) {
      await skipNotify({ type: 'orderCancel', ...meta, reason: 'missing template or order' });
      return null;
    }

    const cancelledBy = String(options.cancelledBy || '').trim();
    const data = mapTemplateData(
      config.wxOa.templateFields.orderCancel,
      buildOrderCancelNotifyValues(order)
    );
    const summary = `取消订单 ${meta.orderDisplayNo || meta.orderId || ''}`.trim();

    if (cancelledBy === 'user') {
      const recipients = await collectMerchantOaOpenids(order);
      if (!recipients.length) {
        await skipNotify({ type: 'orderCancel', ...meta, reason: 'no merchant oa openid' });
        return null;
      }
      const results = [];
      for (const touser of recipients) {
        results.push(await deliverTemplate({
          type: 'orderCancel',
          ...meta,
          touser,
          recipientRole: 'merchant',
          templateId,
          data,
          miniprogram: mpLink('pages/merchant/tab-daily/tab-daily?openOrders=1&tab=completed'),
          summary
        }));
      }
      return results;
    }

    const oaOpenid = await resolveOaOpenidForUserOpenid(order.userOpenid);
    if (!oaOpenid) {
      await skipNotify({ type: 'orderCancel', ...meta, reason: 'no user oa openid' });
      return null;
    }

    return deliverTemplate({
      type: 'orderCancel',
      ...meta,
      touser: oaOpenid,
      recipientRole: 'user',
      templateId,
      data,
      miniprogram: mpLink(userOrderDetailPath(order.order_id || order.id || '')),
      summary
    });
  });
}

function buildMerchantApplyNotifyValues(storeDoc, applicant, options = {}) {
  const applicantName = truncate(
    (applicant && (applicant.applicantName || applicant.applicantNickName))
    || (storeDoc && storeDoc.legalName)
    || '商家',
    20
  );
  const merchantName = truncate((storeDoc && storeDoc.name) || '店铺', 20);
  const applyTime = formatWechatTime(
    (storeDoc && (storeDoc.createTime || storeDoc.updateTime)) || Date.now()
  );
  const values = { applicantName, merchantName, applyTime };
  if (options.rejectReason != null) {
    values.rejectReason = truncate(String(options.rejectReason || '').trim() || '审核未通过', 20);
  }
  return values;
}

async function lookupOaOpenidsByUserField(field, values) {
  const set = new Set();
  for (const raw of values || []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await db.findMany('users', {
      [field]: new RegExp(`^${escaped}$`, 'i')
    }, { limit: 5 });
    for (const user of users) {
      const oaOpenid = oaBindService.getOaOpenidFromUser(user);
      if (oaOpenid) set.add(oaOpenid);
    }
  }
  return set;
}

async function collectAdminOaOpenids() {
  const set = new Set();
  const cfg = (config.wxOa && config.wxOa.adminNotify) || {};
  const wechatIdOaMap = cfg.wechatIdOaMap || {};

  (cfg.oaOpenids || []).forEach((id) => {
    if (id) set.add(id);
  });
  Object.values(wechatIdOaMap).forEach((id) => {
    if (id) set.add(id);
  });

  for (const wechatId of cfg.wechatIds || []) {
    const id = String(wechatId || '').trim();
    if (!id) continue;

    const mappedOa = wechatIdOaMap[id]
      || Object.entries(wechatIdOaMap).find(([key]) => (
        String(key).toLowerCase() === id.toLowerCase()
      ))?.[1];
    if (mappedOa) {
      set.add(mappedOa);
      continue;
    }

    const fromDb = await lookupOaOpenidsByUserField('wechatId', [id]);
    fromDb.forEach((oa) => set.add(oa));
  }

  const fromNicknames = await lookupOaOpenidsByUserField('nickName', cfg.nicknames || []);
  fromNicknames.forEach((oa) => set.add(oa));

  for (const mpOpenid of cfg.mpOpenids || []) {
    const id = String(mpOpenid || '').trim();
    if (!id) continue;
    const oaOpenid = await resolveOaOpenidForUserOpenid(id);
    if (oaOpenid) set.add(oaOpenid);
  }

  return [...set];
}

async function notifyAdminsMerchantApply(storeDoc, options = {}) {
  return safeSend('merchantApplyAdmin', async () => {
    const meta = {
      storeId: (storeDoc && storeDoc.store_id) || '',
      storeName: (storeDoc && storeDoc.name) || ''
    };
    if (!isOaConfigured()) {
      await skipNotify({ type: 'merchantApplyAdmin', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.merchantApplyAdmin;
    if (!templateId || !storeDoc) {
      await skipNotify({ type: 'merchantApplyAdmin', ...meta, reason: 'missing template or store' });
      return null;
    }
    const recipients = await collectAdminOaOpenids();
    if (!recipients.length) {
      await skipNotify({ type: 'merchantApplyAdmin', ...meta, reason: 'no admin oa openid' });
      return null;
    }

    const adminCfg = (config.wxOa && config.wxOa.adminNotify) || {};
    const userName = truncate(
      options.applicantName
      || (storeDoc && storeDoc.legalName)
      || (storeDoc && storeDoc.name)
      || '商家',
      20
    );
    const platformName = truncate(adminCfg.platformName || '熠森宠物管家', 20);
    const data = mapTemplateData(config.wxOa.templateFields.merchantApplyAdmin, {
      userName,
      platformName
    });

    const results = [];
    for (const touser of recipients) {
      results.push(await deliverTemplate({
        type: 'merchantApplyAdmin',
        ...meta,
        touser,
        recipientRole: 'admin',
        templateId,
        data,
        miniprogram: mpLink('pages/merchant/tab-daily/tab-daily'),
        summary: `商家入驻申请 ${meta.storeName || meta.storeId}`.trim()
      }));
    }
    return results;
  });
}

async function notifyMerchantApplyApproved(storeDoc, applicant) {
  return safeSend('merchantApplyApproved', async () => {
    const meta = {
      storeId: (storeDoc && storeDoc.store_id) || '',
      storeName: (storeDoc && storeDoc.name) || ''
    };
    if (!isOaConfigured()) {
      await skipNotify({ type: 'merchantApplyApproved', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.merchantApplyApproved;
    if (!templateId || !storeDoc) {
      await skipNotify({ type: 'merchantApplyApproved', ...meta, reason: 'missing template or store' });
      return null;
    }
    const ownerOpenid = (storeDoc.ownerOpenid || (applicant && applicant.applicantOpenid) || '').trim();
    const oaOpenid = await resolveOaOpenidForUserOpenid(ownerOpenid);
    if (!oaOpenid) {
      await skipNotify({ type: 'merchantApplyApproved', ...meta, reason: 'no merchant oa openid' });
      return null;
    }
    const data = mapTemplateData(
      config.wxOa.templateFields.merchantApplyApproved,
      buildMerchantApplyNotifyValues(storeDoc, applicant)
    );
    return deliverTemplate({
      type: 'merchantApplyApproved',
      ...meta,
      touser: oaOpenid,
      recipientRole: 'merchant',
      templateId,
      data,
      miniprogram: mpLink('pages/merchant/tab-store/tab-store'),
      summary: `入驻通过 ${meta.storeName || meta.storeId}`.trim()
    });
  });
}

async function notifyMerchantApplyRejected(storeDoc, applicant, rejectReason) {
  return safeSend('merchantApplyRejected', async () => {
    const meta = {
      storeId: (storeDoc && storeDoc.store_id) || '',
      storeName: (storeDoc && storeDoc.name) || ''
    };
    if (!isOaConfigured()) {
      await skipNotify({ type: 'merchantApplyRejected', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.merchantApplyRejected;
    if (!templateId || !storeDoc) {
      await skipNotify({ type: 'merchantApplyRejected', ...meta, reason: 'missing template or store' });
      return null;
    }
    const ownerOpenid = (storeDoc.ownerOpenid || (applicant && applicant.applicantOpenid) || '').trim();
    const oaOpenid = await resolveOaOpenidForUserOpenid(ownerOpenid);
    if (!oaOpenid) {
      await skipNotify({ type: 'merchantApplyRejected', ...meta, reason: 'no merchant oa openid' });
      return null;
    }
    const data = mapTemplateData(
      config.wxOa.templateFields.merchantApplyRejected,
      buildMerchantApplyNotifyValues(storeDoc, applicant, { rejectReason })
    );
    return deliverTemplate({
      type: 'merchantApplyRejected',
      ...meta,
      touser: oaOpenid,
      recipientRole: 'merchant',
      templateId,
      data,
      miniprogram: mpLink('pages/merchant/tab-store/tab-store'),
      summary: `入驻拒绝 ${meta.storeName || meta.storeId}`.trim()
    });
  });
}

/** 入驻后仍无订单时的引导文案（填进模板「商户名称」字段，≤20 字；服务号会滤掉 emoji） */
const NO_ORDER_GUIDE_COPY = '分享给客户，宠物打卡超方便';

async function notifyMerchantNoOrderGuide(storeDoc, options = {}) {
  return safeSend('merchantNoOrder', async () => {
    const meta = {
      storeId: (storeDoc && storeDoc.store_id) || '',
      storeName: (storeDoc && storeDoc.name) || ''
    };
    // 临时关闭：不再发送「入驻无订单引导」
    await skipNotify({ type: 'merchantNoOrder', ...meta, reason: 'disabled' });
    return null;
    if (!isOaConfigured()) {
      await skipNotify({ type: 'merchantNoOrder', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.merchantNoOrder;
    if (!templateId || !storeDoc) {
      await skipNotify({ type: 'merchantNoOrder', ...meta, reason: 'missing template or store' });
      return null;
    }
    const ownerOpenid = String(
      (options && options.ownerOpenid)
      || storeDoc.ownerOpenid
      || ''
    ).trim();
    const oaOpenid = options && options.oaOpenid
      ? String(options.oaOpenid).trim()
      : await resolveOaOpenidForUserOpenid(ownerOpenid);
    if (!oaOpenid) {
      await skipNotify({ type: 'merchantNoOrder', ...meta, reason: 'no merchant oa openid' });
      return null;
    }

    const guideCopy = truncate(
      (options && options.guideCopy) || NO_ORDER_GUIDE_COPY,
      20
    );
    const applyTime = formatWechatTime(
      (storeDoc && (storeDoc.createTime || storeDoc.approvedAt || storeDoc.updateTime)) || Date.now()
    );
    const data = mapTemplateData(
      config.wxOa.templateFields.merchantNoOrder,
      { merchantName: guideCopy, applyTime }
    );
    return deliverTemplate({
      type: 'merchantNoOrder',
      ...meta,
      touser: oaOpenid,
      recipientRole: 'merchant',
      templateId,
      data,
      miniprogram: mpLink('pages/merchant/tab-store/tab-store'),
      summary: `无订单引导 ${meta.storeName || meta.storeId}`.trim()
    });
  });
}

async function notifyUserOrderStatus(order, prevStatus) {
  return safeSend('orderStatus', async () => {
    const meta = orderMeta(order);
    if (!isOaConfigured()) {
      await skipNotify({ type: 'orderStatus', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.orderStatus;
    if (!templateId || !order) {
      await skipNotify({ type: 'orderStatus', ...meta, reason: 'missing template or order' });
      return null;
    }
    if (prevStatus && prevStatus === order.status) {
      return null;
    }

    const oaOpenid = await resolveOaOpenidForUserOpenid(order.userOpenid);
    if (!oaOpenid) {
      await skipNotify({ type: 'orderStatus', ...meta, reason: 'no user oa openid' });
      return null;
    }

    const orderId = order.order_id || order.id || '';
    const statusLabel = ORDER_STATUS_LABELS[order.status] || order.status || '-';
    const storeName = truncate(order.storeName || (await resolveStoreName(order)) || '店铺', 20);
    const data = mapTemplateData(config.wxOa.templateFields.orderStatus, {
      orderNo: truncate(order.displayNo || orderId, 32),
      petName: truncate(order.petName || '宠物', 20),
      status: truncate(statusLabel, 20),
      storeName,
      updateTime: truncate(formatDateTime(order.updateTime || Date.now()), 20)
    });

    return deliverTemplate({
      type: 'orderStatus',
      ...meta,
      storeName: meta.storeName || storeName,
      touser: oaOpenid,
      recipientRole: 'user',
      templateId,
      data,
      miniprogram: mpLink(userOrderDetailPath(orderId)),
      summary: `订单状态 ${statusLabel}`
    });
  });
}

function formatChecks(checks) {
  const list = (checks || []).map((item) => CHECK_STATUS_MAP[item] || item).filter(Boolean);
  if (!list.length) return '日常打卡';
  return truncate(list.join('、'), 20);
}

function resolveCheckTime(log) {
  const scheduledAt = Number(log && log.scheduledAt) || 0;
  const publishedAt = Number(log && log.publishedAt) || 0;
  if (scheduledAt > 0) {
    return formatWechatTime(scheduledAt);
  }
  if (publishedAt > 0) {
    return formatWechatTime(publishedAt);
  }
  if (log && log.time) {
    return truncate(String(log.time).trim(), 32);
  }
  return formatWechatTime(Date.now());
}

async function buildDailyCheckNotifyValues(order, log) {
  const storeName = await resolveStoreName(order);
  return {
    storeName: truncate(storeName, 20),
    customerName: truncate((log && log.petName) || order.petName || '宠物', 20),
    projectName: formatChecks(log && log.checks),
    checkTime: resolveCheckTime(log)
  };
}

async function notifyUserDailyCheck(order, log) {
  return safeSend('dailyCheck', async () => {
    const meta = orderMeta(order);
    if (!meta.storeName) {
      meta.storeName = await resolveStoreName(order);
    }
    if (!isOaConfigured()) {
      await skipNotify({ type: 'dailyCheck', ...meta, reason: 'OA not configured' });
      return null;
    }
    const templateId = config.wxOa.templates.dailyCheck;
    if (!templateId || !order) {
      await skipNotify({ type: 'dailyCheck', ...meta, reason: 'missing template or order' });
      return null;
    }

    const oaOpenid = await resolveOaOpenidForUserOpenid(order.userOpenid);
    if (!oaOpenid) {
      await skipNotify({ type: 'dailyCheck', ...meta, reason: 'no user oa openid' });
      return null;
    }

    const values = await buildDailyCheckNotifyValues(order, log);
    const data = mapTemplateData(config.wxOa.templateFields.dailyCheck, values);
    return deliverTemplate({
      type: 'dailyCheck',
      ...meta,
      touser: oaOpenid,
      recipientRole: 'user',
      templateId,
      data,
      miniprogram: mpLink('pages/daily/daily'),
      summary: `打卡 ${values.projectName || ''}`.trim()
    });
  });
}

module.exports = {
  notifyMerchantNewOrder,
  notifyUserOrderStatus,
  notifyOrderCancelled,
  notifyMerchantApplyApproved,
  notifyMerchantApplyRejected,
  notifyAdminsMerchantApply,
  notifyUserDailyCheck,
  notifyMerchantNoOrderGuide,
  NO_ORDER_GUIDE_COPY,
  resolveOaOpenidForUserOpenid,
  ORDER_STATUS_LABELS
};
