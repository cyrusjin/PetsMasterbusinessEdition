const { formatOrderStatus } = require('../../utils/orderStatus');
const { formatPickupLegs } = require('./pickupInfo');
const { resolveOrderDisplayNo } = require('../../utils/displayNo');
const { formatOrderCreateTime } = require('../../utils/util');
const { attachVisitAddressFields, formatHomeVisitTimeText } = require('../../utils/homeVisitAddress');

function displayText(value) {
  if (value === null || value === undefined || value === '') return '--';
  return String(value);
}

function buildOrderDetailSections(order, petView, feeSummary, feeDetail) {
  const boardingTime = `${displayText(order.startDate)} ${displayText(order.startTime)} ~ ${displayText(order.endDate)} ${displayText(order.endTime)}`;
  const pickupText = order.needPickup ? '需要' : '不需要';
  const isHome = order.serviceLine === 'homeFeeding';
  const isWash = order.serviceLine === 'wash';
  const orderRows = [
    ['订单状态', formatOrderStatus(order.status)],
    ['订单编号', displayText(resolveOrderDisplayNo(order))],
    ['下单时间', displayText(formatOrderCreateTime(order) || '--')],
    ['服务类型', displayText(order.serviceType)],
    ['宠主', displayText(order.userNickName || order.contactName)],
    ['联系电话', displayText(order.contactPhone || order.userPhone)]
  ];
  if (order.emergencyPhone) {
    orderRows.push(['紧急联系电话', displayText(order.emergencyPhone)]);
  }
  if (isHome) {
    const visit = attachVisitAddressFields(order);
    orderRows.push(['上门时间', formatHomeVisitTimeText(order) || '--']);
    if (order.roomName) orderRows.push(['服务项目', displayText(order.roomName)]);
    if (visit.visitAddress) orderRows.push(['小区地址', displayText(visit.visitAddress)]);
    if (visit.visitRoomNo) orderRows.push(['门牌号', displayText(visit.visitRoomNo)]);
    if (visit.visitEntryMethod) orderRows.push(['开门方式', displayText(visit.visitEntryMethod)]);
  } else if (isWash) {
    orderRows.push(
      ['到店时间', `${displayText(order.startDate)} ${displayText(order.startTime)}`],
      ['洗护项目', displayText(order.roomName)]
    );
  }
  if (order.needPickup) {
    orderRows.push(
      ['接送地址', displayText(order.pickupAddress)],
      ['接送联系电话', displayText(order.pickupContactPhone)],
      ['接送时间', displayText(order.startDate && (order.pickupTime || order.startTime)
        ? `${order.startDate} ${order.pickupTime || order.startTime}`
        : (order.pickupTime || order.startTime))],
      ['接送范围', formatPickupLegs(order) || '--']
    );
  }
  const optionLabel = order.billingMode === 'custom' ? '收费项目' : '房间';
  if (!isHome && !isWash) {
    orderRows.push(
      ['寄养时间', boardingTime],
      [optionLabel, displayText(order.roomName)],
      ['接送服务', pickupText],
      ['洗护服务', order.needWash ? '需要' : '不需要'],
      ['天数', order.days != null && order.days !== '' ? `${order.days}天` : '--']
    );
  }

  if (Array.isArray(order.valueAddedServices) && order.valueAddedServices.length) {
    orderRows.push([
      '增值服务',
      order.valueAddedServices.map((item) => item.name || '增值服务').join('、')
    ]);
  }

  if (feeDetail && feeDetail.ready && Array.isArray(feeDetail.dailyBreakdown) && feeDetail.dailyBreakdown.length) {
    orderRows.push(['单价', `¥${feeDetail.basePriceText}/天`]);
    feeDetail.dailyBreakdown.forEach((day) => {
      orderRows.push([
        `${day.dateDisplay} ${day.dayLabel}`,
        `${day.factorText} ¥${day.feeText}`
      ]);
    });
    orderRows.push(['计费天数', `${feeDetail.daysText}天`]);
  }

  if (isHome) {
    orderRows.push(['上门费用', `¥${feeSummary.visitFee != null ? feeSummary.visitFee : 0}`]);
  } else if (isWash) {
    orderRows.push(['洗护服务费', `¥${feeSummary.washFee != null ? feeSummary.washFee : 0}`]);
  } else {
    orderRows.push(
      ['寄养费用', `¥${feeSummary.boardingFee}`],
      ['接送运费', order.needPickup ? `¥${feeSummary.shippingFee}` : '--'],
      ['洗护服务费', order.needWash ? `¥${feeSummary.washFee != null ? feeSummary.washFee : 0}` : '--']
    );
  }

  if (feeSummary.hasValueAdded) {
    orderRows.push(['增值服务费', `¥${feeSummary.valueAddedFee != null ? feeSummary.valueAddedFee : 0}`]);
  }

  if (feeDetail && feeDetail.showDeposit) {
    orderRows.push(['押金', `¥${feeDetail.depositText}`]);
  }

  orderRows.push(
    ['费用合计', `¥${feeSummary.totalFee}`],
    ['特殊需求', displayText(order.specialNeeds)]
  );

  return [
    {
      title: '订单详情',
      rows: orderRows
    },
    {
      title: '宠物信息',
      photo: petView.photo || '',
      rows: [
        ['宠物名称', displayText(order.petName)],
        ['宠物类型', displayText(order.petType)],
        ['品种', displayText(petView.breed)],
        ['性别', displayText(petView.gender)],
        ['年龄', displayText(petView.ageText)],
        ['体重', displayText(petView.weightText)],
        ['毛色', displayText(petView.color)]
      ]
    },
    {
      title: '健康信息',
      rows: [
        ['疫苗接种', displayText(petView.vaccination)],
        ['驱虫时间', displayText(petView.dewormDate)],
        ['过敏史', displayText(petView.allergyText)],
        ['既往病史', displayText(petView.medicalHistoryText)],
        ['是否怀孕', displayText(petView.isPregnant)],
        ['是否发情', displayText(petView.inHeat)],
        ['是否绝育', displayText(petView.isNeutered)],
        ['是否办理犬证', displayText(petView.hasDogLicense)]
      ]
    },
    {
      title: '生活习性',
      rows: [
        ['性格特点', displayText(petView.character)],
        ['特殊行为', displayText(petView.behaviorHabits)],
        ['饮食禁忌', displayText(petView.dietTaboo)],
        ['特殊照料需求', displayText(petView.specialCare)],
        ['备注', displayText(petView.remark)]
      ]
    }
  ];
}

module.exports = {
  formatOrderStatus,
  buildOrderDetailSections
};
