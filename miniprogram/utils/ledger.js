const { callApiService } = require('./api');
const { STORAGE_KEYS } = require('./constants');
const merchantDemo = require('./merchantDemo');

const EXPENSE_CATEGORIES = [
  { key: 'rent', label: '房租租金' },
  { key: 'utilities', label: '水电燃气' },
  { key: 'food', label: '粮水零食' },
  { key: 'supplies', label: '洗护耗材' },
  { key: 'medical', label: '医疗药品' },
  { key: 'salary', label: '员工工资' },
  { key: 'equipment', label: '设备维修' },
  { key: 'marketing', label: '营销推广' },
  { key: 'other_expense', label: '其他支出' }
];

const INCOME_CATEGORIES = [
  { key: 'retail', label: '商品零售' },
  { key: 'extra_service', label: '额外服务' },
  { key: 'tip', label: '打赏/红包' },
  { key: 'other_income', label: '其他收入' }
];

function callLedgerService(action, data = {}) {
  return callApiService('ledgerService', { action, ...data });
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateYmd(text) {
  if (!text || typeof text !== 'string') return null;
  const parts = text.trim().split(/[-/]/);
  if (parts.length < 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (!y || m < 0 || m > 11 || !d) return null;
  return new Date(y, m, d);
}

function getEntryTimestamp(entry) {
  if (entry && entry.createTime) return Number(entry.createTime) || 0;
  const fromDate = parseDateYmd(entry && entry.date);
  return fromDate ? fromDate.getTime() : 0;
}

function categoriesForType(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

function categoryLabel(type, key) {
  const found = categoriesForType(type).find((c) => c.key === key);
  return (found && found.label) || key || '未分类';
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'income' ? 'income' : 'expense';
  const category = String(raw.category || '').trim();
  const amount = roundMoney(raw.amount);
  const date = String(raw.date || '').trim() || todayYmd();
  const id = String(raw.id || raw.entry_id || '').trim();
  if (!id || !(amount > 0)) return null;
  return {
    id,
    store_id: String(raw.store_id || raw.storeId || '').trim(),
    type,
    category,
    categoryLabel: raw.categoryLabel || categoryLabel(type, category),
    amount,
    note: String(raw.note || '').trim(),
    date,
    createTime: Number(raw.createTime) || getEntryTimestamp({ date }) || Date.now(),
    updateTime: Number(raw.updateTime) || Number(raw.createTime) || Date.now()
  };
}

function sortEntries(list) {
  return (list || [])
    .slice()
    .sort((a, b) => {
      const dateDiff = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateDiff) return dateDiff;
      return getEntryTimestamp(b) - getEntryTimestamp(a);
    });
}

function _readLocal(key) {
  try {
    const list = wx.getStorageSync(key);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function _writeLocal(key, list) {
  try {
    wx.setStorageSync(key, list);
  } catch (err) {
    // ignore
  }
}

function _storageKey(isDemo) {
  return isDemo ? STORAGE_KEYS.DEMO_LEDGER : STORAGE_KEYS.LEDGER;
}

function getLocalEntries(isDemo) {
  return sortEntries(
    _readLocal(_storageKey(isDemo))
      .map(normalizeEntry)
      .filter(Boolean)
  );
}

function saveLocalEntries(entries, isDemo) {
  _writeLocal(_storageKey(isDemo), sortEntries((entries || []).map(normalizeEntry).filter(Boolean)));
}

function upsertLocalEntry(entry, isDemo) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return null;
  const list = getLocalEntries(isDemo).filter((item) => item.id !== normalized.id);
  list.push(normalized);
  saveLocalEntries(list, isDemo);
  return normalized;
}

function removeLocalEntry(entryId, isDemo) {
  const id = String(entryId || '').trim();
  if (!id) return;
  saveLocalEntries(getLocalEntries(isDemo).filter((item) => item.id !== id), isDemo);
}

function resolveStoreId(app) {
  if (!app) return '';
  const shop = (app.getShop && app.getShop()) || {};
  return String(
    app.globalData.merchantStoreId
    || shop.store_id
    || ''
  ).trim();
}

function isDemoMode(app) {
  return !!(app && app.isMerchantDemoMode && app.isMerchantDemoMode());
}

function listLedgerEntries(storeId) {
  return callLedgerService('listLedgerEntries', { store_id: storeId || '' });
}

function saveLedgerEntry(entry) {
  return callLedgerService('saveLedgerEntry', { entry });
}

function updateLedgerEntry(entryId, updates) {
  return callLedgerService('updateLedgerEntry', {
    entry_id: entryId,
    updates
  });
}

function deleteLedgerEntry(entryId, storeId) {
  return callLedgerService('deleteLedgerEntry', {
    entry_id: entryId,
    store_id: storeId || ''
  });
}

function fetchLedgerEntries(app, { force } = {}) {
  const demo = isDemoMode(app);
  if (demo) {
    if (merchantDemo.ensureDemoData) merchantDemo.ensureDemoData();
    return Promise.resolve(getLocalEntries(true));
  }

  const cached = getLocalEntries(false);
  const storeId = resolveStoreId(app);
  if (!storeId) {
    return Promise.resolve(cached);
  }

  return listLedgerEntries(storeId)
    .then((res) => {
      if (res && res.success && Array.isArray(res.entries)) {
        const list = sortEntries(res.entries.map(normalizeEntry).filter(Boolean));
        saveLocalEntries(list, false);
        return list;
      }
      if (force && cached.length) return cached;
      if (cached.length) return cached;
      throw new Error((res && res.errMsg) || '加载记账失败');
    })
    .catch((err) => {
      if (cached.length) {
        console.warn('[记账本] 服务端拉取失败，使用本地缓存', err);
        return cached;
      }
      throw err;
    });
}

function createEntry(app, payload) {
  const type = payload.type === 'income' ? 'income' : 'expense';
  const category = String(payload.category || '').trim();
  const amount = roundMoney(payload.amount);
  const note = String(payload.note || '').trim();
  const date = String(payload.date || '').trim() || todayYmd();
  const storeId = resolveStoreId(app);
  const demo = isDemoMode(app);

  if (!(amount > 0)) {
    return Promise.reject(new Error('请输入有效金额'));
  }
  if (!category) {
    return Promise.reject(new Error('请选择分类'));
  }

  const now = Date.now();
  const draft = {
    id: `ledger_${now}_${Math.floor(Math.random() * 1000)}`,
    store_id: storeId,
    type,
    category,
    categoryLabel: categoryLabel(type, category),
    amount,
    note,
    date,
    createTime: now,
    updateTime: now
  };

  if (demo) {
    return Promise.resolve(upsertLocalEntry(draft, true));
  }

  if (!storeId) {
    return Promise.reject(new Error('未绑定店铺，无法同步记账'));
  }

  return saveLedgerEntry(draft)
    .then((res) => {
      if (!res || !res.success) {
        throw new Error((res && res.errMsg) || '保存失败');
      }
      const saved = normalizeEntry(res.entry || draft) || draft;
      upsertLocalEntry(saved, false);
      return saved;
    });
}

function editEntry(app, entryId, payload) {
  const id = String(entryId || '').trim();
  if (!id) return Promise.reject(new Error('记录不存在'));

  const demo = isDemoMode(app);
  const type = payload.type === 'income' ? 'income' : 'expense';
  const category = String(payload.category || '').trim();
  const amount = roundMoney(payload.amount);
  const note = String(payload.note || '').trim();
  const date = String(payload.date || '').trim() || todayYmd();

  if (!(amount > 0)) {
    return Promise.reject(new Error('请输入有效金额'));
  }
  if (!category) {
    return Promise.reject(new Error('请选择分类'));
  }

  const updates = {
    type,
    category,
    categoryLabel: categoryLabel(type, category),
    amount,
    note,
    date,
    updateTime: Date.now()
  };

  if (demo) {
    const existing = getLocalEntries(true).find((item) => item.id === id);
    if (!existing) return Promise.reject(new Error('记录不存在'));
    return Promise.resolve(upsertLocalEntry({ ...existing, ...updates }, true));
  }

  return updateLedgerEntry(id, updates)
    .then((res) => {
      if (!res || !res.success) {
        throw new Error((res && res.errMsg) || '更新失败');
      }
      const existing = getLocalEntries(false).find((item) => item.id === id) || { id, store_id: resolveStoreId(app) };
      const saved = normalizeEntry(res.entry || { ...existing, ...updates });
      upsertLocalEntry(saved, false);
      return saved;
    });
}

function removeEntry(app, entryId) {
  const id = String(entryId || '').trim();
  if (!id) return Promise.reject(new Error('记录不存在'));
  const demo = isDemoMode(app);

  if (demo) {
    removeLocalEntry(id, true);
    return Promise.resolve({ success: true });
  }

  return deleteLedgerEntry(id, resolveStoreId(app))
    .then((res) => {
      if (!res || !res.success) {
        throw new Error((res && res.errMsg) || '删除失败');
      }
      removeLocalEntry(id, false);
      return res;
    });
}

function summarizeEntries(entries, typeFilter) {
  let expense = 0;
  let income = 0;
  (entries || []).forEach((entry) => {
    if (typeFilter && typeFilter !== 'all' && entry.type !== typeFilter) return;
    if (entry.type === 'income') income += entry.amount;
    else expense += entry.amount;
  });
  return {
    expense: roundMoney(expense),
    income: roundMoney(income),
    net: roundMoney(income - expense)
  };
}

function currentMonthKey(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(monthKey) {
  const key = String(monthKey || '').trim();
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return key || '本月';
  return `${match[1]}年${parseInt(match[2], 10)}月`;
}

function entryMonthKey(entry) {
  const date = String((entry && entry.date) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(0, 7);
  const ts = getEntryTimestamp(entry);
  if (!ts) return '';
  return currentMonthKey(new Date(ts));
}

function filterEntriesByMonth(entries, monthKey) {
  const key = String(monthKey || '').trim() || currentMonthKey();
  return (entries || []).filter((entry) => entryMonthKey(entry) === key);
}

function filterEntries(entries, typeFilter, monthKey) {
  let list = Array.isArray(entries) ? entries : [];
  if (monthKey) {
    list = filterEntriesByMonth(list, monthKey);
  }
  if (!typeFilter || typeFilter === 'all') return list;
  return list.filter((item) => item.type === typeFilter);
}

function formatAmount(value) {
  const n = roundMoney(value);
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function decorateEntry(entry) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return null;
  const sign = normalized.type === 'income' ? '+' : '-';
  return {
    ...normalized,
    amountText: `${sign}¥${formatAmount(normalized.amount)}`,
    typeLabel: normalized.type === 'income' ? '额外收入' : '支出'
  };
}

module.exports = {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesForType,
  categoryLabel,
  todayYmd,
  normalizeEntry,
  sortEntries,
  getLocalEntries,
  fetchLedgerEntries,
  createEntry,
  editEntry,
  removeEntry,
  summarizeEntries,
  filterEntries,
  filterEntriesByMonth,
  currentMonthKey,
  formatMonthLabel,
  formatAmount,
  decorateEntry,
  getEntryTimestamp,
  parseDateYmd
};
