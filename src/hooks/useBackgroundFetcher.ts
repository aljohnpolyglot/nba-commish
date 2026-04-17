import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/GameContext';
import { fetchProfileData } from '../utils/socialapi';

export const useBackgroundFetcher = () => {
  const { state, dispatchAction } = useGame();
  const processedHandles = useRef<Set<string>>(new Set());
  const isFetching = useRef(false);
 const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const fetchLoop = async () => {
      if (isFetching.current) return;

      const handlesToFetch = Array.from(new Set(
        state.socialFeed
          .map(p => p.handle.replace('@', ''))
          .filter(h => h !== 'username' && !processedHandles.current.has(h) && !state.cachedProfiles?.[h])
      ));

      if (handlesToFetch.length === 0) return;

      const handle = handlesToFetch[0] as string;
      processedHandles.current.add(handle);
      isFetching.current = true;

      try {
        // fetchProfileData already dispatches CACHE_PROFILE — that's sufficient.
        // No need to replace the entire socialFeed array (was causing expensive
        // JSON.stringify deep-compare + full re-render of 500 posts).
        await fetchProfileData(handle, dispatchAction, state);
      } catch (e) {
        // Silently fail — handle just doesn't exist on Twitter
      } finally {
        isFetching.current = false;
        // Slower cadence (5s) to reduce UI thread pressure
        timerRef.current = setTimeout(fetchLoop, 5000);
      }
    };

    timerRef.current = setTimeout(fetchLoop, 5000);
    return () => clearTimeout(timerRef.current);
    // Only re-run when feed size changes significantly (not on every cachedProfile update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor((state.socialFeed?.length ?? 0) / 50)]);
};