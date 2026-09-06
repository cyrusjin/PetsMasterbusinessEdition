const crypto = require('crypto');
const db = require('../db');
const identity = require('./identity');
const petService = require('./petService');

const COLLECTION = 'pet_share_invites';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEMBERS = petService.MAX_MEMBERS || 10;

async function ensureCollection() {
  await db.ensureCollections([COLLECTION, 'pets', 'users']);
}

function buildInviteId() {
  return crypto.randomBytes(6).toString('hex');
}

async function createInvite(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const petId = String(event.pet_id || event.petId || '').trim();
  if (!petId) return { success: false, errMsg: '缺少宠物 ID' };

  await ensureCollection();
  const pet = await petService.getPetById(petId);
  if (!pet) return { success: false, errMsg: '宠物档案不存在' };

  const callerOpenids = await petService.collectCallerOpenids(openid);
  if (!petService.isOwnerOfPetDoc(pet, callerOpenids)) {
    return { success: false, errMsg: '仅主账号可邀请家人' };
  }

  const members = petService.normalizeMemberOpenids(pet.memberOpenids);
  if (members.length >= MAX_MEMBERS) {
    return { success: false, errMsg: `家庭成员已达上限（${MAX_MEMBERS}人）` };
  }

  const now = Date.now();
  const inviteId = buildInviteId();
  const expireAt = now + TTL_MS;
  const inviterOpenid = pet.ownerOpenid || openid;

  await db.insertOne(COLLECTION, {
    inviteId,
    petId,
    inviterOpenid,
    status: 'pending',
    createTime: now,
    expireAt,
    usedByOpenids: [],
    usedAt: null
  });

  return {
    success: true,
    inviteId,
    expireAt,
    petId,
    petName: pet.name || ''
  };
}

async function getInvite(inviteId) {
  const id = String(inviteId || '').trim();
  if (!id) return null;
  const rows = await db.findMany(COLLECTION, { inviteId: id }, { limit: 1 });
  return rows[0] || null;
}

async function acceptInvite(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const inviteId = String(event.inviteId || event.invite_id || '').trim();
  if (!inviteId) return { success: false, errMsg: '缺少邀请码' };

  await ensureCollection();
  const invite = await getInvite(inviteId);
  if (!invite) return { success: false, errMsg: '邀请不存在或已失效' };
  if (invite.status === 'revoked') return { success: false, errMsg: '邀请已撤销' };
  if (invite.status === 'expired' || (invite.expireAt && invite.expireAt < Date.now())) {
    if (invite.status !== 'expired') {
      await db.updateById(COLLECTION, invite._id, { status: 'expired', updateTime: Date.now() });
    }
    return { success: false, errMsg: '邀请已过期' };
  }
  if (invite.status !== 'pending' && invite.status !== 'accepted') {
    return { success: false, errMsg: '邀请不可用' };
  }

  const pet = await petService.getPetById(invite.petId);
  if (!pet) return { success: false, errMsg: '宠物档案不存在' };

  const callerOpenids = await petService.collectCallerOpenids(openid);
  if (petService.isOwnerOfPetDoc(pet, callerOpenids)) {
    return {
      success: true,
      alreadyMember: true,
      isOwner: true,
      pet: petService.formatPetForCaller(pet, callerOpenids)
    };
  }

  let members = petService.normalizeMemberOpenids(pet.memberOpenids);
  const already = petService.canAccessPetDoc(pet, callerOpenids);
  if (already) {
    await petService.addPetIdToUser(openid, pet.pet_id);
    return {
      success: true,
      alreadyMember: true,
      isOwner: false,
      pet: petService.formatPetForCaller(pet, callerOpenids)
    };
  }

  if (members.length >= MAX_MEMBERS) {
    return { success: false, errMsg: `家庭成员已达上限（${MAX_MEMBERS}人）` };
  }

  // 写入主 openid（业务主账号），便于后续匹配
  const user = await identity.findPrimaryUserByOpenid(openid);
  const memberOpenid = (user && user.openid) || openid;
  if (!members.includes(memberOpenid)) {
    members = [...members, memberOpenid];
  }

  const now = Date.now();
  await db.updateById('pets', pet._id, {
    memberOpenids: members,
    updateTime: now
  });
  await petService.addPetIdToUser(openid, pet.pet_id);

  const usedByOpenids = Array.isArray(invite.usedByOpenids) ? [...invite.usedByOpenids] : [];
  if (!usedByOpenids.includes(openid)) usedByOpenids.push(openid);

  await db.updateById(COLLECTION, invite._id, {
    status: 'accepted',
    usedByOpenids,
    usedAt: now,
    updateTime: now
  });

  const updatedPet = { ...pet, memberOpenids: members, updateTime: now };
  return {
    success: true,
    alreadyMember: false,
    isOwner: false,
    pet: petService.formatPetForCaller(updatedPet, callerOpenids),
    petName: pet.name || ''
  };
}

async function revokeInvite(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const inviteId = String(event.inviteId || event.invite_id || '').trim();
  if (!inviteId) return { success: false, errMsg: '缺少邀请码' };

  await ensureCollection();
  const invite = await getInvite(inviteId);
  if (!invite) return { success: false, errMsg: '邀请不存在' };

  const pet = await petService.getPetById(invite.petId);
  if (!pet) return { success: false, errMsg: '宠物档案不存在' };

  const callerOpenids = await petService.collectCallerOpenids(openid);
  if (!petService.isOwnerOfPetDoc(pet, callerOpenids)) {
    return { success: false, errMsg: '仅主账号可撤销邀请' };
  }

  await db.updateById(COLLECTION, invite._id, {
    status: 'revoked',
    updateTime: Date.now()
  });
  return { success: true };
}

async function removeMember(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const petId = String(event.pet_id || event.petId || '').trim();
  const targetOpenid = String(event.openid || event.memberOpenid || '').trim();
  if (!petId) return { success: false, errMsg: '缺少宠物 ID' };
  if (!targetOpenid) return { success: false, errMsg: '缺少成员 openid' };

  await ensureCollection();
  const pet = await petService.getPetById(petId);
  if (!pet) return { success: false, errMsg: '宠物档案不存在' };

  const callerOpenids = await petService.collectCallerOpenids(openid);
  if (!petService.isOwnerOfPetDoc(pet, callerOpenids)) {
    return { success: false, errMsg: '仅主账号可移除家人' };
  }

  const targetUser = await identity.findPrimaryUserByOpenid(targetOpenid);
  const targetOpenids = targetUser
    ? identity.collectOpenids(targetUser)
    : [targetOpenid];

  if (pet.ownerOpenid && targetOpenids.includes(pet.ownerOpenid)) {
    return { success: false, errMsg: '不能移除主账号' };
  }

  const members = petService.normalizeMemberOpenids(pet.memberOpenids)
    .filter((id) => !targetOpenids.includes(id));

  await db.updateById('pets', pet._id, {
    memberOpenids: members,
    updateTime: Date.now()
  });
  await petService.removePetIdFromOpenids(targetOpenids, petId);

  return { success: true, memberOpenids: members };
}

async function leaveShare(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const petId = String(event.pet_id || event.petId || '').trim();
  if (!petId) return { success: false, errMsg: '缺少宠物 ID' };

  await ensureCollection();
  const pet = await petService.getPetById(petId);
  if (!pet) return { success: false, errMsg: '宠物档案不存在' };

  const callerOpenids = await petService.collectCallerOpenids(openid);
  if (petService.isOwnerOfPetDoc(pet, callerOpenids)) {
    return { success: false, errMsg: '主账号无法退出，可移除家人或删除宠物' };
  }
  if (!petService.canAccessPetDoc(pet, callerOpenids)) {
    return { success: false, errMsg: '您不是该宠物的家庭成员' };
  }

  const members = petService.normalizeMemberOpenids(pet.memberOpenids)
    .filter((id) => !callerOpenids.includes(id));

  await db.updateById('pets', pet._id, {
    memberOpenids: members,
    updateTime: Date.now()
  });
  await petService.removePetIdFromOpenids(callerOpenids, petId);

  return { success: true };
}

async function resolveMemberProfile(openid) {
  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) {
    return {
      openid,
      nickName: '微信用户',
      avatarUrl: '',
      role: 'member'
    };
  }
  return {
    openid: user.openid || openid,
    nickName: user.nickName || user.realName || '微信用户',
    avatarUrl: user.avatarUrl || '',
    role: 'member'
  };
}

async function listMembers(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const petId = String(event.pet_id || event.petId || '').trim();
  if (!petId) return { success: false, errMsg: '缺少宠物 ID' };

  await ensureCollection();
  const pet = await petService.getPetById(petId);
  if (!pet) return { success: false, errMsg: '宠物档案不存在' };

  const callerOpenids = await petService.collectCallerOpenids(openid);
  if (!petService.canAccessPetDoc(pet, callerOpenids)) {
    return { success: false, errMsg: '无权查看家庭成员' };
  }

  const isOwner = petService.isOwnerOfPetDoc(pet, callerOpenids);
  const ownerProfile = await resolveMemberProfile(pet.ownerOpenid);
  ownerProfile.role = 'owner';
  ownerProfile.isOwner = true;

  const members = [];
  for (const memberOpenid of petService.normalizeMemberOpenids(pet.memberOpenids)) {
    const profile = await resolveMemberProfile(memberOpenid);
    profile.role = 'member';
    profile.isOwner = false;
    members.push(profile);
  }

  return {
    success: true,
    petId,
    petName: pet.name || '',
    isOwner,
    members: [ownerProfile, ...members]
  };
}

module.exports = {
  createInvite,
  acceptInvite,
  revokeInvite,
  removeMember,
  leaveShare,
  listMembers,
  MAX_MEMBERS
};
