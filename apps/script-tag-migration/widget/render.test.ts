// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import type { BarConfig } from './config';
import { parseConfig } from './config';
import { buildBar } from './render';
import {
  BACKGROUND_PROPERTY,
  COUNTDOWN_ATTRIBUTE,
  dataAttributeFor,
  DISMISS_ATTRIBUTE,
  ENDED_BEHAVIOR,
  MESSAGE_ATTRIBUTE,
  readRawSettings,
  ROOT_ATTRIBUTE,
  SETTING,
  TEXT_PROPERTY
} from './settings';
import { MINIMAL_CONFIG as MINIMAL } from './test-support';

const ENDS_AT_MS = Date.UTC(2027, 0, 15, 8);

const FULL: BarConfig = {
  message: 'Sale',
  linkUrl: '/sale',
  endsAtMs: ENDS_AT_MS,
  ended: { behavior: ENDED_BEHAVIOR.message, message: 'Over' },
  dismissible: true,
  backgroundColor: '#000',
  textColor: '#fff'
};

describe('buildBar', () => {
  it('is a labelled landmark region carrying the root attribute', () => {
    const root = buildBar(MINIMAL);
    expect(root.tagName).toBe('ASIDE');
    expect(root.hasAttribute(ROOT_ATTRIBUTE)).toBe(true);
    expect(root.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders the message as plain text when there is no link', () => {
    const root = buildBar(MINIMAL);
    const message = root.querySelector(`[${MESSAGE_ATTRIBUTE}]`);
    expect(message?.textContent).toBe('Sale');
    expect(root.querySelector('a')).toBeNull();
  });

  it('renders the message as a link when a link URL is configured', () => {
    const link = buildBar(FULL).querySelector(`[${MESSAGE_ATTRIBUTE}] > a`);
    expect(link?.getAttribute('href')).toBe('/sale');
    expect(link?.textContent).toBe('Sale');
  });

  it('renders no countdown when there is no end time', () => {
    expect(buildBar(MINIMAL).querySelector(`[${COUNTDOWN_ATTRIBUTE}]`)).toBeNull();
  });

  it('renders the end time as a machine-readable <time> that is not a live region', () => {
    const countdown = buildBar(FULL).querySelector(`[${COUNTDOWN_ATTRIBUTE}]`);
    expect(countdown?.tagName).toBe('TIME');
    expect(countdown?.getAttribute('datetime')).toBe('2027-01-15T08:00:00Z');
    const liveRegion = countdown?.closest('[aria-live]');
    expect(liveRegion === null || liveRegion?.getAttribute('aria-live') === 'off').toBe(true);
  });

  it('renders a named button only when dismissible', () => {
    expect(buildBar(MINIMAL).querySelector(`[${DISMISS_ATTRIBUTE}]`)).toBeNull();
    const button = buildBar(FULL).querySelector(`[${DISMISS_ATTRIBUTE}]`);
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-label')).toBeTruthy();
  });

  it('applies colors as custom properties only when configured', () => {
    const colored = buildBar(FULL);
    expect(colored.style.getPropertyValue(BACKGROUND_PROPERTY)).toBe('#000');
    expect(colored.style.getPropertyValue(TEXT_PROPERTY)).toBe('#fff');
    expect(buildBar(MINIMAL).getAttribute('style')).toBeNull();
  });

  it('never parses configured text as HTML', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const root = buildBar({ ...FULL, message: hostile });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector(`[${MESSAGE_ATTRIBUTE}]`)?.textContent).toBe(hostile);
  });

  it('keeps hostile text inert in attributes', () => {
    const hostile = '"><script>1</script>';
    const root = buildBar({
      ...FULL,
      message: hostile,
      ended: { behavior: ENDED_BEHAVIOR.message, message: hostile }
    });
    expect(root.querySelector('script')).toBeNull();
    expect(root.getAttribute(dataAttributeFor(SETTING.message))).toBe(hostile);
    expect(root.getAttribute(dataAttributeFor(SETTING.endedMessage))).toBe(hostile);
  });

  it('writes a whole-second datetime for an end time with milliseconds', () => {
    const countdown = buildBar({ ...FULL, endsAtMs: ENDS_AT_MS + 500 }).querySelector(
      `[${COUNTDOWN_ATTRIBUTE}]`
    );
    expect(countdown?.getAttribute('datetime')).toBe('2027-01-15T08:00:00Z');
  });
});

describe('readRawSettings', () => {
  it('prefixes setting attributes to avoid generic theme selectors', () => {
    expect(dataAttributeFor(SETTING.linkUrl)).toMatch(/^data-kc-/);
  });

  it('round-trips a full configuration through parseConfig', () => {
    const { config, warnings } = parseConfig(readRawSettings(buildBar(FULL)));
    expect(warnings).toEqual([]);
    expect(config).toEqual(FULL);
  });

  it('round-trips a minimal configuration through parseConfig', () => {
    expect(parseConfig(readRawSettings(buildBar(MINIMAL))).config).toEqual(MINIMAL);
  });

  it('carries every setting under its data attribute', () => {
    const root = buildBar(FULL);
    for (const setting of Object.values(SETTING)) {
      expect(root.hasAttribute(dataAttributeFor(setting))).toBe(true);
    }
  });

  it('reports absent attributes as undefined', () => {
    expect(readRawSettings(document.createElement('div'))[SETTING.message]).toBeUndefined();
  });
});
