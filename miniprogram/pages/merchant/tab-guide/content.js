// 常见问题集中维护；描述与当前功能保持一致。
const categories = [{id:'all',name:'全部'}, {id:'start',name:'快速上手'}, {id:'daily',name:'日常操作'}, {id:'stats',name:'营收统计'}, {id:'growth',name:'拉新复购'}];
const articles = [
  {
    "id": "start",
    "category": "start",
    "title": "第一次使用，从哪里开始？",
    "summary": "先选一个今天就用得上的动作。",
    "steps": [
      "已有店铺：打开「发服务记录」，填写宠物名字、服务类型，按实际情况选择或编辑备注。",
      "待开业：打开「发送给客人预约」，选择已开通的服务，再把入口发给意向顾客。",
      "分享时需要在微信中选择联系人并确认发送。打开分享面板不代表顾客已收到。"
    ],
    "action": "record",
    "actionLabel": "去发服务记录"
  },
  {
    "id": "record",
    "category": "daily",
    "title": "线下完成的服务，怎么发给客人？",
    "summary": "不用先录入一份完整预约。",
    "steps": [
      "进入日常管理 → 发服务记录。",
      "填写宠物名字，核对宠物类型与本次服务，备注可以选填。推荐话术需按真实服务情况修改。",
      "点击「完成并发送给顾客」，选择微信联系人。当前分享打开的是对应服务的预约页。"
    ],
    "action": "record",
    "actionLabel": "发服务记录"
  },
  {
    "id": "invite",
    "category": "start",
    "title": "怎么把预约入口发给客人？",
    "summary": "让客人自己选择宠物和服务时间。",
    "steps": [
      "进入「发送给客人预约」。",
      "选择你希望推广的服务，例如洗护、寄养或上门喂养。没有选项时，先去我的门店完善并开通服务。",
      "发送给客人，客人从该店铺对应的服务预约页填写信息。提交后到订单管理查看。"
    ],
    "action": "invite",
    "actionLabel": "发送预约入口"
  },
  {
    "id": "proxy",
    "category": "daily",
    "title": "客人不会操作，能帮他下单吗？",
    "summary": "使用已有的代客人下单功能。",
    "steps": [
      "进入日常管理 → 代客人下单。",
      "选择已有客人；新客可先新增宠物，再选择未分配客人继续。",
      "填写服务和预约信息，保存后把代下单发给对应客人。"
    ],
    "action": "proxy",
    "actionLabel": "代客人下单"
  },
  {
    "id": "orders",
    "category": "daily",
    "title": "收到预约后怎么处理？",
    "summary": "在订单管理里查看并处理。",
    "steps": [
      "进入订单管理，核对服务类型、日期、宠物和金额。",
      "按实际业务进度确认接单、到店或开始服务。",
      "服务真实结束后再标记完成；有改单或价格待确认时，先处理提示。"
    ],
    "action": "orders",
    "actionLabel": "查看订单"
  },
  {
    "id": "daily",
    "category": "daily",
    "title": "寄养和照护期间怎么发动态？",
    "summary": "用日常打卡记录实际照护。",
    "steps": [
      "进入日常打卡，选择可打卡的服务订单。",
      "记录当次照护情况，根据实际需要添加照片或视频。",
      "保存后可从打卡记录查看，确认内容和宠物是否对应。"
    ],
    "action": "daily",
    "actionLabel": "去日常打卡"
  },
  {
    "id": "revenue",
    "category": "stats",
    "title": "营收统计的金额是怎么算的？",
    "summary": "营业收入与到账金额不是同一口径。",
    "steps": [
      "打开营收统计，选择今日、本周、本月或全部。",
      "营业收入汇总所选周期内已完成订单的金额；周期优先按订单创建时间划分，缺失时回退到服务开始日期。",
      "待处理、服务中和已取消订单不计入营业收入。该数字不是微信支付到账或银行对账结果。"
    ],
    "action": "stats",
    "actionLabel": "查看营收统计"
  },
  {
    "id": "pipeline",
    "category": "stats",
    "title": "流水、在途总额和经营净利有什么区别？",
    "summary": "分别查看业务规模、进行中金额和收支差额。",
    "steps": [
      "本期流水：所选周期内，服务中及已完成订单的金额之和。",
      "在途总额：当前所有服务中订单的金额，不仅限所选周期。",
      "经营净利：已完成订单营收 − 本期记账支出 + 本期额外收入。费用需要完整记账，结果才更接近实际经营情况。"
    ],
    "action": "stats",
    "actionLabel": "查看统计"
  },
  {
    "id": "ledger",
    "category": "stats",
    "title": "房租、耗材和额外收入怎么记录？",
    "summary": "用记账本补充订单以外的收支。",
    "steps": [
      "进入记账本，记录实际发生的支出或额外收入，并核对日期、金额。",
      "已有订单计入营收的同一笔收入，不要再重复记为额外收入。",
      "回到营收统计查看记账概况和经营净利。"
    ],
    "action": "ledger",
    "actionLabel": "打开记账本"
  },
  {
    "id": "zero",
    "category": "stats",
    "title": "明明有订单，为什么营收还是零？",
    "summary": "先检查周期、状态和订单金额。",
    "steps": [
      "切换到「全部」，检查是否只是日期范围不匹配。",
      "确认订单是否已完成；不要为了看到营收而提前结束真实服务。",
      "检查订单金额。当前快速服务记录按零金额保存，本身不会增加营收。"
    ],
    "action": "orders",
    "actionLabel": "核对订单"
  },
  {
    "id": "new",
    "category": "growth",
    "title": "新店怎么开始邀请第一批顾客？",
    "summary": "先把一个明确的服务介绍清楚。",
    "steps": [
      "在我的门店完善服务项目、价格和营业信息。",
      "选择一项已开通服务，把预约入口发给已咨询过、愿意了解的客人。",
      "随分享补充真实的服务内容和可预约时间；预约入口用于承接咨询，平台不会自动带来新客。"
    ],
    "action": "invite",
    "actionLabel": "发送预约入口"
  },
  {
    "id": "return",
    "category": "growth",
    "title": "老店怎么引导顾客下次再预约？",
    "summary": "从已经发生的服务开始。",
    "steps": [
      "服务完成后，填写服务记录，备注只描述已确认的真实情况。",
      "发送时告诉顾客：下次需要该服务，可以从这个入口预约。",
      "到合适的时间通过原有微信沟通进行回访；当前这一步需要商家主动联系。"
    ],
    "action": "record",
    "actionLabel": "发服务记录"
  },
  {
    "id": "share",
    "category": "growth",
    "title": "发给顾客，可以怎么开口？",
    "summary": "复制后按门店实际情况调整。",
    "steps": [
      "预约邀请：您好，这是我们店的预约入口，里面可以选择服务和时间，有不清楚的地方也可以直接问我。",
      "服务后回访：今天的服务已经完成，谢谢信任。下次需要时可以从这个入口预约，也欢迎微信联系我。",
      "转介绍：如果身边有朋友正好需要这项服务，可以把预约入口分享给他，先了解项目和价格。"
    ],
    "action": "invite",
    "actionLabel": "去发送预约"
  }
];
function filterArticles(category, keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  return articles.filter(item => (category === 'all' || item.category === category) && (!query || [item.title,item.summary,...item.steps].join(' ').toLowerCase().includes(query)));
}
module.exports = { categories, articles, filterArticles };
