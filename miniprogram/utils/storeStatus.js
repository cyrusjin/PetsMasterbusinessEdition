const STATUS_OPEN = '营业中';
const STATUS_CLOSED = '已闭店';
const STATUS_INCOMPLETE = '未营业';

const LEGACY_CLOSED = ['暂停接单', '已闭店'];

function normalizeStoreStatus(status) {
  if (status === STATUS_INCOMPLETE) return STATUS_INCOMPLETE;
  if (LEGACY_CLOSED.includes(status)) return STATUS_CLOSED;
  return STATUS_OPEN;
}

function isStoreOpenForUsers(status) {
  return normalizeStoreStatus(status) === STATUS_OPEN;
}

function getStatusConfirmContent(nextStatus) {
  if (nextStatus === STATUS_OPEN) {
    return '确定切换为「营业中」吗？宠主将可以正常预约下单。';
  }
  return '确定切换为「已闭店」吗？店铺将暂停接收新订单。';
}

module.exports = {
  STATUS_OPEN,
  STATUS_CLOSED,
  STATUS_INCOMPLETE,
  normalizeStoreStatus,
  isStoreOpenForUsers,
  getStatusConfirmContent
};
