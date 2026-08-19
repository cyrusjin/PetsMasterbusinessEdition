/** 商家店铺可开通的服务板块：到店寄养 / 美容洗护 / 上门喂养 */

const SERVICE_LINE_KEYS = ['boarding', 'wash', 'homeFeeding'];

const SERVICE_LINE_DEFS = [
  {
    key: 'boarding',
    name: '到店寄养',
    shortName: '寄',
    desc: '到店托管照护',
    emoji: '🏠',
    shareTitle: '开始预约寄养',
    pickerDesc: '发给寄养客户，打开即可预约到店寄养',
    homeTitle: '预约到店寄养',
    homeSub: '专业照护，到店安心寄养'
  },
  {
    key: 'wash',
    name: '美容洗护',
    shortName: '洗',
    desc: '到店美容洗护',
    emoji: '✨',
    shareTitle: '开始预约洗护',
    pickerDesc: '发给洗护客户，打开即可预约美容洗护',
    homeTitle: '预约美容洗护',
    homeSub: '到店美容洗护，选好项目即可预约'
  },
  {
    key: 'homeFeeding',
    name: '上门喂养',
    shortName: '门',
    desc: '上门喂猫、遛狗等服务',
    emoji: '🚪',
    shareTitle: '开始预约上门服务',
    pickerDesc: '发给客户，打开即可预约上门喂养',
    homeTitle: '预约上门服务',
    homeSub: '上门喂猫、遛狗，按项目预约'
  }
];

const DEFAULT_SHARE_META = {
  key: 'boarding',
  name: '预约服务',
  emoji: '🐾',
  shareTitle: '开始预约本店服务',
  pickerDesc: '发给好友，打开即可预约本店服务',
  homeTitle: '预约专属服务',
  homeSub: '专业照护，到店安心寄养'
};

function getServiceShareMeta(key) {
  const hit = SERVICE_LINE_DEFS.find((item) => item.key === key);
  if (!hit) return { ...DEFAULT_SHARE_META };
  return {
    key: hit.key,
    name: hit.name,
    emoji: hit.emoji,
    shareTitle: hit.shareTitle,
    pickerTitle: hit.name,
    pickerDesc: hit.pickerDesc,
    homeTitle: hit.homeTitle,
    homeSub: hit.homeSub
  };
}

const DEFAULT_SERVICE_LINES = {
  boarding: true,
  wash: false,
  homeFeeding: false
};

/** 新店未开通任何板块，避免一进来就把到店寄养标成已完善 */
const EMPTY_SERVICE_LINES = {
  boarding: false,
  wash: false,
  homeFeeding: false
};

function toBool(value, fallback) {
  if (value === true || value === 'yes' || value === 1 || value === '1') return true;
  if (value === false || value === 'no' || value === 0 || value === '0') return false;
  return fallback;
}

/** 旧店无 serviceLines 时默认开通到店寄养，避免影响已营业商家 */
function normalizeServiceLines(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SERVICE_LINES };
  }
  return {
    boarding: toBool(raw.boarding, true),
    wash: toBool(raw.wash, false),
    homeFeeding: toBool(raw.homeFeeding, false)
  };
}

function isServiceLineEnabled(serviceLines, key) {
  const lines = normalizeServiceLines(serviceLines);
  return !!lines[key];
}

function hasEnabledServiceLine(serviceLines) {
  const lines = normalizeServiceLines(serviceLines);
  return SERVICE_LINE_KEYS.some((key) => !!lines[key]);
}

function hasOtherEnabledServiceLine(serviceLines, exceptKey) {
  const lines = normalizeServiceLines(serviceLines);
  return SERVICE_LINE_KEYS.some((key) => key !== exceptKey && !!lines[key]);
}

function isServiceLineReady(key, extras) {
  if (key === 'boarding') return extras && extras.boardingComplete === true;
  if (key === 'wash') return extras && extras.washComplete === true;
  if (key === 'homeFeeding') return extras && extras.homeFeedingComplete === true;
  return false;
}

function hasReadyServiceLine(serviceLines, extras) {
  const lines = normalizeServiceLines(serviceLines);
  return SERVICE_LINE_KEYS.some((key) => lines[key] && isServiceLineReady(key, extras));
}

function buildServiceLineCards(serviceLines, extras) {
  const lines = normalizeServiceLines(serviceLines);
  return SERVICE_LINE_DEFS.map((def) => {
    const enabled = !!lines[def.key];
    let statusType = 'off';
    let statusText = '未开通';
    if (enabled) {
      if (isServiceLineReady(def.key, extras)) {
        statusType = 'ready';
        statusText = '已开通';
      } else if (def.key === 'boarding') {
        statusType = 'todo';
        statusText = '待完善价格';
      } else if (def.key === 'wash') {
        statusType = 'todo';
        statusText = '待完善商品';
      } else if (def.key === 'homeFeeding') {
        statusType = 'todo';
        statusText = '待完善价格';
      } else {
        statusType = 'pending';
        statusText = '价格待维护';
      }
    } else if (isServiceLineReady(def.key, extras)) {
      statusType = 'ready';
      statusText = '可开通';
    } else {
      statusType = 'off';
      statusText = '资料未完善';
    }
    return {
      ...def,
      enabled,
      statusType,
      statusText
    };
  });
}

/** 用户端可预约的服务线：仅展示已开通且资料已完善的板块。旧店无 serviceLines 时默认可约到店寄养。 */
function getBookableServiceOptions(store, extras) {
  const lines = normalizeServiceLines(store && store.serviceLines);
  const extrasObj = extras || {};
  const options = [];
  SERVICE_LINE_DEFS.forEach((def) => {
    if (!lines[def.key]) return;
    if (def.key === 'wash' && extrasObj.washComplete !== true) return;
    if (def.key === 'homeFeeding' && extrasObj.homeFeedingComplete !== true) return;
    options.push({ key: def.key, name: def.name });
  });
  return options;
}

function pickServiceLineView(shop, options) {
  const opts = options || {};
  const serviceLines = normalizeServiceLines(shop && shop.serviceLines);
  const requestedTab = opts.activeServiceTab;
  const activeServiceTab = SERVICE_LINE_KEYS.indexOf(requestedTab) >= 0
    ? requestedTab
    : 'boarding';
  const serviceLineCards = buildServiceLineCards(serviceLines, {
    boardingComplete: opts.boardingComplete === true,
    washComplete: opts.washComplete === true,
    homeFeedingComplete: opts.homeFeedingComplete === true
  });
  const currentKey = SERVICE_LINE_KEYS.indexOf(opts.settingsTab) >= 0
    ? opts.settingsTab
    : activeServiceTab;
  const currentModuleCard = serviceLineCards.find((item) => item.key === currentKey) || null;
  return {
    serviceLines,
    serviceLineCards,
    currentModuleCard,
    boardingEnabled: !!serviceLines.boarding,
    washLineEnabled: !!serviceLines.wash,
    homeFeedingEnabled: !!serviceLines.homeFeeding,
    activeServiceTab
  };
}

module.exports = {
  SERVICE_LINE_KEYS,
  SERVICE_LINE_DEFS,
  DEFAULT_SERVICE_LINES,
  EMPTY_SERVICE_LINES,
  normalizeServiceLines,
  isServiceLineEnabled,
  hasEnabledServiceLine,
  hasOtherEnabledServiceLine,
  hasReadyServiceLine,
  buildServiceLineCards,
  pickServiceLineView,
  getBookableServiceOptions,
  getServiceShareMeta
};
