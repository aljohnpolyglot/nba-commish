import React from 'react';
import { useGame } from '../store/GameContext';
import SocialFeedView from './social/SocialFeedView';

export const SocialFeed: React.FC = () => {
  const { state } = useGame();
  return <SocialFeedView posts={state.socialFeed} />;
};
