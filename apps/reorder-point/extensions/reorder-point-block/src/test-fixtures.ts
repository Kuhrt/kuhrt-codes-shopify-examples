export const PRODUCT_ID = 'gid://shopify/Product/42';
export const OTHER_PRODUCT_ID = 'gid://shopify/Product/43';

export function variantNode(
  tracked: boolean,
  levels: [name: string, available: number][],
  { sku = 'SKU', moreLevels = false }: { sku?: string | null; moreLevels?: boolean } = {}
) {
  return {
    sku,
    inventoryItem: {
      tracked,
      inventoryLevels: {
        pageInfo: { hasNextPage: moreLevels },
        nodes: levels.map(([name, quantity]) => ({
          location: { id: `gid://shopify/Location/${name}`, name },
          quantities: [{ name: 'available', quantity }]
        }))
      }
    }
  };
}

export const productResponse = (
  variants: unknown[],
  {
    leadTime = null,
    safetyStock = null,
    moreVariants = false,
    timeZone = 'America/Chicago'
  }: {
    leadTime?: string | null;
    safetyStock?: string | null;
    moreVariants?: boolean;
    timeZone?: string;
  } = {}
) => ({
  data: {
    shop: { ianaTimezone: timeZone },
    product: {
      variants: { pageInfo: { hasNextPage: moreVariants }, nodes: variants },
      leadTime: leadTime === null ? null : { value: leadTime },
      safetyStock: safetyStock === null ? null : { value: safetyStock }
    }
  }
});

export const lineItem = (productId: string | null, currentQuantity: number) => ({
  currentQuantity,
  product: productId === null ? null : { id: productId }
});

export const soldUnits = (units: number) => lineItem(PRODUCT_ID, units);

export const lineItemsPage = (nodes: unknown[], endCursor: string | null = null) => ({
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
  nodes
});

export const orderOf = (
  id: string,
  processedAt: string,
  lineItems: unknown[],
  moreLineItemsCursor: string | null = null
) => ({
  id: `gid://shopify/Order/${id}`,
  processedAt,
  lineItems: lineItemsPage(lineItems, moreLineItemsCursor)
});

export const ordersResponse = (nodes: unknown[], endCursor: string | null = null) => ({
  data: { orders: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } }
});

export const lineItemsResponse = (nodes: unknown[], endCursor: string | null = null) => ({
  data: { order: { lineItems: lineItemsPage(nodes, endCursor) } }
});

export const isProductRequest = (document: string) => document.includes('ReorderProduct');
export const isOrdersRequest = (document: string) => document.includes('orders(');
export const isLineItemsRequest = (document: string) => document.includes('ReorderOrderLineItems');
