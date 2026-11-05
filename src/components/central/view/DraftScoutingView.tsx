import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import type { NBAPlayer } from '../../../types';
import { ChevronLeft, ChevronRight, Search, Target } from 'lucide-react';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { DraftScoutingModal } from '../../draft/DraftScoutingModal';
import { buildMockDraft } from '../../../services/draftAdvisor';
import { buildFullDraftSlotMap } from '../../../services/draft/draftClassStrength';
import { getCapThresholds } from '../../../utils/salaryUtils';
import { getDraftCombineStartDate, toISODateString } from '../../../utils/dateUtils';
import { normalizeDate } from '../../../utils/helpers';
import { isPbaIsolatedMode } from '../../../utils/uiMode';
import { buildPbaDraftOrderTeams } from '../../draft/DraftSimulatorView.helpers';
import { isOnRoster } from '../../../utils/teamLookup';
import { getPbaComparisonPool } from '../../../services/pba/draftRules';
import { getCurrentDraftClassYear } from '../../../services/draft/DraftPickGenerator';
import {
  ensureDraftScouting,
  getCachedDraftScouting,
  type GistProspect,
} from '../../../services/draftScoutingGist';
import { ensureFullRosterPlayerDataLoaded, ensurePortraitLookupsLoaded } from '../../../data/realPlayerDataFetcher';
import {
  computeSkillScores,
  batchComparisonsDeduped,
  SKILL_AXES,
  type SkillAxis,
} from '../../../services/scoutingReport';
import {
  buildMockProspects,
  getDraftScoutingYearRange,
  matchesPosFilter,
  MockProspect,
  PosFilter,
  POS_FILTERS,
} from './draftScoutingViewShared';
import { fuzzDraftRatingValue } from '../../../utils/scoutingFuzz';
import { isExternalLeaguePlayer } from '../../../utils/playerLeagueScope';
import { PlayerActionsModal } from '../../shared/PlayerActionsModal';
import { isPrimaryNbaComparisonCandidate } from '../../draft/DraftScoutingModalShared';
import { loadNbaEraPortraitCatalog } from '../../../services/nbaEraPortraitCatalog';
import { getProspectCollege, getProspectPreDraftClub } from '../../../utils/prospectUtils';
export { prefetchDraftScouting } from '../../../services/draftScoutingGist';

interface DraftScoutingViewProps {
  initialYear?: number;
}

export const DraftScoutingView: React.FC<DraftScoutingViewProps> = ({ initialYear }) => {
  const { state, dispatchAction, setCurrentView, navigateToPlayer } = useGame();
  const pbaMode = isPbaIsolatedMode(state);
  const isFictional = state.leagueType === 'fictional';
  const draftScope = state.leagueStats?.uiMode === 'wnba_isolated'
    ? 'wnba' as const
    : isFictional ? 'fictional' as const : 'nba' as const;
  const scopedPlayers = useMemo(
    () => isFictional ? state.players.filter(player => !isExternalLeaguePlayer(player)) : state.players,
    [isFictional, state.players],
  );

  const defaultDraftYear = getCurrentDraftClassYear(state);
  const [selectedYear, setSelectedYear] = useState(() => Number.isSafeInteger(initialYear) ? Number(initialYear) : defaultDraftYear);
  const previousDefaultDraftYear = React.useRef(defaultDraftYear);
  const [posFilter, setPosFilter] = useState<PosFilter>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [scoutingPlayer, setScoutingPlayer] = useState<MockProspect | null>(null);
  const [actionsPlayer, setActionsPlayer] = useState<MockProspect | null>(null);
  const [skillFilter, setSkillFilter] = useState<SkillAxis | null>(null);
  const [gistData, setGistData] = useState<GistProspect[] | null>(() => isFictional ? null : getCachedDraftScouting(selectedYear) ?? null);
  const [sourcePortraitVersion, setSourcePortraitVersion] = useState(0);
  const { minYear, maxYear } = useMemo(
    () => getDraftScoutingYearRange(scopedPlayers, defaultDraftYear, pbaMode ? 'pba' : draftScope, state.leagueStats, initialYear),
    [scopedPlayers, defaultDraftYear, draftScope, initialYear, pbaMode, state.leagueStats],
  );

  useEffect(() => {
    const previousDefault = previousDefaultDraftYear.current;
    setSelectedYear(year => (
      year === previousDefault || year < minYear || year > maxYear
        ? defaultDraftYear
        : year
    ));
    previousDefaultDraftYear.current = defaultDraftYear;
  }, [defaultDraftYear, maxYear, minYear]);

  const draftYear = selectedYear;
  const currentLeagueYear = state.leagueStats?.year ?? new Date().getFullYear();
  const prospectOrigin = (player: MockProspect): string | undefined => (
    getProspectCollege(player)
    || getProspectPreDraftClub(player, {
      currentSeason: draftYear,
      completedThrough: Math.min(draftYear, currentLeagueYear),
      teams: [...state.teams, ...(state.nonNBATeams ?? [])],
    })?.name
    || String(player.gistMatch?.college ?? '').trim()
    || undefined
  );
  const currentDateNorm = normalizeDate(state.date ?? '');
  const currentCombineDate = toISODateString(getDraftCombineStartDate(currentLeagueYear, state.leagueStats as any));
  const showCombineTab = draftYear < currentLeagueYear || (draftYear === currentLeagueYear && currentDateNorm >= currentCombineDate);
  useEffect(() => {
    if (pbaMode || isFictional) {
      setGistData(null);
      return;
    }
    const cached = getCachedDraftScouting(draftYear);
    if (cached !== undefined) {
      setGistData(cached);
      return;
    }
    setGistData(null);
    let cancelled = false;
    ensureDraftScouting(draftYear).then(data => {
      if (cancelled) return;
      setGistData(data);
    });
    return () => { cancelled = true; };
  }, [draftYear, isFictional, pbaMode]);
  useEffect(() => {
    if (pbaMode || isFictional) return;
    let cancelled = false;
    Promise.all([ensureFullRosterPlayerDataLoaded(), ensurePortraitLookupsLoaded(), loadNbaEraPortraitCatalog()])
      .then(() => {
        if (!cancelled) setSourcePortraitVersion(version => version + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isFictional, pbaMode]);
  const prospects = useMemo<MockProspect[]>(() => {
    return buildMockProspects(scopedPlayers, currentLeagueYear, draftYear, gistData, pbaMode, state.leagueStats, !isFictional, draftScope);
  }, [scopedPlayers, draftYear, currentLeagueYear, gistData, isFictional, pbaMode, state.leagueStats, sourcePortraitVersion, draftScope]);

  // Active NBA players — the comparison pool for findTopComparisons in the modal.
  const activePlayers = useMemo(() =>
      (pbaMode
      ? getPbaComparisonPool(scopedPlayers)
      : scopedPlayers.filter(p =>
          isPrimaryNbaComparisonCandidate(p) &&
          isOnRoster(p) &&
          p.status !== 'Draft Prospect' &&
          p.status !== 'Prospect' &&
          ((p as any).draft?.year ?? 0) < currentLeagueYear,
        )),
  [scopedPlayers, currentLeagueYear, pbaMode]);
  const batchComps = useMemo(
    () => batchComparisonsDeduped(prospects, activePlayers, 3, 3, pbaMode ? 'pba' : 'nba'),
    [prospects, activePlayers, pbaMode],
  );
  const draftOrder = useMemo(() => {
    if (pbaMode) {
      return buildPbaDraftOrderTeams((state as any).nonNBATeams ?? [], state.boxScores ?? [], currentLeagueYear, 0, state.draftPicks);
    }
    if (draftYear !== currentLeagueYear) {
      return [...state.teams]
        .filter(t => t.id >= 0 && t.id < 100)
        .sort((a, b) => {
          const wa = a.wins / Math.max(1, a.wins + a.losses);
          const wb = b.wins / Math.max(1, b.wins + b.losses);
          return wa - wb;
        })
        .flatMap(t => [t, t]);
    }
    const draftPicks: any[] = (state as any).draftPicks ?? [];
    const eligibleTeams = state.teams.filter(t => t.id >= 0 && t.id < 100);
    const allSorted = [...eligibleTeams].sort((a, b) => {
      const wa = a.wins / Math.max(1, a.wins + a.losses);
      const wb = b.wins / Math.max(1, b.wins + b.losses);
      return wa - wb;
    });
    const slotMap = buildFullDraftSlotMap(state.draftLotteryResult as any, state.teams);
    let r1Source: any[];
    if (slotMap.size > 0) {
      const ordered = eligibleTeams
        .filter(t => slotMap.has(t.id))
        .sort((a, b) => (slotMap.get(a.id)! - slotMap.get(b.id)!));
      const missing = allSorted.filter(t => !slotMap.has(t.id));
      r1Source = [...ordered, ...missing];
    } else {
      r1Source = allSorted;
    }
    const resolveOwner = (round: number, originalTeam: any) => {
      const pick = draftPicks.find(p => p.season === draftYear && p.round === round && p.originalTid === originalTeam.id);
      const meta = {
        _originalTid: originalTeam.id,
        _originalAbbrev: originalTeam.abbrev,
        _originalName: originalTeam.name,
      };
      if (!pick || pick.tid === originalTeam.id) return { ...originalTeam, ...meta, _traded: false };
      const newOwner = state.teams.find(t => t.id === pick.tid);
      if (!newOwner) return { ...originalTeam, ...meta, _traded: false };
      return { ...newOwner, ...meta, _traded: true };
    };
    const r1 = r1Source.map(t => resolveOwner(1, t));
    const r2 = r1Source.map(t => ({ ...resolveOwner(2, t), _r2: true }));
    return [...r1, ...r2];
  }, [pbaMode, state.teams, state.nonNBATeams, state.boxScores, state.draftLotteryResult, (state as any).draftPicks, draftYear, currentLeagueYear]);
  const prospectsHash = useMemo(
    () => prospects.map(p => `${p.internalId}:${p.displayOvr}:${p.displayPot}:${p.imgURL ?? ''}`).join('|'),
    [prospects],
  );
  const teamsHash = useMemo(
    () => (pbaMode
      ? (state.nonNBATeams ?? []).filter((t: any) => t.league === 'PBA').map((t: any) => `${t.tid}:${t.wins ?? 0}:${t.losses ?? 0}`).join('|')
      : state.teams.map(t => `${t.id}:${t.wins}:${t.losses}`).join('|')),
    [state.teams, state.nonNBATeams, pbaMode],
  );
  const draftOrderHash = useMemo(
    () => draftOrder.map((t: any) => `${t?.id}:${t?._traded ? 'T' : 'O'}`).join('|'),
    [draftOrder],
  );

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);
  const mockDraft = useMemo(() => {
    if (prospects.length === 0 || draftOrder.length === 0) return [];
    return buildMockDraft({
      prospects,
      draftOrder,
      allTeams: pbaMode
        ? buildPbaDraftOrderTeams((state as any).nonNBATeams ?? [], state.boxScores ?? [], currentLeagueYear, 0, state.draftPicks)
        : state.teams,
      allPlayers: scopedPlayers,
      leagueStats: state.leagueStats,
      thresholds,
      gameMode: state.gameMode,
      userTeamId: state.userTeamId ?? null,
      currentYear: currentLeagueYear,
    });
  }, [draftOrderHash, draftYear, prospectsHash, scopedPlayers, teamsHash]);
  const skillTopSet = useMemo(() => {
    if (!skillFilter) return null;
    const scored = prospects.map(p => ({
      id: p.internalId,
      score: computeSkillScores(p)[skillFilter],
    }));
    scored.sort((a, b) => b.score - a.score);
    const cut = Math.max(1, Math.ceil(scored.length / 3));
    return new Set(scored.slice(0, cut).map(s => s.id));
  }, [skillFilter, prospects]);
  const isFilterActive = !!searchTerm || posFilter !== 'All' || !!skillFilter;
  const matchesHighlight = (p: NBAPlayer | null): boolean => {
    if (!p) return false;
    if (!isFilterActive) return true;
    if (posFilter !== 'All' && !matchesPosFilter(p, posFilter)) return false;
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (skillTopSet && !skillTopSet.has(p.internalId)) return false;
    return true;
  };

  const hasRawProspects = prospects.length > 0;
  const draftedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of mockDraft) {
      if (slot.prospect?.internalId) {
        ids.add(slot.prospect.internalId);
      }
    }
    return ids;
  }, [mockDraft]);

  const undraftedProspects = useMemo(() =>
    prospects.filter(p => !draftedIds.has(p.internalId)),
    [prospects, draftedIds],
  );
  const handleProspectAction = (action: string) => {
    const player = actionsPlayer;
    if (!player) return;
    setActionsPlayer(null);
    if (action === 'view_bio') navigateToPlayer(player);
    else if (action === 'view_scouting') setScoutingPlayer(player);
    else if (action === 'contact_agent') {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingFreeAgentAgentContact: { playerId: player.internalId } },
      } as any);
      setCurrentView('Messages' as any);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      <div className="flex-shrink-0 bg-slate-950 border-b border-slate-800 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Target className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tight">Mock Draft</h1>
              <p className="text-sm text-slate-400">Projected pick by pick — select a prospect to view bio, scouting, or contact their agent</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2">
            <button
              onClick={() => setSelectedYear(y => Math.max(minYear, y - 1))}
              disabled={selectedYear <= minYear}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-black text-white px-2 min-w-[52px] text-center">{draftYear}</span>
            <button
              onClick={() => setSelectedYear(y => Math.min(maxYear, y + 1))}
              disabled={selectedYear >= maxYear}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Highlight prospects by name…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
            />
          </div>
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {POS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setPosFilter(f)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
                  posFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 mr-1">Highlight skill</span>
          {SKILL_AXES.map(skill => (
            <button
              key={skill}
              onClick={() => setSkillFilter(s => (s === skill ? null : skill))}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md border transition-all ${
                skillFilter === skill
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {skill}
            </button>
          ))}
          {skillFilter && (
            <button
              onClick={() => setSkillFilter(null)}
              className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
            >
              clear
            </button>
          )}
        </div>

      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {!hasRawProspects ? (
          pbaMode ? (
            <div className="text-center p-12 text-slate-400 space-y-2">
              <p className="text-base font-bold text-white">No PBA draft prospects are available for the {draftYear} class yet.</p>
              <p className="text-sm">Eligible local prospects will appear here once they enter the draft pool.</p>
            </div>
          ) : null
        ) : mockDraft.length === 0 && undraftedProspects.length === 0 ? (
          <div className="text-center p-12 text-slate-400">
            <p className="text-sm">Draft order isn't available for the {draftYear} class yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {mockDraft.length > 0 && (
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3 px-1">Projected Picks</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {mockDraft.map(slot => {
                    const p = slot.prospect as MockProspect | null;
                    const team = slot.team;
                    const matched = matchesHighlight(p);
                    const dim = isFilterActive && !matched;
                    const displayOvr = p ? fuzzDraftRatingValue(p.displayOvr ?? 0, state, p as NBAPlayer, 'ovr') : null;
                    const displayPot = p ? Math.max(fuzzDraftRatingValue(p.displayPot ?? 0, state, p as NBAPlayer, 'pot'), displayOvr ?? 0) : null;
                    return (
                      <button
                        key={slot.pick}
                        data-testid={p ? 'draft-prospect-card' : undefined}
                        data-player-id={p?.internalId}
                        data-draft-year={draftYear}
                        onClick={() => p && setActionsPlayer(p)}
                        disabled={!p}
                        className={`group bg-[#1A1A1A] border border-[#333] rounded-sm flex h-20 overflow-hidden transition-all text-left ${
                          p ? 'cursor-pointer hover:border-indigo-600' : 'cursor-default'
                        } ${dim ? 'opacity-25' : 'opacity-100'} ${matched && isFilterActive && p ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.25)]' : ''}`}
                      >
                        <div className="w-11 flex items-center justify-center shrink-0 bg-indigo-900/60">
                          <span className="text-xl font-black text-white">{String(slot.pick).padStart(2, '0')}</span>
                        </div>

                        {/* Photo */}
                        <div className="w-20 bg-[#111] relative shrink-0 flex items-center justify-center">
                          {p ? (
                            <PlayerPortrait
                              imgUrl={p.imgURL || p.gistMatch?.headshot}
                              face={(p as any).face}
                              playerName={p.name}
                              playerIdentity={p}
                              portraitSeason={draftYear}
                              isDraftProspect
                              size={56}
                            />
                          ) : (
                            <span className="text-white/15 text-2xl font-black">—</span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                          {p ? (
                            <>
                              <p className="font-black text-white text-base truncate uppercase tracking-tight">{p.name}</p>
                              <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex flex-wrap items-center gap-1">
                                <span>{p.pos}</span>
                                <span className="text-white/20">·</span>
                                <span>{p.derivedAge}y</span>
                                <span className="text-white/20">·</span>
                                <span className="text-indigo-300">OVR {displayOvr}</span>
                                <span className="text-white/20">·</span>
                                <span className="text-emerald-400/70">POT {displayPot}</span>
                                {prospectOrigin(p) && (
                                  <>
                                    <span className="text-white/20">·</span>
                                    <span className="truncate">{prospectOrigin(p)}</span>
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="font-black text-white/40 text-sm uppercase tracking-tight">Best Player Available</p>
                          )}
                        </div>

                        {/* Team logo + abbrev — shows current owner; "via ORIG" when traded */}
                        <div className="w-20 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors flex-col gap-0.5 py-1">
                          {team?.logoUrl ? (
                            <img src={team.logoUrl} alt="" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-[10px] font-black text-white/30">{team?.abbrev}</span>
                          )}
                          <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">{team?.abbrev}</span>
                          {(team as any)?._traded && (
                            <span className="text-[7px] font-bold text-indigo-400/70 uppercase tracking-wider">via {(team as any)._originalAbbrev}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Undrafted prospects */}
            {undraftedProspects.length > 0 && (
              <div>
                <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-3 px-1">Undrafted</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {undraftedProspects.map(p => {
                    const matched = matchesHighlight(p);
                    const dim = isFilterActive && !matched;
                    const displayOvr = fuzzDraftRatingValue(p.displayOvr ?? 0, state, p as NBAPlayer, 'ovr');
                    const displayPot = Math.max(fuzzDraftRatingValue(p.displayPot ?? 0, state, p as NBAPlayer, 'pot'), displayOvr);
                    return (
                      <button
                        key={p.internalId}
                        data-testid="draft-prospect-card"
                        data-player-id={p.internalId}
                        data-draft-year={draftYear}
                        onClick={() => setActionsPlayer(p)}
                        className={`group bg-[#1A1A1A] border border-[#333] rounded-sm flex h-20 overflow-hidden transition-all text-left cursor-pointer hover:border-slate-500 ${
                          dim ? 'opacity-25' : 'opacity-100'
                        } ${matched && isFilterActive ? 'border-amber-500/70 shadow-[0_0_14px_rgba(245,158,11,0.25)]' : ''}`}
                      >
                        {/* Rank placeholder */}
                        <div className="w-11 flex items-center justify-center shrink-0 bg-slate-800/40">
                          <span className="text-xs font-bold text-slate-400">—</span>
                        </div>

                        {/* Photo */}
                        <div className="w-20 bg-[#111] relative shrink-0 flex items-center justify-center">
                          <PlayerPortrait
                            imgUrl={p.imgURL || p.gistMatch?.headshot}
                            face={(p as any).face}
                            playerName={p.name}
                            playerIdentity={p}
                            portraitSeason={draftYear}
                            isDraftProspect
                            size={56}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                          <p className="font-black text-white text-base truncate uppercase tracking-tight">{p.name}</p>
                          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex flex-wrap items-center gap-1">
                            <span>{p.pos}</span>
                            <span className="text-white/20">·</span>
                            <span>{p.derivedAge}y</span>
                            <span className="text-white/20">·</span>
                            <span className="text-indigo-300">OVR {displayOvr}</span>
                            <span className="text-white/20">·</span>
                            <span className="text-emerald-400/70">POT {displayPot}</span>
                            {prospectOrigin(p) && (
                              <>
                                <span className="text-white/20">·</span>
                                <span className="truncate">{prospectOrigin(p)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* FA label */}
                        <div className="w-20 flex items-center justify-center shrink-0 border-l border-[#333] bg-black/20 group-hover:bg-black/40 transition-colors flex-col py-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">FA</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shared scouting modal */}
      {actionsPlayer && (
        <PlayerActionsModal
          player={actionsPlayer}
          context="draft-scouting"
          onClose={() => setActionsPlayer(null)}
          onActionSelect={handleProspectAction}
        />
      )}
      <DraftScoutingModal
        player={scoutingPlayer}
        onClose={() => setScoutingPlayer(null)}
        classProspects={prospects}
        activePlayers={activePlayers}
        draftYear={draftYear}
        gistData={scoutingPlayer?.gistMatch ?? null}
        ranks={scoutingPlayer ? {
          consensus: scoutingPlayer.consensusRank,
          espn: scoutingPlayer.espnRank,
          noCeilings: scoutingPlayer.noCeilingsRank,
        } : undefined}
        teamLogoUrl={(() => {
          if (!scoutingPlayer) return undefined;
          const slot = mockDraft.find(s => s.prospect?.internalId === scoutingPlayer.internalId);
          return (slot?.team as any)?.logoUrl;
        })()}
        onViewPlayerBio={navigateToPlayer}
        preComputedComps={scoutingPlayer ? batchComps.get(scoutingPlayer.internalId) : undefined}
        showCombineTab={showCombineTab}
      />
    </div>
  );
};
