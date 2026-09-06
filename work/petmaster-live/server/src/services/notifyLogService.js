const db = require('../db');
const identity = require('./identity');
const oaBindService = require('./oaBindService');
const oaBindTicketService = require('./oaBindTicketService');

const COLLECTION = 'notify_logs';

const TYPE_LABELS = {
  newOrder: '新订单提醒',
  orderCancel: '订单取消',
  orderStatus: '订单状态更新',
  dailyCheck: '日常打卡',
  merchantApplyAdmin: '入驻申请(管理员)',
  merchantApplyApproved: '入驻审核通过',
  merchantApplyRejected: '入驻审核拒绝',
  merchantNoOrder: '入驻无订单引导'
};

let indexesReady = false;

async function ensureReady() {
  await db.ensureCollections([COLLECTION]);
  if (indexesReady) return;
  try {
    const col = db.collection(COLLECTION);
    await col.createIndex({ store_id: 1, createTime: -1 });
    await col.createIndex({ createTime: -1 });
    await col.createIndex({ type: 1, createTime: -1 });
    indexesReady = true;
  } catch (err) {
    console.warn('[notifyLog] ensure indexes failed', err.message || err);
  }
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch (err) {
    return '';
  }
}

function maskOpenid(openid) {
  const text = String(openid || '').trim();
  if (!text) return '';
  if (text.length <= 10) return text;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function summarizeData(data) {
  if (!data || typeof data !== 'object') return '';
  return Object.keys(data)
    .slice(0, 6)
    .map((key) => `${key}:${String(data[key] == null ? '' : data[key]).slice(0, 24)}`)
    .join(' · ');
}

async function writeLog(entry = {}) {
  try {
    await ensureReady();
    const now = Date.now();
    const doc = {
      type: String(entry.type || '').trim(),
      typeLabel: TYPE_LABELS[entry.type] || entry.type || '',
      status: String(entry.status || 'sent').trim(),
      store_id: String(entry.storeId || entry.store_id || '').trim(),
      storeName: String(entry.storeName || '').trim(),
      order_id: String(entry.orderId || entry.order_id || '').trim(),
      orderDisplayNo: String(entry.orderDisplayNo || '').trim(),
      touser: String(entry.touser || '').trim(),
      recipientRole: String(entry.recipientRole || '').trim(),
      templateId: String(entry.templateId || '').trim(),
      summary: String(entry.summary || '').trim(),
      dataPreview: String(entry.dataPreview || summarizeData(entry.data) || '').trim(),
      msgid: entry.msgid != null ? String(entry.msgid) : '',
      errMsg: String(entry.errMsg || entry.reason || '').trim(),
      createTime: now
    };
    await db.insertOne(COLLECTION, doc);
    return doc;
  } catch (err) {
    console.warn('[notifyLog] write failed', err.message || err);
    return null;
  }
}

async function resolveMemberBind(openid) {
  const id = String(openid || '').trim();
  if (!id) {
    return { openid: '', nickName: '', oaBound: false, oaOpenid: '' };
  }
  let user = await identity.findPrimaryUserByOpenid(id);
  let oaOpenid = oaBindService.getOaOpenidFromUser(user);
  if (!oaOpenid) {
    try {
      user = await oaBindTicketService.repairOaBindFromTickets(id);
      oaOpenid = oaBindService.getOaOpenidFromUser(user);
    } catch (err) {
      // ignore repair failure for admin list
    }
  }
  return {
    openid: id,
    nickName: (user && (user.nickName || user.realName)) || '',
    oaBound: !!oaOpenid,
    oaOpenid: oaOpenid || ''
  };
}

async function getStorePushStatus(storeDoc) {
  const ownerOpenid = (storeDoc && storeDoc.ownerOpenid) || '';
  const staffOpenids = Array.isArray(storeDoc && storeDoc.staffOpenids)
    ? storeDoc.staffOpenids.filter(Boolean)
    : [];

  const owner = await resolveMemberBind(ownerOpenid);
  const staff = [];
  for (const openid of staffOpenids) {
    staff.push(await resolveMemberBind(openid));
  }

  const boundStaffCount = staff.filter((item) => item.oaBound).length;
  const memberCount = (ownerOpenid ? 1 : 0) + staff.length;
  const boundCount = (owner.oaBound ? 1 : 0) + boundStaffCount;
  const pushReady = boundCount > 0;

  return {
    owner,
    staff,
    memberCount,
    boundCount,
    boundStaffCount,
    ownerBound: !!owner.oaBound,
    pushReady,
    pushStatus: pushReady ? 'ready' : 'not_ready',
    pushStatusLabel: pushReady ? '已接入' : '未接入'
  };
}

async function listAdminStorePushStatus(query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const skip = Math.max(parseInt(query.skip, 10) || 0, 0);
  const pushStatus = String(query.push_status || query.pushStatus || '').trim();
  const keyword = String(query.keyword || '').trim();

  const filter = {
    merchantApplyStatus: { $exists: true, $ne: '' }
  };
  const applyStatus = String(query.status || '').trim();
  if (applyStatus) {
    filter.merchantApplyStatus = applyStatus;
  } else {
    filter.merchantApplyStatus = { $in: ['approved', 'disabled'] };
  }

  if (keyword) {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { name: regex },
      { legalName: regex },
      { contactPhone: regex },
      { store_id: regex },
      { displayNo: regex }
    ];
  }

  const stores = await db.findMany('stores', filter, {
    limit: 500,
    skip: 0,
    sort: { updateTime: -1 }
  });

  const items = [];
  for (const storeDoc of stores || []) {
    const push = await getStorePushStatus(storeDoc);
    if (pushStatus === 'ready' && !push.pushReady) continue;
    if (pushStatus === 'not_ready' && push.pushReady) continue;

    items.push({
      store_id: storeDoc.store_id,
      displayNo: storeDoc.displayNo || '',
      name: storeDoc.name || '',
      legalName: storeDoc.legalName || '',
      contactPhone: storeDoc.contactPhone || '',
      merchantApplyStatus: storeDoc.merchantApplyStatus || '',
      businessStatus: storeDoc.status || '',
      ownerOpenid: storeDoc.ownerOpenid || '',
      ownerNickName: push.owner.nickName || '',
      ownerBound: push.ownerBound,
      staffCount: push.staff.length,
      boundStaffCount: push.boundStaffCount,
      memberCount: push.memberCount,
      boundCount: push.boundCount,
      pushReady: push.pushReady,
      pushStatus: push.pushStatus,
      pushStatusLabel: push.pushStatusLabel,
      updateTime: storeDoc.updateTime || storeDoc.createTime || 0,
      updateTimeText: formatTime(storeDoc.updateTime || storeDoc.createTime)
    });
  }

  const readyCount = items.filter((item) => item.pushReady).length;
  const notReadyCount = items.length - readyCount;
  const page = items.slice(skip, skip + limit);

  return {
    success: true,
    stores: page,
    total: items.length,
    readyCount,
    notReadyCount,
    limit,
    skip
  };
}

async function listAdminPushLogs(query = {}) {
  await ensureReady();
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const skip = Math.max(parseInt(query.skip, 10) || 0, 0);
  const storeId = String(query.store_id || '').trim();
  const type = String(query.type || '').trim();
  const status = String(query.status || '').trim();

  const filter = {};
  if (storeId) filter.store_id = storeId;
  if (type) filter.type = type;
  if (status) filter.status = status;

  let storeName = '';
  if (storeId) {
    const stores = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
    storeName = (stores[0] && stores[0].name) || '';
  }

  const [logs, total] = await Promise.all([
    db.findMany(COLLECTION, filter, { limit, skip, sort: { createTime: -1 } }),
    db.collection(COLLECTION).countDocuments(filter)
  ]);

  return {
    success: true,
    store_id: storeId,
    storeName,
    total,
    limit,
    skip,
    logs: (logs || []).map((doc) => ({
      id: String(doc._id || ''),
      type: doc.type || '',
      typeLabel: doc.typeLabel || TYPE_LABELS[doc.type] || doc.type || '',
      status: doc.status || '',
      store_id: doc.store_id || '',
      storeName: doc.storeName || '',
      order_id: doc.order_id || '',
      orderDisplayNo: doc.orderDisplayNo || '',
      touserMasked: maskOpenid(doc.touser),
      recipientRole: doc.recipientRole || '',
      templateId: doc.templateId || '',
      summary: doc.summary || '',
      dataPreview: doc.dataPreview || '',
      msgid: doc.msgid || '',
      errMsg: doc.errMsg || '',
      createTime: doc.createTime || 0,
      createTimeText: formatTime(doc.createTime)
    }))
  };
}

module.exports = {
  COLLECTION,
  TYPE_LABELS,
  writeLog,
  getStorePushStatus,
  listAdminStorePushStatus,
  listAdminPushLogs
};
