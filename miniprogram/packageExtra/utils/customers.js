const { formatOrderCreateTime, ORDER_STATUS } = require('../../utils/util');
const { buildOrderListPetMeta } = require('../../utils/petSnapshot');
const { formatAgeText } = require('../../utils/petAge');

function trimText(value) {
  return value == null ? '' : String(value).trim();
}

function getCustomerKey(order) {
  if (!order) return '';
  const phone = trimText(order.contactPhone || order.userPhone);
  if (phone) return `phone:${phone}`;
  const openid = trimText(order.openid || order.userOpenid || order._openid || order.user_id);
  if (openid) return `openid:${openid}`;
  const name = trimText(order.contactName || order.userNickName);
  if (name) return `name:${name}`;
  const orderId = trimText(order.id || order.order_id);
  return orderId ? `order:${orderId}` : '';
}

function getPetKey(order) {
  if (!order) return '';
  const petId = trimText(order.petId);
  if (petId) return `id:${petId}`;
  const name = trimText(order.petName || (order.petSnapshot && order.petSnapshot.name));
  if (name) return `name:${name}`;
  return '';
}

function pickPetFromOrder(order) {
  const snapshot = order.petSnapshot || {};
  const name = trimText(order.petName || snapshot.name) || '未命名宠物';
  const breed = trimText(order.petBreed || snapshot.breed);
  const gender = trimText(order.petGender || snapshot.gender);
  const age = order.petAge != null && order.petAge !== ''
    ? order.petAge
    : (snapshot.age != null && snapshot.age !== '' ? snapshot.age : '');
  const type = trimText(order.petType || snapshot.type);
  const weight = order.petWeight != null && order.petWeight !== ''
    ? order.petWeight
    : (snapshot.weight != null && snapshot.weight !== '' ? snapshot.weight : '');
  const photo = trimText(order.petPhoto || snapshot.photo);
  const ageText = formatAgeText({
    age,
    ageYears: snapshot.ageYears != null ? snapshot.ageYears : order.petAgeYears,
    ageMonths: snapshot.ageMonths != null ? snapshot.ageMonths : order.petAgeMonths
  });
  const metaParts = [type, breed, gender, ageText]
    .map(trimText)
    .filter(Boolean);

  return {
    key: getPetKey(order),
    petId: trimText(order.petId),
    name,
    type,
    breed,
    gender,
    age,
    ageText: ageText || '',
    weight,
    weightText: weight !== '' && weight != null ? `${weight}kg` : '',
    photo,
    metaText: metaParts.join(' · ') || '暂无更多信息',
    snapshot
  };
}

function mergePet(existing, next) {
  if (!existing) return next;
  return {
    ...existing,
    ...Object.keys(next).reduce((acc, key) => {
      const value = next[key];
      if (value === '' || value == null) return acc;
      if (key === 'snapshot' && existing.snapshot) {
        acc.snapshot = { ...existing.snapshot, ...value };
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {}),
    metaText: next.metaText && next.metaText !== '暂无更多信息'
      ? next.metaText
      : existing.metaText
  };
}

/**
 * 从商家订单聚合客户列表（按手机号优先，其次 openid / 姓名）。
 * 后续若有 listStoreCustomers 接口，可在此替换数据源。
 */
function buildCustomersFromOrders(orders) {
  const map = new Map();
  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const key = getCustomerKey(order);
    if (!key) return;

    let customer = map.get(key);
    if (!customer) {
      customer = {
        id: key,
        name: '',
        phone: '',
        nickName: '',
        orderCount: 0,
        lastOrderTime: 0,
        lastOrderTimeText: '',
        pets: [],
        _petMap: new Map()
      };
      map.set(key, customer);
    }

    const name = trimText(order.contactName);
    const phone = trimText(order.contactPhone || order.userPhone);
    const nickName = trimText(order.userNickName);
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (nickName) customer.nickName = nickName;

    customer.orderCount += 1;
    const createTime = Number(order.createTime) || 0;
    if (createTime >= customer.lastOrderTime) {
      customer.lastOrderTime = createTime;
      customer.lastOrderTimeText = formatOrderCreateTime(order) || '';
    }

    const petKey = getPetKey(order);
    if (petKey) {
      const pet = pickPetFromOrder(order);
      customer._petMap.set(petKey, mergePet(customer._petMap.get(petKey), pet));
    }
  });

  return Array.from(map.values())
    .map((customer) => {
      const displayName = customer.name || customer.nickName || '微信用户';
      const pets = Array.from(customer._petMap.values());
      return {
        id: customer.id,
        name: displayName,
        phone: customer.phone,
        nickName: customer.nickName,
        avatarText: displayName[0] || '客',
        orderCount: customer.orderCount,
        lastOrderTime: customer.lastOrderTime,
        lastOrderTimeText: customer.lastOrderTimeText,
        petCount: pets.length,
        pets,
        metaText: [
          customer.phone || '',
          `共${customer.orderCount}单`,
          pets.length ? `${pets.length}只宠物` : ''
        ].filter(Boolean).join(' · ')
      };
    })
    .sort((a, b) => (b.lastOrderTime || 0) - (a.lastOrderTime || 0));
}

function findCustomerById(orders, customerId) {
  const id = trimText(customerId);
  if (!id) return null;
  return buildCustomersFromOrders(orders).find((item) => item.id === id) || null;
}

function getOrderStatusLabel(order) {
  if (order && order.pricePendingConfirm) return '待确认价格';
  const status = order && order.status;
  return (ORDER_STATUS && ORDER_STATUS[status]) || '未知';
}

/**
 * 某客户的历史订单（新到旧），附带列表展示字段。
 */
function listCustomerOrders(orders, customerId) {
  const id = trimText(customerId);
  if (!id) return [];
  return (Array.isArray(orders) ? orders : [])
    .filter((order) => getCustomerKey(order) === id)
    .sort((a, b) => (Number(b.createTime) || 0) - (Number(a.createTime) || 0))
    .map((order) => {
      const meta = buildOrderListPetMeta(order);
      const orderId = trimText(order.id || order.order_id);
      return {
        id: orderId,
        displayNo: order.displayNo || orderId,
        status: order.status || '',
        statusLabel: getOrderStatusLabel(order),
        pricePendingConfirm: !!order.pricePendingConfirm,
        totalFee: order.totalFee != null ? order.totalFee : '',
        serviceType: trimText(order.serviceType) || '寄养预约',
        petName: trimText(order.petName) || '未命名宠物',
        petPhoto: meta.petPhoto || '',
        createTimeText: meta.createTimeText || '--',
        boardingTime: meta.boardingTime || '--'
      };
    });
}

function filterCustomers(customers, keyword) {
  const q = trimText(keyword).toLowerCase();
  const list = Array.isArray(customers) ? customers : [];
  if (!q) return list;
  return list.filter((item) => {
    if (!item) return false;
    const haystack = [
      item.name,
      item.phone,
      item.nickName,
      ...(item.pets || []).map((pet) => pet && pet.name)
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) >= 0;
  });
}

module.exports = {
  getCustomerKey,
  buildCustomersFromOrders,
  findCustomerById,
  listCustomerOrders,
  filterCustomers
};
