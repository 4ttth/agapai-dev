import * as Haptics from 'expo-haptics';

import {
  hapticsEnabled,
  press,
  setHapticsEnabled,
  signatureBuzz,
  success,
  tap,
} from '@/utils/haptics';

const impact = Haptics.impactAsync as jest.Mock;
const notify = Haptics.notificationAsync as jest.Mock;

describe('haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    setHapticsEnabled(true);
  });

  it('is enabled by default (off web)', () => {
    expect(hapticsEnabled()).toBe(true);
  });

  it('fires a light impact for a tap', () => {
    tap();
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('fires a medium impact for a press', () => {
    press();
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('fires a success notification for success()', () => {
    success();
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('does nothing when disabled', () => {
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    tap();
    press();
    success();
    signatureBuzz();
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('plays the three-beat signature pattern over time', () => {
    jest.useFakeTimers();
    signatureBuzz();
    // First beat fires immediately.
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Light);
    // Remaining beats are scheduled; advancing timers plays them in order.
    jest.advanceTimersByTime(500);
    expect(impact).toHaveBeenCalledTimes(3);
    expect(impact).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Light);
    expect(impact).toHaveBeenNthCalledWith(3, Haptics.ImpactFeedbackStyle.Medium);
  });

  it('cancels an in-flight pattern when a new one starts', () => {
    jest.useFakeTimers();
    signatureBuzz(); // schedules beats 2 & 3
    jest.clearAllMocks();
    signatureBuzz(); // should cancel the stale timers, then fire its own beat 1
    expect(impact).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(500);
    // Only the second invocation's three beats play — no doubled-up buzzes.
    expect(impact).toHaveBeenCalledTimes(3);
  });
});
