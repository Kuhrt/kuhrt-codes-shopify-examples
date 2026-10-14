import { setUpExtension } from '@shopify/ui-extensions-tester';
import { expect, test } from 'vitest';

test('renders the settings inside the function settings root', async () => {
  using extension = setUpExtension('admin.discount-details.function-settings.render');
  await extension.render();
  expect(document.body.querySelector('s-function-settings')).not.toBeNull();
});
