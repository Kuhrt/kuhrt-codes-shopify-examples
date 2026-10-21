export const PRODUCT_ID = 'gid://shopify/Product/42';

export function variantNode(tracked: boolean, levels: [name: string, available: number][]) {
  return {
    sku: 'SKU',
    inventoryItem: {
      tracked,
      inventoryLevels: {
        pageInfo: { hasNextPage: false },
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
  settings: { leadTime?: string | null; safetyStock?: string | null } = {}
) => {
  const { leadTime = null, safetyStock = null } = settings;
  return {
    data: {
      shop: { ianaTimezone: 'America/Chicago' },
      product: {
        variants: { pageInfo: { hasNextPage: false }, nodes: variants },
        leadTime: leadTime === null ? null : { value: leadTime },
        safetyStock: safetyStock === null ? null : { value: safetyStock }
      }
    }
  };
};

export const orderOf = (id: string, processedAt: string, units: number) => ({
  id: `gid://shopify/Order/${id}`,
  processedAt,
  lineItems: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{ currentQuantity: units, product: { id: PRODUCT_ID } }]
  }
});

export const ordersResponse = (nodes: unknown[], endCursor: string | null = null) => ({
  data: { orders: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } }
});

export const isProductRequest = (document: string) => document.includes('ReorderProduct');
export const isOrdersRequest = (document: string) => document.includes('orders(');
