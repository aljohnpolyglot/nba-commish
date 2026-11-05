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
import { injurySeverityLevel } from '../../../../../services/simulation/playThroughInjuriesFactor';
import type { GameState, NBAPlayer } from '../../../../../types';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import { resolveAnyTeam, isOnRoster } from '../../../../../utils/teamLookup';
import { getScoutedDisplayOverall } from '../../../../../utils/scoutingFuzz';
import { getCourtSlotLabels, getPlayersOnCourt } from '../../../../../services/simulation/courtSize';

interface Props {
  teamId: number;
}

// Normalize BBGM depth-context tags (G/GF/F/FC) into the standard 5 positions
// the depth chart displays. Matches the slot vocabulary used by GamePlan /
// IdealRotation hardcoded labels.
function normalizePos(p: NBAPlayer): string {
  const pos = (p.pos || '').toUpperCase();
  if (pos === 'PG' || pos === 'SG' || pos === 'SF' || pos === 'PF' || pos === 'C') return pos;
  if (pos === 'G') return 'PG';
  if (pos === 'GF') return 'SG';
  if (pos === 'F') return 'SF';
  if (pos === 'FC') return 'C';
  return 'SF';
}

/** Regular-season play-through level — mirrors the game engine default (2 = day-to-day + moderate). */
const DEPTH_PTI_LEVEL = 2;

function isInjured(p: NBAPlayer): boolean {
  const g = p.injury?.gamesRemaining ?? 0;
  if (g <= 0) return false;
  return injurySeverityLevel(g) > DEPTH_PTI_LEVEL;
}

export function TeamOfficeDepthChartTab({ teamId }: Props) {
  const { state } = useGame();
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const playersOnCourt = getPlayersOnCourt(state.leagueStats);
  const starterSlots = getCourtSlotLabels(playersOnCourt);
  const courtGridStyle = {
    '--court-columns': Math.min(5, playersOnCourt),
  } as React.CSSProperties;
  const visibleOvr = (player: NBAPlayer) => getScoutedDisplayOverall(state, player, season);

  const { starters, bench, thirdUnit, reserves, injured } = useMemo(() => {
    if (!team) return { starters: [] as NBAPlayer[], bench: [] as NBAPlayer[], thirdUnit: [] as NBAPlayer[], reserves: [] as NBAPlayer[], injured: [] as NBAPlayer[] };

    const roster = state.players.filter(p => p.tid === teamId && isOnRoster(p));
    const healthy = roster.filter(p => !isInjured(p));
    const injuredList = roster.filter(isInjured).sort((a, b) => visibleOvr(b) - visibleOvr(a));

    // Reuse StarterService so the lineup matches what GamePlan / IdealRotation show.
    const rawStarters = StarterService.getProjectedStarters(
      team,
      state.players,
      season,
      healthy,
      true,
      playersOnCourt,
    );
    const starterList = StarterService.sortByPositionSlot(rawStarters, season);
    const starterIds = new Set(starterList.map(p => p.internalId));

    const nonStarters = healthy
      .filter(p => !starterIds.has(p.internalId))
      .sort((a, b) => visibleOvr(b) - visibleOvr(a));

    // Second unit: strongest healthy bench unit, ordered by the active court slots.
    const benchPool = nonStarters.slice(0, playersOnCourt);
    const benchList = StarterService.sortByPositionSlot(benchPool, season);

    // Deep-bench handling flips on roster depth:
    //   - ≥14 healthy → "Third Unit": positionally slotted PG→C (5 cards)
    //   - <14 healthy → plain "Reserves": OVR-sorted dump, raw pos labels
    const deepPool = nonStarters.slice(playersOnCourt);
    const deepRosterThreshold = playersOnCourt * 2 + 4;
    const thirdUnitList = healthy.length >= deepRosterThreshold
      ? StarterService.sortByPositionSlot(deepPool.slice(0, playersOnCourt), season)
      : [];
    const reserveList = healthy.length < deepRosterThreshold ? deepPool : deepPool.slice(playersOnCourt);

    return { starters: starterList, bench: benchList, thirdUnit: thirdUnitList, reserves: reserveList, injured: injuredList };
  }, [team, state, state.players, teamId, season, playersOnCourt]);

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Starters */}
      <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Starting Lineup ({playersOnCourt})</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Full Strength</div>
        </div>
        <div
          className="grid grid-cols-2 sm:[grid-template-columns:repeat(var(--court-columns),minmax(0,1fr))] gap-2 sm:gap-3"
          style={courtGridStyle}
        >
          {starterSlots.map((pos, i) => {
            const p = starters[i];
            if (!p) {
              return (
                <div key={pos} className="h-[100px] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase">
                  {pos}
                </div>
              );
            }
            return <DepthChartCard key={p.internalId} player={p} slotLabel={pos} season={season} state={state} accent="sky" />;
          })}
        </div>
      </section>

      {/* Second Unit */}
      <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Second Unit</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Rotation Bench</div>
        </div>
        {bench.length === 0 ? (
          <div className="text-slate-500 text-xs">No bench players available.</div>
        ) : (
          <div
            className="grid grid-cols-2 sm:[grid-template-columns:repeat(var(--court-columns),minmax(0,1fr))] gap-2 sm:gap-3"
            style={courtGridStyle}
          >
            {starterSlots.map((pos, i) => {
              const p = bench[i];
              if (!p) {
                return (
                  <div key={pos} className="h-[100px] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase">
                    {pos}
                  </div>
                );
              }
              return <DepthChartCard key={p.internalId} player={p} slotLabel={pos} season={season} state={state} accent="emerald" />;
            })}
          </div>
        )}
      </section>

      {/* Third Unit — mirrors the configured unit when roster depth permits. */}
      {thirdUnit.length > 0 && (
        <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Third Unit</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">Deep Bench</div>
          </div>
          <div
            className="grid grid-cols-2 sm:[grid-template-columns:repeat(var(--court-columns),minmax(0,1fr))] gap-2 sm:gap-3"
            style={courtGridStyle}
          >
            {starterSlots.map((pos, i) => {
              const p = thirdUnit[i];
              if (!p) {
                return (
                  <div key={pos} className="h-[100px] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 text-xs uppercase">
                    {pos}
                  </div>
                );
              }
              return <DepthChartCard key={p.internalId} player={p} slotLabel={pos} season={season} state={state} accent="amber" />;
            })}
          </div>
        </section>
      )}

      {/* Reserves — fallback for thin rosters (<14 healthy), OVR-sorted dump */}
      {reserves.length > 0 && (
        <section className="bg-black/40 border border-slate-800 rounded-lg p-3 sm:p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Reserves</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
            {reserves.map(p => (
              <DepthChartCard key={p.internalId} player={p} slotLabel={normalizePos(p)} season={season} state={state} accent="slate" />
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
              <DepthChartCard key={p.internalId} player={p} slotLabel={normalizePos(p)} season={season} state={state} accent="rose" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── DepthChartCard ────────────────────────────────────────────────────────────

type Accent = 'sky' | 'emerald' | 'amber' | 'slate' | 'rose';

const ACCENT_STYLES: Record<Accent, { badge: string; border: string }> = {
  sky:     { badge: 'text-sky-300 bg-sky-500/15',         border: 'border-slate-700' },
  emerald: { badge: 'text-emerald-300 bg-emerald-500/15', border: 'border-slate-700' },
  amber:   { badge: 'text-amber-300 bg-amber-500/15',     border: 'border-slate-700' },
  slate:   { badge: 'text-slate-300 bg-slate-700/40',     border: 'border-slate-800' },
  rose:    { badge: 'text-rose-300 bg-rose-500/15',       border: 'border-rose-900/60' },
};

function DepthChartCard({
  player,
  slotLabel,
  season,
  state,
  accent,
}: {
  player: NBAPlayer;
  slotLabel: string;
  season: number;
  state: GameState;
  accent: Accent;
}) {
  const styles = ACCENT_STYLES[accent];
  const displayOvr = getScoutedDisplayOverall(state, player, season);

  return (
    <div className={`relative bg-gradient-to-b from-slate-800/70 to-slate-900/90 rounded-lg p-2 border ${styles.border} flex flex-col items-center gap-1`}>
      <div className={`absolute top-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded z-10 ${styles.badge}`}>
        {slotLabel}
      </div>
      <PlayerPortrait
        imgUrl={player.imgURL}
        face={(player as any).face}
        playerName={player.name}
        size={64}
        overallRating={player.overallRating}
        ratings={player.ratings}
        ovrLabel={String(displayOvr)}
      />
      <div className="text-[11px] font-bold text-white text-center line-clamp-1 w-full mt-1">
        <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
      </div>
    </div>
  );
}
