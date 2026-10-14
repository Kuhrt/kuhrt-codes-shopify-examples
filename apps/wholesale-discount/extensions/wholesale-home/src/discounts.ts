import {
  parseTierConfig,
  TIER_CONFIG_KEY,
  TIER_CONFIG_NAMESPACE,
  type TierConfig
} from '../../../shared/tier-config';

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

interface DiscountNodesData {
  discountNodes: DiscountNodesPage;
}

const DISCOUNT_FUNCTION_API_TYPE = 'discount';

const FUNCTIONS_QUERY = `
  query WholesaleDiscountFunctions {
    shopifyFunctions(first: 10) { nodes { id apiType } }
  }
`;

const APP_DISCOUNT_FIELDS = 'title status appDiscountType { functionId }';

const DISCOUNT_NODES_QUERY = `
  query WholesaleDiscounts($cursor: String) {
    discountNodes(first: 50, query: "type:app", after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        discount {
          ... on DiscountAutomaticApp { ${APP_DISCOUNT_FIELDS} }
          ... on DiscountCodeApp { ${APP_DISCOUNT_FIELDS} }
        }
        metafield(namespace: "${TIER_CONFIG_NAMESPACE}", key: "${TIER_CONFIG_KEY}") { jsonValue }
      }
    }
  }
`;

async function runQuery<Data>(
  query: QueryFunction,
  document: string,
  variables?: { [key: string]: unknown }
): Promise<Partial<Data>> {
  const { data, errors } = await query(document, variables && { variables });
  if (errors && errors.length > 0) {
    throw new Error(`Loading discounts failed: ${errors.map((error) => error.message).join('; ')}`);
  }
  if (!data) {
    throw new Error('Loading discounts failed: the response had no data');
  }
  return data as Partial<Data>;
}

/** Looks up this app's discount Function. Rejects with an Error when it cannot be found. */
export async function findDiscountFunctionId(query: QueryFunction): Promise<string> {
  const data = await runQuery<FunctionsData>(query, FUNCTIONS_QUERY);
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

function readPage(data: Partial<DiscountNodesData>): DiscountNodesPage {
  if (!data.discountNodes) {
    throw new Error('Loading discounts failed: the response had no discount list');
  }
  return data.discountNodes;
}

function nextCursor({ pageInfo: { hasNextPage, endCursor } }: DiscountNodesPage): string | null {
  if (!hasNextPage) return null;
  if (endCursor === null) {
    throw new Error('Loading discounts failed: the response has more pages but no end cursor');
  }
  return endCursor;
}

/**
 * Loads every automatic and code discount backed by the given discount Function, paging through
 * the store's app discounts. Rejects with an Error when the request fails or returns unusable data.
 */
export async function loadDiscountRows(
  query: QueryFunction,
  functionId: string
): Promise<DiscountRow[]> {
  const rows: DiscountRow[] = [];
  let cursor: string | null = null;
  do {
    const page: DiscountNodesPage = readPage(
      await runQuery<DiscountNodesData>(query, DISCOUNT_NODES_QUERY, { cursor })
    );
    rows.push(...page.nodes.filter(isOwnedBy(functionId)).map(toRow));
    cursor = nextCursor(page);
  } while (cursor !== null);
  return rows;
}
