// @vitest-environment happy-dom
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BUNDLES } from '../scripts/build-widget';
import { parseConfig } from './config';
import type { BlockSettings } from './liquid-test-support';
import {
  extensionPath,
  parseLocalDateTime,
  readBlockSchema,
  renderBlock
} from './liquid-test-support';
import { MOUNTED, mountEmbed } from './mount';
import { buildBar } from './render';
import type { RawSettings } from './settings';
import {
  dataAttributeFor,
  DESIGN_MODE_ATTRIBUTE,
  EMBED_ONLY_ATTRIBUTES,
  ENDED_BEHAVIOR,
  INVALID_ATTRIBUTE,
  readRawSettings,
  ROOT_ATTRIBUTE,
  SETTING
} from './settings';

interface MerchantInput {
  message: string;
  linkUrl?: string;
  endsAt?: string;
  endedBehavior?: string;
  endedMessage?: string;
  dismissible?: boolean;
  backgroundColor?: string;
  textColor?: string;
}

interface NormalizedElement {
  tag: string;
  attributes: Record<string, string | number | string[]>;
  children: (NormalizedElement | string)[];
}

const STYLESHEET_ASSET = 'announcement-bar.css';
const OFFSET_WITHOUT_COLON = /([+-]\d{2})(\d{2})$/;
const REJECTED_END_TIME = 'not-an-end-time';
const NON_BREAKING_SPACE = String.fromCharCode(0xa0);

const CASES: Record<string, MerchantInput> = {
  minimal: { message: 'Sale' },
  'message with link': { message: 'Sale', linkUrl: '/sale' },
  'end time that hides when ended': {
    message: 'Sale',
    endsAt: '2027-01-15 08:30',
    endedBehavior: ENDED_BEHAVIOR.hide
  },
  'end time with an ended message': {
    message: 'Sale',
    endsAt: '2027-01-15 08:30',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: 'Sale is over'
  },
  dismissible: { message: 'Sale', dismissible: true },
  'both colors': { message: 'Sale', backgroundColor: '#112233', textColor: '#ffffff' },
  'background color only': { message: 'Sale', backgroundColor: '#112233' },
  'text color only': { message: 'Sale', textColor: '#ffffff' },
  'everything set': {
    message: 'Sale',
    linkUrl: 'https://example.com/sale?a=1&b=2',
    endsAt: '2027-01-15 08:30',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: 'Sale is over',
    dismissible: true,
    backgroundColor: '#112233',
    textColor: '#ffffff'
  },
  'characters that need escaping': {
    message: '<b>"Fish" & chips</b>',
    linkUrl: '/search?q=a&b="c"',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: '<i>Over</i> & "done"'
  },
  'surrounding whitespace': {
    message: '  Sale  ',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: '  Over  '
  },
  'ended message behavior without an ended message': {
    message: 'Sale',
    endsAt: '2027-01-15 08:30',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: '   '
  },
  'blank ended message without an end time': {
    message: 'Sale',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: ''
  },
  'unparseable end time': { message: 'Sale', endsAt: 'soon' },
  'unparseable end time with the message behavior': {
    message: 'Sale',
    endsAt: 'soon',
    endedBehavior: ENDED_BEHAVIOR.message,
    endedMessage: 'Sale is over'
  },
  'end time before 1970': { message: 'Sale', endsAt: '1969-12-31 00:00' },
  'end time that is only a date': { message: 'Sale', endsAt: '2026-11-27' },
  'end time that is only digits': { message: 'Sale', endsAt: '123' },
  'end time in the past': { message: 'Sale', endsAt: '2020-01-01 00:00' },
  'mailto link': { message: 'Sale', linkUrl: 'mailto:a@b.c' },
  'javascript link': { message: 'Sale', linkUrl: 'javascript:alert(1)' },
  'protocol-relative link': { message: 'Sale', linkUrl: '//evil.example' },
  'http link without a host': { message: 'Sale', linkUrl: 'http://' },
  'https link without a host': { message: 'Sale', linkUrl: 'https://' },
  'link with a tab': { message: 'Sale', linkUrl: '/\t/evil.example' },
  'link with a newline': { message: 'Sale', linkUrl: '/path\nwith-newline' },
  'link with a space': { message: 'Sale', linkUrl: '/path with space' },
  'link with a backslash after the slash': { message: 'Sale', linkUrl: '/\\evil.example' },
  'link with an uppercase scheme': { message: 'Sale', linkUrl: 'HTTPS://EXAMPLE.COM/x' },
  'relative link': { message: 'Sale', linkUrl: '/collections/all' },
  'rgba color': { message: 'Sale', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  'named color': { message: 'Sale', textColor: 'red' },
  'five digit hex color': { message: 'Sale', backgroundColor: '#12345' },
  'uppercase short hex color': { message: 'Sale', backgroundColor: '#ABC' },
  'end time that is not a real date': { message: 'Sale', endsAt: '2026-02-30 10:00' },
  'link with an empty host before a query': { message: 'Sale', linkUrl: 'https://?q' },
  'link with an empty host before a fragment': { message: 'Sale', linkUrl: 'https://#x' },
  'link with an empty host before a port': { message: 'Sale', linkUrl: 'https://:443' },
  'link with an uppercase http scheme': { message: 'Sale', linkUrl: 'HTTP://example.com' }
};

const BACKSLASH_LINKS = [String.raw`/a\b`, String.raw`https://x/a\b`];

/** Settings as Liquid receives them. An unset setting is `null` when `unsetAsNil`, otherwise an empty string. */
function toLiquidSettings(input: MerchantInput, unsetAsNil = false): BlockSettings {
  const unset = unsetAsNil ? null : '';
  return {
    [SETTING.message]: input.message,
    [SETTING.linkUrl]: input.linkUrl ?? unset,
    [SETTING.endsAt]: input.endsAt ?? unset,
    [SETTING.endedBehavior]: input.endedBehavior ?? ENDED_BEHAVIOR.hide,
    [SETTING.endedMessage]: input.endedMessage ?? unset,
    [SETTING.dismissible]: input.dismissible ?? false,
    [SETTING.backgroundColor]: input.backgroundColor ?? unset,
    [SETTING.textColor]: input.textColor ?? unset
  };
}

/** The end time as the legacy parser receives it: store-local with an offset, so an impossible date stays impossible. */
function toLegacyEndsAt(endsAt: string): string {
  return parseLocalDateTime(endsAt)?.isoWithOffset ?? REJECTED_END_TIME;
}

function toLegacyRawSettings(input: MerchantInput): RawSettings {
  const raw: RawSettings = {
    [SETTING.message]: input.message,
    [SETTING.linkUrl]: input.linkUrl,
    [SETTING.endedBehavior]: input.endedBehavior,
    [SETTING.endedMessage]: input.endedMessage,
    [SETTING.dismissible]: String(input.dismissible ?? false),
    [SETTING.backgroundColor]: input.backgroundColor,
    [SETTING.textColor]: input.textColor
  };
  if (input.endsAt !== undefined) raw[SETTING.endsAt] = toLegacyEndsAt(input.endsAt);
  return raw;
}

function normalizeStyle(style: string): string[] {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== '')
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      return `${declaration.slice(0, separator).trim()}=${declaration.slice(separator + 1).trim()}`;
    })
    .sort();
}

function normalizeAttribute(name: string, value: string): string | number | string[] {
  if (name === 'style') return normalizeStyle(value);
  if (name === 'datetime') return Date.parse(value.replace(OFFSET_WITHOUT_COLON, '$1:$2'));
  return value;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalize(element: Element): NormalizedElement {
  const attributes: NormalizedElement['attributes'] = {};
  for (const { name, value } of Array.from(element.attributes)) {
    if (EMBED_ONLY_ATTRIBUTES.includes(name)) continue;
    attributes[name] = normalizeAttribute(name, value);
  }
  const children: NormalizedElement['children'] = [];
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      children.push(normalize(node as Element));
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent ?? '');
      if (text !== '') children.push(text);
    }
  }
  return { tag: element.tagName.toLowerCase(), attributes, children };
}

function parseFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function findLiquidRoot(html: string): Element | null {
  return parseFragment(html).querySelector(`[${ROOT_ATTRIBUTE}]`);
}

function invalidSettingsOn(root: Element): string[] {
  return (root.getAttribute(INVALID_ATTRIBUTE) ?? '').split(/\s+/).filter((id) => id !== '');
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  Reflect.deleteProperty(window, MOUNTED);
});

const SETTING_IDS: readonly string[] = Object.values(SETTING);

/** The setting a warning names, wherever its id appears as a word in the text. */
function warnedSettingId(call: unknown[]): string {
  const words = String(call[0]).split(/\s+/);
  return words.find((word) => SETTING_IDS.includes(word)) ?? '';
}

/** The setting ids, sorted, that the embed warns about when it enhances the rendered block. */
function embedWarnedSettings(html: string): string[] {
  const fragment = parseFragment(html);
  fragment.querySelector('link')?.remove();
  document.body.replaceChildren(fragment);
  warn.mockClear();
  mountEmbed(document);
  return warn.mock.calls.map(warnedSettingId).sort();
}

function legacyWarnedSettings(input: MerchantInput): string[] {
  return parseConfig(toLegacyRawSettings(input))
    .warnings.map(({ setting }) => setting)
    .sort();
}

describe('Liquid block and buildBar parity across the case table', () => {
  it.each(Object.entries(CASES))('renders the same tree for: %s', (_name, input) => {
    const liquidRoot = findLiquidRoot(renderBlock(toLiquidSettings(input)));
    const { config } = parseConfig(toLegacyRawSettings(input));

    expect(liquidRoot).not.toBeNull();
    expect(config).not.toBeNull();
    if (liquidRoot === null || config === null) return;
    expect(normalize(buildBar(config))).toEqual(normalize(liquidRoot));
  });

  it.each(Object.entries(CASES))(
    'round-trips through the embed parser to the same config and warnings for: %s',
    (_name, input) => {
      const html = renderBlock(toLiquidSettings(input));
      const liquidRoot = findLiquidRoot(html);

      expect(liquidRoot).not.toBeNull();
      if (liquidRoot === null) return;
      expect(parseConfig(readRawSettings(liquidRoot)).config).toEqual(
        parseConfig(toLegacyRawSettings(input)).config
      );
      expect(embedWarnedSettings(html)).toEqual(legacyWarnedSettings(input));
    }
  );
});

describe('Liquid block and buildBar parity', () => {
  it('renders identically whether unset settings are nil or empty strings', () => {
    const input: MerchantInput = { message: 'Sale' };

    const withNil = renderBlock(toLiquidSettings(input, true));
    const withEmpty = renderBlock(toLiquidSettings(input, false));
    const root = findLiquidRoot(withNil);

    expect(withNil).toBe(withEmpty);
    expect(root).not.toBeNull();
    if (root === null) return;
    const parsed = parseConfig(readRawSettings(root));
    expect(parsed.config).toEqual(parseConfig(toLegacyRawSettings(input)).config);
    expect(parsed.warnings).toEqual([]);
    expect(invalidSettingsOn(root)).toEqual([]);
  });

  it('lists an all-digit end time as invalid and emits no end time', () => {
    const input: MerchantInput = { message: 'Sale', endsAt: '123' };
    const root = findLiquidRoot(renderBlock(toLiquidSettings(input)));

    expect(root).not.toBeNull();
    if (root === null) return;
    expect(invalidSettingsOn(root)).toEqual([SETTING.endsAt]);
    expect(root.hasAttribute(dataAttributeFor(SETTING.endsAt))).toBe(false);
    expect(parseConfig(toLegacyRawSettings(input)).config?.endsAtMs).toBeUndefined();
  });

  it('lists each dropped setting in the invalid attribute', () => {
    const root = findLiquidRoot(
      renderBlock(
        toLiquidSettings({
          message: 'Sale',
          linkUrl: 'javascript:alert(1)',
          endsAt: 'soon',
          backgroundColor: 'red',
          textColor: 'blue'
        })
      )
    );

    expect(root && new Set(invalidSettingsOn(root))).toEqual(
      new Set([SETTING.linkUrl, SETTING.endsAt, SETTING.backgroundColor, SETTING.textColor])
    );
  });

  it('leaves the invalid attribute off when every setting is valid', () => {
    const root = findLiquidRoot(
      renderBlock(
        toLiquidSettings({ message: 'Sale', linkUrl: '/sale', endsAt: '2027-01-15 08:30' })
      )
    );

    expect(root?.hasAttribute(INVALID_ATTRIBUTE)).toBe(false);
  });

  it('renders a link containing Unicode whitespace that only the embed parser rejects', () => {
    const html = renderBlock(
      toLiquidSettings({ message: 'Sale', linkUrl: `/a${NON_BREAKING_SPACE}b` })
    );
    const root = findLiquidRoot(html);

    expect(root).not.toBeNull();
    if (root === null) return;
    expect(root.hasAttribute(INVALID_ATTRIBUTE)).toBe(false);
    expect(parseConfig(readRawSettings(root)).config?.linkUrl).toBeUndefined();
    expect(embedWarnedSettings(html)).toEqual([SETTING.linkUrl]);
  });

  it.each(BACKSLASH_LINKS)(
    'drops a link containing a backslash that only the embed block rejects: %s',
    (linkUrl) => {
      const root = findLiquidRoot(renderBlock(toLiquidSettings({ message: 'Sale', linkUrl })));

      expect(root).not.toBeNull();
      if (root === null) return;
      expect(invalidSettingsOn(root)).toEqual([SETTING.linkUrl]);
      expect(root.hasAttribute(dataAttributeFor(SETTING.linkUrl))).toBe(false);
      expect(parseConfig(toLegacyRawSettings({ message: 'Sale', linkUrl })).config?.linkUrl).toBe(
        linkUrl
      );
    }
  );

  it('marks the root in the theme editor only', () => {
    const settings = toLiquidSettings({ message: 'Sale' });

    expect(
      findLiquidRoot(renderBlock(settings, { designMode: true }))?.hasAttribute(
        DESIGN_MODE_ATTRIBUTE
      )
    ).toBe(true);
    expect(findLiquidRoot(renderBlock(settings))?.hasAttribute(DESIGN_MODE_ATTRIBUTE)).toBe(false);
  });

  it('loads the stylesheet before the bar', () => {
    const fragment = parseFragment(renderBlock(toLiquidSettings({ message: 'Sale' })));
    const link = fragment.querySelector('link[rel="stylesheet"]');
    const root = fragment.querySelector(`[${ROOT_ATTRIBUTE}]`);

    expect(link?.getAttribute('href')?.endsWith(`/${STYLESHEET_ASSET}`)).toBe(true);
    expect(link && root && link.compareDocumentPosition(root)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(existsSync(extensionPath(`assets/${STYLESHEET_ASSET}`))).toBe(true);
  });

  it('renders no bar for an empty message on either side', () => {
    const input: MerchantInput = { message: '   ' };

    expect(findLiquidRoot(renderBlock(toLiquidSettings(input)))).toBeNull();
    expect(parseConfig(toLegacyRawSettings(input)).config).toBeNull();
  });
});

describe('block schema', () => {
  const schema = readBlockSchema();

  it('declares exactly the settings the widget reads', () => {
    expect(new Set(schema.settings.map((setting) => setting.id))).toEqual(
      new Set(Object.values(SETTING))
    );
  });

  it('targets the body and loads the embed bundle', () => {
    const embedBundle = BUNDLES.find(({ entry }) => basename(entry) === 'entry-embed.ts');

    expect(schema.target).toBe('body');
    expect(embedBundle).toBeDefined();
    expect(schema.javascript).toBe(embedBundle && basename(embedBundle.outfile));
  });
});
