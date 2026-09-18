// 常见问题集中维护；描述与当前功能保持一致。
const categories = [
  { id: 'all', name: '全部' },
  { id: 'open', name: '开店营业', hint: '店铺资料、开通寄养洗护上门、会员' },
  { id: 'guest', name: '邀客预约', hint: '发预约、代下单、服务后回访' },
  { id: 'order', name: '接单改价', hint: '确认预约、改价、客人改单' },
  { id: 'care', name: '寄养照护', hint: '日常打卡、接宠送宠' },
  { id: 'price', name: '收费标准', hint: '寄养价、洗护价、上门价、节假日加价' },
  { id: 'money', name: '营收账本', hint: '营业收入、流水、房租耗材' },
  { id: 'team', name: '客户店员', hint: '老客档案、员工一起管店' }
];
const articles = [
  {
    id: 'start',
    category: 'open',
    title: '第一次使用，从哪里开始？',
    summary: '先选一个今天就用得上的动作。',
    steps: [
      '已有店铺：打开「发服务记录」，填写宠物名字、服务类型，按实际情况选择或编辑备注。',
      '待开业：打开「发送给客人预约」，选择已开通的服务，再把入口发给意向顾客。',
      '分享时需要在微信中选择联系人并确认发送。打开分享面板不代表顾客已收到。'
    ],
    action: 'record',
    actionLabel: '去发服务记录'
  },
  {
    id: 'open-store',
    category: 'open',
    title: '怎么开通店铺开始营业？',
    summary: '先完善资料，再开通至少一项服务。',
    steps: [
      '进入我的门店 → 店铺信息，填写头像、名称、地址、介绍、接待范围、店铺照片、联系电话、负责人姓名和营业时间。',
      '阅读并签署「商家入驻平台合作协议」。到店寄养、美容洗护、上门喂养至少开通一项，并保存对应设置。',
      '资料和服务都齐全后，营业状态可设为「营业中」。未营业时客人无法正常预约。'
    ],
    action: 'store',
    actionLabel: '去完善门店'
  },
  {
    id: 'invite',
    category: 'guest',
    title: '怎么把预约入口发给客人？',
    summary: '让客人自己选择宠物和服务时间。',
    steps: [
      '进入「发送给客人预约」。',
      '选择你希望推广的服务，例如到店寄养、美容洗护或上门喂养。没有选项时，先去我的门店完善并开通服务。',
      '发送给客人，客人从该店铺对应的服务预约页填写信息。提交后到订单管理查看。'
    ],
    action: 'invite',
    actionLabel: '发送预约入口'
  },
  {
    id: 'switch-mode',
    category: 'open',
    title: '怎么切换用户版和商家版？',
    summary: '同一账号可以按角色切换界面。',
    steps: [
      '商家页右上角有「切换用户版」，进入后可按顾客身份预约、查看订单和动态。',
      '需要回到商家端时，从用户版再切回商家版即可。',
      '处理本店订单、打卡和门店设置时，请使用商家版。'
    ],
    action: 'dailyHome',
    actionLabel: '打开日常管理'
  },
  {
    id: 'oa-follow',
    category: 'open',
    title: '怎么接收新订单提醒？',
    summary: '关注服务号后，新预约和订单变更会通知你。',
    steps: [
      '商家页顶部出现关注横幅时，点「关注」并按提示完成。',
      '店铺开通成功时也会弹出关注提示，建议当场完成。',
      '未关注时，仍可在订单管理里查看预约，只是不一定能及时收到通知。'
    ],
    action: 'dailyHome',
    actionLabel: '打开日常管理'
  },
  {
    id: 'apply-status',
    category: 'open',
    title: '入驻审核中或未通过怎么办？',
    summary: '审核通过前，日常管理不会完整开放。',
    steps: [
      '日常管理顶部会提示当前状态：体验模式、审核中、未通过或店铺已关闭。',
      '审核中请等待；未通过时到「申请入驻」查看驳回理由，修改后重新提交。',
      '体验模式数据只保存在本机。审核通过后才能使用完整功能和真实经营数据。'
    ],
    action: 'store',
    actionLabel: '查看门店资料'
  },
  {
    id: 'record',
    category: 'guest',
    title: '线下完成的服务，怎么发给客人？',
    summary: '不用先录入一份完整预约。',
    steps: [
      '进入日常管理 → 发服务记录。',
      '填写宠物名字，核对宠物类型与本次服务，备注可以选填。推荐话术需按真实服务情况修改。',
      '点击「完成并发送给顾客」，选择微信联系人。当前分享打开的是对应服务的预约页。'
    ],
    action: 'record',
    actionLabel: '发服务记录'
  },
  {
    id: 'proxy',
    category: 'guest',
    title: '客人不会操作，能帮他下单吗？',
    summary: '使用已有的代客人下单功能。',
    steps: [
      '进入日常管理 → 代客人下单。',
      '选择已有客人；新客可先新增宠物，再选择未分配客人继续。',
      '填写服务和预约信息，保存后把代下单发给对应客人。'
    ],
    action: 'proxy',
    actionLabel: '代客人下单'
  },
  {
    id: 'proxy-share',
    category: 'guest',
    title: '代下单后，客人怎么认领？',
    summary: '需要把代下单再发给对应客人。',
    steps: [
      '保存代下单后，进入该订单详情。',
      '点击「把代下单发送给客人」，在微信中发给本人。',
      '客人打开后认领订单。未发送时，订单只在商家端可见。'
    ],
    action: 'orders',
    actionLabel: '查看订单'
  },
  {
    id: 'orders',
    category: 'order',
    title: '收到预约后怎么处理？',
    summary: '按订单状态一步一步推进。',
    steps: [
      '进入订单管理。待确认订单先点「确认接单」或「拒绝」。',
      '寄养确认到店、洗护开始洗护、上门开始上门后，订单进入进行中，可打卡。',
      '服务真实结束后再点结束。有改单待确认或待确认价格时，先处理提示，暂不可操作其他按钮。'
    ],
    action: 'orders',
    actionLabel: '查看订单'
  },
  {
    id: 'order-filter',
    category: 'order',
    title: '订单太多，怎么快速找到某一单？',
    summary: '按状态、服务类型和日期筛选。',
    steps: [
      '开通多项服务时，订单管理顶部可用服务类型筛选寄养、洗护或上门。',
      '再按全部、待确认、待开始、进行中、已完成切换订单状态。',
      '寄养和洗护可用今天、本周、本月或自定义日期缩小范围。上门喂养不显示日期筛选，默认按上门时间排序，也可改为按距离由近到远。订单号可点击复制。'
    ],
    action: 'orders',
    actionLabel: '打开订单管理'
  },
  {
    id: 'price-edit',
    category: 'order',
    title: '怎么修改订单价格？',
    summary: '待确认、待开始和服务中都可以改价。',
    steps: [
      '在订单列表或详情中点「修改价格」。',
      '按实际调整寄养费、洗护费、上门费、接送费或增值服务费后保存。',
      '改价后需等宠主确认。待确认价格期间不可再操作该订单。'
    ],
    action: 'orders',
    actionLabel: '查看订单'
  },
  {
    id: 'user-edit',
    category: 'order',
    title: '客人申请改单怎么办？',
    summary: '确认后才会生效，拒绝则保持原信息。',
    steps: [
      '订单出现「改单待确认」时，先核对流程里列出的修改项和确认后费用。',
      '属实则点「确认改单」，不接受则点「拒绝改单」。',
      '处理完成前，接单、到店、打卡和结束服务等操作暂不可用。'
    ],
    action: 'orders',
    actionLabel: '处理改单'
  },
  {
    id: 'export-order',
    category: 'order',
    title: '怎么把订单详情发给客人？',
    summary: '详情页可以导出并分享。',
    steps: [
      '打开对应订单详情，核对服务、费用、宠物和健康信息。页面内容可点击复制。',
      '点「导出订单详情并分享给好友」，生成后再发给需要的人。',
      '已签署寄养协议的订单，可在详情里查看协议。'
    ],
    action: 'orders',
    actionLabel: '查看订单'
  },
  {
    id: 'daily',
    category: 'care',
    title: '寄养和照护期间怎么发动态？',
    summary: '用日常打卡记录实际照护。',
    steps: [
      '进入日常打卡，可多选进行中的服务订单。',
      '勾选打卡项目，可用快捷用语或自行填写描述，按需要添加照片或视频。',
      '点「提交打卡」立即发给宠主；也可先选「定时打卡」，到点后由系统发送。'
    ],
    action: 'daily',
    actionLabel: '去日常打卡'
  },
  {
    id: 'daily-schedule',
    category: 'care',
    title: '定时打卡怎么改或取消？',
    summary: '未发送前可以修改或删除。',
    steps: [
      '进入打卡记录，找到带「定时待发送」的条目。',
      '点「修改」可调整内容或发送时间；点「删除定时」则取消这次发送。',
      '修改定时时不可更换宠物。已发出的打卡不能改成定时。'
    ],
    action: 'dailyLogs',
    actionLabel: '查看打卡记录'
  },
  {
    id: 'daily-logs',
    category: 'care',
    title: '打卡发出后，怎么确认客人看到了？',
    summary: '打卡记录里能看查看状态和留言。',
    steps: [
      '进入打卡记录，可按宠物和日期筛选。',
      '每条会显示是否已查看。需要时可用「分享给客人」再发一次。',
      '客人可在打卡下留言，商家也可回复。定时未发送的记录暂不显示留言。'
    ],
    action: 'dailyLogs',
    actionLabel: '打开打卡记录'
  },
  {
    id: 'pickup',
    category: 'care',
    title: '接送任务怎么处理？',
    summary: '接宠和送宠分开查看。',
    steps: [
      '进入接送管理。需要接送、且处于待到店或寄养中的订单会出现在这里。',
      '「接」用于接到店，「送」用于送回。可拨打电话或打开导航。',
      '接到后点「已到店」，送完后点「确认已送」。未开通寄养接送时，这里通常没有任务。'
    ],
    action: 'pickup',
    actionLabel: '打开接送管理'
  },
  {
    id: 'today-todo',
    category: 'order',
    title: '今日待办里的数字是什么意思？',
    summary: '把当天最要紧的事集中列出来。',
    steps: [
      '待处理订单：尚未确认接单的预约。',
      '待打卡宠物：进行中、今天还没打卡的宠物。',
      '待接送任务：尚未完成的接宠或送宠。点对应数字可直接处理。'
    ],
    action: 'dailyHome',
    actionLabel: '查看今日待办'
  },
  {
    id: 'shop-info',
    category: 'open',
    title: '店铺资料要填哪些？',
    summary: '这些信息会展示给预约的客人。',
    steps: [
      '店铺信息里填写头像、名称、地图选点地址、介绍（文字或图片至少一项）、接待范围、店铺照片、联系电话和负责人姓名。',
      '微信号选填。营业时间需选择营业日，并设置开始和结束时间。',
      '店铺编号可点击复制。改完后点「保存」。'
    ],
    action: 'store',
    actionLabel: '编辑店铺信息'
  },
  {
    id: 'business-status',
    category: 'open',
    title: '怎么暂停营业或重新开业？',
    summary: '资料和服务齐全后才能切换营业状态。',
    steps: [
      '进入我的门店 → 店铺信息。资料未完善时显示「未营业」，需先补齐并开通服务。',
      '已完善时可在「营业中」和「未营业」之间切换。未营业时客人无法正常预约。',
      '临时停业用「未营业」即可，不必删除已保存的服务设置。'
    ],
    action: 'store',
    actionLabel: '打开我的门店'
  },
  {
    id: 'boarding-price',
    category: 'price',
    title: '怎么开通到店寄养并设置价格？',
    summary: '先选收费模式，再保存基础设置。',
    steps: [
      '进入我的门店 → 到店寄养。可用开关开通或关闭该服务。',
      '收费模式可选按宠物体重、按房间类型或自定义项目；房间和自定义项目可加描述、照片，自定义项目还可加子项。',
      '寄养须知选填。点「保存基础设置」后会开通到店寄养。'
    ],
    action: 'storeBoarding',
    actionLabel: '设置寄养价格'
  },
  {
    id: 'boarding-charge',
    category: 'price',
    title: '入住和离店当天怎么收费？',
    summary: '在到店寄养的高级设置里配置。',
    steps: [
      '进入到店寄养 → 高级设置。入住当天可选全价、半价或免费。',
      '离店当天可选全价、免费，或按时间段：免费、半价、全价各对应一个时间点。',
      '离店选「时间段」时，可再勾选「接送含送时离店当天全价」：用户预约了接送且包含送宠时，离店当天按全价计。未选时间段不出现此项，线上默认不勾选。',
      '保存高级设置后对新预约生效。未开通时，高级设置不会对外展示。'
    ],
    action: 'storeBoardingAdvanced',
    actionLabel: '打开高级设置'
  },
  {
    id: 'boarding-discount',
    category: 'price',
    title: '怎么设置多宠优惠和长期寄养折扣？',
    summary: '只作用于寄养费，接送费和押金不参与。',
    steps: [
      '在到店寄养高级设置中开启多宠优惠：第二只打折，或第 2 只起按固定日价加收。两种方式只能选一种。',
      '长期寄养折扣可设多档，例如 30 天 8.5 折；命中多档时按天数最高的一档计算。',
      '上门喂养也有独立的多宠优惠，需在上门喂养设置里单独配置。'
    ],
    action: 'storeBoardingAdvanced',
    actionLabel: '设置优惠规则'
  },
  {
    id: 'boarding-pickup',
    category: 'price',
    title: '怎么开通寄养接送？',
    summary: '可按一口价或驾车距离计费。',
    steps: [
      '在到店寄养高级设置中选择「有接送」。收费方式可选单程一口价，或按店铺到接送地址的驾车距离计费。',
      '可设置「住满几天、几公里内」免费接送，分单程或往返；单程由客人选择接或送。',
      '接送须知必填。开通后，有接送需求的订单会出现在接送管理。'
    ],
    action: 'storeBoardingAdvanced',
    actionLabel: '设置接送'
  },
  {
    id: 'boarding-vas',
    category: 'price',
    title: '寄养期间怎么加洗护和增值服务？',
    summary: '这是寄养订单里的可选项，和独立美容洗护不是同一项。',
    steps: [
      '在到店寄养高级设置中开启增值洗护，按宠物体重设置每次价格，可选「住满几天免费送一次」。',
      '增值服务可添加加餐、遛弯等项目，按次计费；描述或图片至少填一项，预约时客人自选。',
      '独立美容洗护在「美容洗护」页单独开通，不替代这里的寄养增值洗护。'
    ],
    action: 'storeBoardingAdvanced',
    actionLabel: '设置增值项目'
  },
  {
    id: 'boarding-contract',
    category: 'price',
    title: '怎么改寄养协议和押金？',
    summary: '客人预约签署时使用你保存的条款。',
    steps: [
      '在到店寄养高级设置中打开「到店寄养协议默认条款」，按店铺情况修改后保存，也可恢复默认。',
      '押金金额不填则按 0 元。上门喂养协议在上门喂养设置里单独编辑。',
      '改条款只影响之后的新预约，已签署的订单仍以当时文本为准。'
    ],
    action: 'storeBoardingAdvanced',
    actionLabel: '编辑寄养协议'
  },
  {
    id: 'wash-line',
    category: 'price',
    title: '怎么开通美容洗护？',
    summary: '添加洗护商品后保存即可开通。',
    steps: [
      '进入我的门店 → 美容洗护。添加洗护商品：标题、价格，介绍和照片选填。',
      '适用条件选填。体重区间与宠物类别为「或」关系，满足任一即可预约；不设置则所有宠物都可预约。',
      '洗护增值服务可另加，预约时可多选。点「保存洗护设置」后开通美容洗护。'
    ],
    action: 'storeWash',
    actionLabel: '设置美容洗护'
  },
  {
    id: 'home-feeding',
    category: 'price',
    title: '怎么开通上门喂养？',
    summary: '至少配置一个完整的上门服务项目。',
    steps: [
      '进入我的门店 → 上门喂养。每个项目填写名称、时长、平日价和服务范围；范围来自店铺接待范围，不选则无法预约。',
      '可添加按次计费的增值服务。距离加价选填，超出含公里后按档加价，也可改成按每公里加价。',
      '多宠优惠、节假日加价、须知和协议按需设置。点「保存上门设置」后开通。'
    ],
    action: 'storeHome',
    actionLabel: '设置上门喂养'
  },
  {
    id: 'holiday',
    category: 'price',
    title: '怎么设置休息日加价？',
    summary: '寄养和上门喂养分开配置。',
    steps: [
      '到店寄养在高级设置里点「休息日加价」；上门喂养在上门设置的节假日优惠里进入。',
      '按年份查看休息日，可给单日填加价、全选后一键设置，也可添加或删除自定义日期。',
      '只给需要加价的日期填金额，不加价的留空。保存后，落在这些日期上的预约会按规则加价。'
    ],
    action: 'holiday',
    actionLabel: '设置休息日加价'
  },
  {
    id: 'revenue',
    category: 'money',
    title: '营收统计的金额是怎么算的？',
    summary: '营业收入与到账金额不是同一口径。',
    steps: [
      '打开营收统计，选择今日、本周、本月或全部。',
      '营业收入汇总所选周期内已完成订单的金额；周期优先按订单创建时间划分，缺失时回退到服务开始日期。',
      '待处理、服务中和已取消订单不计入营业收入。该数字不是微信支付到账或银行对账结果。'
    ],
    action: 'stats',
    actionLabel: '查看营收统计'
  },
  {
    id: 'pipeline',
    category: 'money',
    title: '流水、在途总额和经营净利有什么区别？',
    summary: '分别查看业务规模、进行中金额和收支差额。',
    steps: [
      '本期流水：所选周期内，服务中及已完成订单的金额之和。',
      '在途总额：当前所有服务中订单的金额，不仅限所选周期。',
      '经营净利：已完成订单营收 − 本期记账支出 + 本期额外收入。费用需要完整记账，结果才更接近实际经营情况。'
    ],
    action: 'stats',
    actionLabel: '查看统计'
  },
  {
    id: 'composition',
    category: 'money',
    title: '营收构成和经营概览怎么看？',
    summary: '用来看钱从哪来、单均多少。',
    steps: [
      '营收构成拆出寄养服务费、接送服务费，以及记账本里的额外收入。',
      '经营概览含在途金额、待确认金额、已完成客单价，以及本期服务宠物数。',
      '订单概况按待确认、寄养中、已完成、已取消计数。近期订单可点进详情。'
    ],
    action: 'stats',
    actionLabel: '查看营收构成'
  },
  {
    id: 'ledger',
    category: 'money',
    title: '房租、耗材和额外收入怎么记录？',
    summary: '用记账本补充订单以外的收支。',
    steps: [
      '进入记账本，可按月份查看。支出如房租租金、水电燃气、粮水零食、洗护耗材、员工工资；额外收入如商品零售、打赏。',
      '点「记支出」或「记收入」，填写分类、金额、日期，备注选填。已有记录可修改或删除。',
      '已计入营收的订单收入不要再记为额外收入。记完后回到营收统计查看经营净利。'
    ],
    action: 'ledger',
    actionLabel: '打开记账本'
  },
  {
    id: 'zero',
    category: 'money',
    title: '明明有订单，为什么营收还是零？',
    summary: '先检查周期、状态和订单金额。',
    steps: [
      '切换到「全部」，检查是否只是日期范围不匹配。',
      '确认订单是否已完成；不要为了看到营收而提前结束真实服务。',
      '检查订单金额。当前快速服务记录按零金额保存，本身不会增加营收。'
    ],
    action: 'orders',
    actionLabel: '核对订单'
  },
  {
    id: 'new',
    category: 'guest',
    title: '新店怎么开始邀请第一批顾客？',
    summary: '先把一个明确的服务介绍清楚。',
    steps: [
      '在我的门店完善服务项目、价格和营业信息。',
      '选择一项已开通服务，把预约入口发给已咨询过、愿意了解的客人。',
      '随分享补充真实的服务内容和可预约时间；预约入口用于承接咨询，平台不会自动带来新客。'
    ],
    action: 'invite',
    actionLabel: '发送预约入口'
  },
  {
    id: 'return',
    category: 'guest',
    title: '老店怎么引导顾客下次再预约？',
    summary: '从已经发生的服务开始。',
    steps: [
      '服务完成后，填写服务记录，备注只描述已确认的真实情况。',
      '发送时告诉顾客：下次需要该服务，可以从这个入口预约。',
      '到合适的时间通过原有微信沟通进行回访；当前这一步需要商家主动联系。'
    ],
    action: 'record',
    actionLabel: '发服务记录'
  },
  {
    id: 'share',
    category: 'guest',
    title: '发给顾客，可以怎么开口？',
    summary: '复制后按门店实际情况调整。',
    steps: [
      '预约邀请：您好，这是我们店的预约入口，里面可以选择服务和时间，有不清楚的地方也可以直接问我。',
      '服务后回访：今天的服务已经完成，谢谢信任。下次需要时可以从这个入口预约，也欢迎微信联系我。',
      '转介绍：如果身边有朋友正好需要这项服务，可以把预约入口分享给他，先了解项目和价格。'
    ],
    action: 'invite',
    actionLabel: '去发送预约'
  },
  {
    id: 'promo-stats',
    category: 'guest',
    title: '推广小报里的数据是什么意思？',
    summary: '看近 30 天分享有没有带来预约。',
    steps: [
      '日常管理中的推广小报统计近 30 天的分享、打开、带来订单和转化率。',
      '这些数字来自你发出的预约入口或服务记录被打开、并最终下单的情况。',
      '可从这里进入客户管理，给常客或待回访客人打标签，方便下次联系。'
    ],
    action: 'customers',
    actionLabel: '查看客户'
  },
  {
    id: 'insurance',
    category: 'guest',
    title: '怎么推广宠物保险拿佣金？',
    summary: '发送专属保障页面，成交后按保费 10% 计算。',
    steps: [
      '日常管理中点「宠物保险推广」，生成你的专属推广页面。',
      '发给有保障需求的客人。页面生成后 6 小时内有效，过期后重新生成再分享。',
      '客人经该页面成功投保、且符合结算条件后，按保费 10% 计算推广佣金。'
    ],
    action: 'insurance',
    actionLabel: '去推广保险'
  },
  {
    id: 'customers',
    category: 'team',
    title: '客户管理怎么用？怎么打标签？',
    summary: '根据本店历史订单自动汇总档案。',
    steps: [
      '进入客户管理，可按姓名、电话或宠物名搜索。点进客户可查看电话、总单数、宠物和历史订单。',
      '在客户详情里点「编辑标签」，给常客、待回访等分类，列表页会显示这些标签。',
      '有电话时可直接拨打。新客在下单后才会出现，不能在这里手工新建客户。'
    ],
    action: 'customers',
    actionLabel: '打开客户管理'
  },
  {
    id: 'staff',
    category: 'team',
    title: '怎么邀请员工一起管店？',
    summary: '仅店主可邀请和移除员工。',
    steps: [
      '店主在日常管理的「员工协作」里点「分享给员工」，把邀请发给同事。',
      '同事打开邀请并完成授权后，即可协助处理本店订单和打卡。已授权人数会显示在员工管理。',
      '不再需要时，到员工管理点「移除」。员工不能办理会员订阅，需由店主完成。'
    ],
    action: 'staff',
    actionLabel: '打开员工管理'
  },
  {
    id: 'membership',
    category: 'open',
    title: '会员怎么开通、续费或兑换？',
    summary: '试用结束后需订阅才能继续使用商家端。',
    steps: [
      '在我的门店顶部进入会员页。新店注册后有 7 天完整功能试用，不按宠物数量收费。',
      '店主可选择订阅周期支付，或输入兑换码兑换会员时长。提前续费会顺延已有天数。',
      '员工只能查看会员状态。试用或会员到期后，需续费才能继续使用商家经营功能。'
    ],
    action: 'membership',
    actionLabel: '打开会员'
  },
  {
    id: 'promo-task',
    category: 'open',
    title: '怎么通过推广任务获得使用权限？',
    summary: '上传真实截图，由后台人工审核。',
    steps: [
      '在会员页进入「推广任务」，按任务说明完成推广。',
      '上传符合要求的截图提交审核。请勿上传身份证、银行卡等敏感信息。',
      '官网后台核对真实性后通过或驳回；通过后系统发放对应权限。重复或虚假提交不会重复发放。'
    ],
    action: 'promotion',
    actionLabel: '查看推广任务'
  },
  {
    id: 'announcements',
    category: 'team',
    title: '怎么查看平台公告？',
    summary: '日常管理左上角的公告入口。',
    steps: [
      '日常管理导航栏左侧铃铛进入公告列表；有未读时会显示红点。',
      '点标题查看详情。置顶公告会排在前面。',
      '平台发布规则、活动或维护通知时会显示在这里，建议有红点时及时查看。'
    ],
    action: 'announcements',
    actionLabel: '查看公告'
  }
];
function filterArticles(category, keyword) {
  const query = String(keyword || '').trim().toLowerCase();
  return articles.filter(item => (category === 'all' || item.category === category) && (!query || [item.title, item.summary, ...item.steps].join(' ').toLowerCase().includes(query)));
}
function groupArticles(items) {
  return categories.filter(item => item.id !== 'all').map(item => ({
    id: item.id,
    name: item.name,
    hint: item.hint || '',
    items: (items || []).filter(article => article.category === item.id)
  })).filter(group => group.items.length);
}
module.exports = { categories, articles, filterArticles, groupArticles };
