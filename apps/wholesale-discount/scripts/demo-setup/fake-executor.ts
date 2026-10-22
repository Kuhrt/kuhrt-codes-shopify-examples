import { fakeExecutor as recordingExecutor, type Respond } from '@repo/store-execute';

import { ONLINE_STORE_PUBLICATION } from './demo-data.ts';
import type { OperationName } from './steps.ts';

export const PUBLICATION_ID = 'gid://shopify/Publication/1';
export const CUSTOMER_ID = 'gid://shopify/Customer/1';

export function productIdFor(handle: string): string {
  return `gid://shopify/Product/${handle}`;
}

/** The response a store gives when every operation succeeds. */
export const happyResponse: Respond<OperationName> = ({ operation, variables }) => {
  switch (operation) {
    case 'publications':
      return {
        publications: {
          nodes: [
            { id: 'gid://shopify/Publication/9', name: 'Point of Sale' },
            { id: PUBLICATION_ID, name: ONLINE_STORE_PUBLICATION }
          ]
        }
      };
    case 'product-set': {
      const handle = (variables['identifier'] as { handle: string }).handle;
      return { productSet: { product: { id: productIdFor(handle) }, userErrors: [] } };
    }
    case 'publishable-publish':
      return { publishablePublish: { userErrors: [] } };
    case 'customer-set':
      return { customerSet: { customer: { id: CUSTOMER_ID }, userErrors: [] } };
    case 'tags-add':
      return { tagsAdd: { node: { id: CUSTOMER_ID }, userErrors: [] } };
  }
};

/** An executor that records every call and answers with `respond`. */
export function fakeExecutor(respond: Respond<OperationName> = happyResponse) {
  return recordingExecutor<OperationName>(respond);
}
