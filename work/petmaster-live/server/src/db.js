const { MongoClient, ObjectId } = require('mongodb');
const config = require('./config');

let client = null;
let db = null;

async function connectDb() {
  if (db) return db;
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db();
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('数据库未连接');
  }
  return db;
}

function collection(name) {
  return getDb().collection(name);
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && ObjectId.isValid(id)) {
    return new ObjectId(id);
  }
  return id;
}

async function ensureCollections(names) {
  const existing = await getDb().listCollections({}, { nameOnly: true }).toArray();
  const existingNames = new Set(existing.map((item) => item.name));
  const results = [];
  for (const name of names) {
    if (existingNames.has(name)) {
      results.push({ name, created: false });
      continue;
    }
    try {
      await getDb().createCollection(name);
      results.push({ name, created: true });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (/already exists|exists/i.test(msg)) {
        results.push({ name, created: false });
      } else {
        results.push({ name, created: false, warn: msg });
      }
    }
  }
  return results;
}

async function findOne(name, filter) {
  return collection(name).findOne(filter);
}

async function findMany(name, filter = {}, options = {}) {
  const cursor = collection(name).find(filter);
  if (options.sort) cursor.sort(options.sort);
  if (options.limit) cursor.limit(options.limit);
  if (options.skip) cursor.skip(options.skip);
  return cursor.toArray();
}

async function insertOne(name, doc) {
  const result = await collection(name).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function updateById(name, id, data) {
  const _id = toObjectId(id);
  await collection(name).updateOne({ _id }, { $set: data });
  return findOne(name, { _id });
}

async function updateOne(name, filter, data, operators = {}) {
  const update = { ...operators };
  if (data && Object.keys(data).length) {
    update.$set = { ...(update.$set || {}), ...data };
  }
  await collection(name).updateOne(filter, update);
  return findOne(name, filter);
}

async function deleteById(name, id) {
  const _id = toObjectId(id);
  return collection(name).deleteOne({ _id });
}

async function deleteMany(name, filter) {
  return collection(name).deleteMany(filter);
}

module.exports = {
  connectDb,
  getDb,
  collection,
  ensureCollections,
  findOne,
  findMany,
  insertOne,
  updateById,
  updateOne,
  deleteById,
  deleteMany,
  toObjectId,
  ObjectId
};
