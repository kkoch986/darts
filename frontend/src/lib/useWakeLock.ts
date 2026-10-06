import { useEffect, useRef } from 'react';

/**
 * Holds a Screen Wake Lock while `enabled`. The browser drops the lock whenever
 * the tab is hidden, so it has to be re-acquired on the way back in.
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const current = sentinelRef.current;
      if (current && !current.released) return;

      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled || document.visibilityState !== 'visible') {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {}
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [enabled]);
}