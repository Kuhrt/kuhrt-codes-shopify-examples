import { useCallback, useEffect, useState } from 'preact/hooks';

import type { StockStatus } from '../../../shared/forecast';
import type { InvalidSetting } from '../../../shared/reorder-settings';
import { type ForecastState, loadForecast } from './load-forecast';

type State = { status: 'loading' } | ForecastState;
type ForecastView = Extract<ForecastState, { status: 'forecast' }>;

const STATUS_TONES = {
  'out-of-stock': 'critical',
  'reorder-now': 'warning',
  low: 'caution',
  healthy: 'success'
} as const satisfies Record<StockStatus, string>;

const t = (key: string, options?: { [key: string]: string | number }) =>
  shopify.i18n.translate(key, options);

const formatAverage = (units: number) => units.toFixed(1);

function currentProductId(): string | undefined {
  return shopify.data.selected[0]?.id;
}

function useForecast() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    const productId = currentProductId();
    if (productId === undefined) {
      console.error(new Error('The block was rendered without a selected product'));
      setState({ status: 'error' });
      return;
    }
    setState({ status: 'loading' });
    setState(await loadForecast(shopify.query, productId));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, load };
}

function summaryOf(state: State): string | undefined {
  if (state.status !== 'forecast') return undefined;
  const { status, reorderPoint, daysUntilStockout } = state.forecast;
  const options = { status: t(`status.${status}`), reorderPoint };
  return daysUntilStockout === null
    ? t('summary.noEstimate', options)
    : t('summary.estimate', { ...options, days: daysUntilStockout });
}

export function ReorderPointBlock() {
  const { state, load } = useForecast();

  return (
    <s-admin-block heading={t('heading')} collapsedSummary={summaryOf(state)}>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <LoadError onRetry={load} />}
      {state.status === 'untracked' && <Untracked />}
      {state.status === 'too-much-history' && <TooMuchHistory />}
      {state.status === 'forecast' && <Forecast view={state} />}
    </s-admin-block>
  );
}

function Loading() {
  return <s-spinner accessibilityLabel={t('loading.label')} />;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <s-banner tone="critical" heading={t('error.heading')}>
      <s-paragraph>{t('error.body')}</s-paragraph>
      <s-button onClick={onRetry}>{t('actions.retry')}</s-button>
    </s-banner>
  );
}

function Untracked() {
  return (
    <s-banner tone="info" heading={t('untracked.heading')}>
      <s-paragraph>{t('untracked.body')}</s-paragraph>
    </s-banner>
  );
}

function TooMuchHistory() {
  return (
    <s-banner tone="warning" heading={t('tooMuchHistory.heading')}>
      <s-paragraph>{t('tooMuchHistory.body')}</s-paragraph>
    </s-banner>
  );
}

function Forecast({ view }: { view: ForecastView }) {
  return (
    <s-stack gap="base">
      <Answer forecast={view.forecast} />
      <s-divider />
      <StockByLocation forecast={view.forecast} />
      <AverageSales forecast={view.forecast} />
      <Settings forecast={view.forecast} defaultsUsed={view.defaultsUsed} />
      <s-link href={view.metafieldsHref}>{t('settings.editLink')}</s-link>
      <s-text color="subdued">{t('settings.pinHint')}</s-text>
    </s-stack>
  );
}

type ForecastDetails = ForecastView['forecast'];

function Answer({ forecast }: { forecast: ForecastDetails }) {
  return (
    <s-stack data-section="answer" gap="small-200">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-badge tone={STATUS_TONES[forecast.status]}>{t(`status.${forecast.status}`)}</s-badge>
        <s-heading>{t('answer.reorderPoint', { reorderPoint: forecast.reorderPoint })}</s-heading>
      </s-stack>
      <s-text>
        {forecast.daysUntilStockout === null
          ? t('answer.noEstimate')
          : t('answer.daysUntilStockout', { days: forecast.daysUntilStockout })}
      </s-text>
    </s-stack>
  );
}

function StockByLocation({ forecast }: { forecast: ForecastDetails }) {
  return (
    <s-stack data-section="stock" gap="small-200">
      <s-heading>{t('stock.heading')}</s-heading>
      {forecast.locations.map((location) => (
        <Row key={location.locationId} label={location.locationName} value={location.available} />
      ))}
      <Row label={t('stock.total')} value={forecast.availableStock} emphasis />
    </s-stack>
  );
}

function AverageSales({ forecast }: { forecast: ForecastDetails }) {
  return (
    <s-stack data-section="sales" gap="small-200">
      <s-heading>{t('sales.heading')}</s-heading>
      <Row label={t('sales.last30')} value={formatAverage(forecast.shortWindowAverage)} />
      <Row label={t('sales.last60')} value={formatAverage(forecast.longWindowAverage)} />
    </s-stack>
  );
}

function Settings({
  forecast,
  defaultsUsed
}: {
  forecast: ForecastDetails;
  defaultsUsed: InvalidSetting[];
}) {
  const { settings } = forecast;
  const markerOf = (setting: InvalidSetting) => {
    if (settings.invalid.includes(setting)) return 'invalid';
    return defaultsUsed.includes(setting) ? 'default' : undefined;
  };
  return (
    <s-stack data-section="settings" gap="small-200">
      <s-heading>{t('settings.heading')}</s-heading>
      <Row
        label={t('settings.leadTime')}
        value={t('settings.leadTimeValue', { days: settings.leadTimeDays })}
        marker={markerOf('leadTime')}
      />
      <Row
        label={t('settings.safetyStock')}
        value={t('settings.safetyStockValue', { units: settings.safetyStock })}
        marker={markerOf('safetyStock')}
      />
    </s-stack>
  );
}

function Row({
  label,
  value,
  emphasis = false,
  marker
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
  marker?: 'default' | 'invalid';
}) {
  return (
    <s-stack direction="inline" justifyContent="space-between" gap="base">
      <s-text>{label}</s-text>
      <s-stack direction="inline" gap="small" alignItems="center">
        {marker !== undefined && (
          <s-badge data-marker={marker} tone={marker === 'invalid' ? 'warning' : 'neutral'}>
            {t(`settings.${marker}`)}
          </s-badge>
        )}
        <s-text type={emphasis ? 'strong' : undefined}>{value}</s-text>
      </s-stack>
    </s-stack>
  );
}
