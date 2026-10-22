const MS_PER_DAY = 86_400_000;

/** The calendar date (`YYYY-MM-DD`) of an instant in the given IANA time zone. Throws a RangeError for an unknown zone. */
export function shopDate(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Moves a `YYYY-MM-DD` date by a whole number of days, independent of the machine's time zone. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}
