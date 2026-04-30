import React, { useState } from 'react';
import { GameState, CommissionerLogEntry, SocialPost, NBAPlayer } from '../types';
import { calculatePlayerOverallForYear } from '../utils/playerRatings';

export const useGameActions = (setState: React.Dispatch<React.SetStateAction<GameState>>, getState: () => GameState) => {
  const [isGeneratingReplies, setIsGeneratingReplies] = useState<Record<string, boolean>>({});
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
        const newRatings = hasMatch ? updatedRatings : p.ratings?.map((r: any, i: number) =>
          i === (p.ratings!.length - 1) ? { ...r, ...ratings } : r
        ) ?? [];
        // Recalculate overallRating immediately so UI reflects the change without waiting for next-day sim
        const updatedPlayer = { ...p, ratings: newRatings } as any;
        const newOvr = calculatePlayerOverallForYear(updatedPlayer, season);
        return { ...updatedPlayer, overallRating: newOvr };
      }),
    }));
  };

  const createPlayer = (player: NBAPlayer) => {
    setState(prev => {
      const team = prev.teams.find(t => t.id === player.tid)
        ?? (prev.nonNBATeams ?? []).find((t: any) => t.tid === player.tid);
      const isProspect = player.tid === -2 || player.status === 'Draft Prospect';
      const isFreeAgent = player.tid === -1 || player.status === 'Free Agent';
      const isRetired = player.status === 'Retired';
      const teamName = team
        ? `${(team as any).region ? `${(team as any).region} ` : ''}${team.name}`.trim()
        : isProspect ? `the ${player.draft?.year ?? prev.leagueStats?.year ?? ''} draft pool`.trim()
        : isFreeAgent ? 'free agency'
        : isRetired ? 'the retired player archive'
        : 'the league';

      const historyEntry = {
        text: `${player.name} was created and added to ${teamName}.`,
        date: prev.date,
        type: isProspect ? 'Draft' : 'Signing',
        playerIds: [player.internalId],
      };

      return {
        ...prev,
        players: [player, ...prev.players],
        history: [...((prev as any).history ?? []), historyEntry] as any,
      };
    });
  };

  const updateProfile = (profile: Partial<import('../types').UserProfile>) => {
    setState(prev => ({
      ...prev,
      userProfile: { ...(prev.userProfile || { name: '', handle: '' }), ...profile },
    }));
  };

  const addPost = (post: SocialPost) => {
    setState(prev => ({
      ...prev,
      socialFeed: [post, ...prev.socialFeed],
    }));
  };

  const addReply = (postId: string, reply: SocialPost) => {
    setState(prev => ({
      ...prev,
      socialFeed: [reply, ...prev.socialFeed],
    }));
  };

  const generateReplies = async (postId: string) => {
    const currentState = getState();
    const post = currentState.socialFeed.find(p => p.id === postId);
    if (!post || isGeneratingReplies[postId]) return;

    // Check if replies already exist in feed
    const existingReplies = currentState.socialFeed.filter(p => p.replyToId === postId);
    if (existingReplies.length > 0) return;

    setIsGeneratingReplies(prev => ({ ...prev, [postId]: true }));

    try {
      const { SettingsManager } = await import('../services/SettingsManager');
      const settings = SettingsManager.getSettings();

      let generatedData: any[] = [];

      if (!settings.enableLLM) {
        // LLM disabled — generate 3 static NBA Twitter-style replies
        const templates = [
          { author: 'NBA Fan', handle: '@NBAFan2026', content: '🔥🔥🔥', likes: Math.floor(Math.random() * 200) + 10, retweets: Math.floor(Math.random() * 30) + 1 },
          { author: 'HoopHead', handle: '@HoopHeadNBA', content: 'Facts 💯', likes: Math.floor(Math.random() * 150) + 5, retweets: Math.floor(Math.random() * 20) },
          { author: 'StatWatch', handle: '@StatWatchNBA', content: 'Big news 👀', likes: Math.floor(Math.random() * 100) + 5, retweets: Math.floor(Math.random() * 15) },
        ];
        generatedData = templates;
      } else {
        const { generateContentWithRetry } = await import('../services/llm/utils/api');
        const response = await generateContentWithRetry({
          model: 'gemini-2.5-flash-lite',
          contents: `Generate 3-5 realistic Twitter replies to this tweet by ${post.author} (${post.handle}): "${post.content}". Return ONLY a JSON array, no markdown, with objects: {author, handle, content, likes, retweets}`,
          config: { responseMimeType: 'application/json' },
        });
        const raw = response.text?.replace(/```json|```/g, '').trim() || '[]';
        try {
          const parsed = JSON.parse(raw);
          generatedData = Array.isArray(parsed) ? parsed : [];
        } catch { generatedData = []; }
      }

      const newReplies: SocialPost[] = generatedData.map((data: any, index: number) => ({
        id: `gen-reply-${postId}-${index}-${Date.now()}`,
        author: data.author,
        handle: data.handle,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.handle.replace('@', '')}`,
        content: data.content,
        date: new Date().toISOString(),
        likes: data.likes || 0,
        retweets: data.retweets || 0,
        replies: [],
        source: 'TwitterX',
        replyToId: postId,
        isLiked: false,
        isRetweeted: false,
        isAI: true,
      }));

      const ids = new Set(currentState.socialFeed.map(p => p.id));
      const unique = newReplies.filter(r => !ids.has(r.id));
      setState(prev => ({
        ...prev,
        socialFeed: [...prev.socialFeed, ...unique],
      }));
    } catch (error) {
      console.error('[generateReplies] failed:', error);
    } finally {
      setIsGeneratingReplies(prev => ({ ...prev, [postId]: false }));
    }
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
    createPlayer,
    updateProfile,
    healPlayer,
    addPost,
    addReply,
    generateReplies,
    isGeneratingReplies,
  };
};
