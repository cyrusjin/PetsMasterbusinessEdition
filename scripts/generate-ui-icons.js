// Run with: NODE_PATH=/tmp/petmaster-icon-tools/node_modules node scripts/generate-ui-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'miniprogram', 'images');
const shapes = {
  home: '<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
  butler: '<path d="M12 21c-3.4 0-6-1.7-6-4.1 0-1.8 1.3-3 3-3.4 1.5-.4 2.2.7 3 1.4.8-.7 1.5-1.8 3-1.4 1.7.4 3 1.6 3 3.4 0 2.4-2.6 4.1-6 4.1z"/><path d="M5.2 8.5a1.3 1.8 0 1 0 0 3.6 1.3 1.8 0 0 0 0-3.6zm4-3a1.4 2 0 1 0 0 4 1.4 2 0 0 0 0-4zm5.6 0a1.4 2 0 1 0 0 4 1.4 2 0 0 0 0-4zm4 3a1.3 1.8 0 1 0 0 3.6 1.3 1.8 0 0 0 0-3.6z"/>',
  order: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 10h6m-6 4h6m-6 4h4"/>',
  daily: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m4 16 5-5 3.5 3.5 2.5-2.5 5 5"/><circle cx="16.5" cy="9" r="1.2"/>',
  checkin: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-12 5 2.5 2.5 5-5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  stats: '<path d="M4 20V4m0 16h17"/><rect x="7" y="12" width="3" height="5" rx=".6"/><rect x="12" y="8" width="3" height="9" rx=".6"/><rect x="17" y="5" width="3" height="12" rx=".6"/>',
  store: '<path d="M4 10h16l-1.2-5H5.2zM5 10v10h14V10M4 10c0 3 3 3 4 0 1 3 3 3 4 0 1 3 3 3 4 0 1 3 4 3 4 0"/><path d="M10 20v-6h4v6"/>',
  pets: '<path d="M12 21c-3.4 0-6-1.7-6-4.1 0-1.8 1.3-3 3-3.4 1.5-.4 2.2.7 3 1.4.8-.7 1.5-1.8 3-1.4 1.7.4 3 1.6 3 3.4 0 2.4-2.6 4.1-6 4.1z"/><circle cx="5" cy="10" r="1.2"/><circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/><circle cx="19" cy="10" r="1.2"/>',
  personality: '<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 15c2.3 2.7 5.7 2.7 8 0"/>',
  camera: '<path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3.2"/>',
  reserve: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 5h6m-6 3h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M10 2h4l.5 2.3 1.8.8 2-.9 2.8 2.8-.9 2 .8 1.8L23 11v4l-2.3.5-.8 1.8.9 2-2.8 2.8-2-.9-1.8.8L14 24h-4l-.5-2.3-1.8-.8-2 .9-2.8-2.8.9-2-.8-1.8L1 15v-4l2.3-.5.8-1.8-.9-2L6 3.9l2 .9 1.8-.8z" transform="translate(1.5 1.5) scale(.88)"/>',
  wash: '<path d="M12 3c-3 4-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-3-7-6-11z"/><path d="M9 15c0 1.7 1.3 3 3 3"/>',
  guide: '<path d="M3 6c3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0zM12 6c3-1.5 6-1.5 9 0v14c-3-1.5-6-1.5-9 0z"/>',
  share: '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5m-8 7 8 5"/>',
  announce: '<path d="M4 10v4h3l9 4V6l-9 4zM7 14l1 6h3l-1-5m8-6c2 1.5 2 4.5 0 6"/>'
};
const tabNames = { home: 'home', butler: 'butler', order: 'order', daily: 'daily', shop: 'store', guide: 'guide', checkin: 'checkin', 'merchant-daily': 'grid', statistics: 'stats', store: 'store' };
const cardNames = { pets: 'pets', personality: 'personality', stats: 'stats', camera: 'camera', orders: 'order', reserve: 'reserve', settings: 'settings', check: 'wash' };

function svg(name, active, card) {
  const color = active ? '#DF7359' : '#927F74';
  const base = card ? '<rect x="1" y="1" width="30" height="30" rx="9" fill="#FFF4ED" stroke="#F4DDD0" stroke-width=".7"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 32 32">${base}<g transform="translate(4 4)" fill="none" stroke="${card ? '#D97758' : color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shapes[name]}</g></svg>`;
}

async function run() {
  for (const [filename, name] of Object.entries(tabNames)) {
    for (const active of [false, true]) {
      const file = path.join(root, 'tab', `tab-${filename}${active ? '-active' : ''}.png`);
      await sharp(Buffer.from(svg(name, active, false))).resize(81, 81).png({ palette: true, quality: 100, effort: 10 }).toFile(file);
    }
  }
  for (const [filename, name] of Object.entries(cardNames)) {
    await sharp(Buffer.from(svg(name, false, true))).png({ palette: true, quality: 100, effort: 10 }).toFile(path.join(root, 'card', `card-${filename}.png`));
  }
  for (const [filename, name] of Object.entries({ 'icon-share': 'share', 'icon-announce': 'announce' })) {
    await sharp(Buffer.from(svg(name, false, true))).resize(filename === 'icon-share' ? 64 : 96).png({ palette: true, quality: 100, effort: 10 }).toFile(path.join(root, `${filename}.png`));
  }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
