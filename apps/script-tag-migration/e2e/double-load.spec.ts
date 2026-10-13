import { expect, test } from '@playwright/test';

import { LOG_PREFIX } from '../widget/mount';
import { barLocators } from './bar';
import { barConfig, MESSAGE } from './campaign';
import { openPage } from './pages';

test('a page with the embed and the legacy script shows the embed bar once and warns once', async ({
  page
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().startsWith(LOG_PREFIX)) {
      warnings.push(message.text());
    }
  });

  await openPage(page, 'double', barConfig());
  const { roots, bar, message } = barLocators(page);

  await expect(bar).toBeVisible();
  await expect.poll(() => warnings.length).toBe(1);
  await expect(roots).toHaveCount(1);
  await expect(message).toHaveText(MESSAGE);
});
