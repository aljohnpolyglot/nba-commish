import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameResult, SocialPost } from '../../types';
import { useGame } from '../../store/GameContext';
import { useInView } from '../../hooks/useInView';
import { enrichPostWithPhoto, getResolvedUrl, type GamePhotoInfo } from '../../services/social/photoEnricher';
import { resolveAnyTeam } from '../../utils/teamLookup';
import SocialPostCard from '../social/SocialPostCard';
import { WhoToFollow } from '../social/SidebarComponents';

export function useGameLookup(): Map<number, GamePhotoInfo> {
  const { state } = useGame();
  return useMemo(() => {
    const lookup = new Map<number, GamePhotoInfo>();
    for (const boxScore of (state.boxScores || []) as GameResult[]) {
      if (!boxScore.gameId || boxScore.homeTeamId < 0 || boxScore.awayTeamId < 0) continue;
      const home = resolveAnyTeam(boxScore.homeTeamId, state.teams, state.nonNBATeams ?? []);
      const away = resolveAnyTeam(boxScore.awayTeamId, state.teams, state.nonNBATeams ?? []);
      if (!home || !away) continue;
      const topPlayers = [...(boxScore.homeStats || []), ...(boxScore.awayStats || [])]
        .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))
        .slice(0, 10)
        .map((stat) => ({ name: stat.name, gameScore: stat.gameScore ?? 0 }));
      lookup.set(boxScore.gameId, { homeTeam: home, awayTeam: away, topPlayers, date: boxScore.date || '' });
    }
    return lookup;
  }, [state.boxScores, state.teams, state.nonNBATeams]);
}

export type TwitterViewState = {
  type: 'feed' | 'profile' | 'thread' | 'following-list' | 'explore' | 'connect';
  handle?: string;
  postId?: string;
};

export function useInfiniteFeedLimit(resetKeys: unknown[]) {
  const [displayLimit, setDisplayLimit] = useState(10);
  const observer = useRef<IntersectionObserver | null>(null);

  const lastTweetElementRef = useCallback((node: HTMLDivElement | null) => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setDisplayLimit((prev) => prev + 10);
      }
    }, { threshold: 0.1 });
    if (node) observer.current.observe(node);
  }, []);

  useEffect(() => {
    setDisplayLimit(10);
  }, resetKeys);

  return { displayLimit, lastTweetElementRef };
}

type LazyPhotoCardProps = {
  post: SocialPost;
  gameLookup: Map<number, GamePhotoInfo>;
  leagueType?: string;
  onClick: () => void;
  onProfileClick: (handle?: string) => void;
};

export const LazyPhotoCard: React.FC<LazyPhotoCardProps> = ({ post, gameLookup, leagueType, onClick, onProfileClick }) => {
  const { ref, inView } = useInView(0.05);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | undefined>(() => {
    const cached = getResolvedUrl(post.id);
    return cached ?? post.mediaUrl ?? undefined;
  });
  useEffect(() => {
    if (!inView || resolvedMediaUrl) return;
    let cancelled = false;
    enrichPostWithPhoto(post, gameLookup, leagueType).then((url) => {
      if (!cancelled && url) setResolvedMediaUrl(url);
    });
    return () => { cancelled = true; };
  }, [gameLookup, inView, leagueType, post, resolvedMediaUrl]);
  const enriched: SocialPost = resolvedMediaUrl ? { ...post, mediaUrl: resolvedMediaUrl } : post;
  return (
    <div ref={ref}>
      <SocialPostCard post={enriched} onClick={onClick} onProfileClick={onProfileClick} />
    </div>
  );
};

export const WhoToFollowFeedBlock = ({
  onProfileClick,
  suggestedUsersList,
}: {
  onProfileClick: (handle: string) => void;
  suggestedUsersList: any[];
}) => {
  const { state, followUser, unfollowUser } = useGame();

  if (!suggestedUsersList || suggestedUsersList.length === 0) return null;

  return (
    <>
      {suggestedUsersList.slice(0, 3).map((user: any, index: number) => (
        <WhoToFollow
          key={index}
          {...user}
          isFollowing={(state.followedHandles || []).includes(user.handle.replace('@', ''))}
          onToggleFollow={() => {
            const cleanHandle = user.handle.replace('@', '');
            if ((state.followedHandles || []).includes(cleanHandle)) {
              unfollowUser(cleanHandle);
            } else {
              followUser(cleanHandle);
            }
          }}
          onProfileClick={() => onProfileClick(user.handle)}
        />
      ))}
    </>
  );
};
