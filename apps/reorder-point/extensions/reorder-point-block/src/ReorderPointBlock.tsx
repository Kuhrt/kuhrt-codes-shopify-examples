import { useCallback, useEffect, useState } from 'preact/hooks';

import type { StockStatus } from '../../../shared/forecast';
import type { SettingName } from '../../../shared/reorder-settings';
import { type ForecastState, loadForecast } from './load-forecast';

type State = { status: 'loading' } | ForecastState;
type ForecastView = Extract<ForecastState, { status: 'forecast' }>;
type ForecastDetails = ForecastView['forecast'];

const STATUS_TONES = {
  'out-of-stock': 'critical',
  'reorder-now': 'warning',
  low: 'caution',
  healthy: 'success'
} as const satisfies Record<StockStatus, string>;

const t = (key: string, options?: { [key: string]: string | number }) =>
  shopify.i18n.translate(key, options);

const formatCount = (value: number) => shopify.i18n.formatNumber(value);
const formatAverage = (value: number) =>
  shopify.i18n.formatNumber(value, { maximumFractionDigits: 2 });

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

function stockoutText({ daysUntilStockout }: ForecastDetails): string {
  return daysUntilStockout === null
    ? t('answer.noEstimate')
    : t('answer.daysUntilStockout', { count: daysUntilStockout });
}

function summaryOf(state: State): string | undefined {
  if (state.status !== 'forecast') return undefined;
  const { forecast } = state;
  return [
    t(`status.${forecast.status}`),
    t('answer.reorderPoint', { count: forecast.reorderPoint }),
    stockoutText(forecast)
  ].join(t('summary.separator'));
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
      <StockByLocation forecast={view.forecast} />
      <AverageSales forecast={view.forecast} />
      <Settings forecast={view.forecast} />
      <s-paragraph>
        <s-link href={view.metafieldsHref}>{t('settings.editLink')}</s-link>{' '}
        <s-text color="subdued">{t('settings.pinHint')}</s-text>
      </s-paragraph>
    </s-stack>
  );
}

function Answer({ forecast }: { forecast: ForecastDetails }) {
  return (
    <s-stack data-section="answer" gap="small-200">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-badge tone={STATUS_TONES[forecast.status]}>{t(`status.${forecast.status}`)}</s-badge>
        <s-heading>{t('answer.reorderPoint', { count: forecast.reorderPoint })}</s-heading>
      </s-stack>
      <s-text>{stockoutText(forecast)}</s-text>
    </s-stack>
  );
}

function StockByLocation({ forecast }: { forecast: ForecastDetails }) {
  return (
    <s-stack data-section="stock" gap="small-200">
      {forecast.locations.map((location) => (
        <Row
          key={location.locationId}
          label={location.locationName}
          value={formatCount(location.available)}
        />
      ))}
      <Row label={t('stock.total')} value={formatCount(forecast.availableStock)} emphasis />
    </s-stack>
  );
}

function AverageSales({ forecast }: { forecast: ForecastDetails }) {
  return (
    <s-stack data-section="sales" gap="small-200">
      <Row
        label={t('sales.average')}
        value={t('sales.averageValue', {
          short: formatAverage(forecast.shortWindowAverage),
          long: formatAverage(forecast.longWindowAverage)
        })}
      />
    </s-stack>
  );
}

function Settings({ forecast }: { forecast: ForecastDetails }) {
  const { settings } = forecast;
  const markerOf = (setting: SettingName) => {
    if (settings.invalid.includes(setting)) return 'invalid';
    return settings.defaulted.includes(setting) ? 'default' : undefined;
  };
  return (
    <s-stack data-section="settings" gap="small-200">
      <Row
        label={t('settings.leadTime')}
        value={t('settings.leadTimeValue', { count: settings.leadTimeDays })}
        marker={markerOf('leadTime')}
      />
      <Row
        label={t('settings.safetyStock')}
        value={t('settings.safetyStockValue', { count: settings.safetyStock })}
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
  value: string;
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
