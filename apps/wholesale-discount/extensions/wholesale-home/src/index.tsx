import '@shopify/ui-extensions/preact';

import { render } from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-page>
      <s-text>Wholesale discounts placeholder</s-text>
    </s-page>
  );
}
