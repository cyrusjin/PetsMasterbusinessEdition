const db = require('../db');
const oss = require('../oss');
const { canManageOrder } = require('./orderService');
const identity = require('./identity');
const userFields = require('./userFields');
const notifyService = require('./notifyService');

const DAILY_LOGS_COLLECTION = 'daily_logs';
const DAILY_LOG_COMMENTS_COLLECTION = 'daily_log_comments';
const SCHEDULE_POLL_MS = 30 * 1000;
const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;
const MAX_COMMENT_LEN = 200;

let scheduleTimer = null;
let scheduleRunning = false;

function buildLogId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildCommentId() {
  return `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatCommentTime(ts) {
  const n = Number(ts) || 0;
  if (!n) return '';
  try {
    return new Date(n).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (err) {
    return '';
  }
}

function formatComment(doc) {
  if (!doc) return null;
  const role = doc.authorRole === 'merchant' ? 'merchant' : 'user';
  return {
    id: doc.comment_id,
    comment_id: doc.comment_id,
    logId: doc.log_id,
    log_id: doc.log_id,
    orderId: doc.order_id,
    order_id: doc.order_id,
    authorRole: role,
    authorName: doc.authorName || (role === 'merchant' ? '商家' : '宠主'),
    content: doc.content || '',
    replyToCommentId: doc.replyToCommentId || '',
    replyToAuthorName: doc.replyToAuthorName || '',
    createTime: doc.createTime || 0,
    time: formatCommentTime(doc.createTime)
  };
}

function isScheduledDoc(doc) {
  if (!doc) return false;
  if (doc.status === 'scheduled') return true;
  return !!doc.isScheduled && Number(doc.scheduledAt) > Date.now();
}

function getOrderServiceLine(order) {
  const raw = String((order && (order.serviceLine || order.serviceKind)) || '').trim();
  if (raw === 'wash' || raw === 'homeFeeding') return raw;
  const snapLine = order && order.feeSnapshot && order.feeSnapshot.serviceLine;
  if (snapLine === 'wash' || snapLine === 'homeFeeding') return snapLine;
  const type = String((order && order.serviceType) || '');
  if (type.indexOf('洗护') >= 0 || type.indexOf('美容') >= 0) return 'wash';
  if (type.indexOf('上门') >= 0) return 'homeFeeding';
  if (order && order.feeSnapshot && order.feeSnapshot.visit) return 'homeFeeding';
  return 'boarding';
}

/** 寄养中均可打卡；洗护/上门接单后即可打卡，无需先确认到店 */
function canDailyCheckOrder(order) {
  if (!order) return false;
  const status = order.status;
  if (status === 'boarding') return true;
  if (status !== 'awaiting_arrival' && status !== 'confirmed') return false;
  const line = getOrderServiceLine(order);
  return line === 'wash' || line === 'homeFeeding';
}

const MAX_DAILY_VIDEOS = 9;

function asMediaArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function resolveRawVideoLists(payload = {}, fallback = {}) {
  let rawVideos;
  if (payload.videos != null) {
    rawVideos = asMediaArray(payload.videos);
  } else if (payload.video != null) {
    rawVideos = asMediaArray(payload.video);
  } else if (fallback.videos != null) {
    rawVideos = asMediaArray(fallback.videos);
  } else {
    rawVideos = asMediaArray(fallback.video);
  }

  let rawCovers;
  if (payload.videoCovers != null) {
    rawCovers = asMediaArray(payload.videoCovers);
  } else if (payload.videoCover != null) {
    rawCovers = asMediaArray(payload.videoCover);
  } else if (fallback.videoCovers != null) {
    rawCovers = asMediaArray(fallback.videoCovers);
  } else {
    rawCovers = asMediaArray(fallback.videoCover);
  }

  return {
    rawVideos: rawVideos.slice(0, MAX_DAILY_VIDEOS),
    rawCovers
  };
}

function sanitizeVideoFields(payload = {}, fallback = {}) {
  const { rawVideos, rawCovers } = resolveRawVideoLists(payload, fallback);
  const paired = [];
  for (let i = 0; i < rawVideos.length; i += 1) {
    const rawVideo = rawVideos[i];
    const video = sanitizeMediaField(rawVideo);
    if (rawVideo && !video) {
      return { error: '视频未上传成功，请重新打卡' };
    }
    if (!video) continue;
    const rawCover = rawCovers[i] || '';
    const cover = sanitizeMediaField(rawCover);
    if (rawCover && !cover) {
      return { error: '视频封面未上传成功，请重新打卡' };
    }
    paired.push({ video, cover });
  }

  const videos = paired.map((item) => item.video);
  const videoCovers = paired.map((item) => item.cover);
  return {
    videos,
    videoCovers,
    video: videos[0] || '',
    videoCover: videoCovers[0] || ''
  };
}

function formatLog(doc) {
  const scheduledAt = Number(doc.scheduledAt) || 0;
  const status = doc.status || (isScheduledDoc(doc) ? 'scheduled' : 'published');
  const videos = Array.isArray(doc.videos) && doc.videos.length
    ? doc.videos.filter(Boolean)
    : (doc.video ? [doc.video] : []);
  const videoCovers = Array.isArray(doc.videoCovers) && doc.videoCovers.length
    ? doc.videoCovers
    : (doc.videoCover ? [doc.videoCover] : []);
  return {
    id: doc.log_id,
    log_id: doc.log_id,
    orderId: doc.order_id,
    order_id: doc.order_id,
    petName: doc.petName || '',
    checks: Array.isArray(doc.checks) ? doc.checks : [],
    description: doc.description || '',
    images: Array.isArray(doc.images) ? doc.images : [],
    videos,
    videoCovers,
    // 兼容旧客户端：保留首个视频单字段
    video: videos[0] || doc.video || '',
    videoCover: videoCovers[0] || doc.videoCover || '',
    notifyOwner: !!doc.notifyOwner,
    isAbnormal: !!doc.isAbnormal,
    time: doc.time || '',
    createTime: doc.createTime,
    status,
    isScheduled: status === 'scheduled',
    scheduledAt,
    publishedAt: Number(doc.publishedAt) || 0,
    userViewedAt: Number(doc.userViewedAt) || 0,
    userViewed: !!(Number(doc.userViewedAt) || 0)
  };
}

function sanitizeMediaList(list) {
  return (list || []).filter((item) => oss.isStoredMedia(item));
}

function sanitizeMediaField(value) {
  return oss.isStoredMedia(value) ? value : '';
}

function filterLogsForViewer(logs, viewerIsMerchant) {
  if (viewerIsMerchant) return logs || [];
  // 宠主端不提前看到未发布的预约打卡
  return (logs || []).filter((log) => log.status !== 'scheduled' && !log.isScheduled);
}

async function enrichLogsMedia(logs) {
  const list = (logs || []).map(formatLog);
  return Promise.all(list.map(async (log) => {
    const images = await oss.resolveMediaUrls(sanitizeMediaList(log.images));
    const videoIds = sanitizeMediaList(log.videos && log.videos.length ? log.videos : (log.video ? [log.video] : []));
    const coverIds = Array.isArray(log.videoCovers) ? log.videoCovers : (log.videoCover ? [log.videoCover] : []);
    const videoUrls = await oss.resolveMediaUrls(videoIds);
    const videoCoverUrls = await Promise.all(videoUrls.map((videoUrl, index) => (
      videoUrl
        ? oss.resolveVideoCoverUrl(videoUrl, sanitizeMediaField(coverIds[index] || ''))
        : Promise.resolve('')
    )));
    return {
      ...log,
      images: images.filter(Boolean),
      videos: videoIds,
      videoCovers: videoIds.map((_, index) => sanitizeMediaField(coverIds[index] || '')),
      videoUrls: videoUrls.filter(Boolean),
      videoCoverUrls,
      video: videoIds[0] || '',
      videoCover: sanitizeMediaField(coverIds[0] || ''),
      videoUrl: videoUrls[0] || '',
      videoCoverUrl: videoCoverUrls[0] || ''
    };
  }));
}

async function getOrderById(orderId) {
  const data = await db.findMany('orders', { order_id: orderId }, { limit: 1 });
  return data.length ? data[0] : null;
}

async function getStoreById(storeId) {
  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  return data.length ? data[0] : null;
}

async function isMerchantUser(openid, storeId) {
  if (!openid || !storeId) return false;
  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) return false;
  if (userFields.resolveMerchantStoreId(user) === storeId
    && userFields.isMerchantApprovedFromDoc(user)) {
    return true;
  }
  const openids = identity.collectOpenids(user);
  const owned = await db.findMany('stores', {
    store_id: storeId,
    ownerOpenid: { $in: openids }
  }, { limit: 1 });
  if (owned.length) return true;
  const staff = await db.findMany('stores', {
    store_id: storeId,
    staffOpenids: { $in: openids }
  }, { limit: 1 });
  return staff.length > 0;
}

async function isOrderUser(order, openid) {
  if (!order || !openid) return false;
  const user = await identity.findPrimaryUserByOpenid(openid);
  const openids = user ? identity.collectOpenids(user) : [openid];
  return openids.includes(order.userOpenid);
}

async function canManageStore(storeId, openid) {
  if (!openid || !storeId) return false;

  const store = await getStoreById(storeId);
  if (store) {
    const ownerOpenid = store.ownerOpenid || '';
    if (ownerOpenid === openid) return true;
    if (!ownerOpenid && await isMerchantUser(openid, storeId)) {
      return true;
    }
  }

  if (await isMerchantUser(openid, storeId)) {
    return true;
  }

  const openids = identity.collectOpenids(await identity.findPrimaryUserByOpenid(openid) || openid);
  const ownedStores = await db.findMany('stores', {
    ownerOpenid: { $in: openids },
    store_id: storeId
  }, { limit: 1 });
  return ownedStores.length > 0;
}

async function initDailyDatabase() {
  await db.ensureCollections([DAILY_LOGS_COLLECTION, DAILY_LOG_COMMENTS_COLLECTION]);
  try {
    await db.collection(DAILY_LOGS_COLLECTION).createIndex(
      { status: 1, scheduledAt: 1 },
      { name: 'status_scheduledAt', background: true }
    );
  } catch (err) {
    console.warn('[daily] createIndex status_scheduledAt failed', (err && err.message) || err);
  }
  try {
    await db.collection(DAILY_LOG_COMMENTS_COLLECTION).createIndex(
      { log_id: 1, createTime: 1 },
      { name: 'log_id_createTime', background: true }
    );
  } catch (err) {
    console.warn('[daily] createIndex log_id_createTime failed', (err && err.message) || err);
  }
  return { success: true, collection: DAILY_LOGS_COLLECTION };
}

async function getLogAccessContext(logId, openid) {
  if (!logId) return { error: '缺少打卡记录' };
  const log = await db.findOne(DAILY_LOGS_COLLECTION, { log_id: logId });
  if (!log) return { error: '打卡记录不存在' };
  const order = await getOrderById(log.order_id);
  if (!order) return { error: '订单不存在' };
  const isMerchant = await canManageOrder(order, openid);
  const isUser = await isOrderUser(order, openid);
  if (!isMerchant && !isUser) {
    return { error: '无权操作该打卡' };
  }
  return { log, order, isMerchant, isUser };
}

async function resolveCommentAuthor(openid, isMerchant, order) {
  if (isMerchant) {
    const storeId = (order && order.store_id) || '';
    const store = storeId ? await getStoreById(storeId) : null;
    const name = (store && store.name && String(store.name).trim()) || '商家';
    return { authorRole: 'merchant', authorName: name };
  }
  const user = await identity.findPrimaryUserByOpenid(openid);
  const nick = user && user.nickName ? String(user.nickName).trim() : '';
  const contact = order && order.contactName ? String(order.contactName).trim() : '';
  return {
    authorRole: 'user',
    authorName: nick || contact || '宠主'
  };
}

async function attachCommentsToLogs(logs) {
  const list = logs || [];
  const logIds = [...new Set(list.map((item) => item.id || item.log_id).filter(Boolean))];
  if (!logIds.length) {
    return list.map((item) => ({ ...item, comments: Array.isArray(item.comments) ? item.comments : [] }));
  }

  const docs = [];
  const chunkSize = 50;
  for (let i = 0; i < logIds.length; i += chunkSize) {
    const chunk = logIds.slice(i, i + chunkSize);
    const rows = await db.findMany(
      DAILY_LOG_COMMENTS_COLLECTION,
      { log_id: { $in: chunk } },
      { sort: { createTime: 1 }, limit: 2000 }
    );
    docs.push(...(rows || []));
  }

  const byLog = new Map();
  docs.forEach((doc) => {
    const id = doc.log_id;
    if (!id) return;
    if (!byLog.has(id)) byLog.set(id, []);
    const formatted = formatComment(doc);
    if (formatted) byLog.get(id).push(formatted);
  });

  return list.map((item) => {
    const id = item.id || item.log_id;
    return {
      ...item,
      comments: byLog.get(id) || []
    };
  });
}

async function addDailyLogComment(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const logId = event.logId || event.log_id;
  const content = String(event.content || '').trim();
  if (!logId) return { success: false, errMsg: '缺少打卡记录' };
  if (!content) return { success: false, errMsg: '请输入回复内容' };
  if (content.length > MAX_COMMENT_LEN) {
    return { success: false, errMsg: `回复不能超过${MAX_COMMENT_LEN}字` };
  }

  const ctx = await getLogAccessContext(logId, openid);
  if (ctx.error) return { success: false, errMsg: ctx.error };
  const { log, order, isMerchant } = ctx;

  if (isScheduledDoc(log) && log.status !== 'published') {
    return { success: false, errMsg: '定时打卡发送前暂不可评论' };
  }

  let replyToCommentId = String(event.replyToCommentId || event.reply_to_comment_id || '').trim();
  let replyToAuthorName = '';
  if (replyToCommentId) {
    const parent = await db.findOne(DAILY_LOG_COMMENTS_COLLECTION, {
      comment_id: replyToCommentId,
      log_id: logId
    });
    if (!parent) return { success: false, errMsg: '回复的评论不存在' };
    replyToAuthorName = parent.authorName || '';
  }

  const author = await resolveCommentAuthor(openid, isMerchant, order);
  const now = Date.now();
  const doc = {
    comment_id: buildCommentId(),
    log_id: logId,
    order_id: log.order_id,
    store_id: log.store_id || order.store_id || '',
    authorOpenid: openid,
    authorRole: author.authorRole,
    authorName: author.authorName,
    content,
    replyToCommentId: replyToCommentId || '',
    replyToAuthorName,
    createTime: now
  };
  await db.insertOne(DAILY_LOG_COMMENTS_COLLECTION, doc);
  return { success: true, comment: formatComment(doc) };
}

async function listDailyLogComments(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const logId = event.logId || event.log_id;
  if (!logId) return { success: false, errMsg: '缺少打卡记录' };

  const ctx = await getLogAccessContext(logId, openid);
  if (ctx.error) return { success: false, errMsg: ctx.error };

  const rows = await db.findMany(
    DAILY_LOG_COMMENTS_COLLECTION,
    { log_id: logId },
    { sort: { createTime: 1 }, limit: 200 }
  );
  return {
    success: true,
    comments: (rows || []).map(formatComment).filter(Boolean)
  };
}

async function listMerchantDailyLogs(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = event.store_id || event.storeId;
  if (!storeId) return { success: false, errMsg: '缺少店铺信息' };

  const canView = await canManageStore(storeId, openid);
  if (!canView) {
    return { success: false, errMsg: '无权查看打卡记录' };
  }

  const result = await db.findMany('daily_logs', { store_id: storeId }, {
    sort: { createTime: -1 },
    limit: 500
  });
  const logs = (result || [])
    .map(formatLog)
    .sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return { success: true, logs: await attachCommentsToLogs(await enrichLogsMedia(logs)) };
}

function resolveScheduleIntent(payload, options = {}) {
  const scheduledAt = Number(payload.scheduledAt) || 0;
  const wantsSchedule = !!(
    payload.isScheduled
    || payload.status === 'scheduled'
    || scheduledAt > 0
  );
  if (!wantsSchedule) {
    return { isScheduled: false, scheduledAt: 0 };
  }
  if (!Number.isFinite(scheduledAt)) {
    return { error: '请选择完整的发送时间' };
  }
  const minAhead = options.minAheadMs != null ? options.minAheadMs : MIN_SCHEDULE_AHEAD_MS;
  if (scheduledAt <= Date.now() + minAhead) {
    return {
      error: minAhead > 0 ? '请选择至少 1 分钟后的发送时间' : '发送时间必须晚于当前时间'
    };
  }
  return { isScheduled: true, scheduledAt };
}

async function saveDailyLog(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.log || {};
  const orderId = payload.orderId || payload.order_id;
  if (!orderId) return { success: false, errMsg: '缺少订单信息' };

  const checks = Array.isArray(payload.checks) ? payload.checks.filter(Boolean) : [];
  if (!checks.length) {
    return { success: false, errMsg: '请至少选择一项打卡项目' };
  }

  const schedule = resolveScheduleIntent(payload);
  if (schedule.error) {
    return { success: false, errMsg: schedule.error };
  }

  const order = await getOrderById(orderId);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, openid);
  if (!isMerchant) {
    return { success: false, errMsg: '无权为该订单打卡' };
  }
  if (!canDailyCheckOrder(order)) {
    return { success: false, errMsg: '当前订单状态不可打卡' };
  }

  const rawImages = Array.isArray(payload.images) ? payload.images : [];
  const images = sanitizeMediaList(rawImages);
  const videoFields = sanitizeVideoFields(payload);
  if (videoFields.error) {
    return { success: false, errMsg: videoFields.error };
  }
  const { videos, videoCovers, video, videoCover } = videoFields;

  if (rawImages.length && !images.length) {
    return { success: false, errMsg: '图片未上传成功，请重新打卡' };
  }
  if (!images.length && !videos.length) {
    return { success: false, errMsg: '请上传照片或视频' };
  }

  const now = Date.now();
  const isScheduled = !!schedule.isScheduled;
  const scheduledAt = isScheduled ? schedule.scheduledAt : 0;
  // notifyOwner：是否推送宠主；isAbnormal：业务异常标记。二者不可混用。
  const notifyOwner = payload.notifyOwner !== false;
  const isAbnormal = !!(payload.isAbnormal);
  const displayTime = payload.time
    || new Date(isScheduled ? scheduledAt : now).toLocaleString('zh-CN');

  const logData = {
    log_id: buildLogId(),
    order_id: orderId,
    store_id: order.store_id || '',
    merchantOpenid: order.merchantOpenid || openid,
    userOpenid: order.userOpenid || '',
    petName: order.petName || payload.petName || '',
    checks,
    description: payload.description || '',
    images,
    videos,
    videoCovers,
    video,
    videoCover,
    notifyOwner,
    isAbnormal,
    time: displayTime,
    createTime: now,
    status: isScheduled ? 'scheduled' : 'published',
    isScheduled,
    scheduledAt,
    publishedAt: isScheduled ? 0 : now
  };

  await db.ensureCollections([DAILY_LOGS_COLLECTION]);
  await db.insertOne('daily_logs', logData);

  const [savedLog] = await enrichLogsMedia([logData]);
  if (!isScheduled && notifyOwner) {
    notifyService.notifyUserDailyCheck(order, savedLog || formatLog(logData)).catch(() => {});
  }

  return {
    success: true,
    log: savedLog || formatLog(logData),
    scheduled: isScheduled
  };
}

async function listDailyLogsByOrders(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const orderIds = [...new Set((event.orderIds || event.order_ids || []).filter(Boolean))];
  if (!orderIds.length) return { success: true, logs: [] };

  const authorizedOrderIds = [];
  let viewerIsMerchant = false;
  const chunkSize = 20;
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const orderDocs = await db.findMany('orders', { order_id: { $in: chunk } });
    for (const order of orderDocs || []) {
      const isMerchant = await canManageOrder(order, openid);
      const isUser = await isOrderUser(order, openid);
      if (isMerchant) viewerIsMerchant = true;
      if (isMerchant || isUser) {
        authorizedOrderIds.push(order.order_id);
      }
    }
  }

  if (!authorizedOrderIds.length) return { success: true, logs: [] };

  const allDocs = [];
  for (let i = 0; i < authorizedOrderIds.length; i += chunkSize) {
    const chunk = authorizedOrderIds.slice(i, i + chunkSize);
    const result = await db.findMany('daily_logs', { order_id: { $in: chunk } }, { limit: 500 });
    allDocs.push(...(result || []));
  }

  const logs = filterLogsForViewer(
    allDocs.map(formatLog).sort((a, b) => (b.createTime || 0) - (a.createTime || 0)),
    viewerIsMerchant
  );

  return { success: true, logs: await attachCommentsToLogs(await enrichLogsMedia(logs)) };
}

async function listDailyLogs(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const orderId = event.order_id || event.orderId;
  if (!orderId) return { success: false, errMsg: '缺少订单 ID' };

  const order = await getOrderById(orderId);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, openid);
  const isUser = await isOrderUser(order, openid);
  if (!isMerchant && !isUser) {
    return { success: false, errMsg: '无权查看打卡记录' };
  }

  const result = await db.findMany('daily_logs', { order_id: orderId }, {
    sort: { createTime: -1 },
    limit: 100
  });
  const logs = filterLogsForViewer((result || []).map(formatLog), isMerchant);
  return { success: true, logs: await attachCommentsToLogs(await enrichLogsMedia(logs)) };
}

/**
 * 分享落地：凭 log_id 拉取单条已发布打卡。
 * - 任意登录用户可看这一条（不校验订单归属）
 * - 不返回 store_id / order_id，避免顺带绑店或拉取该宠其它数据
 * - 未发布/定时打卡对外视为不存在
 */
async function getSharedDailyLog(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const logId = event.logId || event.log_id;
  if (!logId) return { success: false, errMsg: '缺少打卡记录' };

  const doc = await db.findOne(DAILY_LOGS_COLLECTION, { log_id: logId });
  if (!doc) return { success: false, errMsg: '打卡记录不存在' };

  const formatted = formatLog(doc);
  if (formatted.status === 'scheduled' || formatted.isScheduled) {
    return { success: false, errMsg: '打卡记录不存在' };
  }

  const [enriched] = await enrichLogsMedia([formatted]);
  const log = enriched || formatted;

  let canComment = false;
  try {
    const order = await getOrderById(doc.order_id);
    if (order) {
      const isMerchant = await canManageOrder(order, openid);
      const isUser = await isOrderUser(order, openid);
      canComment = !!(isMerchant || isUser);
    }
  } catch (err) {
    canComment = false;
  }

  // 仅订单相关方可看回复；路人只看动态本体，避免顺带看到宠主私聊
  let comments = [];
  if (canComment) {
    const [withComments] = await attachCommentsToLogs([log]);
    comments = (withComments && withComments.comments) || [];
  }

  return {
    success: true,
    log: {
      id: log.id || log.log_id || logId,
      log_id: log.log_id || log.id || logId,
      petName: log.petName || '',
      checks: Array.isArray(log.checks) ? log.checks : [],
      description: log.description || '',
      images: Array.isArray(log.images) ? log.images : [],
      videos: Array.isArray(log.videos) ? log.videos : [],
      videoCovers: Array.isArray(log.videoCovers) ? log.videoCovers : [],
      videoUrls: Array.isArray(log.videoUrls) ? log.videoUrls : [],
      videoCoverUrls: Array.isArray(log.videoCoverUrls) ? log.videoCoverUrls : [],
      video: log.video || '',
      videoCover: log.videoCover || '',
      videoUrl: log.videoUrl || '',
      videoCoverUrl: log.videoCoverUrl || '',
      time: log.time || '',
      createTime: log.createTime || 0,
      status: 'published',
      isScheduled: false,
      comments,
      shared: true,
      viewOnly: !canComment,
      canComment
    }
  };
}

async function publishDueScheduledLogs() {
  if (scheduleRunning) return { processed: 0, skipped: true };
  scheduleRunning = true;
  try {
    const now = Date.now();
    const dueDocs = await db.findMany('daily_logs', {
      status: 'scheduled',
      scheduledAt: { $lte: now }
    }, {
      sort: { scheduledAt: 1 },
      limit: 50
    });

    let processed = 0;
    for (const doc of dueDocs || []) {
      const logId = doc.log_id;
      if (!logId) continue;

      const updateResult = await db.collection(DAILY_LOGS_COLLECTION).updateOne(
        { log_id: logId, status: 'scheduled' },
        {
          $set: {
            status: 'published',
            isScheduled: false,
            publishedAt: now,
            notifyOwner: true
          }
        }
      );
      if (!updateResult || !updateResult.modifiedCount) continue;

      const updated = await db.findOne(DAILY_LOGS_COLLECTION, { log_id: logId });
      if (!updated) continue;

      const order = await getOrderById(updated.order_id);
      if (!order) {
        console.warn('[daily-schedule] order missing for log', logId);
        processed += 1;
        continue;
      }

      const [enriched] = await enrichLogsMedia([updated]);
      try {
        await notifyService.notifyUserDailyCheck(order, enriched || formatLog(updated));
      } catch (err) {
        console.error('[daily-schedule] notify failed', logId, (err && err.message) || err);
      }
      processed += 1;
    }

    if (processed > 0) {
      console.log(`[daily-schedule] published ${processed} scheduled log(s)`);
    }
    return { processed };
  } finally {
    scheduleRunning = false;
  }
}

function startDailyScheduleWorker() {
  if (scheduleTimer) return;
  const tick = () => {
    publishDueScheduledLogs().catch((err) => {
      console.error('[daily-schedule] tick failed', (err && err.message) || err);
    });
  };
  scheduleTimer = setInterval(tick, SCHEDULE_POLL_MS);
  if (typeof scheduleTimer.unref === 'function') {
    scheduleTimer.unref();
  }
  setTimeout(tick, 5000);
  console.log(`[daily-schedule] worker started, interval=${SCHEDULE_POLL_MS}ms`);
}

async function deleteDailyLog(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const logId = event.logId || event.log_id || (event.log && (event.log.id || event.log.log_id));
  if (!logId) return { success: false, errMsg: '缺少打卡记录 ID' };

  const docs = await db.findMany(DAILY_LOGS_COLLECTION, { log_id: logId }, { limit: 1 });
  const doc = docs && docs[0];
  if (!doc) return { success: false, errMsg: '打卡记录不存在' };

  if (doc.status !== 'scheduled' && !(doc.isScheduled && doc.status !== 'published')) {
    return { success: false, errMsg: '仅未发送的定时打卡可删除' };
  }

  const order = await getOrderById(doc.order_id);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, openid);
  if (!isMerchant) {
    return { success: false, errMsg: '无权删除该打卡记录' };
  }

  const result = await db.collection(DAILY_LOGS_COLLECTION).deleteOne({
    log_id: logId,
    $or: [
      { status: 'scheduled' },
      { isScheduled: true, status: { $ne: 'published' } }
    ]
  });
  if (!result || !result.deletedCount) {
    return { success: false, errMsg: '删除失败，记录可能已发送' };
  }

  return { success: true, logId };
}

async function updateDailyLog(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.log || {};
  const logId = event.logId || event.log_id || payload.id || payload.log_id;
  if (!logId) return { success: false, errMsg: '缺少打卡记录 ID' };

  const docs = await db.findMany(DAILY_LOGS_COLLECTION, { log_id: logId }, { limit: 1 });
  const doc = docs && docs[0];
  if (!doc) return { success: false, errMsg: '打卡记录不存在' };

  if (doc.status !== 'scheduled' && !(doc.isScheduled && doc.status !== 'published')) {
    return { success: false, errMsg: '仅未发送的定时打卡可修改' };
  }

  const order = await getOrderById(doc.order_id);
  if (!order) return { success: false, errMsg: '订单不存在' };

  const isMerchant = await canManageOrder(order, openid);
  if (!isMerchant) {
    return { success: false, errMsg: '无权修改该打卡记录' };
  }
  if (!canDailyCheckOrder(order)) {
    return { success: false, errMsg: '当前订单状态不可修改定时打卡' };
  }

  const checks = Array.isArray(payload.checks) ? payload.checks.filter(Boolean) : [];
  if (!checks.length) {
    return { success: false, errMsg: '请至少选择一项打卡项目' };
  }

  const schedule = resolveScheduleIntent({
    ...payload,
    isScheduled: true,
    status: 'scheduled',
    scheduledAt: payload.scheduledAt || doc.scheduledAt
  }, {
    // 修改时允许保留原定时点（只要还没到）
    minAheadMs: Number(payload.scheduledAt) === Number(doc.scheduledAt) ? 0 : MIN_SCHEDULE_AHEAD_MS
  });
  if (schedule.error) {
    return { success: false, errMsg: schedule.error };
  }

  const rawImages = Array.isArray(payload.images) ? payload.images : (doc.images || []);
  const images = sanitizeMediaList(rawImages);
  const hasVideoPayload = payload.videos != null
    || payload.video != null
    || payload.videoCovers != null
    || payload.videoCover != null;
  const videoFields = sanitizeVideoFields(
    hasVideoPayload ? payload : {},
    hasVideoPayload ? {} : doc
  );
  if (videoFields.error) {
    return {
      success: false,
      errMsg: String(videoFields.error).replace('请重新打卡', '请重新选择')
    };
  }
  const { videos, videoCovers, video, videoCover } = videoFields;

  if (rawImages.length && !images.length) {
    return { success: false, errMsg: '图片未上传成功，请重新选择' };
  }
  if (!images.length && !videos.length) {
    return { success: false, errMsg: '请上传照片或视频' };
  }

  const now = Date.now();
  const scheduledAt = schedule.scheduledAt;
  const displayTime = payload.time
    || new Date(scheduledAt).toLocaleString('zh-CN');

  const patch = {
    checks,
    description: payload.description != null ? payload.description : (doc.description || ''),
    images,
    videos,
    videoCovers,
    video,
    videoCover,
    notifyOwner: true,
    isAbnormal: false,
    time: displayTime,
    status: 'scheduled',
    isScheduled: true,
    scheduledAt,
    publishedAt: 0,
    updateTime: now
  };

  const result = await db.collection(DAILY_LOGS_COLLECTION).updateOne(
    {
      log_id: logId,
      $or: [
        { status: 'scheduled' },
        { isScheduled: true, status: { $ne: 'published' } }
      ]
    },
    { $set: patch }
  );
  if (!result || !result.matchedCount) {
    return { success: false, errMsg: '修改失败，记录可能已发送' };
  }

  const updated = await db.findOne(DAILY_LOGS_COLLECTION, { log_id: logId });
  const [savedLog] = await enrichLogsMedia([updated || { ...doc, ...patch, log_id: logId }]);
  return {
    success: true,
    log: savedLog || formatLog(updated || { ...doc, ...patch, log_id: logId }),
    scheduled: true
  };
}

/**
 * 宠主打开动态页后标记已查看（仅订单宠主可写，商家可见 userViewedAt）。
 */
async function markDailyLogsViewed(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const logIds = [...new Set(
    (event.logIds || event.log_ids || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )].slice(0, 100);
  if (!logIds.length) return { success: true, marked: 0 };

  const now = Date.now();
  let marked = 0;
  const chunkSize = 20;
  for (let i = 0; i < logIds.length; i += chunkSize) {
    const chunk = logIds.slice(i, i + chunkSize);
    const docs = await db.findMany(DAILY_LOGS_COLLECTION, { log_id: { $in: chunk } }, { limit: chunk.length });
    for (const doc of docs || []) {
      if (!doc || !doc.log_id) continue;
      if (doc.status === 'scheduled' || isScheduledDoc(doc)) continue;
      if (Number(doc.userViewedAt) > 0) continue;
      const order = await getOrderById(doc.order_id);
      if (!order) continue;
      const isUser = await isOrderUser(order, openid);
      if (!isUser) continue;
      const result = await db.collection(DAILY_LOGS_COLLECTION).updateOne(
        {
          log_id: doc.log_id,
          $or: [
            { userViewedAt: { $exists: false } },
            { userViewedAt: null },
            { userViewedAt: 0 },
            { userViewedAt: { $lte: 0 } }
          ]
        },
        { $set: { userViewedAt: now, updateTime: now } }
      );
      if (result && result.modifiedCount) marked += 1;
    }
  }

  return { success: true, marked };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'initDatabase':
      return initDailyDatabase();
    case 'saveDailyLog':
      return saveDailyLog(event, openid);
    case 'updateDailyLog':
      return updateDailyLog(event, openid);
    case 'deleteDailyLog':
      return deleteDailyLog(event, openid);
    case 'listDailyLogs':
      return listDailyLogs(event, openid);
    case 'listDailyLogsByOrders':
      return listDailyLogsByOrders(event, openid);
    case 'listMerchantDailyLogs':
      return listMerchantDailyLogs(event, openid);
    case 'getSharedDailyLog':
      return getSharedDailyLog(event, openid);
    case 'markDailyLogsViewed':
      return markDailyLogsViewed(event, openid);
    case 'addDailyLogComment':
      return addDailyLogComment(event, openid);
    case 'listDailyLogComments':
      return listDailyLogComments(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = {
  handle,
  startDailyScheduleWorker,
  publishDueScheduledLogs,
  initDailyDatabase
};
