import '@shopify/ui-extensions/preact';

import { render } from 'preact';

import { Settings } from './Settings';

export default async () => {
  render(<Settings />, document.body);
};
