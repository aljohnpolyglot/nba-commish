// Spiegelt das Scoring von TeamOffice/pages/DraftScouting.tsx (70% Value + 30%
// Fit, mode-gewichtet contend/rebuild/presti) als enge Sidebar-Liste. Gedraftete
// Prospects bleiben mit Strikethrough sichtbar — der User sieht Realtime, was
// vom Board verschwindet.

import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { calcOvr2K, calcPot2K, type TeamMode } from '../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, topNAvgK2, resolveManualOutlook } from '../../../utils/salaryUtils';
import { getLsYear } from '../../../utils/leagueYear';
import { fuzzRatingValue } from '../../../utils/scoutingFuzz';
import { isOnRoster } from '../../../utils/teamLookup';

interface CompactAdvisorBoardProps {
  teamId: number;
  draftedIds: Set<any>;
}

export const CompactAdvisorBoardPanel: React.FC<CompactAdvisorBoardProps> = ({ teamId, draftedIds }) => {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const currentYear = getLsYear(state);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  const teamMode: TeamMode = useMemo(() => {
    if (!team) return 'rebuild';
    const manual = resolveManualOutlook(team, state.gameMode, state.userTeamId);
    if (manual) {
      if (manual.role === 'heavy_buyer' || manual.role === 'buyer') return 'contend';
      if (manual.role === 'rebuilding') return 'presti';
      return 'rebuild';
    }
    const payroll = state.players.filter(p => p.tid === teamId)
      .reduce((s, p) => s + ((p.contract?.amount ?? 0) * 1_000), 0);
    const rec = effectiveRecord(team, currentYear);
    const confTeams = state.teams.filter(t => t.conference === team.conference)
      .map(t => ({ t, rec: effectiveRecord(t, currentYear) }))
      .sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
    const idx = confTeams.findIndex(c => c.t.id === teamId);
    const confRank = idx >= 0 ? idx + 1 : 15;
    const leader = confTeams[0];
    const gb = Math.max(0, ((leader?.rec.wins ?? 0) - rec.wins + rec.losses - (leader?.rec.losses ?? 0)) / 2);
    const starAvg = topNAvgK2(state.players, teamId, 3);
    const expiringCount = state.players.filter(p =>
      p.tid === teamId && (p.contract?.exp ?? 0) <= currentYear).length;
    const outlook = getTradeOutlook(payroll, rec.wins, rec.losses, expiringCount,
      thresholds, confRank, gb, starAvg);
    if (outlook.role === 'heavy_buyer' || outlook.role === 'buyer') return 'contend';
    if (outlook.role === 'rebuilding') return 'presti';
    return 'rebuild';
  }, [team, state.players, state.teams, teamId, currentYear, thresholds, state.gameMode, state.userTeamId]);

  const weakPositions = useMemo(() => {
    const roster = state.players.filter(p => p.tid === teamId && isOnRoster(p));
    const posGroups: Record<string, number[]> = { G: [], F: [], C: [] };
    for (const p of roster) {
      const pos = p.pos ?? 'F';
      const k2 = calcOvr2K(p);
      if (pos.includes('G') || pos === 'PG' || pos === 'SG') posGroups.G.push(k2);
      else if (pos.includes('C') || pos === 'FC') posGroups.C.push(k2);
      else posGroups.F.push(k2);
    }
    return Object.entries(posGroups)
      .map(([pos, vals]) => ({
        pos,
        avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        count: vals.length,
      }))
      .filter(n => n.avg < 82 || n.count < 2)
      .map(n => (n.pos === 'G' ? 'Guard' : n.pos === 'F' ? 'Forward' : 'Center'));
  }, [state.players, teamId]);

  const prospects = useMemo(() => {
    return state.players
      .filter(p => p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect')
      .filter(p => {
        const draftYear = (p as any).draft?.year;
        return draftYear == null || Number(draftYear) === currentYear;
      })
      .map(p => {
        const baseOvr = calcOvr2K(p);
        const basePot = calcPot2K(p, currentYear);
        const ovr = fuzzRatingValue(baseOvr, state, p, 'compact-board-ovr');
        const pot = fuzzRatingValue(basePot, state, p, 'compact-board-pot');
        const pos = p.pos ?? 'F';
        const posGroup = pos.includes('G') || pos === 'PG' || pos === 'SG' ? 'Guard'
          : pos.includes('C') || pos === 'FC' ? 'Center' : 'Forward';
        const valuePart = teamMode === 'contend'
          ? ovr * 1.4 + pot * 0.6
          : teamMode === 'presti'
          ? ovr * 0.5 + pot * 1.5
          : ovr * 0.6 + pot * 1.4;
        const fitBonus = weakPositions.includes(posGroup) ? 15 : 0;
        const score = valuePart * 0.7 + (valuePart * 0.3 + fitBonus);
        return { player: p, ovr, pot, score, fitBonus: fitBonus > 0 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [state.players, currentYear, teamMode, weakPositions]);

  const modeLabel = teamMode === 'contend' ? 'Win-Now' : teamMode === 'presti' ? 'Future' : 'Balanced';
  const modeColor = teamMode === 'contend' ? 'text-emerald-400' : teamMode === 'presti' ? 'text-purple-400' : 'text-amber-400';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[9px] pb-2 border-b border-[#333]">
        <span className="text-white/40 font-black uppercase tracking-widest">Mode</span>
        <span className={`font-black uppercase ${modeColor}`}>{modeLabel}</span>
      </div>
      {weakPositions.length > 0 && (
        <div className="flex items-center justify-between text-[9px] pb-2 border-b border-[#333]">
          <span className="text-white/40 font-black uppercase tracking-widest">Need</span>
          <span className="text-sky-400 font-black uppercase">{weakPositions.join(', ')}</span>
        </div>
      )}
      <div className="space-y-1">
        {prospects.map((p, i) => {
          const isDrafted = draftedIds.has(p.player.internalId);
          return (
            <div
              key={p.player.internalId}
              className={`flex items-center gap-2 text-[10px] ${isDrafted ? 'opacity-30 line-through' : ''}`}
            >
              <span className={`w-4 font-black tabular-nums ${i < 5 && !isDrafted ? 'text-amber-300' : 'text-white/30'}`}>
                {i + 1}
              </span>
              <span className="flex-1 truncate font-bold text-white">{p.player.name}</span>
              {p.fitBonus && !isDrafted && (
                <span className="text-[8px] font-black text-sky-400 bg-sky-400/10 rounded px-1">FIT</span>
              )}
              <span className="text-indigo-300 font-black w-6 text-right">{p.ovr}</span>
              <span className="text-emerald-400/80 font-black w-6 text-right">{p.pot}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
