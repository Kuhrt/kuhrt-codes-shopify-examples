import type { ConfigWarning } from './config';
import { parseConfig } from './config';
import { enhance } from './enhance';
import { buildBar } from './render';
import type { RawSettings } from './settings';
import { readRawSettings, ROOT_ATTRIBUTE, SETTING } from './settings';

const LOG_PREFIX = '[kc-announcement-bar]';
const MOUNTED = Symbol.for('kc-announcement-bar.mounted');

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

function readQuerySettings(scriptSrc: string | undefined): RawSettings {
  if (scriptSrc === undefined) return {};
  let params: URLSearchParams;
  try {
    params = new URL(scriptSrc).searchParams;
  } catch {
    warn('script URL is invalid, so no settings were read');
    return {};
  }
  const raw: RawSettings = {};
  for (const setting of Object.values(SETTING)) {
    raw[setting] = params.get(setting) ?? undefined;
  }
  return raw;
}

/** Enhances the server-rendered bar. Does nothing when the page has none. */
export function mountEmbed(doc: Document): void {
  whenDomReady(doc, () => {
    const root = findRoot(doc);
    if (!root) return;
    markMounted(doc);
    const { config, warnings } = parseConfig(readRawSettings(root));
    reportWarnings(warnings);
    if (config) enhance(root, config);
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
    markMounted(doc);
    const { config, warnings } = parseConfig(readQuerySettings(scriptSrc));
    reportWarnings(warnings);
    if (!config) {
      warn(`${SETTING.message} is required, so no bar was rendered`);
      return;
    }
    const root = buildBar(config);
    doc.body.appendChild(root);
    enhance(root, config);
  });
}
