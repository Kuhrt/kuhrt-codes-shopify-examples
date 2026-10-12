// @vitest-environment happy-dom
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUNDLES } from '../scripts/build-widget';
import { parseConfig } from './config';
import type { BlockSettings } from './liquid-test-support';
import {
  extensionPath,
  parseLocalDateTime,
  readBlockSchema,
  renderBlock
} from './liquid-test-support';
import { buildBar } from './render';
import type { RawSettings } from './settings';
import { ENDED_BEHAVIOR, ROOT_ATTRIBUTE, SETTING } from './settings';

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
  'unparseable end time': { message: 'Sale', endsAt: 'soon' },
  'end time in the past': { message: 'Sale', endsAt: '2020-01-01 00:00' },
  'end time with trailing characters': { message: 'Sale', endsAt: '123abc' },
  'mailto link': { message: 'Sale', linkUrl: 'mailto:a@b.c' },
  'javascript link': { message: 'Sale', linkUrl: 'javascript:alert(1)' },
  'protocol-relative link': { message: 'Sale', linkUrl: '//evil.example' },
  'link with a space': { message: 'Sale', linkUrl: '/path with space' },
  'link with a backslash after the slash': { message: 'Sale', linkUrl: '/\\evil.example' },
  'link with an uppercase scheme': { message: 'Sale', linkUrl: 'HTTPS://EXAMPLE.COM/x' },
  'relative link': { message: 'Sale', linkUrl: '/collections/all' },
  'rgba color': { message: 'Sale', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  'named color': { message: 'Sale', textColor: 'red' },
  'five digit hex color': { message: 'Sale', backgroundColor: '#12345' },
  'uppercase short hex color': { message: 'Sale', backgroundColor: '#ABC' }
};

function toLiquidSettings(input: MerchantInput): BlockSettings {
  return {
    [SETTING.message]: input.message,
    [SETTING.linkUrl]: input.linkUrl,
    [SETTING.endsAt]: input.endsAt ?? '',
    [SETTING.endedBehavior]: input.endedBehavior ?? ENDED_BEHAVIOR.hide,
    [SETTING.endedMessage]: input.endedMessage ?? '',
    [SETTING.dismissible]: input.dismissible ?? false,
    [SETTING.backgroundColor]: input.backgroundColor ?? '',
    [SETTING.textColor]: input.textColor ?? ''
  };
}

function toEpochSecondsText(endsAt: string): string {
  const parsed = parseLocalDateTime(endsAt);
  return parsed ? String(parsed.epochSeconds) : endsAt;
}

function toRawSettings(input: MerchantInput): RawSettings {
  const raw: RawSettings = {
    [SETTING.message]: input.message,
    [SETTING.linkUrl]: input.linkUrl,
    [SETTING.endedBehavior]: input.endedBehavior,
    [SETTING.endedMessage]: input.endedMessage,
    [SETTING.dismissible]: String(input.dismissible ?? false),
    [SETTING.backgroundColor]: input.backgroundColor,
    [SETTING.textColor]: input.textColor
  };
  if (input.endsAt !== undefined) raw[SETTING.endsAt] = toEpochSecondsText(input.endsAt);
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

describe('Liquid block and buildBar parity', () => {
  it.each(Object.entries(CASES))('renders the same tree for: %s', (_name, input) => {
    const liquidRoot = findLiquidRoot(renderBlock(toLiquidSettings(input)));
    const { config } = parseConfig(toRawSettings(input));

    expect(liquidRoot).not.toBeNull();
    expect(config).not.toBeNull();
    if (liquidRoot === null || config === null) return;
    expect(normalize(buildBar(config))).toEqual(normalize(liquidRoot));
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
    expect(parseConfig(toRawSettings(input)).config).toBeNull();
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
