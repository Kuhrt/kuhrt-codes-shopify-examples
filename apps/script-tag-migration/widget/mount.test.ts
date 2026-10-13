// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableCSSFileLoading": true, "handleDisabledFileLoadingAsSuccess": true } }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BarConfig } from './config';
import { campaignKey, createDismissalStore } from './dismissal';
import { MOUNTED, mountEmbed, mountLegacy, STYLESHEET_FILE } from './mount';
import { buildBar } from './render';
import {
  COUNTDOWN_ATTRIBUTE,
  dataAttributeFor,
  DESIGN_MODE_ATTRIBUTE,
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

const EMBED_CONFIG: BarConfig = {
  message: 'Embedded',
  ended: { behavior: ENDED_BEHAVIOR.hide },
  dismissible: true
};

function embedRoot(overrides: Partial<BarConfig> = {}): HTMLElement {
  const root = buildBar({ ...EMBED_CONFIG, ...overrides });
  document.body.appendChild(root);
  return root;
}

function bars(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROOT)];
}

function stylesheetLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
}

function dismiss(root: HTMLElement): void {
  root.querySelector<HTMLElement>(`[${DISMISS_ATTRIBUTE}]`)?.click();
}

/** Appends the node that follows the root once the parser has closed it. */
function closeRoot(): void {
  document.body.appendChild(document.createComment(''));
}

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setReadyState(state: DocumentReadyState): void {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state);
}

/** Makes a link look like a stylesheet the browser already loaded. */
function markLoaded(link: HTMLLinkElement | undefined): void {
  Object.defineProperty(link, 'sheet', { value: {} });
}

function appendStylesheetLink(href: string): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return link;
}

/**
 * Stops stylesheet links from reporting their own load or error, so a test decides when the
 * stylesheet settles. Returns a function that reports the event on the first stylesheet link.
 */
function holdStylesheet(): (type: 'load' | 'error') => void {
  const dispatch = HTMLLinkElement.prototype.dispatchEvent;
  let held = true;
  vi.spyOn(HTMLLinkElement.prototype, 'dispatchEvent').mockImplementation(function (
    this: HTMLLinkElement,
    event: Event
  ) {
    return held || dispatch.call(this, event);
  });
  return (type) => {
    held = false;
    stylesheetLinks().at(-1)?.dispatchEvent(new Event(type));
  };
}

let warn: ReturnType<typeof vi.spyOn>;

function warningText(index: number): string {
  return String(warn.mock.calls[index]?.[0]);
}

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
});

/**
 * Fires the DOMContentLoaded listeners a test left registered on the shared document, which also
 * disconnects their observers. The page is marked as mounted and empty so none of them mounts anything.
 */
function drainPendingListeners(): void {
  Reflect.set(window, MOUNTED, true);
  document.body.replaceChildren();
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

afterEach(() => {
  vi.useRealTimers();
  drainPendingListeners();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.head.replaceChildren();
  Reflect.deleteProperty(window, MOUNTED);
});

describe('mountLegacy', () => {
  it('builds one bar from the query string settings', async () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale', [SETTING.dismissible]: 'true' }));
    await flushTasks();

    const [root, ...rest] = bars();
    expect(rest).toHaveLength(0);
    expect(root?.getAttribute(dataAttributeFor(SETTING.message))).toBe('Sale');
    expect(root?.querySelector(`[${DISMISS_ATTRIBUTE}]`)).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders one bar and warns once when loaded twice', async () => {
    const src = legacySrc({ [SETTING.message]: 'Sale' });

    mountLegacy(document, src);
    mountLegacy(document, src);
    await flushTasks();

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

  it('lets a valid copy render after a misconfigured one', async () => {
    mountLegacy(document, legacySrc({ [SETTING.dismissible]: 'true' }));
    expect(bars()).toHaveLength(0);

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale' }));
    await flushTasks();

    expect(bars()).toHaveLength(1);
  });

  it('ignores unknown query parameters', async () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale', evil: 'x', onclick: 'y' }));
    await flushTasks();

    const root = bars()[0];
    expect(root?.hasAttribute('data-kc-evil')).toBe(false);
    expect(root?.hasAttribute('onclick')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns exactly once, naming the setting, for an invalid setting', async () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale', [SETTING.textColor]: 'red' }));
    await flushTasks();

    expect(bars()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warningText(0)).toContain(SETTING.textColor);
  });

  it('waits for DOMContentLoaded while the document is loading', async () => {
    setReadyState('loading');

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale' }));
    await flushTasks();
    expect(bars()).toHaveLength(0);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flushTasks();
    expect(bars()).toHaveLength(1);
  });
});

describe('mountLegacy stylesheet', () => {
  it('links the stylesheet served next to the script, without its query string', () => {
    mountLegacy(document, legacySrc({ [SETTING.message]: 'Sale' }));

    const [link, ...rest] = stylesheetLinks();
    expect(rest).toHaveLength(0);
    expect(link?.href).toBe(`https://app.example/legacy/${STYLESHEET_FILE}`);
    expect(link?.parentElement).toBe(document.head);
  });

  it('links the stylesheet once when the script is loaded twice', () => {
    const src = legacySrc({ [SETTING.message]: 'Sale' });

    mountLegacy(document, src);
    mountLegacy(document, src);

    expect(stylesheetLinks()).toHaveLength(1);
  });

  it('does not add a second link when the page already links the stylesheet', async () => {
    const src = legacySrc({ [SETTING.message]: 'Sale' });
    mountLegacy(document, src);
    await flushTasks();
    markLoaded(stylesheetLinks()[0]);
    document.body.replaceChildren();
    Reflect.deleteProperty(window, MOUNTED);

    mountLegacy(document, src);
    await flushTasks();

    expect(bars()).toHaveLength(1);
    expect(stylesheetLinks()).toHaveLength(1);
  });

  it('links nothing when the message is missing', () => {
    mountLegacy(document, legacySrc({ [SETTING.dismissible]: 'true' }));

    expect(stylesheetLinks()).toHaveLength(0);
  });

  it('links nothing when the embed already put a bar on the page', () => {
    embedRoot();

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Legacy' }));

    expect(stylesheetLinks()).toHaveLength(0);
  });

  it.each([undefined, 'not a url'])('links nothing for the script URL %s', (src) => {
    mountLegacy(document, src);

    expect(stylesheetLinks()).toHaveLength(0);
  });
});

describe('mountLegacy while the stylesheet loads', () => {
  const src = legacySrc({ [SETTING.message]: 'Sale' });
  const stylesheetHref = new URL(STYLESHEET_FILE, src).href;

  it('adds no bar until the stylesheet has loaded', async () => {
    const settle = holdStylesheet();

    mountLegacy(document, src);
    await flushTasks();
    expect(bars()).toHaveLength(0);

    settle('load');
    await flushTasks();
    expect(bars()).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('adds the bar and warns once when the stylesheet fails to load', async () => {
    const settle = holdStylesheet();
    mountLegacy(document, src);
    await flushTasks();
    expect(bars()).toHaveLength(0);

    settle('error');
    await flushTasks();

    expect(bars()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('adds the bar at once when the page already loaded the stylesheet', async () => {
    const link = appendStylesheetLink(stylesheetHref);
    markLoaded(link);
    holdStylesheet();

    mountLegacy(document, src);
    await flushTasks();

    expect(bars()).toHaveLength(1);
    expect(stylesheetLinks()).toEqual([link]);
  });

  it('waits on its own link when the page links the stylesheet but it has not loaded', async () => {
    const pageLink = appendStylesheetLink(stylesheetHref);
    const settle = holdStylesheet();

    mountLegacy(document, src);
    await flushTasks();
    expect(bars()).toHaveLength(0);
    expect(stylesheetLinks()).toHaveLength(2);
    expect(stylesheetLinks()[0]).toBe(pageLink);

    settle('load');
    await flushTasks();
    expect(bars()).toHaveLength(1);
  });

  it('builds nothing from a second script during the wait and warns once', async () => {
    const settle = holdStylesheet();
    mountLegacy(document, src);

    mountLegacy(document, legacySrc({ [SETTING.message]: 'Other' }));
    settle('load');
    await flushTasks();

    expect(bars()).toHaveLength(1);
    expect(bars()[0]?.getAttribute(dataAttributeFor(SETTING.message))).toBe('Sale');
    expect(stylesheetLinks()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
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
    closeRoot();

    mountEmbed(document);

    dismiss(embed);
    expect(bars()).toHaveLength(0);
  });

  it('removes a previously dismissed bar at once while the document is loading', () => {
    createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
    embedRoot(EMBED_CONFIG);
    setReadyState('loading');
    closeRoot();

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
  });

  it('removes an ended bar at once while the document is loading when it hides on end', () => {
    embedRoot({ endsAtMs: PAST_MS, ended: { behavior: ENDED_BEHAVIOR.hide } });
    setReadyState('loading');
    closeRoot();

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
  });

  it('marks an ended bar at once while the document is loading when it shows a message', () => {
    const embed = embedRoot({
      endsAtMs: PAST_MS,
      ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' }
    });
    setReadyState('loading');
    closeRoot();

    mountEmbed(document);

    expect(embed.hasAttribute(ENDED_ATTRIBUTE)).toBe(true);
  });

  it('removes a bar whose message is only whitespace at once while the document is loading', () => {
    const embed = embedRoot();
    embed.setAttribute(dataAttributeFor(SETTING.message), NON_BREAKING_SPACE);
    setReadyState('loading');
    closeRoot();

    mountEmbed(document);

    expect(bars()).toHaveLength(0);
  });

  it('waits for DOMContentLoaded when a node follows a root still missing its dismiss button', () => {
    createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
    const embed = embedRoot(EMBED_CONFIG);
    embed.querySelector(`[${DISMISS_ATTRIBUTE}]`)?.remove();
    setReadyState('loading');
    closeRoot();

    mountEmbed(document);
    expect(bars()).toHaveLength(1);

    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(bars()).toHaveLength(0);
  });

  it.each([true, false])(
    'waits for DOMContentLoaded when a node follows a root still missing its countdown (dismissible: %s)',
    (dismissible) => {
      const embed = embedRoot({ dismissible, endsAtMs: FAR_FUTURE_MS });
      embed.querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)?.remove();
      setReadyState('loading');
      closeRoot();
      vi.useFakeTimers();

      mountEmbed(document);
      expect(vi.getTimerCount()).toBe(0);

      document.dispatchEvent(new Event('DOMContentLoaded'));
      expect(vi.getTimerCount()).toBe(1);
    }
  );

  it('enhances at once a root that has all of its markers while the document is loading', () => {
    embedRoot({ endsAtMs: FAR_FUTURE_MS });
    setReadyState('loading');
    closeRoot();
    vi.useFakeTimers();

    mountEmbed(document);

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

  it('does not enhance a bar a legacy script already built', async () => {
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
    await vi.advanceTimersByTimeAsync(0);

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

  describe('while the document is loading', () => {
    beforeEach(() => {
      setReadyState('loading');
    });

    it('enhances a root that is closed after mounting, without waiting for DOMContentLoaded', async () => {
      createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
      mountEmbed(document);

      embedRoot(EMBED_CONFIG);
      closeRoot();
      await flushTasks();

      expect(bars()).toHaveLength(0);
    });

    it('enhances a root that was present but unclosed at mount once it closes', async () => {
      createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
      embedRoot(EMBED_CONFIG);
      mountEmbed(document);
      expect(bars()).toHaveLength(1);

      closeRoot();
      await flushTasks();

      expect(bars()).toHaveLength(0);
    });

    it('enhances a present root once a missing marker arrives', async () => {
      createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
      const embed = embedRoot(EMBED_CONFIG);
      const button = embed.querySelector(`[${DISMISS_ATTRIBUTE}]`);
      button?.remove();
      closeRoot();
      mountEmbed(document);
      expect(bars()).toHaveLength(1);

      if (button) embed.appendChild(button);
      await flushTasks();

      expect(bars()).toHaveLength(0);
    });

    it('enhances a root that arrives inside an added wrapper element', async () => {
      createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
      mountEmbed(document);

      const wrapper = document.createElement('div');
      wrapper.append(buildBar(EMBED_CONFIG), document.createComment(''));
      document.body.appendChild(wrapper);
      await flushTasks();

      expect(bars()).toHaveLength(0);
    });

    it('waits for a following node before enhancing a root added after mounting', async () => {
      mountEmbed(document);
      const embed = embedRoot();
      await flushTasks();
      dismiss(embed);
      expect(bars()).toHaveLength(1);

      closeRoot();
      await flushTasks();
      dismiss(embed);
      expect(bars()).toHaveLength(0);
    });

    it('enhances an unclosed root on DOMContentLoaded', async () => {
      mountEmbed(document);
      const embed = embedRoot();
      await flushTasks();
      dismiss(embed);
      expect(bars()).toEqual([embed]);

      document.dispatchEvent(new Event('DOMContentLoaded'));
      dismiss(embed);

      expect(bars()).toHaveLength(0);
    });

    it('enhances once when the observer and DOMContentLoaded both fire', async () => {
      mountEmbed(document);
      embedRoot().setAttribute(dataAttributeFor(SETTING.backgroundColor), 'nope');
      closeRoot();
      await flushTasks();

      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flushTasks();

      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stops observing after the observer enhances', async () => {
      mountEmbed(document);
      const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
      embedRoot();
      closeRoot();
      await flushTasks();

      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('stops observing on DOMContentLoaded', () => {
      mountEmbed(document);
      const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

      document.dispatchEvent(new Event('DOMContentLoaded'));

      expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('falls back to DOMContentLoaded when MutationObserver is unavailable', async () => {
      vi.stubGlobal('MutationObserver', undefined);
      mountEmbed(document);
      const embed = embedRoot();
      closeRoot();
      await flushTasks();
      dismiss(embed);
      expect(bars()).toHaveLength(1);

      document.dispatchEvent(new Event('DOMContentLoaded'));
      dismiss(embed);
      expect(bars()).toHaveLength(0);
    });
  });
});

describe('mountEmbed in the theme editor', () => {
  function designModeRoot(overrides: Partial<BarConfig> = {}): HTMLElement {
    const embed = embedRoot(overrides);
    embed.setAttribute(DESIGN_MODE_ATTRIBUTE, '');
    return embed;
  }

  it('keeps the bar when a dismissal was stored earlier', () => {
    createDismissalStore().dismiss(campaignKey(EMBED_CONFIG));
    designModeRoot(EMBED_CONFIG);

    mountEmbed(document);

    expect(bars()).toHaveLength(1);
  });

  it('removes the bar on dismiss without writing to storage', () => {
    const embed = designModeRoot();
    const write = vi.spyOn(localStorage, 'setItem');

    mountEmbed(document);
    dismiss(embed);

    expect(bars()).toHaveLength(0);
    expect(write).not.toHaveBeenCalled();
  });
});
