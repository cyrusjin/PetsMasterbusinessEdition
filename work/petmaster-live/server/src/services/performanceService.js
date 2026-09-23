const db = require('../db');

async function initialize() {
  const definitions = [
    ['orders', { store_id: 1, createTime: -1 }],
    ['orders', { userOpenid: 1, createTime: -1 }],
    ['orders', { customerPhone: 1, createTime: -1 }],
    ['orders', { status: 1, updateTime: -1 }],
    ['users', { openid: 1 }],
    ['users', { phone: 1, updateTime: -1 }],
    ['pets', { user_id: 1, updateTime: -1 }]
  ];
  for (const [name, index] of definitions) {
    try { await db.collection(name).createIndex(index); } catch (err) {
      console.warn(`[performance] index ${name} skipped`, err.message || err);
    }
  }
}

module.exports = { initialize };
