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
        await fetchProfileData(handle, dispatchAction);
      } catch (e) {
        // Silently fail — handle just doesn't exist on Twitter
      } finally {
        isFetching.current = false;
        timerRef.current = setTimeout(fetchLoop, 3000);
      }
    };

    timerRef.current = setTimeout(fetchLoop, 3000);
    return () => clearTimeout(timerRef.current);
  }, [state.socialFeed.length, state.cachedProfiles]);
};