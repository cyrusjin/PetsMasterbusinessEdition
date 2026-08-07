/**
 * 本地宠物品种库（支持模糊搜索；未命中时可自定义填写）
 */

const DOG_BREEDS = [
  // 常见小型犬
  '田园犬', '泰迪', '贵宾', '比熊', '柯基', '柴犬', '豆柴', '博美', '约克夏', '吉娃娃',
  '巴哥', '法斗', '英斗', '腊肠', '西高地', '雪纳瑞', '马尔济斯', '京巴', '西施', '蝴蝶犬',
  '迷你杜宾', '小鹿犬', '比格', '巴吉度', '杰克罗素', '可卡', '贝灵顿', '狐狸犬',
  // 梗类 / 牧羊
  '凯恩梗', '猎狐梗', '斯塔福', '苏牧', '澳牧', '德牧', '边牧', '喜乐蒂', '古牧',
  '马犬', '毛狮',
  // 常见中大型犬
  '金毛', '拉布拉多', '哈士奇', '阿拉斯加', '萨摩耶', '伯恩山', '大白熊', '纽芬兰', '圣伯纳',
  '罗威纳', '杜宾', '拳师', '斗牛獒', '卡斯罗', '高加索', '中亚', '藏獒', '秋田',
  '松狮', '沙皮', '恶霸', '比特', '惠比特', '格力', '灵缇',
  '阿富汗', '苏俄猎狼', '爱尔兰猎狼', '魏玛', '波音达', '史宾格',
  '大丹', '獒犬', '波尔多', '土佐',
  '串串', '混血', '其他'
];

const CAT_BREEDS = [
  // 常见品种
  '田园猫', '英短', '美短', '加菲', '布偶', '暹罗', '波斯', '缅因', '挪威森林', '俄蓝',
  '阿比', '孟买', '埃及猫', '孟加拉', '无毛猫', '德文卷', '柯卷',
  '折耳', '立耳', '美国卷耳', '日本短尾', '短腿猫', '伯曼', '巴厘',
  '金吉拉', '喜马拉雅', '西伯利亚', '安哥拉', '梵猫',
  // 常见毛色称呼
  '蓝猫', '白猫', '黑猫', '橘猫', '三花', '玳瑁', '奶牛猫', '狸花', '虎斑',
  '金渐层', '银渐层',
  '串串', '混血', '其他'
];

const OTHER_BREEDS = [
  // 宠物店常见小宠（优先展示）
  '金丝熊', '荷兰猪', '豚鼠', '仓鼠', '龙猫', '蜜袋鼯', '刺猬', '垂耳兔', '侏儒兔',
  // 兔
  '狮子兔', '道奇兔', '安哥拉兔', '雷克斯兔', '海棠兔', '比利时兔', '荷兰兔', '其他兔',
  // 仓鼠 / 啮齿
  '黄金鼠', '三线鼠', '一线鼠', '布丁鼠', '紫仓', '老公公', '银狐鼠', '侏儒鼠',
  '花枝鼠', '松鼠', '貂', '其他小宠',
  // 鸟
  '虎皮鹦鹉', '玄凤', '牡丹鹦鹉', '爱情鸟', '小太阳', '金刚鹦鹉', '灰鹦鹉',
  '文鸟', '珍珠鸟', '金丝雀', '芙蓉鸟', '八哥', '鹩哥', '画眉', '其他鸟',
  // 爬宠 / 观赏鱼常见
  '巴西龟', '草龟', '乌龟', '鳄龟', '剃刀龟', '地图龟', '其他龟',
  '鬃狮蜥', '豹纹守宫', '睫角守宫', '玉米蛇', '球蟒', '其他爬宠',
  '其他'
];

function uniqueList(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((item) => {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });
  return out;
}

const BREED_POOL = {
  dog: uniqueList(DOG_BREEDS),
  cat: uniqueList(CAT_BREEDS),
  other: uniqueList(OTHER_BREEDS)
};

function resolveBreedCategory(petType) {
  const type = String(petType || '').trim();
  if (type === '猫咪') return 'cat';
  if (type === '其他' || type === '其他宠物') return 'other';
  if (type === '小型犬' || type === '中型犬' || type === '大型犬' || type.indexOf('犬') >= 0) {
    return 'dog';
  }
  return '';
}

function getBreedPool(petType) {
  const category = resolveBreedCategory(petType);
  if (category && BREED_POOL[category]) return BREED_POOL[category];
  return uniqueList([].concat(BREED_POOL.dog, BREED_POOL.cat, BREED_POOL.other));
}

function normalizeKeyword(keyword) {
  return String(keyword || '').trim().toLowerCase();
}

/**
 * 模糊搜索品种；keyword 为空时返回热门前若干项
 */
function searchBreeds(keyword, petType, limit = 30) {
  const pool = getBreedPool(petType);
  const key = normalizeKeyword(keyword);
  const max = Math.max(1, Math.min(Number(limit) || 30, 80));

  if (!key) {
    return pool.slice(0, Math.min(20, max));
  }

  const exact = [];
  const starts = [];
  const includes = [];
  pool.forEach((breed) => {
    const lower = breed.toLowerCase();
    if (lower === key) exact.push(breed);
    else if (lower.indexOf(key) === 0) starts.push(breed);
    else if (lower.indexOf(key) >= 0) includes.push(breed);
  });

  return exact.concat(starts, includes).slice(0, max);
}

function hasExactBreed(keyword, petType) {
  const key = String(keyword || '').trim();
  if (!key) return false;
  return getBreedPool(petType).some((breed) => breed === key);
}

module.exports = {
  DOG_BREEDS: BREED_POOL.dog,
  CAT_BREEDS: BREED_POOL.cat,
  OTHER_BREEDS: BREED_POOL.other,
  resolveBreedCategory,
  getBreedPool,
  searchBreeds,
  hasExactBreed
};
