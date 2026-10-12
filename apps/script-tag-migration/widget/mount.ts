import type { BarConfig, ConfigWarning } from './config';
import { parseConfig } from './config';
import { enhance } from './enhance';
import { buildBar } from './render';
import type { RawSettings, SettingName } from './settings';
import {
  COUNTDOWN_ATTRIBUTE,
  DISMISS_ATTRIBUTE,
  INVALID_ATTRIBUTE,
  MESSAGE_ATTRIBUTE,
  readRawSettings,
  readSettings,
  ROOT_ATTRIBUTE,
  SETTING
} from './settings';

const LOG_PREFIX = '[kc-announcement-bar]';
export const MOUNTED = Symbol.for('kc-announcement-bar.mounted');

type MountedWindow = Window & { [MOUNTED]?: true };

function isMounted(doc: Document): boolean {
  const win: MountedWindow | null = doc.defaultView;
  return win?.[MOUNTED] === true;
}

function markMounted(doc: Document): void {
  const win: MountedWindow | null = doc.defaultView;
  if (win) win[MOUNTED] = true;
}

function warn(message: string): void {
  console.warn(`${LOG_PREFIX} ${message}`);
}

function warnSetting({ setting, reason }: ConfigWarning): void {
  warn(`${setting} ${reason}`);
}

function reportWarnings(warnings: ConfigWarning[]): void {
  warnings.forEach(warnSetting);
}

function isSettingName(value: string): value is SettingName {
  return (Object.values(SETTING) as string[]).includes(value);
}

/** Warns once for each known setting the server-rendered markup reports as invalid. */
function reportInvalidSettings(root: HTMLElement): void {
  const listed = (root.getAttribute(INVALID_ATTRIBUTE) ?? '').split(/\s+/);
  for (const setting of new Set(listed.filter(isSettingName))) {
    warnSetting({ setting, reason: 'is invalid' });
  }
}

function whenDomReady(doc: Document, run: () => void): void {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

function findRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[${ROOT_ATTRIBUTE}]`);
}

function warnMessageRequired(): void {
  warn(`${SETTING.message} is required, so no bar was rendered`);
}

/** The settings in the script URL's query string, or `null` after warning that there is no usable URL. */
function readQuerySettings(scriptSrc: string | undefined): RawSettings | null {
  if (scriptSrc === undefined) {
    warn('the script URL could not be found, so no settings were read');
    return null;
  }
  let params: URLSearchParams;
  try {
    params = new URL(scriptSrc).searchParams;
  } catch {
    warn('the script URL is invalid, so no settings were read');
    return null;
  }
  return readSettings((setting) => params.get(setting));
}

function readLegacyConfig(scriptSrc: string | undefined): BarConfig | null {
  const raw = readQuerySettings(scriptSrc);
  if (raw === null) return null;
  const { config, warnings } = parseConfig(raw);
  reportWarnings(warnings);
  if (!config) warnMessageRequired();
  return config;
}

/** The attribute of the last child the markup carries for `config`, in markup order. */
function lastMarkerFor(config: BarConfig): string {
  if (config.dismissible) return DISMISS_ATTRIBUTE;
  if (config.endsAtMs !== undefined) return COUNTDOWN_ATTRIBUTE;
  return MESSAGE_ATTRIBUTE;
}

/** Whether the parser is past every element the config expects, so enhancing now can't miss one. */
function isRootComplete(root: HTMLElement): boolean {
  const { config } = parseConfig(readRawSettings(root));
  return !config || root.querySelector(`[${lastMarkerFor(config)}]`) !== null;
}

function enhanceEmbed(doc: Document): void {
  if (isMounted(doc)) return;
  const root = findRoot(doc);
  if (!root) return;
  markMounted(doc);
  const { config, warnings } = parseConfig(readRawSettings(root));
  reportInvalidSettings(root);
  reportWarnings(warnings);
  if (!config) {
    root.remove();
    warnMessageRequired();
    return;
  }
  enhance(root, config);
}

/**
 * Enhances the server-rendered bar, once per page. Does nothing when the page has none.
 * While the document loads, a bar whose markup is already complete is enhanced at once
 * so a dismissed or ended bar never flashes.
 */
export function mountEmbed(doc: Document): void {
  const root = findRoot(doc);
  if (doc.readyState === 'loading' && !(root && isRootComplete(root))) {
    doc.addEventListener('DOMContentLoaded', () => enhanceEmbed(doc), { once: true });
    return;
  }
  enhanceEmbed(doc);
}

/**
 * Builds a bar from the script URL's query string, unless the page already has one:
 * the embed's bar always wins.
 */
export function mountLegacy(doc: Document, scriptSrc: string | undefined): void {
  whenDomReady(doc, () => {
    if (findRoot(doc) || isMounted(doc)) {
      warn('an announcement bar is already on the page, so this script did nothing');
      return;
    }
    const config = readLegacyConfig(scriptSrc);
    if (!config) return;
    const root = buildBar(config);
    doc.body.appendChild(root);
    markMounted(doc);
    enhance(root, config);
  });
}
