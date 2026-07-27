# PetMasterBusiness（宠大师商家端）

独立商家小程序，与宠主端 `petmaster` 共用阿里云 API 与 MongoDB 数据。

## AppID

- 商家端：`wx327ccf77cdedc252`
- 宠主端：`wx95d01c319ed4f686`

## 分享给客人

商家在「日常」页点击「分享给客人」后，客人打开的是**商家端分享卡片**，进入 `pages/share/store-landing` 中转页，再通过 `wx.navigateToMiniProgram` 跳转到宠主端首页（带 `store_id`）。

### 跳转配置（代码里配置，无需后台页面）

在商家端 `miniprogram/app.json` 中声明可跳转的宠主端 AppID：

```json
"navigateToMiniProgramAppIdList": ["wx95d01c319ed4f686"]
```

修改后重新编译/上传代码即可。这是微信官方要求的配置方式，**不需要**在公众平台找「小程序跳转」菜单。

若使用**半屏打开**另一小程序（本项目未使用），才需要在后台 **设置 → 第三方设置 → 半屏小程序管理** 里申请。

## API

- Base URL：`https://api.petmaster.me`（配置于 `miniprogram/config/api.js`）
- 登录：`POST /api/auth/login`，body 带 `{ code, client: "merchant" }`
- 业务接口与宠主端相同：`/api/user|store|order|pet|daily`、`/api/upload/sign`
- 媒体上传：签名后 `wx.uploadFile` 到 `https://api.petmaster.me/api/upload`，文件落在服务器本地，公开访问 `https://api.petmaster.me/media/...`

## 身份打通

两端 openid 不同。服务端通过以下方式对齐同一用户：

1. 微信开放平台 **UnionID**（两端绑定同一开放平台账号时自动）
2. **手机号绑定**（`bindPhone` 会合并同手机号账号）
3. JWT 内始终使用业务主 `openid`，保证历史店铺/订单归属不断

## 微信后台配置

1. 服务器域名 request：`https://api.petmaster.me`
2. uploadFile / downloadFile：`https://api.petmaster.me`（本地媒体，不再使用 OSS）
3. 服务端 `.env` 配置 `WX_MERCHANT_APPID` / `WX_MERCHANT_SECRET`
4. 跳转宠主端：在 `app.json` 的 `navigateToMiniProgramAppIdList` 中声明（已配置），无需公众平台额外页面
