import React from 'react';
import { OlympicEvent, EventResult, Player } from '../types';

interface GolfViewProps {
  event: OlympicEvent;
  players: Player[];
  gameSeed: number;
  isPaused?: boolean;
  onFinish: (results: EventResult[]) => void;
}

export function GolfView({ event, players, gameSeed, isPaused, onFinish }: GolfViewProps) {
  void event;
  void players;
  void gameSeed;
  void isPaused;
  void onFinish;
  return null;
}
