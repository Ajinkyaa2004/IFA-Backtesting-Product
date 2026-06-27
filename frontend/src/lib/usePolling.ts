import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Polls `fetcher` on mount and every `intervalMs` thereafter.
 *
 * Returns:
 *   - `data`        latest successful value; `null` until the first fetch resolves
 *   - `loading`     true until the first fetch settles (regardless of success)
 *   - `error`       last error, cleared on the next successful fetch
 *   - `refresh`     imperative trigger (uses the LATEST fetcher closure)
 *   - `lastUpdated` timestamp of the last successful fetch
 *
 * Behaviour:
 *   - Skips updates if the component unmounts mid-fetch
 *   - Retains the previous successful value on transient failure (so a flaky
 *     backend doesn't blank the page), but ALSO surfaces the error so the
 *     consumer can show an inline banner. Sweep finding #7 (silent swallow).
 *   - Re-fetches when the browser tab returns to foreground
 *   - Re-fetches whenever `fetcher` identity changes (e.g. a filter changed
 *     and the parent rebuilt the closure). Fixes the BacktestsListPage
 *     filter-doesn't-refresh-for-15s bug (sweep finding #8).
 *   - Distinguishes "still loading" from "successfully fetched and empty" so
 *     consumers can show a skeleton instead of a flash-of-empty-state. Sweep #6.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 15_000,
): {
  data: T | null;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);
  // Stash the latest fetcher so refresh() always invokes the current closure
  // even if the consumer forgets to list it as a dep somewhere downstream.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      if (mountedRef.current) {
        setData(next);
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (e) {
      // Keep previous `data` (so flaky backends don't blank the screen) but
      // expose `error` so the consumer can show a banner. Sweep #7.
      if (mountedRef.current) setError(e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    refresh();
    intervalRef.current = window.setInterval(refresh, intervalMs);

    // Refetch when tab returns to foreground — feels much more "live"
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
    // `fetcher` is in deps so when its identity changes (parent rebuilt the
    // closure for a new filter), the next polling tick AND an immediate
    // refresh both use the new closure. Sweep #8.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, fetcher]);

  return { data, loading, error, refresh, lastUpdated };
}
