import type { Api } from '@shopify/ui-extensions/admin.app.home.render';
import { useCallback, useEffect, useState } from 'preact/hooks';

import {
  type DiscountRow,
  type DiscountStatus,
  loadDiscounts,
  type TierSummary
} from './discounts';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: DiscountRow[]; functionId: string };

declare const shopify: Api;

const STATUS_TONES = {
  ACTIVE: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'neutral'
} as const satisfies Record<DiscountStatus, string>;

const t = (key: string, options?: { [key: string]: string | number }) =>
  shopify.i18n.translate(key, options);

function useDiscounts() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { rows, functionId } = await loadDiscounts(shopify.query);
      setState({ status: 'ready', rows, functionId });
    } catch (error) {
      console.error(error);
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, load, fail: () => setState({ status: 'error' }) };
}

export function AppHome() {
  const { state, load, fail } = useDiscounts();

  async function runIntent(...args: Parameters<NonNullable<typeof shopify.intents.invoke>>) {
    try {
      const activity = await shopify.intents.invoke?.(...args);
      await activity?.complete;
    } catch (error) {
      console.error(error);
      fail();
      return;
    }
    await load();
  }

  const create = () =>
    runIntent(
      'create:shopify/Discount',
      state.status === 'ready' ? { data: { functionId: state.functionId } } : undefined
    );
  const edit = (id: string) => runIntent('edit:shopify/Discount', { value: id });

  return (
    <s-page heading={t('page.heading')}>
      {state.status !== 'loading' && (
        <s-button slot="primary-action" variant="primary" onClick={create}>
          {t('actions.create')}
        </s-button>
      )}
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError onRetry={load} />}
      {state.status === 'ready' && state.rows.length === 0 && <Empty />}
      {state.status === 'ready' && state.rows.length > 0 && (
        <DiscountTable rows={state.rows} onOpen={edit} />
      )}
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

function DiscountTable({ rows, onOpen }: { rows: DiscountRow[]; onOpen: (id: string) => void }) {
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
            <DiscountTableRow key={row.id} row={row} onOpen={onOpen} />
          ))}
        </s-table-body>
      </s-table>
    </s-section>
  );
}

function DiscountTableRow({ row, onOpen }: { row: DiscountRow; onOpen: (id: string) => void }) {
  return (
    <s-table-row>
      <s-table-cell>
        <s-link onClick={() => onOpen(row.id)}>{row.title}</s-link>
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
