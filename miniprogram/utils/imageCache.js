const { STORAGE_KEYS } = require('./constants');

const CACHE_DIR = `${(typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || ''}/pet_image_cache`;
const MAX_CACHE_ENTRIES = 300;
const INDEX_PERSIST_MS = 2000;
const pendingMap = new Map();

let memoryIndex = null;
let indexDirty = false;
let persistTimer = null;

function isCloudFileId(url) {
  return typeof url === 'string' && url.startsWith('cloud://');
}

function isHttpUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

function isLocalImagePath(url) {
  if (!url || typeof url !== 'string') return true;
  const text = url.trim();
  if (!text) return true;
  if (text.startsWith('/')) return true;
  if (text.startsWith('wxfile://')) return true;
  if (text.startsWith('http://usr/')) return true;
  if (text.startsWith('http://tmp/')) return true;
  return false;
}

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function guessExt(source) {
  const match = String(source).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

function getFs() {
  return wx.getFileSystemManager();
}

function ensureCacheDir() {
  const fs = getFs();
  try {
    fs.accessSync(CACHE_DIR);
  } catch (err) {
    fs.mkdirSync(CACHE_DIR, true);
  }
}

function expectedCachePath(source) {
  return `${CACHE_DIR}/${hashString(source)}.${guessExt(source)}`;
}

function getMemoryIndex() {
  if (memoryIndex) return memoryIndex;
  try {
    const index = wx.getStorageSync(STORAGE_KEYS.IMAGE_CACHE) || {};
    memoryIndex = (typeof index === 'object' && index) ? index : {};
  } catch (err) {
    memoryIndex = {};
  }
  return memoryIndex;
}

function schedulePersistIndex() {
  indexDirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushCacheIndex();
  }, INDEX_PERSIST_MS);
}

function flushCacheIndex() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!indexDirty || !memoryIndex) return;
  indexDirty = false;
  const snapshot = memoryIndex;
  try {
    wx.setStorage({
      key: STORAGE_KEYS.IMAGE_CACHE,
      data: snapshot,
      fail: () => {
        try {
          wx.setStorageSync(STORAGE_KEYS.IMAGE_CACHE, snapshot);
        } catch (err) {
          // ignore
        }
      }
    });
  } catch (err) {
    try {
      wx.setStorageSync(STORAGE_KEYS.IMAGE_CACHE, snapshot);
    } catch (e) {
      // ignore
    }
  }
}

function fileExists(filePath) {
  if (!filePath) return false;
  try {
    getFs().accessSync(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

function touchCacheEntry(source, filePath) {
  const index = getMemoryIndex();
  index[source] = {
    path: filePath,
    updatedAt: Date.now()
  };

  const keys = Object.keys(index);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys
      .sort((a, b) => (index[a].updatedAt || 0) - (index[b].updatedAt || 0))
      .slice(0, keys.length - MAX_CACHE_ENTRIES)
      .forEach((key) => {
        const item = index[key];
        if (item && item.path && fileExists(item.path)) {
          try {
            getFs().unlinkSync(item.path);
          } catch (err) {
            // ignore
          }
        }
        delete index[key];
      });
  }

  schedulePersistIndex();
}

/**
 * 同步读取本地缓存路径（不触发下载）。
 * 优先查内存索引，索引丢失时按 URL 哈希恢复磁盘文件。
 */
function peekCachedPath(source, options = {}) {
  const url = (source || '').trim();
  if (!url) return '';
  if (isLocalImagePath(url)) return url;

  const touch = !(options && options.skipTouch);
  const index = getMemoryIndex();
  const item = index[url];
  if (item && item.path && fileExists(item.path)) {
    if (touch) {
      item.updatedAt = Date.now();
      schedulePersistIndex();
    }
    return item.path;
  }

  const expected = expectedCachePath(url);
  if (fileExists(expected)) {
    if (touch) {
      touchCacheEntry(url, expected);
    } else {
      // 仅修复内存索引，不立刻落盘
      index[url] = { path: expected, updatedAt: Date.now() };
      schedulePersistIndex();
    }
    return expected;
  }

  if (item) {
    delete index[url];
    schedulePersistIndex();
  }
  return '';
}

function getCachedPath(source) {
  return peekCachedPath(source, { skipTouch: false });
}

function saveTempFile(tempFilePath, source) {
  ensureCacheDir();
  const targetPath = expectedCachePath(source);
  if (fileExists(targetPath)) {
    touchCacheEntry(source, targetPath);
    return targetPath;
  }
  const savedPath = getFs().saveFileSync(tempFilePath, targetPath);
  touchCacheEntry(source, savedPath);
  return savedPath;
}

function downloadHttp(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error('图片下载失败'));
      },
      fail: reject
    });
  });
}

function downloadCloud(fileID) {
  // 历史 cloud:// 地址已不再支持；新资源均为 HTTPS
  if (isHttpUrl(fileID)) {
    return downloadHttp(fileID);
  }
  return Promise.reject(new Error('不支持的云文件地址，请重新上传'));
}

function _resolveImageUrl(source) {
  const url = (source || '').trim();
  if (!url || isLocalImagePath(url)) {
    return Promise.resolve(url);
  }

  const cached = getCachedPath(url);
  if (cached) {
    return Promise.resolve(cached);
  }

  const loader = isHttpUrl(url)
    ? downloadHttp(url)
    : (isCloudFileId(url) ? downloadCloud(url) : Promise.resolve(''));

  return loader
    .then((tempFilePath) => {
      if (!tempFilePath) return url;
      return saveTempFile(tempFilePath, url);
    })
    .catch((err) => {
      console.error('[imageCache] 缓存失败', url, err);
      return url;
    });
}

function resolveImageUrl(source) {
  const url = (source || '').trim();
  if (!url || isLocalImagePath(url)) {
    return Promise.resolve(url);
  }

  const cached = getCachedPath(url);
  if (cached) {
    return Promise.resolve(cached);
  }

  if (pendingMap.has(url)) {
    return pendingMap.get(url);
  }

  const task = _resolveImageUrl(url).finally(() => {
    pendingMap.delete(url);
  });
  pendingMap.set(url, task);
  return task;
}

function resolveImageUrls(sources) {
  const list = (sources || []).filter(Boolean);
  if (!list.length) return Promise.resolve([]);
  return Promise.all(list.map((item) => resolveImageUrl(item)));
}

function clearImageFileCache() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  indexDirty = false;
  memoryIndex = {};
  try {
    wx.removeStorageSync(STORAGE_KEYS.IMAGE_CACHE);
  } catch (err) {
    // ignore
  }
  try {
    const fs = getFs();
    fs.accessSync(CACHE_DIR);
    fs.rmdirSync(CACHE_DIR, true);
  } catch (err) {
    // ignore
  }
  pendingMap.clear();
}

module.exports = {
  isCloudFileId,
  isHttpUrl,
  isLocalImagePath,
  peekCachedPath,
  getCachedPath,
  resolveImageUrl,
  resolveImageUrls,
  clearImageFileCache,
  flushCacheIndex
};
