import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { CheckCircle, XCircle } from 'lucide-react';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { computeContractOffer, formatPlayerSalaryDisplay, getPlayerCurrentSalaryUSD, hasBirdRights } from '../../../../../utils/salaryUtils';
import { computeMoodScore, normalizeMoodTraits } from '../../../../../utils/mood/moodScore';
import { computeResignProbability } from '../../PlayerBioMoraleTab';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import type { GameState, NBAPlayer } from '../../../../../types';
import { isOnRoster, resolveAnyTeam } from '../../../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../../../utils/uiMode';
import { getDisplayAge } from '../../../../../store/playerRatingStore';
import { getTwoWayRosterLimit } from '../../../../../utils/rosterLimits';
import { isNonGuaranteedContract, isTwoWayContract } from '../../../../../utils/contractTypes';
import { isRfaMatchingEnabled } from '../../../../../utils/ruleFlags';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../../../../utils/scoutingFuzz';
import { getCalibratedPer } from '../../../../../utils/advancedStatCalibration';
import { areWnbaDevelopmentalContractsEnabled } from '../../../../../services/wnba/developmentalContracts';
import {
  getEffectiveContractEndYear,
  getOffseasonDecisionTeamId,
  resolveOffseasonContractDecision,
} from '../../../../../services/freeAgency/offseasonContractDecision';
import { isPlayerRestrictedFreeAgent } from '../../../../../services/freeAgency/rfaEligibility';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVisibleOvr(state: GameState, p: NBAPlayer, currentYear: number): number {
  return getScoutedDisplayOverall(state, p, currentYear);
}

function getLastSeasonPg(p: NBAPlayer) {
  const stats = ((p as any).stats ?? []) as any[];
  const last = stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).slice(-1)[0];
  if (!last || last.gp <= 0) return null;
  const gp = last.gp;
  return {
    g: gp,
    mp: (last.min ?? 0) / gp,
    pts: (last.pts ?? 0) / gp,
    reb: ((last.orb ?? 0) + (last.drb ?? 0)) / gp || (last.trb ?? 0) / gp,
    ast: (last.ast ?? 0) / gp,
    per: getCalibratedPer(last),
  };
}

function isPlayerRFA(p: NBAPlayer): boolean {
  return isPlayerRestrictedFreeAgent(p);
}

function getContractOption(p: NBAPlayer): 'player' | 'team' | 'rookie' | null {
  // Rookie scale deals are structured as guaranteed years + team option years,
  // so the last contractYear option reads 'Team'. The contract.rookie flag is
  // the authoritative signal — check it first so rookie deals render as ROOKIE
  // instead of TEAM OPT.
  if ((p as any).contract?.rookie) return 'rookie';
  const years = (p as any).contractYears as Array<{ option?: string; season?: string }> | undefined;
  if (!years || years.length === 0) return null;
  const opt = (years[years.length - 1].option ?? '').toLowerCase();
  if (opt.includes('player')) return 'player';
  if (opt.includes('team')) return 'team';
  return null;
}

function fmtUSD(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${(abs / 1_000).toFixed(0)}K`;
}

const fmt1 = (v: number) => (Number.isFinite(v) && v > 0 ? v.toFixed(1) : '—');

// Matches PlayerBioMoraleTab's resignLabel — same labels, uppercase for badge
function resignLabel(val: number): string {
  if (val >= 80) return 'WILL RESIGN';
  if (val >= 65) return 'LIKELY RESIGN';
  if (val >= 50) return 'LEANING STAY';
  if (val >= 35) return 'LEANING LEAVE';
  if (val >= 20) return 'TESTING MARKET';
  return 'WALKING';
}

// ── Types ──────────────────────────────────────────────────────────────────────

type TierFilter = 'all' | '90+' | '80-89' | '70-79' | 'u25';
type SortCol = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'pts' | 'reb' | 'ast' | 'per' | 'type' | 'bird' | 'option' | 'exp' | 'contract' | 'asking' | 'pct';

interface RowData {
  player: NBAPlayer;
  ovr: number;
  age: number;
  pot: number;
  pg: { g: number; mp: number; pts: number; reb: number; ast: number; per: number } | null;
  rfa: boolean;
  bird: boolean;
  opt: 'player' | 'team' | 'rookie' | null;
  currentSalaryUSD: number;
  currentSalaryLabel: string;
  offer: { salaryUSD: number; years: number };
  resignScore: number | null;
  retirementStatus: 'retiring' | 'considering' | null;
  effectiveExp: number;
  yearsLeft: number;
  isExpiring: boolean;
  isTwoWay: boolean;
  isNonGuaranteed: boolean;
}

interface Props {
  teamId: number;
  onPlayerClick?: (player: NBAPlayer) => void;
}

export function isTeamIntelContractBoardPlayer(
  player: NBAPlayer,
  teamId: number,
  offseasonOpen: boolean,
): boolean {
  return player.tid === teamId
    || (offseasonOpen && getOffseasonDecisionTeamId(player) === teamId);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TeamIntelExpiring({ teamId, onPlayerClick }: Props) {
  const { state, dispatchAction } = useGame();
  const quick = usePlayerQuickActions();
  const isOwnTeam = teamId === state.userTeamId;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const hideNbaContractBadges = isEuroIsolatedMode(state) || teamId >= 100;
  const birdRightsEnabled = !hideNbaContractBadges && state.leagueStats?.birdRightsEnabled !== false;
  const playerOptionsEnabled = !hideNbaContractBadges && state.leagueStats?.playerOptionsEnabled !== false;
  const rookieScaleEnabled = !hideNbaContractBadges && (state.leagueStats as any)?.rookieScaleType !== 'none';
  const rookieTeamOptionsEnabled = rookieScaleEnabled && (state.leagueStats as any)?.rookieTeamOptionsEnabled !== false;
  const rfaEnabled = !hideNbaContractBadges && isRfaMatchingEnabled(state.leagueStats);
  const twoWayContractsEnabled = !hideNbaContractBadges && getTwoWayRosterLimit(state.leagueStats as any) > 0;
  const developmentalActive = areWnbaDevelopmentalContractsEnabled(state.leagueStats);
  const nonGuaranteedContractsEnabled = !hideNbaContractBadges && state.leagueStats?.nonGuaranteedContractsEnabled !== false;

  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const gamesPlayed = (team?.wins ?? 0) + (team?.losses ?? 0);
  const teamWinPct = gamesPlayed > 0 ? (team?.wins ?? 0) / gamesPlayed : 0.5;

  const teamPlayers = useMemo(
    () => (state.players ?? []).filter(p => isTeamIntelContractBoardPlayer(
      p,
      teamId,
      state.seasonLifecycle?.offseasonOpen === true,
    )),
    [state.players, state.seasonLifecycle?.offseasonOpen, teamId],
  );

  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'ovr', dir: 'desc' });

  const handleSort = (col: SortCol) =>
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc' }));

  const SortTh = ({ col, label, cls = 'text-right' }: { col: SortCol; label: string; cls?: string }) => (
    <th
      className={cn(cls, 'px-2 py-2 cursor-pointer hover:text-slate-300 whitespace-nowrap')}
      onClick={() => handleSort(col)}
    >
      {label}
      {sort.col === col && <span className="ml-0.5 text-amber-400">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
    </th>
  );

  // Pre-compute all row data including real moodScore → resignProbability
  const allRows = useMemo((): RowData[] => {
    const active = teamPlayers.filter(p => (isOnRoster(p) || getOffseasonDecisionTeamId(p) === teamId) && p.contract);
    return active.map(p => {
      const contractDecision = resolveOffseasonContractDecision(p, state);
      const { score: moodScore } = computeMoodScore(
        p, team, state.date, false, false, false, teamPlayers, currentYear,
      );
      const traits = normalizeMoodTraits((p as any).moodTraits ?? []);
      const resign = computeResignProbability(p, traits as any, moodScore, currentYear, teamWinPct, team);
      // Effective expiration — re-signs leave contract.exp pointing at the OLD
      // current-year deal until rollover; the new commitment lives in contractYears.
      // Use the later of the two so a freshly re-signed player drops off the
      // expiring list instead of staying flagged as "expires this year".
      const effectiveExp = getEffectiveContractEndYear(p) ?? currentYear;
      const yearsLeft = Math.max(0, effectiveExp - currentYear);
      const rawOpt = contractDecision.kind === 'ROOKIE_TEAM_OPTION_DUE' ? 'rookie'
        : contractDecision.kind === 'TEAM_OPTION_DUE' ? 'team'
        : contractDecision.kind === 'PLAYER_OPTION_DUE' ? 'player'
        : getContractOption(p);
      const opt = rawOpt === 'player' && playerOptionsEnabled ? rawOpt
        : rawOpt === 'rookie' && rookieScaleEnabled ? rawOpt
        : rawOpt === 'team' && rookieTeamOptionsEnabled ? rawOpt
        : null;
      return {
        player: p,
        ovr: getVisibleOvr(state, p, currentYear),
        age: getDisplayAge(p, currentYear),
        pot: getScoutedDisplayPotential(state, p, currentYear, currentYear),
        pg: getLastSeasonPg(p),
        rfa: rfaEnabled && (
          contractDecision.kind === 'ROOKIE_EXIT_RFA_QO'
          || contractDecision.kind === 'RFA_QO_DUE'
          || isPlayerRFA(p)
        ),
        bird: birdRightsEnabled && hasBirdRights(p),
        opt,
        currentSalaryUSD: getPlayerCurrentSalaryUSD(p as any, currentYear),
        currentSalaryLabel: formatPlayerSalaryDisplay(p as any, currentYear, state.nonNBATeams ?? []),
        offer: computeContractOffer(p, state.leagueStats),
        resignScore: resign?.score ?? null,
        retirementStatus: resign?.retirementStatus ?? null,
        effectiveExp,
        yearsLeft,
        isExpiring: effectiveExp <= currentYear,
        isTwoWay: twoWayContractsEnabled && isTwoWayContract(p, state.leagueStats),
        isNonGuaranteed: nonGuaranteedContractsEnabled && isNonGuaranteedContract(p, state.leagueStats),
      };
    });
  }, [teamPlayers, team, state.date, state.leagueStats, currentYear, teamWinPct, rfaEnabled, birdRightsEnabled, playerOptionsEnabled, rookieScaleEnabled, rookieTeamOptionsEnabled, twoWayContractsEnabled, nonGuaranteedContractsEnabled, state.nonNBATeams]);

  const rows = useMemo((): RowData[] => {
    const filtered = allRows.filter(r => {
      if (tierFilter === '90+')   return r.ovr >= 90;
      if (tierFilter === '80-89') return r.ovr >= 80 && r.ovr < 90;
      if (tierFilter === '70-79') return r.ovr >= 70 && r.ovr < 80;
      if (tierFilter === 'u25')   return r.age < 25;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const { col, dir } = sort;
      let av: any = 0, bv: any = 0;
      if (col === 'name')   { av = a.player.name; bv = b.player.name; }
      else if (col === 'pos')  { av = a.player.pos ?? ''; bv = b.player.pos ?? ''; }
      else if (col === 'age')  { av = a.age;  bv = b.age; }
      else if (col === 'ovr')  { av = a.ovr;  bv = b.ovr; }
      else if (col === 'pot')  { av = a.pot;  bv = b.pot; }
      else if (col === 'pts')  { av = a.pg?.pts ?? 0; bv = b.pg?.pts ?? 0; }
      else if (col === 'reb')  { av = a.pg?.reb ?? 0; bv = b.pg?.reb ?? 0; }
      else if (col === 'ast')  { av = a.pg?.ast ?? 0; bv = b.pg?.ast ?? 0; }
      else if (col === 'per')  { av = a.pg?.per ?? 0; bv = b.pg?.per ?? 0; }
      else if (col === 'type') { av = a.rfa ? 0 : 1; bv = b.rfa ? 0 : 1; }
      else if (col === 'bird') { av = a.bird ? 1 : 0; bv = b.bird ? 1 : 0; }
      else if (col === 'option') { av = a.opt ?? ''; bv = b.opt ?? ''; }
      else if (col === 'contract') { av = a.currentSalaryUSD; bv = b.currentSalaryUSD; }
      else if (col === 'asking') { av = a.offer.salaryUSD * a.offer.years; bv = b.offer.salaryUSD * b.offer.years; }
      else if (col === 'exp')  { av = a.effectiveExp; bv = b.effectiveExp; }
      else if (col === 'pct')  { av = a.resignScore ?? -1; bv = b.resignScore ?? -1; }
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'asc' ? av - bv : bv - av;
    });
  }, [allRows, tierFilter, sort]);

  if (quick.fullPageView) return quick.fullPageView;

  if (allRows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        No active players with contracts found.
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col gap-2 min-h-0">
        {/* Tier filter */}
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {(['all', '90+', '80-89', '70-79', 'u25'] as TierFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={cn(
                'px-2 py-1 text-[10px] font-bold uppercase rounded',
                tierFilter === t ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
              )}
            >
              {t === 'u25' ? 'Under 25' : t}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-500">
            {rows.length} player{rows.length !== 1 ? 's' : ''}
            {isOwnTeam && (
              <span className="ml-2 text-emerald-400/70">· click % to open signing offer</span>
            )}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-[#30363d] bg-black/40">
          <table className="w-full text-xs min-w-[960px]">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
              <tr className="text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <th className="text-left px-3 py-2 w-[180px] cursor-pointer hover:text-slate-300 whitespace-nowrap" onClick={() => handleSort('name')}>
                  Player {sort.col === 'name' && <span className="text-amber-400">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
                </th>
                <th className="text-center px-2 py-2 w-[52px]">Team</th>
                <SortTh col="pos"    label="Pos"  cls="text-center" />
                <SortTh col="age"    label="Age"  cls="text-center" />
                <SortTh col="ovr"    label="OVR ▼" />
                <SortTh col="pot"    label="POT" />
                <th className="text-center px-2 py-2">G</th>
                <th className="text-right px-1.5 py-2">MP</th>
                <SortTh col="pts"    label="PTS" />
                <SortTh col="reb"    label="REB" />
                <SortTh col="ast"    label="AST" />
                <SortTh col="per"    label="PER" />
                <SortTh col="type"   label="Type"   cls="text-center" />
                {birdRightsEnabled && <SortTh col="bird"   label="Bird"   cls="text-center" />}
                {playerOptionsEnabled && <SortTh col="option" label="Option" cls="text-center" />}
                <SortTh col="exp"      label="Exp"      cls="text-center" />
                <SortTh col="contract" label="Contract" />
                <SortTh col="asking"   label="Asking" />
                <SortTh col="pct"    label="Re-sign %" cls="text-center" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player: p, ovr, age, pot, pg, rfa, bird, opt, currentSalaryUSD, currentSalaryLabel, offer, resignScore, retirementStatus, effectiveExp, yearsLeft, isExpiring, isTwoWay, isNonGuaranteed }) => (
                <tr
                  key={p.internalId}
                  className={cn(
                    'border-t border-slate-800/60 cursor-pointer transition-colors',
                    isTwoWay
                      ? 'bg-violet-500/10 hover:bg-violet-500/20 border-l-2 border-l-violet-500'
                      : isNonGuaranteed
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-2 border-l-amber-500'
                      : 'hover:bg-white/5',
                  )}
                  onClick={() => quick.openFor(p)}
                >
                  {/* Player */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerPortrait playerName={p.name} imgUrl={p.imgURL} face={(p as any).face} size={26} />
                      <PlayerNameWithHover player={p} className="font-semibold truncate max-w-[110px]">{p.name}</PlayerNameWithHover>
                      {isTwoWay && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 border border-violet-500/50 shrink-0">{developmentalActive ? 'DEV' : '2W'}</span>
                      )}
                      {isNonGuaranteed && !isTwoWay && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 shrink-0">NG</span>
                      )}
                    </div>
                  </td>

                  {/* Team logo */}
                  <td className="text-center px-2">
                    {team?.logoUrl
                      ? <img src={team.logoUrl} alt={team.abbrev} referrerPolicy="no-referrer" className="w-5 h-5 object-contain mx-auto opacity-80" />
                      : <span className="text-[10px] text-slate-500">{team?.abbrev ?? '—'}</span>}
                  </td>

                  <td className="text-center text-slate-400 px-2">{p.pos}</td>
                  <td className="text-center text-slate-400 tabular-nums px-2">{age}</td>

                  {/* OVR */}
                  <td className={cn(
                    'text-right font-black tabular-nums px-2',
                    ovr >= 90 ? 'text-blue-300' : ovr >= 85 ? 'text-emerald-300' : ovr >= 78 ? 'text-amber-300' : 'text-slate-400',
                  )}>{ovr}</td>

                  {/* POT */}
                  <td className={cn(
                    'text-right font-semibold tabular-nums px-2',
                    pot >= 90 ? 'text-blue-300/80' : pot >= 85 ? 'text-emerald-300/80' : pot >= 78 ? 'text-amber-300/80' : 'text-slate-500',
                  )}>{pot}</td>

                  {/* Stats */}
                  <td className="text-center text-slate-300 tabular-nums px-1.5">{pg ? pg.g : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums px-1.5">{pg ? fmt1(pg.mp) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums px-1.5">{pg ? fmt1(pg.pts) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums px-1.5">{pg ? fmt1(pg.reb) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums px-1.5">{pg ? fmt1(pg.ast) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums px-1.5">{pg ? fmt1(pg.per) : <span className="text-slate-600">—</span>}</td>

                  {/* UFA / RFA */}
                  <td className="text-center px-2">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider',
                      rfa ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40'
                          : 'bg-slate-700/40 text-slate-400 border border-slate-700',
                    )}>
                      {rfa ? 'RFA' : 'UFA'}
                    </span>
                  </td>

                  {/* Bird */}
                  {birdRightsEnabled && (
                    <td className="text-center px-2">
                      <span className={cn(
                        'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider',
                        bird ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                             : 'bg-slate-700/40 text-slate-500 border border-slate-700',
                      )}>
                        {bird ? 'YES' : 'NO'}
                      </span>
                    </td>
                  )}

                  {/* Option */}
                  {playerOptionsEnabled && (
                    <td className="text-center px-2">
                      {opt ? (
                        <span className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider whitespace-nowrap',
                          opt === 'player' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                            : opt === 'rookie' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : 'bg-violet-500/20 text-violet-300 border border-violet-500/40',
                        )}>
                          {opt === 'player' ? 'PLR OPT' : opt === 'rookie' ? 'ROOKIE' : 'TEAM OPT'}
                        </span>
                      ) : <span className="text-[9px] text-slate-600">—</span>}
                    </td>
                  )}

                  {/* Exp year */}
                  <td className="text-center px-2">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider tabular-nums',
                      isExpiring
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : yearsLeft === 1
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-slate-700/40 text-slate-400 border border-slate-700',
                    )}>
                      {effectiveExp}
                    </span>
                  </td>

                  {/* Current contract */}
                  <td className="text-right text-slate-300 tabular-nums whitespace-nowrap px-2">
                    {currentSalaryUSD > 0 ? currentSalaryLabel : <span className="text-slate-600">—</span>}
                  </td>

                  {/* Asking (FA market value — only meaningful when hitting FA this season) */}
                  <td className="text-right text-slate-300 tabular-nums whitespace-nowrap px-2">
                    {isExpiring
                      ? `${fmtUSD(offer.salaryUSD)}/${offer.years}yr`
                      : <span className="text-slate-600">—</span>}
                  </td>

                  {/* Re-sign % — or Exercise/Decline for team option players */}
                  <td className="text-center px-3 py-1">
                    {retirementStatus === 'retiring' ? (
                      <span className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap border bg-rose-500/15 text-rose-300 border-rose-500/40">
                        0% · Retiring
                      </span>
                    ) : isOwnTeam && opt === 'team' ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); dispatchAction({ type: 'EXERCISE_TEAM_OPTION', payload: { playerId: p.internalId } } as any); }}
                          title={`Exercise team option — keep ${p.name} at option salary`}
                          className="flex items-center gap-0.5 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors whitespace-nowrap"
                        >
                          <CheckCircle size={10} /> Exercise
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); dispatchAction({ type: 'DECLINE_TEAM_OPTION', payload: { playerId: p.internalId } } as any); }}
                          title={`Decline team option — ${p.name} becomes FA`}
                          className="flex items-center gap-0.5 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-colors whitespace-nowrap"
                        >
                          <XCircle size={10} /> Decline
                        </button>
                      </div>
                    ) : resignScore === null ? (
                      <span className="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap border bg-slate-700/30 text-slate-500 border-slate-700">
                        {yearsLeft} YR{yearsLeft !== 1 ? 'S' : ''} LEFT
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isOwnTeam) quick.handle(p, isTwoWay ? 'sign_guaranteed' : 'resign_player');
                          else quick.openFor(p);
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors border',
                          resignScore >= 65
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                            : resignScore >= 45
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                            : resignScore >= 30
                            ? 'bg-orange-500/15 text-orange-300 border-orange-500/40 hover:bg-orange-500/25'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25',
                        )}
                        title={isOwnTeam ? 'Open signing offer' : undefined}
                      >
                        {resignScore}% · {retirementStatus === 'considering' ? 'Considering Retirement' : resignLabel(resignScore)}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {createPortal(quick.portals, document.body)}
    </>
  );
}
