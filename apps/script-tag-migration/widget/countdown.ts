export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/**
 * Time left until `endsAtMs`, rounded up to whole seconds so the display never reads
 * zero while time remains. Returns `'ended'` at exactly zero and after.
 */
export function remaining(endsAtMs: number, nowMs: number): CountdownParts | 'ended' {
  const diffMs = endsAtMs - nowMs;
  if (!(diffMs > 0)) return 'ended';

  const total = Math.ceil(diffMs / MS_PER_SECOND);
  return {
    days: Math.floor(total / SECONDS_PER_DAY),
    hours: Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR),
    minutes: Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: total % SECONDS_PER_MINUTE
  };
}

/** Compact text such as `1d 2h 3m 4s`; the days unit is omitted when zero. */
export function formatCountdown(parts: CountdownParts): string {
  const units = [
    parts.days > 0 ? `${parts.days}d` : null,
    `${parts.hours}h`,
    `${parts.minutes}m`,
    `${parts.seconds}s`
  ];
  return units.filter((unit) => unit !== null).join(' ');
}
