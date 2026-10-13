import { useEffect } from 'react';
import { useFetcher, useLoaderData, useRevalidator } from 'react-router';

import type { ConsoleActionData, ConsoleLoaderData } from '../../services/script-tags';
import { FIELD, INTENT } from '../../services/script-tags';
import { ConsoleView } from './ConsoleView';
import { COPY } from './copy';
import { themeEditorLink } from './embed';
import { useEmbedStatus } from './use-embed-status';

export function ScriptTagConsole() {
  const { clientId, storeHandle, scriptTags } = useLoaderData<ConsoleLoaderData>();
  const { status, checking, recheck } = useEmbedStatus();
  const { revalidate, state: revalidation } = useRevalidator();
  const fetcher = useFetcher<ConsoleActionData>();
  const result = fetcher.data;

  useEffect(() => {
    if (result?.ok) {
      shopify.toast.show(COPY.removed);
    }
  }, [result]);

  const removeTag = (id: string) =>
    fetcher.submit({ [FIELD.intent]: INTENT.delete, [FIELD.id]: id }, { method: 'post' });

  return (
    <ConsoleView
      embedStatus={status}
      embedChecking={checking}
      enableHref={themeEditorLink(storeHandle, clientId)}
      onRecheckEmbed={recheck}
      scriptTags={scriptTags}
      onRetryList={revalidate}
      retryingList={revalidation !== 'idle'}
      removalBusy={fetcher.state !== 'idle'}
      removalError={result && !result.ok ? result : null}
      onRemove={removeTag}
    />
  );
}
