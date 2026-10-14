import {
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
  DiscountClass,
  ProductDiscountSelectionStrategy
} from '../generated/api';

export function cartLinesDiscountsGenerateRun(
  input: CartInput
): CartLinesDiscountsGenerateRunResult {
  const [firstLine, ...otherLines] = input.cart.lines;
  if (!firstLine || !input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const maxCartLine = otherLines.reduce(
    (maxLine, line) =>
      Number(line.cost.subtotalAmount.amount) > Number(maxLine.cost.subtotalAmount.amount)
        ? line
        : maxLine,
    firstLine
  );

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: '20% OFF PRODUCT',
              targets: [{ cartLine: { id: maxCartLine.id } }],
              value: { percentage: { value: '20.0' } }
            }
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.First
        }
      }
    ]
  };
}
