import type { BarConfig, ConfigWarning } from './config';
import { parseConfig } from './config';
import { enhance } from './enhance';
import { buildBar } from './render';
import type { RawSettings } from './settings';
import { readRawSettings, ROOT_ATTRIBUTE, SETTING } from './settings';

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

function reportWarnings(warnings: ConfigWarning[]): void {
  for (const { setting, reason } of warnings) warn(`${setting} ${reason}`);
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
  const raw: RawSettings = {};
  for (const setting of Object.values(SETTING)) {
    raw[setting] = params.get(setting) ?? undefined;
  }
  return raw;
}

function readLegacyConfig(scriptSrc: string | undefined): BarConfig | null {
  const raw = readQuerySettings(scriptSrc);
  if (raw === null) return null;
  const { config, warnings } = parseConfig(raw);
  reportWarnings(warnings);
  if (!config) warnMessageRequired();
  return config;
}

/** Enhances the server-rendered bar. Does nothing when the page has none. */
export function mountEmbed(doc: Document): void {
  whenDomReady(doc, () => {
    const root = findRoot(doc);
    if (!root) return;
    markMounted(doc);
    const { config, warnings } = parseConfig(readRawSettings(root));
    reportWarnings(warnings);
    if (!config) {
      root.remove();
      warnMessageRequired();
      return;
    }
    enhance(root, config);
  });
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
