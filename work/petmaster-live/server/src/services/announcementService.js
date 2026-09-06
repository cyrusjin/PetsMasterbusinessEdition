const db = require('../db');

const COLLECTION = 'announcements';
const AUDIENCES = ['merchant', 'user', 'all'];
const STATUSES = ['draft', 'published', 'archived'];

function trimText(value, max) {
  const text = String(value == null ? '' : value).trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max);
}

function normalizeAudience(value) {
  const audience = String(value || 'merchant').trim().toLowerCase();
  return AUDIENCES.indexOf(audience) >= 0 ? audience : 'merchant';
}

function normalizeStatus(value) {
  const status = String(value || 'draft').trim().toLowerCase();
  return STATUSES.indexOf(status) >= 0 ? status : 'draft';
}

function toPublicItem(doc) {
  if (!doc) return null;
  const id = doc._id != null ? String(doc._id) : '';
  return {
    id,
    title: String(doc.title || ''),
    content: String(doc.content || ''),
    audience: normalizeAudience(doc.audience),
    status: normalizeStatus(doc.status),
    pinned: !!doc.pinned,
    publishAt: Number(doc.publishAt || doc.createTime || 0) || null,
    createTime: Number(doc.createTime || 0) || null,
    updateTime: Number(doc.updateTime || 0) || null,
    createdBy: String(doc.createdBy || ''),
    updatedBy: String(doc.updatedBy || '')
  };
}

function matchesAudience(itemAudience, queryAudience) {
  const target = normalizeAudience(queryAudience || 'merchant');
  const item = normalizeAudience(itemAudience);
  if (item === 'all') return true;
  return item === target;
}

async function ensureIndexes() {
  try {
    await db.collection(COLLECTION).createIndexes([
      { key: { status: 1, pinned: -1, publishAt: -1 } },
      { key: { audience: 1, status: 1, publishAt: -1 } }
    ]);
  } catch (err) {
    // ignore index errors on older mongo / race
  }
}

let indexesReady = false;
async function ready() {
  if (indexesReady) return;
  await ensureIndexes();
  indexesReady = true;
}

/**
 * 小程序公开列表：仅已发布，按受众过滤
 */
async function listPublic(options = {}) {
  await ready();
  const audience = normalizeAudience(options.audience || 'merchant');
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 50));
  const now = Date.now();
  const rows = await db.findMany(
    COLLECTION,
    {
      status: 'published',
      audience: { $in: [audience, 'all'] },
      $or: [
        { publishAt: { $exists: false } },
        { publishAt: null },
        { publishAt: { $lte: now } }
      ]
    },
    {
      sort: { pinned: -1, publishAt: -1, updateTime: -1 },
      limit
    }
  );
  const list = rows.map(toPublicItem).filter(Boolean);
  const latest = list[0] || null;
  return {
    success: true,
    audience,
    list,
    latestId: latest ? latest.id : '',
    latestPublishAt: latest ? latest.publishAt : null,
    unreadHintAt: latest ? (latest.updateTime || latest.publishAt) : null
  };
}

async function listAdmin(options = {}) {
  await ready();
  const status = options.status ? normalizeStatus(options.status) : '';
  const audience = options.audience ? normalizeAudience(options.audience) : '';
  const filter = {};
  if (status) filter.status = status;
  if (audience) filter.audience = audience;
  const rows = await db.findMany(COLLECTION, filter, {
    sort: { pinned: -1, updateTime: -1, createTime: -1 },
    limit: 200
  });
  return {
    success: true,
    list: rows.map(toPublicItem).filter(Boolean)
  };
}

async function getById(id) {
  await ready();
  if (!id) return null;
  const doc = await db.findOne(COLLECTION, { _id: db.toObjectId(id) });
  return toPublicItem(doc);
}

async function createAnnouncement(input = {}, operator = '') {
  await ready();
  const title = trimText(input.title, 80);
  const content = trimText(input.content, 5000);
  if (!title) return { success: false, errMsg: '请填写标题' };
  if (!content) return { success: false, errMsg: '请填写正文' };

  const status = normalizeStatus(input.status || 'draft');
  const now = Date.now();
  let publishAt = Number(input.publishAt || 0) || null;
  if (status === 'published' && !publishAt) publishAt = now;

  const doc = {
    title,
    content,
    audience: normalizeAudience(input.audience || 'merchant'),
    status,
    pinned: !!input.pinned,
    publishAt,
    createTime: now,
    updateTime: now,
    createdBy: String(operator || ''),
    updatedBy: String(operator || '')
  };
  const saved = await db.insertOne(COLLECTION, doc);
  return { success: true, announcement: toPublicItem(saved) };
}

async function updateAnnouncement(id, input = {}, operator = '') {
  await ready();
  const existing = await db.findOne(COLLECTION, { _id: db.toObjectId(id) });
  if (!existing) return { success: false, errMsg: '公告不存在' };

  const patch = { updateTime: Date.now(), updatedBy: String(operator || '') };
  if (input.title != null) {
    const title = trimText(input.title, 80);
    if (!title) return { success: false, errMsg: '请填写标题' };
    patch.title = title;
  }
  if (input.content != null) {
    const content = trimText(input.content, 5000);
    if (!content) return { success: false, errMsg: '请填写正文' };
    patch.content = content;
  }
  if (input.audience != null) patch.audience = normalizeAudience(input.audience);
  if (input.pinned != null) patch.pinned = !!input.pinned;
  if (input.status != null) {
    patch.status = normalizeStatus(input.status);
    if (patch.status === 'published' && !existing.publishAt && input.publishAt == null) {
      patch.publishAt = Date.now();
    }
  }
  if (input.publishAt != null) {
    const ts = Number(input.publishAt);
    patch.publishAt = Number.isFinite(ts) && ts > 0 ? ts : null;
  }

  const saved = await db.updateById(COLLECTION, id, patch);
  return { success: true, announcement: toPublicItem(saved) };
}

async function deleteAnnouncement(id) {
  await ready();
  const existing = await db.findOne(COLLECTION, { _id: db.toObjectId(id) });
  if (!existing) return { success: false, errMsg: '公告不存在' };
  await db.deleteById(COLLECTION, id);
  return { success: true };
}

module.exports = {
  listPublic,
  listAdmin,
  getById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  matchesAudience,
  toPublicItem
};
