import {
  collectPages,
  type Page,
  type PageInfo,
  type QueryFunction,
  runQuery,
  TooManyPagesError
} from '@repo/admin-query';

import { type DailySales, LONG_WINDOW_DAYS } from '../../../shared/forecast';
import { addDays, shopDate } from './dates';

export const ORDERS_PAGE_SIZE = 100;
export const ORDER_LINE_ITEMS_PAGE_SIZE = 100;
export const MAX_ORDER_PAGES = 30;
export const FOLLOW_UP_LINE_ITEMS_PAGE_SIZE = 250;
export const MAX_FOLLOW_UP_PAGES = 20;

export const EXCLUDE_CANCELLED_ORDERS = true;

export class SalesDataError extends Error {
  override name = 'SalesDataError';
}

export interface SalesRequest {
  productId: string;
  /** `YYYY-MM-DD` in the shop's time zone, the day the forecast is made. */
  today: string;
  timeZone: string;
  /** SKUs that narrow the orders read, or null to read every order in the window. */
  skus: string[] | null;
}

interface LineItemNode {
  currentQuantity: number;
  product: { id: string } | null;
}

interface LineItemsConnection {
  pageInfo: PageInfo;
  nodes: LineItemNode[];
}

interface OrderNode {
  id: string;
  processedAt: string;
  lineItems: LineItemsConnection;
}

interface OrdersData {
  orders: { pageInfo: PageInfo; nodes: OrderNode[] };
}

interface OrderLineItemsData {
  order: { lineItems: LineItemsConnection } | null;
}

const LINE_ITEM_FIELDS = 'currentQuantity product { id }';

const ORDERS_QUERY = `
  query ReorderOrders($query: String!, $cursor: String) {
    orders(first: ${ORDERS_PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        processedAt
        lineItems(first: ${ORDER_LINE_ITEMS_PAGE_SIZE}) {
          pageInfo { hasNextPage endCursor }
          nodes { ${LINE_ITEM_FIELDS} }
        }
      }
    }
  }
`;

const ORDER_LINE_ITEMS_QUERY = `
  query ReorderOrderLineItems($id: ID!, $cursor: String) {
    order(id: $id) {
      lineItems(first: ${FOLLOW_UP_LINE_ITEMS_PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { ${LINE_ITEM_FIELDS} }
      }
    }
  }
`;

function quoteSearchValue(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * The `orders` search string: processed within the 60-day window widened by a day at each end,
 * not cancelled, and matching any of the SKUs. The widening makes the search's time zone for
 * date bounds irrelevant; the forecast trims to the exact window.
 */
export function buildOrdersSearch({ today, skus }: Pick<SalesRequest, 'today' | 'skus'>): string {
  const clauses = [
    `processed_at:>=${addDays(today, -(LONG_WINDOW_DAYS + 1))}`,
    `processed_at:<${addDays(today, 1)}`
  ];
  if (EXCLUDE_CANCELLED_ORDERS) clauses.push('-status:cancelled');
  if (skus !== null) {
    clauses.push(`(${skus.map((sku) => `sku:${quoteSearchValue(sku)}`).join(' OR ')})`);
  }
  return clauses.join(' ');
}

async function readRemainingLineItems(
  query: QueryFunction,
  orderId: string,
  startCursor: string | null
): Promise<LineItemNode[]> {
  try {
    return await collectPages(
      async (cursor): Promise<Page<LineItemNode>> => {
        const { order } = await runQuery<OrderLineItemsData>(query, ORDER_LINE_ITEMS_QUERY, {
          id: orderId,
          cursor
        });
        if (!order?.lineItems) throw new SalesDataError(`order ${orderId} had no line items`);
        return { items: order.lineItems.nodes, pageInfo: order.lineItems.pageInfo };
      },
      { maxPages: MAX_FOLLOW_UP_PAGES, startCursor }
    );
  } catch (error) {
    if (error instanceof TooManyPagesError) {
      throw new SalesDataError(`order ${orderId} has more line items than can be read`, {
        cause: error
      });
    }
    throw error;
  }
}

async function lineItemsOf(query: QueryFunction, order: OrderNode): Promise<LineItemNode[]> {
  if (!order.lineItems) throw new SalesDataError(`order ${order.id} had no line items`);
  const { nodes, pageInfo } = order.lineItems;
  if (!pageInfo.hasNextPage) return nodes;
  return [...nodes, ...(await readRemainingLineItems(query, order.id, pageInfo.endCursor))];
}

function unitsOfProduct(lineItems: LineItemNode[], productId: string): number {
  return lineItems
    .filter(({ product }) => product?.id === productId)
    .reduce((sum, { currentQuantity }) => sum + currentQuantity, 0);
}

function sumByDate(orders: DailySales[]): DailySales[] {
  const totals = new Map<string, number>();
  for (const { date, netUnits } of orders) {
    totals.set(date, (totals.get(date) ?? 0) + netUnits);
  }
  return [...totals].map(([date, netUnits]) => ({ date, netUnits }));
}

/**
 * Reads the orders processed in the 60-day window and returns the net units of one product sold
 * per shop calendar day. Rejects when a request fails or a field is missing, and with a
 * TooManyPagesError when the orders do not fit in the pages read.
 */
export async function loadDailySales(
  query: QueryFunction,
  request: SalesRequest
): Promise<DailySales[]> {
  const search = buildOrdersSearch(request);
  const orders = await collectPages(
    async (cursor): Promise<Page<OrderNode>> => {
      const { orders: connection } = await runQuery<OrdersData>(query, ORDERS_QUERY, {
        query: search,
        cursor
      });
      if (!connection) throw new SalesDataError('the response had no order list');
      return { items: connection.nodes, pageInfo: connection.pageInfo };
    },
    { maxPages: MAX_ORDER_PAGES }
  );

  const sales: DailySales[] = [];
  for (const order of orders) {
    const date = shopDate(order.processedAt, request.timeZone);
    if (date > request.today) continue;
    const lineItems = await lineItemsOf(query, order);
    sales.push({ date, netUnits: unitsOfProduct(lineItems, request.productId) });
  }
  return sumByDate(sales);
}
