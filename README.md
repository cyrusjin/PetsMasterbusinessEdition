# PetMasterBusiness（熠森宠物 · 双端合一）

本仓库为商家端 AppID 小程序，已内嵌宠主端（用户版）页面。默认入口为用户首页；已入驻商家冷启动默认进入商家端。

## AppID

- 本小程序（商家端 AppID）：`wx327ccf77cdedc252`
- 宠主端独立小程序（暂保留）：`wx95d01c319ed4f686`

登录 `client` 仍为 `merchant`（与本 AppID 的 `code2Session` 一致）。

## 双端壳

| 场景 | 行为 |
|------|------|
| 普通用户打开 | 用户版（首页 / 订单 / 动态） |
| 已入驻商家打开 | 商家版（日常 / 统计 / 店铺） |
| 用户首页右上角「切换商家版」 | 已入驻 → 商家日常；未入驻 → 申请入驻 |
| 商家页右上角「切换用户版」 | 进入用户版，并默认绑定自己的店（`visitStoreId`） |
| 分享带 `store_id` | 强制用户版并绑定该店 |

用户版使用原生 `tabBar` + `custom-tab-bar`；商家三页不在原生 Tab 内，使用页面内 `merchant-tab-bar`。

## 分享给客人

商家点「分享给客人」直接转发**本小程序卡片**：

```text
pages/index/index?store_id={store_id}
```

好友打开后进入用户版，并自动绑定该店（成为本店客人）。历史落地页 `pages/share/store-landing` 仍兼容，会中转至用户首页。

服务号关注后仅登记店铺意向并回复欢迎文字，**不再推送小程序卡片**。

员工邀请仍为本小程序商家页：`pages/merchant/tab-daily/tab-daily?staff_invite=1&store_id=...`

## API

- Base URL：`https://api.petmaster.me`（`miniprogram/config/api.js`）
- 登录：`POST /api/auth/login`，body `{ code, client: "merchant" }`
- 业务接口：`/api/user|store|order|pet|daily`、`/api/upload/sign`
- 媒体：`wx.uploadFile` → `https://api.petmaster.me/api/upload`，公开访问 `https://api.petmaster.me/media/...`

## 身份说明

本小程序内用户版与商家版共用同一 openid（商家 AppID）。与独立宠主端小程序之间仍可通过 UnionID / 手机号绑定对齐账号。

## 微信后台配置

1. request / uploadFile / downloadFile 合法域名：`https://api.petmaster.me`
2. 服务端 `.env` 配置 `WX_MERCHANT_APPID` / `WX_MERCHANT_SECRET`

## 门店在线收款（可选）

店主可在「店铺 → 门店收款设置」提交微信支付入驻申请。不开通或关闭在线支付时，所有订单继续沿用原结算方式；开启后，仅新创建的普通用户订单进入在线支付流程，且必须由商家确认订单和金额后才能付款。平台不抽取订单佣金。

本功能使用微信支付普通服务商模式，各店铺以特约商户身份收款。服务商账号开通后，在服务端设置：

- `ORDER_PAY_ENABLED=true`
- `WECHAT_PARTNER_MCH_ID`：服务商商户号
- `WECHAT_PARTNER_CERT_SERIAL`：服务商 API 证书序列号
- `WECHAT_PARTNER_PRIVATE_KEY_PATH`：服务商商户私钥路径
- `WECHAT_PARTNER_API_V3_KEY_PATH`：服务商 APIv3 密钥文件路径
- `WECHAT_PARTNER_PUBLIC_KEY_ID` / `WECHAT_PARTNER_PUBLIC_KEY_PATH`：微信支付公钥 ID 与文件路径
- `WECHAT_PARTNER_NOTIFY_URL=https://api.petmaster.me/api/wechatpay/orders/notify`

门店可在“店铺设置 → 门店收款设置”提交个体工商户初审资料，包括营业执照信息、营业执照照片、经营场所照片、结算账户类型/户名及超级管理员联系方式。页面暂不采集身份证号码、身份证照片和完整银行卡号；这些高敏感资料须在服务商 API 加密进件或微信支付官方受控流程接通后补充。

后台管理页 `website/admin/collections.html` 用于将微信支付服务商后台产生的开户申请单号关联到对应门店，并同步审核、签约和特约商户号。商户号与审核结果只接受微信支付验签接口返回，不接受小程序客户端填写。
