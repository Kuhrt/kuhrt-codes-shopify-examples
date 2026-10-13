import type { Page } from '@playwright/test';

import { toQuery } from '../legacy/settings-url';
import type { BarConfig } from '../widget/config';
import { toEpochSeconds, toRawSettings } from '../widget/config';
import { toStoreLocalDateTime } from '../widget/liquid-test-support';
import { SETTING } from '../widget/settings';
import { DOUBLE_PATH, EMBED_PATH, LEGACY_PATH } from './routes';

export const PAGE_KINDS = ['embed', 'legacy'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

const PATHS: Record<PageKind | 'double', string> = {
  embed: EMBED_PATH,
  legacy: LEGACY_PATH,
  double: DOUBLE_PATH
};

/** The block settings of the embed page: the end time is store-local text, as a merchant enters it. */
function blockQuery(config: BarConfig): string {
  const settings = { ...toRawSettings(config) };
  if (config.endsAtMs !== undefined) {
    settings[SETTING.endsAt] = toStoreLocalDateTime(toEpochSeconds(config.endsAtMs));
  }
  return new URLSearchParams(settings).toString();
}

/**
 * The URL of a page showing `config`. The double-load page reads block settings and passes them
 * to the legacy script unchanged, so a campaign with an end time is only meaningful on the other pages.
 */
export function pageUrl(kind: PageKind | 'double', config: BarConfig): string {
  const query = kind === 'legacy' ? toQuery(config) : blockQuery(config);
  return `${PATHS[kind]}?${query}`;
}

export async function openPage(
  page: Page,
  kind: PageKind | 'double',
  config: BarConfig
): Promise<void> {
  await page.goto(pageUrl(kind, config));
}
