const MBTI_TYPE_IDS = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'
];

const MBTI_TYPE_NAMES = {
  ISTJ: '物流师',
  ISFJ: '守卫者',
  INFJ: '提倡者',
  INTJ: '建筑师',
  ISTP: '鉴赏家',
  ISFP: '探险家',
  INFP: '调停者',
  INTP: '逻辑学家',
  ESTP: '企业家',
  ESFP: '表演者',
  ENFP: '竞选者',
  ENTP: '辩论家',
  ESTJ: '总经理',
  ESFJ: '执政官',
  ENFJ: '主人公',
  ENTJ: '指挥官'
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
    tag: clipText(raw.tag, 20),
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
