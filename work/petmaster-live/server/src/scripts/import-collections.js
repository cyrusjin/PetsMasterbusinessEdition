#!/usr/bin/env node
/**
 * 将云数据库导出的 JSON 导入 MongoDB
 * 用法: node src/scripts/import-collections.js <dataDir>
 * dataDir 下放置 users.json / stores.json / pets.json / orders.json / daily_logs.json
 */
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const { connectDb, collection, ensureCollections } = require('../db');

const COLLECTIONS = ['users', 'stores', 'pets', 'orders', 'daily_logs'];

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  throw new Error(`无法解析数组: ${filePath}`);
}

function normalizeDoc(doc) {
  const next = { ...doc };
  if (next._id && typeof next._id === 'string' && ObjectId.isValid(next._id)) {
    next._id = new ObjectId(next._id);
  } else if (next._id && typeof next._id === 'object' && next._id.$oid) {
    next._id = new ObjectId(next._id.$oid);
  } else {
    delete next._id;
  }
  return next;
}

async function main() {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('用法: node src/scripts/import-collections.js <dataDir>');
    process.exit(1);
  }

  await connectDb();
  await ensureCollections(COLLECTIONS);

  for (const name of COLLECTIONS) {
    const filePath = path.join(dataDir, `${name}.json`);
    const rows = loadJson(filePath);
    if (!rows) {
      console.log(`[skip] ${name}: 文件不存在`);
      continue;
    }
    if (!rows.length) {
      console.log(`[skip] ${name}: 空数组`);
      continue;
    }
    const docs = rows.map(normalizeDoc);
    const col = collection(name);
    let inserted = 0;
    for (const doc of docs) {
      try {
        if (doc._id) {
          await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
        } else {
          await col.insertOne(doc);
        }
        inserted += 1;
      } catch (err) {
        console.warn(`[warn] ${name} 写入失败`, err.message);
      }
    }
    console.log(`[ok] ${name}: ${inserted}/${docs.length}`);
  }

  console.log('导入完成');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
