const MBTI_TYPE_IDS = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
];

const MBTI_TYPE_NAMES = {
  ISTJ: '家委会主任',
  ISFJ: '隐形保姆',
  INFJ: '窗边哲学家',
  INTJ: '暗中观察CEO',
  ISTP: '拆家工程师',
  ISFP: '行走的艺术品',
  INFP: '修仙咸鱼',
  INTP: '理论派干饭人',
  ESTP: '全场焦点运动员',
  ESFP: '派对永动机',
  ENFP: '快乐遥控器',
  ENTP: '抬杠小天才',
  ESTJ: '项目经理修狗',
  ESFJ: '居委会热心肠',
  ENFJ: '灵魂治愈师',
  ENTJ: '霸总本霸'
};

function clipText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function clipTips(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
}

function isMbtiTypeId(typeId) {
  return MBTI_TYPE_IDS.includes(typeId);
}

/**
 * 宠物 MBTI 结果。档案非必填：缺省或无法识别时返回 null，不阻断保存。
 */
function normalizePersonality(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const typeId = String(raw.typeId || raw.id || '').trim().toUpperCase();
  const typeName = clipText(raw.typeName || MBTI_TYPE_NAMES[typeId] || '', 40);
  if (!typeId || !typeName) return null;
  if (typeId.length > 24) return null;
  return {
    version: isMbtiTypeId(typeId) ? 2 : Math.max(1, Number(raw.version) || 1),
    typeId,
    typeName,
    typeShort: clipText(raw.typeShort || typeId, 8) || typeId.slice(0, 8),
    subtitle: clipText(raw.subtitle, 80),
    summary: clipText(raw.summary, 400),
    careTips: clipTips(raw.careTips),
    boardingTips: clipTips(raw.boardingTips),
    completedAt: Number(raw.completedAt) > 0 ? Number(raw.completedAt) : 0
  };
}

function pickPersonality(...candidates) {
  for (let i = 0; i < candidates.length; i += 1) {
    const normalized = normalizePersonality(candidates[i]);
    if (normalized) return normalized;
  }
  return null;
}

function formatPersonalityLabel(raw) {
  const personality = normalizePersonality(raw);
  if (!personality) return '';
  return [personality.typeId, personality.typeName].filter(Boolean).join(' ');
}

module.exports = {
  MBTI_TYPE_IDS,
  MBTI_TYPE_NAMES,
  isMbtiTypeId,
  normalizePersonality,
  pickPersonality,
  formatPersonalityLabel
};
