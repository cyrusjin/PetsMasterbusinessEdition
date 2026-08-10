Component({
  properties: {
    startDate: { type: String, value: '' },
    endDate: { type: String, value: '' },
    minDate: { type: String, value: '' }
  },
  data: { year: 2026, month: 6, cells: [], _s: null, _e: null, _minDate: '' },
  lifetimes: {
    attached() {
      const d = new Date();
      this.setData({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        _minDate: this.properties.minDate || this._getTodayStr()
      });
      this._render();
    }
  },
  observers: {
    'startDate,endDate,minDate'(s, e, minDate) {
      this.setData({
        _s: s || null,
        _e: e || null,
        _minDate: minDate || this._getTodayStr()
      });
      this._render();
    }
  },
  methods: {
    _getTodayStr() {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    },
    _render() {
      const { year, month, _s, _e, _minDate } = this.data;
      const todayStr = this._getTodayStr();
      const minDate = _minDate || todayStr;
      const firstDay = new Date(year, month - 1, 1);
      const startDow = firstDay.getDay();
      const dim = new Date(year, month, 0).getDate();
      const prevDim = new Date(year, month - 1, 0).getDate();
      const cells = [];
      for (let i = startDow - 1; i >= 0; i--) {
        const d = prevDim - i;
        const m = month === 1 ? 12 : month - 1;
        const y = month === 1 ? year - 1 : year;
        const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({ day: d, dateStr: ds, cls: 'other disabled', disabled: true });
      }
      for (let d = 1; d <= dim; d++) {
        const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        let cls = '';
        const disabled = ds < minDate;
        if (disabled) cls += ' disabled';
        if (ds === todayStr) cls += ' today';
        if (_s && _e) {
          if (ds === _s) cls += ' start';
          if (ds === _e) cls += ' end';
          if (ds > _s && ds < _e) cls += ' in-range';
        } else if (_s && ds === _s) cls += ' start';
        const isSameDay = !!(_s && _e && _s === _e && ds === _s);
        cells.push({
          day: d,
          dateStr: ds,
          cls: cls.trim(),
          isStart: _s === ds && !isSameDay,
          isEnd: _e === ds && !isSameDay,
          isSameDay,
          disabled
        });
      }
      const rem = 7 - (cells.length % 7);
      if (rem < 7) {
        for (let d = 1; d <= rem; d++) {
          const m = month === 12 ? 1 : month + 1;
          const y = month === 12 ? year + 1 : year;
          const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const disabled = ds < minDate;
          cells.push({
            day: d,
            dateStr: ds,
            cls: `other${disabled ? ' disabled' : ''}`.trim(),
            disabled
          });
        }
      }
      this.setData({ cells });
    },
    onTap(e) {
      const ds = e.currentTarget.dataset.date;
      const cell = this.data.cells.find((c) => c.dateStr === ds);
      if (!cell || cell.disabled) return;
      let { _s, _e, year, month } = this.data;
      if (!_s || (_s && _e)) { _s = ds; _e = null; }
      else {
        // 再次点同一天：确认当日寄养（开始=结束）
        if (ds < _s) { _e = _s; _s = ds; }
        else _e = ds;
      }
      const [yStr, mStr] = ds.split('-');
      const tapYear = parseInt(yStr, 10);
      const tapMonth = parseInt(mStr, 10);
      const updates = { _s, _e };
      if (tapYear !== year || tapMonth !== month) {
        updates.year = tapYear;
        updates.month = tapMonth;
      }
      this.setData(updates);
      this._render();
      if (_s && _e) this.triggerEvent('dateselect', { startDate: _s, endDate: _e });
    },
    onPrev() {
      const { year, month } = this.data;
      const nextYear = month === 1 ? year - 1 : year;
      const nextMonth = month === 1 ? 12 : month - 1;
      const minDate = this.data._minDate || this._getTodayStr();
      const lastDayOfPrevMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(new Date(nextYear, nextMonth, 0).getDate()).padStart(2, '0')}`;
      if (lastDayOfPrevMonth < minDate) return;
      this.setData({ year: nextYear, month: nextMonth });
      this._render();
    },
    onNext() {
      let { year, month } = this.data;
      if (month === 12) this.setData({ year: year + 1, month: 1 });
      else this.setData({ month: month + 1 });
      this._render();
    }
  }
});