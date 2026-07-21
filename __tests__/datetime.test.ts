import {
  defaultTimesForFrequency,
  formatTimeLabel,
  isScheduleActiveOn,
  parseTimeOfDay,
  toDateString,
} from '@/utils/datetime';

describe('parseTimeOfDay', () => {
  it('parses valid 24h times', () => {
    expect(parseTimeOfDay('08:30')).toEqual({ hours: 8, minutes: 30 });
    expect(parseTimeOfDay('23:59')).toEqual({ hours: 23, minutes: 59 });
  });

  it('returns null for invalid times', () => {
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('8:00')).toBeNull();
    expect(parseTimeOfDay('bad')).toBeNull();
  });
});

describe('formatTimeLabel', () => {
  it('formats to a friendly 12-hour label', () => {
    expect(formatTimeLabel('08:00')).toBe('8:00 AM');
    expect(formatTimeLabel('13:05')).toBe('1:05 PM');
    expect(formatTimeLabel('00:00')).toBe('12:00 AM');
  });
});

describe('toDateString', () => {
  it('zero-pads month and day', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('isScheduleActiveOn', () => {
  it('respects start and end bounds inclusively', () => {
    const schedule = { startDate: '2026-07-01', endDate: '2026-07-31' };
    expect(isScheduleActiveOn(schedule, '2026-07-01')).toBe(true);
    expect(isScheduleActiveOn(schedule, '2026-07-31')).toBe(true);
    expect(isScheduleActiveOn(schedule, '2026-06-30')).toBe(false);
    expect(isScheduleActiveOn(schedule, '2026-08-01')).toBe(false);
  });
});

describe('defaultTimesForFrequency', () => {
  it('maps presets to sensible default times', () => {
    expect(defaultTimesForFrequency.once_daily).toEqual(['08:00']);
    expect(defaultTimesForFrequency.twice_daily).toHaveLength(2);
    expect(defaultTimesForFrequency.three_times_daily).toHaveLength(3);
  });
});
