import { expect, test } from '@playwright/test';

import { barLocators } from './bar';
import { barConfig, MESSAGE } from './campaign';
import { openPage } from './pages';

test.describe('embed page without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the server-rendered bar shows its message and link', async ({ page }) => {
    const linkUrl = '/sale';
    await openPage(page, 'embed', barConfig({ linkUrl }));
    const { bar, message } = barLocators(page);

    await expect(bar).toBeVisible();
    await expect(message).toContainText(MESSAGE);
    await expect(bar.getByRole('link')).toHaveAttribute('href', linkUrl);
  });
});
