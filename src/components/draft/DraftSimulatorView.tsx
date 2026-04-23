/**
 * DraftSimulatorView.tsx
 * Mock draft simulator connected to game state.
 * Uses real game prospects + real team draft order (worst record → #1 pick).
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Play, Pause, CheckCircle, ChevronLeft, ChevronRight, Calendar, FastForward } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { convertTo2KRating, normalizeDate } from '../../utils/helpers';
import { estimatePotentialBbgm } from '../../utils/playerRatings';
import { getPlayerImage } from '../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import { ensureNonNBAFetched, getNonNBAGistData } from '../central/view/nonNBACache';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { calcOvr2K, calcPot2K, type TeamMode } from '../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, topNAvgK2, resolveManualOutlook } from '../../utils/salaryUtils';
import type { NBAPlayer } from '../../types';

// Parse "2015 Round 2, Pick 5, Philadelphia Sixers" → { year, round, pick, team }
function parseBioDraftStr(s: string | undefined): { year: number; round: number; pick: number; team: string } | null {
  if (!s || s === 'Undrafted' || s === 'N/A' || s === '-') return null;
  const m = s.match(/(\d{4})\s+Round\s+(\d+)[,\s]+Pick\s+(\d+)[,\s]+(.+)/i);
  if (!m) return null;
  return { year: parseInt(m[1]), round: parseInt(m[2]), pick: parseInt(m[3]), team: m[4].trim() };
}

const BIO_LEAGUE_MAP: Record<string, string> = {
  Euroleague: 'Euroleague',
  'B-League': 'B-League',
  'G-League': 'G-League',
  Endesa: 'Endesa',
  'China CBA': 'China CBA',
  'NBL Australia': 'NBL Australia',
};

// Shape ratios for the 30-pick rookie scale (pick 1 = 1.0, pick 30 ≈ 0.238).
// Multiplicative 5.42% step-down per slot, as described in EconomyRookieContractsSection.
const R1_SHAPE: number[] = Array.from({ length: 30 }, (_, i) => Math.pow(1 - 0.0542, i));

/**
 * Compute rookie contract salary in USD for a given pick slot.
 * @param pickSlot   1-60
 * @param capM       Current salary cap in millions (e.g. 154.6)
 * @param maxPct     Commissioner's rookieMaxContractPercentage (e.g. 9 = 9% of cap)
 * @param minSalary  Minimum salary in USD (floor for all picks)
 */
const getRookieContractAmount = (
  pickSlot: number,
  capM: number,
  maxPct: number,
  minSalary: number,
): number => {
  const pick1USD = (capM * maxPct / 100) * 1_000_000;
  if (pickSlot <= 30) {
    const ratio = R1_SHAPE[pickSlot - 1] ?? R1_SHAPE[29];
    return Math.max(minSalary, Math.round(pick1USD * ratio));
  }
  // Round 2 (continues the same shape from slot 31 onward)
  const ratio = R1_SHAPE[29] * Math.pow(1 - 0.0542, pickSlot - 30);
  return Math.max(minSalary, Math.round(pick1USD * ratio));
};

// Pure function: build tid/status/draft/contract fields for one drafted player.
// Used by both immediate per-pick commits and finalizeDraft.
function computeDraftPickFields(pickSlot: number, team: any, ls: any) {
  if (!team) return null;
  const season: number = (ls as any).year ?? 2026;
  const round = pickSlot <= 30 ? 1 : 2;
  const pickInRound = pickSlot <= 30 ? pickSlot : pickSlot - 30;
  const rookieScaleType = (ls as any).rookieScaleType ?? 'dynamic';
  const capM: number = (ls as any).salaryCap ?? 154.6;
  const maxPct: number = (ls as any).rookieMaxContractPercentage ?? 9;
  const staticAmtUSD = ((ls as any).rookieStaticAmount ?? 3) * 1_000_000;
  const scaleAppliesTo = (ls as any).rookieScaleAppliesTo ?? 'first_round';
  const guaranteedYrs: number = (ls as any).rookieContractLength ?? 2;
  const teamOptEnabled: boolean = (ls as any).rookieTeamOptionsEnabled ?? true;
  const teamOptYears: number = (ls as any).rookieTeamOptionYears ?? 2;
  const restrictedFA: boolean = (ls as any).rookieRestrictedFreeAgentEligibility ?? true;
  const minSalaryUSD = ((ls as any).minContract ?? 1.273) * 1_000_000;

  let salaryAmtUSD: number;
  if (rookieScaleType === 'none') salaryAmtUSD = minSalaryUSD;
  else if (rookieScaleType === 'static') salaryAmtUSD = staticAmtUSD;
  else {
    const useScale = round === 1 || scaleAppliesTo === 'both_rounds';
    salaryAmtUSD = useScale ? getRookieContractAmount(pickSlot, capM, maxPct, minSalaryUSD) : minSalaryUSD;
  }

  const baseYrs = round === 1 ? guaranteedYrs : 2;
  const optionYrs = (round === 1 && teamOptEnabled) ? teamOptYears : 0;

  const r2NonGuaranteed = round === 2 && ((ls as any)?.r2ContractsNonGuaranteed ?? true);

  return {
    tid: team.id as number,
    status: 'Active' as const,
    ...(r2NonGuaranteed && { nonGuaranteed: true }),
    draft: { round, pick: pickInRound, year: season, tid: team.id, originalTid: (team as any)._originalTid ?? team.id },
    contract: {
      amount: Math.round(salaryAmtUSD / 1_000),
      exp: season + baseYrs + optionYrs,
      ...(optionYrs > 0 && { hasTeamOption: true, teamOptionExp: season + baseYrs + 1 }),
      ...(round === 1 && restrictedFA && { restrictedFA: true }),
      rookie: true,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrdinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

const POSITIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

// ─── Full Draft Table ─────────────────────────────────────────────────────────

interface FullDraftTableProps {
  drafted: Record<number, any>;
  draftOrder: any[];
  onReview: (player: any, pick: number) => void;
  currentPick: number;
  userTeamId: number | null;
  isGM: boolean;
}

const FullDraftTable: React.FC<FullDraftTableProps> = ({ drafted, draftOrder, onReview, currentPick, userTeamId, isGM }) => {
  const { state: _ftState } = useGame();
  const leagueYear = _ftState.leagueStats?.year ?? 2026;
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  // Build sorted alphabetical team list from draft order (deduplicated)
  const teamOptions = useMemo(() => {
    const seen = new Map<string, any>();
    draftOrder.forEach(t => {
      if (t && t.name && !seen.has(t.name)) seen.set(t.name, t);
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [draftOrder]);

  // Build every slot (1..draftOrder.length) so empty boxes pre-render like a real draft board.
  const allSlots = useMemo(() => {
    return draftOrder.map((team, i) => ({
      pick: i + 1,
      team,
      player: drafted[i + 1] ?? null,
    }));
  }, [draftOrder, drafted]);

  const filteredSlots = useMemo(() => {
    if (teamFilter === 'ALL') return allSlots;
    return allSlots.filter(s => s.team?.name === teamFilter);
  }, [allSlots, teamFilter]);

  return (
    <div className="mt-10 space-y-5">
      <div className="border-b border-[#333] pb-3 flex items-center justify-between gap-4">
        <h4 className="text-xl font-black text-white uppercase tracking-tight">Full Draft</h4>
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="bg-[#1A1A1A] border border-[#444] text-white text-[11px] font-black uppercase tracking-widest rounded-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="ALL">All Teams</option>
          {teamOptions.map(t => (
            <option key={t.id ?? t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {filteredSlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-white/20 font-black text-sm uppercase tracking-widest">No picks for this team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSlots.map(({ pick, team, player }) => {
            const isUserTeam = isGM && userTeamId != null && team?.id === userTeamId;
            const isCurrent = pick === currentPick && !player;
            const isEmpty = !player;

            return (
              <div
                key={pick}
                onClick={() => player && onReview(player, pick)}
                className={`bg-[#1A1A1A] border rounded-sm flex h-20 overflow-hidden transition-all group ${
                  player ? 'cursor-pointer hover:border-indigo-600' : 'cursor-default'
                } ${
                  isUserTeam
                    ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                    : isCurrent
                    ? 'border-indigo-500/80 shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                    : 'border-[#333]'
                } ${isEmpty && !isCurrent && !isUserTeam ? 'opacity-70' : ''}`}
              >
                {/* Pick # */}
                <div className={`w-11 flex items-center justify-center shrink-0 ${
                  isUserTeam ? 'bg-amber-700/60' : isCurrent ? 'bg-indigo-700/80' : 'bg-indigo-900/60'
                }`}>
                  <span className="text-xl font-black text-white">{String(pick).padStart(2, '0')}</span>
                </div>

                {/* Player photo or placeholder */}
                <div className="w-20 bg-[#111] relative shrink-0 overflow-hidden">
                  {player ? (
                    (() => {
                      const img = getPlayerImage(player as any);
                      const face = (player as any).face;
                      if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />;
                      if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                      return <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-900">{player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                    })()
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isCurrent ? (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      ) : (
                        <span className="text-white/10 text-2xl font-black">—</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Player info or team-awaiting placeholder */}
                <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                  {player ? (
                    <>
                      <p className="font-black text-white text-base truncate uppercase tracking-tight">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        {player.pos} · {player.born?.year ? leagueYear - player.born.year : (player.age ?? '?')}y · {player.displayOvr} · {player.displayPot} POT
                        {player.college && ` · ${player.college}`}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={`font-black text-base truncate uppercase tracking-tight ${
                        isUserTeam ? 'text-amber-200' : isCurrent ? 'text-white' : 'text-white/50'
                      }`}>
                        {team?.name ?? '—'}
                      </p>
                      <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 flex-wrap">
                        {isCurrent ? (
                          <span className="text-indigo-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                            On the Clock
                          </span>
                        ) : isUserTeam ? (
                          <span className="text-amber-300/90">Your Pick</span>
                        ) : (
                          <span className="text-white/25">Awaiting Pick</span>
                        )}
                        {(team as any)?._traded && (
                          <span className="text-white/35 normal-case">
                            via {(team as any)._originalAbbrev ?? (team as any)._originalName ?? '???'}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Team logo */}
                <div className="w-14 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors">
                  {team?.logoUrl ? (
                    <img src={team.logoUrl} alt="" className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-[10px] font-black text-white/30">{team?.abbrev}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Compact Sidebar Team Needs ───────────────────────────────────────────────
// The full-page TeamNeeds component uses a two-column grid designed for the TeamOffice;
// stuffed into a 320px draft aside it wraps horribly. This sidebar version keeps the same
// scoring math but renders a single-column readout: positional rows + top 3 category gaps.

const getCategoryScores = (p: any) => {
  const r = p.ratings?.[p.ratings.length - 1];
  if (!r) return null;
  return {
    shooting3pt:   (r.tp || 50) * 1 + (r.oiq || 50) * 0.3,
    intDefense:    (r.hgt || 50) * 2 + (r.stre || 50) * 1.5 + (r.diq || 50) * 1 + (r.jmp || 50) * 1,
    perDefense:    (r.diq || 50) * 1.5 + (r.spd || 50) * 1,
    rebound:       (r.hgt || 50) * 2 + (r.reb || 50) * 1 + (r.jmp || 50) * 0.5,
    playmaking:    (r.pss || 50) * 3 + (r.oiq || 50) * 1 + (r.drb || 50) * 0.5,
    insideScoring: (r.ins || 50) * 1 + (r.dnk || 50) * 0.5 + (r.oiq || 50) * 1,
    shotCreation:  (r.spd || 50) * 0.5 + (r.drb || 50) * 1 + (r.oiq || 50) * 0.5 + (r.tp || 50) * 0.3 + (r.fg || 50) * 0.5 + (r.dnk || 50) * 0.5 + (r.ins || 50) * 0.3,
    basketballIq:  (r.oiq || 50) * 1.5 + (r.diq || 50) * 1.5,
  };
};

const CAT_LABELS: Record<string, string> = {
  shooting3pt: '3PT Shooting',
  intDefense: 'Interior Def',
  perDefense: 'Perimeter Def',
  rebound: 'Rebounding',
  playmaking: 'Playmaking',
  insideScoring: 'Inside Scoring',
  shotCreation: 'Shot Creation',
  basketballIq: 'Basketball IQ',
};

interface CompactNeedsProps { teamId: number; players: any[]; }

const CompactTeamNeedsPanel: React.FC<CompactNeedsProps> = ({ teamId, players }) => {
  const { posNeeds, topGaps } = useMemo(() => {
    const allActive = players.filter(p => p.tid >= 0 && p.status === 'Active');
    const teamPlayers = allActive.filter(p => p.tid === teamId);
    if (teamPlayers.length === 0) return { posNeeds: [], topGaps: [] };

    const topTwoAvg = (roster: any[], pos: string) => {
      const ps = roster.filter(p => p.pos === pos)
        .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
        .slice(0, 2);
      if (ps.length === 0) return 40;
      if (ps.length === 1) return ps[0].overallRating ?? 40;
      return ((ps[0].overallRating ?? 40) + (ps[1].overallRating ?? 40)) / 2;
    };

    const tids = [...new Set(allActive.map(p => p.tid))];
    const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
    const leaguePos: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    tids.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      POS.forEach(pos => { leaguePos[pos] += topTwoAvg(roster, pos); });
    });
    POS.forEach(pos => { leaguePos[pos] /= Math.max(1, tids.length); });

    const posNeeds = POS.map(pos => {
      const val = topTwoAvg(teamPlayers, pos);
      const diff = val - leaguePos[pos];
      let status: string, color: string;
      if (diff >= 8)       { status = 'Elite';       color = 'text-emerald-400'; }
      else if (diff >= 3)  { status = 'Strong';      color = 'text-emerald-300'; }
      else if (diff >= -2) { status = 'Stable';      color = 'text-amber-300';   }
      else if (diff >= -7) { status = 'Needs Depth'; color = 'text-red-400';     }
      else                 { status = 'Urgent Need'; color = 'text-red-500';     }
      return { pos, status, color };
    });

    // League + team category averages → biggest gaps (team below league)
    const catKeys = Object.keys(CAT_LABELS);
    const teamCat: Record<string, number> = {};
    catKeys.forEach(k => { teamCat[k] = 0; });
    teamPlayers.forEach(p => {
      const sc = getCategoryScores(p);
      if (sc) catKeys.forEach(k => { teamCat[k] += (sc as any)[k]; });
    });
    catKeys.forEach(k => { teamCat[k] /= Math.max(1, teamPlayers.length); });

    const leagueCat: Record<string, number> = {};
    catKeys.forEach(k => { leagueCat[k] = 0; });
    tids.forEach(tid => {
      const roster = allActive.filter(p => p.tid === tid);
      const sums: Record<string, number> = {};
      catKeys.forEach(k => { sums[k] = 0; });
      roster.forEach(p => {
        const sc = getCategoryScores(p);
        if (sc) catKeys.forEach(k => { sums[k] += (sc as any)[k]; });
      });
      catKeys.forEach(k => { leagueCat[k] += sums[k] / Math.max(1, roster.length); });
    });
    catKeys.forEach(k => { leagueCat[k] /= Math.max(1, tids.length); });

    const topGaps = catKeys
      .map(k => ({ key: k, label: CAT_LABELS[k], gap: leagueCat[k] - teamCat[k] }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);

    return { posNeeds, topGaps };
  }, [players, teamId]);

  if (posNeeds.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {posNeeds.map(p => (
          <div key={p.pos} className="flex items-center justify-between text-[10px]">
            <span className="font-black text-white/80 w-6">{p.pos}</span>
            <span className={`font-black uppercase tracking-widest ${p.color}`}>{p.status}</span>
          </div>
        ))}
      </div>
      {topGaps.length > 0 && (
        <div className="pt-2 border-t border-[#333] space-y-1">
          <div className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Biggest Gaps</div>
          {topGaps.map(g => (
            <div key={g.key} className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-white/70">{g.label}</span>
              <span className={`font-black ${g.gap > 2 ? 'text-red-400' : 'text-amber-300'}`}>
                {g.gap > 0 ? '−' : '+'}{Math.abs(g.gap).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Compact Advisor Big Board ────────────────────────────────────────────────
// Mirrors the scoring in TeamOffice/pages/DraftScouting.tsx (70% value + 30% fit,
// mode-weighted by contend/rebuild/presti) but renders as a tight sidebar list.
// Drafted prospects stay in the list with a strikethrough so the user can track
// what's gone from the board in real time.

interface CompactAdvisorBoardProps {
  teamId: number;
  draftedIds: Set<any>;
}

const CompactAdvisorBoardPanel: React.FC<CompactAdvisorBoardProps> = ({ teamId, draftedIds }) => {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const currentYear = state.leagueStats?.year ?? 2026;
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
        return !draftYear || Number(draftYear) === currentYear;
      })
      .map(p => {
        const ovr = calcOvr2K(p);
        const pot = calcPot2K(p, currentYear);
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

// ─── Component ────────────────────────────────────────────────────────────────

interface DraftSimulatorViewProps {
  onViewChange?: (view: string) => void;
}

export const DraftSimulatorView: React.FC<DraftSimulatorViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction: dispatch } = useGame();

  // Trigger re-render once external bio gist caches are loaded (they hold NBA draft strings)
  const [nonNBACacheVer, setNonNBACacheVer] = useState(0);
  useEffect(() => {
    Promise.all(Object.values(BIO_LEAGUE_MAP).map(ensureNonNBAFetched))
      .then(() => setNonNBACacheVer(v => v + 1));
  }, []);

  // Build 60-pick draft order:
  // R1: picks 1-14 from lottery results (if available), picks 15-30 from playoff teams worst→best.
  // R2: same team order as R1.
  // After determining the SOURCE order (who EARNED each slot via record/lottery),
  // each slot is re-mapped to its CURRENT owner via state.draftPicks so traded
  // picks display + assign to the team that actually holds them.
  const draftOrder = useMemo(() => {
    const lotteryResults: any[] = state.draftLotteryResult ?? [];
    const lotteryTids = new Set(lotteryResults.map((r: any) => r.team?.tid ?? r.tid));
    const draftSeason: number = state.leagueStats?.year ?? 2026;
    const draftPicks: any[] = (state as any).draftPicks ?? [];

    // Sort all 30 teams by win pct
    const allSorted = [...state.teams]
      .filter(t => t.id > 0)
      .sort((a, b) => {
        const wa = a.wins / Math.max(1, a.wins + a.losses);
        const wb = b.wins / Math.max(1, b.wins + b.losses);
        return wa - wb;
      });

    let r1SourceOrder: any[];
    if (lotteryResults.length >= 14) {
      // Picks 1-14: use lottery result order
      const lotteryPicks = [...lotteryResults]
        .sort((a: any, b: any) => a.pickNumber - b.pickNumber)
        .map((r: any) => state.teams.find(t => t.id === (r.team?.tid ?? r.tid)))
        .filter(Boolean);

      // Picks 15-30: playoff teams (not in lottery) sorted best record → worst
      const playoffTeams = allSorted
        .filter(t => !lotteryTids.has(t.id))
        .reverse(); // best record gets last pick (#30)

      r1SourceOrder = [...lotteryPicks, ...playoffTeams];
    } else {
      // No lottery result yet — fall back to standings order
      r1SourceOrder = allSorted;
    }

    // Resolve current owner for each slot. _originalTid/_originalAbbrev/_originalName
    // stay attached so player assignment can persist origin in draft metadata
    // and the slot card can render a "via X" sub-label without an extra lookup.
    const resolveOwner = (round: number, originalTeam: any) => {
      const pick = draftPicks.find(p => p.season === draftSeason && p.round === round && p.originalTid === originalTeam.id);
      const baseMeta = {
        _originalTid: originalTeam.id,
        _originalAbbrev: originalTeam.abbrev,
        _originalName: originalTeam.name,
      };
      if (!pick || pick.tid === originalTeam.id) {
        return { ...originalTeam, ...baseMeta, _traded: false };
      }
      const newOwner = state.teams.find(t => t.id === pick.tid);
      if (!newOwner) return { ...originalTeam, ...baseMeta, _traded: false };
      return { ...newOwner, ...baseMeta, _traded: true };
    };

    const r1Order = r1SourceOrder.map(t => resolveOwner(1, t));
    const r2Order = r1SourceOrder.map(t => ({ ...resolveOwner(2, t), _r2: true }));

    return [...r1Order, ...r2Order] as any[];
  }, [state.teams, state.draftLotteryResult, (state as any).draftPicks, state.leagueStats?.year]);

  const EXTERNAL_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);

  // POT estimator — delegates to the canonical BBGM potEstimator so draft view,
  // player views, and modals all produce the same POT for the same inputs.
  const estimatePot = (rawOvr: number, hgt: number, tp: number | undefined, age: number): number =>
    convertTo2KRating(estimatePotentialBbgm(rawOvr, age), hgt, tp);

  // All available draft years — NBA roster players (primary) + bio-gist data for external leagues
  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);
  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of state.players) {
      if (p.status === 'WNBA' || p.status === 'PBA') continue;
      const d = (p as any).draft;
      if (d?.year && d?.round && d?.pick) { years.add(Number(d.year)); continue; }
      // External player: check bio gist for draft year
      const league = BIO_LEAGUE_MAP[p.status ?? ''];
      if (league) {
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) years.add(parsed.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [state.players, nbaTids, nonNBACacheVer]);

  const defaultViewYear = availableDraftYears[0] ?? (state.leagueStats?.year ?? 2026) - 1;
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);

  // Sync viewDraftYear when availableDraftYears changes (new save loaded)
  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear)) {
      setViewDraftYear(availableDraftYears[0]);
    }
  }, [availableDraftYears]);

  const latestDraftClass = useMemo(() => {
    // Collect candidates, attaching resolved _draftRound/_draftPick for slot mapping
    const candidates: any[] = [];

    for (const p of state.players) {
      // Skip WNBA and PBA entirely
      if (p.status === 'WNBA' || p.status === 'PBA') continue;

      const d = (p as any).draft;
      let dYear  = d?.year  ? Number(d.year)  : null;
      let dRound = d?.round ? Number(d.round) : null;
      let dPick  = d?.pick  ? Number(d.pick)  : null;

      // For external league players missing draft info in player object,
      // fall back to the bio gist (RealGM/NBA context — e.g. Willy Hernangomez "2015 R2 P5")
      let bioDraftTeamName: string | undefined;
      if ((!dRound || !dPick) && BIO_LEAGUE_MAP[p.status ?? '']) {
        const league = BIO_LEAGUE_MAP[p.status ?? ''];
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) {
          dYear = parsed.year; dRound = parsed.round; dPick = parsed.pick;
          bioDraftTeamName = parsed.team; // e.g. "Minnesota Timberwolves"
        }
      }

      if (!dYear || dYear !== viewDraftYear) continue;
      if (!dRound || !dPick) continue;

      // NBA roster players always included; external-league players included if they have a pick
      const isOnNBATeam = nbaTids.has(p.tid);
      const isExternalDrafted = !!BIO_LEAGUE_MAP[p.status ?? ''] && !!dRound && !!dPick;
      if (!isOnNBATeam && !isExternalDrafted) continue;

      candidates.push({ ...p, _draftRound: dRound, _draftPick: dPick, _bioDraftTeamName: bioDraftTeamName });
    }

    // Deduplicate by pick slot (keep highest OVR if collision)
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const slot = (p._draftRound === 1 ? 0 : 30) + p._draftPick;
      const existing = bySlot.get(slot);
      if (!existing || (p.overallRating ?? 0) > (existing.overallRating ?? 0)) {
        bySlot.set(slot, p);
      }
    }

    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = lastRatings.ovr ?? p.overallRating ?? 0;
        const age = p.age ?? 26;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const displayPot = estimatePot(rawOvr, hgt, tp, age); // current age POT
        return {
          ...p,
          _slot: slot,
          displayOvr,
          displayPot,
        };
      });
  }, [state.players, viewDraftYear, nbaTids, state.leagueStats?.year, nonNBACacheVer]);

  const mostRecentDraftYear = viewDraftYear;

  // ─── Date gating ──────────────────────────────────────────────────────────
  const leagueYear = state.leagueStats?.year ?? 2026;
  const draftDate = `${leagueYear}-06-25`;
  const today = normalizeDate(state.date);
  const isDraftTime = today >= draftDate;
  // draftComplete is stored as a top-level state field via UPDATE_STATE dispatch
  const isDraftDone = !!(state as any).draftComplete;

  // Draft board: undrafted prospects for the CURRENT season's draft class only
  // (BBGM data includes future classes 2027/2028 — filter to leagueYear only)
  const allProspects = useMemo(() => {
    return state.players
      .filter(p => {
        const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
        if (!isProspect) return false;
        if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
        // Only current year's draft class (or prospects without a year set)
        const draftYear = (p as any).draft?.year;
        if (draftYear && Number(draftYear) !== leagueYear) return false;
        return true;
      })
      .map(p => {
        const lastRatings = p.ratings?.[p.ratings.length - 1] ?? {};
        const hgt = lastRatings.hgt ?? 50;
        const tp = lastRatings.tp;
        const rawOvr = p.overallRating || lastRatings.ovr || 0;
        const age = p.age ?? 20;
        const displayOvr = convertTo2KRating(rawOvr, hgt, tp);
        const displayPot = estimatePot(rawOvr, hgt, tp, age);
        const gp = (p.stats ?? []).reduce((s: number, r: any) => s + (r.gp ?? 0), 0);
        const pts = (p.stats ?? []).reduce((s: number, r: any) => s + (r.pts ?? 0), 0);
        const trb = (p.stats ?? []).reduce((s: number, r: any) => s + (r.trb ?? (r.orb ?? 0) + (r.drb ?? 0)), 0);
        const ast = (p.stats ?? []).reduce((s: number, r: any) => s + (r.ast ?? 0), 0);
        return {
          ...p,
          displayOvr,
          displayPot,
          ppg: gp > 0 ? (pts / gp).toFixed(1) : '—',
          rpg: gp > 0 ? (trb / gp).toFixed(1) : '—',
          apg: gp > 0 ? (ast / gp).toFixed(1) : '—',
          pos: p.pos ?? lastRatings.pos ?? 'F',
        };
      })
      .sort((a, b) => b.displayOvr - a.displayOvr);
  }, [state.players, state.leagueStats?.year]);

  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);

  // Restore in-progress draft from game state so switching views doesn't lose picks
  const savedDraftPicks: Record<number, any> = (state as any).activeDraftPicks ?? {};
  const savedPickCount = Object.keys(savedDraftPicks).length;
  const [currentPick, setCurrentPick] = useState<number>(() =>
    savedPickCount > 0 ? Math.max(...Object.keys(savedDraftPicks).map(Number)) + 1 : 1
  );
  const [drafted, setDrafted] = useState<Record<number, any>>(() => savedDraftPicks);
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'ovr' | 'pot'>('ovr');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState('normal');
  const [hasStarted, setHasStarted] = useState<boolean>(() => savedPickCount > 0);
  const [modalPlayer, setModalPlayer] = useState<any>(null);
  const [modalMode, setModalMode] = useState<'draft' | 'scouting' | 'review'>('draft');
  const [reviewPick, setReviewPick] = useState<number | null>(null);

  // Persist each pick to game state immediately so view switches never lose progress
  useEffect(() => {
    if (!hasStarted || Object.keys(drafted).length === 0) return;
    dispatch({ type: 'UPDATE_STATE', payload: { activeDraftPicks: drafted } } as any);
  }, [drafted, hasStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftedSet = useMemo(() => new Set(Object.values(drafted).map((p: any) => p.internalId)), [drafted]);

  // Undrafted pool sorted by the active criterion. Rank is derived from THIS pool
  // (before position filtering) so a top-5 OVR PG still shows as #5 when the PG
  // filter is active, not #1.
  const sortedPool = useMemo(() => {
    const pool = allProspects.filter(p => !draftedSet.has(p.internalId));
    if (sortBy === 'pot') {
      return [...pool].sort((a, b) => (b.displayPot ?? 0) - (a.displayPot ?? 0));
    }
    return pool; // allProspects is pre-sorted by displayOvr desc
  }, [allProspects, draftedSet, sortBy]);

  const rankById = useMemo(() => {
    const m = new Map<any, number>();
    sortedPool.forEach((p, i) => m.set(p.internalId, i + 1));
    return m;
  }, [sortedPool]);

  const available = useMemo(
    () => sortedPool.filter(p => posFilter === 'ALL' || (p.pos ?? '').includes(posFilter)),
    [sortedPool, posFilter],
  );

  const teamOnClock = draftOrder[currentPick - 1];
  const nextTeam = draftOrder[currentPick];
  const isDraftComplete = currentPick > draftOrder.length;

  // GM mode: the user manages one specific franchise. Other teams' picks are
  // off-limits to avoid sabotage (e.g. wasting another team's #3 on a R2 body).
  const isGM = state.gameMode === 'gm';
  const userTeamId = state.userTeamId;
  const isUserOnClock = isGM && userTeamId != null && teamOnClock?.id === userTeamId;
  // 1-indexed pick slots owned by the user. Uses draftOrder (not state.draftPicks)
  // to stay aligned with the slot sequence the UI iterates — in-draft pick trades
  // aren't modeled here, so this is the user's natural slot list.
  const userPickSlots = useMemo(() => {
    if (!isGM || userTeamId == null) return [] as number[];
    return draftOrder
      .map((t: any, i: number) => (t?.id === userTeamId ? i + 1 : -1))
      .filter((n: number) => n > 0);
  }, [isGM, userTeamId, draftOrder]);
  const userRemainingPicks = useMemo(
    () => userPickSlots.filter(p => p >= currentPick),
    [userPickSlots, currentPick],
  );
  const nextUserPick = userRemainingPicks[0] ?? null;
  const userHasMorePicks = nextUserPick != null;

  // simTarget stops the auto-sim loop when currentPick reaches this value. Set
  // by "Sim to Next Pick" / "Sim to End" so GM-mode runs hands-off until control
  // returns to the user's slot.
  const [simTarget, setSimTarget] = useState<number | null>(null);

  const buildDraftedPlayerUpdate = useCallback((player: any, pickSlot: number) =>
    computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], state.leagueStats),
  [draftOrder, state.leagueStats]);

  // Immediately commit a single pick to game state — no roster gate.
  const commitPickToState = useCallback((pickSlot: number, player: any) => {
    const update = buildDraftedPlayerUpdate(player, pickSlot);
    if (!update) return;
    const updatedPlayers = state.players.map((p: any) =>
      p.internalId === player.internalId ? { ...p, ...update } : p
    );
    dispatch({ type: 'UPDATE_STATE', payload: { players: updatedPlayers } } as any);
  }, [state.players, buildDraftedPlayerUpdate, dispatch]);

  const draftPlayer = useCallback((player: any, auto = false) => {
    setHasStarted(true);
    if (auto) {
      setDrafted(prev => ({ ...prev, [currentPick]: player }));
      commitPickToState(currentPick, player);
      setCurrentPick(prev => prev + 1);
    } else {
      setModalPlayer(player);
      setModalMode('draft');
    }
  }, [currentPick, commitPickToState]);

  // Instant sim — process every pick from currentPick up to (but not including) targetPick
  // synchronously in a single state update. Used by "Sim to My Pick" / "Sim to End" so the
  // user jumps straight to their next decision instead of watching a paced animation.
  const simToPickInstant = useCallback((targetPick: number) => {
    setIsSimulating(false);
    setSimTarget(null);
    setHasStarted(true);

    const newPicks: Record<number, any> = { ...drafted };
    const usedIds = new Set(Object.values(newPicks).map((p: any) => p.internalId));
    const pool = allProspects.filter(p => !usedIds.has(p.internalId));
    let poolIdx = 0;

    let pickNum = currentPick;
    const freshPicks: Array<{ slot: number; player: any }> = [];
    while (pickNum < targetPick && poolIdx < pool.length) {
      const top = pool[poolIdx++];
      newPicks[pickNum] = top;
      freshPicks.push({ slot: pickNum, player: top });
      pickNum++;
    }

    setDrafted(newPicks);
    setCurrentPick(pickNum);

    // Batch-commit all new picks in one pass — no roster gate
    if (freshPicks.length > 0) {
      const updateMap = new Map<string, object>();
      for (const { slot, player } of freshPicks) {
        const update = buildDraftedPlayerUpdate(player, slot);
        if (update) updateMap.set(player.internalId, update);
      }
      const updatedPlayers = state.players.map((p: any) =>
        updateMap.has(p.internalId) ? { ...p, ...updateMap.get(p.internalId) } : p
      );
      dispatch({ type: 'UPDATE_STATE', payload: { players: updatedPlayers } } as any);
    }
  }, [drafted, allProspects, currentPick, state.players, buildDraftedPlayerUpdate, dispatch]);

  // Auto-sim loop
  useEffect(() => {
    if (!isSimulating || isDraftComplete || modalPlayer) return;
    // Stop auto-sim when we reach the configured target pick (Sim to Next Pick
    // / Sim to End). Using >= so we stop BEFORE making the user's pick for them.
    if (simTarget != null && currentPick >= simTarget) {
      setIsSimulating(false);
      setSimTarget(null);
      return;
    }
    const speedMs: Record<string, number> = { fastest: 200, normal: 800, slow: 1500, slower: 3000, dramatic: 5000 };
    const timer = setTimeout(() => {
      const top = available[0];
      if (top) draftPlayer(top, true);
    }, speedMs[simSpeed] ?? 800);
    return () => clearTimeout(timer);
  }, [isSimulating, currentPick, available, simSpeed, isDraftComplete, modalPlayer, draftPlayer, simTarget]);

  const confirmPick = () => {
    if (modalMode === 'scouting' || modalMode === 'review') {
      setModalPlayer(null);
      return;
    }
    if (modalPlayer) {
      setDrafted(prev => ({ ...prev, [currentPick]: modalPlayer }));
      commitPickToState(currentPick, modalPlayer);
      setCurrentPick(prev => prev + 1);
      setModalPlayer(null);
    }
  };

  // Auto-commit picks to game state when draft completes — no manual button needed
  const [draftFinalized, setDraftFinalized] = useState(false);
  useEffect(() => {
    if (isDraftComplete && hasStarted && !draftFinalized) {
      finalizeDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraftComplete, hasStarted, draftFinalized]);

  const finalizeDraft = () => {
    const ls = state.leagueStats ?? {};
    const season: number = (ls as any).year ?? 2026;

    const updatedPlayers = state.players.map(p => {
      const pickEntry = Object.entries(drafted).find(([, pl]: [string, any]) => pl.internalId === p.internalId);
      if (!pickEntry) return p;
      const pickSlot = parseInt(pickEntry[0]);
      const fields = computeDraftPickFields(pickSlot, draftOrder[pickSlot - 1], ls);
      return fields ? { ...p, ...fields } : p;
    });

    // Undrafted current-year prospects → free agents (future classes stay as prospects)
    const draftedIds = new Set(Object.values(drafted).map((pl: any) => pl.internalId));
    const finalPlayers = updatedPlayers.map(p => {
      const draftYear = (p as any).draft?.year;
      const isCurrentClass = !draftYear || Number(draftYear) === season;
      if (isCurrentClass && (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') && !draftedIds.has(p.internalId)) {
        return { ...p, tid: -1, status: 'Free Agent' as const };
      }
      return p;
    });

    // The picks for this season have been consumed — drop them from the global
    // draftPicks inventory so Trade Machine / Trade Finder / Team Office /
    // AI trade engine all stop showing them. Rollover's future-pick generator
    // will produce the new rolling window (currentYear+1 … +windowSize) on Jun 30.
    const draftPicksAfter = (state.draftPicks ?? []).filter(p => p.season !== season);

    dispatch({
      type: 'UPDATE_STATE',
      payload: {
        players: finalPlayers,
        draftPicks: draftPicksAfter,
        draftComplete: true,
        activeDraftPicks: undefined, // clear in-progress picks — draft is done
      },
    } as any);
    setDraftFinalized(true);
  };

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">

      {/* DraftSimulatorView is now only rendered on draft day when draft is not complete
          (MainContent routes to DraftHistoryView for all other cases) */}

      {/* INTERACTIVE DRAFT BOARD — only shown on/after draft day and draft not yet committed */}
      {isDraftTime && !isDraftDone && (
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">

        {/* LEFT COLUMN */}
        <div className="space-y-5">

          {/* ON THE CLOCK */}
          <div className="bg-[#1A1A1A] rounded-sm p-5 border border-[#333]">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-white/60" />
              <span className="text-sm font-black uppercase tracking-widest text-white">On The Clock</span>
            </div>

            {isDraftComplete && hasStarted ? (
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <p className="text-emerald-300 font-black text-sm uppercase tracking-tight">Draft Complete</p>
              </div>
            ) : !isDraftComplete && teamOnClock ? (
              <div className={`flex items-center gap-4 ${isUserOnClock ? 'bg-amber-500/10 border border-amber-500/30 rounded-md p-3 -m-1' : ''}`}>
                {teamOnClock.logoUrl ? (
                  <img src={teamOnClock.logoUrl} alt={teamOnClock.name} className="w-14 h-14 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-indigo-900/40 flex items-center justify-center font-black text-indigo-300">{teamOnClock.abbrev}</div>
                )}
                <div className="flex-1">
                  {isUserOnClock && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-300">You're on the Clock</span>
                    </div>
                  )}
                  <p className="text-white/70 text-sm leading-relaxed">
                    With the <strong className="text-white">{currentPick}{getOrdinalSuffix(currentPick)}</strong> pick in the {state.leagueStats?.year ?? ''} NBA draft,
                    the <strong className="text-white">{teamOnClock.name}</strong> select…
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-white/60 font-bold uppercase text-sm tracking-widest">Draft Complete</p>
            )}

            {/* Controls */}
            <div className="flex justify-end mt-4 gap-3 items-center flex-wrap">
              {/* GM-mode fast-forward: skip to my next pick, or finish the draft
                  if I have no picks left. Hidden in commissioner mode — the
                  commissioner drafts for every team so the per-pick buttons
                  are enough. */}
              {isGM && !isDraftComplete && !isUserOnClock && userHasMorePicks && (
                <button
                  onClick={() => simToPickInstant(nextUserPick)}
                  className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors"
                >
                  <FastForward size={11} /> Sim to My Pick ({nextUserPick})
                </button>
              )}
              {isGM && !isDraftComplete && !userHasMorePicks && (
                <button
                  onClick={() => simToPickInstant(draftOrder.length + 1)}
                  className="h-8 px-3 text-xs font-black uppercase rounded-sm bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors"
                >
                  <FastForward size={11} /> Sim to End
                </button>
              )}
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-md border border-[#333]">
                <button
                  onClick={() => {
                    if (isSimulating) {
                      setIsSimulating(false);
                      setSimTarget(null);
                    } else {
                      // In GM mode, cap Auto Sim at the user's next pick so
                      // clicking it from another team's slot can't race past
                      // the user's turn and pick for them. Commissioner mode
                      // keeps the open-ended behavior since they draft for
                      // every team anyway.
                      if (isGM && userHasMorePicks) {
                        setSimTarget(nextUserPick);
                      } else {
                        setSimTarget(null);
                      }
                      setIsSimulating(true);
                      setHasStarted(true);
                    }
                  }}
                  disabled={isDraftComplete || (isGM && isUserOnClock)}
                  title={isGM && isUserOnClock ? "You're on the clock — pick a player below" : undefined}
                  className={`h-8 px-3 text-xs font-black uppercase rounded-sm transition-all flex items-center gap-1.5 ${
                    isSimulating ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/50 hover:text-white disabled:text-white/20 disabled:cursor-not-allowed'
                  }`}
                >
                  {isSimulating ? <><Pause size={11} className="fill-current" /> Pause</> : <><Play size={11} className="fill-current" /> Auto Sim</>}
                </button>
                <div className="h-4 w-px bg-zinc-700 mx-1" />
                <select
                  value={simSpeed}
                  onChange={e => setSimSpeed(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase text-white/50 border-none outline-none cursor-pointer"
                >
                  {['fastest', 'normal', 'slow', 'slower', 'dramatic'].map(s => (
                    <option key={s} value={s} className="bg-zinc-900">{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* AVAILABLE PLAYERS */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
            <div className="p-3 border-b border-[#333] flex items-center justify-between gap-3 flex-wrap">
              <span className="font-black text-white text-sm">Available Players</span>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
                  {POSITIONS.map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                        posFilter === pos ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
                {/* Sort toggle — drives the rank ordering shown in the list */}
                <div className="flex bg-black/40 rounded-md p-0.5 border border-[#333]">
                  {(['ovr', 'pot'] as const).map(key => (
                    <button
                      key={key}
                      onClick={() => setSortBy(key)}
                      className={`px-2.5 py-1 text-[10px] font-black rounded-sm transition-colors ${
                        sortBy === key ? 'bg-emerald-600 text-white' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {key.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              {available.length === 0 ? (
                <p className="text-center text-zinc-600 font-bold text-xs uppercase py-8">No players available</p>
              ) : (
                available.map((player) => (
                  <div
                    key={player.internalId}
                    onClick={() => { setModalPlayer(player); setModalMode('scouting'); }}
                    className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    {/* Rank — whole-class rank from the sorted pool, not the filtered index */}
                    <div className="w-10 h-10 bg-black/40 rounded-sm font-black text-lg text-white/40 mr-3 shrink-0 flex items-center justify-center">
                      {String(rankById.get(player.internalId) ?? 0).padStart(2, '0')}
                    </div>

                    {/* Photo */}
                    <div className="w-10 h-10 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                      {(() => {
                        const img = getPlayerImage(player as any);
                        const face = (player as any).face;
                        if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />;
                        if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                        return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">{player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                      })()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base leading-tight truncate">{player.name}</p>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                        <span>{player.pos}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span>{(player as any).born?.year ? leagueYear - (player as any).born.year : ((player as any).age ?? '?')}y</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-indigo-300">OVR {player.displayOvr}</span>
                        <span className="w-1 h-1 bg-white/20 rounded-full" />
                        <span className="text-emerald-400/70">POT {player.displayPot}</span>
                        {(player as any).college && (
                          <>
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-white/50">{(player as any).college}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Draft button — hidden in GM mode when it's not our pick
                        so the user can't spike another team's slot with a bad
                        prospect. Commissioner mode drafts for every team so
                        the button stays available. */}
                    {(!isGM || isUserOnClock) && (
                      <button
                        onClick={e => { e.stopPropagation(); draftPlayer(player); }}
                        disabled={isDraftComplete}
                        className="ml-3 bg-indigo-800 hover:bg-indigo-600 text-white font-black text-[10px] h-6 px-4 rounded-sm transition-colors uppercase disabled:opacity-30"
                      >
                        Draft
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">

          {/* NEXT UP */}
          {nextTeam && !isDraftComplete && (
            <div className="bg-[#1A1A1A] rounded-sm p-3 border border-[#333] flex justify-between items-center">
              <div>
                <div className="text-[9px] font-black uppercase text-white/40">Next Up — Pick {currentPick + 1}</div>
                <div className="font-black text-white text-sm">{nextTeam.name}</div>
              </div>
              {nextTeam.logoUrl && (
                <img src={nextTeam.logoUrl} alt={nextTeam.name} className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
              )}
            </div>
          )}

          {/* TEAM NEEDS — GM mode only, so the user can scan their positional/category gaps
              while picking. Uses a compact sidebar-sized readout; the full 2-column TeamOffice
              view doesn't fit in a 320px aside. */}
          {isGM && userTeamId != null && (
            <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
              <div className="text-[9px] font-black uppercase text-amber-300 tracking-widest mb-3">Your Team Needs</div>
              <CompactTeamNeedsPanel teamId={userTeamId} players={state.players} />
            </div>
          )}

          {/* ADVISOR'S BIG BOARD — GM mode only. Mode-weighted 70/30 value+fit score,
              drafted prospects stay listed with a strikethrough so the user can see
              what's already off the board without the list reshuffling. */}
          {isGM && userTeamId != null && (
            <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
              <div className="text-[9px] font-black uppercase text-amber-300 tracking-widest mb-3">Advisor's Big Board</div>
              <CompactAdvisorBoardPanel teamId={userTeamId} draftedIds={draftedSet} />
            </div>
          )}

          {/* TOP PROSPECTS — drafted players are removed so the list always reflects who's still on the board */}
          <div className="bg-[#1A1A1A] rounded-sm border border-[#333] p-4">
            <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-3">Top Prospects by OVR</div>
            {allProspects.filter(p => !draftedSet.has(p.internalId)).slice(0, 10).map((p, i) => (
              <div key={p.internalId} className="flex items-center gap-2 py-1">
                <span className="text-[10px] font-black text-white/30 w-5">{i + 1}</span>
                <span className="text-xs font-bold text-white truncate flex-1">{p.name}</span>
                <span className="text-[10px] font-black text-indigo-300">{p.displayOvr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )} {/* end isDraftTime && !isDraftDone */}

      {/* PRE-DRAFT: Top prospects scouting panel (always visible when draft not yet done) */}
      {!isDraftTime && !isDraftDone && allProspects.length > 0 && (
        <div className="bg-[#1A1A1A] rounded-sm border border-[#333] overflow-hidden">
          <div className="p-3 border-b border-[#333]">
            <span className="font-black text-white text-sm">Top Prospects by OVR — {leagueYear} Draft Class</span>
            <p className="text-[10px] text-white/30 font-medium mt-0.5">Available for drafting on June 25, {leagueYear}. Ratings may improve before draft day.</p>
          </div>
          <div>
            {allProspects.map((player, i) => (
              <div
                key={player.internalId}
                onClick={() => setViewingBioPlayer(player as NBAPlayer)}
                className="flex items-center p-2.5 border-b border-[#333] hover:bg-white/5 transition-colors cursor-pointer group"
              >
                <div className="w-8 h-8 bg-black/40 rounded-sm font-black text-base text-white/30 mr-3 shrink-0 flex items-center justify-center">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-black/40 mr-3 shrink-0 border border-zinc-800 overflow-hidden">
                  {(() => {
                    const img = getPlayerImage(player as any);
                    const face = (player as any).face;
                    if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />;
                    if (isRealFaceConfig(face)) return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div></div>;
                    return <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-zinc-500">{player.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white text-sm leading-tight truncate">{player.name}</p>
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1 flex-wrap">
                    <span>{player.pos}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span>{(player as any).born?.year ? leagueYear - (player as any).born.year : ((player as any).age ?? '?')}y</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-indigo-300">OVR {player.displayOvr}</span>
                    <span className="w-1 h-1 bg-white/20 rounded-full" />
                    <span className="text-emerald-400/70">POT {player.displayPot}</span>
                    {(player as any).college && <><span className="w-1 h-1 bg-white/20 rounded-full" /><span className="text-white/50">{(player as any).college}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PICK MODAL */}
      <AnimatePresence>
        {modalPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#1A1A1A] border border-[#333] rounded-md shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Modal header */}
              <div className="p-4 border-b border-indigo-800 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-3">
                  {teamOnClock?.logoUrl && (
                    <img src={teamOnClock.logoUrl} alt="" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                  )}
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">
                    {modalMode === 'draft' ? 'Confirm Pick' : modalMode === 'scouting' ? 'Scouting Report' : `Pick #${reviewPick}`}
                  </h3>
                </div>
                <span className="text-[10px] font-black text-white/30 uppercase">{state.leagueStats?.year} NBA Draft</span>
              </div>

              {/* Modal body */}
              <div className="p-6 flex gap-6 items-start">
                {/* Player photo */}
                <div className="w-24 h-24 rounded-full bg-black/40 border-2 border-[#333] overflow-hidden shrink-0">
                  {modalPlayer.imgURL ? (
                    <img src={modalPlayer.imgURL} alt={modalPlayer.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-300">
                      {modalPlayer.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  {modalMode !== 'scouting' && (
                    <div className="inline-block bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-sm mb-1 uppercase">
                      Pick #{modalMode === 'draft' ? currentPick : reviewPick}
                    </div>
                  )}
                  <h4 className="text-2xl font-black text-white tracking-tight truncate">{modalPlayer.name}</h4>
                  <div className="flex flex-wrap gap-2 text-[11px] text-white/50 font-bold uppercase mt-1">
                    <span>{modalPlayer.pos}</span>
                    <span>·</span>
                    <span className="text-indigo-300">OVR {modalPlayer.displayOvr}</span>
                    <span>·</span>
                    <span className="text-emerald-400">POT {modalPlayer.displayPot}</span>
                    {modalPlayer.college && <><span>·</span><span>{modalPlayer.college}</span></>}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4 bg-black/20 p-3 rounded-sm border border-[#333]">
                    {[
                      { label: 'PPG', value: modalPlayer.ppg },
                      { label: 'RPG', value: modalPlayer.rpg },
                      { label: 'APG', value: modalPlayer.apg },
                    ].map(stat => (
                      <div key={stat.label} className="text-center">
                        <div className="text-[9px] text-white/30 uppercase font-black">{stat.label}</div>
                        <div className="text-base font-black text-white">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="p-3 bg-[#111] border-t border-[#333] flex justify-end gap-2">
                <button
                  onClick={() => setModalPlayer(null)}
                  className="text-white/40 hover:text-white border border-zinc-700 font-black uppercase text-[10px] h-8 px-5 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPick}
                  className="bg-indigo-700 hover:bg-indigo-600 text-white font-black uppercase text-[10px] h-8 px-6 rounded-sm transition-colors"
                >
                  {modalMode === 'draft' ? 'Confirm Pick' : 'Close'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL DRAFT TABLE — all 60 slots render as empty placeholders from the start, like a real draft board */}
      {isDraftTime && !isDraftDone && draftOrder.length > 0 && (
        <FullDraftTable
          drafted={drafted}
          draftOrder={draftOrder}
          onReview={(player, pick) => { setModalPlayer(player); setReviewPick(pick); setModalMode('review'); }}
          currentPick={currentPick}
          userTeamId={userTeamId ?? null}
          isGM={isGM}
        />
      )}
    </div>
  );
};
