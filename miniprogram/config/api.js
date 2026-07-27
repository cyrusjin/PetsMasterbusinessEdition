/**
 * 商家端 → 阿里云统一 API（媒体存轻量服务器本地）
 *
 * 开发：可临时改 IP，并在开发者工具勾选「不校验合法域名」
 * 正式：request / uploadFile / downloadFile 均配 https://api.petmaster.me
 * 媒体公开地址：https://api.petmaster.me/media/...
 */
const API_BASE_URL = 'https://api.petmaster.me';
const API_CLIENT = 'merchant';

module.exports = { API_BASE_URL, API_CLIENT };
