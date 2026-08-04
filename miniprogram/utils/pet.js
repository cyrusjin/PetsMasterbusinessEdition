const { callApiService, rejectOnFailure } = require('./api');

function callPetService(action, data = {}) {
  return callApiService('petService', { action, ...data });
}

function listPets() {
  return callPetService('listPets').then((res) => rejectOnFailure(res, '加载宠物失败'));
}

function savePet(pet) {
  return callPetService('savePet', { pet }).then((res) => rejectOnFailure(res, '保存宠物失败'));
}

function deletePet(petId) {
  return callPetService('deletePet', { pet_id: petId }).then((res) => rejectOnFailure(res, '删除宠物失败'));
}

function createPetShareInvite(petId) {
  return callPetService('createPetShareInvite', { pet_id: petId })
    .then((res) => rejectOnFailure(res, '创建邀请失败'));
}

function acceptPetShareInvite(inviteId) {
  return callPetService('acceptPetShareInvite', { inviteId })
    .then((res) => rejectOnFailure(res, '接受邀请失败'));
}

function listPetShareMembers(petId) {
  return callPetService('listPetShareMembers', { pet_id: petId })
    .then((res) => rejectOnFailure(res, '加载成员失败'));
}

function removePetShareMember(petId, openid) {
  return callPetService('removePetShareMember', { pet_id: petId, openid })
    .then((res) => rejectOnFailure(res, '移除成员失败'));
}

function leavePetShare(petId) {
  return callPetService('leavePetShare', { pet_id: petId })
    .then((res) => rejectOnFailure(res, '退出失败'));
}

module.exports = {
  listPets,
  savePet,
  deletePet,
  createPetShareInvite,
  acceptPetShareInvite,
  listPetShareMembers,
  removePetShareMember,
  leavePetShare
};
