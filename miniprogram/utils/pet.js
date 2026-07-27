const { callApiService } = require('./api');

function callPetService(action, data = {}) {
  return callApiService('petService', { action, ...data });
}

function listPets() {
  return callPetService('listPets');
}

function savePet(pet) {
  return callPetService('savePet', { pet });
}

function deletePet(petId) {
  return callPetService('deletePet', { pet_id: petId });
}

module.exports = { listPets, savePet, deletePet };
