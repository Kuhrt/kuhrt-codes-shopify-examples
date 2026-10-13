import { useCallback, useEffect, useRef, useState } from 'react';

import type { EmbedStatus } from './embed';
import { embedStatusFrom } from './embed';

export type EmbedCheck = EmbedStatus | 'checking';

async function readEmbedStatus(): Promise<EmbedStatus> {
  try {
    return embedStatusFrom(await shopify.app.extensions());
  } catch {
    return 'unknown';
  }
}

/** Reads the embed status from App Bridge, and checks again whenever the merchant returns to the page. */
export function useEmbedStatus() {
  const [status, setStatus] = useState<EmbedCheck>('checking');
  const latestCheck = useRef(0);

  const recheck = useCallback(async () => {
    const check = ++latestCheck.current;
    const result = await readEmbedStatus();
    if (check === latestCheck.current) {
      setStatus(result);
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void recheck();
      }
    };
    const onFocus = () => void recheck();

    void recheck();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [recheck]);

  return { status, recheck };
}
