import '@shopify/ui-extensions/preact';

import { render } from 'preact';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-function-settings>
      <s-text>Wholesale settings placeholder</s-text>
    </s-function-settings>
  );
}
