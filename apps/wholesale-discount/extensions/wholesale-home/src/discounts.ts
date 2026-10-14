import { parseTierConfig, type TierConfig } from '../../../shared/tier-config';

export type DiscountStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';

export type TierSummary =
  { kind: 'tiers'; tag: string; tiers: TierConfig['tiers'] } | { kind: 'needs-attention' };

export interface DiscountRow {
  id: string;
  href: string;
  title: string;
  status: DiscountStatus;
  summary: TierSummary;
}

export interface LoadedDiscounts {
  functionId: string;
  rows: DiscountRow[];
}

export type QueryFunction = (
  query: string,
  options?: { variables?: { [key: string]: unknown } }
) => Promise<{ data?: unknown; errors?: readonly { message: string }[] }>;

interface AppDiscount {
  title: string;
  status: DiscountStatus;
  appDiscountType: { functionId: string };
}

interface DiscountNode {
  id: string;
  discount: Partial<AppDiscount>;
  metafield: { jsonValue: unknown } | null;
}

type AppDiscountNode = DiscountNode & { discount: AppDiscount };

interface DiscountNodesPage {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: DiscountNode[];
}

interface FunctionsData {
  shopifyFunctions: { nodes: { id: string; apiType: string }[] };
}

const DISCOUNT_FUNCTION_API_TYPE = 'discount';
const TIER_CONFIG_KEY = 'tier-config';

const DISCOUNT_NODES_FIELDS = `
  discountNodes(first: 50, query: "type:app", after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      discount {
        ... on DiscountAutomaticApp {
          title
          status
          appDiscountType { functionId }
        }
      }
      metafield(namespace: "$app", key: "${TIER_CONFIG_KEY}") { jsonValue }
    }
  }
`;

const FIRST_PAGE_QUERY = `
  query WholesaleDiscounts($cursor: String) {
    shopifyFunctions(first: 10) { nodes { id apiType } }
    ${DISCOUNT_NODES_FIELDS}
  }
`;

const NEXT_PAGE_QUERY = `
  query WholesaleDiscountsPage($cursor: String) {
    ${DISCOUNT_NODES_FIELDS}
  }
`;

async function runQuery<Data>(
  query: QueryFunction,
  document: string,
  cursor: string | null
): Promise<Data> {
  const { data, errors } = await query(document, { variables: { cursor } });
  if (errors && errors.length > 0) {
    throw new Error(`Loading discounts failed: ${errors.map((error) => error.message).join('; ')}`);
  }
  if (!data) {
    throw new Error('Loading discounts failed: the response had no data');
  }
  return data as Data;
}

function readDiscountNodes(data: Partial<{ discountNodes: DiscountNodesPage }>): DiscountNodesPage {
  if (!data.discountNodes) {
    throw new Error('Loading discounts failed: the response had no discount list');
  }
  return data.discountNodes;
}

function findDiscountFunctionId(data: Partial<FunctionsData>): string {
  const discountFunction = data.shopifyFunctions?.nodes.find(
    ({ apiType }) => apiType === DISCOUNT_FUNCTION_API_TYPE
  );
  if (!discountFunction) {
    throw new Error('Loading discounts failed: this app has no discount Function');
  }
  return discountFunction.id;
}

function isOwnedBy(functionId: string) {
  return (node: DiscountNode): node is AppDiscountNode =>
    node.discount.appDiscountType?.functionId === functionId;
}

const DISCOUNT_NODE_ID_PATTERN = /^gid:\/\/shopify\/[A-Za-z]+\/(\d+)$/;

/**
 * Builds the App Home link to a discount's full admin page from its node GID. Throws an Error
 * when the id is not a `gid://shopify/<Type>/<digits>` GID.
 */
export function discountAdminHref(nodeId: string): string {
  const numericId = DISCOUNT_NODE_ID_PATTERN.exec(nodeId)?.[1];
  if (numericId === undefined) {
    throw new Error(`Loading discounts failed: "${nodeId}" is not a Shopify GID`);
  }
  return `shopify:admin/discounts/${numericId}`;
}

function toRow({ id, discount, metafield }: AppDiscountNode): DiscountRow {
  const parsed = parseTierConfig(metafield?.jsonValue);
  const summary: TierSummary = parsed.ok
    ? { kind: 'tiers', tag: parsed.config.tag, tiers: parsed.config.tiers }
    : { kind: 'needs-attention' };
  return {
    id,
    href: discountAdminHref(id),
    title: discount.title,
    status: discount.status,
    summary
  };
}

function rowsForFunction(nodes: DiscountNode[], functionId: string): DiscountRow[] {
  return nodes.filter(isOwnedBy(functionId)).map(toRow);
}

/**
 * Loads every automatic discount backed by this app's discount Function, paging through the
 * store's app discounts. Rejects with an Error when the request fails or returns unusable data.
 */
export async function loadDiscounts(query: QueryFunction): Promise<LoadedDiscounts> {
  const firstPage = await runQuery<Partial<FunctionsData & { discountNodes: DiscountNodesPage }>>(
    query,
    FIRST_PAGE_QUERY,
    null
  );
  const functionId = findDiscountFunctionId(firstPage);
  let page = readDiscountNodes(firstPage);
  const rows = rowsForFunction(page.nodes, functionId);

  while (page.pageInfo.hasNextPage) {
    page = readDiscountNodes(
      await runQuery<Partial<{ discountNodes: DiscountNodesPage }>>(
        query,
        NEXT_PAGE_QUERY,
        page.pageInfo.endCursor
      )
    );
    rows.push(...rowsForFunction(page.nodes, functionId));
  }
  return { functionId, rows };
}
