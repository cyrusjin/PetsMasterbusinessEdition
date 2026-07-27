const { formatOrderStatus } = require('./orderStatus');
const { formatPickupLegs } = require('./pickupInfo');
const { resolveOrderDisplayNo } = require('./displayNo');
const { formatOrderCreateTime } = require('./util');

function displayText(value) {
  if (value === null || value === undefined || value === '') return '--';
  return String(value);
}

function buildOrderDetailSections(order, petView, feeSummary, feeDetail) {
  const boardingTime = `${displayText(order.startDate)} ${displayText(order.startTime)} ~ ${displayText(order.endDate)} ${displayText(order.endTime)}`;
  const pickupText = order.needPickup ? '需要' : '不需要';
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
  orderRows.push(
    ['寄养时间', boardingTime],
    ['房间', displayText(order.roomName)],
    ['接送服务', pickupText],
    ['天数', order.days != null && order.days !== '' ? `${order.days}天` : '--']
  );

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

  orderRows.push(
    ['寄养费用', `¥${feeSummary.boardingFee}`],
    ['接送运费', order.needPickup ? `¥${feeSummary.shippingFee}` : '--']
  );

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
