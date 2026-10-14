import {
  parseTierConfig,
  pickTier,
  type Tier,
  type TierConfigIssue
} from '../../../shared/tier-config';
import {
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
  DiscountClass,
  ProductDiscountSelectionStrategy
} from '../generated/api';

type CartLine = CartInput['cart']['lines'][number];

interface ProductLines {
  quantity: number;
  lineIds: string[];
}

const NO_OPERATIONS: CartLinesDiscountsGenerateRunResult = { operations: [] };

export function discountMessage(percentage: number): string {
  return `Wholesale ${percentage}% off`;
}

function logInvalidConfig(issues: TierConfigIssue[]): void {
  console.error(JSON.stringify({ wholesaleTiers: 'invalid-config', issues }));
}

function isTaggedCustomer(input: CartInput): boolean {
  const tagResults = input.cart.buyerIdentity?.customer?.hasTags ?? [];
  return tagResults.some(({ hasTag }) => hasTag);
}

function linesByProduct(lines: CartLine[]): Map<string, ProductLines> {
  const products = new Map<string, ProductLines>();
  for (const line of lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    const productId = line.merchandise.product.id;
    const entry = products.get(productId) ?? { quantity: 0, lineIds: [] };
    entry.quantity += line.quantity;
    entry.lineIds.push(line.id);
    products.set(productId, entry);
  }
  return products;
}

function buildCandidate(tier: Tier, lineIds: string[]) {
  return {
    message: discountMessage(tier.percentage),
    targets: lineIds.map((id) => ({ cartLine: { id } })),
    value: { percentage: { value: String(tier.percentage) } }
  };
}

function buildCandidates(tiers: Tier[], products: Map<string, ProductLines>) {
  return [...products.values()].flatMap(({ quantity, lineIds }) => {
    const tier = pickTier(tiers, quantity);
    return tier ? [buildCandidate(tier, lineIds)] : [];
  });
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return NO_OPERATIONS;
  }

  const parsed = parseTierConfig(input.discount.metafield?.jsonValue);
  if (!parsed.ok) {
    logInvalidConfig(parsed.issues);
    return NO_OPERATIONS;
  }

  if (!isTaggedCustomer(input)) {
    return NO_OPERATIONS;
  }

  const candidates = buildCandidates(parsed.config.tiers, linesByProduct(input.cart.lines));
  if (candidates.length === 0) {
    return NO_OPERATIONS;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All
        }
      }
    ]
  };
}
