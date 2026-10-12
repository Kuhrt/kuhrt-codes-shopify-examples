// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountEmbed, mountLegacy } from './mount';
import { buildBar } from './render';
import {
  dataAttributeFor,
  DISMISS_ATTRIBUTE,
  ENDED_BEHAVIOR,
  ROOT_ATTRIBUTE,
  SETTING
} from './settings';

const ROOT = `[${ROOT_ATTRIBUTE}]`;
const MOUNTED = Symbol.for('kc-announcement-bar.mounted');

function legacySrc(params: Record<string, string>): string {
  return `https://app.example/legacy/announcement-bar.js?${new URLSearchParams(params)}`;
}

function embedRoot(): HTMLElement {
  const root = buildBar({
    message: 'Embedded',
    ended: { behavior: ENDED_BEHAVIOR.hide },
    dismissible: true
  });
  document.body.appendChild(root);
  return root;
}

function bars(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROOT)];
}

function dismiss(root: HTMLElement): void {
  root.querySelector<HTMLElement>(`[${DISMISS_ATTRIBUTE}]`)?.click();
}

function setReadyState(state: DocumentReadyState): void {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state);
}

let warn: ReturnType<typeof vi.spyOn>;

function warningText(index: number): string {
  return String(warn.mock.calls[index]?.[0]);
}

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  Reflect.deleteProperty(window, MOUNTED);
});

describe('mountLegacy', () => {
  it('builds one bar from the query string settings', () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale', [SETTING.dismissible]: 'true' }));

    const [root, ...rest] = bars();
    expect(rest).toHaveLength(0);
    expect(root?.getAttribute(dataAttributeFor(SETTING.message))).toBe('Sale');
    expect(root?.querySelector(`[${DISMISS_ATTRIBUTE}]`)).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders one bar and warns once when loaded twice', () => {
    const src = legacySrc({ [SETTING.message]: 'Sale' });

    mountLegacy(document, src);
    mountLegacy(document, src);

    expect(bars()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('defers to the embed: keeps its element and warns once', () => {
    const embed = embedRoot();
    mountEmbed(document);

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Legacy' }));

    expect(bars()).toEqual([embed]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('defers to embed markup even when the embed has not run', () => {
    const embed = embedRoot();

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Legacy' }));

    expect(bars()).toEqual([embed]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('renders nothing and names the message setting when it is missing', () => {
    mountLegacy(document, legacySrc({ [SETTING.dismissible]: 'true' }));

    expect(bars()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warningText(0)).toContain(SETTING.message);
  });

  it('renders nothing and warns once when the script URL is missing', () => {
    mountLegacy(document, undefined);

    expect(bars()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not throw on an invalid script URL', () => {
    expect(() => mountLegacy(document, 'not a url')).not.toThrow();

    expect(bars()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('ignores unknown query parameters', () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale', evil: 'x', onclick: 'y' }));

    const root = bars()[0];
    expect(root?.hasAttribute('data-kc-evil')).toBe(false);
    expect(root?.hasAttribute('onclick')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns exactly once, naming the setting, for an invalid setting', () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale', [SETTING.textColor]: 'red' }));

    expect(bars()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warningText(0)).toContain(SETTING.textColor);
  });

  it('waits for DOMContentLoaded while the document is loading', () => {
    setReadyState('loading');

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale' }));
    expect(bars()).toHaveLength(0);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(bars()).toHaveLength(1);
  });
});

describe('mountEmbed', () => {
  it('enhances the existing root without creating another', () => {
    const embed = embedRoot();

    mountEmbed(document);
    expect(bars()).toEqual([embed]);

    dismiss(embed);
    expect(bars()).toHaveLength(0);
  });

  it('does nothing and does not throw when the page has no bar', () => {
    expect(() => mountEmbed(document)).not.toThrow();

    expect(bars()).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns exactly once, naming the setting, for an invalid setting', () => {
    const embed = embedRoot();
    embed.setAttribute(dataAttributeFor(SETTING.backgroundColor), 'nope');

    mountEmbed(document);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warningText(0)).toContain(SETTING.backgroundColor);
  });

  it('waits for DOMContentLoaded while the document is loading', () => {
    const embed = embedRoot();
    setReadyState('loading');

    mountEmbed(document);
    dismiss(embed);
    expect(bars()).toHaveLength(1);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    dismiss(embed);
    expect(bars()).toHaveLength(0);
  });
});
