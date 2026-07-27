function pad(num) {
  return String(num).padStart(2, '0');
}

function getTodayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  };
}

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  const date = new Date(String(dateStr).replace(/-/g, '/'));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function clampToMaxDate(year, month, day, maxDate) {
  const max = maxDate || getTodayParts();
  if (year > max.year) return { year: max.year, month: max.month, day: max.day };
  if (year < max.year) return { year, month, day };
  if (month > max.month) return { year, month: max.month, day: max.day };
  if (month < max.month) return { year, month, day };
  if (day > max.day) return { year, month, day: max.day };
  return { year, month, day };
}

function clampDateString(dateStr, maxDate) {
  const max = maxDate || getTodayParts();
  const parsed = parseDate(dateStr);
  const clamped = clampToMaxDate(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
    max
  );
  return `${clamped.year}-${pad(clamped.month)}-${pad(clamped.day)}`;
}

function buildYearRange(maxYear, span = 20) {
  const years = [];
  const minYear = maxYear - span;
  for (let year = maxYear; year >= minYear; year -= 1) {
    years.push(String(year));
  }
  return years;
}

function buildMonthRange(year, maxDate) {
  const max = maxDate || getTodayParts();
  const total = year === max.year ? max.month : 12;
  return Array.from({ length: total }, (_, index) => pad(index + 1));
}

function buildDayRange(year, month, maxDate) {
  const max = maxDate || getTodayParts();
  let total = new Date(year, month, 0).getDate();
  if (year === max.year && month === max.month) {
    total = Math.min(total, max.day);
  }
  return Array.from({ length: total }, (_, index) => pad(index + 1));
}

function buildPickerState(dateStr, maxDate) {
  const max = maxDate || getTodayParts();
  const parsed = parseDate(dateStr);
  const clamped = clampToMaxDate(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
    max
  );
  const { year, month, day } = clamped;
  const years = buildYearRange(max.year);
  const months = buildMonthRange(year, max);
  const days = buildDayRange(year, month, max);
  const yearIndex = Math.max(0, years.indexOf(String(year)));
  const monthIndex = Math.min(month - 1, months.length - 1);
  const dayIndex = Math.min(day - 1, days.length - 1);

  return {
    years,
    months,
    days,
    datePickerValue: [yearIndex, monthIndex, dayIndex],
    maxDate: max
  };
}

function refreshPickerData(years, value, maxDate) {
  const max = maxDate || getTodayParts();
  const year = parseInt(years[value[0]], 10);
  const months = buildMonthRange(year, max);
  const monthIndex = Math.min(value[1], months.length - 1);
  const month = parseInt(months[monthIndex], 10);
  const days = buildDayRange(year, month, max);
  const dayIndex = Math.min(value[2], days.length - 1);

  return {
    months,
    days,
    datePickerValue: [value[0], monthIndex, dayIndex]
  };
}

function valueToDateString(years, months, days, value, maxDate) {
  const year = years[value[0]];
  const month = months[value[1]];
  const day = days[value[2]] || days[days.length - 1];
  return clampDateString(`${year}-${month}-${day}`, maxDate);
}

module.exports = {
  getTodayParts,
  formatDateValue,
  clampDateString,
  buildPickerState,
  refreshPickerData,
  valueToDateString
};
