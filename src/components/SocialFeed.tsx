import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/GameContext';
import SocialFeedView from './social/SocialFeedView';
import { getVisibleSocialPosts } from '../services/social/socialPostVisibility';

export const SocialFeed: React.FC = () => {
  const { state } = useGame();
  const duePosts = getVisibleSocialPosts(state.socialFeed, state.date);
  const [visiblePosts, setVisiblePosts] = useState(duePosts);
  const prevFeedRef = useRef(duePosts);

  useEffect(() => {
    const currentPosts = getVisibleSocialPosts(state.socialFeed, state.date);
    const prevIds = new Set(prevFeedRef.current.map(p => p.id));
    const newPosts = currentPosts.filter(p => p.isNew && !prevIds.has(p.id));
    const oldPosts = currentPosts.filter(p => !p.isNew || prevIds.has(p.id));

    if (newPosts.length === 0) {
      setVisiblePosts(currentPosts);
      prevFeedRef.current = currentPosts;
      return;
    }

    // Show old posts immediately
    setVisiblePosts(oldPosts);
    prevFeedRef.current = currentPosts;

    // Reveal new posts one by one with stagger
    newPosts.forEach((post, i) => {
      setTimeout(() => {
        setVisiblePosts(prev => {
          if (prev.find(p => p.id === post.id)) return prev;
          return [post, ...prev];
        });
      }, (i + 1) * 2500);
    });
  }, [state.date, state.socialFeed]);

  return <SocialFeedView posts={visiblePosts} />;
};
