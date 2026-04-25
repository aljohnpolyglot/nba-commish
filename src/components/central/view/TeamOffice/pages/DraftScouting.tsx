/**
 * DraftScouting — Team Office draft intelligence tab.
 *
 * Shows team advisors' draft recommendations based on:
 * - 70% player value (OVR-weighted for contenders, POT-weighted for rebuilders — mirrors tradeValueEngine)
 * - 30% team fit (position needs from TeamNeeds analysis)
 * - Pick range projection (lottery / mid-first / late-first based on team record)
 * - Target list per owned pick
 *
 * Reuses: calcOvr2K, calcPot2K from tradeValueEngine, team needs from salaryUtils
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { calcOvr2K, calcPot2K, type TeamMode } from '../../../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, topNAvgK2, resolveManualOutlook } from '../../../../../utils/salaryUtils';
import { cn } from '../../../../../lib/utils';
import { DraftScoutingModal } from '../../../../draft/DraftScoutingModal';
import { PlayerBioView } from '../../PlayerBioView';
import {
  getClassPercentiles,
  getClassAverages,
  type ClassPercentileMaps,
} from '../../../../../services/scoutingReport';
import {
  ensureDraftScouting,
  getCachedDraftScouting,
  matchProspectToGist,
  type GistProspect,
} from '../../../../../services/draftScoutingGist';
import type { NBAPlayer } from '../../../../../types';

interface DraftScoutingProps {
  teamId: number;
}

type PickProjection = 'lottery' | 'mid-first' | 'late-first' | 'second-round';

function projectPickRange(wins: number, losses: number, totalTeams: number): PickProjection {
  const gp = wins + losses;
  if (gp === 0) return 'mid-first';
  const winPct = wins / gp;
  if (winPct < 0.35) return 'lottery';
  if (winPct < 0.50) return 'mid-first';
  if (winPct < 0.65) return 'late-first';
  return 'late-first';
}

const PROJECTION_LABELS: Record<PickProjection, { label: string; color: string; range: string }> = {
  'lottery':      { label: 'Lottery',         color: 'text-amber-400',   range: '#1–14' },
  'mid-first':    { label: 'Mid First Round', color: 'text-sky-400',     range: '#15–22' },
  'late-first':   { label: 'Late First Round',color: 'text-slate-400',   range: '#23–30' },
  'second-round': { label: 'Second Round',    color: 'text-slate-500',   range: '#31–60' },
};

export function DraftScouting({ teamId }: DraftScoutingProps) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const currentYear = state.leagueStats?.year ?? 2026;
  const nextDraftYear = currentYear; // draft happens in the current leagueStats.year
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  // Modal + bio-view state
  const [scoutingPlayer, setScoutingPlayer] = useState<NBAPlayer | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [gistByYear, setGistByYear] = useState<GistProspect[] | null>(getCachedDraftScouting(nextDraftYear) ?? null);

  useEffect(() => {
    let cancelled = false;
    ensureDraftScouting(nextDraftYear).then(data => {
      if (!cancelled) setGistByYear(data);
    });
    return () => { cancelled = true; };
  }, [nextDraftYear]);

  // Team mode (contend vs rebuild) — determines how we weight OVR vs POT
  const teamMode: TeamMode = useMemo(() => {
    if (!team) return 'rebuild';
    const manual = resolveManualOutlook(team, state.gameMode, state.userTeamId);
    if (manual) {
      if (manual.role === 'heavy_buyer' || manual.role === 'buyer') return 'contend';
      if (manual.role === 'rebuilding') return 'presti';
      return 'rebuild';
    }
    const payroll = state.players.filter(p => p.tid === teamId).reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0);
    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams.filter(t => t.conference === team.conference)
      .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
      .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const idx = confTeams.findIndex(c => c.t.id === teamId);
    const confRank = idx >= 0 ? idx + 1 : 15;
    const leader = confTeams[0];
    const gb = Math.max(0, ((leader?.rec.wins ?? 0) - rec.wins + rec.losses - (leader?.rec.losses ?? 0)) / 2);
    const starAvg = topNAvgK2(state.players, teamId, 3);
    const outlook = getTradeOutlook(payroll, rec.wins, rec.losses,
      state.players.filter(p => p.tid === teamId && (p.contract?.exp ?? 0) <= currentYear).length,
      thresholds, confRank, gb, starAvg);
    if (outlook.role === 'heavy_buyer' || outlook.role === 'buyer') return 'contend';
    if (outlook.role === 'rebuilding') return 'presti';
    return 'rebuild';
  }, [team, state.players, state.teams, teamId, currentYear, thresholds, state.gameMode, state.userTeamId]);

  // Team needs — weakest positions
  const teamNeeds = useMemo(() => {
    const roster = state.players.filter(p => p.tid === teamId && p.status === 'Active');
    const posGroups: Record<string, number[]> = { G: [], F: [], C: [] };
    for (const p of roster) {
      const pos = p.pos ?? 'F';
      const k2 = calcOvr2K(p);
      if (pos.includes('G') || pos === 'PG' || pos === 'SG') posGroups.G.push(k2);
      else if (pos.includes('C') || pos === 'FC') posGroups.C.push(k2);
      else posGroups.F.push(k2);
    }
    return Object.entries(posGroups)
      .map(([pos, vals]) => ({ pos, avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, count: vals.length }))
      .sort((a, b) => a.avg - b.avg);
  }, [state.players, teamId]);

  const weakPositions = teamNeeds.filter(n => n.avg < 82 || n.count < 2).map(n =>
    n.pos === 'G' ? 'Guard' : n.pos === 'F' ? 'Forward' : 'Center'
  );

  // Owned picks for next draft
  const ownedPicks = useMemo(() => {
    return state.draftPicks
      .filter(pk => pk.tid === teamId && pk.season === nextDraftYear)
      .sort((a, b) => a.round - b.round);
  }, [state.draftPicks, teamId, nextDraftYear]);

  // All other teams' picks owned by someone else (to show who owns our pick if traded)
  const picksOwedByUs = useMemo(() => {
    return state.draftPicks
      .filter(pk => pk.originalTid === teamId && pk.tid !== teamId && pk.season === nextDraftYear);
  }, [state.draftPicks, teamId, nextDraftYear]);

  // Draft prospects (tid === -2)
  const prospects = useMemo(() => {
    return state.players
      .filter(p => p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect')
      .map(p => {
        const ovr = calcOvr2K(p);
        const pot = calcPot2K(p, currentYear);
        const pos = p.pos ?? 'F';
        const posGroup = pos.includes('G') || pos === 'PG' || pos === 'SG' ? 'Guard'
          : pos.includes('C') || pos === 'FC' ? 'Center' : 'Forward';

        // 70% player value + 30% team fit
        const valuePart = teamMode === 'contend'
          ? ovr * 1.4 + pot * 0.6
          : teamMode === 'presti'
          ? ovr * 0.5 + pot * 1.5
          : ovr * 0.6 + pot * 1.4;

        const fitBonus = weakPositions.includes(posGroup) ? 15 : 0;
        const score = valuePart * 0.7 + (valuePart * 0.3 + fitBonus);

        return { player: p, ovr, pot, score, posGroup, fitBonus: fitBonus > 0 };
      })
      .sort((a, b) => b.score - a.score);
  }, [state.players, currentYear, teamMode, weakPositions]);

  // Pick projection for the team
  const projection = team ? projectPickRange(team.wins, team.losses, state.teams.length) : 'mid-first';
  const projInfo = PROJECTION_LABELS[projection];

  // Modal data plumbing — same shape DraftScoutingView/DraftSimulatorView pass.
  const classProspects = useMemo(
    () => prospects.map(p => p.player) as NBAPlayer[],
    [prospects],
  );
  const activePlayers = useMemo(() =>
    state.players.filter(p =>
      p.tid >= 0 && p.tid < 100 &&
      p.status !== 'Draft Prospect' &&
      p.status !== 'Prospect' &&
      ((p as any).draft?.year ?? 0) < currentYear,
    ),
  [state.players, currentYear]);
  const classAverages = useMemo(() => getClassAverages(classProspects), [classProspects]);
  const percentilesByPos = useMemo(() => {
    const m = new Map<string, ClassPercentileMaps>();
    m.set('Guard', getClassPercentiles(classProspects, 'Guard'));
    m.set('Forward', getClassPercentiles(classProspects, 'Forward'));
    m.set('Center', getClassPercentiles(classProspects, 'Center'));
    m.set('Class', getClassPercentiles(classProspects, 'Class'));
    return m;
  }, [classProspects]);

  // Comp-card click navigates to player bio
  if (viewingBioPlayer) {
    return <PlayerBioView player={viewingBioPlayer} onBack={() => setViewingBioPlayer(null)} />;
  }

  if (!team) return <div className="text-red-400 font-bold">Team not found</div>;

  const draftComplete = !!(state as any).draftComplete;

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto p-1">

      {/* ── Pick Inventory ─────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs uppercase text-[#FDB927] tracking-[1.5px] font-bold border-b border-[#30363d] pb-3 mb-4">
          {nextDraftYear} Draft Capital
        </h3>

        {ownedPicks.length === 0 && picksOwedByUs.length === 0 ? (
          <p className="text-slate-500 text-sm">No picks owned for the {nextDraftYear} draft.</p>
        ) : (
          <div className="space-y-2">
            {ownedPicks.map(pk => {
              const orig = state.teams.find(t => t.id === pk.originalTid);
              const isOwn = pk.originalTid === teamId;
              const origTeam = orig ? orig : team;
              const origProjection = orig ? projectPickRange(orig.wins, orig.losses, state.teams.length) : projection;
              const origProjInfo = PROJECTION_LABELS[origProjection];
              return (
                <div key={pk.dpid} className="flex items-center justify-between p-3 bg-[#161b22]/60 border border-[#30363d] rounded">
                  <div className="flex items-center gap-3">
                    {orig?.logoUrl && <img src={orig.logoUrl} className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />}
                    <div>
                      <span className="text-sm font-bold text-white">
                        {pk.season} {pk.round === 1 ? '1st' : '2nd'} Round
                      </span>
                      {!isOwn && <span className="text-xs text-slate-500 ml-2">(via {origTeam?.abbrev})</span>}
                    </div>
                  </div>
                  <span className={cn('text-xs font-bold uppercase tracking-wider', origProjInfo.color)}>
                    {origProjInfo.label} {origProjInfo.range}
                  </span>
                </div>
              );
            })}
            {picksOwedByUs.map(pk => {
              const owner = state.teams.find(t => t.id === pk.tid);
              return (
                <div key={pk.dpid} className="flex items-center justify-between p-3 bg-red-950/20 border border-red-900/30 rounded opacity-60">
                  <div className="flex items-center gap-3">
                    {team.logoUrl && <img src={team.logoUrl} className="w-6 h-6 object-contain opacity-50" referrerPolicy="no-referrer" />}
                    <span className="text-sm text-red-400">
                      {pk.season} {pk.round === 1 ? '1st' : '2nd'} Round — owed to {owner?.abbrev ?? '???'}
                    </span>
                  </div>
                  <span className="text-xs text-red-500 font-bold">TRADED</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Team Advisor Board ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between border-b border-[#30363d] pb-3 mb-4">
          <h3 className="text-xs uppercase text-[#FDB927] tracking-[1.5px] font-bold">
            Advisor's Big Board
          </h3>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>Mode: <span className={teamMode === 'contend' ? 'text-emerald-400' : teamMode === 'presti' ? 'text-purple-400' : 'text-amber-400'}>
              {teamMode === 'contend' ? 'Win-Now (OVR)' : teamMode === 'presti' ? 'Future (POT)' : 'Balanced'}
            </span></span>
            {weakPositions.length > 0 && (
              <span>· Need: <span className="text-sky-400">{weakPositions.join(', ')}</span></span>
            )}
          </div>
        </div>

        {draftComplete ? (
          <p className="text-slate-500 text-sm text-center py-8">Draft completed — scouting resets next season.</p>
        ) : prospects.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No draft prospects available.</p>
        ) : (
          <div className="space-y-1.5">
            {prospects.slice(0, 15).map((p, i) => (
              <button
                key={p.player.internalId}
                type="button"
                onClick={() => setScoutingPlayer(p.player as NBAPlayer)}
                className={cn(
                  'w-full text-left flex items-center gap-3 p-2.5 rounded border transition-colors cursor-pointer',
                  i < 5 ? 'bg-[#161b22]/80 border-[#30363d] hover:border-[#FDB927]' : 'bg-[#161b22]/40 border-transparent hover:border-[#30363d]'
                )}>
                <span className={cn(
                  'w-7 text-center text-sm font-black tabular-nums',
                  i < 5 ? 'text-[#FDB927]' : i < 10 ? 'text-slate-400' : 'text-slate-600'
                )}>
                  {i + 1}
                </span>
                <PlayerPortrait imgUrl={p.player.imgURL} face={(p.player as any).face} playerName={p.player.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate">{p.player.name}</span>
                    {p.fitBonus && <span className="text-[9px] font-bold text-sky-400 bg-sky-400/10 rounded px-1">FIT</span>}
                  </div>
                  <span className="text-[10px] text-slate-500">{p.player.pos}{p.player.born?.year ? ` | ${currentYear - p.player.born.year}y` : ''}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-600 uppercase">OVR</div>
                    <div className={cn('text-sm font-black tabular-nums',
                      p.ovr >= 90 ? 'text-violet-300' : p.ovr >= 85 ? 'text-emerald-300' : p.ovr >= 78 ? 'text-amber-300' : 'text-slate-400'
                    )}>{p.ovr}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-600 uppercase">POT</div>
                    <div className={cn('text-sm font-black tabular-nums',
                      p.pot >= 90 ? 'text-violet-300' : p.pot >= 85 ? 'text-emerald-300' : p.pot >= 78 ? 'text-amber-300' : 'text-slate-400'
                    )}>{p.pot}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Shared scouting modal */}
      <DraftScoutingModal
        player={scoutingPlayer}
        onClose={() => setScoutingPlayer(null)}
        classProspects={classProspects}
        activePlayers={activePlayers}
        percentilesByPos={percentilesByPos}
        classAverages={classAverages}
        draftYear={nextDraftYear}
        gistData={scoutingPlayer && gistByYear ? matchProspectToGist(scoutingPlayer, gistByYear) : null}
        onViewPlayerBio={(p) => setViewingBioPlayer(p)}
      />
    </div>
  );
}
