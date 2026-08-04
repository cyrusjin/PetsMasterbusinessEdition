const ADMIN_REGION_RE =
  /(北京市|天津市|上海市|重庆市)|(?:河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆)(?:省|维吾尔自治区|壮族自治区|回族自治区|自治区)?|[\u4e00-\u9fa5]{2,10}(?:市|州|盟|地区)/;

function chooseStoreLocation(current = {}) {
  return chooseMapLocation(current, '请允许使用位置信息，以便在地图上选择地址');
}

function choosePickupLocation(current = {}) {
  return chooseMapLocation(current, '请允许使用位置信息，以便在地图上选择接送地址');
}

function chooseMapLocation(current = {}, authTip = '请允许使用位置信息，以便在地图上选择地址') {
  return new Promise((resolve, reject) => {
    const options = {};
    const lat = parseFloat(current.latitude);
    const lng = parseFloat(current.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      options.latitude = lat;
      options.longitude = lng;
    }

    wx.chooseLocation({
      ...options,
      success: resolve,
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (msg.includes('auth deny') || msg.includes('authorize')) {
          wx.showModal({
            title: '需要位置权限',
            content: authTip,
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) wx.openSetting();
            }
          });
        } else if (!msg.includes('cancel')) {
          wx.showToast({ title: '打开地图失败', icon: 'none' });
        }
        reject(err);
      }
    });
  });
}

function hasAdminRegion(text) {
  const value = String(text || '').replace(/\s+/g, '');
  return !!value && ADMIN_REGION_RE.test(value);
}

function isVagueAddress(text) {
  const value = (text || '').trim();
  if (!value) return true;
  const hasStreetDetail = /[0-9０-９一二三四五六七八九十百千万]+号|[0-9０-９]+(栋|层|室|单元|号楼)|路|街|巷|弄|大道|大街|大厦|广场|小区|花园|公寓|写字楼|中心|城|苑|园|里|村|镇|乡|店|馆|院|所|场|站/.test(value);
  return !hasStreetDetail;
}

function normalizeLocationParts(res) {
  const name = (res && res.name ? String(res.name) : '').trim();
  const address = (res && res.address ? String(res.address) : '').trim();
  return { name, address };
}

function formatLocationAddress(res) {
  const { name, address } = normalizeLocationParts(res);
  if (!name && !address) return '';
  if (!name) return address;
  if (!address) return name;
  if (name === address) return name;
  if (address.includes(name)) return address;
  if (name.includes(address)) return name;

  // 地址含行政区时必须保留，避免 POI 名（…店）把省市丢掉
  if (hasAdminRegion(address) && !hasAdminRegion(name)) {
    return `${name} ${address}`;
  }
  if (hasAdminRegion(name) && !hasAdminRegion(address)) {
    return name;
  }

  const nameVague = isVagueAddress(name);
  const addressVague = isVagueAddress(address);

  if (!nameVague && addressVague) return name;
  if (nameVague && !addressVague) return address;

  return `${name} ${address}`;
}

function getLocationDisplayLines(res) {
  const { name, address } = normalizeLocationParts(res);
  const fullAddress = formatLocationAddress(res);
  const subtitle = name && address && name !== address && !fullAddress.includes(name)
    ? name
    : (address && fullAddress !== address ? address : '');

  return {
    fullAddress,
    locationName: name,
    addressRegion: address,
    subtitle: subtitle && subtitle !== fullAddress ? subtitle : ''
  };
}

function isValidLocationResult(res) {
  const lat = parseFloat(res && res.latitude);
  const lng = parseFloat(res && res.longitude);
  const fullAddress = formatLocationAddress(res);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !fullAddress) return false;
  return !isVagueAddress(fullAddress);
}

function getLocationValidationMessage(res) {
  if (!res) return '请选择营业地址';
  const lat = parseFloat(res.latitude);
  const lng = parseFloat(res.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '请通过地图选择营业地址';
  const fullAddress = formatLocationAddress(res);
  if (!fullAddress) return '请选择营业地址';
  if (isVagueAddress(fullAddress)) {
    return '地址不够详细，请在地图中搜索并选择具体门店或建筑';
  }
  return '';
}

function getPickupLocationValidationMessage(res) {
  if (!res) return '请在地图选择接送地址';
  const lat = parseFloat(res.latitude);
  const lng = parseFloat(res.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '请在地图选择接送地址';
  const fullAddress = formatLocationAddress(res);
  if (!fullAddress) return '请在地图选择接送地址';
  if (isVagueAddress(fullAddress)) {
    return '地址不够详细，请在地图中搜索并选择具体地点';
  }
  return '';
}

module.exports = {
  chooseStoreLocation,
  choosePickupLocation,
  formatLocationAddress,
  getLocationDisplayLines,
  hasAdminRegion,
  isVagueAddress,
  isValidLocationResult,
  getLocationValidationMessage,
  getPickupLocationValidationMessage
};
