import React from 'react';
import { useGameplanTabController } from './useGameplanTabController';
import { GameplanTabLayout } from './GameplanTabLayout';

interface GameplanTabProps {
  teamId: number;
}

export function GameplanTab({ teamId }: GameplanTabProps) {
  const controller = useGameplanTabController(teamId);
  if (!controller.team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }
  return <GameplanTabLayout {...controller} />;
}
