const { uploadLocalImage } = require('./upload');
const { isLocalTempPath, isRemotePhoto } = require('./photoPath');

const MAX_CUSTOM_DESCRIPTION = 200;
const MAX_CUSTOM_NAME = 30;

let customIdSeed = 0;

function createCustomId() {
  customIdSeed += 1;
  return `custom_${Date.now()}_${customIdSeed}`;
}

function parsePrice(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

function normalizeCustomPhoto(url) {
  if (!url || typeof url !== 'string') return '';
  const text = url.trim();
  if (!text) return '';
  if (isRemotePhoto(text) || isLocalTempPath(text)) return text;
  return '';
}

/** 用户端可展示的图片：排除商家本地临时路径 */
function getDisplayCustomPhoto(photo) {
  const text = normalizeCustomPhoto(photo);
  if (!text) return '';
  if (isLocalTempPath(text)) return '';
  return text;
}

function normalizeCustomItem(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createCustomId();
  const name = ((item && item.name) || '').trim().slice(0, MAX_CUSTOM_NAME);
  const description = ((item && item.description) || '').trim().slice(0, MAX_CUSTOM_DESCRIPTION);
  const price = parsePrice(item && item.price);
  const photo = normalizeCustomPhoto(item && item.photo);
  return {
    id,
    name,
    price,
    description,
    photo
  };
}

function getDefaultCustomPricing() {
  return [
    normalizeCustomItem({
      id: 'custom_default',
      name: '',
      price: 0,
      description: '',
      photo: ''
    })
  ];
}

function normalizeCustomPricing(input) {
  if (!Array.isArray(input) || !input.length) return [];
  return input.map((item) => normalizeCustomItem(item));
}

function addCustomOption(list) {
  const normalized = normalizeCustomPricing(list);
  return [
    ...normalized,
    normalizeCustomItem({
      id: createCustomId(),
      name: '',
      price: 0,
      description: '',
      photo: ''
    })
  ];
}

function removeCustomOption(list, index) {
  const normalized = normalizeCustomPricing(list);
  if (normalized.length <= 1) return normalized;
  if (index < 0 || index >= normalized.length) return normalized;
  return normalized.filter((_, idx) => idx !== index);
}

function updateCustomOptionField(list, index, field, rawValue) {
  const normalized = normalizeCustomPricing(list);
  if (index < 0 || index >= normalized.length) return normalized;

  const next = normalized.map((item) => ({ ...item }));
  const target = next[index];

  if (field === 'name') {
    target.name = String(rawValue || '').trim().slice(0, MAX_CUSTOM_NAME);
  } else if (field === 'description') {
    target.description = String(rawValue || '').trim().slice(0, MAX_CUSTOM_DESCRIPTION);
  } else if (field === 'photo') {
    target.photo = normalizeCustomPhoto(rawValue);
  } else if (field === 'price') {
    target.price = parsePrice(rawValue);
  }

  return next.map((item) => normalizeCustomItem(item, item.id));
}

function validateCustomPricing(list) {
  const normalized = normalizeCustomPricing(list);
  if (!normalized.length) return '请至少添加一个自定义收费项目';

  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    const label = item.name || `第${i + 1}项`;
    if (!item.name) return `请填写第${i + 1}个自定义项目名称`;
    if (!(parseFloat(item.price) > 0)) return `请填写${label}的价格`;
  }

  const names = normalized.map((item) => item.name);
  const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicateName) return `自定义项目「${duplicateName}」名称重复，请修改`;

  return '';
}

/**
 * 保存前将本地临时图上传为远端 URL；描述与照片均为选填。
 */
function uploadCustomPricingPhotos(list, fallbackList) {
  const normalized = normalizeCustomPricing(list);
  const fallback = normalizeCustomPricing(fallbackList || []);
  const fallbackById = {};
  fallback.forEach((item) => {
    fallbackById[item.id] = item;
  });

  return Promise.all(normalized.map((item) => {
    const photo = item.photo;
    if (!photo) {
      return Promise.resolve(normalizeCustomItem({ ...item, photo: '' }, item.id));
    }
    if (isRemotePhoto(photo) && !isLocalTempPath(photo)) {
      return Promise.resolve(item);
    }
    if (isLocalTempPath(photo)) {
      return uploadLocalImage(photo, 'custom-pricing-photos').then((url) => {
        if (!isRemotePhoto(url)) {
          return Promise.reject(new Error('自定义收费图片上传失败，请重试'));
        }
        return normalizeCustomItem({ ...item, photo: url }, item.id);
      });
    }
    const fallbackItem = fallbackById[item.id];
    if (fallbackItem && isRemotePhoto(fallbackItem.photo)) {
      return Promise.resolve(normalizeCustomItem({ ...item, photo: fallbackItem.photo }, item.id));
    }
    return Promise.resolve(normalizeCustomItem({ ...item, photo: '' }, item.id));
  }));
}

function findCustomOption(list, optionId) {
  const normalized = normalizeCustomPricing(list);
  return normalized.find((item) => item.id === optionId) || null;
}

function findCustomPrice(list, optionId) {
  const option = findCustomOption(list, optionId);
  if (option) return option.price;
  const normalized = normalizeCustomPricing(list);
  return normalized[0] ? normalized[0].price : 0;
}

function buildCustomOptions(list) {
  const normalized = normalizeCustomPricing(list);
  return normalized.map((item) => ({
    ...item,
    photo: getDisplayCustomPhoto(item.photo),
    disabled: false
  }));
}

/**
 * 解析用户端自定义选项图片（cloud:// / https）为可展示地址
 */
function resolveCustomOptionsPhotos(options) {
  const list = Array.isArray(options) ? options : [];
  const indexes = [];
  const urls = [];
  list.forEach((item, index) => {
    const photo = getDisplayCustomPhoto(item && item.photo);
    if (!photo) return;
    indexes.push(index);
    urls.push(photo);
  });
  if (!urls.length) return Promise.resolve(list.map((item) => ({ ...item })));

  const { resolveImageUrls } = require('./imageCache');
  return resolveImageUrls(urls).then((resolved) => {
    const next = list.map((item) => ({ ...item }));
    indexes.forEach((itemIndex, i) => {
      const url = resolved[i];
      if (url) next[itemIndex].photo = url;
    });
    return next;
  }).catch(() => list.map((item) => ({ ...item })));
}

module.exports = {
  MAX_CUSTOM_DESCRIPTION,
  MAX_CUSTOM_NAME,
  getDefaultCustomPricing,
  normalizeCustomPricing,
  normalizeCustomItem,
  addCustomOption,
  removeCustomOption,
  updateCustomOptionField,
  validateCustomPricing,
  uploadCustomPricingPhotos,
  findCustomOption,
  findCustomPrice,
  getDisplayCustomPhoto,
  buildCustomOptions,
  resolveCustomOptionsPhotos
};
