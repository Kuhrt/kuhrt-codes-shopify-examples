import { ONLINE_STORE_PUBLICATION } from './demo-data.ts';
import type { Executor } from './run-demo-setup.ts';
import type { OperationName, Variables } from './steps.ts';

export const PUBLICATION_ID = 'gid://shopify/Publication/1';
export const CUSTOMER_ID = 'gid://shopify/Customer/1';

export function productIdFor(handle: string): string {
  return `gid://shopify/Product/${handle}`;
}

export interface Call {
  operation: OperationName;
  variables: Variables;
}

export type Respond = (call: Call) => unknown;

/** The response a store gives when every operation succeeds. */
export const happyResponse: Respond = ({ operation, variables }) => {
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
export function fakeExecutor(respond: Respond = happyResponse) {
  const calls: Call[] = [];
  const executor: Executor = (operation, variables) => {
    const call = { operation, variables };
    calls.push(call);
    return Promise.resolve().then(() => respond(call));
  };
  return { executor, calls };
}
