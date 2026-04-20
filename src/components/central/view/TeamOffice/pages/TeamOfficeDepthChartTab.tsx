/**
 * TeamOfficeDepthChartTab — read-only depth chart visible to opposing GMs.
 *
 * The Coaching tab is hidden when scouting another team (can't edit their
 * rotation), but GMs still need a quick way to see who starts where and
 * who's in the second unit. Reuses StarterService.getProjectedStarters +
 * sortByPositionSlot for parity with GamePlan / IdealRotation.
 */

import React, { useMemo } from 'react';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { StarterService } from '../../../../../services/simulation/StarterService';
import { getDisplayOverall } from '../../../../../utils/playerRatings';
import type { NBAPlayer } from '../../../../../types';

interface Props {
  teamId: number;
}

const STARTER_POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const BENCH_LABELS = ['6TH', '7TH', '8TH', '9TH', '10TH'] as const;

function isInjured(p: NBAPlayer): boolean {
  return !!p.injury && (p.injury.gamesRemaining ?? 0) > 0;
}

export function TeamOfficeDepthChartTab({ teamId }: Props) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const season = state.leagueStats?.year ?? 2026;

  const { starters, bench, reserves, injured } = useMemo(() => {
    if (!team) return { starters: [] as NBAPlayer[], bench: [] as NBAPlayer[], reserves: [] as NBAPlayer[], injured: [] as NBAPlayer[] };

    const roster = state.players.filter(p => p.tid === teamId && p.status === 'Active');
    const healthy = roster.filter(p => !isInjured(p));
    const injuredList = roster.filter(isInjured).sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a));

    // Reuse StarterService so the lineup matches what GamePlan / IdealRotation show.
    const rawStarters = StarterService.getProjectedStarters(team, state.players, season, healthy);
    const starterList = StarterService.sortByPositionSlot(rawStarters, season);
    const starterIds = new Set(starterList.map(p => p.internalId));

    const remaining = healthy
      .filter(p => !starterIds.has(p.internalId))
      .sort((a, b) => getDisplayOverall(b) - getDisplayOverall(a));

    // First 5 off the bench = second unit, rest = deep bench.
    const benchList = remaining.slice(0, 5);
    const reserveList = remaining.slice(5);

    return { starters: starterList, bench: benchList, reserves: reserveList, injured: injuredList };
  }, [team, state.players, teamId, season]);

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Starters */}
      <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Starting Five</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Full Strength</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          {STARTER_POS_ORDER.map((pos, i) => {
            const p = starters[i];
            if (!p) {
              return (
                <div key={pos} className="aspect-[3/4] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase">
                  {pos}
                </div>
              );
            }
            return <DepthChartCard key={p.internalId} player={p} slotLabel={pos} season={season} accent="sky" />;
          })}
        </div>
      </section>

      {/* Second unit */}
      <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Second Unit</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Rotation Bench</div>
        </div>
        {bench.length === 0 ? (
          <div className="text-slate-500 text-xs">No bench players available.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
            {bench.map((p, i) => (
              <DepthChartCard key={p.internalId} player={p} slotLabel={BENCH_LABELS[i] ?? `${i + 6}TH`} season={season} accent="emerald" />
            ))}
          </div>
        )}
      </section>

      {/* Deep bench */}
      {reserves.length > 0 && (
        <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Reserves</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
            {reserves.map(p => (
              <DepthChartCard key={p.internalId} player={p} slotLabel={p.pos ?? 'F'} season={season} accent="slate" />
            ))}
          </div>
        </section>
      )}

      {/* Injured */}
      {injured.length > 0 && (
        <section className="bg-black/40 border border-rose-900/40 rounded-lg p-3 sm:p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-3">Injured / Unavailable</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
            {injured.map(p => (
              <DepthChartCard key={p.internalId} player={p} slotLabel={p.pos ?? 'F'} season={season} accent="rose" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── DepthChartCard ────────────────────────────────────────────────────────────

type Accent = 'sky' | 'emerald' | 'slate' | 'rose';

const ACCENT_STYLES: Record<Accent, { badge: string; border: string }> = {
  sky:     { badge: 'text-sky-300 bg-sky-500/15',     border: 'border-slate-700' },
  emerald: { badge: 'text-emerald-300 bg-emerald-500/15', border: 'border-slate-700' },
  slate:   { badge: 'text-slate-300 bg-slate-700/40',  border: 'border-slate-800' },
  rose:    { badge: 'text-rose-300 bg-rose-500/15',    border: 'border-rose-900/60' },
};

function DepthChartCard({
  player,
  slotLabel,
  season,
  accent,
}: {
  player: NBAPlayer;
  slotLabel: string;
  season: number;
  accent: Accent;
}) {
  void season;
  const ovr = getDisplayOverall(player);
  const pos = player.pos ?? 'F';
  const styles = ACCENT_STYLES[accent];

  return (
    <div className={`relative bg-gradient-to-b from-slate-800/70 to-slate-900/90 rounded-lg p-2 border ${styles.border} flex flex-col items-center gap-1`}>
      <div className={`absolute top-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded z-10 ${styles.badge}`}>
        {slotLabel}
      </div>
      <div className="absolute top-1 right-1 text-[9px] font-black text-slate-300 bg-black/60 px-1.5 py-0.5 rounded z-10">
        {ovr}
      </div>
      <PlayerPortrait
        imgUrl={player.imgURL}
        playerName={player.name}
        size={64}
        overallRating={player.overallRating}
        ratings={player.ratings}
      />
      <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full mt-1">
        {player.name}
      </div>
      <div className="text-[9px] text-slate-500 uppercase tracking-widest">{pos}</div>
    </div>
  );
}
