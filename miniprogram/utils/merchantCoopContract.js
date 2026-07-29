/**
 * 商家入驻平台合作协议文案与构建
 */

const PLATFORM_NAME = '熠森宠物管家';
const PLATFORM_ENTITY = '西安熠森网络科技有限公司';

function buildClauseSections() {
  return [
    {
      title: '一、平台服务性质',
      items: [
        '本平台仅为宠物寄养服务提供方（商家）与宠主之间的信息展示、预约下单、订单管理及辅助沟通等技术服务，属于居间合作平台，不直接提供宠物寄养服务。',
        '商家通过本平台展示的店铺信息、服务价格、接待能力及日常服务内容，均由商家自行提供并对其真实性、合法性、准确性负责。',
        '宠主与商家之间就寄养服务订立的权利义务关系，以双方签署的《宠物寄养服务电子协议》及订单约定为准，本平台不作为该寄养服务合同的当事人。'
      ]
    },
    {
      title: '二、合作内容与各方责任',
      items: [
        '商家应依法具备开展宠物寄养相关经营活动的资质与条件，保证店铺信息、联系方式、营业地址等内容真实有效，并持续维持符合平台要求的经营状态。',
        '商家应妥善保管平台账号，对通过该账号进行的店铺管理、订单处理、价格调整等操作承担全部责任。',
        '商家应依法履行纳税、安全生产、动物防疫、治安管理等法定义务，因商家经营行为产生的行政、民事或刑事责任由商家自行承担。',
        '本平台有权依据运营需要对商家资质、服务质量及投诉情况进行审核、监督，并可在商家违反法律法规、平台规则或损害用户合法权益时，采取警告、限制功能、下架店铺、终止合作等措施。'
      ]
    },
    {
      title: '三、纠纷处理与免责条款',
      items: [
        '宠主与商家之间因寄养服务本身（包括但不限于宠物健康、费用结算、服务标准、领回时间、损失赔偿等）产生的争议、索赔或诉讼，由宠主与商家自行协商或通过法律途径解决，本平台不承担连带责任，亦不承担赔付义务。',
        '因商家提供虚假信息、违规经营、未履行告知义务、操作失误或违反寄养服务协议约定而引发的纠纷及损失，由商家自行承担；因此给本平台造成损失的，商家应予以赔偿。',
        '因不可抗力（包括但不限于自然灾害、政府行为、公共卫生事件、网络或通信故障等）导致平台服务中断、数据丢失或订单无法履行的，本平台在法律法规允许范围内免于承担责任，但将尽力协助恢复服务。',
        '因宠主自身原因（包括但不限于未如实告知宠物健康状况、拒绝必要治疗、逾期领回等）引发的后果，由宠主与商家依照双方协议处理，本平台不承担责任。',
        '本平台对商家与宠主之间线下或平台外达成的补充约定、口头承诺及私下交易不承担任何责任；相关风险由交易双方自行承担。',
        '本平台依法配合有权机关调查取证，但不对司法机关、仲裁机构或双方的裁判结果承担责任。'
      ]
    },
    {
      title: '四、信息授权与协议效力',
      items: [
        '商家同意本平台在入驻审核、店铺展示、订单履约及客服处理所必需的范围内，使用商家提交的店铺名称、地址、照片、联系方式等信息。',
        '商家上传至本平台的所有视频、照片及其他内容素材（包括但不限于店铺照片、日常打卡动态等），均授权本平台用于平台宣传及推广。商家如事后不愿相关素材继续用于宣传推广，有权联系本平台申请删除或停止使用，本平台将在合理期限内予以处理。',
        '本协议以电子形式订立。商家在本平台点击「确认签署」并完成入驻申请提交，即视为已充分阅读、理解并同意本协议全部条款。',
        '本协议自商家电子签署之日起生效，对商家与本平台均具有法律约束力；商家入驻审核通过后，继续使平台服务即视为接受本协议及平台后续公布的规则。'
      ]
    }
  ];
}

function buildPartyA(shop, user) {
  const s = shop || {};
  const u = user || {};
  return {
    label: '甲方（入驻商家）',
    name: (s.legalName || u.realName || u.nickName || '').trim() || '——',
    shopName: (s.name || '').trim() || '——',
    phone: (s.contactPhone || u.phone || '').trim() || '——',
    address: (s.address || '').trim() || '——'
  };
}

function buildPartyB() {
  return {
    label: '乙方（平台方）',
    name: PLATFORM_NAME,
    role: PLATFORM_ENTITY
  };
}

function buildMerchantCoopContract(input) {
  const { user, shop } = input || {};
  const partyA = buildPartyA(shop, user);
  const partyB = buildPartyB();
  const sections = buildClauseSections();

  const bodyLines = [
    '商家入驻平台合作协议',
    '',
    `${partyA.label}`,
    `负责人：${partyA.name}`,
    `店铺名称：${partyA.shopName}`,
    `联系电话：${partyA.phone}`,
    `营业地址：${partyA.address}`,
    '',
    `${partyB.label}`,
    `平台名称：${partyB.name}`,
    `主体身份：${partyB.role}`,
    '',
    ...sections.flatMap((sec) => [
      sec.title,
      ...sec.items.map((item, idx) => `${idx + 1}. ${item}`),
      ''
    ]),
    '本协议以电子形式订立，甲方在本平台点击「确认签署」即视为同意本协议全部条款。',
    '（以下无正文）'
  ];

  return {
    title: '商家入驻平台合作协议',
    partyA,
    partyB,
    sections,
    bodyText: bodyLines.join('\n'),
    signed: false,
    signTime: '',
    signMethod: ''
  };
}

module.exports = {
  PLATFORM_NAME,
  PLATFORM_ENTITY,
  buildMerchantCoopContract
};
