import type { EndedBehavior, SettingName } from './settings';
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

export type RawSettings = Record<string, string | undefined>;

interface Parsed<T> {
  value: T;
  warning?: ConfigWarning;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const EPOCH_SECONDS = /^\d+$/;
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const MAX_DATE_MS = 8.64e15;

function readTrimmed(raw: RawSettings, setting: SettingName): string {
  return (raw[setting] ?? '').trim();
}

function invalid<T>(value: T, setting: SettingName, reason: string): Parsed<T> {
  return { value, warning: { setting, reason } };
}

function isStorableMs(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS;
}

function toWholeSecondsMs(ms: number): number {
  return Math.floor(ms / 1000) * 1000;
}

function isSiteRelative(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function parseLinkUrl(raw: RawSettings): Parsed<string | undefined> {
  const url = readTrimmed(raw, SETTING.linkUrl);
  if (url === '') return { value: undefined };
  if (isSiteRelative(url) || isHttpUrl(url)) return { value: url };
  return invalid(undefined, SETTING.linkUrl, 'must be an http(s) URL or a site-relative path');
}

function parseEndsAtMs(text: string): number {
  if (EPOCH_SECONDS.test(text)) return Number(text) * 1000;
  if (ISO_WITH_OFFSET.test(text)) return Date.parse(text);
  return Number.NaN;
}

function parseEndsAt(raw: RawSettings): Parsed<number | undefined> {
  const text = readTrimmed(raw, SETTING.endsAt);
  if (text === '') return { value: undefined };

  const ms = parseEndsAtMs(text);
  if (!isStorableMs(ms)) {
    return invalid(
      undefined,
      SETTING.endsAt,
      'must be epoch seconds or ISO 8601 with an explicit offset'
    );
  }
  return { value: toWholeSecondsMs(ms) };
}

function parseEndedBehavior(raw: RawSettings): Parsed<EndedBehavior> {
  const text = readTrimmed(raw, SETTING.endedBehavior);
  if (text === '') return { value: ENDED_BEHAVIOR.hide };
  if (text === ENDED_BEHAVIOR.hide || text === ENDED_BEHAVIOR.message) return { value: text };
  return invalid(ENDED_BEHAVIOR.hide, SETTING.endedBehavior, 'must be "hide" or "message"');
}

function parseEnded(raw: RawSettings): { ended: EndedConfig; warnings: ConfigWarning[] } {
  const behavior = parseEndedBehavior(raw);
  const warnings = behavior.warning ? [behavior.warning] : [];
  if (behavior.value === ENDED_BEHAVIOR.hide) {
    return { ended: { behavior: ENDED_BEHAVIOR.hide }, warnings };
  }

  const message = readTrimmed(raw, SETTING.endedMessage);
  if (message === '') {
    warnings.push({
      setting: SETTING.endedMessage,
      reason: 'is required when ended behavior is "message"'
    });
    return { ended: { behavior: ENDED_BEHAVIOR.hide }, warnings };
  }
  return { ended: { behavior: ENDED_BEHAVIOR.message, message }, warnings };
}

function parseDismissible(raw: RawSettings): Parsed<boolean> {
  const text = readTrimmed(raw, SETTING.dismissible).toLowerCase();
  if (text === '') return { value: false };
  if (text === 'true' || text === '1') return { value: true };
  if (text === 'false' || text === '0') return { value: false };
  return invalid(false, SETTING.dismissible, 'must be true, false, 1 or 0');
}

function parseColor(raw: RawSettings, setting: SettingName): Parsed<string | undefined> {
  const text = readTrimmed(raw, setting);
  if (text === '') return { value: undefined };
  if (HEX_COLOR.test(text)) return { value: text };
  return invalid(undefined, setting, 'must be a #rgb or #rrggbb color');
}

/**
 * Validates raw string settings (from a query string or Liquid-rendered data attributes).
 * Never throws. Each invalid setting yields exactly one warning and falls back to its default.
 */
export function parseConfig(raw: RawSettings): ParseResult {
  const linkUrl = parseLinkUrl(raw);
  const endsAt = parseEndsAt(raw);
  const ended = parseEnded(raw);
  const dismissible = parseDismissible(raw);
  const backgroundColor = parseColor(raw, SETTING.backgroundColor);
  const textColor = parseColor(raw, SETTING.textColor);

  const warnings = [
    linkUrl.warning,
    endsAt.warning,
    ...ended.warnings,
    dismissible.warning,
    backgroundColor.warning,
    textColor.warning
  ].filter((warning): warning is ConfigWarning => warning !== undefined);

  const message = readTrimmed(raw, SETTING.message);
  if (message === '') return { config: null, warnings };

  const config: BarConfig = {
    message,
    ended: ended.ended,
    dismissible: dismissible.value,
    ...(linkUrl.value !== undefined && { linkUrl: linkUrl.value }),
    ...(endsAt.value !== undefined && { endsAtMs: endsAt.value }),
    ...(backgroundColor.value !== undefined && { backgroundColor: backgroundColor.value }),
    ...(textColor.value !== undefined && { textColor: textColor.value })
  };
  return { config, warnings };
}
