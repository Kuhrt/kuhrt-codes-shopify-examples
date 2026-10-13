import { describe, expect, it } from 'vitest';

import type { BarConfig } from '../widget/config';
import { parseConfig } from '../widget/config';
import { readSearchParams, SETTING } from '../widget/settings';
import { LEGACY_SCRIPT_PATH, legacyScriptUrl, toQuery } from './settings-url';

const MINIMAL: BarConfig = { message: 'Hello', ended: { behavior: 'hide' }, dismissible: false };

const EVERYTHING: BarConfig = {
  message: 'Free shipping this weekend',
  linkUrl: 'https://example.com/sale',
  endsAtMs: Date.UTC(2030, 5, 1, 12, 30, 45),
  ended: { behavior: 'message', message: 'The sale has ended' },
  dismissible: true,
  backgroundColor: '#112233',
  textColor: '#fff'
};

const CASES: Record<string, BarConfig> = {
  minimal: MINIMAL,
  everything: EVERYTHING,
  'unicode and emoji': {
    ...MINIMAL,
    message: 'Soldes d’été — 日本語 🎉',
    ended: { behavior: 'message', message: 'Terminé 😢' }
  },
  'reserved characters': {
    ...MINIMAL,
    message: 'Save 50% & more = fun + games #1 /?',
    ended: { behavior: 'message', message: 'a&b=c+d#e%f 100%' }
  },
  'percent-encoded lookalikes': { ...MINIMAL, message: '%26 %3D %2B %20 %' },
  'inner spaces': { ...MINIMAL, message: 'two  spaces   and\ttab' },
  'relative link with a query string': {
    ...MINIMAL,
    linkUrl: '/collections/sale?sort_by=price-ascending&page=2#top'
  },
  'absolute link with a query string': {
    ...MINIMAL,
    linkUrl: 'https://example.com/a?b=c&d=e%20f'
  },
  'ended message': { ...EVERYTHING, ended: { behavior: 'message', message: 'Over!' } },
  'ended hide with end time': { ...EVERYTHING, ended: { behavior: 'hide' } },
  'epoch zero': { ...MINIMAL, endsAtMs: 0 }
};

function roundTrip(settings: BarConfig): ReturnType<typeof parseConfig> {
  return parseConfig(readSearchParams(new URLSearchParams(toQuery(settings))));
}

describe('toQuery', () => {
  it.each(Object.entries(CASES))('round-trips %s through parseConfig', (_name, settings) => {
    expect(roundTrip(settings)).toEqual({ config: settings, warnings: [] });
  });

  it('drops sub-second precision from the end time, as parseConfig does', () => {
    const settings = { ...MINIMAL, endsAtMs: 1_900_000_000_999 };

    expect(roundTrip(settings).config?.endsAtMs).toBe(1_900_000_000_000);
  });

  it('omits unset optional settings', () => {
    const names = [...new URLSearchParams(toQuery(MINIMAL)).keys()];

    expect(names).not.toContain(SETTING.linkUrl);
    expect(names).not.toContain(SETTING.endsAt);
    expect(names).not.toContain(SETTING.endedMessage);
    expect(names).not.toContain(SETTING.backgroundColor);
    expect(names).not.toContain(SETTING.textColor);
  });

  it('contains only known setting names', () => {
    const known = new Set<string>(Object.values(SETTING));

    for (const name of new URLSearchParams(toQuery(EVERYTHING)).keys()) {
      expect(known.has(name)).toBe(true);
    }
  });
});

describe('legacyScriptUrl', () => {
  it('is the app origin, the script path and the query', () => {
    const url = new URL(legacyScriptUrl('https://app.example.com/some/path?x=1', EVERYTHING));

    expect(url.origin).toBe('https://app.example.com');
    expect(url.pathname).toBe(LEGACY_SCRIPT_PATH);
    expect(url.search).toBe(`?${toQuery(EVERYTHING)}`);
    expect(url.hash).toBe('');
  });

  it('carries settings that parse back from the script URL', () => {
    const { searchParams } = new URL(legacyScriptUrl('https://app.example.com', EVERYTHING));

    expect(parseConfig(readSearchParams(searchParams))).toEqual({
      config: EVERYTHING,
      warnings: []
    });
  });

  it.each(['http://app.example.com', 'not a url', '/relative'])('rejects %s', (appUrl) => {
    expect(() => legacyScriptUrl(appUrl, MINIMAL)).toThrow();
  });
});
