import '@shopify/ui-extensions/preact';

import { render } from 'preact';

import { ReorderPointBlock } from './ReorderPointBlock';

export default async () => {
  render(<ReorderPointBlock />, document.body);
};
