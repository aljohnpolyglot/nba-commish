import React from 'react';
import { GameState } from '../types';

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
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map(post => 
        post.id === postId ? { ...post, replies } : post
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
    markPayslipsRead
  };
};
