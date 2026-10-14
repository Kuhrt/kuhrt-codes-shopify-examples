import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Tier } from '../../../shared/tier-config';
import { type CartInput, DiscountClass } from '../generated/api';
import {
  cartLinesDiscountsGenerateRun,
  discountMessage
} from './cart_lines_discounts_generate_run';

type TestLine = CartInput['cart']['lines'][number];

const TIERS: Tier[] = [
  { minQuantity: 10, percentage: 10 },
  { minQuantity: 50, percentage: 15 }
];

function variantLine(id: string, productId: string, quantity: number): TestLine {
  return {
    id,
    quantity,
    merchandise: { __typename: 'ProductVariant', product: { id: productId } }
  };
}

function customLine(id: string, quantity: number): TestLine {
  return { id, quantity, merchandise: { __typename: 'CustomProduct' } };
}

type Buyer = 'tagged' | 'untagged' | 'no-buyer-identity' | 'no-customer';

const BUYER_IDENTITIES: Record<Buyer, CartInput['cart']['buyerIdentity']> = {
  tagged: { customer: { hasTags: [{ hasTag: true }] } },
  untagged: { customer: { hasTags: [{ hasTag: false }] } },
  'no-buyer-identity': null,
  'no-customer': { customer: null }
};

interface InputOptions {
  lines: TestLine[];
  buyer?: Buyer;
  classes?: DiscountClass[];
  config?: unknown;
}

function buildInput({
  lines,
  buyer = 'tagged',
  classes = [DiscountClass.Product],
  config = { tag: 'wholesale', tiers: TIERS }
}: InputOptions): CartInput {
  return {
    cart: {
      buyerIdentity: BUYER_IDENTITIES[buyer],
      lines
    },
    discount: { discountClasses: classes, metafield: { jsonValue: config } }
  };
}

function candidatesOf(input: CartInput) {
  const { operations } = cartLinesDiscountsGenerateRun(input);
  expect(operations).toHaveLength(1);
  const add = operations[0]?.productDiscountsAdd;
  if (!add) throw new Error('expected a productDiscountsAdd operation');
  return add;
}

function expectNoDiscount(input: CartInput) {
  expect(cartLinesDiscountsGenerateRun(input)).toEqual({ operations: [] });
}

function targetIds(candidate: { targets: { cartLine: { id: string } }[] }): string[] {
  return candidate.targets.map(({ cartLine }) => cartLine.id);
}

function silenceErrorLog() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

function loggedIssues(spy: ReturnType<typeof silenceErrorLog>) {
  expect(spy).toHaveBeenCalledTimes(1);
  const logged = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
    issues: { code: string; path: unknown[] }[];
  };
  return logged.issues;
}

describe('cartLinesDiscountsGenerateRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('who qualifies', () => {
    it('discounts a tagged customer whose cart reaches a tier', () => {
      const { candidates, selectionStrategy } = candidatesOf(
        buildInput({ lines: [variantLine('line-1', 'p1', 10)] })
      );
      expect(selectionStrategy).toBe('ALL');
      expect(candidates).toEqual([
        {
          message: discountMessage(10),
          targets: [{ cartLine: { id: 'line-1' } }],
          value: { percentage: { value: '10' } }
        }
      ]);
    });

    it.each(['untagged', 'no-buyer-identity', 'no-customer'] as const)(
      'applies nothing for a %s buyer',
      (buyer) => {
        expectNoDiscount(buildInput({ lines: [variantLine('line-1', 'p1', 10)], buyer }));
      }
    );

    it('applies nothing for a customer without tag results', () => {
      const input = buildInput({ lines: [variantLine('line-1', 'p1', 10)] });
      input.cart.buyerIdentity = { customer: { hasTags: [] } };
      expectNoDiscount(input);
    });
  });

  describe('how quantity is counted', () => {
    it('sums the variants of one product and targets every line', () => {
      const { candidates } = candidatesOf(
        buildInput({ lines: [variantLine('small', 'p1', 6), variantLine('medium', 'p1', 6)] })
      );
      expect(candidates).toHaveLength(1);
      expect(targetIds(candidates[0]!)).toEqual(['small', 'medium']);
      expect(candidates[0]?.value).toEqual({ percentage: { value: '10' } });
    });

    it('counts different products separately', () => {
      const input = buildInput({
        lines: [variantLine('line-1', 'p1', 6), variantLine('line-2', 'p2', 6)]
      });
      expectNoDiscount(input);
    });

    it('ignores non-product lines and does not count their quantity', () => {
      const { candidates } = candidatesOf(
        buildInput({ lines: [variantLine('line-1', 'p1', 10), customLine('custom', 40)] })
      );
      expect(candidates).toHaveLength(1);
      expect(targetIds(candidates[0]!)).toEqual(['line-1']);
      expect(candidates[0]?.value).toEqual({ percentage: { value: '10' } });
    });

    it('does not let non-product quantity lift a product into a tier', () => {
      const input = buildInput({
        lines: [variantLine('line-1', 'p1', 5), customLine('custom', 40)]
      });
      expectNoDiscount(input);
    });
  });

  describe('which tier applies', () => {
    it('applies the lower tier between tiers', () => {
      const { candidates } = candidatesOf(buildInput({ lines: [variantLine('line-1', 'p1', 20)] }));
      expect(candidates[0]?.value).toEqual({ percentage: { value: '10' } });
    });

    it('applies only the top tier exactly on its threshold', () => {
      const { candidates } = candidatesOf(buildInput({ lines: [variantLine('line-1', 'p1', 50)] }));
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.value).toEqual({ percentage: { value: '15' } });
    });

    it('applies nothing below the lowest tier', () => {
      const input = buildInput({ lines: [variantLine('line-1', 'p1', 9)] });
      expectNoDiscount(input);
    });

    it('produces one candidate per qualifying product at its own tier', () => {
      const { candidates } = candidatesOf(
        buildInput({
          lines: [
            variantLine('line-1', 'p1', 12),
            variantLine('line-2', 'p2', 60),
            variantLine('line-3', 'p3', 3)
          ]
        })
      );
      expect(candidates.map((candidate) => [targetIds(candidate), candidate.value])).toEqual([
        [['line-1'], { percentage: { value: '10' } }],
        [['line-2'], { percentage: { value: '15' } }]
      ]);
    });
  });

  describe('discount classes', () => {
    it('produces only product discounts', () => {
      const { operations } = cartLinesDiscountsGenerateRun(
        buildInput({
          lines: [variantLine('line-1', 'p1', 10)],
          classes: [DiscountClass.Product, DiscountClass.Order]
        })
      );
      expect(operations.map((operation) => Object.keys(operation))).toEqual([
        ['productDiscountsAdd']
      ]);
    });

    it('applies nothing when the product class is not enabled', () => {
      const input = buildInput({
        lines: [variantLine('line-1', 'p1', 10)],
        classes: [DiscountClass.Order]
      });
      expectNoDiscount(input);
    });
  });

  describe('invalid configuration', () => {
    it('applies nothing and logs the issue codes and paths', () => {
      const spy = silenceErrorLog();
      const config = {
        tag: 'wholesale',
        tiers: [
          { minQuantity: 10, percentage: 15 },
          { minQuantity: 50, percentage: 10 }
        ]
      };
      const input = buildInput({ lines: [variantLine('line-1', 'p1', 60)], config });

      expectNoDiscount(input);
      expect(loggedIssues(spy)).toEqual([
        { code: 'percentage-not-increasing', path: ['tiers', 1, 'percentage'] }
      ]);
    });

    it('applies nothing and logs when the configuration is absent', () => {
      const spy = silenceErrorLog();
      const input = buildInput({ lines: [variantLine('line-1', 'p1', 60)], config: null });

      expectNoDiscount(input);
      expect(loggedIssues(spy)).toEqual([{ code: 'not-an-object', path: [] }]);
    });

    it.each(['untagged', 'no-buyer-identity'] as const)(
      'logs invalid configuration even for a %s buyer',
      (buyer) => {
        const spy = silenceErrorLog();
        expectNoDiscount(
          buildInput({ lines: [variantLine('line-1', 'p1', 60)], buyer, config: null })
        );
        expect(loggedIssues(spy)).toEqual([{ code: 'not-an-object', path: [] }]);
      }
    );

    it('does not log for a valid configuration', () => {
      const spy = silenceErrorLog();
      cartLinesDiscountsGenerateRun(buildInput({ lines: [variantLine('line-1', 'p1', 60)] }));
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
