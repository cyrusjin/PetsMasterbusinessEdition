const { STORAGE_KEYS } = require('./constants');

const VERSION = 3;
const PAGE_SIZE = 5;

const AXIS = {
  EI: { label: '社交能量', letters: ['E', 'I'] },
  SN: { label: '关注方式', letters: ['S', 'N'] },
  TF: { label: '决策风格', letters: ['T', 'F'] },
  JP: { label: '生活节奏', letters: ['J', 'P'] }
};

const OPPOSITE = {
  E: 'I', I: 'E',
  S: 'N', N: 'S',
  T: 'F', F: 'T',
  J: 'P', P: 'J'
};

const SCALE_OPTIONS = [
  { value: 1, label: '非常不符合' },
  { value: 2, label: '不符合' },
  { value: 3, label: '一般' },
  { value: 4, label: '符合' },
  { value: 5, label: '非常符合' }
];

const QUESTIONS = [
  {
    id: 'q01',
    dim: 'EI',
    letter: 'E',
    prompt: {
      dog: '狗狗在家中听到动感的音乐会很兴奋并加入进去',
      cat: '家里热闹或放起音乐时，猫咪会兴奋地凑过来一起加入',
      other: '你在旁边活动、环境热闹时，它会兴奋地探头出来跑一跑'
    }
  },
  {
    id: 'q02',
    dim: 'EI',
    letter: 'I',
    prompt: {
      dog: '遛狗时你的狗狗总会尽可能躲避其他狗狗',
      cat: '看到其他猫咪，哪怕只是窗外那只，它也总会尽可能躲开',
      other: '有同类靠近时，它总会缩回躲避屋，尽可能躲开'
    }
  },
  {
    id: 'q03',
    dim: 'EI',
    letter: 'E',
    prompt: {
      dog: '你的狗狗非常受周围人的欢迎',
      cat: '家里来客人时，猫咪愿意出现，也常被摸、被夸好亲近',
      other: '别人来看它时，它不怕人，愿意出现，也常被夸好接触'
    }
  },
  {
    id: 'q04',
    dim: 'EI',
    letter: 'I',
    prompt: {
      dog: '带狗去邻居或朋友家走访时，狗狗兴致缺缺',
      cat: '换环境、去别人家或进航空箱时，猫咪兴致缺缺，只想躲起来',
      other: '换笼子、换缸或拿到陌生环境时，它兴致缺缺，只想躲着'
    }
  },
  {
    id: 'q05',
    dim: 'EI',
    letter: 'E',
    prompt: {
      dog: '每当有人靠近时，你的狗狗都会表现出很大热情',
      cat: '你一靠近，猫咪就会很热情，主动蹭过来要摸',
      other: '你一靠近笼子或缸，它就会很积极地探头、凑过来'
    }
  },
  {
    id: 'q06',
    dim: 'SN',
    letter: 'S',
    prompt: {
      dog: '当你拎了一个袋子回家时，狗狗会先过来闻袋子',
      cat: '你拎袋子回家时，猫咪会先过来闻一闻、检查里面有什么',
      other: '你拿出袋子或新食物时，它会先凑过来闻、盯着看'
    }
  },
  {
    id: 'q07',
    dim: 'EI',
    letter: 'E',
    prompt: {
      dog: '任何人在家门口发出声音，狗狗都会很兴奋地迎接',
      cat: '听到开门或钥匙声，猫咪会跑到门口看一看',
      other: '听到你走近的脚步声，它就会从躲避处探头或出来'
    }
  },
  {
    id: 'q08',
    dim: 'EI',
    letter: 'E',
    prompt: {
      dog: '当遛狗时把狗绳伸给陌生人，狗狗会跟着陌生人回家',
      cat: '不太熟的人伸手摸或抱它，猫咪也愿意靠近，不太躲',
      other: '不太熟的人伸手靠近或把它拿出来，它也愿意配合、不太躲'
    }
  },
  {
    id: 'q09',
    dim: 'SN',
    letter: 'S',
    prompt: {
      dog: '你的狗狗只喜欢玩飞盘或球等特定玩具',
      cat: '猫咪只认某几种固定玩具，比如特定的逗猫棒或小球，换新的兴趣不大',
      other: '它只认固定的躲避屋、晒背点或某几种玩具，换新的兴趣不大'
    }
  },
  {
    id: 'q10',
    dim: 'SN',
    letter: 'N',
    prompt: {
      dog: '你家的狗狗热衷于追逐一切在移动的事物，比如被风吹起的衣服',
      cat: '猫咪热衷追逐一切会动的东西，比如光斑、绳子、飘动的窗帘',
      other: '它对晃动的影子、新摆件或任何会动的东西特别感兴趣'
    }
  },
  {
    id: 'q11',
    dim: 'TF',
    letter: 'T',
    prompt: {
      dog: '狗狗在家犯错之后总是笑嘻嘻的，毫不心虚',
      cat: '推倒杯子、抓沙发之后，猫咪总是若无其事，毫不心虚',
      other: '翻乱垫材、拱倒食盆之后，它总是若无其事，毫不心虚'
    }
  },
  {
    id: 'q12',
    dim: 'TF',
    letter: 'F',
    prompt: {
      dog: '当你情绪低落时，你的狗狗会很快察觉你的情绪并陪伴着你',
      cat: '你情绪低落时，猫咪会很快靠近，安静陪在你身边',
      other: '你情绪低落、坐在它旁边时，它会出来待着，而不是躲起来'
    }
  },
  {
    id: 'q13',
    dim: 'TF',
    letter: 'F',
    prompt: {
      dog: '睡觉时你的狗狗经常守在卧室门口',
      cat: '你睡觉时，猫咪经常守在卧室门口，或趴在床边、枕边',
      other: '你在房间里休息时，它常待在能看见你的位置，而不是缩在最深处'
    }
  },
  {
    id: 'q14',
    dim: 'TF',
    letter: 'F',
    prompt: {
      dog: '如果你突然晕倒，你的狗狗会焦急地呼唤你',
      cat: '如果你突然倒下或很久不动，猫咪会焦急地叫你或来回蹭你',
      other: '如果你突然很久不靠近，它会焦躁地叫、乱转或反复探头'
    }
  },
  {
    id: 'q15',
    dim: 'TF',
    letter: 'F',
    prompt: {
      dog: '当你出门后，你的狗狗会一直趴在门口等你回家',
      cat: '你出门后，猫咪会在门口或窗边等很久',
      other: '你离开后，它会长时间待在你常出现的那一侧等你回来'
    }
  },
  {
    id: 'q16',
    dim: 'JP',
    letter: 'P',
    prompt: {
      dog: '狗子热衷拆家，不管是玩具还是家具无一幸免',
      cat: '猫咪热衷拆家，纸巾、电线、纸箱都可能无一幸免',
      other: '它热衷把布置搞乱，垫材、食盆、摆件都可能无一幸免'
    }
  },
  {
    id: 'q17',
    dim: 'TF',
    letter: 'T',
    prompt: {
      dog: '当你在室外叫狗狗名字时，他从不会搭理你',
      cat: '你叫猫咪名字时，它经常当没听见',
      other: '你叫它或伸手招呼时，它经常不理你'
    }
  },
  {
    id: 'q18',
    dim: 'JP',
    letter: 'J',
    prompt: {
      dog: '你的狗狗对指令的服从性很高',
      cat: '叫它过来、不许上桌这类要求，猫咪多数时候会配合',
      other: '叫它出来活动或回躲避处，它多数时候会照做'
    }
  },
  {
    id: 'q19',
    dim: 'JP',
    letter: 'P',
    prompt: {
      dog: '精力十足，经常性在家跑“马拉松”',
      cat: '精力十足，经常突然在家跑“马拉松”、半夜炸毛狂奔',
      other: '精力突然爆棚，经常在笼子或活动空间里狂奔、不停探索'
    }
  },
  {
    id: 'q20',
    dim: 'JP',
    letter: 'J',
    prompt: {
      dog: '你的狗狗到了特定时间，一定要出去玩',
      cat: '到了固定时间，猫咪一定要按习惯进食或找你互动',
      other: '到了固定喂食或灯照时间，它一定要进食或出来活动'
    }
  }
];

const TYPES = {
  ISTJ: {
    baseName: '物流师',
    tag: '作息必须准点',
    subtitle: '内向 · 感觉 · 理性 · 计划',
    summary: '家里的流程它比你还熟。吃饭、出门、睡觉最好固定，临时改计划会让它不踏实。不热闹，但可靠，属于把日子过明白的那一挂。',
    careTips: [
      '喂食和出门尽量准点，改习惯要一点点来。',
      '新玩具、新路线先让它观察，再邀请它参与。'
    ],
    boardingTips: [
      '固定食盆、固定休息位，少今天东明天西。',
      '作息写清楚，它会自己按流程过。'
    ]
  },
  ISFJ: {
    baseName: '守卫者',
    tag: '默默把家看好',
    subtitle: '内向 · 感觉 · 情感 · 计划',
    summary: '不抢镜头，却把家里每个人的习惯都记着。你回来晚了它会等，你不舒服它会跟着。表面安静，实际一直在值班。',
    careTips: [
      '回家先跟它打个招呼，它很需要被看见。',
      '它很会忍，状态不对时请主动检查环境和身体。'
    ],
    boardingTips: [
      '给一点熟悉气味，固定照料者会让它更安心。',
      '温柔规律就好，不必强迫它热情待人。'
    ]
  },
  INFJ: {
    baseName: '提倡者',
    tag: '懂你却不多说',
    subtitle: '内向 · 直觉 · 情感 · 计划',
    summary: '它不太热衷社交场，但对你的情绪很敏感。热闹里它可能悄悄退开，一对一时又贴得很近。需要被理解，不需要被围观。',
    careTips: [
      '访客不要太多太密，社交电量很低。',
      '别随时打断它发呆，那是它在恢复和观察。'
    ],
    boardingTips: [
      '安静角落比热闹大厅重要。',
      '少硬凑欢乐，稳定陪伴就够。'
    ]
  },
  INTJ: {
    baseName: '建筑师',
    tag: '先观察再行动',
    subtitle: '内向 · 直觉 · 理性 · 计划',
    summary: '先看、再判断、再决定出不出现。它不缺智力，也不缺主见，只是很少为了迎合你而改变自己的安排。给它空间，它反而更合作。',
    careTips: [
      '不要突然抱或突然发指令，先给它准备时间。',
      '讲清楚规则，比反复催促更有效。'
    ],
    boardingTips: [
      '独立空间，谢绝过于热情的围观。',
      '流程清楚它就合作，混乱它就启动冷处理。'
    ]
  },
  ISTP: {
    baseName: '鉴赏家',
    tag: '先搞清楚怎么运作',
    subtitle: '内向 · 感觉 · 理性 · 灵活',
    summary: '对会动、能拆、有声音的东西特别感兴趣。情绪不大外露，遇事也不慌，更像在研究这个世界怎么转，而不是讨好谁。',
    careTips: [
      '给它合法可拆、可咬、可研究的东西。',
      '训练走短回合、高反馈，少讲大道理。'
    ],
    boardingTips: [
      '收好电线、鞋子和能咬坏的小物件。',
      '活动量给够，闲着就容易自己找东西拆。'
    ]
  },
  ISFP: {
    baseName: '探险家',
    tag: '舒服最重要',
    subtitle: '内向 · 感觉 · 情感 · 灵活',
    summary: '环境不对它就关机，舒服了才会靠近。不喜欢被强行训练或围观，敏感、随性，节奏由自己定。尊重它的边界，它会自己来贴你。',
    careTips: [
      '强行合照或强迫互动会被记仇，引导它自己靠近。',
      '环境舒服比反复训练口令更重要。'
    ],
    boardingTips: [
      '人少、有窗、有能躲的位置，它会自己安定。',
      '不要一群人围观，给它呼吸空间。'
    ]
  },
  INFP: {
    baseName: '调停者',
    tag: '心软，但需要缓冲',
    subtitle: '内向 · 直觉 · 情感 · 灵活',
    summary: '它在意你，但不喜欢被突然推到场面中央。情绪来了会黏，电量空了就躲起来充能。强硬纠正效果很差，温柔引导更有效。',
    careTips: [
      '叫它起来请附带零食或喜欢的互动，硬拽效果很差。',
      '偶发黏人请珍惜，那是它主动给的情绪价值。'
    ],
    boardingTips: [
      '熟悉毯子比热情互动更有用。',
      '让它有地方躲，不要全天安排节目。'
    ]
  },
  INTP: {
    baseName: '逻辑学家',
    tag: '有点听话但不多',
    subtitle: '内向 · 直觉 · 理性 · 灵活',
    summary: '「你说的都对，但我不听你的」是 INTP 的常态。它们很有主见，学习能力也强；对指令通常会先自己判断。反应灵敏，但不太容易一直保持耐心和专注，一不注意就溜号了。',
    careTips: [
      '训练要短、要有变化，重复太多次它就会关机。',
      '新玩具先给研究时间，别催它立刻表演。'
    ],
    boardingTips: [
      '环境稳定即可，别安排过于热闹的团建。',
      '它可能看起来没反应，其实在后台加载。'
    ]
  },
  ESTP: {
    baseName: '企业家',
    tag: '先动起来再说',
    subtitle: '外向 · 感觉 · 理性 · 灵活',
    summary: '能量高，反应快，现场有什么刺激就追什么。说教没用，跑够、玩够，它才听得进下一句。适合短时间、高反馈的互动。',
    careTips: [
      '电量不消耗完就容易拆家，出门前先让它活动够。',
      '客人进门前先让它热完身，再允许打招呼。'
    ],
    boardingTips: [
      '活动空间和定时放电，否则全店都知道它来了。',
      '护理前先运动，兴奋下降再开工。'
    ]
  },
  ESFP: {
    baseName: '表演者',
    tag: '有人看就会发光',
    subtitle: '外向 · 感觉 · 情感 · 灵活',
    summary: '客人、镜头、摸头都是加油站。它热情、好相处，也容易兴奋过头。给它社交和玩耍，同时帮它学会停下来休息。',
    careTips: [
      '请提供正当的玩耍和社交，否则它会自己找舞台。',
      '兴奋来得快去得也快，帮它建立「停」的信号。'
    ],
    boardingTips: [
      '适合出镜，互动可以多，但注意别社交到脱水。',
      '热闹过后给它一个能断电的小窝。'
    ]
  },
  ENFP: {
    baseName: '竞选者',
    tag: '快乐说来就来',
    subtitle: '外向 · 直觉 · 情感 · 灵活',
    summary: '对人和新事物都充满兴趣，情绪价值拉满，注意力也容易换频道。计划常常跟不上它的兴致，短一点、花样多一点的互动最合适。',
    careTips: [
      '同一套训练不要磨太久，换个花样它才肯继续。',
      '它会治愈你的低落，然后把你的计划带跑偏。'
    ],
    boardingTips: [
      '多互动，但给它一个能安静下来的窝。',
      '太安静它会自己制造节目效果。'
    ]
  },
  ENTP: {
    baseName: '辩论家',
    tag: '指令可以商量',
    subtitle: '外向 · 直觉 · 理性 · 灵活',
    summary: '聪明、好动、不爱重复。你让它往东，它可能先研究为什么不能往西。把训练变成解题游戏，它才肯配合。',
    careTips: [
      '不要和它死磕同一个口令，它会升级成课题。',
      '新花样可以有，但请看好家具和电线。'
    ],
    boardingTips: [
      '聪明又闲就会搞事情，请给课题（益智玩具）。',
      '店员要有点耐心，硬压会输。'
    ]
  },
  ESTJ: {
    baseName: '总经理',
    tag: '出门得按计划',
    subtitle: '外向 · 感觉 · 理性 · 计划',
    summary: '规矩清楚它就好带，朝令夕改它就抗议。散步路线、时间点、指令最好稳定。它不是凶，是在催你把流程走完。',
    careTips: [
      '规则清晰它就好带，今天这样明天那样会挨瞪。',
      '请按时交付散步、饭和明确夸奖。'
    ],
    boardingTips: [
      '作息写清楚，它会自己执行项目计划。',
      '适合有秩序的店，不适合大型即兴派对。'
    ]
  },
  ESFJ: {
    baseName: '执政官',
    tag: '人人都要照顾到',
    subtitle: '外向 · 感觉 · 情感 · 计划',
    summary: '见人就想问候，家里来客它比你还忙。非常在意你的态度，冷落比批评更伤。让它参与接待和日常仪式，它会很有成就感。',
    careTips: [
      '它很需要被需要，忽视比挨骂更伤。',
      '访客多时请让它当接待，不然它会加班到门口。'
    ],
    boardingTips: [
      '友善但黏人，固定照料者会让它更安心。',
      '适合温和社交，不适合放养不管。'
    ]
  },
  ENFJ: {
    baseName: '主人公',
    tag: '你的情绪它先知道',
    subtitle: '外向 · 直觉 · 情感 · 计划',
    summary: '它会读空气，你一低落它就贴上来。社交能力强，也容易把全场情绪扛在自己身上。多给回应，少让它空转担心。',
    careTips: [
      '它会读空气，所以你的假笑没用，状态不好就好好陪它。',
      '给足够陪伴，否则它会开始过度操心。'
    ],
    boardingTips: [
      '需要回应，请多拍「我很好」的视频给主人。',
      '适合温柔互动，不适合冷处理。'
    ]
  },
  ENTJ: {
    baseName: '指挥官',
    tag: '家里我来安排',
    subtitle: '外向 · 直觉 · 理性 · 计划',
    summary: '目标明确，行动力强，不太吃硬命令。协商和奖励比压制有效。给它一点「自己说了算」的空间，合作会顺很多。',
    careTips: [
      '协商可以，当众呵斥效果很差。',
      '它能干也很要面子，请把指令说成合作而不是命令。'
    ],
    boardingTips: [
      '给它一点掌控感，比如固定高处或固定床位。',
      '不要一上来就热情过载，先建立规则再互动。'
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

function formatTypeName(typeId, kind) {
  const preset = TYPES[String(typeId || '').toUpperCase()];
  if (!preset) return '';
  if (kind === 'dog') return `${preset.baseName}狗`;
  if (kind === 'cat') return `${preset.baseName}猫`;
  return preset.baseName;
}

function getQuestions(type) {
  const kind = speciesKind(type);
  return QUESTIONS.map((item, index) => ({
    id: item.id,
    no: index + 1,
    dim: item.dim,
    dimLabel: AXIS[item.dim] ? AXIS[item.dim].label : '',
    letter: item.letter,
    prompt: pickText(item.prompt, kind)
  }));
}

function pickLetter(counts, left, right) {
  const a = Number(counts[left]) || 0;
  const b = Number(counts[right]) || 0;
  if (a === b) return /[ENFP]/.test(left) ? left : right;
  return a > b ? left : right;
}

function classifyScores(answers) {
  const counts = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  QUESTIONS.forEach((item, index) => {
    const value = Number(answers && answers[index]);
    if (value < 1 || value > 5) return;
    const weight = value - 3;
    if (!weight) return;
    const letter = item.letter;
    const opposite = OPPOSITE[letter];
    if (weight > 0) counts[letter] += weight;
    else if (opposite) counts[opposite] += -weight;
  });
  return [
    pickLetter(counts, 'E', 'I'),
    pickLetter(counts, 'N', 'S'),
    pickLetter(counts, 'F', 'T'),
    pickLetter(counts, 'P', 'J')
  ].join('');
}

function allAnswered(answers) {
  if (!Array.isArray(answers) || answers.length < QUESTIONS.length) return false;
  return QUESTIONS.every((_, index) => {
    const value = Number(answers[index]);
    return value >= 1 && value <= 5;
  });
}

function normalizePersonality(raw, petType) {
  if (!raw || typeof raw !== 'object') return null;
  const typeId = String(raw.typeId || raw.id || '').trim().toUpperCase();
  const preset = TYPES[typeId];
  const kind = speciesKind(petType);
  const typeName = String(
    (preset && formatTypeName(typeId, kind)) || raw.typeName || ''
  ).trim();
  if (!typeId || !typeName) return null;
  const type = preset || {
    baseName: typeName,
    tag: String(raw.tag || '').trim(),
    typeShort: String(raw.typeShort || typeId).trim(),
    subtitle: String(raw.subtitle || '').trim(),
    summary: String(raw.summary || '').trim(),
    careTips: Array.isArray(raw.careTips) ? raw.careTips : [],
    boardingTips: Array.isArray(raw.boardingTips) ? raw.boardingTips : []
  };
  const tips = (list, fallback) => {
    const source = Array.isArray(list) && list.length && !preset ? list : (fallback || list);
    return (source || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
  };
  return {
    version: preset ? VERSION : Math.max(1, Number(raw.version) || 1),
    typeId,
    typeName,
    typeShort: String(raw.typeShort || type.typeShort || typeId).trim().slice(0, 8),
    tag: String((preset && preset.tag) || raw.tag || '').trim().slice(0, 20),
    subtitle: String((preset && preset.subtitle) || raw.subtitle || '').trim().slice(0, 80),
    summary: String((preset && preset.summary) || raw.summary || '').trim().slice(0, 400),
    careTips: tips(raw.careTips, type.careTips),
    boardingTips: tips(raw.boardingTips, type.boardingTips),
    completedAt: Number(raw.completedAt) || 0
  };
}

function buildResult(answers, petType) {
  if (!allAnswered(answers)) return null;
  const typeId = classifyScores(answers);
  const type = TYPES[typeId];
  if (!type) return null;
  return normalizePersonality({
    ...type,
    typeId,
    typeShort: typeId,
    completedAt: Date.now()
  }, petType);
}

function loadLocalMap() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEYS.PET_PERSONALITY);
    return raw && typeof raw === 'object' ? raw : {};
  } catch (err) {
    return {};
  }
}

function saveLocal(petId, personality, petType) {
  const id = String(petId || '').trim();
  const normalized = normalizePersonality(personality, petType);
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
  const fromPet = normalizePersonality(pet.personality, pet.type);
  if (fromPet) return fromPet;
  const id = pet.id || pet.pet_id;
  if (!id) return null;
  return normalizePersonality(loadLocalMap()[id], pet.type);
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
  const normalized = normalizePersonality(personality, pet && pet.type);
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
  PAGE_SIZE,
  AXIS,
  QUESTIONS,
  TYPES,
  SCALE_OPTIONS,
  speciesKind,
  formatTypeName,
  getQuestions,
  getPersonality,
  attachToPet,
  attachToPets,
  buildResult,
  allAnswered,
  classifyScores,
  normalizePersonality,
  saveLocal,
  persistToPet
};
