const { STORAGE_KEYS } = require('./constants');

const DEFAULT_DATA = {
  reminders: {},
  heatCycles: {},
  milestones: {},
  walks: {},
  weightLogs: {}
};

function loadAll() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEYS.PET_BUTLER);
    if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(DEFAULT_DATA));
    return {
      reminders: raw.reminders || {},
      heatCycles: raw.heatCycles || {},
      milestones: raw.milestones || {},
      walks: raw.walks || {},
      weightLogs: raw.weightLogs || {}
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveAll(data) {
  wx.setStorageSync(STORAGE_KEYS.PET_BUTLER, data || DEFAULT_DATA);
}

function todayStr() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDate(str) {
  if (!str) return null;
  const parts = String(str).split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => !n && n !== 0)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  if (!d) return '';
  d.setDate(d.getDate() + Number(days || 0));
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(fromStr, toStr) {
  const a = parseDate(fromStr);
  const b = parseDate(toStr || todayStr());
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function daysUntil(dateStr) {
  const n = daysBetween(todayStr(), dateStr);
  return n === null ? null : -n;
}

/** 默认提醒周期（天） */
const REMINDER_DEFAULTS = {
  bath: { label: '洗澡', interval: 30, icon: '🛁', tip: '长毛犬可 3–4 周一次，短毛可更久' },
  deworm: { label: '驱虫', interval: 90, icon: '💊', tip: '体内外驱虫建议每 1–3 个月一次' },
  vaccine: { label: '疫苗', interval: 365, icon: '💉', tip: '成犬猫通常每年加强一次，请遵医嘱' },
  nail: { label: '剪指甲', interval: 21, icon: '✂️', tip: '约每 2–3 周修剪一次' },
  ear: { label: '清耳', interval: 14, icon: '👂', tip: '垂耳犬更需定期清洁' }
};

function getPetReminders(petId) {
  const all = loadAll();
  const item = (all.reminders && all.reminders[petId]) || {};
  const result = {};
  Object.keys(REMINDER_DEFAULTS).forEach((key) => {
    const def = REMINDER_DEFAULTS[key];
    const saved = item[key] || {};
    const lastDate = saved.lastDate || '';
    const interval = Number(saved.interval) > 0 ? Number(saved.interval) : def.interval;
    const nextDate = lastDate ? addDays(lastDate, interval) : '';
    const remain = nextDate ? daysBetween(todayStr(), nextDate) : null;
    result[key] = {
      key,
      label: def.label,
      icon: def.icon,
      tip: def.tip,
      lastDate,
      interval,
      nextDate,
      remain,
      status: remain === null ? 'unset' : remain < 0 ? 'overdue' : remain <= 7 ? 'soon' : 'ok'
    };
  });
  return result;
}

function savePetReminder(petId, type, payload) {
  const all = loadAll();
  if (!all.reminders[petId]) all.reminders[petId] = {};
  all.reminders[petId][type] = {
    ...(all.reminders[petId][type] || {}),
    ...payload
  };
  saveAll(all);
  return getPetReminders(petId);
}

function markReminderDone(petId, type, date) {
  return savePetReminder(petId, type, { lastDate: date || todayStr() });
}

function collectUpcoming(pets, withinDays) {
  const limit = withinDays == null ? 14 : withinDays;
  const list = [];
  (pets || []).forEach((pet) => {
    if (!pet || !pet.id) return;
    const map = getPetReminders(pet.id);
    Object.keys(map).forEach((key) => {
      const item = map[key];
      if (item.status === 'unset') return;
      if (item.remain !== null && item.remain <= limit) {
        list.push({
          petId: pet.id,
          petName: pet.name || '宝贝',
          ...item
        });
      }
    });
  });
  list.sort((a, b) => (a.remain || 0) - (b.remain || 0));
  return list;
}

/** 母狗发情周期：平均约 6 个月一轮，持续约 18–21 天 */
function getHeatCycle(petId) {
  const all = loadAll();
  const item = (all.heatCycles && all.heatCycles[petId]) || {};
  const lastStart = item.lastStart || '';
  const cycleDays = Number(item.cycleDays) > 0 ? Number(item.cycleDays) : 180;
  const duration = Number(item.duration) > 0 ? Number(item.duration) : 21;
  const notes = item.notes || '';
  const history = Array.isArray(item.history) ? item.history : [];
  const nextStart = lastStart ? addDays(lastStart, cycleDays) : '';
  const endDate = lastStart ? addDays(lastStart, duration) : '';
  const dayInCycle = lastStart ? daysBetween(lastStart, todayStr()) : null;
  let phase = 'unset';
  let phaseLabel = '尚未记录';
  if (dayInCycle !== null) {
    if (dayInCycle >= 0 && dayInCycle < 9) {
      phase = 'proestrus';
      phaseLabel = '发情前期';
    } else if (dayInCycle >= 9 && dayInCycle < duration) {
      phase = 'estrus';
      phaseLabel = '发情期（易受孕）';
    } else if (dayInCycle >= duration && dayInCycle < duration + 60) {
      phase = 'diestrus';
      phaseLabel = '发情后期';
    } else {
      phase = 'anestrus';
      phaseLabel = '休情期';
    }
  }
  return {
    lastStart,
    cycleDays,
    duration,
    notes,
    history,
    nextStart,
    endDate,
    dayInCycle,
    phase,
    phaseLabel,
    daysToNext: nextStart ? daysBetween(todayStr(), nextStart) : null
  };
}

function saveHeatCycle(petId, payload) {
  const all = loadAll();
  const prev = all.heatCycles[petId] || {};
  const next = { ...prev, ...payload };
  if (payload.lastStart && payload.lastStart !== prev.lastStart) {
    const history = Array.isArray(prev.history) ? prev.history.slice() : [];
    history.unshift({ start: payload.lastStart, at: Date.now() });
    next.history = history.slice(0, 12);
  }
  all.heatCycles[petId] = next;
  saveAll(all);
  return getHeatCycle(petId);
}

/** 人宠年龄粗算（常见经验公式，仅供趣味参考） */
function calcHumanAge(petType, ageYears) {
  const age = Number(ageYears);
  if (!(age >= 0)) return null;
  const type = String(petType || '').includes('猫') ? '猫' : '狗';
  let human = 0;
  if (type === '猫') {
    if (age <= 1) human = age * 15;
    else if (age <= 2) human = 15 + (age - 1) * 9;
    else human = 24 + (age - 2) * 4;
  } else {
    if (age <= 1) human = age * 15;
    else if (age <= 2) human = 15 + (age - 1) * 9;
    else human = 24 + (age - 2) * 5;
  }
  let stage = '成年';
  if (human < 18) stage = '少年';
  else if (human < 40) stage = '青年';
  else if (human < 60) stage = '中年';
  else stage = '老年';
  return { human: Math.round(human * 10) / 10, stage, type };
}

/** 体重评估：按体型粗估理想体重区间 */
const BREED_WEIGHT = {
  泰迪: { min: 2.5, max: 5.5, size: '小型' },
  贵宾: { min: 2.5, max: 5.5, size: '小型' },
  比熊: { min: 3, max: 6, size: '小型' },
  博美: { min: 1.5, max: 3.5, size: '小型' },
  吉娃娃: { min: 1.5, max: 3, size: '小型' },
  约克夏: { min: 1.5, max: 3.5, size: '小型' },
  雪纳瑞: { min: 5, max: 9, size: '小型' },
  柯基: { min: 10, max: 14, size: '中型' },
  柴犬: { min: 8, max: 12, size: '中型' },
  法斗: { min: 8, max: 14, size: '小型' },
  巴哥: { min: 6, max: 9, size: '小型' },
  腊肠: { min: 7, max: 15, size: '小型' },
  边牧: { min: 14, max: 20, size: '中型' },
  边境牧羊: { min: 14, max: 20, size: '中型' },
  金毛: { min: 25, max: 34, size: '大型' },
  拉布拉多: { min: 25, max: 36, size: '大型' },
  哈士奇: { min: 16, max: 27, size: '中大型' },
  萨摩耶: { min: 16, max: 30, size: '中大型' },
  阿拉斯加: { min: 32, max: 50, size: '大型' },
  德牧: { min: 22, max: 40, size: '大型' },
  德国牧羊: { min: 22, max: 40, size: '大型' },
  英短: { min: 4, max: 8, size: '中型猫' },
  美短: { min: 3.5, max: 7, size: '中型猫' },
  布偶: { min: 4.5, max: 9, size: '大型猫' },
  波斯: { min: 3.5, max: 7, size: '中型猫' },
  加菲: { min: 3.5, max: 7, size: '中型猫' },
  暹罗: { min: 3, max: 5.5, size: '纤细型' },
  缅因: { min: 5.5, max: 12, size: '大型猫' },
  橘猫: { min: 4, max: 7.5, size: '家猫' },
  狸花: { min: 3.5, max: 7, size: '家猫' },
  田园猫: { min: 3.5, max: 7, size: '家猫' }
};

function assessWeight(breed, weight, petType) {
  const w = Number(weight);
  if (!(w > 0)) return null;
  const breedKey = Object.keys(BREED_WEIGHT).find((k) => String(breed || '').includes(k));
  let range = breedKey ? BREED_WEIGHT[breedKey] : null;
  if (!range) {
    const isCat = String(petType || '').includes('猫');
    range = isCat ? { min: 3.5, max: 6.5, size: '常见家猫' } : { min: 5, max: 15, size: '中小型犬参考' };
  }
  let status = 'ideal';
  let label = '体重适中';
  let tip = '继续保持均衡饮食和适量运动。';
  if (w < range.min * 0.9) {
    status = 'under';
    label = '偏瘦';
    tip = '可咨询医生排查驱虫/吸收问题，适量增加高营养密度粮。';
  } else if (w > range.max * 1.1) {
    status = 'over';
    label = '偏重';
    tip = '控制零食与主粮量，增加遛弯/互动游戏。';
  } else if (w < range.min) {
    status = 'light';
    label = '略轻';
    tip = '略低于常见区间，观察肋骨触感与精神状态即可。';
  } else if (w > range.max) {
    status = 'heavy';
    label = '略重';
    tip = '略高于常见区间，注意腰线是否消失。';
  }
  return {
    weight: w,
    breedKey: breedKey || '',
    size: range.size,
    min: range.min,
    max: range.max,
    status,
    label,
    tip
  };
}

/** 食物能不能吃 */
const FOOD_DB = [
  // —— 禁止 ——
  { name: '巧克力', aliases: ['可可', '朱古力', '可可粉', '布朗尼'], level: 'danger', tip: '含可可碱，可致中毒甚至致命，严禁喂食。' },
  { name: '葡萄', aliases: ['提子', '青提', '红提'], level: 'danger', tip: '可能导致急性肾衰，少量也危险。' },
  { name: '葡萄干', aliases: ['提子干'], level: 'danger', tip: '与葡萄同属高风险，糕点中的葡萄干同样危险。' },
  { name: '洋葱', aliases: ['葱头', '洋葱圈'], level: 'danger', tip: '破坏红细胞，可引起溶血性贫血。' },
  { name: '大蒜', aliases: ['蒜蓉', '蒜末'], level: 'danger', tip: '同洋葱科，少量也可能有害。' },
  { name: '大葱', aliases: ['葱', '香葱', '小葱'], level: 'danger', tip: '葱属植物对犬猫有毒，汤底也尽量避免。' },
  { name: '韭菜', aliases: ['韭黄'], level: 'danger', tip: '同属刺激性植物，不建议喂食。' },
  { name: '木糖醇', aliases: ['无糖口香糖', '口香糖', '无糖糖'], level: 'danger', tip: '可致低血糖与肝损，极危险。' },
  { name: '酒精', aliases: ['酒', '啤酒', '红酒', '白酒', '米酒'], level: 'danger', tip: '代谢能力弱，严禁接触。' },
  { name: '咖啡', aliases: ['咖啡因', '拿铁', '美式'], level: 'danger', tip: '咖啡因对犬猫有毒。' },
  { name: '茶', aliases: ['茶叶', '奶茶', '红茶', '绿茶'], level: 'danger', tip: '含咖啡因与茶碱，不建议。' },
  { name: '牛油果', aliases: ['鳄梨', '酪梨'], level: 'danger', tip: '含柿酚，对犬猫有毒。' },
  { name: '百合', aliases: ['百合花', '香水百合'], level: 'danger', tip: '对猫极度危险，可致急性肾衰；花粉叶片都危险。' },
  { name: '生面团', aliases: ['酵母面团', '发酵面团'], level: 'danger', tip: '胃内发酵产气产酒精，非常危险。' },
  { name: '生豆角', aliases: ['生四季豆', '生刀豆'], level: 'danger', tip: '含凝集素，必须彻底煮熟才相对安全。' },
  { name: '蘑菇', aliases: ['野生蘑菇', '毒蘑菇'], level: 'danger', tip: '野生菌风险高，家用不明菌也不建议喂。' },
  { name: '果核', aliases: ['樱桃核', '桃核', '杏核', '李子核'], level: 'danger', tip: '易卡住，且部分含氰苷，果肉也要适量。' },
  { name: '老鼠药', aliases: ['灭鼠药', '杀虫剂'], level: 'danger', tip: '剧毒，误食立即送医并带包装。' },
  { name: '盐', aliases: ['盐水', '酱油', '味精'], level: 'danger', tip: '高盐可致盐中毒，人的菜汤不要喂。' },
  { name: '生猪肉', aliases: ['生肉'], level: 'danger', tip: '有寄生虫与细菌风险，务必煮熟；冻生骨粮需专业配方。' },
  { name: '肥肉', aliases: ['猪油', '油脂'], level: 'danger', tip: '高脂易诱发胰腺炎，尤其是小型犬。' },
  { name: '芋头', aliases: ['香芋'], level: 'danger', tip: '含草酸钙结晶，刺激口腔与消化道。' },
  { name: '未煮熟土豆', aliases: ['生土豆', '绿皮土豆'], level: 'danger', tip: '龙葵素有毒；发芽/变绿土豆更危险。' },
  { name: '花椒', aliases: ['辣椒', '胡椒', '咖喱'], level: 'danger', tip: '辛辣调味刺激肠胃与黏膜，禁止。' },

  // —— 谨慎 ——
  { name: '牛奶', aliases: ['鲜奶', '纯奶'], level: 'caution', tip: '多数成犬猫乳糖不耐，易腹泻；可选宠物羊奶粉。' },
  { name: '酸奶', aliases: ['无糖酸奶'], level: 'caution', tip: '仍含乳糖，且常见木糖醇甜味剂，务必看配料。' },
  { name: '奶酪', aliases: ['芝士', '干酪'], level: 'caution', tip: '高脂高盐，少量无调味或许可，易胖宠少喂。' },
  { name: '生鸡蛋', aliases: ['生蛋'], level: 'caution', tip: '可能含沙门氏菌，生蛋清影响生物素吸收。' },
  { name: '骨头', aliases: ['鸡骨', '鱼骨', '排骨'], level: 'caution', tip: '熟骨易碎裂刺伤，生骨也有风险，一般不建议。' },
  { name: '虾', aliases: ['虾仁', '基围虾'], level: 'caution', tip: '去壳煮熟少量可尝试，观察过敏。' },
  { name: '蟹', aliases: ['螃蟹', '蟹肉'], level: 'caution', tip: '高嘌呤且易过敏，去壳煮熟极少量。' },
  { name: '鱼', aliases: ['三文鱼', '鳕鱼', '带鱼', '鲫鱼'], level: 'caution', tip: '必须彻底煮熟去骨；生鱼有寄生虫风险。' },
  { name: '金枪鱼罐头', aliases: ['金枪鱼', '吞拿鱼'], level: 'caution', tip: '人用罐头盐分高，长期喂有汞与营养失衡风险。' },
  { name: '榴莲', aliases: [], level: 'caution', tip: '高脂高糖，偶食一点点果肉，不建议经常。' },
  { name: '芒果', aliases: [], level: 'caution', tip: '去核去皮少量；部分宠物对芒果过敏。' },
  { name: '坚果', aliases: ['杏仁', '核桃', '腰果', '夏威夷果'], level: 'caution', tip: '高脂难消化，夏威夷果对狗有毒，整体少碰。' },
  { name: '花生', aliases: ['花生米'], level: 'caution', tip: '易噎、高脂，无盐无糖才可偶食；花生酱注意木糖醇。' },
  { name: '火腿肠', aliases: ['香肠', '热狗', '午餐肉'], level: 'caution', tip: '盐分与添加剂高，不建议当零食。' },
  { name: '薯片', aliases: ['膨化食品', '薯条'], level: 'caution', tip: '高盐高油，伤害肾脏与肠胃。' },
  { name: '面包', aliases: ['蛋糕', '饼干', '甜甜圈'], level: 'caution', tip: '高糖高油，可能含葡萄干/巧克力/木糖醇。' },
  { name: '蜂蜜', aliases: [], level: 'caution', tip: '幼宠有肉毒杆菌风险；成宠也非必需，易胖。' },
  { name: '豆腐', aliases: ['豆干'], level: 'caution', tip: '少量可作蛋白补充，胀气宠少喂；不可替代肉类主粮。' },
  { name: '玉米', aliases: ['甜玉米'], level: 'caution', tip: '煮熟玉米粒可少量，整根玉米棒易梗阻。' },
  { name: '花生酱', aliases: [], level: 'caution', tip: '必须确认无木糖醇，高热量只舔一点点。' },
  { name: '冰淇淋', aliases: ['雪糕', '甜筒'], level: 'caution', tip: '乳糖+高糖高脂，不建议；无糖款可能含木糖醇。' },
  { name: '猪肝', aliases: ['鸡肝', '动物肝脏'], level: 'caution', tip: '营养密但维生素 A 过量有害，每周少量即可。' },
  { name: '菠菜', aliases: [], level: 'caution', tip: '草酸高，焯水后少量；肾病宠慎喂。' },
  { name: '番茄', aliases: ['西红柿'], level: 'caution', tip: '成熟红番茄少量可；青番茄与植株有毒。' },
  { name: '椰子', aliases: ['椰肉', '椰汁'], level: 'caution', tip: '高脂，少量椰肉偶尔可以，椰汁非必需。' },

  // —— 可以 ——
  { name: '熟鸡蛋', aliases: ['水煮蛋', '蒸蛋'], level: 'safe', tip: '煮熟去壳可少量作为零食，别加油盐。' },
  { name: '鸡胸肉', aliases: ['鸡肉', '水煮鸡胸'], level: 'safe', tip: '煮熟无调料，是常见补餐蛋白。' },
  { name: '牛肉', aliases: ['牛瘦肉'], level: 'safe', tip: '煮熟无调料，注意适量与过敏观察。' },
  { name: '鸭肉', aliases: [], level: 'safe', tip: '低敏常见选项，煮熟去皮去油更佳。' },
  { name: '火鸡肉', aliases: ['火鸡'], level: 'safe', tip: '煮熟无调料，可作低脂蛋白。' },
  { name: '米饭', aliases: ['白饭', '米粥'], level: 'safe', tip: '清淡熟米饭/粥可作肠胃不适时的临时辅食。' },
  { name: '小米粥', aliases: ['米汤'], level: 'safe', tip: '清淡易消化，适合软便过渡期。' },
  { name: '南瓜', aliases: ['南瓜泥'], level: 'safe', tip: '蒸熟少量可助消化、缓解轻度软便或便秘。' },
  { name: '胡萝卜', aliases: [], level: 'safe', tip: '熟软后可喂，有助纤维摄入；生硬块小心噎着。' },
  { name: '红薯', aliases: ['地瓜', '番薯'], level: 'safe', tip: '蒸熟去皮少量，高纤；易胀气就少喂。' },
  { name: '土豆', aliases: ['马铃薯'], level: 'safe', tip: '必须煮熟且无绿皮发芽，少量无调料。' },
  { name: '苹果', aliases: [], level: 'safe', tip: '去核去籽后可少量喂食。' },
  { name: '香蕉', aliases: [], level: 'safe', tip: '高钾高糖，少量即可。' },
  { name: '蓝莓', aliases: [], level: 'safe', tip: '抗氧化，可作训练零食，注意噎着要切小。' },
  { name: '草莓', aliases: [], level: 'safe', tip: '洗净去蒂少量，高糖宠少喂。' },
  { name: '西瓜', aliases: [], level: 'safe', tip: '去籽去皮少量可解暑，别喂太多防泻。' },
  { name: '黄瓜', aliases: [], level: 'safe', tip: '低热量，可少量解馋，洗干净。' },
  { name: '西葫芦', aliases: ['节瓜'], level: 'safe', tip: '煮熟少量，温和蔬菜选择。' },
  { name: '西兰花', aliases: ['花菜', '白菜花'], level: 'safe', tip: '煮熟少量，产气宠少喂。' },
  { name: '芹菜', aliases: [], level: 'safe', tip: '切碎煮软少量，长丝纤维防噎。' },
  { name: '梨', aliases: [], level: 'safe', tip: '去核少量，高糖宠控制量。' },
  { name: '桃子', aliases: ['水蜜桃'], level: 'safe', tip: '去核去皮少量成熟果肉。' },
  { name: '西瓜皮', aliases: [], level: 'safe', tip: '绿色外皮硬，一般只喂红色果肉更安全。' },
  { name: '燕麦', aliases: ['燕麦片'], level: 'safe', tip: '煮熟无糖少量，可作纤维补充。' },
  { name: '羊奶', aliases: ['宠物羊奶'], level: 'safe', tip: '相对更易耐受，选宠物配方，仍勿暴饮。' },
  { name: '鸡心', aliases: ['鸡胗'], level: 'safe', tip: '煮熟少量可作零食，注意卫生与食量。' }
];

function checkFood(keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return [];
  return FOOD_DB.filter((item) => {
    const name = String(item.name || '').toLowerCase();
    if (name.includes(q) || q.includes(name)) return true;
    return (item.aliases || []).some((a) => {
      const alias = String(a || '').toLowerCase();
      return alias.includes(q) || q.includes(alias);
    });
  }).map((item) => ({
    ...item,
    levelLabel: item.level === 'danger' ? '禁止' : item.level === 'caution' ? '谨慎' : '可以'
  }));
}

/** 品种养护指南 */
const CARE_GUIDES = [
  {
    id: 'teddy',
    name: '泰迪 / 贵宾',
    type: '狗',
    tags: ['粘人', '不掉毛', '需定期美容'],
    summary: '聪明粘人，适合公寓，但毛发需要持续打理。',
    care: [
      '每 4–6 周美容修剪，日常每天梳毛防打结',
      '泪痕需清洁眼周，耳道定期检查',
      '运动量中等，每日 30–60 分钟遛弯与互动',
      '易牙结石，建议定期刷牙或洁牙'
    ],
    food: '选择小型犬粮，控制零食防止肥胖',
    caution: '膝盖骨易脱位，避免频繁跳沙发'
  },
  {
    id: 'corgi',
    name: '柯基',
    type: '狗',
    tags: ['短腿', '热情', '易胖'],
    summary: '短腿长身，性格外向，但腰背需要特别保护。',
    care: [
      '控制体重是第一要务，肥胖易伤脊椎',
      '避免上下楼梯过多、跳跃高处',
      '双层被毛换季掉毛明显，每周多梳',
      '每日中等强度运动，但避免长时间奔跑'
    ],
    food: '严格计量喂食，少喂高油零食',
    caution: '注意椎间盘问题，地板防滑很重要'
  },
  {
    id: 'shiba',
    name: '柴犬',
    type: '狗',
    tags: ['独立', '干净', '掉毛'],
    summary: '性格独立、爱干净，训练需要耐心和正向激励。',
    care: [
      '换季掉毛严重，每日梳理',
      '社交与服从训练宜从小开始',
      '精力旺盛，保证充分遛弯',
      '皮肤较敏感，洗澡不宜过勤'
    ],
    food: '优质成犬粮，注意关节营养',
    caution: '逃跑欲强，出门务必牵绳'
  },
  {
    id: 'golden',
    name: '金毛',
    type: '狗',
    tags: ['温顺', '大型', '掉毛'],
    summary: '亲和力强的大型伴侣犬，需要空间与陪伴。',
    care: [
      '每日较长运动与捡球互动',
      '耳道通风差，常查耳螨与炎症',
      '大量掉毛，每周彻底梳毛',
      '髋关节需关注，避免幼犬过度跳跃'
    ],
    food: '大型犬粮，控制生长速度',
    caution: '易癌变与关节病，定期体检'
  },
  {
    id: 'labrador',
    name: '拉布拉多',
    type: '狗',
    tags: ['贪吃', '友善', '游泳'],
    summary: '性格开朗好训练，但食欲旺盛，肥胖是头号问题。',
    care: [
      '严格控食，用慢食碗或益智玩具喂食',
      '喜欢戏水，注意耳道进水后清洁',
      '每日充足运动，成年后仍需控重',
      '幼犬生长期避免过度负重跑跳'
    ],
    food: '计量饲喂大型犬粮，少给人吃的残羹',
    caution: '关节与肥胖相关病多发，定期称重'
  },
  {
    id: 'bichon',
    name: '比熊',
    type: '狗',
    tags: ['白色', '粘人', '美容'],
    summary: '外表雪白可爱，日常清洁与美容成本较高。',
    care: [
      '白色被毛需防泪痕与污渍',
      '定期美容与洗澡，保持干燥',
      '性格敏感，训宠用正向方式',
      '运动量不大，适合室内陪伴'
    ],
    food: '小型犬粮，防肥胖',
    caution: '皮肤病与泪痕较常见'
  },
  {
    id: 'pomeranian',
    name: '博美',
    type: '狗',
    tags: ['小型', '爆毛', '警觉'],
    summary: '体型小、被毛丰厚，护食与吠叫需要早期引导。',
    care: [
      '双层毛换季掉毛，每周多梳防结毡',
      '膝盖骨问题常见，少跳高处',
      '牙齿密集易结石，坚持口腔护理',
      '运动量适中，注意保暖防风'
    ],
    food: '小型犬粮，少食多餐防低血糖（幼犬）',
    caution: '气管敏感，牵引选用胸背带更合适'
  },
  {
    id: 'frenchie',
    name: '法斗',
    type: '狗',
    tags: ['短鼻', '懒', '怕热'],
    summary: '短鼻呆萌，但呼吸与散热能力弱，护理重点在防暑。',
    care: [
      '避开高温剧烈运动，夏天防中暑',
      '面部褶皱每日清洁擦干',
      '鼾声明显属常见，呼吸困难要就医',
      '运动适中，游泳需特别谨慎'
    ],
    food: '易呛咳，可选慢食；控重减轻呼吸负担',
    caution: '麻醉与热应激风险较高，就医告知品种'
  },
  {
    id: 'pug',
    name: '巴哥',
    type: '狗',
    tags: ['短鼻', '泪痕', '粘人'],
    summary: '表情丰富的室内伴侣犬，护理重点在呼吸与皮肤褶皱。',
    care: [
      '清洁面部褶皱，防湿疹',
      '控制体重，肥胖加重呼吸负担',
      '避免高温与过度兴奋喘息',
      '泪痕与眼部问题需日常观察'
    ],
    food: '严格计量，少喂高盐零食',
    caution: '短鼻通气不足，睡眠呼吸问题需关注'
  },
  {
    id: 'border',
    name: '边境牧羊犬',
    type: '狗',
    tags: ['高智商', '高能量', '需工作'],
    summary: '工作欲极强，若能量无处释放容易行为问题。',
    care: [
      '每天大量运动 + 脑力游戏（嗅闻、服从）',
      '不适合长时间独处',
      '被毛中等护理，每周梳理',
      '训练反应快，可学很多指令'
    ],
    food: '高活动量犬粮，注意能量匹配',
    caution: '精力不足释放会出现拆家'
  },
  {
    id: 'husky',
    name: '哈士奇',
    type: '狗',
    tags: ['拆家', '高能量', '掉毛'],
    summary: '外表帅气内心二哈，需要超大运动量与防逃。',
    care: [
      '每日高强度运动，否则容易拆家',
      '换季爆炸式掉毛',
      '耐寒不耐热，夏季防暑',
      '叫声与「唱歌」较多，公寓需考虑'
    ],
    food: '中大型犬粮，按运动量调整',
    caution: '翻墙逃跑高手，院子需加固'
  },
  {
    id: 'samoyed',
    name: '萨摩耶',
    type: '狗',
    tags: ['微笑', '掉毛', '粘人'],
    summary: '白色微笑天使，被毛护理与运动量要求都不低。',
    care: [
      '定期梳毛吹水，防止内层毛结毡',
      '性格友善，需足够陪伴与运动',
      '夏季注意防暑，避免正午暴晒',
      '微笑表情下也要查牙龈与口腔'
    ],
    food: '按活动量喂中大型犬粮，控重护关节',
    caution: '遗传性眼病与髋关节需定期筛查'
  },
  {
    id: 'alaskan',
    name: '阿拉斯加',
    type: '狗',
    tags: ['巨型', '力量', '掉毛'],
    summary: '体型大、力气大，适合有经验且有空间的家庭。',
    care: [
      '需要宽敞活动空间与扎实牵引训练',
      '换季掉毛量大，每周彻底梳',
      '幼犬生长期控制体重与跑跳强度',
      '耐寒，夏天必须防暑降温'
    ],
    food: '大型/巨型犬粮，钙磷比例遵医嘱',
    caution: '破坏力与食量都大，预算与时间要匹配'
  },
  {
    id: 'gsd',
    name: '德国牧羊犬',
    type: '狗',
    tags: ['工作犬', '忠诚', '关节'],
    summary: '智商高、忠诚，需要系统训练与关节保护。',
    care: [
      '每日工作类训练 + 运动，满足大脑与体力',
      '关注髋肘关节，幼犬避免光滑地板狂奔',
      '被毛中等护理，定期查皮肤',
      '社会化与服从训练很关键'
    ],
    food: '大型工作犬粮，补充关节营养可咨询医生',
    caution: '消化道敏感与退行性脊髓病需关注'
  },
  {
    id: 'dachshund',
    name: '腊肠犬',
    type: '狗',
    tags: ['长身', '猎犬', '护脊'],
    summary: '身体修长，护理核心是保护脊椎与控制体重。',
    care: [
      '禁止频繁跳沙发/上下陡梯，可设宠物台阶',
      '严格控重，肥胖直接伤腰',
      '短肢长身，爪部护理与防滑',
      '性格倔强，正向训练更有效'
    ],
    food: '计量小型犬粮，少零食',
    caution: '椎间盘疾病高发，腰痛拖后肢要急診'
  },
  {
    id: 'schnauzer',
    name: '雪纳瑞',
    type: '狗',
    tags: ['胡须', '警觉', '少掉毛'],
    summary: '表情严肃内心活泼，胡须与被毛需要定期整理。',
    care: [
      '胡须口周餐后清洁，防染色',
      '定期美容修剪，减少打结',
      '警惕胰腺炎，控油控零食',
      '运动中等，智商够可学技能'
    ],
    food: '低脂倾向更友好，忌油腻残羹',
    caution: '结石与皮肤问题相对多见'
  },
  {
    id: 'chihuahua',
    name: '吉娃娃',
    type: '狗',
    tags: ['超小', '怕冷', '护食'],
    summary: '超小型伴侣犬，保暖、牙口与社交是重点。',
    care: [
      '怕冷，冬季风大时注意穿衣',
      '幼犬易低血糖，少食多餐',
      '牙齿拥挤易病，坚持洁牙',
      '性格可能护食护主，早期社交'
    ],
    food: '高热量密度小型犬粮，定时定量',
    caution: '脆骨风险，抱姿与落地都要小心'
  },
  {
    id: 'yorkshire',
    name: '约克夏',
    type: '狗',
    tags: ['长毛', '小型', '美容'],
    summary: '丝状长毛需要日常护理，体型娇小但性格鲜明。',
    care: [
      '每日梳毛，必要时盘发防脏',
      '气管塌陷风险，胸背带优于项圈',
      '牙病高发，口腔护理必做',
      '运动量不大，但需防寒'
    ],
    food: '优质小型犬粮，软硬适中',
    caution: '摔倒与跳跃易伤，室内防滑'
  },
  {
    id: 'british',
    name: '英短',
    type: '猫',
    tags: ['安静', '易胖', '圆脸'],
    summary: '性格稳重好养，但运动少，肥胖风险高。',
    care: [
      '诱导玩耍防肥胖，提供猫爬架',
      '短毛好打理，每周梳毛即可',
      '注意心脏与肾脏定期体检',
      '安静粘人，适合公寓'
    ],
    food: '严格控量，选择控体重猫粮',
    caution: '肥猫易有关节与呼吸问题'
  },
  {
    id: 'american',
    name: '美短',
    type: '猫',
    tags: ['活泼', '猎手', '好养'],
    summary: '活泼好奇心强，是经典家猫伙伴。',
    care: [
      '提供足够玩具与跳跃空间',
      '被毛护理简单',
      '保持好奇心满足，减少无聊行为',
      '定期驱虫与疫苗'
    ],
    food: '成猫粮，可适当湿粮补水',
    caution: '高处跳跃多，注意窗防护'
  },
  {
    id: 'ragdoll',
    name: '布偶猫',
    type: '猫',
    tags: ['温顺', '长毛', '大型'],
    summary: '性格软萌随和，长毛护理是日常重点。',
    care: [
      '每日梳毛防打结',
      '性格温顺，不喜剧烈冲突',
      '大型猫，注意体重与关节',
      '多湿粮促进饮水'
    ],
    food: '优质猫粮 + 湿粮，护毛配方更佳',
    caution: '心脏病需定期心脏超声筛查'
  },
  {
    id: 'persian',
    name: '波斯猫',
    type: '猫',
    tags: ['长毛', '扁脸', '安静'],
    summary: '贵族气质，脸部褶皱与被毛护理要求高。',
    care: [
      '每日梳毛，必要时专业美容',
      '清理眼周泪痕与面部褶皱',
      '扁脸可能有呼吸与泪溢问题',
      '安静少动，注意体重'
    ],
    food: '选择易咀嚼粮型',
    caution: '鼻泪管与皮肤褶皱感染风险'
  },
  {
    id: 'exotic',
    name: '加菲猫',
    type: '猫',
    tags: ['扁脸', '短毛', '泪痕'],
    summary: '波斯的短毛亲戚，扁脸护理与泪痕管理很关键。',
    care: [
      '每日清洁眼周与鼻皱',
      '短毛好梳，但仍需定期打理',
      '呼吸与牙齿咬合问题需观察',
      '性格温和，适合安静家庭'
    ],
    food: '扁脸可能挑粮型，可选小颗粒或湿粮',
    caution: '泪溢与上呼吸道问题较常见'
  },
  {
    id: 'siamese',
    name: '暹罗猫',
    type: '猫',
    tags: ['话多', '粘人', '纤细'],
    summary: '嗓门大、极粘人，需要陪伴与互动游戏。',
    care: [
      '提供充足互动，减少分离焦虑乱叫',
      '短毛好打理，体型纤细注意体重过低',
      '智商高，可用益智玩具',
      '牙龈问题相对多见，查口臭'
    ],
    food: '优质蛋白猫粮，保持肌肉量',
    caution: '被忽视时可能出现行为问题'
  },
  {
    id: 'maine',
    name: '缅因猫',
    type: '猫',
    tags: ['巨型', '长毛', '温和'],
    summary: '体型巨大的「温柔巨人」，空间与梳毛成本更高。',
    care: [
      '每日/隔日梳毛，重点胸腹与臀后',
      '提供稳固高大的猫架',
      '生长周期长，幼猫营养要充足',
      '性格温和，适合多宠但引入需渐进'
    ],
    food: '热量与蛋白要匹配体型，防肥又防营养不良',
    caution: '肥厚型心肌病等需定期心脏检查'
  },
  {
    id: 'orange',
    name: '橘猫',
    type: '猫',
    tags: ['贪吃', '粘人', '家猫'],
    summary: '性格多憨厚贪吃，控重与互动是日常主题。',
    care: [
      '严格控食，橘猫易胖',
      '短毛好养，每周梳毛减毛球',
      '提供窗台安全与爬架',
      '公猫注意泌尿健康与饮水'
    ],
    food: '控体配方 + 湿粮补水，少零食',
    caution: '肥胖与下泌尿道疾病需提前预防'
  },
  {
    id: 'lhua',
    name: '狸花猫',
    type: '猫',
    tags: ['中华田园', '聪明', '强壮'],
    summary: '本土适应力强，聪明活泼，是经典田园猫代表。',
    care: [
      '活力高，需要够玩的玩具与空间',
      '被毛护理简单，定期驱虫很重要',
      '室外风险高，建议室内养或牵绳',
      '智商高，可训练握手等小技能'
    ],
    food: '全价猫粮即可，可搭配湿粮',
    caution: '散养注意传染病与外伤，疫苗别断'
  },
  {
    id: 'chinese-rural',
    name: '中华田园猫',
    type: '猫',
    tags: ['入门', '好养', '多样'],
    summary: '个体差异大，整体皮实好养，基础护理做到位即可。',
    care: [
      '疫苗驱虫与绝育是健康基础',
      '环境丰富度：抓板、高处、窗景',
      '观察排便与精神，变化早发现',
      '短毛为主，护理成本较低'
    ],
    food: '选择口碑全价粮，幼猫/成猫/老年分开',
    caution: '领养史不明时先体检与隔离观察'
  },
  {
    id: 'generic-dog',
    name: '通用犬护理',
    type: '狗',
    tags: ['入门', '基础'],
    summary: '不确定品种时，可按这份通用清单打好基础。',
    care: [
      '疫苗、驱虫按医生建议执行',
      '每日牵绳遛弯，完成如厕与社交',
      '提供清洁饮水与固定饮食节奏',
      '定期洗澡、剪甲、查耳牙'
    ],
    food: '选择正规犬粮，避免人吃的调味食物',
    caution: '异常呕吐、精神差请及时就医'
  },
  {
    id: 'generic-cat',
    name: '通用猫护理',
    type: '猫',
    tags: ['入门', '基础'],
    summary: '室内猫也需要运动、饮水与环境丰富度。',
    care: [
      '猫砂盆每日清理，数量建议 N+1',
      '提供窗台安全围栏与猫抓板',
      '诱导多喝水，可搭配湿粮',
      '定期驱虫、疫苗与体检'
    ],
    food: '猫是肉食动物，勿长期素食',
    caution: '绝食超过 24 小时需警惕肝脂沉积'
  },
  {
    id: 'syrian-hamster',
    name: '金丝熊 / 黄金鼠',
    type: '小宠',
    tags: ['夜行', '独居', '易应激'],
    summary: '体型较大的仓鼠，适合单独饲养，性格因个体差异大。',
    care: [
      '必须独居，同笼易打架致伤',
      '笼子要通风够大，铺厚垫料方便挖洞筑巢',
      '提供跑轮（实心面）、躲避屋与啃咬玩具',
      '白天少打扰，夜间活动为主'
    ],
    food: '仓鼠专用粮为主，可少量果蔬；葵花籽花生等油脂零食要控量',
    caution: '腹泻/湿尾、拒食、鼓腮异物请尽快就医；勿给巧克力、洋葱、生豆'
  },
  {
    id: 'dwarf-hamster',
    name: '仓鼠 / 三线鼠 / 布丁鼠',
    type: '小宠',
    tags: ['夜行', '体小', '易逃'],
    summary: '侏儒类仓鼠体型小、动作快，饲养重点是防逃与控糖。',
    care: [
      '缝隙要封严，侏儒鼠极擅逃逸',
      '垫料干燥无尘，定期清理尿角与脏垫',
      '跑轮直径够大、实心面，避免夹脚',
      '少频繁抓取，驯服需耐心渐进'
    ],
    food: '专用侏儒仓鼠粮，水果蜜饯少喂防糖尿病；供水瓶每日检查通畅',
    caution: '突然湿屁股、精神萎靡可能湿尾症，属于急症'
  },
  {
    id: 'guinea-pig',
    name: '荷兰猪 / 豚鼠',
    type: '小宠',
    tags: ['群居', '需维C', '胆小'],
    summary: '温顺爱叫，必须每天补充维生素 C，草料是主食核心。',
    care: [
      '优先群居（同性或绝育后），单独易抑郁',
      '每天提供充足提摩西草等干草，磨牙必备',
      '笼子底层勿用铁丝网，易伤脚掌',
      '定期剪甲、梳毛（长毛种更勤）'
    ],
    food: '干草为主+豚鼠专用粮；每日补充含维C蔬果（甜椒、香菜等）',
    caution: '缺乏维C会坏血病；拒食超过半天、腹泻便血需尽快就医'
  },
  {
    id: 'chinchilla',
    name: '龙猫',
    type: '小宠',
    tags: ['怕热', '粉尘浴', '夜行'],
    summary: '皮毛浓密怕湿热，日常靠粉尘浴清洁，不能用水洗。',
    care: [
      '环境宜凉爽干燥，夏天务必降温防中暑',
      '定期提供火山灰粉尘浴，勿用水洗澡',
      '多层笼子+跳跃平台，防摔伤',
      '提供磨牙木与干草，满足啃咬欲'
    ],
    food: '龙猫专用粮+提摩西草；果干零食极少，避免肥胖与肠胃问题',
    caution: '淋湿、高温湿热极易致死；腹泻、拒食属急症'
  },
  {
    id: 'sugar-glider',
    name: '蜜袋鼯',
    type: '小宠',
    tags: ['夜行', '群居', '高互动'],
    summary: '树栖夜行有袋类，需要较高互动与复杂食谱，新手门槛高。',
    care: [
      '建议成对/小群体饲养，长期独居易刻板行为',
      '高笼+树枝横杆，夜间提供跑轮与觅食玩具',
      '白天安静休息，夜间陪伴互动',
      '笼子远离厨房油烟与强光'
    ],
    food: '需均衡配方（专用粮/蔬果蛋白搭配），忌高糖零食与巧克力',
    caution: '钙磷失衡易后肢瘫痪；突然瘫软、拒食立刻就医'
  },
  {
    id: 'hedgehog',
    name: '刺猬',
    type: '小宠',
    tags: ['夜行', '怕冷', '独居'],
    summary: '非洲迷你刺猬常见于宠物店，对温度敏感，需保温饲养。',
    care: [
      '笼温约 24–28℃，过冷易冬眠危险',
      '独居饲养，提供躲避屋与跑轮（实心面）',
      '定期检查皮肤与刺间有无螨虫、脱刺',
      '抓取前先让它适应气味，避免突然强抓'
    ],
    food: '刺猬专用粮或低脂猫粮为主，昆虫零食适量；避免高脂高糖',
    caution: '疑似冬眠（冰凉不动）要缓慢升温并就医；肥胖与脂肪肝常见'
  },
  {
    id: 'lop-rabbit',
    name: '垂耳兔',
    type: '小宠',
    tags: ['草食', '耳道护理', '怕热'],
    summary: '耳朵下垂美观但通风差，更需注意耳道清洁与防暑。',
    care: [
      '干草无限量供应，兔笼/围栏要防啃电线',
      '定期检查耳道异味红肿，垂耳更易藏污',
      '提供磨牙玩具与干净垫料，每日清粪便',
      '植物性垫料，避免松木等刺激性木屑'
    ],
    food: '提摩西草为主+兔粮；新鲜蔬菜适量，水果极少',
    caution: '停便/拒食可能是胃肠停滞，争分夺秒就医；禁洗澡淋湿受凉'
  },
  {
    id: 'dwarf-rabbit',
    name: '侏儒兔',
    type: '小宠',
    tags: ['体小', '草食', '易惊吓'],
    summary: '体型小巧受欢迎，但应激强，饲养重点是干草与安静环境。',
    care: [
      '活动空间要够，每天放风活动防肥胖',
      '干草始终充足，保证胃肠蠕动与磨牙',
      '环境安静稳定，避免突然噪音与频繁强抱',
      '定期剪甲、检查门齿是否过长'
    ],
    food: '提摩西草+侏儒兔专用粮；控菜控果，防腹泻',
    caution: '幼兔肠胃脆弱；拉稀、胀气、不吃草立即就医'
  },
  {
    id: 'generic-small',
    name: '通用小宠护理',
    type: '小宠',
    tags: ['入门', '基础'],
    summary: '不确定品种时，可按这份清单做好环境、饮食与观察。',
    care: [
      '选择足够大且通风的笼舍，防逃防摔',
      '提供躲避空间与适合该物种的垫料/跑轮',
      '每日观察食量、粪便、精神与饮水',
      '洗手后再接触，生病及时找有经验的异宠医生'
    ],
    food: '使用对应物种专用粮/草料，勿用人吃的调味食物喂养',
    caution: '小宠代谢快，拒食、腹泻、精神差往往进展很快，宜早就医'
  }
];

function searchCareGuides(keyword, type) {
  const q = String(keyword || '').trim();
  return CARE_GUIDES.filter((g) => {
    if (type && type !== '全部' && g.type !== type) return false;
    if (!q) return true;
    const hitName = g.name.includes(q);
    const hitTag = (g.tags || []).some((t) => t.includes(q));
    const hitSummary = (g.summary || '').includes(q);
    const hitCaution = (g.caution || '').includes(q);
    return hitName || hitTag || hitSummary || hitCaution;
  });
}

function getCareGuide(id) {
  return CARE_GUIDES.find((g) => g.id === id) || null;
}

function getMilestones(petId) {
  const all = loadAll();
  const item = (all.milestones && all.milestones[petId]) || {};
  return {
    birthday: item.birthday || '',
    adoptDate: item.adoptDate || '',
    notes: Array.isArray(item.notes) ? item.notes : []
  };
}

function saveMilestones(petId, payload) {
  const all = loadAll();
  all.milestones[petId] = {
    ...(all.milestones[petId] || {}),
    ...payload
  };
  saveAll(all);
  return getMilestones(petId);
}

function addMilestoneNote(petId, text) {
  const cur = getMilestones(petId);
  const notes = [{ id: `n_${Date.now()}`, text: String(text || '').trim(), date: todayStr() }, ...cur.notes];
  return saveMilestones(petId, { notes: notes.slice(0, 50) });
}

function removeMilestoneNote(petId, noteId) {
  const cur = getMilestones(petId);
  return saveMilestones(petId, { notes: cur.notes.filter((n) => n.id !== noteId) });
}

function birthdayMeta(birthday) {
  if (!birthday) return null;
  const b = parseDate(birthday);
  if (!b) return null;
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  let next = thisYear;
  if (thisYear < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(now.getFullYear() + 1, b.getMonth(), b.getDate());
  }
  const remain = daysBetween(todayStr(), `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}-${`${next.getDate()}`.padStart(2, '0')}`);
  let ageYears = now.getFullYear() - b.getFullYear();
  const mdNow = now.getMonth() * 100 + now.getDate();
  const mdBirth = b.getMonth() * 100 + b.getDate();
  if (mdNow < mdBirth) ageYears -= 1;
  return { remain, ageYears: Math.max(ageYears, 0), nextDate: addDays(birthday, 0) };
}

function getWalks(petId) {
  const all = loadAll();
  const item = (all.walks && all.walks[petId]) || {};
  return {
    records: Array.isArray(item.records) ? item.records : [],
    streak: Number(item.streak) || 0
  };
}

function addWalk(petId, minutes, note) {
  const all = loadAll();
  if (!all.walks[petId]) all.walks[petId] = { records: [], streak: 0 };
  const records = all.walks[petId].records || [];
  const today = todayStr();
  records.unshift({
    id: `w_${Date.now()}`,
    date: today,
    minutes: Number(minutes) || 0,
    note: String(note || '').trim()
  });
  all.walks[petId].records = records.slice(0, 60);
  const days = new Set(all.walks[petId].records.map((r) => r.date));
  let streak = 0;
  let cursor = today;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  all.walks[petId].streak = streak;
  saveAll(all);
  return getWalks(petId);
}

function statusLabel(status) {
  if (status === 'unset') return '未设置';
  if (status === 'overdue') return '已逾期';
  if (status === 'soon') return '临近';
  return '正常';
}

function getTools(options = {}) {
  const includeAi = !options || options.includeAi !== false;
  const tools = [];
  if (includeAi) {
    tools.push({
      id: 'ai',
      title: 'AI 问诊',
      desc: '症状与养护智能解答',
      emoji: '🤖',
      path: '/packageUser/user/pet-butler/ai-consult/ai-consult',
      color: '#6FA462',
      featured: true
    });
  }
  tools.push(
    {
      id: 'reminders',
      title: '健康提醒',
      desc: '洗澡 · 驱虫 · 疫苗 · 剪甲',
      emoji: '⏰',
      path: '/packageUser/user/pet-butler/reminders/reminders',
      color: '#E98657'
    },
    {
      id: 'heat',
      title: '姨妈管理',
      desc: '发情周期与下次预估',
      emoji: '💕',
      path: '/packageUser/user/pet-butler/heat-cycle/heat-cycle',
      color: '#E891A8'
    },
    {
      id: 'care',
      title: '养护指南',
      desc: '按品种看喂养与护理',
      emoji: '📘',
      path: '/packageUser/user/pet-butler/care-guide/care-guide',
      color: '#6FA462'
    },
    {
      id: 'food',
      title: '能不能吃',
      desc: '速查食物安不安全',
      emoji: '🥗',
      path: '/packageUser/user/pet-butler/food-check/food-check',
      color: '#5B8C5A'
    },
    {
      id: 'age',
      title: '年龄换算',
      desc: '毛孩子相当于人几岁',
      emoji: '🎂',
      path: '/packageUser/user/pet-butler/age-calc/age-calc',
      color: '#D4A017'
    },
    {
      id: 'weight',
      title: '体重评估',
      desc: '粗评偏瘦或超重',
      emoji: '⚖️',
      path: '/packageUser/user/pet-butler/weight-check/weight-check',
      color: '#6B8FCE'
    },
    {
      id: 'walk',
      title: '遛弯打卡',
      desc: '记录运动，养成连续习惯',
      emoji: '🚶',
      path: '/packageUser/user/pet-butler/walk/walk',
      color: '#5AA6A0'
    },
    {
      id: 'milestones',
      title: '成长足迹',
      desc: '生日倒计时与小确幸',
      emoji: '🌟',
      path: '/packageUser/user/pet-butler/milestones/milestones',
      color: '#C47B4A'
    }
  );
  return tools;
}

module.exports = {
  todayStr,
  addDays,
  daysBetween,
  REMINDER_DEFAULTS,
  getPetReminders,
  savePetReminder,
  markReminderDone,
  collectUpcoming,
  getHeatCycle,
  saveHeatCycle,
  calcHumanAge,
  assessWeight,
  checkFood,
  FOOD_DB,
  searchCareGuides,
  getCareGuide,
  CARE_GUIDES,
  getMilestones,
  saveMilestones,
  addMilestoneNote,
  removeMilestoneNote,
  birthdayMeta,
  getWalks,
  addWalk,
  getTools,
  statusLabel
};
