const { callApiService } = require('./api');
const { dedupeDailyLogs } = require('./dailyLogUtil');

function callDailyService(action, data = {}) {
  return callApiService('dailyService', { action, ...data });
}

function saveDailyLog(log) {
  return callDailyService('saveDailyLog', { log });
}

function updateDailyLog(log) {
  const logId = log && (log.id || log.log_id);
  return callDailyService('updateDailyLog', { logId, log });
}

function deleteDailyLog(logId) {
  return callDailyService('deleteDailyLog', { logId });
}

function listDailyLogs(orderId) {
  return callDailyService('listDailyLogs', { orderId });
}

function listDailyLogsByOrders(orderIds) {
  return callDailyService('listDailyLogsByOrders', { orderIds });
}

function listMerchantDailyLogs(storeId) {
  return callDailyService('listMerchantDailyLogs', { storeId });
}

function initDatabase() {
  return callDailyService('initDatabase');
}

/** 仅从服务端拉取，不读写本地 storage */
function fetchDailyLogs(orderId) {
  if (!orderId) return Promise.resolve([]);
  return listDailyLogs(orderId)
    .then((res) => (res.success && Array.isArray(res.logs) ? res.logs : []))
    .catch((err) => {
      console.error('[打卡] 拉取服务端记录失败', err);
      return [];
    });
}

function fetchDailyLogsForOrders(orderIds) {
  const ids = [...new Set((orderIds || []).filter(Boolean))];
  if (!ids.length) return Promise.resolve([]);

  const fetchOneByOne = () => Promise.all(ids.map((id) => fetchDailyLogs(id)))
    .then((lists) => lists.reduce((acc, item) => acc.concat(item), []));

  return listDailyLogsByOrders(ids)
    .then((res) => {
      if (res && res.success && Array.isArray(res.logs)) {
        return res.logs;
      }
      const errMsg = (res && res.errMsg) || '';
      if (!res || !res.success) {
        console.warn('[打卡] 批量接口不可用，改逐单拉取', errMsg);
        return fetchOneByOne();
      }
      return [];
    })
    .catch((err) => {
      console.error('[打卡] 批量拉取服务端记录失败，改逐单拉取', err);
      return fetchOneByOne();
    });
}

function fetchMerchantDailyLogs(storeId) {
  if (!storeId) return Promise.resolve([]);
  return listMerchantDailyLogs(storeId)
    .then((res) => (res.success && Array.isArray(res.logs) ? res.logs : []))
    .catch((err) => {
      console.error('[打卡] 拉取商家打卡记录失败', err);
      return [];
    });
}

/** 商家端：店铺全量 + 在住订单批量拉取，合并去重 */
function fetchMerchantBoardingLogs(storeId, orderIds = []) {
  const ids = [...new Set((orderIds || []).filter(Boolean))];
  const tasks = [fetchMerchantDailyLogs(storeId)];
  if (ids.length) {
    tasks.push(fetchDailyLogsForOrders(ids));
  }
  return Promise.all(tasks)
    .then(([storeLogs, orderLogs]) => dedupeDailyLogs([].concat(storeLogs, orderLogs || [])))
    .catch((err) => {
      console.error('[打卡] 拉取商家在住打卡记录失败', err);
      return [];
    });
}

function addDailyLogComment({ logId, content, replyToCommentId } = {}) {
  return callDailyService('addDailyLogComment', {
    logId,
    content,
    replyToCommentId: replyToCommentId || ''
  });
}

function listDailyLogComments(logId) {
  return callDailyService('listDailyLogComments', { logId });
}

function getSharedDailyLog(logId) {
  return callDailyService('getSharedDailyLog', { logId });
}

/** 分享落地：按 log_id 拉取已发布打卡（不绑店） */
function fetchSharedDailyLog(logId) {
  const id = String(logId || '').trim();
  if (!id) return Promise.resolve(null);
  return getSharedDailyLog(id)
    .then((res) => (res && res.success && res.log ? res.log : null))
    .catch((err) => {
      console.error('[打卡] 拉取分享打卡失败', err);
      return null;
    });
}

function markDailyLogsViewed(logIds) {
  const ids = [...new Set((logIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return Promise.resolve({ success: true, marked: 0 });
  return callDailyService('markDailyLogsViewed', { logIds: ids });
}

/** 宠主打开动态后上报已查看（失败静默） */
function reportDailyLogsViewed(logIds) {
  return markDailyLogsViewed(logIds).catch((err) => {
    console.warn('[打卡] 标记已查看失败', err);
    return null;
  });
}

module.exports = {
  saveDailyLog,
  updateDailyLog,
  deleteDailyLog,
  listDailyLogs,
  listDailyLogsByOrders,
  listMerchantDailyLogs,
  getSharedDailyLog,
  initDatabase,
  fetchDailyLogs,
  fetchDailyLogsForOrders,
  fetchMerchantDailyLogs,
  fetchMerchantBoardingLogs,
  fetchSharedDailyLog,
  markDailyLogsViewed,
  reportDailyLogsViewed,
  addDailyLogComment,
  listDailyLogComments
};
