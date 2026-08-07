/**
 * 宠物寄养电子协议文案与构建
 */

const { buildContractPetInfoLines } = require('./petSnapshot');

function formatCompensationLimit(store) {
  const raw = store && (store.compensationLimit ?? store.contractCompensationLimit);
  if (raw === 0 || raw === '0') return '0';
  if (raw != null && raw !== '') {
    const num = parseFloat(raw);
    if (Number.isFinite(num) && num >= 0) return String(num);
  }
  return '0';
}

function buildClauseSections(compensationLimit) {
  const limitText = compensationLimit || '0';
  return [
    {
      title: '一、关于寄养',
      items: [
        '领回：寄养期限到期前，甲方应及时领回其宠物。如甲方不能亲自到场领回，应通过微信、短信等电子方式，以文字形式告知乙方委托代理人信息（包括姓名、身份证号码、联系电话等），委托代理人凭本协议及本人有效证件领回宠物。',
        '续寄：若甲方需延长寄养期限的，应在寄养期限届满前通过本平台向乙方提出申请，经甲乙双方协商一致同意后，可延长寄养期限。',
        '过期：寄养期满甲方未能领回其宠物，乙方将宽限3日，宽限期内按本协议收费标准正常收费。宽限期满甲方仍未领回的，视为甲方自愿放弃宠物所有权，乙方有权自行处理（包括无偿送养、由其他第三人领养等方式）且无需承担任何责任，甲方无权干涉；因此给乙方造成损失的，甲方还应赔偿。',
        '费用：甲方在提交预约订单时，应一次性向乙方支付全部寄养费用（以订单显示金额为准）。',
        '寄养期限内，如一方提出终止本协议的，应提前24小时通过本平台、微信或短信等方式通知对方。'
      ]
    },
    {
      title: '二、关于宠物出现死亡、丢失等意外情况的赔付约定',
      items: [
        `宠物进入乙方寄养场所后，因乙方工作失误导致宠物死亡、丢失的，乙方应以宠物市场价格为基础给予相应赔付，但赔偿金额不超过人民币 ${limitText} 元。对于死因不明的，由甲乙双方认可的宠物医疗机构出具验尸报告确定责任方，相应费用由甲方先行垫付，最终由责任方承担。`,
        '甲方应如实告知乙方其宠物的健康情况，并如实填写有效联系方式，否则因此产生的责任由甲方自行承担。'
      ]
    },
    {
      title: '三、免责条款',
      items: [
        '寄养期限内，乙方应精心照料甲方宠物，但由于不可控因素（包括甲方未按时免疫、宠物抗体不足等）发生感染烈性传染病（犬瘟、细小、冠流感等），乙方不负责赔偿。',
        '由于发生不可抗力情形（包括战争、政府行为、地震、山洪、泥石流、疫情、其他自然灾害或重大刑事案件等），造成宠物死亡、受伤、残疾、丢失等，乙方不负责赔偿。',
        '寄养期间，宠物由于年老体衰或其它突发病导致死亡，乙方不负责赔偿。',
        '寄养期间，由于甲方未为宠物办理合法犬证及注册芯片，导致宠物被政府机构收容的，因此产生的责任由甲方承担。',
        '寄养期限内，当宠物发生疾病需要治疗时，乙方应及时通知甲方并告知实情；经甲方书面同意（包括微信、短信等电子方式），乙方可代送至第三方宠物医疗机构治疗，所产生的费用由甲方承担。若甲方拒绝治疗的，相应责任由甲方自行承担。'
      ]
    }
  ];
}

const SECTION_TITLE_RE = /^[一二三四五六七八九十百千]+、/;

function sectionsToEditText(sections) {
  if (!Array.isArray(sections) || !sections.length) return '';
  return sections
    .map((sec) => {
      const title = (sec && sec.title) || '';
      const items = Array.isArray(sec && sec.items) ? sec.items : [];
      return [title, ...items.map((item, idx) => `${idx + 1}. ${item}`)].join('\n');
    })
    .join('\n\n');
}

function parseSectionsFromEditText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const sections = [];
  let current = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (SECTION_TITLE_RE.test(trimmed)) {
      if (current && current.items.length) sections.push(current);
      current = { title: trimmed, items: [] };
      return;
    }

    const itemMatch = trimmed.match(/^(\d+)[.、．]\s*(.+)$/);
    if (itemMatch && current) {
      current.items.push(itemMatch[2].trim());
      return;
    }

    if (!current) {
      current = { title: '协议条款', items: [] };
    }
    if (current.items.length) {
      current.items[current.items.length - 1] += trimmed;
    } else {
      current.items.push(trimmed);
    }
  });

  if (current && current.items.length) sections.push(current);
  if (!sections.length && raw) {
    return [{ title: '协议条款', items: raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) }];
  }
  return sections;
}

function getDefaultClauseEditText(store) {
  const compensationLimit = formatCompensationLimit(store);
  return sectionsToEditText(buildClauseSections(compensationLimit));
}

function getStoredClauseEditText(store) {
  const custom = store && (store.boardingContractClauseText || store.boardingContractClauses);
  return custom && String(custom).trim() ? String(custom).trim() : '';
}

function applyCompensationToSections(sections, limitText) {
  const text = limitText || '0';
  if (!Array.isArray(sections)) return [];
  return sections.map((sec) => ({
    ...sec,
    items: (sec.items || []).map((item) => String(item).replace(/________/g, text))
  }));
}

function resolveClauseSections(store, compensationLimit) {
  const customText = getStoredClauseEditText(store);
  const limitText = compensationLimit || '0';
  if (customText) {
    const parsed = parseSectionsFromEditText(customText);
    if (parsed.length) return applyCompensationToSections(parsed, limitText);
  }
  return buildClauseSections(limitText);
}

function isCustomClauseText(store) {
  return !!getStoredClauseEditText(store);
}

function hasCustomCompensationLimit(store) {
  const raw = store && (store.compensationLimit ?? store.contractCompensationLimit);
  return raw != null && raw !== '';
}

function isCustomContractSettings(store) {
  return isCustomClauseText(store) || hasCustomCompensationLimit(store);
}

function buildPartyA(contact) {
  const c = contact || {};
  const name = (c.name || c.contactName || '').trim() || '——';
  const phone = (c.phone || c.contactPhone || '').trim() || '——';
  const idCard = (c.idCard || c.contactIdCard || '').trim();
  return {
    label: '甲方（宠主）',
    nickName: name,
    name,
    phone,
    idCard: idCard || '——'
  };
}

function buildPartyB(store) {
  const s = store || {};
  return {
    label: '乙方（寄养服务方）',
    name: (s.name || '').trim() || '——',
    address: (s.address || '').trim() || '——',
    phone: (s.contactPhone || '').trim() || '——',
    legalName: (s.legalName || '').trim() || '——'
  };
}

function buildMultiPetInfoLines(pets, orderFallback) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (list.length <= 1) {
    return buildContractPetInfoLines(list[0] || null, orderFallback || {});
  }
  const lines = [];
  list.forEach((p, idx) => {
    if (idx > 0) lines.push({ label: '', value: '' });
    lines.push({ label: `【宠物 ${idx + 1}】`, value: (p.name || '').trim() || '——' });
    lines.push(...buildContractPetInfoLines(p, {}));
  });
  return lines;
}

function buildContractDraft(input) {
  const {
    user,
    store,
    pet,
    pets,
    startDate,
    endDate,
    startTime,
    endTime,
    days,
    totalFee,
    deposit,
    specialNeeds,
    needPickup,
    roomName,
    billingMode,
    contactName,
    contactPhone,
    contactIdCard,
    orderFallback
  } = input || {};

  const compensationLimit = formatCompensationLimit(store);
  const hasContact = !!(contactName || contactPhone || contactIdCard);
  const partyA = buildPartyA(
    hasContact
      ? { name: contactName, phone: contactPhone, idCard: contactIdCard }
      : {
        name: user && (user.realName || user.nickName),
        phone: user && user.phone,
        idCard: user && user.idCard
      }
  );
  const partyB = buildPartyB(store);
  const sections = resolveClauseSections(store, compensationLimit);

  const petList = Array.isArray(pets) && pets.length
    ? pets.filter(Boolean)
    : (pet ? [pet] : []);
  const primaryPet = pet || petList[0] || null;
  const petInfoLines = buildMultiPetInfoLines(petList.length ? petList : null, orderFallback || {});
  const primaryPetLines = buildContractPetInfoLines(primaryPet, orderFallback || {});
  const petNameLine = primaryPetLines.find((line) => line.label === '宠物名称');
  const petTypeLine = primaryPetLines.find((line) => line.label === '宠物类型');
  const petWeightLine = primaryPetLines.find((line) => line.label === '体重');
  const petName = (petNameLine && petNameLine.value) || '——';
  const petType = (petTypeLine && petTypeLine.value) || '——';
  const petWeight = (petWeightLine && petWeightLine.value) || '——';
  const timeRange = `${startDate || '——'} ${startTime || ''} 至 ${endDate || '——'} ${endTime || ''}`.trim();
  const feeText = totalFee != null ? `¥${totalFee}` : '——';
  const depositText = deposit != null ? `¥${deposit}` : '¥0';

  const bodyLines = [
    '宠物寄养服务电子协议',
    '',
    `${partyA.label}`,
    `联系人：${partyA.name}`,
    `联系电话：${partyA.phone}`,
    `身份证号：${partyA.idCard}`,
    '',
    `${partyB.label}：${partyB.name}`,
    `营业地址：${partyB.address}`,
    `联系电话：${partyB.phone}`,
    `负责人：${partyB.legalName}`,
    '',
    '【寄养宠物信息】',
    ...(petList.length > 1
      ? petList.flatMap((p, idx) => {
        const block = [`—— 宠物 ${idx + 1} ——`];
        buildContractPetInfoLines(p, {}).forEach((line) => {
          block.push(`${line.label}：${line.value}`);
        });
        return block;
      })
      : petInfoLines.map((line) => `${line.label}：${line.value}`)),
    '',
    '【寄养服务信息】',
    `寄养时间：${timeRange}`,
    `寄养天数：${days != null ? days : '——'}天`,
    billingMode === 'room' && roomName ? `房间类型：${roomName}` : '',
    billingMode === 'custom' && roomName ? `收费项目：${roomName}` : '',
    `费用合计：${feeText}`,
    `押金：${depositText}`,
    needPickup ? '接送服务：需要' : '',
    specialNeeds ? `特殊需求：${specialNeeds}` : '',
    store && store.notice ? `寄养须知：${store.notice}` : '',
    '',
    ...sections.flatMap((sec) => [
      sec.title,
      ...sec.items.map((item, idx) => `${idx + 1}. ${item}`),
      ''
    ]),
    '本协议以电子形式订立，甲方在本平台点击「确认签署」即视为同意本协议全部条款；本协议对甲乙双方均具有法律约束力。',
    '（以下无正文）'
  ].filter((line) => line !== false && line !== undefined);

  const bodyText = bodyLines.join('\n');

  return {
    title: '宠物寄养服务电子协议',
    partyA,
    partyB,
    petName,
    petType,
    petWeight,
    petInfoLines,
    pets: petList,
    startDate: startDate || '',
    endDate: endDate || '',
    startTime: startTime || '',
    endTime: endTime || '',
    days: days != null ? days : 0,
    totalFee: totalFee != null ? totalFee : 0,
    deposit: deposit != null ? deposit : 0,
    compensationLimit,
    specialNeeds: specialNeeds || '',
    needPickup: !!needPickup,
    roomName: roomName || '',
    roomLabel: billingMode === 'custom' ? '收费项目' : '房间类型',
    billingMode: billingMode || '',
    serviceType: '宠物寄养服务',
    store_id: (store && store.store_id) || '',
    storeName: partyB.name,
    sections,
    bodyText,
    signed: false,
    signTime: '',
    signMethod: ''
  };
}

function buildContractFromOrder(order, user, store) {
  return buildContractDraft({
    user,
    store: store || {
      name: order.storeName,
      address: order.storeAddress,
      store_id: order.store_id
    },
    pet: {
      ...(order.petSnapshot || {}),
      name: order.petName,
      type: order.petType,
      weight: order.petWeight,
      breed: order.petBreed,
      gender: order.petGender,
      age: order.petAge
    },
    orderFallback: order,
    startDate: order.startDate,
    endDate: order.endDate,
    startTime: order.startTime,
    endTime: order.endTime,
    days: order.days,
    totalFee: order.totalFee,
    deposit: 0,
    specialNeeds: order.specialNeeds,
    needPickup: order.needPickup,
    roomName: order.roomName,
    billingMode: order.billingMode,
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    contactIdCard: order.contactIdCard
  });
}

function ensureContractPetInfo(doc, order, user, store) {
  if (!doc) return doc;
  if (Array.isArray(doc.petInfoLines) && doc.petInfoLines.length) return doc;
  if (!order) return doc;
  const rebuilt = buildContractFromOrder(order, user, store);
  return {
    ...doc,
    petName: rebuilt.petName,
    petType: rebuilt.petType,
    petWeight: rebuilt.petWeight,
    petInfoLines: rebuilt.petInfoLines
  };
}

const DEFAULT_TEMPLATE = getDefaultClauseEditText({});

module.exports = {
  DEFAULT_TEMPLATE,
  buildContractDraft,
  buildContractFromOrder,
  ensureContractPetInfo,
  buildClauseSections,
  formatCompensationLimit,
  sectionsToEditText,
  parseSectionsFromEditText,
  getDefaultClauseEditText,
  getStoredClauseEditText,
  resolveClauseSections,
  isCustomClauseText,
  hasCustomCompensationLimit,
  isCustomContractSettings
};
