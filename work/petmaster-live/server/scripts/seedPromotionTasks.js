const db = require('../src/db');
const membershipService = require('../src/services/membershipService');

const tasks = [
  {
    code: 'promo_social_like_days',
    title: '社交平台推广',
    description: '在小红书、抖音或微信视频号发布熠森宠物相关的真实原创推广内容。每获得 1 个赞，赠送 1 天使用期限。',
    requirementText: '上传可清晰显示发布账号、推广内容和点赞数的截图。多个平台参与时请合并为一张长图，审核按各平台可核验的总点赞数发放使用天数。',
    sortOrder: 10
  }
];

async function main() {
  await db.connectDb();
  await membershipService.initializeMembership();
  const now = Date.now();
  const results = [];
  for (const task of tasks) {
    const result = await db.collection('membership_promotion_tasks').updateOne(
      { code: task.code },
      {
        $set: {
          ...task,
          rewardMonths: 1,
          rewardMode: 'like_days',
          status: 'published',
          startsAt: null,
          endsAt: null,
          updatedAt: now,
          updatedBy: 'codex-seed',
          publishedAt: now
        },
        $setOnInsert: { createdAt: now, createdBy: 'codex-seed' }
      },
      { upsert: true }
    );
    results.push({ code: task.code, inserted: result.upsertedCount === 1 });
  }
  await db.collection('membership_promotion_tasks').deleteMany({ code: { $in: ['promo_xiaohongshu_like_days', 'promo_douyin_wechat_like_days'] } });
  console.log(JSON.stringify(results));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
