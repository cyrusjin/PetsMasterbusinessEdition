const STORAGE_PREFIX = 'pet_daily_desc_phrases';
const HIDDEN_STORAGE_PREFIX = 'pet_daily_desc_phrases_hidden';
const MAX_CUSTOM_PHRASES = 10;
const MAX_PHRASE_LENGTH = 30;

const DEFAULT_QUICK_DESC_PHRASES = [
  '吃饭正常，食欲不错',
  '饮水正常',
  '大小便正常',
  '精神状态良好',
  '今日状态稳定，请放心',
  '活泼好动，一切正常',
  '休息充足，精神头很好'
];

function getStorageKey(prefix, storeId) {
  return storeId ? `${prefix}_${storeId}` : prefix;
}

function loadCustomPhrases(storeId) {
  try {
    const list = wx.getStorageSync(getStorageKey(STORAGE_PREFIX, storeId));
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch (err) {
    return [];
  }
}

function saveCustomPhrases(storeId, phrases) {
  wx.setStorageSync(getStorageKey(STORAGE_PREFIX, storeId), (phrases || []).filter(Boolean));
}

function loadHiddenDefaultPhrases(storeId) {
  try {
    const list = wx.getStorageSync(getStorageKey(HIDDEN_STORAGE_PREFIX, storeId));
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch (err) {
    return [];
  }
}

function saveHiddenDefaultPhrases(storeId, phrases) {
  wx.setStorageSync(getStorageKey(HIDDEN_STORAGE_PREFIX, storeId), (phrases || []).filter(Boolean));
}

function loadPhrasePrefs(storeId) {
  return {
    customPhrases: loadCustomPhrases(storeId),
    hiddenDefaultPhrases: loadHiddenDefaultPhrases(storeId)
  };
}

function getVisiblePhraseTexts(customPhrases, hiddenDefaultPhrases) {
  const hiddenSet = new Set(hiddenDefaultPhrases || []);
  const defaults = DEFAULT_QUICK_DESC_PHRASES.filter((text) => !hiddenSet.has(text));
  return defaults.concat(customPhrases || []);
}

function isDefaultPhrase(phrase) {
  return DEFAULT_QUICK_DESC_PHRASES.includes(phrase);
}

function addCustomPhrase(storeId, phrase, prefs) {
  const trimmed = (phrase || '').trim();
  if (!trimmed) {
    return { ok: false, message: '请输入用语内容' };
  }
  if (trimmed.length > MAX_PHRASE_LENGTH) {
    return { ok: false, message: `用语不超过${MAX_PHRASE_LENGTH}字` };
  }

  const customPhrases = (prefs && prefs.customPhrases) || loadCustomPhrases(storeId);
  const hiddenDefaultPhrases = (prefs && prefs.hiddenDefaultPhrases) || loadHiddenDefaultPhrases(storeId);
  const visiblePhrases = getVisiblePhraseTexts(customPhrases, hiddenDefaultPhrases);

  if (visiblePhrases.includes(trimmed)) {
    return { ok: false, message: '该用语已存在' };
  }
  if (customPhrases.length >= MAX_CUSTOM_PHRASES) {
    return { ok: false, message: `最多添加${MAX_CUSTOM_PHRASES}条自定义用语` };
  }

  const nextCustomPhrases = customPhrases.concat(trimmed);
  let nextHiddenDefaultPhrases = hiddenDefaultPhrases;
  if (hiddenDefaultPhrases.includes(trimmed)) {
    nextHiddenDefaultPhrases = hiddenDefaultPhrases.filter((item) => item !== trimmed);
    saveHiddenDefaultPhrases(storeId, nextHiddenDefaultPhrases);
  }

  saveCustomPhrases(storeId, nextCustomPhrases);
  return {
    ok: true,
    customPhrases: nextCustomPhrases,
    hiddenDefaultPhrases: nextHiddenDefaultPhrases
  };
}

function removePhrase(storeId, phrase, prefs) {
  const customPhrases = (prefs && prefs.customPhrases) || loadCustomPhrases(storeId);
  const hiddenDefaultPhrases = (prefs && prefs.hiddenDefaultPhrases) || loadHiddenDefaultPhrases(storeId);

  if (isDefaultPhrase(phrase)) {
    const nextHiddenDefaultPhrases = hiddenDefaultPhrases.includes(phrase)
      ? hiddenDefaultPhrases
      : hiddenDefaultPhrases.concat(phrase);
    saveHiddenDefaultPhrases(storeId, nextHiddenDefaultPhrases);
    return {
      customPhrases,
      hiddenDefaultPhrases: nextHiddenDefaultPhrases
    };
  }

  const nextCustomPhrases = customPhrases.filter((item) => item !== phrase);
  saveCustomPhrases(storeId, nextCustomPhrases);
  return {
    customPhrases: nextCustomPhrases,
    hiddenDefaultPhrases
  };
}

function splitDescParts(desc) {
  return (desc || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
}

function joinDescParts(parts) {
  return (parts || []).filter(Boolean).join('，');
}

function buildQuickPhrases(desc, customPhrases, hiddenDefaultPhrases) {
  const parts = splitDescParts(desc);
  const defaultSet = new Set(DEFAULT_QUICK_DESC_PHRASES);
  return getVisiblePhraseTexts(customPhrases, hiddenDefaultPhrases).map((text) => ({
    text,
    selected: parts.includes(text),
    custom: !defaultSet.has(text)
  }));
}

function toggleQuickPhrase(desc, phrase) {
  const parts = splitDescParts(desc);
  const index = parts.indexOf(phrase);
  if (index >= 0) {
    parts.splice(index, 1);
  } else {
    parts.push(phrase);
  }
  return joinDescParts(parts);
}

function removePhraseFromDesc(desc, phrase) {
  const parts = splitDescParts(desc);
  const index = parts.indexOf(phrase);
  if (index < 0) return desc || '';
  parts.splice(index, 1);
  return joinDescParts(parts);
}

module.exports = {
  DEFAULT_QUICK_DESC_PHRASES,
  MAX_CUSTOM_PHRASES,
  MAX_PHRASE_LENGTH,
  loadCustomPhrases,
  loadHiddenDefaultPhrases,
  loadPhrasePrefs,
  addCustomPhrase,
  removePhrase,
  buildQuickPhrases,
  toggleQuickPhrase,
  removePhraseFromDesc
};
