const { uploadLocalImage } = require('./upload');
const { isLocalTempPath, isRemotePhoto } = require('./photoPath');

const MAX_CUSTOM_DESCRIPTION = 200;
const MAX_CUSTOM_NAME = 140;

let customIdSeed = 0;

function createCustomId(prefix) {
  customIdSeed += 1;
  return `${prefix || 'custom'}_${Date.now()}_${customIdSeed}`;
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

function normalizeCustomChild(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createCustomId('custom_child');
  const name = ((item && item.name) || '').trim().slice(0, MAX_CUSTOM_NAME);
  const description = ((item && item.description) || '').trim().slice(0, MAX_CUSTOM_DESCRIPTION);
  const price = parsePrice(item && item.price);
  const photo = normalizeCustomPhoto(item && item.photo);
  return { id, name, price, description, photo };
}

function normalizeCustomChildren(list, parentId) {
  if (!Array.isArray(list) || !list.length) return [];
  const usedIds = new Set();
  return list.map((item, index) => {
    const rawId = String((item && item.id) || '').trim();
    let id = rawId;
    if (!id || usedIds.has(id)) {
      const parentKey = String(parentId || 'custom').trim() || 'custom';
      const duplicateKey = rawId ? `_${rawId}_duplicate` : '';
      const baseId = `${parentKey}_child${duplicateKey}_${index + 1}`;
      id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}_${suffix}`;
        suffix += 1;
      }
    }
    usedIds.add(id);
    return normalizeCustomChild({ ...item, id }, id);
  });
}

/** 只要挂了子项（含空草稿），就视为有子项：隐藏一级价格 */
function hasCustomChildren(item) {
  return Array.isArray(item && item.children) && item.children.length > 0;
}

function decorateCustomItemForUi(item) {
  const normalized = normalizeCustomItem(item, item && item.id);
  return {
    ...normalized,
    hasChildren: hasCustomChildren(normalized)
  };
}

function normalizeCustomPricingForUi(input) {
  return normalizeCustomPricing(input).map((item) => decorateCustomItemForUi(item));
}

function normalizeCustomItem(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createCustomId('custom');
  const name = ((item && item.name) || '').trim().slice(0, MAX_CUSTOM_NAME);
  const description = ((item && item.description) || '').trim().slice(0, MAX_CUSTOM_DESCRIPTION);
  const price = parsePrice(item && item.price);
  const photo = normalizeCustomPhoto(item && item.photo);
  const children = normalizeCustomChildren(item && item.children, id);
  return {
    id,
    name,
    price,
    description,
    photo,
    children
  };
}

function getDefaultCustomPricing() {
  return [
    normalizeCustomItem({
      id: 'custom_default',
      name: '',
      price: 0,
      description: '',
      photo: '',
      children: []
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
      id: createCustomId('custom'),
      name: '',
      price: 0,
      description: '',
      photo: '',
      children: []
    })
  ].map((item) => decorateCustomItemForUi(item));
}

function removeCustomOption(list, index) {
  const normalized = normalizeCustomPricing(list);
  if (normalized.length <= 1) return normalized.map((item) => decorateCustomItemForUi(item));
  if (index < 0 || index >= normalized.length) {
    return normalized.map((item) => decorateCustomItemForUi(item));
  }
  return normalized
    .filter((_, idx) => idx !== index)
    .map((item) => decorateCustomItemForUi(item));
}

function updateCustomOptionField(list, index, field, rawValue) {
  const normalized = normalizeCustomPricing(list);
  if (index < 0 || index >= normalized.length) {
    return normalized.map((item) => decorateCustomItemForUi(item));
  }

  const next = normalized.map((item) => ({
    ...item,
    children: (item.children || []).map((child) => ({ ...child }))
  }));
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

  return next.map((item) => decorateCustomItemForUi(item));
}

function addCustomChild(list, parentIndex) {
  const normalized = normalizeCustomPricing(list);
  if (parentIndex < 0 || parentIndex >= normalized.length) {
    return normalized.map((item) => decorateCustomItemForUi(item));
  }
  const next = normalized.map((item, idx) => {
    if (idx !== parentIndex) return { ...item, children: (item.children || []).map((c) => ({ ...c })) };
    return {
      ...item,
      children: [
        ...(item.children || []),
        normalizeCustomChild({
          id: createCustomId('custom_child'),
          name: '',
          price: 0,
          description: '',
          photo: ''
        })
      ]
    };
  });
  return next.map((item) => decorateCustomItemForUi(item));
}

function removeCustomChild(list, parentIndex, childIndex) {
  const normalized = normalizeCustomPricing(list);
  if (parentIndex < 0 || parentIndex >= normalized.length) {
    return normalized.map((item) => decorateCustomItemForUi(item));
  }
  const next = normalized.map((item, idx) => {
    if (idx !== parentIndex) return { ...item, children: (item.children || []).map((c) => ({ ...c })) };
    const children = (item.children || []).filter((_, cIdx) => cIdx !== childIndex);
    return { ...item, children };
  });
  return next.map((item) => decorateCustomItemForUi(item));
}

function updateCustomChildField(list, parentIndex, childIndex, field, rawValue) {
  const normalized = normalizeCustomPricing(list);
  if (parentIndex < 0 || parentIndex >= normalized.length) {
    return normalized.map((item) => decorateCustomItemForUi(item));
  }
  const parent = normalized[parentIndex];
  const children = parent.children || [];
  if (childIndex < 0 || childIndex >= children.length) {
    return normalized.map((item) => decorateCustomItemForUi(item));
  }

  const next = normalized.map((item, idx) => {
    if (idx !== parentIndex) return { ...item, children: (item.children || []).map((c) => ({ ...c })) };
    const nextChildren = (item.children || []).map((child, cIdx) => {
      if (cIdx !== childIndex) return { ...child };
      const updated = { ...child };
      if (field === 'name') {
        updated.name = String(rawValue || '').trim().slice(0, MAX_CUSTOM_NAME);
      } else if (field === 'description') {
        updated.description = String(rawValue || '').trim().slice(0, MAX_CUSTOM_DESCRIPTION);
      } else if (field === 'photo') {
        updated.photo = normalizeCustomPhoto(rawValue);
      } else if (field === 'price') {
        updated.price = parsePrice(rawValue);
      }
      return normalizeCustomChild(updated, updated.id);
    });
    return { ...item, children: nextChildren };
  });
  return next.map((item) => decorateCustomItemForUi(item));
}

function validateCustomPricing(list) {
  const normalized = normalizeCustomPricing(list);
  if (!normalized.length) return '请至少添加一个自定义收费项目';

  for (let i = 0; i < normalized.length; i += 1) {
    const item = normalized[i];
    const label = item.name || `第${i + 1}项`;
    if (!item.name) return `请填写第${i + 1}个自定义项目名称`;

    if (hasCustomChildren(item)) {
      const children = item.children || [];
      for (let j = 0; j < children.length; j += 1) {
        const child = children[j];
        const childLabel = child.name || `第${j + 1}个子项`;
        if (!child.name) return `请填写「${label}」的第${j + 1}个子项名称`;
        if (!(parseFloat(child.price) > 0)) return `请填写「${label} · ${childLabel}」的价格`;
      }
      const childNames = children.map((child) => child.name);
      const dupChild = childNames.find((name, index) => childNames.indexOf(name) !== index);
      if (dupChild) return `「${label}」下子项「${dupChild}」名称重复，请修改`;
    } else if (!(parseFloat(item.price) > 0)) {
      return `请填写${label}的价格`;
    }
  }

  const names = normalized.map((item) => item.name);
  const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicateName) return `自定义项目「${duplicateName}」名称重复，请修改`;

  return '';
}

function uploadOneCustomPhoto(photo, fallbackPhoto) {
  if (!photo) return Promise.resolve('');
  if (isRemotePhoto(photo) && !isLocalTempPath(photo)) return Promise.resolve(photo);
  if (isLocalTempPath(photo)) {
    return uploadLocalImage(photo, 'custom-pricing-photos').then((url) => {
      if (!isRemotePhoto(url)) {
        return Promise.reject(new Error('自定义收费图片上传失败，请重试'));
      }
      return url;
    });
  }
  if (fallbackPhoto && isRemotePhoto(fallbackPhoto)) return Promise.resolve(fallbackPhoto);
  return Promise.resolve('');
}

/**
 * 保存前将本地临时图上传为远端 URL（含一级与子项）；描述与照片均为选填。
 */
function uploadCustomPricingPhotos(list, fallbackList) {
  const normalized = normalizeCustomPricing(list);
  const fallback = normalizeCustomPricing(fallbackList || []);
  const fallbackById = {};
  fallback.forEach((item) => {
    fallbackById[item.id] = item;
    (item.children || []).forEach((child) => {
      fallbackById[child.id] = child;
    });
  });

  return Promise.all(normalized.map((item) => {
    const parentFallback = fallbackById[item.id];
    return uploadOneCustomPhoto(item.photo, parentFallback && parentFallback.photo)
      .then((photo) => {
        const children = item.children || [];
        return Promise.all(children.map((child) => {
          const childFallback = fallbackById[child.id];
          return uploadOneCustomPhoto(child.photo, childFallback && childFallback.photo)
            .then((childPhoto) => normalizeCustomChild({ ...child, photo: childPhoto }, child.id));
        })).then((nextChildren) => normalizeCustomItem({
          ...item,
          photo,
          children: nextChildren
        }, item.id));
      });
  }));
}

/**
 * 按一级或二级 id 查找；命中二级时返回可计价的扁平选项（带 parent 信息）
 */
function findCustomOption(list, optionId) {
  const id = String(optionId || '').trim();
  if (!id) return null;
  const normalized = normalizeCustomPricing(list);

  for (let i = 0; i < normalized.length; i += 1) {
    const parent = normalized[i];
    if (parent.id === id) {
      if (hasCustomChildren(parent)) {
        // 有子项时一级不可直接选中计价
        return null;
      }
      return parent;
    }
    const children = parent.children || [];
    for (let j = 0; j < children.length; j += 1) {
      const child = children[j];
      if (child.id === id) {
        const photo = child.photo || parent.photo || '';
        const description = child.description || parent.description || '';
        return {
          id: child.id,
          name: parent.name ? `${parent.name} · ${child.name}` : child.name,
          price: child.price,
          description,
          photo,
          parentId: parent.id,
          parentName: parent.name,
          childName: child.name,
          isChild: true
        };
      }
    }
  }
  return null;
}

function findCustomPrice(list, optionId) {
  const option = findCustomOption(list, optionId);
  if (option) return option.price;
  const normalized = normalizeCustomPricing(list);
  const first = normalized[0];
  if (!first) return 0;
  if (hasCustomChildren(first)) {
    const child = (first.children || []).find((c) => c.name);
    return child ? child.price : 0;
  }
  return first.price;
}

function buildCustomOptions(list) {
  const normalized = normalizeCustomPricing(list);
  const options = [];
  normalized.forEach((item) => {
    if (hasCustomChildren(item)) {
      (item.children || []).forEach((child) => {
        if (!child.name) return;
        const photo = getDisplayCustomPhoto(child.photo || item.photo);
        const description = child.description || item.description || '';
        options.push({
          id: child.id,
          name: item.name ? `${item.name} · ${child.name}` : child.name,
          price: child.price,
          description,
          photo,
          parentId: item.id,
          parentName: item.name,
          childName: child.name,
          isChild: true,
          disabled: false
        });
      });
      return;
    }
    options.push({
      ...item,
      photo: getDisplayCustomPhoto(item.photo),
      disabled: false
    });
  });
  return options;
}

/** 预约第一步：大项列表（有子项的大项不展示价格） */
function buildCustomParentOptions(list) {
  const normalized = normalizeCustomPricing(list);
  return normalized
    .filter((item) => !!(item.name || '').trim())
    .map((item) => {
      const withChildren = hasCustomChildren(item);
      return {
        id: item.id,
        name: item.name,
        description: item.description || '',
        photo: getDisplayCustomPhoto(item.photo),
        price: withChildren ? null : item.price,
        hasChildren: withChildren,
        disabled: false
      };
    });
}

/** 预约第二步：某大项下的子项 */
function buildCustomChildOptions(list, parentId) {
  const id = String(parentId || '').trim();
  if (!id) return [];
  const normalized = normalizeCustomPricing(list);
  const parent = normalized.find((item) => item.id === id);
  if (!parent || !hasCustomChildren(parent)) return [];
  return (parent.children || [])
    .filter((child) => !!(child.name || '').trim())
    .map((child, index) => ({
      id: child.id,
      renderKey: `${parent.id}_${child.id}_${index}`,
      name: child.name,
      description: child.description || '',
      photo: getDisplayCustomPhoto(child.photo || parent.photo),
      price: child.price,
      parentId: parent.id,
      parentName: parent.name,
      isChild: true,
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
  normalizeCustomPricingForUi,
  normalizeCustomItem,
  decorateCustomItemForUi,
  hasCustomChildren,
  addCustomOption,
  removeCustomOption,
  updateCustomOptionField,
  addCustomChild,
  removeCustomChild,
  updateCustomChildField,
  validateCustomPricing,
  uploadCustomPricingPhotos,
  findCustomOption,
  findCustomPrice,
  getDisplayCustomPhoto,
  buildCustomOptions,
  buildCustomParentOptions,
  buildCustomChildOptions,
  resolveCustomOptionsPhotos
};
