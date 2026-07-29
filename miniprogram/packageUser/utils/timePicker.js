function pad(num) {
  return String(num).padStart(2, '0');
}

const HOURS = Array.from({ length: 24 }, (_, index) => pad(index));
const MINUTES = Array.from({ length: 60 }, (_, index) => pad(index));

function parseTime(timeStr, fallback = '10:00') {
  const parts = String(timeStr || fallback).split(':');
  const hour = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const minute = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return { hour, minute };
}

function formatTime(hour, minute) {
  return `${pad(hour)}:${pad(minute)}`;
}

function buildPickerState(timeStr, fallback = '10:00') {
  const { hour, minute } = parseTime(timeStr, fallback);
  return {
    hours: HOURS,
    minutes: MINUTES,
    timePickerValue: [hour, minute]
  };
}

function valueToTimeString(hours, minutes, pickerValue) {
  const hour = hours[pickerValue[0]] || '00';
  const minute = minutes[pickerValue[1]] || '00';
  return `${hour}:${minute}`;
}

module.exports = {
  HOURS,
  MINUTES,
  parseTime,
  formatTime,
  buildPickerState,
  valueToTimeString
};
