const { STORAGE_KEYS } = require('./constants');
const { dedupeDailyLogs } = require('./dailyLogUtil');
const { attachStoreDisplayNo } = require('./displayNo');

const DEMO_STORE_ID = 'demo_store';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${h}:${min}`;
}

/** 商家端演示/体验模式已关闭：未入驻只走门店授权，不再注入本地假订单 */
function isMerchantDemoMode() {
  return false;
}

/** 清除历史本地演示种子（保留入驻申请草稿） */
function clearDemoRuntimeData() {
  try {
    wx.removeStorageSync(STORAGE_KEYS.DEMO_INITIALIZED);
    wx.removeStorageSync(STORAGE_KEYS.DEMO_ORDERS);
    wx.removeStorageSync(STORAGE_KEYS.DEMO_PETS);
    wx.removeStorageSync(STORAGE_KEYS.DEMO_DAILY_LOGS);
    wx.removeStorageSync(STORAGE_KEYS.DEMO_SHOP);
    wx.removeStorageSync(STORAGE_KEYS.DEMO_CONTRACTS);
  } catch (err) {
    // ignore
  }
}

function isDemoEntityId(id) {
  return String(id || '').startsWith('demo_');
}

function buildSeedData() {
  const now = Date.now();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);

  const pets = [
    {
      id: 'demo_pet_1',
      name: '毛毛',
      type: '狗',
      breed: '金毛',
      gender: '公',
      age: 3,
      weight: 28,
      color: '金色',
      vaccination: '已接种',
      dewormDate: formatDate(threeDaysAgo),
      allergyStatus: '否',
      medicalHistoryStatus: '否',
      isPregnant: '否',
      inHeat: '否',
      isNeutered: '是',
      hasDogLicense: '是',
      character: '温顺活泼',
      dietTaboo: '无',
      specialCare: '每日遛弯',
      remark: '',
      photo: ''
    },
    {
      id: 'demo_pet_2',
      name: '橙子',
      type: '狗',
      breed: '柯基',
      gender: '母',
      age: 2,
      weight: 12,
      color: '黄白',
      vaccination: '已接种',
      dewormDate: formatDate(yesterday),
      allergyStatus: '否',
      medicalHistoryStatus: '否',
      isPregnant: '否',
      inHeat: '否',
      isNeutered: '是',
      hasDogLicense: '否',
      character: '亲人',
      dietTaboo: '无',
      specialCare: '',
      remark: '',
      photo: ''
    },
    {
      id: 'demo_pet_3',
      name: '豆豆',
      type: '狗',
      breed: '泰迪',
      gender: '公',
      age: 1,
      weight: 5,
      color: '棕色',
      vaccination: '已接种',
      dewormDate: formatDate(today),
      allergyStatus: '否',
      medicalHistoryStatus: '否',
      isPregnant: '否',
      inHeat: '否',
      isNeutered: '否',
      hasDogLicense: '否',
      character: '粘人',
      dietTaboo: '不吃鸡肉',
      specialCare: '',
      remark: '',
      photo: ''
    }
  ];

  const orders = [
    {
      id: 'demo_ord_1',
      order_id: 'demo_ord_1',
      store_id: DEMO_STORE_ID,
      petId: 'demo_pet_3',
      petName: '豆豆',
      petType: '狗',
      petGender: '公',
      petAge: 1,
      petBreed: '泰迪',
      petWeight: 5,
      serviceType: '寄养预约',
      startDate: formatDate(tomorrow),
      endDate: formatDate(new Date(today.getTime() + 4 * 86400000)),
      status: 'pending',
      totalFee: 280,
      boardingFee: 280,
      shippingFee: 0,
      createTime: now - 3600000,
      contactName: '张女士',
      contactPhone: '13800001234',
      petSnapshot: buildPetSnapshotFromPet(pets[2])
    },
    {
      id: 'demo_ord_2',
      order_id: 'demo_ord_2',
      store_id: DEMO_STORE_ID,
      petId: 'demo_pet_1',
      petName: '毛毛',
      petType: '狗',
      petGender: '公',
      petAge: 3,
      petBreed: '金毛',
      petWeight: 28,
      serviceType: '寄养预约',
      startDate: formatDate(threeDaysAgo),
      endDate: formatDate(tomorrow),
      status: 'awaiting_arrival',
      totalFee: 620,
      boardingFee: 560,
      shippingFee: 60,
      needPickup: true,
      pickupIncludeOutbound: true,
      pickupIncludeReturn: true,
      pickupOutboundDone: false,
      pickupReturnDone: false,
      pickupAddress: '上海市浦东新区世纪大道100号',
      pickupLocationName: '世纪大道100号',
      pickupLatitude: 31.2354,
      pickupLongitude: 121.5055,
      pickupContactPhone: '13900005678',
      pickupTime: '10:00',
      startTime: '10:00',
      endTime: '18:00',
      createTime: now - 3 * 86400000,
      contactName: '李先生',
      contactPhone: '13900005678',
      petSnapshot: buildPetSnapshotFromPet(pets[0])
    },
    {
      id: 'demo_ord_3',
      order_id: 'demo_ord_3',
      store_id: DEMO_STORE_ID,
      petId: 'demo_pet_2',
      petName: '橙子',
      petType: '狗',
      petGender: '母',
      petAge: 2,
      petBreed: '柯基',
      petWeight: 12,
      serviceType: '寄养预约',
      startDate: formatDate(yesterday),
      endDate: formatDate(today),
      status: 'boarding',
      totalFee: 480,
      boardingFee: 420,
      shippingFee: 60,
      needPickup: true,
      pickupIncludeOutbound: false,
      pickupIncludeReturn: true,
      pickupOutboundDone: false,
      pickupReturnDone: false,
      pickupAddress: '上海市静安区南京西路1266号',
      pickupLocationName: '南京西路1266号',
      pickupLatitude: 31.2286,
      pickupLongitude: 121.4478,
      pickupContactPhone: '13700009012',
      pickupTime: '16:00',
      startTime: '09:00',
      endTime: '16:00',
      createTime: now - 2 * 86400000,
      contactName: '王女士',
      contactPhone: '13700009012',
      petSnapshot: buildPetSnapshotFromPet(pets[1])
    },
    {
      id: 'demo_ord_4',
      order_id: 'demo_ord_4',
      store_id: DEMO_STORE_ID,
      petId: 'demo_pet_3',
      petName: '小白',
      petType: '狗',
      petGender: '母',
      petAge: 2,
      petBreed: '比熊',
      petWeight: 6,
      serviceType: '寄养预约',
      startDate: formatDate(new Date(today.getTime() - 10 * 86400000)),
      endDate: formatDate(new Date(today.getTime() - 5 * 86400000)),
      status: 'completed',
      totalFee: 350,
      boardingFee: 350,
      shippingFee: 0,
      createTime: now - 12 * 86400000,
      contactName: '赵先生',
      contactPhone: '13600003456',
      petSnapshot: {
        name: '小白',
        breed: '比熊',
        type: '狗',
        gender: '母',
        weight: '6',
        age: '2'
      }
    }
  ];

  const morning = new Date(today);
  morning.setHours(9, 30, 0, 0);
  const afternoon = new Date(today);
  afternoon.setHours(15, 0, 0, 0);

  const dailyLogs = [
    {
      id: 'demo_log_1',
      orderId: 'demo_ord_2',
      petName: '毛毛',
      checks: ['喂食', '饮水', '遛弯', '精神状态'],
      description: '早上喂食正常，精神状态良好，遛弯 30 分钟。',
      images: [],
      video: '',
      time: formatDateTime(morning),
      createTime: morning.getTime(),
      isAbnormal: false
    },
    {
      id: 'demo_log_2',
      orderId: 'demo_ord_3',
      petName: '橙子',
      checks: ['喂食', '饮水', '排便', '精神状态'],
      description: '食欲正常，排便正常。',
      images: [],
      video: '',
      time: formatDateTime(morning),
      createTime: morning.getTime() + 60000,
      isAbnormal: false
    },
    {
      id: 'demo_log_3',
      orderId: 'demo_ord_2',
      petName: '毛毛',
      checks: ['喂食', '玩耍', '精神状态'],
      description: '下午加餐，在院子里玩耍。',
      images: [],
      video: '',
      time: formatDateTime(afternoon),
      createTime: afternoon.getTime(),
      isAbnormal: false
    }
  ];

  const shop = {
    store_id: DEMO_STORE_ID,
    name: '萌宠寄养体验店',
    status: '营业中',
    address: '体验模式 · 数据仅保存在本地',
    isDemo: true
  };

  return { pets, orders, dailyLogs, shop };
}

function buildPetSnapshotFromPet(pet) {
  if (!pet) return null;
  return {
    photo: pet.photo || '',
    breed: pet.breed || '',
    gender: pet.gender || '',
    age: pet.age != null ? String(pet.age) : '',
    weight: pet.weight != null ? String(pet.weight) : '',
    color: pet.color || '',
    vaccination: pet.vaccination || '',
    dewormDate: pet.dewormDate || '',
    allergyStatus: pet.allergyStatus || '',
    allergy: pet.allergy || '',
    medicalHistoryStatus: pet.medicalHistoryStatus || '',
    medicalHistory: pet.medicalHistory || '',
    isPregnant: pet.isPregnant || '',
    inHeat: pet.inHeat || '',
    isNeutered: pet.isNeutered || '',
    hasDogLicense: pet.hasDogLicense || '',
    character: pet.character || '',
    dietTaboo: pet.dietTaboo || '',
    specialCare: pet.specialCare || '',
    remark: pet.remark || ''
  };
}

function _get(key) {
  return wx.getStorageSync(key) || null;
}

function _set(key, value) {
  wx.setStorageSync(key, value);
}

function ensureDemoData() {
  // 演示模式已关闭，不再写入本地种子
}

function resetDemoData() {
  clearDemoRuntimeData();
}

function getDemoOrders() {
  return [];
}

function getDemoPets() {
  return [];
}

function getDemoDailyLogs() {
  return [];
}

function getDemoShop() {
  return null;
}

function getDemoContracts() {
  return [];
}

function saveDemoShop(shop) {
  const saved = attachStoreDisplayNo({ ...getDemoShop(), ...shop, store_id: DEMO_STORE_ID, isDemo: true });
  _set(STORAGE_KEYS.DEMO_SHOP, saved);
  return saved;
}

function updateDemoOrder(id, updates) {
  const orders = getDemoOrders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  Object.assign(orders[idx], updates, { store_id: DEMO_STORE_ID });
  _set(STORAGE_KEYS.DEMO_ORDERS, orders);
  return orders[idx];
}

function saveDemoDailyLog(log) {
  const logs = getDemoDailyLogs();
  const entry = {
    ...log,
    id: log.id || `demo_log_${Date.now()}`,
    createTime: log.createTime || Date.now()
  };
  logs.push(entry);
  _set(STORAGE_KEYS.DEMO_DAILY_LOGS, dedupeDailyLogs(logs));
  return entry;
}

function updateDemoDailyLog(log) {
  const id = String((log && (log.id || log.log_id)) || '').trim();
  if (!id) return null;
  const logs = getDemoDailyLogs();
  const idx = logs.findIndex((item) => (item.id || item.log_id) === id);
  if (idx < 0) return null;
  const target = logs[idx];
  const scheduled = target.status === 'scheduled' || !!target.isScheduled;
  if (!scheduled || target.status === 'published') return null;
  const entry = {
    ...target,
    ...log,
    id,
    log_id: id,
    status: 'scheduled',
    isScheduled: true,
    updateTime: Date.now()
  };
  logs[idx] = entry;
  _set(STORAGE_KEYS.DEMO_DAILY_LOGS, dedupeDailyLogs(logs));
  return entry;
}

function deleteDemoDailyLog(logId) {
  const id = String(logId || '').trim();
  if (!id) return false;
  const logs = getDemoDailyLogs();
  const next = logs.filter((item) => {
    const itemId = item.id || item.log_id;
    if (itemId !== id) return true;
    const scheduled = item.status === 'scheduled' || !!item.isScheduled;
    return !scheduled;
  });
  if (next.length === logs.length) return false;
  _set(STORAGE_KEYS.DEMO_DAILY_LOGS, dedupeDailyLogs(next));
  return true;
}

function saveDemoContract(contract) {
  const contracts = getDemoContracts();
  const entry = {
    ...contract,
    id: contract.id || `demo_ctr_${Date.now()}`,
    createTime: contract.createTime || Date.now()
  };
  const idx = contracts.findIndex((c) => c.id === entry.id);
  if (idx >= 0) contracts[idx] = entry;
  else contracts.push(entry);
  _set(STORAGE_KEYS.DEMO_CONTRACTS, contracts);
  return entry;
}

function getDemoApplyDraft() {
  return _get(STORAGE_KEYS.DEMO_APPLY_DRAFT) || null;
}

function saveDemoApplyDraft(draft) {
  _set(STORAGE_KEYS.DEMO_APPLY_DRAFT, draft);
}

/** 商家审核通过后，清理体验模式运行时状态，避免污染正式数据 */
function onMerchantApproved(app) {
  clearDemoRuntimeData();
  if (!app) return;
  if (app.globalData.merchantStoreId === DEMO_STORE_ID) {
    app.globalData.merchantStoreId = '';
  }
  app._ordersFetchedAt = 0;
  app._userOrdersFetchedAt = 0;
  app._merchantOrdersFetchedAt = 0;
  app._petsFetchedAt = 0;
  app._merchantStoreFetchedAt = 0;
  app._loadOrdersPromise = null;
  app._userLoadOrdersPromise = null;
  app._merchantLoadOrdersPromise = null;
  app._loadPetsPromise = null;
  app._merchantStorePromise = null;
  app._loadDailyLogsPromise = null;
  if (typeof app._resetOrdersFetchState === 'function') {
    app._resetOrdersFetchState();
  }
}

module.exports = {
  DEMO_STORE_ID,
  isMerchantDemoMode,
  isDemoEntityId,
  clearDemoRuntimeData,
  ensureDemoData,
  resetDemoData,
  getDemoOrders,
  getDemoPets,
  getDemoDailyLogs,
  getDemoShop,
  getDemoContracts,
  saveDemoShop,
  updateDemoOrder,
  saveDemoDailyLog,
  updateDemoDailyLog,
  deleteDemoDailyLog,
  saveDemoContract,
  getDemoApplyDraft,
  saveDemoApplyDraft,
  onMerchantApproved
};
