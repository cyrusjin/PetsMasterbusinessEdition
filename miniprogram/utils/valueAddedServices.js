const { uploadLocalImage } = require('./upload');
const { isLocalTempPath, isRemotePhoto } = require('./photoPath');

const MAX_VALUE_ADDED_DESCRIPTION = 200;
const MAX_VALUE_ADDED_NAME = 30;

let serviceIdSeed = 0;

function createServiceId() {
  serviceIdSeed += 1;
  return `vas_${Date.now()}_${serviceIdSeed}`;
}

function parsePrice(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

function normalizeValueAddedPhoto(url) {
  if (!url || typeof url !== 'string') return '';
  const text = url.trim();
  if (!text) return '';
  if (isRemotePhoto(text) || isLocalTempPath(text)) return text;
  return '';
}

/** 用户端可展示的图片：排除商家本地临时路径 */
function getDisplayValueAddedPhoto(photo) {
  const text = normalizeValueAddedPhoto(photo);
  if (!text) return '';
  if (isLocalTempPath(text)) return '';
  return text;
}

function normalizeValueAddedItem(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createServiceId();
  const name = ((item && item.name) || '').trim().slice(0, MAX_VALUE_ADDED_NAME);
  const description = ((item && item.description) || '').trim().slice(0, MAX_VALUE_ADDED_DESCRIPTION);
  const price = parsePrice(item && item.price);
  const photo = normalizeValueAddedPhoto(item && item.photo);
  return {
    id,
    name,
    price,
    description,
    photo
  };
}

function normalizeValueAddedServices(input) {
  if (!Array.isArray(input) || !input.length) return [];
  return input.map((item) => normalizeValueAddedItem(item));
}

function addValueAddedService(list) {
  const normalized = normalizeValueAddedServices(list);
  return [
    ...normalized,
    normalizeValueAddedItem({
      id: createServiceId(),
      name: '',
      price: 0,
      description: '',
      photo: ''
    })
  ];
}

function removeValueAddedService(list, index) {
  const normalized = normalizeValueAddedServices(list);
  if (index < 0 || index >= normalized.length) return normalized;
  return normalized.filter((_, idx) => idx !== index);
}

function updateValueAddedServiceField(list, index, field, rawValue) {
  const normalized = normalizeValueAddedServices(list);
  if (index < 0 || index >= normalized.length) return normalized;

  const next = normalized.map((item) => ({ ...item }));
  const target = next[index];

  if (field === 'name') {
    target.name = String(rawValue || '').trim().slice(0, MAX_VALUE_ADDED_NAME);
  } else if (field === 'description') {
    target.description = String(rawValue || '').trim().slice(0, MAX_VALUE_ADDED_DESCRIPTION);
  } else if (field === 'photo') {
    target.photo = normalizeValueAddedPhoto(rawValue);
  } else if (field === 'price') {
    target.price = parsePrice(rawValue);
  }

  return next.map((item) => normalizeValueAddedItem(item, item.id));
}

function validateValueAddedServices(list, options) {
  const requireContent = !options || options.requireContent !== false;
  const normalized = normalizeValueAddedServices(list);
  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    const label = item.name || `第${i + 1}项增值服务`;
    if (!item.name) return `请填写第${i + 1}项增值服务名称`;
    if (!(parseFloat(item.price) > 0)) return `请填写${label}的金额`;
    if (requireContent && !item.description && !item.photo) {
      return `请填写${label}的描述或上传图片`;
    }
  }

  const names = normalized.map((item) => item.name);
  const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicateName) return `增值服务「${duplicateName}」名称重复，请修改`;

  return '';
}

/**
 * 保存前将本地临时图上传为远端 URL。
 */
function uploadValueAddedServicePhotos(list, fallbackList) {
  const normalized = normalizeValueAddedServices(list);
  const fallback = normalizeValueAddedServices(fallbackList || []);
  const fallbackById = {};
  fallback.forEach((item) => {
    fallbackById[item.id] = item;
  });

  return Promise.all(normalized.map((item) => {
    const photo = item.photo;
    if (!photo) {
      return Promise.resolve(normalizeValueAddedItem({ ...item, photo: '' }, item.id));
    }
    if (isRemotePhoto(photo) && !isLocalTempPath(photo)) {
      return Promise.resolve(item);
    }
    if (isLocalTempPath(photo)) {
      return uploadLocalImage(photo, 'value-added-photos').then((url) => {
        if (!isRemotePhoto(url)) {
          return Promise.reject(new Error('增值服务图片上传失败，请重试'));
        }
        return normalizeValueAddedItem({ ...item, photo: url }, item.id);
      });
    }
    const fallbackItem = fallbackById[item.id];
    if (fallbackItem && isRemotePhoto(fallbackItem.photo)) {
      return Promise.resolve(normalizeValueAddedItem({ ...item, photo: fallbackItem.photo }, item.id));
    }
    return Promise.resolve(normalizeValueAddedItem({ ...item, photo: '' }, item.id));
  }));
}

/**
 * 用户预约页可选列表；preserveChecked 时按 id 保留勾选状态。
 */
function buildValueAddedSelectList(services, preserveChecked) {
  const normalized = normalizeValueAddedServices(services)
    .filter((item) => item.name && parseFloat(item.price) > 0);
  const checkedMap = {};
  if (Array.isArray(preserveChecked)) {
    preserveChecked.forEach((item) => {
      if (item && item.id && item.checked) checkedMap[item.id] = true;
    });
  }
  return normalized.map((item) => ({
    ...item,
    photo: getDisplayValueAddedPhoto(item.photo),
    priceText: String(item.price),
    checked: !!checkedMap[item.id]
  }));
}

/**
 * 解析用户端增值服务图片（cloud:// / https）为可展示地址
 */
function resolveValueAddedSelectPhotos(list) {
  const items = Array.isArray(list) ? list : [];
  const indexes = [];
  const urls = [];
  items.forEach((item, index) => {
    const photo = getDisplayValueAddedPhoto(item && item.photo);
    if (!photo) return;
    indexes.push(index);
    urls.push(photo);
  });
  if (!urls.length) return Promise.resolve(items.map((item) => ({ ...item })));

  const { resolveImageUrls } = require('./imageCache');
  return resolveImageUrls(urls).then((resolved) => {
    const next = items.map((item) => ({ ...item }));
    indexes.forEach((itemIndex, i) => {
      const url = resolved[i];
      if (url) next[itemIndex].photo = url;
    });
    return next;
  }).catch(() => items.map((item) => ({ ...item })));
}

function getCheckedValueAddedServices(list) {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && item.checked)
    .map((item) => normalizeValueAddedItem(item, item.id));
}

function calcValueAddedFee(list) {
  const checked = getCheckedValueAddedServices(list);
  const fee = checked.reduce((sum, item) => sum + parsePrice(item.price), 0);
  return {
    fee: Math.round(fee * 100) / 100,
    items: checked,
    ready: true
  };
}

function snapshotValueAddedServices(list) {
  return getCheckedValueAddedServices(list).map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    description: item.description,
    photo: getDisplayValueAddedPhoto(item.photo)
  }));
}

/**
 * 从店铺文档解析增值服务：优先顶层字段，其次 billingRules（兼容同步链路）。
 */
function resolveStoreValueAddedServices(store) {
  const top = normalizeValueAddedServices(store && store.valueAddedServices);
  if (top.length) return top;
  const nested = store && store.billingRules && store.billingRules.valueAddedServices;
  return normalizeValueAddedServices(nested);
}

module.exports = {
  MAX_VALUE_ADDED_DESCRIPTION,
  MAX_VALUE_ADDED_NAME,
  normalizeValueAddedServices,
  normalizeValueAddedItem,
  addValueAddedService,
  removeValueAddedService,
  updateValueAddedServiceField,
  validateValueAddedServices,
  uploadValueAddedServicePhotos,
  buildValueAddedSelectList,
  resolveValueAddedSelectPhotos,
  getDisplayValueAddedPhoto,
  getCheckedValueAddedServices,
  calcValueAddedFee,
  snapshotValueAddedServices,
  resolveStoreValueAddedServices,
  parsePrice
};
