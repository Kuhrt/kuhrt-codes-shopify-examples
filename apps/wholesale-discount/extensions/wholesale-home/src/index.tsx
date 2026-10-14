import '@shopify/ui-extensions/preact';

import { render } from 'preact';

import { AppHome } from './AppHome';

export default async () => {
  render(<AppHome />, document.body);
};
