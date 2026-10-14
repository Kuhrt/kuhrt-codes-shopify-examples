import { useCallback, useEffect, useState } from 'preact/hooks';

import {
  type DiscountRow,
  type DiscountStatus,
  findDiscountFunctionId,
  loadDiscountRows,
  type QueryFunction,
  type TierSummary
} from './discounts';

type State =
  | { status: 'loading' }
  | { status: 'error'; functionId?: string }
  | { status: 'ready'; rows: DiscountRow[]; functionId: string };

const STATUS_TONES = {
  ACTIVE: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'neutral'
} as const satisfies Record<DiscountStatus, string>;

const t = (key: string, options?: { [key: string]: string | number }) =>
  shopify.i18n.translate(key, options);

async function loadState(query: QueryFunction): Promise<State> {
  let functionId: string;
  try {
    functionId = await findDiscountFunctionId(query);
  } catch (error) {
    console.error(error);
    return { status: 'error' };
  }
  try {
    return { status: 'ready', rows: await loadDiscountRows(query, functionId), functionId };
  } catch (error) {
    console.error(error);
    return { status: 'error', functionId };
  }
}

function useDiscounts() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await loadState(shopify.query));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, load };
}

async function openCreateIntent(functionId: string): Promise<void> {
  if (!shopify.intents.invoke) {
    throw new Error('Creating a discount is not available: the intents API is missing');
  }
  const activity = await shopify.intents.invoke('create:shopify/Discount', {
    data: { functionId }
  });
  await activity?.complete;
}

export function AppHome() {
  const { state, load } = useDiscounts();
  const [createFailed, setCreateFailed] = useState(false);
  const functionId = state.status === 'loading' ? undefined : state.functionId;

  async function create(id: string) {
    try {
      await openCreateIntent(id);
    } catch (error) {
      console.error(error);
      setCreateFailed(true);
      return;
    }
    setCreateFailed(false);
    await load();
  }

  return (
    <s-page heading={t('page.heading')}>
      {functionId !== undefined && (
        <s-button slot="primary-action" variant="primary" onClick={() => create(functionId)}>
          {t('actions.create')}
        </s-button>
      )}
      {createFailed && (
        <s-banner tone="critical" heading={t('createError.heading')}>
          <s-paragraph>{t('createError.body')}</s-paragraph>
        </s-banner>
      )}
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError onRetry={load} />}
      {state.status === 'ready' && state.rows.length === 0 && <Empty />}
      {state.status === 'ready' && state.rows.length > 0 && <DiscountTable rows={state.rows} />}
    </s-page>
  );
}

function Loading() {
  return (
    <s-section>
      <s-spinner accessibilityLabel={t('loading.label')} />
    </s-section>
  );
}

function Empty() {
  return (
    <s-section>
      <s-heading>{t('empty.heading')}</s-heading>
      <s-paragraph>{t('empty.body')}</s-paragraph>
    </s-section>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <s-banner tone="critical" heading={t('error.heading')}>
      <s-paragraph>{t('error.body')}</s-paragraph>
      <s-button onClick={onRetry}>{t('actions.retry')}</s-button>
    </s-banner>
  );
}

function DiscountTable({ rows }: { rows: DiscountRow[] }) {
  return (
    <s-section padding="none">
      <s-table>
        <s-table-header-row>
          <s-table-header>{t('table.title')}</s-table-header>
          <s-table-header>{t('table.status')}</s-table-header>
          <s-table-header>{t('table.tiers')}</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {rows.map((row) => (
            <DiscountTableRow key={row.id} row={row} />
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}

function DiscountTableRow({ row }: { row: DiscountRow }) {
  return (
    <s-table-row>
      <s-table-cell>
        <s-link href={row.href}>{row.title}</s-link>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone={STATUS_TONES[row.status]}>{t(`status.${row.status}`)}</s-badge>
      </s-table-cell>
      <s-table-cell>
        <Summary summary={row.summary} />
      </s-table-cell>
    </s-table-row>
  );
}

function Summary({ summary }: { summary: TierSummary }) {
  if (summary.kind === 'needs-attention') {
    return <s-badge tone="warning">{t('summary.needsAttention')}</s-badge>;
  }
  const tiers = summary.tiers
    .map((tier) => t('summary.tier', { ...tier }))
    .join(t('summary.tierSeparator'));
  return <s-text>{t('summary.tiers', { tag: summary.tag, tiers })}</s-text>;
}
