import type { RawSettings, SettingName } from './settings';
import { ENDED_BEHAVIOR, SETTING } from './settings';

export type EndedConfig =
  | { behavior: typeof ENDED_BEHAVIOR.hide }
  | { behavior: typeof ENDED_BEHAVIOR.message; message: string };

export interface BarConfig {
  message: string;
  linkUrl?: string;
  /** Epoch milliseconds, always a whole number of seconds. */
  endsAtMs?: number;
  ended: EndedConfig;
  dismissible: boolean;
  backgroundColor?: string;
  textColor?: string;
}

export interface ConfigWarning {
  setting: SettingName;
  reason: string;
}

export interface ParseResult {
  /** `null` when there is nothing to render (empty message). */
  config: BarConfig | null;
  warnings: ConfigWarning[];
}

interface Parsed<T> {
  value: T;
  warning?: ConfigWarning;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const EPOCH_SECONDS = /^\d+$/;
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const WHITESPACE_OR_CONTROL = /[\p{White_Space}\p{Cc}]/u;
const SENTINEL_ORIGIN = 'https://x.invalid';
const MAX_DATE_MS = 8.64e15;

/** Drops sub-second precision. Every end time in a `BarConfig` is a whole number of seconds. */
export function toEpochSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

function invalid<T>(value: T, setting: SettingName, reason: string): Parsed<T> {
  return { value, warning: { setting, reason } };
}

/** Trim; empty means `fallback`; otherwise `validate` returns the value, or `undefined` when invalid. */
function parseSetting<T>(
  raw: RawSettings,
  setting: SettingName,
  fallback: T,
  reason: string,
  validate: (text: string) => T | undefined
): Parsed<T> {
  const text = (raw[setting] ?? '').trim();
  if (text === '') return { value: fallback };
  const value = validate(text);
  return value === undefined ? invalid(fallback, setting, reason) : { value };
}

function isSiteRelative(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return false;
  try {
    return new URL(url, SENTINEL_ORIGIN).origin === SENTINEL_ORIGIN;
  } catch {
    return false;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function validateLinkUrl(url: string): string | undefined {
  if (WHITESPACE_OR_CONTROL.test(url)) return undefined;
  return isSiteRelative(url) || isHttpUrl(url) ? url : undefined;
}

function isRealDateTime(match: RegExpExecArray): boolean {
  const part = (index: number): number => Number(match[index] ?? 0);
  const [year, month, day] = [part(1), part(2), part(3)];
  if (part(4) > 23 || part(5) > 59 || part(6) > 59) return false;
  if (part(7) > 23 || part(8) > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function parseIsoMs(text: string): number {
  const match = ISO_DATE_TIME.exec(text);
  if (!match || !isRealDateTime(match)) return Number.NaN;
  return Date.parse(text);
}

function validateEndsAt(text: string): number | undefined {
  const ms = EPOCH_SECONDS.test(text) ? Number(text) * 1000 : parseIsoMs(text);
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return undefined;
  return toEpochSeconds(ms) * 1000;
}

function parseEnded(raw: RawSettings): Parsed<EndedConfig> {
  const hide: EndedConfig = { behavior: ENDED_BEHAVIOR.hide };
  const behavior = parseSetting<string>(
    raw,
    SETTING.endedBehavior,
    ENDED_BEHAVIOR.hide,
    'must be "hide" or "message"',
    (text) => (text === ENDED_BEHAVIOR.hide || text === ENDED_BEHAVIOR.message ? text : undefined)
  );
  if (behavior.warning) return { value: hide, warning: behavior.warning };
  if (behavior.value === ENDED_BEHAVIOR.hide) return { value: hide };

  const message = (raw[SETTING.endedMessage] ?? '').trim();
  if (message === '') {
    return invalid(hide, SETTING.endedMessage, 'is required when ended behavior is "message"');
  }
  return { value: { behavior: ENDED_BEHAVIOR.message, message } };
}

function parseDismissible(raw: RawSettings): Parsed<boolean> {
  return parseSetting(raw, SETTING.dismissible, false, 'must be true, false, 1 or 0', (text) => {
    const lower = text.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
    return undefined;
  });
}

function parseColor(raw: RawSettings, setting: SettingName): Parsed<string | undefined> {
  return parseSetting<string | undefined>(
    raw,
    setting,
    undefined,
    'must be a #rgb or #rrggbb color',
    (text) => (HEX_COLOR.test(text) ? text : undefined)
  );
}

/**
 * Validates raw string settings (from a query string or Liquid-rendered data attributes).
 * Never throws. Each invalid setting yields exactly one warning and falls back to its default.
 */
export function parseConfig(raw: RawSettings): ParseResult {
  const linkUrl = parseSetting<string | undefined>(
    raw,
    SETTING.linkUrl,
    undefined,
    'must be an http(s) URL or a site-relative path',
    validateLinkUrl
  );
  const endsAt = parseSetting<number | undefined>(
    raw,
    SETTING.endsAt,
    undefined,
    'must be epoch seconds or an ISO 8601 date-time ending in Z or a +HH:MM offset',
    validateEndsAt
  );
  const ended = parseEnded(raw);
  const dismissible = parseDismissible(raw);
  const backgroundColor = parseColor(raw, SETTING.backgroundColor);
  const textColor = parseColor(raw, SETTING.textColor);

  const warnings = [
    linkUrl.warning,
    endsAt.warning,
    ended.warning,
    dismissible.warning,
    backgroundColor.warning,
    textColor.warning
  ].filter((warning): warning is ConfigWarning => warning !== undefined);

  const message = (raw[SETTING.message] ?? '').trim();
  if (message === '') return { config: null, warnings };

  const config: BarConfig = { message, ended: ended.value, dismissible: dismissible.value };
  if (linkUrl.value !== undefined) config.linkUrl = linkUrl.value;
  if (endsAt.value !== undefined) config.endsAtMs = endsAt.value;
  if (backgroundColor.value !== undefined) config.backgroundColor = backgroundColor.value;
  if (textColor.value !== undefined) config.textColor = textColor.value;
  return { config, warnings };
}

/** The exact inverse of `parseConfig`: raw settings that parse back to `config`. Unset settings are omitted. */
export function toRawSettings(config: BarConfig): RawSettings {
  const raw: RawSettings = {
    [SETTING.message]: config.message,
    [SETTING.endedBehavior]: config.ended.behavior,
    [SETTING.dismissible]: String(config.dismissible)
  };
  if (config.linkUrl !== undefined) raw[SETTING.linkUrl] = config.linkUrl;
  if (config.endsAtMs !== undefined) raw[SETTING.endsAt] = String(toEpochSeconds(config.endsAtMs));
  if (config.ended.behavior === ENDED_BEHAVIOR.message) {
    raw[SETTING.endedMessage] = config.ended.message;
  }
  if (config.backgroundColor !== undefined) raw[SETTING.backgroundColor] = config.backgroundColor;
  if (config.textColor !== undefined) raw[SETTING.textColor] = config.textColor;
  return raw;
}
