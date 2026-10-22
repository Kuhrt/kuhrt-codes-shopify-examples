import type { Variables } from '@repo/store-execute';

import { type DemoProduct, WHOLESALE_TAG } from './demo-data.ts';

/** Each mutation's name mapped to the key its result is under in the response data. */
export const MUTATION_PAYLOAD_KEYS = {
  'product-set': 'productSet',
  'publishable-publish': 'publishablePublish',
  'customer-set': 'customerSet',
  'tags-add': 'tagsAdd'
} as const;

export type MutationName = keyof typeof MUTATION_PAYLOAD_KEYS;
export type OperationName = 'publications' | MutationName;

export const MUTATION_NAMES = Object.keys(MUTATION_PAYLOAD_KEYS) as MutationName[];
export const OPERATION_NAMES: OperationName[] = ['publications', ...MUTATION_NAMES];

export function isMutation(operation: OperationName): operation is MutationName {
  return operation in MUTATION_PAYLOAD_KEYS;
}

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

/** Finds or creates the customer by email, leaving every other field as it is. */
export function customerSetVariables(email: string): Variables {
  return { identifier: { email }, input: { email } };
}

export function tagsAddVariables(customerId: string): Variables {
  return { id: customerId, tags: [WHOLESALE_TAG] };
}

export function publishVariables(productId: string, publicationId: string): Variables {
  return { id: productId, input: [{ publicationId }] };
}
