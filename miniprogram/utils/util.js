function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateTime(date) {
  if (date === null || date === undefined || date === '') return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${formatDate(d)} ${h}:${min}`;
}
/** 订单下单时间展示；无有效 createTime 时返回空串 */
function formatOrderCreateTime(orderOrTs) {
  const ts = orderOrTs && typeof orderOrTs === 'object'
    ? orderOrTs.createTime
    : orderOrTs;
  return formatDateTime(ts);
}
function daysBetween(start, end) {
  return Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
}
const billingUtil = require('./billing');
const { findWeightPrice } = require('./weightPricing');
const { findRoomPrice } = require('./roomPricing');
const { RECEPTION_RANGE_OPTIONS } = require('./receptionRange');
const PET_TYPES = RECEPTION_RANGE_OPTIONS.map((item) => item.value);
const PET_GENDERS = ['公', '母'];
const SERVICE_TYPES = ['日托寄养', '临时寄养', '过夜寄养', '短期寄养', '长期包月寄养', '上门寄养', '宠物接送服务'];
const ORDER_STATUS = { pending: '待确认', confirmed: '待签署协议', awaiting_arrival: '待到店', boarding: '寄养中', toPay: '待支付', completed: '已完成', cancelled: '已取消' };
const DAILY_CHECK_TYPES = ['喂食', '饮水', '遛弯', '排便', '玩耍', '喂药', '护理', '清洁', '精神状态'];
const CHECK_STATUS_MAP = { feed: '喂食', water: '饮水', walk: '遛弯', poop: '排便', play: '玩耍', medicine: '喂药', care: '护理', clean: '清洁', spirit: '精神状态' };
function getPetTypePrice(petType, rules) {
  const map = { '猫咪': 'cat', '小型犬': 'smallDog', '中型犬': 'midDog', '大型犬': 'largeDog', '其他': 'other', '其他宠物': 'other' };
  return rules.pricing[map[petType]] || 50;
}
function getPriceByMode(rules, petWeight, roomType) {
  if (rules.billingMode === 'room') {
    return findRoomPrice(rules.roomPricing, roomType);
  }
  return findWeightPrice(rules.weightPricing, petWeight);
}
function calcOrderFee(order, rules) {
  const basePrice = getPriceByMode(rules, order.petWeight, order.roomType);
  const days = billingUtil.calcStayDays(
    order.startDate,
    order.endDate,
    order.startTime,
    order.endTime,
    rules
  );
  let baseFee = days * basePrice;
  let holidayFee = 0, overtimeFee = 0, extrasFee = 0;
  const extras = order.extras || [];
  extras.forEach(e => { extrasFee += (rules.extras[e] || 0) * days; });
  const totalFee = baseFee + holidayFee + overtimeFee + extrasFee;
  return { baseFee, holidayFee, overtimeFee, extrasFee, totalFee, days, basePrice };
}
module.exports = { formatDate, formatDateTime, formatOrderCreateTime, daysBetween, PET_TYPES, PET_GENDERS, SERVICE_TYPES, ORDER_STATUS, DAILY_CHECK_TYPES, CHECK_STATUS_MAP, getPetTypePrice, getPriceByMode, calcOrderFee };