import type { BarConfig } from '../widget/config';
import { formatCountdown, remaining } from '../widget/countdown';
import { ENDED_BEHAVIOR } from '../widget/settings';

export const NOW_MS = Date.UTC(2030, 0, 1, 12, 0, 0);
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export const MESSAGE = 'Test campaign';
export const ENDED_MESSAGE = 'Test campaign ended';

/** A dismissible bar with no end time; each scenario overrides what it exercises. */
export function barConfig(overrides: Partial<BarConfig> = {}): BarConfig {
  return {
    message: MESSAGE,
    ended: { behavior: ENDED_BEHAVIOR.hide },
    dismissible: true,
    ...overrides
  };
}

/** A bar whose end time is `ms` after the page's fixed starting time; negative values are in the past. */
export function barEndingAfter(ms: number, overrides: Partial<BarConfig> = {}): BarConfig {
  return barConfig({ endsAtMs: NOW_MS + ms, ...overrides });
}

/** A bar that swaps to `ENDED_MESSAGE` when its end time passes. */
export function barEndingWithMessage(ms: number): BarConfig {
  return barEndingAfter(ms, {
    ended: { behavior: ENDED_BEHAVIOR.message, message: ENDED_MESSAGE }
  });
}

/** The countdown text for a bar ending `endsAfterMs` after the starting time, once `elapsedMs` has passed. */
export function countdownText(endsAfterMs: number, elapsedMs: number): string {
  const left = remaining(NOW_MS + endsAfterMs, NOW_MS + elapsedMs);
  if (left === 'ended') throw new Error('The countdown has ended');
  return formatCountdown(left);
}
