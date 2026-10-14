import { setUpExtension } from '@shopify/ui-extensions-tester';
import { expect, test } from 'vitest';

test('renders the app home inside a page', async () => {
  using extension = setUpExtension('admin.app.home.render');
  await extension.render();
  expect(document.body.querySelector('s-page')).not.toBeNull();
});
