// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BarConfig } from './config';
import { campaignKey, createDismissalStore } from './dismissal';
import { MOUNTED, mountEmbed, mountLegacy } from './mount';
import { buildBar } from './render';
import {
  dataAttributeFor,
  DISMISS_ATTRIBUTE,
  ENDED_ATTRIBUTE,
  ENDED_BEHAVIOR,
  INVALID_ATTRIBUTE,
  ROOT_ATTRIBUTE,
  SETTING
} from './settings';

const ROOT = `[${ROOT_ATTRIBUTE}]`;
const NON_BREAKING_SPACE = String.fromCharCode(0xa0);

function legacySrc(params: Record<string, string>): string {
  return `https://app.example/legacy/announcement-bar.js?${new URLSearchParams(params)}`;
}

const FAR_FUTURE_MS = Date.UTC(2999, 0, 1);
const PAST_MS = 1000;

function embedRoot(overrides: Partial<BarConfig> = {}): HTMLElement {
  const root = buildBar({
    message: 'Embedded',
    ended: { behavior: ENDED_BEHAVIOR.hide },
    dismissible: true,
    ...overrides
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
  vi.useRealTimers();
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
    expect(warningText(0)).not.toContain(SETTING.message);
  });

  it('renders nothing and warns once, without throwing, on an invalid script URL', () => {
    expect(() => mountLegacy(document, 'not a url')).not.toThrow();

    expect(bars()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warningText(0)).not.toContain(SETTING.message);
  });

  it('renders nothing and warns once when the embed bar was removed before it ran', () => {
    const embed = embedRoot();
    mountEmbed(document);
    dismiss(embed);
    expect(bars()).toHaveLength(0);

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Legacy' }));

    expect(bars()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('defers to embed markup that arrives while the document is loading', () => {
    setReadyState('loading');
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Legacy' }));
    const embed = embedRoot();

    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(bars()).toEqual([embed]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('lets a valid copy render after a misconfigured one', () => {
    mountLegacy(document, legacySrc({ [SETTING.dismissible]: 'true' }));
    expect(bars()).toHaveLength(0);

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale' }));

    expect(bars()).toHaveLength(1);
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

  it('removes the bar and warns once when its message is only whitespace', () => {
    const embed = embedRoot();
    embed.setAttribute(dataAttributeFor(SETTING.message), NON_BREAKING_SPACE);

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warningText(0)).toContain(SETTING.message);
  });

  it('enhances a complete root at once while the document is loading', () => {
    const embed = embedRoot();
    setReadyState('loading');

    mountEmbed(document);

    dismiss(embed);
    expect(bars()).toHaveLength(0);
  });

  it('removes a previously dismissed bar at once while the document is loading', () => {
    const config: BarConfig = {
      message: 'Embedded',
      ended: { behavior: ENDED_BEHAVIOR.hide },
      dismissible: true
    };
    createDismissalStore().dismiss(campaignKey(config));
    embedRoot(config);
    setReadyState('loading');

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
  });

  it('removes an ended bar at once while the document is loading when it hides on end', () => {
    embedRoot({ endsAtMs: PAST_MS, ended: { behavior: ENDED_BEHAVIOR.hide } });
    setReadyState('loading');

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
  });

  it('marks an ended bar at once while the document is loading when it shows a message', () => {
    const embed = embedRoot({
      endsAtMs: PAST_MS,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    });
    setReadyState('loading');

    mountEmbed(document);

    expect(embed.hasAttribute(ENDED_ATTRIBUTE)).toBe(true);
  });

  it('removes a bar whose message is only whitespace at once while the document is loading', () => {
    const embed = embedRoot();
    embed.setAttribute(dataAttributeFor(SETTING.message), NON_BREAKING_SPACE);
    setReadyState('loading');

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
  });

  it('waits for DOMContentLoaded when the root is missing its dismiss button', () => {
    const embed = embedRoot();
    const button = embed.querySelector(`[${DISMISS_ATTRIBUTE}]`);
    button?.remove();
    setReadyState('loading');

    mountEmbed(document);
    if (button) embed.appendChild(button);
    dismiss(embed);
    expect(bars()).toHaveLength(1);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    dismiss(embed);
    expect(bars()).toHaveLength(0);
  });

  it('waits for DOMContentLoaded when the root is missing its countdown', () => {
    const embed = embedRoot({ dismissible: false, endsAtMs: FAR_FUTURE_MS });
    const countdown = embed.querySelector('[data-kc-countdown]');
    countdown?.remove();
    setReadyState('loading');
    vi.useFakeTimers();

    mountEmbed(document);
    expect(vi.getTimerCount()).toBe(0);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(vi.getTimerCount()).toBe(1);
  });

  it('waits for DOMContentLoaded when no root exists yet', () => {
    setReadyState('loading');

    mountEmbed(document);
    const embed = embedRoot();
    dismiss(embed);
    expect(bars()).toHaveLength(1);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    dismiss(embed);
    expect(bars()).toHaveLength(0);
  });

  it('enhances once when mounted twice', () => {
    const embed = embedRoot({ endsAtMs: FAR_FUTURE_MS });
    const store = vi.spyOn(localStorage, 'setItem');
    vi.useFakeTimers();

    mountEmbed(document);
    mountEmbed(document);
    expect(vi.getTimerCount()).toBe(1);

    dismiss(embed);
    expect(store).toHaveBeenCalledTimes(1);
  });

  it('does not enhance a bar a legacy script already built', () => {
    const store = vi.spyOn(localStorage, 'setItem');
    vi.useFakeTimers();
    mountLegacy(
      document,
      legacySrc({
        [SETTING.message]: 'Sale',
        [SETTING.dismissible]: 'true',
        [SETTING.endsAt]: String(FAR_FUTURE_MS / 1000)
      })
    );

    mountEmbed(document);
    expect(vi.getTimerCount()).toBe(1);

    dismiss(bars()[0] as HTMLElement);
    expect(store).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the page is already marked as mounted', () => {
    const embed = embedRoot();
    Reflect.set(window, MOUNTED, true);

    mountEmbed(document);

    dismiss(embed);
    expect(bars()).toEqual([embed]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once for each known setting listed as invalid and ignores unknown ids', () => {
    const embed = embedRoot();
    embed.setAttribute(
      INVALID_ATTRIBUTE,
      `${SETTING.linkUrl} bogus ${SETTING.endsAt} ${SETTING.linkUrl}`
    );

    mountEmbed(document);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warningText(0)).toContain(SETTING.linkUrl);
    expect(warningText(1)).toContain(SETTING.endsAt);
  });
});
