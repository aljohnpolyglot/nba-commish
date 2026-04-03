import React from 'react';
import { GameState, CommissionerLogEntry } from '../types';

export const useGameActions = (setState: React.Dispatch<React.SetStateAction<GameState>>) => {
  const markEmailRead = (id: string) => {
    setState(prev => ({
      ...prev,
      inbox: prev.inbox.map(e => e.id === id ? { ...e, read: true } : e)
    }));
  };

  const clearOutcome = () => {
    setState(prev => ({ ...prev, lastOutcome: null, lastConsequence: null, isProcessing: false }));
  };

  const saveSocialThread = (postId: string, replies: any[]) => {
    const ensureIds = replies.map((r, i) => r.id ? r : { ...r, id: `reply-${postId}-${i}-${Date.now()}` });
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map(post =>
        post.id === postId ? { ...post, replies: ensureIds } : post
      )
    }));
  };

  const toggleLike = (postId: string) => {
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map(post => {
        if (post.id === postId) {
          const isLiked = post.isLiked;
          return { ...post, isLiked: !isLiked, likes: post.likes + (isLiked ? -1 : 1) };
        }
        return post;
      })
    }));
  };

  const toggleRetweet = (postId: string) => {
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map(post => {
        if (post.id === postId) {
          const isRetweeted = post.isRetweeted;
          return { ...post, isRetweeted: !isRetweeted, retweets: post.retweets + (isRetweeted ? -1 : 1) };
        }
        return post;
      })
    }));
  };

  const markSocialRead = () => {
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map(post => ({ ...post, isNew: false }))
    }));
  };

  const markNewsRead = () => {
    setState(prev => ({
      ...prev,
      news: prev.news.map(n => ({ ...n, isNew: false }))
    }));
  };

  const markChatRead = (chatId: string) => {
    setState(prev => ({
      ...prev,
      chats: prev.chats.map(chat =>
        chat.id === chatId
          ? { ...chat, unreadCount: 0, messages: chat.messages.map(m => ({ ...m, seen: true })) }
          : chat
      )
    }));
  };

  const followUser = (handle: string) => {
    setState(prev => ({
      ...prev,
      followedHandles: [...(prev.followedHandles || []), handle]
    }));
  };

  const unfollowUser = (handle: string) => {
    setState(prev => ({
      ...prev,
      followedHandles: (prev.followedHandles || []).filter(h => h !== handle)
    }));
  };

  const markPayslipsRead = () => {
    setState(prev => ({
      ...prev,
      hasUnreadPayslip: false
    }));
  };

  const updatePlayerRatings = (playerId: string, season: number, ratings: Record<string, number>) => {
    setState(prev => ({
      ...prev,
      players: prev.players.map(p => {
        if (p.internalId !== playerId) return p;
        const updatedRatings = p.ratings?.map((r: any) =>
          r.season === season ? { ...r, ...ratings } : r
        ) ?? [];
        const hasMatch = p.ratings?.some((r: any) => r.season === season);
        return {
          ...p,
          ratings: hasMatch ? updatedRatings : p.ratings?.map((r: any, i: number) =>
            i === (p.ratings!.length - 1) ? { ...r, ...ratings } : r
          ) ?? [],
        };
      }),
    }));
  };

  const healPlayer = (playerId: string) => {
    setState(prev => {
      const player = prev.players.find(p => p.internalId === playerId);
      if (!player) return prev;

      const injuryType = (player as any).injury?.type || 'undisclosed injury';
      const lastName = player.name.split(' ').pop() || player.name;
      const team = prev.teams.find(t => t.id === player.tid);
      const teamName = team ? `the ${team.name}` : 'his team';

      const logEntry: CommissionerLogEntry = {
        id: `heal-${Date.now()}`,
        type: 'HEAL_PLAYER',
        date: prev.date,
        subject: player.name,
        subjectId: playerId,
        coverStory: `${player.name} was officially cleared by ${teamName}'s medical staff, recovering from ${injuryType} ahead of schedule.`,
        internalNote: `Commissioner manually cleared ${player.name}'s injury (${injuryType}) on ${prev.date}.`,
      };

      const narrative = `MEDICAL CLEARANCE BULLETIN: ${player.name} (${injuryType}) has been officially cleared by ${teamName}'s doctors and is immediately available. The team described it as an "ahead-of-schedule recovery." Media, fans, and analysts react to ${lastName}'s surprise return.`;

      const updated = { ...player } as any;
      delete updated.injury;

      return {
        ...prev,
        players: prev.players.map(p => p.internalId === playerId ? updated : p),
        commissionerLog: [...(prev.commissionerLog || []), logEntry],
        pendingNarratives: [...(prev.pendingNarratives || []), narrative],
      };
    });
  };

  return {
    markEmailRead,
    clearOutcome,
    saveSocialThread,
    toggleLike,
    toggleRetweet,
    markSocialRead,
    markNewsRead,
    markChatRead,
    followUser,
    unfollowUser,
    markPayslipsRead,
    updatePlayerRatings,
    healPlayer,
  };
};
