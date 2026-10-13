import { expect, test } from '@playwright/test';

import { LOG_PREFIX } from '../widget/mount';
import { barLocators } from './bar';
import { barConfig } from './campaign';
import { openPage } from './pages';
import { EMBED_STYLESHEET_PATH, LEGACY_STYLESHEET_PATH } from './routes';

test('a page with the embed and the legacy script shows one bar and warns once', async ({
  page
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().startsWith(LOG_PREFIX)) {
      warnings.push(message.text());
    }
  });

  await openPage(page, 'double', barConfig());
  const { roots, bar } = barLocators(page);

  await expect(bar).toBeVisible();
  await expect.poll(() => warnings.length).toBe(1);
  await expect(roots).toHaveCount(1);
  await expect(page.locator(`link[href$="${EMBED_STYLESHEET_PATH}"]`)).toHaveCount(1);
  await expect(page.locator(`link[href$="${LEGACY_STYLESHEET_PATH}"]`)).toHaveCount(0);
});
