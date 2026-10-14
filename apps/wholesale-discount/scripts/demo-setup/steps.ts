import { DEMO_CUSTOMER, type DemoProduct, WHOLESALE_TAG } from './demo-data.ts';

export type OperationName = 'publications' | 'product-set' | 'publishable-publish' | 'customer-set';
export type Variables = Record<string, unknown>;

export function productSetVariables(product: DemoProduct): Variables {
  return {
    identifier: { handle: product.handle },
    input: {
      title: product.title,
      handle: product.handle,
      status: 'ACTIVE',
      productOptions: [
        {
          name: product.optionName,
          values: product.optionValues.map((name) => ({ name }))
        }
      ],
      variants: product.optionValues.map((name) => ({
        optionValues: [{ optionName: product.optionName, name }],
        price: product.price,
        inventoryItem: { tracked: false }
      }))
    }
  };
}

export function customerSetVariables(email: string): Variables {
  return {
    identifier: { email },
    input: { email, ...DEMO_CUSTOMER, tags: [WHOLESALE_TAG] }
  };
}

export function publishVariables(productId: string, publicationId: string): Variables {
  return { id: productId, input: [{ publicationId }] };
}
