import React from 'react';
import { PlayerSelectorGrid } from '../../throne/components/PlayerSelectorGrid';
import type { ContestPickItem } from './contestPlayerTypes';

interface ContestPlayerSelectorProps {
  items: ContestPickItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  maxSelections: number;
}

export const ContestPlayerSelector: React.FC<ContestPlayerSelectorProps> = ({
  items,
  selectedIds,
  onToggle,
  maxSelections,
}) => (
  <PlayerSelectorGrid
    items={items.map(({ player, score }) => ({ player, score }))}
    selectedIds={selectedIds}
    onToggle={onToggle}
    maxSelections={maxSelections}
  />
);
