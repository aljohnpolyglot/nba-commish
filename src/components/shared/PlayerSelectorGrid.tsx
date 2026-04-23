/**
 * PlayerSelectorGrid — Reusable multi-select player picker.
 *
 * Used by: 3-Point Contest, Dunk Contest, All-Star Rigging, Trade Untouchables,
 * Trading Block editor, and any future player selection UI.
 *
 * Features:
 * - Portrait grid with OVR badge + team logo
 * - Search by name / pos / team
 * - Max selection limit
 * - Accent color customizable per context
 * - Optional stat/score display per player
 */

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { PlayerPortrait } from './PlayerPortrait';
import type { NBAPlayer, NBATeam } from '../../types';

export interface PlayerSelectorItem {
  player: NBAPlayer;
  /** Optional score/stat to display below name (e.g. "3P%: .423") */
  subtitle?: string;
  /** Optional numeric score for default sorting (higher = first) */
  score?: number;
}

interface PlayerSelectorGridProps {
  /** Full list of selectable players (pre-filtered by caller) */
  items: PlayerSelectorItem[];
  /** Teams array for abbrev/logo lookups */
  teams: NBATeam[];
  /** Currently selected player IDs */
  selectedIds: Set<string>;
  /** Toggle selection callback */
  onToggle: (playerId: string) => void;
  /** Maximum number of selections allowed */
  maxSelections: number;
  /** Accent color class for selected state (default: sky) */
  accentColor?: 'sky' | 'indigo' | 'emerald' | 'amber' | 'red';
  /** How many to show before "search to find more" (default: 30) */
  defaultVisible?: number;
  /** Placeholder text for search */
  searchPlaceholder?: string;
  /** Hide the search bar */
  hideSearch?: boolean;
}

const ACCENT_CLASSES: Record<string, { border: string; bg: string; shadow: string; check: string }> = {
  sky:     { border: 'border-sky-500',     bg: 'bg-sky-500/15',     shadow: 'shadow-sky-500/10',     check: 'bg-sky-500' },
  indigo:  { border: 'border-indigo-500',  bg: 'bg-indigo-500/15',  shadow: 'shadow-indigo-500/10',  check: 'bg-indigo-500' },
  emerald: { border: 'border-emerald-500', bg: 'bg-emerald-500/15', shadow: 'shadow-emerald-500/10', check: 'bg-emerald-500' },
  amber:   { border: 'border-amber-500',   bg: 'bg-amber-500/15',   shadow: 'shadow-amber-500/10',   check: 'bg-amber-500' },
  red:     { border: 'border-red-500',     bg: 'bg-red-500/15',     shadow: 'shadow-red-500/10',     check: 'bg-red-500' },
};

export const PlayerSelectorGrid: React.FC<PlayerSelectorGridProps> = ({
  items,
  teams,
  selectedIds,
  onToggle,
  maxSelections,
  accentColor = 'sky',
  defaultVisible = 30,
  searchPlaceholder = 'Search all players...',
  hideSearch = false,
}) => {
  const [search, setSearch] = useState('');
  const accent = ACCENT_CLASSES[accentColor] ?? ACCENT_CLASSES.sky;

  const sorted = useMemo(() =>
    [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted.slice(0, defaultVisible);
    return sorted.filter(x =>
      x.player.name.toLowerCase().includes(q) ||
      (x.player.pos ?? '').toLowerCase().includes(q) ||
      (teams.find(t => t.id === x.player.tid)?.abbrev ?? '').toLowerCase().includes(q) ||
      (teams.find(t => t.id === x.player.tid)?.name ?? '').toLowerCase().includes(q)
    );
  }, [sorted, search, teams, defaultVisible]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      {!hideSearch && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
          />
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5">
        {visible.map(x => {
          const isSelected = selectedIds.has(x.player.internalId);
          const canSelect = isSelected || selectedIds.size < maxSelections;
          const team = teams.find(t => t.id === x.player.tid);
          return (
            <button
              key={x.player.internalId}
              onClick={() => onToggle(x.player.internalId)}
              disabled={!canSelect}
              className={`flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-xl sm:rounded-2xl border transition-all text-center ${
                isSelected
                  ? `${accent.border} ${accent.bg} shadow-lg ${accent.shadow}`
                  : canSelect
                  ? 'border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/60'
                  : 'border-slate-800/50 bg-slate-900/20 opacity-30 cursor-not-allowed'
              }`}
            >
              <div className="relative">
                <PlayerPortrait
                  imgUrl={x.player.imgURL}
                  face={(x.player as any).face}
                  playerName={x.player.name}
                  teamLogoUrl={team?.logoUrl}
                  overallRating={x.player.overallRating}
                  size={56}
                />
                {isSelected && (
                  <div className={`absolute -top-1 -right-1 w-5 h-5 ${accent.check} rounded-full flex items-center justify-center`}>
                    <span className="text-white text-[10px] font-black">✓</span>
                  </div>
                )}
              </div>
              <p className="font-bold text-white text-[11px] leading-tight line-clamp-2">{x.player.name}</p>
              <p className="text-[9px] text-slate-500">
                {x.player.pos} · {team?.abbrev ?? '—'}
                {x.subtitle ? ` · ${x.subtitle}` : ''}
              </p>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      {!search && sorted.length > defaultVisible && (
        <p className="text-center text-[10px] text-slate-600 mt-1">
          Top {defaultVisible} shown — search to find anyone
        </p>
      )}
    </div>
  );
};
