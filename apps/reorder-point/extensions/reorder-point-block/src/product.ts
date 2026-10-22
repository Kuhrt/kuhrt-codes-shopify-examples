import { numericIdOf, type QueryFunction, runQuery } from '@repo/admin-query';

import type { VariantInventory } from '../../../shared/forecast';
import { parseReorderSettings, type ReorderSettings } from '../../../shared/reorder-settings';

export const VARIANTS_PAGE_SIZE = 100;
export const LOCATIONS_PAGE_SIZE = 20;

const SETTINGS_NAMESPACE = '$app';
const LEAD_TIME_KEY = 'lead-time';
const SAFETY_STOCK_KEY = 'safety-stock';
const AVAILABLE_QUANTITY = 'available';

export class ProductDataError extends Error {
  override name = 'ProductDataError';
}

export interface ProductDetails {
  timeZone: string;
  variants: VariantInventory[];
  /** The SKUs of every variant, or null when any variant has none. */
  searchableSkus: string[] | null;
  settings: ReorderSettings;
}

interface ConnectionPageInfo {
  pageInfo: { hasNextPage: boolean };
}

interface LevelNode {
  location: { id: string; name: string };
  quantities: { name: string; quantity: number }[];
}

interface VariantNode {
  sku: string | null;
  inventoryItem: {
    tracked: boolean;
    inventoryLevels?: ConnectionPageInfo & { nodes: LevelNode[] };
  };
}

interface Metafield {
  value: string;
}

interface ProductData {
  shop: { ianaTimezone?: string };
  product: {
    variants?: ConnectionPageInfo & { nodes: VariantNode[] };
    leadTime: Metafield | null;
    safetyStock: Metafield | null;
  } | null;
}

const PRODUCT_QUERY = `
  query ReorderProduct($id: ID!) {
    shop { ianaTimezone }
    product(id: $id) {
      variants(first: ${VARIANTS_PAGE_SIZE}) {
        pageInfo { hasNextPage }
        nodes {
          sku
          inventoryItem {
            tracked
            inventoryLevels(first: ${LOCATIONS_PAGE_SIZE}) {
              pageInfo { hasNextPage }
              nodes {
                location { id name }
                quantities(names: ["${AVAILABLE_QUANTITY}"]) { name quantity }
              }
            }
          }
        }
      }
      leadTime: metafield(namespace: "${SETTINGS_NAMESPACE}", key: "${LEAD_TIME_KEY}") { value }
      safetyStock: metafield(namespace: "${SETTINGS_NAMESPACE}", key: "${SAFETY_STOCK_KEY}") { value }
    }
  }
`;

/** Builds the admin link to a product's metafields page. Throws an Error for anything but a product GID. */
export function productMetafieldsHref(productId: string): string {
  return `shopify:admin/products/${numericIdOf(productId, 'Product')}/metafields`;
}

function toVariant({ inventoryItem }: VariantNode): VariantInventory {
  const { inventoryLevels } = inventoryItem;
  if (!inventoryLevels) throw new ProductDataError('a variant had no inventory levels');
  if (inventoryLevels.pageInfo.hasNextPage) {
    throw new ProductDataError('a variant is stocked at more locations than can be read');
  }
  return {
    tracked: inventoryItem.tracked,
    levels: inventoryLevels.nodes.map(({ location, quantities }) => {
      const available = quantities.find(({ name }) => name === AVAILABLE_QUANTITY);
      if (!available) throw new ProductDataError(`${location.name} had no available quantity`);
      return {
        locationId: location.id,
        locationName: location.name,
        available: available.quantity
      };
    })
  };
}

function searchableSkus(variants: VariantNode[]): string[] | null {
  const skus = variants.map(({ sku }) => sku?.trim() ?? '');
  if (skus.length === 0 || skus.some((sku) => sku === '')) return null;
  return [...new Set(skus)];
}

/**
 * Reads the product's inventory, SKUs and settings, and the shop's time zone. Rejects when a
 * request fails, a field is missing, or the product has more variants or locations than one
 * request reads.
 */
export async function loadProduct(
  query: QueryFunction,
  productId: string
): Promise<ProductDetails> {
  const { shop, product } = await runQuery<ProductData>(query, PRODUCT_QUERY, { id: productId });
  if (!shop?.ianaTimezone) throw new ProductDataError('the response had no shop time zone');
  if (!product?.variants) throw new ProductDataError('the response had no product');
  if (product.variants.pageInfo.hasNextPage) {
    throw new ProductDataError('the product has more variants than can be read');
  }
  const { leadTime = null, safetyStock = null } = product;
  return {
    timeZone: shop.ianaTimezone,
    variants: product.variants.nodes.map(toVariant),
    searchableSkus: searchableSkus(product.variants.nodes),
    settings: parseReorderSettings(leadTime?.value, safetyStock?.value)
  };
}
