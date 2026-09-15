const assert = require('node:assert/strict');
const {
  normalizeCityName,
  isPrivateIp,
  clientIp,
  storeMatchesCity
} = require('../src/services/guestStoreDiscover');

function main() {
  assert.equal(normalizeCityName('杭州市'), '杭州');
  assert.equal(normalizeCityName('西安市'), '西安');
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('192.168.1.2'), true);
  assert.equal(isPrivateIp('116.62.185.48'), false);
  assert.equal(clientIp({
    headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    ip: '127.0.0.1'
  }), '1.2.3.4');

  const hangzhouStore = { address: '浙江省杭州市西湖区文三路1号', addressRegion: '浙江杭州' };
  assert.equal(storeMatchesCity(hangzhouStore, '杭州市', '浙江省'), true);
  assert.equal(storeMatchesCity(hangzhouStore, '杭州', '浙江'), true);
  assert.equal(storeMatchesCity(hangzhouStore, '西安', '陕西'), false);

  console.log('guest-store-discover.test.js ok');
}

main();
