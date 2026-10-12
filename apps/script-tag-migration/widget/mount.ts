import type { BarConfig, ConfigWarning, ParseResult } from './config';
import { parseConfig } from './config';
import { createEphemeralDismissalStore } from './dismissal';
import { enhance } from './enhance';
import { buildBar } from './render';
import type { RawSettings, SettingName } from './settings';
import {
  COUNTDOWN_ATTRIBUTE,
  DESIGN_MODE_ATTRIBUTE,
  DISMISS_ATTRIBUTE,
  INVALID_ATTRIBUTE,
  MESSAGE_ATTRIBUTE,
  readRawSettings,
  readSettings,
  ROOT_ATTRIBUTE,
  SETTING
} from './settings';

export const LOG_PREFIX = '[kc-announcement-bar]';
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

/** Reports the parse warnings, and that the message is required when there is no config. */
function reportParse({ config, warnings }: ParseResult): BarConfig | null {
  reportWarnings(warnings);
  if (!config) warnMessageRequired();
  return config;
}

function readLegacyConfig(scriptSrc: string | undefined): BarConfig | null {
  const raw = readQuerySettings(scriptSrc);
  return raw === null ? null : reportParse(parseConfig(raw));
}

function mountBar(doc: Document, root: HTMLElement, config: BarConfig): void {
  markMounted(doc);
  const store = root.hasAttribute(DESIGN_MODE_ATTRIBUTE)
    ? createEphemeralDismissalStore()
    : undefined;
  enhance(root, config, { store });
}

/** The attributes of every child the markup carries for `config`. */
function markersFor(config: BarConfig): string[] {
  const markers = [MESSAGE_ATTRIBUTE];
  if (config.endsAtMs !== undefined) markers.push(COUNTDOWN_ATTRIBUTE);
  if (config.dismissible) markers.push(DISMISS_ATTRIBUTE);
  return markers;
}

/**
 * Whether the parser has produced every element the config expects, so enhancing now can't miss one.
 * A following node means the parser has closed the root.
 */
function isRootParsed(root: HTMLElement, config: BarConfig | null): boolean {
  const hasEveryMarker =
    !config || markersFor(config).every((marker) => root.querySelector(`[${marker}]`) !== null);
  return root.nextSibling !== null && hasEveryMarker;
}

function parseRoot(root: HTMLElement): ParseResult {
  return parseConfig(readRawSettings(root));
}

function enhanceRoot(doc: Document, root: HTMLElement, parsed: ParseResult): void {
  if (isMounted(doc)) return;
  reportInvalidSettings(root);
  const config = reportParse(parsed);
  if (config) {
    mountBar(doc, root, config);
  } else {
    markMounted(doc);
    root.remove();
  }
}

function enhanceEmbed(doc: Document): void {
  const root = findRoot(doc);
  if (root) enhanceRoot(doc, root, parseRoot(root));
}

interface FoundRoot {
  root: HTMLElement;
  parsed: ParseResult;
}

function parseFound(root: HTMLElement | null): FoundRoot | null {
  return root ? { root, parsed: parseRoot(root) } : null;
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

/** The root that is `node` or inside it. */
function rootWithin(node: Node): HTMLElement | null {
  if (!isElement(node)) return null;
  if (node.hasAttribute(ROOT_ATTRIBUTE)) return node as HTMLElement;
  return node.querySelector<HTMLElement>(`[${ROOT_ATTRIBUTE}]`);
}

/** The first root among the nodes the records added. */
function rootAddedBy(records: MutationRecord[]): HTMLElement | null {
  for (const { addedNodes } of records) {
    for (const node of addedNodes) {
      const root = rootWithin(node);
      if (root) return root;
    }
  }
  return null;
}

/** Enhances `found` if the parser has finished it, and reports whether it did. */
function enhanceIfParsed(doc: Document, found: FoundRoot | null): boolean {
  if (!found || !isRootParsed(found.root, found.parsed.config)) return false;
  enhanceRoot(doc, found.root, found.parsed);
  return true;
}

/**
 * Enhances as soon as the parser finishes the root, and returns a function that stops watching.
 * `initial` is the root already in the document, if any; later roots are found among added nodes.
 */
function watchForParsedRoot(doc: Document, initial: FoundRoot | null): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  let found = initial;
  const observer = new MutationObserver((records) => {
    found ??= parseFound(rootAddedBy(records));
    if (enhanceIfParsed(doc, found)) observer.disconnect();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Enhances the server-rendered bar, once per page. Does nothing when the page has none.
 * While the document loads, the bar is enhanced as soon as its markup is complete, so a
 * dismissed or ended bar never flashes; `DOMContentLoaded` is the fallback.
 */
export function mountEmbed(doc: Document): void {
  if (doc.readyState !== 'loading') {
    enhanceEmbed(doc);
    return;
  }
  const found = parseFound(findRoot(doc));
  if (enhanceIfParsed(doc, found)) return;
  const stopWatching = watchForParsedRoot(doc, found);
  doc.addEventListener(
    'DOMContentLoaded',
    () => {
      stopWatching();
      enhanceEmbed(doc);
    },
    { once: true }
  );
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
    mountBar(doc, root, config);
  });
}
