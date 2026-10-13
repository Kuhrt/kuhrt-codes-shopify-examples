import { readdirSync } from 'node:fs';
import { basename } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BLOCK_HANDLE, embedStatusFrom, themeEditorLink } from './embed';
import { extensionsPayload } from './extensions-fixture';

describe('embedStatusFrom', () => {
  it.each([
    ['active', 'active'],
    ['available', 'inactive'],
    ['unavailable', 'unknown']
  ] as const)('maps a %s block to %s', (blockStatus, expected) => {
    expect(embedStatusFrom(extensionsPayload({ status: blockStatus }))).toBe(expected);
  });

  it('is unknown when there is no block entry', () => {
    expect(embedStatusFrom([])).toBe('unknown');
    expect(embedStatusFrom(undefined)).toBe('unknown');
    expect(
      embedStatusFrom([
        { handle: 'theme-app-extension', type: 'theme_app_extension', activations: [] }
      ])
    ).toBe('unknown');
  });

  it('does not confirm an active block under a different block handle', () => {
    expect(
      embedStatusFrom(extensionsPayload({ status: 'active', blockHandle: 'other-block' }))
    ).toBe('unknown');
  });

  it('matches the block handle, not the extension handle', () => {
    const payload = extensionsPayload({
      status: 'active',
      blockHandle: 'other-block',
      extensionHandle: BLOCK_HANDLE
    });
    expect(embedStatusFrom(payload)).toBe('unknown');
  });

  it('ignores UI extensions', () => {
    expect(
      embedStatusFrom([
        { handle: BLOCK_HANDLE, type: 'ui_extension', activations: [{ target: 'x' }] }
      ])
    ).toBe('unknown');
  });
});

describe('themeEditorLink', () => {
  const link = new URL(themeEditorLink('my-store', 'client-123'));

  it('opens the published theme editor on the store admin', () => {
    expect(link.origin).toBe('https://admin.shopify.com');
    expect(link.pathname).toBe('/store/my-store/themes/current/editor');
  });

  it('opens the app embeds panel with this app embed activated', () => {
    expect(link.searchParams.get('context')).toBe('apps');
    expect(link.searchParams.get('activateAppId')).toBe(`client-123/${BLOCK_HANDLE}`);
  });

  it('keeps the slash in activateAppId literal', () => {
    expect(link.search).toContain(`activateAppId=client-123/${BLOCK_HANDLE}`);
  });
});

describe('BLOCK_HANDLE', () => {
  it('is the filename of the theme extension block', () => {
    const blocks = readdirSync(
      new URL('../../../extensions/announcement-bar/blocks/', import.meta.url)
    );
    expect(blocks.map((file) => basename(file, '.liquid'))).toEqual([BLOCK_HANDLE]);
  });
});
