import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../store/GameContext';
import SocialFeedView from './social/SocialFeedView';

export const SocialFeed: React.FC = () => {
  const { state } = useGame();
  const [visiblePosts, setVisiblePosts] = useState(state.socialFeed);
  const prevFeedRef = useRef(state.socialFeed);

  useEffect(() => {
    const prevIds = new Set(prevFeedRef.current.map(p => p.id));
    const newPosts = state.socialFeed.filter(p => p.isNew && !prevIds.has(p.id));
    const oldPosts = state.socialFeed.filter(p => !p.isNew || prevIds.has(p.id));

    if (newPosts.length === 0) {
      setVisiblePosts(state.socialFeed);
      prevFeedRef.current = state.socialFeed;
      return;
    }

    // Show old posts immediately
    setVisiblePosts(oldPosts);
    prevFeedRef.current = state.socialFeed;

    // Reveal new posts one by one with stagger
    newPosts.forEach((post, i) => {
      setTimeout(() => {
        setVisiblePosts(prev => {
          if (prev.find(p => p.id === post.id)) return prev;
          return [post, ...prev];
        });
      }, (i + 1) * 2500);
    });
  }, [state.socialFeed]);

  return <SocialFeedView posts={visiblePosts} />;
};
