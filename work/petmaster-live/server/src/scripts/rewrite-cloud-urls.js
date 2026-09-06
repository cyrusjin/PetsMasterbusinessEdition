#!/usr/bin/env node
/**
 * 按映射表把库内 cloud:// 替换为 OSS HTTPS URL
 * 用法: node src/scripts/rewrite-cloud-urls.js <url-map.json>
 */
const fs = require('fs');
const { connectDb, collection } = require('../db');

const TARGETS = [
  { name: 'users', fields: ['avatarUrl'] },
  { name: 'stores', fields: ['logo', 'storePhotos', 'introPhotos', 'noticePhotos', 'businessLicense'] },
  { name: 'pets', fields: ['photo'] },
  { name: 'orders', fields: ['petPhoto', 'storeLogo', 'petSnapshot.photo'] },
  { name: 'daily_logs', fields: ['images', 'video', 'videos', 'videoCover', 'videoCovers'] }
];

function rewriteValue(value, map) {
  if (typeof value === 'string') {
    return map[value] || value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteValue(item, map));
  }
  if (value && typeof value === 'object') {
    const next = { ...value };
    Object.keys(next).forEach((key) => {
      next[key] = rewriteValue(next[key], map);
    });
    return next;
  }
  return value;
}

function getByPath(doc, fieldPath) {
  const parts = fieldPath.split('.');
  let cur = doc;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(doc, fieldPath, value) {
  const parts = fieldPath.split('.');
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

async function main() {
  const mapPath = process.argv[2];
  if (!mapPath || !fs.existsSync(mapPath)) {
    console.error('用法: node src/scripts/rewrite-cloud-urls.js <url-map.json>');
    process.exit(1);
  }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  await connectDb();

  for (const target of TARGETS) {
    const col = collection(target.name);
    const docs = await col.find({}).toArray();
    let updated = 0;
    for (const doc of docs) {
      let changed = false;
      const patch = {};
      for (const field of target.fields) {
        const oldVal = getByPath(doc, field);
        if (oldVal === undefined) continue;
        const newVal = rewriteValue(oldVal, map);
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          if (field.includes('.')) {
            const root = field.split('.')[0];
            const cloned = rewriteValue(doc[root], map);
            patch[root] = cloned;
          } else {
            patch[field] = newVal;
          }
          changed = true;
        }
      }
      if (changed) {
        await col.updateOne({ _id: doc._id }, { $set: patch });
        updated += 1;
      }
    }
    console.log(`[ok] ${target.name}: 更新 ${updated} 条`);
  }

  console.log('URL 改写完成');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
