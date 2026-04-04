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
        const profileData = await fetchProfileData(handle, dispatchAction);
        if (profileData && (profileData.avatarUrl || profileData.name !== handle)) {
          const updatedFeed = state.socialFeed.map(post => {
            if (post.handle.replace('@', '') === handle) {
              return {
                ...post,
                author: profileData.name || post.author,
                avatarUrl: profileData.avatarUrl || post.avatarUrl,
                verified: profileData.verified || post.verified,
              };
            }
            return post;
          });
          if (JSON.stringify(updatedFeed) !== JSON.stringify(state.socialFeed)) {
            dispatchAction({ type: 'SET_FEED', payload: updatedFeed } as any);
          }
        }
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