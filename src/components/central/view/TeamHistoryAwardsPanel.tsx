import React, { useState } from 'react';
import { Award } from 'lucide-react';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import type { TeamHistoryAwardRankings } from '../../../services/history/teamHistoryAwards';
import type { TeamHistoryPlayerReference } from './TeamHistoryPanels';

interface Props {
  accent: string;
  rankings: TeamHistoryAwardRankings;
  onOpenPlayer: (reference: TeamHistoryPlayerReference) => void;
}

export const TeamHistoryAwardsPanel: React.FC<Props> = ({ accent, rankings, onOpenPlayer }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!rankings.categories.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-5 py-12 text-center">
        <Award className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
        <p className="text-sm font-bold text-zinc-300">No supported award records for this history.</p>
        <p className="mt-1 text-xs text-zinc-600">Awards appear when a season and player identity can be verified.</p>
      </div>
    );
  }

  return (
    <section aria-label="Awards leaders">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-widest" style={{ color: accent }}>
            <Award className="h-5 w-5" /> Awards Leaders
          </h2>
          <p className="mt-1 text-xs text-zinc-600">Verified awards through the selected historical window.</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">{rankings.eventCount} awards</span>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {rankings.categories.map(category => {
          const shown = expanded[category.key] ? category.leaders : category.leaders.slice(0, 10);
          return (
            <article key={category.key} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <h3 className="truncate text-xs font-black uppercase tracking-[0.16em] text-zinc-200">{category.label}</h3>
                <span className="shrink-0 font-mono text-[9px] uppercase text-zinc-600">Top {Math.min(100, category.leaders.length)}</span>
              </div>
              <ol className="space-y-2">
                {shown.slice(0, 100).map((leader, index) => (
                  <li key={leader.personId}>
                    <button
                      type="button"
                      onClick={() => onOpenPlayer({
                        name: leader.name,
                        playerId: leader.playerId,
                        playerRef: leader.player,
                        playerIdentityMatch: leader.playerId ? 'id' : 'source',
                      })}
                      className="grid w-full grid-cols-[24px_36px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-transparent bg-zinc-950/55 px-2 py-2 text-left transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2"
                      style={{ '--tw-ring-color': accent } as React.CSSProperties}
                    >
                      <span className="text-center font-mono text-[10px] font-black" style={{ color: index < 3 ? accent : '#71717a' }}>#{index + 1}</span>
                      <PlayerPortrait
                        imgUrl={leader.player?.imgURL}
                        playerName={leader.name}
                        playerIdentity={leader.player}
                        portraitSeason={leader.lastSeason}
                        size={36}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-zinc-100">{leader.name}</span>
                        <span className="block truncate font-mono text-[9px] text-zinc-600">
                          {leader.firstSeason === leader.lastSeason ? leader.firstSeason : `${leader.firstSeason}–${leader.lastSeason}`}
                        </span>
                      </span>
                      <span className="font-mono text-sm font-black" style={{ color: accent }}>{leader.count}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {category.leaders.length > 10 && (
                <button
                  type="button"
                  onClick={() => setExpanded(current => ({ ...current, [category.key]: !current[category.key] }))}
                  className="mt-3 w-full border-t border-zinc-800 pt-3 text-center text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-200"
                >
                  {expanded[category.key] ? 'Show top 10' : `Show all ${Math.min(100, category.leaders.length)}`}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
