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

/**
 * Reads the embed status from App Bridge, and checks again whenever the merchant returns to the page.
 * `checking` is true while the latest check is in flight. `status` keeps the previous result for
 * display during a re-check, so callers that gate on the embed being active must also require
 * `checking` to be false. Only the latest check's result is applied.
 */
export function useEmbedStatus() {
  const [status, setStatus] = useState<EmbedCheck>('checking');
  const [checking, setChecking] = useState(true);
  const latestCheck = useRef(0);

  const runCheck = useCallback(async () => {
    const check = ++latestCheck.current;
    const result = await readEmbedStatus();
    if (check === latestCheck.current) {
      setStatus(result);
      setChecking(false);
    }
  }, []);

  const recheck = useCallback(() => {
    setChecking(true);
    return runCheck();
  }, [runCheck]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void recheck();
      }
    };
    const onFocus = () => void recheck();

    void runCheck();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [recheck, runCheck]);

  return { status, checking, recheck };
}
