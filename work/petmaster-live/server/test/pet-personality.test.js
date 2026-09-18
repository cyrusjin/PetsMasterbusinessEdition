const assert = require('node:assert/strict');
const {
  normalizePersonality,
  pickPersonality,
  formatPersonalityLabel
} = require('../src/services/petPersonality');

function main() {
  assert.equal(normalizePersonality(null), null);
  assert.equal(normalizePersonality(undefined), null);
  assert.equal(normalizePersonality(''), null);
  assert.equal(normalizePersonality({}), null);
  assert.equal(normalizePersonality({ scores: { energy: 80 } }), null);
  assert.equal(normalizePersonality({ typeId: '???' }), null);

  const mbti = normalizePersonality({
    typeId: 'enfp',
    typeName: '快乐遥控器',
    typeShort: 'ENFP',
    tag: '快乐开关',
    subtitle: '外向 · 脑补 · 情感 · 随缘',
    summary: '家里的快乐开关，说开就开。',
    scores: { sociability: 99, energy: 88 },
    careTips: ['多陪玩', '', '少说教'],
    boardingTips: ['给个窗口位'],
    completedAt: 1710000000000
  });
  assert.equal(mbti.version, 2);
  assert.equal(mbti.typeId, 'ENFP');
  assert.equal(mbti.typeName, '快乐遥控器');
  assert.equal(mbti.typeShort, 'ENFP');
  assert.equal(mbti.tag, '快乐开关');
  assert.equal('scores' in mbti, false);
  assert.deepEqual(mbti.careTips, ['多陪玩', '少说教']);
  assert.deepEqual(mbti.boardingTips, ['给个窗口位']);
  assert.equal(mbti.completedAt, 1710000000000);

  const filled = normalizePersonality({ typeId: 'ENTJ' });
  assert.equal(filled.typeName, '指挥官');
  assert.equal(filled.version, 2);

  const legacy = normalizePersonality({
    version: 1,
    typeId: 'social-butterfly',
    typeName: '社交明星',
    scores: { sociability: 90 }
  });
  assert.equal(legacy.version, 1);
  assert.equal(legacy.typeId, 'SOCIAL-BUTTERFLY');
  assert.equal(legacy.typeName, '社交明星');
  assert.equal('scores' in legacy, false);

  assert.equal(pickPersonality(null, {}, { typeId: 'ISFP' }).typeName, '探险家');
  assert.equal(formatPersonalityLabel({ typeId: 'INFP' }), 'INFP 调停者');
  assert.equal(formatPersonalityLabel(null), '');

  console.log('pet-personality.test.js ok');
}

main();
