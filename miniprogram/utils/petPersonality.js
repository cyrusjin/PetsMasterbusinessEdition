const { STORAGE_KEYS } = require('./constants');

const VERSION = 2;

const AXIS = {
  EI: { label: '社交现场', letters: ['E', 'I'] },
  SN: { label: '脑内世界', letters: ['S', 'N'] },
  TF: { label: '情感态度', letters: ['T', 'F'] },
  JP: { label: '生活作风', letters: ['J', 'P'] }
};

const QUESTIONS = [
  {
    id: 'ei1',
    dim: 'EI',
    prompt: {
      dog: '门一响，它的第一反应更像？',
      cat: '门一响，它的第一反应更像？',
      other: '家里来人时，它的第一反应更像？'
    },
    a: {
      letter: 'E',
      text: {
        dog: '直接飞扑，欢迎仪式比春晚还隆重',
        cat: '踩着客人的包去安检，顺便巡视领地',
        other: '立刻现身营业，生怕少一个观众'
      }
    },
    b: {
      letter: 'I',
      text: {
        dog: '先钻沙发底，确认来的不是那个拿澡盆的',
        cat: '秒变走廊尽头的一缕影子',
        other: '先隐身观察三集，再决定出不出现'
      }
    }
  },
  {
    id: 'ei2',
    dim: 'EI',
    prompt: {
      dog: '下楼遇到同类时，它通常？',
      cat: '窗台上有人路过时，它通常？',
      other: '碰到不熟的同类时，它通常？'
    },
    a: {
      letter: 'E',
      text: {
        dog: '全小区的狗都是发小，社交日历排到明年',
        cat: '窗台就是演播厅，路过的都是观众',
        other: '主动上前寒暄，仿佛在发名片'
      }
    },
    b: {
      letter: 'I',
      text: {
        dog: '看见同类先装树，社交任务能躲就躲',
        cat: '家里三个人已经够热闹了谢谢',
        other: '保持安全距离，眼神翻译是「别过来」'
      }
    }
  },
  {
    id: 'sn1',
    dim: 'SN',
    prompt: {
      dog: '给它一个新玩具，它更可能？',
      cat: '给它一个纸箱，它更可能？',
      other: '给它一个新玩意，它更可能？'
    },
    a: {
      letter: 'S',
      text: {
        dog: '咬、拆、埋，三步走完再思考人生',
        cat: '钻进去睡觉，纸箱的最高使命就是这个',
        other: '先上手试验，实用主义拉满'
      }
    },
    b: {
      letter: 'N',
      text: {
        dog: '对着空气汪两声，明显在打一场你看不见的架',
        cat: '对着墙角发呆三小时，疑似在写小说',
        other: '先研究它的宇宙意义，再决定用不用'
      }
    }
  },
  {
    id: 'sn2',
    dim: 'SN',
    prompt: {
      dog: '你出门后，它更像在？',
      cat: '你出门后，它更像在？',
      other: '家里没人时，它更像在？'
    },
    a: {
      letter: 'S',
      text: {
        dog: '老实等，最多把拖鞋搬去一个「风水更好」的位置',
        cat: '该吃吃该睡睡，作息比你还稳',
        other: '按原计划过日子，不搞抽象创作'
      }
    },
    b: {
      letter: 'N',
      text: {
        dog: '把客厅重新装修成它想象中的游乐场',
        cat: '开始筹备晚上三点的个人演唱会',
        other: '在脑内完成一部冒险片，家具是道具'
      }
    }
  },
  {
    id: 'tf1',
    dim: 'TF',
    prompt: {
      dog: '你说「不行」的时候，它更像？',
      cat: '你阻止它搞事情的时候，它更像？',
      other: '你阻止它做某事时，它更像？'
    },
    a: {
      letter: 'T',
      text: {
        dog: '一脸「你说你的，我有我的计划」',
        cat: '听完，转头把杯子推下去当回执',
        other: '迅速评估利弊，然后继续原方案'
      }
    },
    b: {
      letter: 'F',
      text: {
        dog: '瞬间变成全世界最委屈的狗',
        cat: '不理你三天，但会在你 emo 时突然贴上来',
        other: '先受伤，再决定要不要给你一个台阶'
      }
    }
  },
  {
    id: 'tf2',
    dim: 'TF',
    prompt: {
      dog: '你心情很差摊在沙发上，它会？',
      cat: '你心情很差摊在沙发上，它会？',
      other: '你明显不高兴时，它会？'
    },
    a: {
      letter: 'T',
      text: {
        dog: '把球推过来：解决方案就是再玩一把',
        cat: '继续睡，觉得你有点小题大做',
        other: '提供一个非常实际但完全不走心的方案'
      }
    },
    b: {
      letter: 'F',
      text: {
        dog: '沉默贴着你，专业情绪海绵上线',
        cat: '坐到键盘上，强制你停止内耗',
        other: '挨过来当暖水袋，业务是陪伴不是讲理'
      }
    }
  },
  {
    id: 'jp1',
    dim: 'JP',
    prompt: {
      dog: '到了惯常的出门时间，它？',
      cat: '到了惯常的开饭时间，它？',
      other: '到了惯常的日程点，它？'
    },
    a: {
      letter: 'J',
      text: {
        dog: '会用眼神看表，误差超过三分钟开始审计你',
        cat: '饭点误差超过三分钟，开始拍桌子',
        other: '日程感很强，迟到会被记仇'
      }
    },
    b: {
      letter: 'P',
      text: {
        dog: '今天想疯跑就疯跑，想摆烂就原地融化',
        cat: '白天是死的，晚上是活的，完全随缘',
        other: '计划是参考，灵感才是KPI'
      }
    }
  },
  {
    id: 'jp2',
    dim: 'JP',
    prompt: {
      dog: '散步路线要改道时，它？',
      cat: '你把纸箱/窝挪了位置，它？',
      other: '你临时改了安排，它？'
    },
    a: {
      letter: 'J',
      text: {
        dog: '拒绝，这条路昨天才认证过',
        cat: '闹革命，家具位置属于宪法',
        other: '需要重新开会，不能说改就改'
      }
    },
    b: {
      letter: 'P',
      text: {
        dog: '新味道？立刻改道，计划是用来打破的',
        cat: '今晚睡哪全看灵感，挪了刚好换景',
        other: '惊喜！生活需要一点混乱'
      }
    }
  }
];

const TYPES = {
  ISTJ: {
    typeName: '家委会主任',
    subtitle: '内向 · 现实 · 理智 · 计划',
    summary: '冰箱开门时间已备案。它不是高冷，只是认为家里该有规章制度，而你经常违规。',
    careTips: [
      '喂食时间请准点，误差会被记进小本本。',
      '玩具用完请放回原位，否则它会用眼神加班。'
    ],
    boardingTips: [
      '给它固定房间和固定碗，别今天东明天西。',
      '少安排突然派对，家委会不处理即兴活动。'
    ]
  },
  ISFJ: {
    typeName: '隐形保姆',
    subtitle: '内向 · 现实 · 情感 · 计划',
    summary: '你没叫它，拖鞋已经到位。表面安静，实际把全家人的作息都默默承包了。',
    careTips: [
      '它很会忍，不代表你可以把委屈当空气。',
      '回家先摸摸它，隐形保姆也要绩效面谈。'
    ],
    boardingTips: [
      '需要一点熟悉气味，不然它会担心你是不是还活着。',
      '温柔规律就好，不必强迫它当气氛组。'
    ]
  },
  INFJ: {
    typeName: '窗边哲学家',
    subtitle: '内向 · 脑补 · 情感 · 计划',
    summary: '三点的光斑有宇宙意义。它看着你，其实在看你有没有理解它没说出口的那句话。',
    careTips: [
      '别随时打断它发呆，那是在开会。',
      '情绪价值拉满，但社交电量很低，请节制访客。'
    ],
    boardingTips: [
      '安静角落比热闹大厅重要一百倍。',
      '打卡视频请拍它思考人生，不要硬凑欢乐。'
    ]
  },
  INTJ: {
    typeName: '暗中观察CEO',
    subtitle: '内向 · 脑补 · 理智 · 计划',
    summary: '沙发是总部，你只是临时工。它不吵，是因为战略已经想好了，执行时间另说。',
    careTips: [
      '不要突然抱，先发会议邀请。',
      '它看起来在无视你，其实在优化你的生存权限。'
    ],
    boardingTips: [
      '独立空间，谢绝热情过度的店员。',
      '流程清楚它就合作，混乱它就启动冷处理。'
    ]
  },
  ISTP: {
    typeName: '拆家工程师',
    subtitle: '内向 · 现实 · 理智 · 随缘',
    summary: '遥控器里一定有秘密。它不是破坏，是在做结构实验，经费由你家家具承担。',
    careTips: [
      '给它合法可拆的东西，否则沙发腿会报名。',
      '夸奖请针对技术，别走煽情路线。'
    ],
    boardingTips: [
      '收好线、鞋和能咬的遥控器替代品。',
      '活动量给够，工程师闲着就会立项。'
    ]
  },
  ISFP: {
    typeName: '行走的艺术品',
    subtitle: '内向 · 现实 · 情感 · 随缘',
    summary: '睡觉姿势都要出片。它敏感、好看、偶尔抽风，审美在线，逻辑离线。',
    careTips: [
      '强行合照会被记仇，引导它自己摆。',
      '环境舒服比训练口令更重要。'
    ],
    boardingTips: [
      '光线好、人少、有窗，它会自己完成营业。',
      '不要一群人围观，艺术品需要呼吸。'
    ]
  },
  INFP: {
    typeName: '修仙咸鱼',
    subtitle: '内向 · 脑补 · 情感 · 随缘',
    summary: '世界与我无关，碗除外。它不是懒，是在内耗和睡觉之间选择了睡觉。',
    careTips: [
      '叫它起来请附赠零食，否则属于无效加班。',
      '偶发黏人请珍惜，那是限量款情绪价值。'
    ],
    boardingTips: [
      '让它睡，真的，让它睡。',
      '熟悉毯子比热情互动更有用。'
    ]
  },
  INTP: {
    typeName: '理论派干饭人',
    subtitle: '内向 · 脑补 · 理智 · 随缘',
    summary: '先研究碗的结构，再决定吃不吃。行动迟缓，脑子很吵，结论经常是「再观察观察」。',
    careTips: [
      '新玩具请给研究时间，别催它立刻表演。',
      '训练要讲道理，虽然它不一定听。'
    ],
    boardingTips: [
      '环境稳定即可，别安排过于热闹的团建。',
      '它可能看起来没反应，其实在后台加载。'
    ]
  },
  ESTP: {
    typeName: '全场焦点运动员',
    subtitle: '外向 · 现实 · 理智 · 随缘',
    summary: '进门先绕场三周。问题都可以用跑两圈解决，不能解决就再跑两圈。',
    careTips: [
      '电量不消耗完会拆家，这是物理定律。',
      '客人进门前先让它热完身，再允许握手。'
    ],
    boardingTips: [
      '活动空间和定时放电，否则全店都知道它来了。',
      '洗护前先运动，兴奋下降再开工。'
    ]
  },
  ESFP: {
    typeName: '派对永动机',
    subtitle: '外向 · 现实 · 情感 · 随缘',
    summary: '客人是来给它过生日的。镜头一举它就上线，没有观众也会自己鼓掌。',
    careTips: [
      '请提供舞台，否则它会把餐桌当T台。',
      '情绪来得快去得也快，别跟它比谁更戏剧。'
    ],
    boardingTips: [
      '适合出镜，请多拍，它会很配合营业。',
      '注意别让它社交到脱水。'
    ]
  },
  ENFP: {
    typeName: '快乐遥控器',
    subtitle: '外向 · 脑补 · 情感 · 随缘',
    summary: '情绪价值拉满，逻辑为零。下一秒要干什么连它自己都不知道，但一定很热情。',
    careTips: [
      '计划会破产，请准备B计划、C计划和零食。',
      '它会治好你的emo，然后把你的拖鞋藏起来。'
    ],
    boardingTips: [
      '多互动，但给它一个能断电的小窝。',
      '太安静它会自己制造节目效果。'
    ]
  },
  ENTP: {
    typeName: '抬杠小天才',
    subtitle: '外向 · 脑补 · 理智 · 随缘',
    summary: '你指东它往西，还觉得自己赢了。生活是一场辩论赛，奖品是你的零食。',
    careTips: [
      '不要和它讲道理，它会升级成课题。',
      '新花样可以有，但请看好家具。'
    ],
    boardingTips: [
      '聪明又闲就会搞事情，请给课题（玩具）。',
      '店员要有点幽默感，严肃会输。'
    ]
  },
  ESTJ: {
    typeName: '项目经理修狗',
    subtitle: '外向 · 现实 · 理智 · 计划',
    summary: '遛狗路线不允许偏差。它不是凶，是在催进度，你是那个总延期的供应商。',
    careTips: [
      '规则清晰它就好带，朝令夕改会挨瞪。',
      '请按时交付散步、饭和夸奖。'
    ],
    boardingTips: [
      '作息写清楚，它会自己执行项目计划。',
      '适合有秩序的店，不适合大型即兴派对。'
    ]
  },
  ESFJ: {
    typeName: '居委会热心肠',
    subtitle: '外向 · 现实 · 情感 · 计划',
    summary: '每栋楼的人都认识它。它操心你、操心客人、还操心隔壁那只不回消息的狗。',
    careTips: [
      '它很需要被需要，冷落比挨骂更伤。',
      '访客多时请让它当接待，不然它会加班到门口。'
    ],
    boardingTips: [
      '友善但黏人，固定照料者会让它更安心。',
      '适合温和社交，不适合放养不管。'
    ]
  },
  ENFJ: {
    typeName: '灵魂治愈师',
    subtitle: '外向 · 脑补 · 情感 · 计划',
    summary: '你一 emo 它就贴上来。它真心觉得自己有义务拯救这个家，包括你的恋爱脑。',
    careTips: [
      '它会读空气，所以你的假笑没用。',
      '给足够陪伴，否则它会开始做思想工作。'
    ],
    boardingTips: [
      '需要回应，请多拍「我很好」的视频给主人。',
      '适合温柔互动，不适合冷处理。'
    ]
  },
  ENTJ: {
    typeName: '霸总本霸',
    subtitle: '外向 · 脑补 · 理智 · 计划',
    summary: '家里没有主人，只有CEO。你负责开门和开饭，它负责战略、否决权和沙发。',
    careTips: [
      '协商可以，命令免谈。',
      '它很能干也很要面子，当众训它等于宫斗开场。'
    ],
    boardingTips: [
      '给它一点掌控感，比如固定高处或固定床。',
      '不要一上来就热情过载，先递上名片（零食）。'
    ]
  }
};

function speciesKind(type) {
  const text = String(type || '');
  if (text.includes('猫')) return 'cat';
  if (text.includes('犬') || text.includes('狗')) return 'dog';
  return 'other';
}

function pickText(map, kind) {
  if (!map || typeof map !== 'object') return '';
  return map[kind] || map.other || map.dog || '';
}

function getQuestions(type) {
  const kind = speciesKind(type);
  return QUESTIONS.map((item) => ({
    id: item.id,
    dim: item.dim,
    dimLabel: AXIS[item.dim] ? AXIS[item.dim].label : '',
    prompt: pickText(item.prompt, kind),
    options: [
      {
        letter: item.a.letter,
        tag: 'A',
        text: pickText(item.a.text, kind)
      },
      {
        letter: item.b.letter,
        tag: 'B',
        text: pickText(item.b.text, kind)
      }
    ]
  }));
}

function pickLetter(counts, left, right) {
  const a = Number(counts[left]) || 0;
  const b = Number(counts[right]) || 0;
  if (a === b) return /[ENFP]/.test(left) ? left : right;
  return a > b ? left : right;
}

function classifyLetters(answers) {
  const counts = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  (answers || []).forEach((letter) => {
    const key = String(letter || '').toUpperCase();
    if (counts[key] != null) counts[key] += 1;
  });
  return [
    pickLetter(counts, 'E', 'I'),
    pickLetter(counts, 'N', 'S'),
    pickLetter(counts, 'F', 'T'),
    pickLetter(counts, 'P', 'J')
  ].join('');
}

function normalizePersonality(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const typeId = String(raw.typeId || raw.id || '').trim().toUpperCase();
  const preset = TYPES[typeId];
  const typeName = String(raw.typeName || (preset && preset.typeName) || '').trim();
  if (!typeId || !typeName) return null;
  const type = preset || {
    typeName,
    typeShort: String(raw.typeShort || typeId).trim(),
    subtitle: String(raw.subtitle || '').trim(),
    summary: String(raw.summary || '').trim(),
    careTips: Array.isArray(raw.careTips) ? raw.careTips : [],
    boardingTips: Array.isArray(raw.boardingTips) ? raw.boardingTips : []
  };
  const tips = (list, fallback) => {
    const source = Array.isArray(list) && list.length ? list : fallback;
    return (source || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
  };
  return {
    version: VERSION,
    typeId,
    typeName,
    typeShort: String(raw.typeShort || type.typeShort || typeId).trim().slice(0, 8),
    subtitle: String(raw.subtitle || type.subtitle || '').trim().slice(0, 80),
    summary: String(raw.summary || type.summary || '').trim().slice(0, 400),
    careTips: tips(raw.careTips, type.careTips),
    boardingTips: tips(raw.boardingTips, type.boardingTips),
    completedAt: Number(raw.completedAt) || 0
  };
}

function buildResult(answers) {
  const typeId = classifyLetters(answers);
  const type = TYPES[typeId];
  if (!type) return null;
  return normalizePersonality({
    ...type,
    typeId,
    typeShort: typeId,
    completedAt: Date.now()
  });
}

function loadLocalMap() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEYS.PET_PERSONALITY);
    return raw && typeof raw === 'object' ? raw : {};
  } catch (err) {
    return {};
  }
}

function saveLocal(petId, personality) {
  const id = String(petId || '').trim();
  const normalized = normalizePersonality(personality);
  if (!id || !normalized) return null;
  const map = loadLocalMap();
  map[id] = normalized;
  try {
    wx.setStorageSync(STORAGE_KEYS.PET_PERSONALITY, map);
  } catch (err) {
    // ignore quota
  }
  return normalized;
}

function getPersonality(pet) {
  if (!pet) return null;
  const fromPet = normalizePersonality(pet.personality);
  if (fromPet) return fromPet;
  const id = pet.id || pet.pet_id;
  if (!id) return null;
  return normalizePersonality(loadLocalMap()[id]);
}

function attachToPet(pet) {
  if (!pet) return pet;
  const personality = getPersonality(pet);
  return {
    ...pet,
    personality,
    personalityName: personality ? personality.typeName : '',
    personalityShort: personality ? personality.typeShort || personality.typeId : '',
    personalitySubtitle: personality ? personality.subtitle : ''
  };
}

function attachToPets(pets) {
  return (pets || []).map(attachToPet);
}

function persistToPet(pet, personality) {
  const normalized = normalizePersonality(personality);
  if (!pet || !normalized) return pet;
  const label = `${normalized.typeId} ${normalized.typeName}`.trim();
  const current = String(pet.character || '').trim();
  const previousName = pet.personality && pet.personality.typeName
    ? String(pet.personality.typeName).trim()
    : '';
  const previousLabel = pet.personality && pet.personality.typeId
    ? `${pet.personality.typeId} ${previousName}`.trim()
    : previousName;
  const character = !current || current === previousName || current === previousLabel ? label : current;
  return {
    ...pet,
    personality: normalized,
    character,
    personalityName: normalized.typeName,
    personalityShort: normalized.typeShort || normalized.typeId,
    personalitySubtitle: normalized.subtitle
  };
}

module.exports = {
  VERSION,
  AXIS,
  QUESTIONS,
  TYPES,
  speciesKind,
  getQuestions,
  getPersonality,
  attachToPet,
  attachToPets,
  buildResult,
  normalizePersonality,
  saveLocal,
  persistToPet
};
