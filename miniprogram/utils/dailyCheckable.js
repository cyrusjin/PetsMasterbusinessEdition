const { formatOrderStatus } = require('./orderStatus');

const BOARDING_CHECK_ITEMS = [
  { key: 'feed', label: '喂食', icon: '🍖', checked: false },
  { key: 'water', label: '饮水', icon: '💧', checked: false },
  { key: 'walk', label: '遛弯', icon: '🚶', checked: false },
  { key: 'poop', label: '排便', icon: '💩', checked: false },
  { key: 'play', label: '玩耍', icon: '🎾', checked: false },
  { key: 'medicine', label: '喂药', icon: '💊', checked: false },
  { key: 'spirit', label: '精神状态', icon: '😊', checked: true },
  { key: 'arrival', label: '到店检查', icon: '🏠', checked: false },
  { key: 'departure', label: '离店检查', icon: '🚪', checked: false }
];

const WASH_CHECK_ITEMS = [
  { key: 'arrival', label: '到店检查', icon: '🏠', checked: false },
  { key: 'bath', label: '洗澡', icon: '🛁', checked: false },
  { key: 'dry', label: '吹干', icon: '💨', checked: false },
  { key: 'trim', label: '修剪', icon: '✂️', checked: false },
  { key: 'skin', label: '皮肤检查', icon: '🔍', checked: false },
  { key: 'spirit', label: '精神状态', icon: '😊', checked: true },
  { key: 'handover', label: '完成交接', icon: '🤝', checked: false }
];

const HOME_CAT_CHECK_ITEMS = [
  { key: 'feed', label: '喂食', icon: '🍖', checked: false },
  { key: 'water', label: '换水', icon: '💧', checked: false },
  { key: 'litter', label: '清理猫砂', icon: '🧹', checked: false },
  { key: 'play', label: '陪伴', icon: '🎾', checked: false },
  { key: 'safety', label: '安全检查', icon: '🔒', checked: false },
  { key: 'spirit', label: '精神状态', icon: '😊', checked: true },
  { key: 'env', label: '环境拍照', icon: '📷', checked: false }
];

const HOME_DOG_CHECK_ITEMS = [
  { key: 'feed', label: '喂食', icon: '🍖', checked: false },
  { key: 'water', label: '换水', icon: '💧', checked: false },
  { key: 'walk', label: '遛狗', icon: '🚶', checked: false },
  { key: 'poop', label: '排便', icon: '💩', checked: false },
  { key: 'play', label: '玩耍', icon: '🎾', checked: false },
  { key: 'safety', label: '安全检查', icon: '🔒', checked: false },
  { key: 'spirit', label: '精神状态', icon: '😊', checked: true }
];

function cloneCheckItems(list) {
  return (list || []).map((item) => ({ ...item }));
}

function getOrderServiceKind(order) {
  const raw = String((order && (order.serviceKind || order.serviceLine)) || '').trim();
  if (raw === 'wash' || raw === 'homeFeeding') return raw;
  const snapLine = order && order.feeSnapshot && order.feeSnapshot.serviceLine;
  if (snapLine === 'wash' || snapLine === 'homeFeeding') return snapLine;
  const type = String((order && order.serviceType) || '');
  if (type.indexOf('洗护') >= 0 || type.indexOf('美容') >= 0) return 'wash';
  if (type.indexOf('上门') >= 0) return 'homeFeeding';
  if (order && order.feeSnapshot && order.feeSnapshot.visit) return 'homeFeeding';
  return 'boarding';
}

function getOrderServiceLabel(kindOrOrder) {
  const kind = typeof kindOrOrder === 'string' ? kindOrOrder : getOrderServiceKind(kindOrOrder);
  if (kind === 'wash') return '美容洗护';
  if (kind === 'homeFeeding') return '上门喂养';
  return '到店寄养';
}

function isSameDayServiceKind(kind) {
  return kind === 'wash' || kind === 'homeFeeding';
}

function isDailyCheckableOrder(order) {
  if (!order) return false;
  const status = order.status;
  if (status === 'boarding') return true;
  if (status !== 'awaiting_arrival' && status !== 'confirmed') return false;
  return isSameDayServiceKind(getOrderServiceKind(order));
}

function filterDailyCheckableOrders(orders) {
  return (orders || []).filter(isDailyCheckableOrder);
}

function formatServiceStatus(order) {
  if (!order) return '--';
  const kind = getOrderServiceKind(order);
  const status = order.status;
  if (status === 'boarding') {
    if (kind === 'wash') return '洗护中';
    if (kind === 'homeFeeding') return '上门中';
    return '寄养中';
  }
  if (status === 'awaiting_arrival') {
    if (kind === 'homeFeeding') return '待上门';
    return '待到店';
  }
  if (status === 'confirmed' && (kind === 'wash' || kind === 'homeFeeding')) {
    return '已接单';
  }
  return formatOrderStatus(status);
}

function getAcceptServiceCopy(order) {
  const kind = getOrderServiceKind(order);
  if (kind === 'wash') {
    return { title: '确认接单', content: '确认接收此洗护预约吗？' };
  }
  if (kind === 'homeFeeding') {
    return { title: '确认接单', content: '确认接收此上门预约吗？' };
  }
  return { title: '确认接单', content: '确认接收此寄养预约吗？' };
}

function getStartServiceCopy(order) {
  const kind = getOrderServiceKind(order);
  if (kind === 'wash') {
    return {
      title: '开始洗护',
      content: '确认宠物已到店，开始洗护服务吗？',
      toast: '已开始洗护',
      button: '开始洗护'
    };
  }
  if (kind === 'homeFeeding') {
    return {
      title: '开始上门',
      content: '确认开始上门服务吗？',
      toast: '已开始服务',
      button: '开始上门'
    };
  }
  return {
    title: '确认到店',
    content: '确认宠物已到店，开始寄养服务吗？',
    toast: '已确认到店',
    button: '确认到店'
  };
}

function getCompleteServiceCopy(order) {
  const kind = getOrderServiceKind(order);
  if (kind === 'wash') {
    return { title: '结束服务', content: '确认结束洗护服务吗？', button: '结束服务' };
  }
  if (kind === 'homeFeeding') {
    return { title: '结束服务', content: '确认结束上门服务吗？', button: '结束服务' };
  }
  return { title: '结束寄养', content: '确认结束寄养服务吗？', button: '结束寄养' };
}

function getHomeVisitKind(order) {
  const visit = order && order.feeSnapshot && order.feeSnapshot.visit;
  const snapKind = String((visit && visit.petKind) || '').trim();
  if (snapKind === 'cat' || snapKind === 'dog') return snapKind;
  const type = String((order && (order.petType || order.petKind)) || '');
  if (type.indexOf('猫') >= 0 || type.toLowerCase() === 'cat') return 'cat';
  if (type.indexOf('狗') >= 0 || type.indexOf('犬') >= 0 || type.toLowerCase() === 'dog') return 'dog';
  return '';
}

function getCheckItemsForOrder(order) {
  const kind = getOrderServiceKind(order);
  if (kind === 'wash') return cloneCheckItems(WASH_CHECK_ITEMS);
  if (kind === 'homeFeeding') {
    const visitKind = getHomeVisitKind(order);
    if (visitKind === 'cat') return cloneCheckItems(HOME_CAT_CHECK_ITEMS);
    if (visitKind === 'dog') return cloneCheckItems(HOME_DOG_CHECK_ITEMS);
    return mergeCheckItemLists([HOME_CAT_CHECK_ITEMS, HOME_DOG_CHECK_ITEMS], []);
  }
  return cloneCheckItems(BOARDING_CHECK_ITEMS);
}

function mergeCheckItemLists(lists, previousItems) {
  const prevMap = {};
  (previousItems || []).forEach((item) => {
    if (item && item.key) prevMap[item.key] = item;
  });
  const seen = {};
  const result = [];
  (lists || []).forEach((list) => {
    (list || []).forEach((item) => {
      if (!item || !item.key || seen[item.key]) return;
      seen[item.key] = true;
      const prev = prevMap[item.key];
      result.push({
        ...item,
        checked: prev ? !!prev.checked : !!item.checked
      });
    });
  });
  return result;
}

function getDefaultCheckItems() {
  return cloneCheckItems(BOARDING_CHECK_ITEMS);
}

function getDailyCheckItemsForOrders(orders, previousItems) {
  const list = orders || [];
  if (!list.length) {
    return mergeCheckItemLists([BOARDING_CHECK_ITEMS], previousItems);
  }
  return mergeCheckItemLists(list.map(getCheckItemsForOrder), previousItems);
}

module.exports = {
  getOrderServiceKind,
  getOrderServiceLabel,
  isSameDayServiceKind,
  isDailyCheckableOrder,
  filterDailyCheckableOrders,
  formatServiceStatus,
  getAcceptServiceCopy,
  getStartServiceCopy,
  getCompleteServiceCopy,
  getDefaultCheckItems,
  getDailyCheckItemsForOrders
};
