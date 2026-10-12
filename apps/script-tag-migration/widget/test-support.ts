import type { BarConfig } from './config';
import { ENDED_BEHAVIOR } from './settings';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const MINIMAL_CONFIG: BarConfig = {
  message: 'Sale',
  ended: { behavior: ENDED_BEHAVIOR.hide },
  dismissible: false
};

/** A `Storage` whose every access throws, like a browser with storage blocked. */
export function blockedStorage(): Storage {
  const fail = (): never => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { getItem: fail, setItem: fail } as unknown as Storage;
}
