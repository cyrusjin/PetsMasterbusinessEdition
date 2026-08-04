const app = getApp();
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');
const {
  fetchRestDayCalendar,
  resolveHolidayYear,
  getAvailableHolidayYears,
  getFallbackRestDayGroups,
  normalizeHolidayPricing,
  getDefaultHolidayPricing,
  mergeRestDayGroups,
  collectCustomDaysFromGroups,
  collectRemovedDaysFromGroups,
  formatDateLabel
} = require('../../utils/legalHolidays');

function withGroupFlags(group) {
  const days = group.days || [];
  const allChecked = days.length > 0 && days.every((day) => !!day.checked);
  return {
    ...group,
    days,
    allChecked
  };
}

function buildGroups(baseGroups, year, holidayPricing) {
  const pricing = normalizeHolidayPricing(holidayPricing || getDefaultHolidayPricing());
  const map = pricing.amounts || {};
  return mergeRestDayGroups(
    baseGroups,
    pricing.customDays,
    year,
    pricing.removedDays
  ).map((group) => withGroupFlags({
    ...group,
    days: (group.days || []).map((day) => {
      const amount = map[day.date];
      const checked = amount != null && amount !== '' && parseFloat(amount) > 0;
      return {
        ...day,
        checked,
        amountText: checked ? String(amount) : ''
      };
    })
  }));
}

function collectAmounts(groups) {
  const amounts = {};
  (groups || []).forEach((group) => {
    (group.days || []).forEach((day) => {
      if (!day.checked) return;
      const n = parseFloat(day.amountText);
      if (!Number.isFinite(n) || n <= 0) return;
      amounts[day.date] = Math.round(n * 100) / 100;
    });
  });
  return amounts;
}

function isValidDateStr(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = String(value).split('-').map((n) => parseInt(n, 10));
  return d.getFullYear() === y && (d.getMonth() + 1) === m && d.getDate() === day;
}

Page({
  data: {
    year: new Date().getFullYear(),
    yearOptions: [],
    yearIndex: 0,
    groups: [],
    baseGroups: [],
    sourceText: '',
    loading: false,
    saving: false,
    addDateVisible: false,
    addDateGroupIndex: -1,
    addDateValue: '',
    addDateStart: '',
    addDateEnd: '',
    batchSetVisible: false,
    batchSetGroupIndex: -1,
    batchSetGroupName: '',
    batchSetAmount: ''
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    this._load();
  },

  _readHolidayPricing() {
    const shop = (app.getShop && app.getShop()) || {};
    const rules = {
      ...(app.getBillingRules ? app.getBillingRules() : {}),
      ...(shop.billingRules || {})
    };
    return normalizeHolidayPricing(rules.holidayPricing || getDefaultHolidayPricing());
  },

  _load() {
    const reqId = (this._loadReqId = (this._loadReqId || 0) + 1);
    const preferredYear = this.data.year;
    this.setData({ loading: true });
    fetchRestDayCalendar(preferredYear)
      .then((res) => {
        if (reqId !== this._loadReqId || this.data.year !== preferredYear) return;
        const years = (res && res.years && res.years.length)
          ? res.years
          : getAvailableHolidayYears();
        const year = resolveHolidayYear((res && res.year) || preferredYear, years);
        const yearIndex = Math.max(0, years.indexOf(year));
        const baseGroups = (res && res.groups) || [];
        const holidayPricing = this._readHolidayPricing();
        const source = (res && res.source) || '';
        const sourceText = source === 'timor' || source === 'api'
          ? '休息日来自官方放假安排（服务端已缓存）'
          : '休息日按国务院放假安排（本地兜底）';
        this.setData({
          loading: false,
          year,
          yearOptions: years,
          yearIndex,
          baseGroups,
          sourceText,
          groups: buildGroups(baseGroups, year, holidayPricing)
        });
      })
      .catch(() => {
        if (reqId !== this._loadReqId || this.data.year !== preferredYear) return;
        const years = getAvailableHolidayYears();
        const year = resolveHolidayYear(preferredYear, years);
        const holidayPricing = this._readHolidayPricing();
        const baseGroups = getFallbackRestDayGroups(year);
        this.setData({
          loading: false,
          year,
          yearOptions: years,
          yearIndex: Math.max(0, years.indexOf(year)),
          baseGroups,
          sourceText: '休息日按国务院放假安排（本地数据）',
          groups: buildGroups(baseGroups, year, holidayPricing)
        });
      });
  },

  onYearChange(e) {
    const index = Number(e.detail.value);
    const year = this.data.yearOptions[index];
    if (!year || year === this.data.year) return;
    // 允许覆盖进行中的加载，避免切年请求被 loading 挡掉
    this.setData({ year, yearIndex: index, loading: false }, () => this._load());
  },

  _setGroupDays(groupIndex, days) {
    const group = this.data.groups[groupIndex];
    if (!group) return;
    const next = withGroupFlags({ ...group, days });
    this.setData({
      [`groups[${groupIndex}].days`]: next.days,
      [`groups[${groupIndex}].allChecked`]: next.allChecked
    });
  },

  onToggleDay(e) {
    const { groupIndex, dayIndex } = e.currentTarget.dataset;
    const group = this.data.groups[groupIndex];
    if (!group || !group.days || !group.days[dayIndex]) return;
    const days = group.days.slice();
    const day = { ...days[dayIndex] };
    day.checked = !day.checked;
    if (!day.checked) day.amountText = '';
    days[dayIndex] = day;
    this._setGroupDays(groupIndex, days);
  },

  onAmountInput(e) {
    const { groupIndex, dayIndex } = e.currentTarget.dataset;
    const group = this.data.groups[groupIndex];
    if (!group || !group.days || !group.days[dayIndex]) return;
    const value = e.detail.value;
    const n = parseFloat(value);
    const days = group.days.slice();
    days[dayIndex] = {
      ...days[dayIndex],
      amountText: value,
      checked: Number.isFinite(n) && n > 0
    };
    this._setGroupDays(groupIndex, days);
  },

  onToggleSelectAll(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const group = this.data.groups[groupIndex];
    if (!group || !(group.days || []).length) return;
    const nextChecked = !group.allChecked;
    const days = group.days.map((day) => ({
      ...day,
      checked: nextChecked,
      amountText: nextChecked ? day.amountText : ''
    }));
    this._setGroupDays(groupIndex, days);
  },

  onOpenBatchSet(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const group = this.data.groups[groupIndex];
    if (!group || !(group.days || []).length) {
      wx.showToast({ title: '请先添加日期', icon: 'none' });
      return;
    }
    const firstChecked = (group.days || []).find((day) => day.checked && parseFloat(day.amountText) > 0);
    this.setData({
      batchSetVisible: true,
      batchSetGroupIndex: groupIndex,
      batchSetGroupName: group.name || '',
      batchSetAmount: firstChecked ? String(firstChecked.amountText) : ''
    });
  },

  onBatchSetAmountInput(e) {
    this.setData({ batchSetAmount: e.detail.value });
  },

  onCancelBatchSet() {
    this.setData({
      batchSetVisible: false,
      batchSetGroupIndex: -1,
      batchSetGroupName: '',
      batchSetAmount: ''
    });
  },

  onConfirmBatchSet() {
    const groupIndex = this.data.batchSetGroupIndex;
    const group = this.data.groups[groupIndex];
    if (groupIndex < 0 || !group) {
      this.onCancelBatchSet();
      return;
    }
    const n = parseFloat(this.data.batchSetAmount);
    if (!Number.isFinite(n) || n <= 0) {
      wx.showToast({ title: '请输入大于 0 的金额', icon: 'none' });
      return;
    }
    const amountText = String(Math.round(n * 100) / 100);
    const days = (group.days || []).map((day) => ({
      ...day,
      checked: true,
      amountText
    }));
    this._setGroupDays(groupIndex, days);
    this.onCancelBatchSet();
  },

  onOpenAddDate(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const year = this.data.year;
    this.setData({
      addDateVisible: true,
      addDateGroupIndex: groupIndex,
      addDateValue: `${year}-01-01`,
      addDateStart: `${year}-01-01`,
      addDateEnd: `${year}-12-31`
    });
  },

  onAddDatePick(e) {
    this.setData({ addDateValue: e.detail.value });
  },

  onCancelAddDate() {
    this.setData({
      addDateVisible: false,
      addDateGroupIndex: -1,
      addDateValue: ''
    });
  },

  onConfirmAddDate() {
    const groupIndex = this.data.addDateGroupIndex;
    const date = this.data.addDateValue;
    if (groupIndex < 0 || !this.data.groups[groupIndex]) {
      this.onCancelAddDate();
      return;
    }
    if (!isValidDateStr(date)) {
      wx.showToast({ title: '请选择有效日期', icon: 'none' });
      return;
    }
    if (String(date).slice(0, 4) !== String(this.data.year)) {
      wx.showToast({ title: '请选择当前年份日期', icon: 'none' });
      return;
    }
    const group = this.data.groups[groupIndex];
    if ((group.days || []).some((day) => day.date === date)) {
      wx.showToast({ title: '该日期已存在', icon: 'none' });
      return;
    }
    const baseGroup = (this.data.baseGroups || []).find((item) => item.id === group.id);
    const officialDay = ((baseGroup && baseGroup.days) || []).find((day) => day.date === date);
    const days = (group.days || []).slice();
    days.push({
      date,
      label: formatDateLabel(date),
      dayName: (officialDay && (officialDay.dayName || officialDay.name)) || '自定义',
      custom: !officialDay,
      checked: false,
      amountText: ''
    });
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    this._setGroupDays(groupIndex, days);
    this.setData({
      addDateVisible: false,
      addDateGroupIndex: -1,
      addDateValue: ''
    });
  },

  onRemoveDay(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const dayIndex = Number(e.currentTarget.dataset.dayIndex);
    const group = this.data.groups[groupIndex];
    if (!group || !group.days || !group.days[dayIndex]) return;
    const days = group.days.slice();
    days.splice(dayIndex, 1);
    this._setGroupDays(groupIndex, days);
  },

  _mergeYearDateMap(existingMap, yearMap, year) {
    const merged = { ...(existingMap || {}) };
    Object.keys(merged).forEach((festivalId) => {
      const kept = (merged[festivalId] || []).filter(
        (date) => String(date).slice(0, 4) !== String(year)
      );
      if (kept.length) merged[festivalId] = kept;
      else delete merged[festivalId];
    });
    Object.keys(yearMap || {}).forEach((festivalId) => {
      const prev = merged[festivalId] || [];
      merged[festivalId] = prev.concat(yearMap[festivalId]);
    });
    return merged;
  },

  onSave() {
    if (this.data.saving) return;
    const amounts = collectAmounts(this.data.groups);
    const customDays = collectCustomDaysFromGroups(this.data.groups);
    const removedDays = collectRemovedDaysFromGroups(
      this.data.baseGroups,
      this.data.groups,
      this.data.year
    );
    const existing = this._readHolidayPricing();
    // 保留其他年份的自定义 / 已删除日期
    const mergedCustomDays = this._mergeYearDateMap(
      existing.customDays,
      customDays,
      this.data.year
    );
    const mergedRemovedDays = this._mergeYearDateMap(
      existing.removedDays,
      removedDays,
      this.data.year
    );

    // 保留其他年份已设置的加价金额
    const mergedAmounts = { ...(existing.amounts || {}) };
    Object.keys(mergedAmounts).forEach((date) => {
      if (String(date).slice(0, 4) === String(this.data.year)) {
        delete mergedAmounts[date];
      }
    });
    Object.keys(amounts).forEach((date) => {
      mergedAmounts[date] = amounts[date];
    });

    const holidayPricing = normalizeHolidayPricing({
      amounts: mergedAmounts,
      customDays: mergedCustomDays,
      removedDays: mergedRemovedDays
    });
    const invalid = (this.data.groups || []).some((group) =>
      (group.days || []).some((day) => day.checked && !(parseFloat(day.amountText) > 0))
    );
    if (invalid) {
      wx.showToast({ title: '已勾选日期请填写加价金额', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    const ensureStore = app.ensureMerchantStore
      ? app.ensureMerchantStore()
      : Promise.resolve((app.getShop && app.getShop()) || {});

    ensureStore
      .then((shop) => {
        const current = shop || (app.getShop && app.getShop()) || {};
        const billingRules = {
          ...(app.getBillingRules ? app.getBillingRules() : {}),
          ...(current.billingRules || {}),
          holidayPricing
        };
        const nextShop = {
          ...current,
          billingRules
        };
        return app.syncShopToCloud(nextShop).then((saved) => {
          if (app.saveBillingRules) {
            app.saveBillingRules(billingRules);
          }
          return saved;
        });
      })
      .then(() => {
        wx.hideLoading();
        this.setData({
          saving: false,
          groups: buildGroups(this.data.baseGroups, this.data.year, holidayPricing)
        });
        wx.showToast({ title: '保存成功', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ saving: false });
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none',
          duration: 2500
        });
      });
  }
});
