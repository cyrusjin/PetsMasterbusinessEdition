const db = require('../db');

const COLLECTION = 'app_settings';
const GLOBAL_ID = 'global';

function normalizeEnvVersion(value) {
  const env = String(value || '').trim().toLowerCase();
  if (env === 'develop' || env === 'trial' || env === 'release') return env;
  return '';
}

function normalizeVersion(value) {
  return String(value || '').trim();
}

function normalizeVersionList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const rows = [];
  list.forEach((item) => {
    const version = normalizeVersion(item && item.version);
    if (!version || seen.has(version)) return;
    seen.add(version);
    rows.push({
      version,
      merchantSwitchEnabled: !!(item && item.merchantSwitchEnabled),
      updateTime: Number((item && item.updateTime) || 0) || null,
      createTime: Number((item && item.createTime) || 0) || null,
      updatedBy: String((item && item.updatedBy) || ''),
      note: String((item && item.note) || '')
    });
  });
  rows.sort((a, b) => {
    const ta = Number(a.updateTime || a.createTime || 0);
    const tb = Number(b.updateTime || b.createTime || 0);
    if (tb !== ta) return tb - ta;
    return String(b.version).localeCompare(String(a.version), 'zh-CN', { numeric: true });
  });
  return rows;
}

function toPublicConfig(doc) {
  const raw = doc || {};
  // 兼容旧字段：若尚无 versions，从旧总开关 / 环境覆盖迁移展示
  let versions = normalizeVersionList(raw.versions);
  if (!versions.length) {
    const migrated = [];
    if (raw.merchantSwitchByEnv && typeof raw.merchantSwitchByEnv === 'object') {
      ['develop', 'trial', 'release'].forEach((env) => {
        if (typeof raw.merchantSwitchByEnv[env] === 'boolean') {
          migrated.push({
            version: env,
            merchantSwitchEnabled: raw.merchantSwitchByEnv[env],
            updateTime: raw.updateTime || null,
            updatedBy: raw.updatedBy || ''
          });
        }
      });
    }
    if (!migrated.length && raw.merchantSwitchEnabled !== undefined) {
      migrated.push({
        version: 'default',
        merchantSwitchEnabled: raw.merchantSwitchEnabled !== false,
        updateTime: raw.updateTime || null,
        updatedBy: raw.updatedBy || '',
        note: '默认（未匹配到具体版本时）'
      });
    }
    versions = normalizeVersionList(migrated);
  }
  return {
    versions,
    defaultMerchantSwitchEnabled: raw.defaultMerchantSwitchEnabled === true,
    updateTime: raw.updateTime || null,
    updatedBy: String(raw.updatedBy || '')
  };
}

function resolveEnabled(config, options = {}) {
  const version = normalizeVersion(options.version);
  const envVersion = normalizeEnvVersion(options.envVersion || options.env);
  const versions = (config && config.versions) || [];

  if (version) {
    const hit = versions.find((item) => item.version === version);
    if (hit) return !!hit.merchantSwitchEnabled;
  }
  if (envVersion) {
    const hitEnv = versions.find((item) => item.version === envVersion);
    if (hitEnv) return !!hitEnv.merchantSwitchEnabled;
  }
  const hitDefault = versions.find((item) => item.version === 'default');
  if (hitDefault) return !!hitDefault.merchantSwitchEnabled;
  return !!(config && config.defaultMerchantSwitchEnabled);
}

async function readRawDoc() {
  return db.findOne(COLLECTION, { _id: GLOBAL_ID });
}

async function saveConfig(next, operator = '') {
  const payload = {
    versions: normalizeVersionList(next.versions),
    defaultMerchantSwitchEnabled: next.defaultMerchantSwitchEnabled === true,
    updateTime: Date.now(),
    updatedBy: String(operator || '')
  };
  await db.collection(COLLECTION).updateOne(
    { _id: GLOBAL_ID },
    {
      $set: payload,
      $setOnInsert: { createTime: Date.now() }
    },
    { upsert: true }
  );
  return getGlobalConfig();
}

async function getGlobalConfig() {
  const doc = await readRawDoc();
  if (!doc) {
    return toPublicConfig({
      versions: [
        {
          version: 'default',
          merchantSwitchEnabled: true,
          updateTime: null,
          note: '默认（未匹配到具体版本时）'
        }
      ],
      defaultMerchantSwitchEnabled: false
    });
  }
  return toPublicConfig(doc);
}

async function getMerchantSwitchStatus(options = {}) {
  const config = await getGlobalConfig();
  const enabled = resolveEnabled(config, options);
  return {
    success: true,
    merchant_switch_enabled: enabled,
    merchantSwitchEnabled: enabled,
    envVersion: normalizeEnvVersion(options.envVersion || options.env) || '',
    version: normalizeVersion(options.version),
    config
  };
}

async function listVersions() {
  const config = await getGlobalConfig();
  return {
    success: true,
    versions: config.versions,
    defaultMerchantSwitchEnabled: config.defaultMerchantSwitchEnabled,
    updateTime: config.updateTime,
    updatedBy: config.updatedBy
  };
}

async function upsertVersion(payload = {}, operator = '') {
  const version = normalizeVersion(payload.version);
  if (!version) {
    return { success: false, errMsg: '请填写版本号' };
  }
  if (version.length > 64) {
    return { success: false, errMsg: '版本号过长' };
  }

  const config = await getGlobalConfig();
  const now = Date.now();
  const versions = normalizeVersionList(config.versions);
  const idx = versions.findIndex((item) => item.version === version);
  const prev = idx >= 0 ? versions[idx] : null;
  const nextRow = {
    version,
    merchantSwitchEnabled: payload.merchantSwitchEnabled === undefined
      ? !!(prev && prev.merchantSwitchEnabled)
      : !!payload.merchantSwitchEnabled,
    updateTime: now,
    createTime: (prev && prev.createTime) || now,
    updatedBy: String(operator || ''),
    note: payload.note === undefined
      ? String((prev && prev.note) || '')
      : String(payload.note || '').slice(0, 200)
  };
  if (idx >= 0) versions[idx] = nextRow;
  else versions.unshift(nextRow);

  const saved = await saveConfig({
    versions,
    defaultMerchantSwitchEnabled: config.defaultMerchantSwitchEnabled
  }, operator);

  return {
    success: true,
    version: nextRow,
    versions: saved.versions
  };
}

async function setVersionEnabled(versionInput, enabled, operator = '') {
  const version = normalizeVersion(versionInput);
  if (!version) {
    return { success: false, errMsg: '缺少版本号' };
  }
  const config = await getGlobalConfig();
  const versions = normalizeVersionList(config.versions);
  const idx = versions.findIndex((item) => item.version === version);
  if (idx < 0) {
    return { success: false, errMsg: '版本不存在' };
  }
  versions[idx] = {
    ...versions[idx],
    merchantSwitchEnabled: !!enabled,
    updateTime: Date.now(),
    updatedBy: String(operator || '')
  };
  const saved = await saveConfig({
    versions,
    defaultMerchantSwitchEnabled: config.defaultMerchantSwitchEnabled
  }, operator);
  return {
    success: true,
    version: versions[idx],
    versions: saved.versions
  };
}

async function deleteVersion(versionInput, operator = '') {
  const version = normalizeVersion(versionInput);
  if (!version) {
    return { success: false, errMsg: '缺少版本号' };
  }
  const config = await getGlobalConfig();
  const versions = normalizeVersionList(config.versions).filter((item) => item.version !== version);
  const saved = await saveConfig({
    versions,
    defaultMerchantSwitchEnabled: config.defaultMerchantSwitchEnabled
  }, operator);
  return {
    success: true,
    versions: saved.versions
  };
}

/** 兼容旧后台保存接口 */
async function updateMerchantSwitchConfig(payload = {}, operator = '') {
  if (Array.isArray(payload.versions)) {
    const saved = await saveConfig({
      versions: payload.versions,
      defaultMerchantSwitchEnabled: payload.defaultMerchantSwitchEnabled === true
    }, operator);
    return { success: true, config: saved };
  }
  if (payload.version) {
    return upsertVersion(payload, operator).then((res) => ({
      success: res.success,
      errMsg: res.errMsg,
      config: res.success ? { versions: res.versions } : undefined
    }));
  }
  return upsertVersion({
    version: 'default',
    merchantSwitchEnabled: payload.merchantSwitchEnabled !== false,
    note: payload.note || '默认（未匹配到具体版本时）'
  }, operator).then(async (res) => {
    const config = await getGlobalConfig();
    return { success: res.success, errMsg: res.errMsg, config };
  });
}

module.exports = {
  getGlobalConfig,
  getMerchantSwitchStatus,
  updateMerchantSwitchConfig,
  listVersions,
  upsertVersion,
  setVersionEnabled,
  deleteVersion,
  resolveEnabled
};
