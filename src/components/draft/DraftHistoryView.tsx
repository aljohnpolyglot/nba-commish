/**
 * DraftHistoryView.tsx
 * Shows historical draft class results with year-by-year chevron navigation.
 * Extracted from DraftSimulatorView for standalone access.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getPlayerImage } from '../central/view/bioCache';
import { MyFace, isRealFaceConfig } from '../shared/MyFace';
import { ensureNonNBAFetched, getNonNBAGistData } from '../central/view/nonNBACache';
import type { NBAPlayer } from '../../types';
import { isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';
import { getTeamFullName } from '../../utils/teamNames';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import {
  buildPbaDraftHistoryCardKey,
  ensurePbaDraftArchive,
  getCachedPbaDraftArchive,
  normalizePbaDraftPlayerName,
} from '../../services/pba/pbaDraftArchive';
import { resolvePbaDraftHistorySelection } from '../../services/pba/draftHistory';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../utils/scoutingFuzz';
import {
  buildNativeHistoricalPlayersThroughSeason,
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  ensurePortraitLookupsLoaded,
  getFullRosterPlayerForIdentity,
  getPhotoByPlayerIdentity,
} from '../../data/realPlayerDataFetcher';
import { getHistoricalNbaBranchSeasonCutoff } from '../../services/playerDevelopment/hofHistoryWindow';
import { normalizePlayerAwardType } from '../../utils/playerAwardNormalizer';
import { isExternalLeaguePlayer, isWnbaPlayerIdentity } from '../../utils/playerLeagueScope';
import { getPbaBranchStartSeason } from '../../services/pba/branchHistoryOwnership';
import { useLeagueLabels } from '../../utils/leagueLabels';
import { FullDraftTable } from './simulator/FullDraftTable';
import { buildLiveDraftHistoryState } from '../../services/draft/draftHistoryLiveState';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { isDraftHistoryLiveSession } from './draftHistoryVisibility';
import { getOpeningFantasyDraftHistoryYear } from '../../services/fantasyDraft/openingFantasyDraft';
import {
  buildDraftHistoryEvents,
  getDraftHistoryNavigationLabel,
  moveDraftHistoryEvent,
} from '../../services/draft/draftHistoryEvents';
import { resolveLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';
import {
  chooseDraftHistorySlotCandidate,
  isDraftHistoryTeam,
  resolveDraftHistoryTeam,
} from '../../services/draft/draftHistoryTeamProjection';

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

type DraftAchievementTier = { label: string; card: string; badge: string };

function DraftHistoryPortrait({ player, label, season }: { player: NBAPlayer; label: string; season: number }) {
  const [failed, setFailed] = useState(false);
  const image = failed ? undefined : getPlayerImage(player, { portraitSeason: season, isDraftProspect: false });
  if (image) {
    return <img src={image} alt={label} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  if (isRealFaceConfig(player.face)) {
    return <div className="relative w-full h-full"><div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={player.face} style={{ width: '100%', height: '100%' }} /></div></div>;
  }
  const initials = label.split(' ').map(part => part[0]).join('').slice(0, 2);
  return <div className="w-full h-full flex items-center justify-center text-lg font-black text-indigo-300/60">{initials}</div>;
}

function getDraftAchievementTier(player: any, pbaMode: boolean): DraftAchievementTier | null {
  const awards = (Array.isArray(player?.awards) ? player.awards : []).filter((award: any) => {
    const type = String(award?.type ?? '').trim();
    const competitionId = String(award?.competitionId ?? '').trim().toLowerCase();
    const source = String(award?.source ?? '').trim().toLowerCase();
    if (pbaMode) {
      return (!competitionId || competitionId.includes('pba'))
        && (!source || source.includes('pba'));
    }
    if (competitionId && !['nba', 'association'].includes(competitionId)) return false;
    return !/(g[\s-]?league|euro|endesa|acb|pba|b[\s.-]?league|cba|nbl|wnba|fiba|olympic)/i.test(`${type} ${source}`);
  });
  const hasExact = (...types: string[]) => awards.some((award: any) =>
    types.includes(normalizePlayerAwardType(award?.type)),
  );
  const hasText = (...tokens: string[]) => awards.some((award: any) => {
    const type = normalizePlayerAwardType(award?.type);
    return tokens.some(token => type.includes(token));
  });

  if (player?.hof) {
    return {
      label: 'HOF',
      card: 'border-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.28)]',
      badge: 'bg-amber-400/15 text-amber-200 border-amber-300/50',
    };
  }
  if (hasExact('MVP', 'Most Valuable Player')) {
    return {
      label: 'MVP',
      card: 'border-yellow-400/80 shadow-[0_0_16px_rgba(250,204,21,0.24)]',
      badge: 'bg-yellow-400/15 text-yellow-200 border-yellow-300/50',
    };
  }
  if (hasExact('Finals MVP')) {
    return {
      label: 'Finals MVP',
      card: 'border-orange-400/80 shadow-[0_0_16px_rgba(251,146,60,0.24)]',
      badge: 'bg-orange-400/15 text-orange-200 border-orange-300/50',
    };
  }
  if (hasExact('DPOY', 'Defensive Player of the Year')) {
    return {
      label: 'DPOY',
      card: 'border-sky-400/75 shadow-[0_0_14px_rgba(56,189,248,0.22)]',
      badge: 'bg-sky-400/15 text-sky-200 border-sky-300/50',
    };
  }
  if (hasText('All-NBA', 'All-League')) {
    return {
      label: 'All-NBA',
      card: 'border-violet-400/70 shadow-[0_0_14px_rgba(167,139,250,0.20)]',
      badge: 'bg-violet-400/15 text-violet-200 border-violet-300/45',
    };
  }
  if (hasExact('ROY', 'Rookie of the Year')) {
    return {
      label: 'Rookie of the Year',
      card: 'border-cyan-400/70 shadow-[0_0_14px_rgba(34,211,238,0.20)]',
      badge: 'bg-cyan-400/15 text-cyan-200 border-cyan-300/45',
    };
  }
  if (hasExact('All-Star')) {
    return {
      label: 'All-Star',
      card: 'border-emerald-400/65 shadow-[0_0_12px_rgba(52,211,153,0.18)]',
      badge: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/40',
    };
  }
  return null;
}

const DraftTeamBadge: React.FC<{
  logoUrl?: string;
  alt: string;
  fallback: string;
  dimmed?: boolean;
}> = ({ logoUrl, alt, fallback, dimmed = false }) => {
  const [failed, setFailed] = useState(false);
  const safeFallback = fallback?.trim() || '—';

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return (
      <span className={`text-[9px] font-black w-7 text-center ${dimmed ? 'text-white/30' : 'text-white/20'}`}>
        {safeFallback}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      className={`w-7 h-7 object-contain ${dimmed ? 'opacity-60' : ''}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
};

export const DraftHistoryView: React.FC = () => {
  const { state, navigateToPlayer } = useGame();
  const pbaMode = isPbaIsolatedMode(state);
  const wnbaMode = isWnbaIsolatedMode(state);
  const labels = useLeagueLabels();
  const isFictional = state.leagueType === 'fictional';
  const nonNBATeams = (state as any).nonNBATeams ?? [];
  const scopedPlayers = useMemo(
    () => wnbaMode
      ? state.players.filter(player => isWnbaPlayerIdentity(player))
      : isFictional
        ? state.players.filter(player => !isExternalLeaguePlayer(player))
        : state.players,
    [isFictional, state.players, wnbaMode],
  );

  // Load external bio gist caches
  const [nonNBACacheVer, setNonNBACacheVer] = useState(0);
  const [pbaDraftArchiveVer, setPbaDraftArchiveVer] = useState(0);
  const [historicalDraftPlayers, setHistoricalDraftPlayers] = useState<NBAPlayer[]>([]);
  const sourceBranchCutoff = getHistoricalNbaBranchSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const sourceDraftMaxYear = sourceBranchCutoff !== undefined
    ? sourceBranchCutoff - 1
    : state.leagueStats?.year ?? new Date().getFullYear();
  const leagueYear = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const maxVisibleDraftYear = leagueYear;
  useEffect(() => {
    if (isFictional || wnbaMode) return;
    Promise.all(Object.values(BIO_LEAGUE_MAP).map(ensureNonNBAFetched))
      .then(() => setNonNBACacheVer(v => v + 1));
  }, [isFictional, wnbaMode]);
  useEffect(() => {
    if (!pbaMode) return;
    ensurePbaDraftArchive().then(() => setPbaDraftArchiveVer(v => v + 1));
  }, [pbaMode]);
  useEffect(() => {
    let mounted = true;
    if (pbaMode || wnbaMode || isFictional) {
      setHistoricalDraftPlayers([]);
      return () => { mounted = false; };
    }
    Promise.all([
      ensurePortraitLookupsLoaded(),
      ensureNativeHistoricalStatsLoaded(),
      ensureFullRosterPlayerDataLoaded(),
    ]).then(() => {
      if (mounted) setHistoricalDraftPlayers(buildNativeHistoricalPlayersThroughSeason(sourceDraftMaxYear));
    }).catch(() => {});
    return () => { mounted = false; };
  }, [isFictional, pbaMode, sourceDraftMaxYear, wnbaMode]);

  const nbaTids = useMemo(() => new Set(state.teams.map(t => t.id)), [state.teams]);
  const pbaTids = useMemo(
    () => new Set(nonNBATeams.filter((team: any) => team.league === 'PBA').map((team: any) => Number(team.tid ?? team.id))),
    [nonNBATeams],
  );
  const activeDraftTids = pbaMode ? pbaTids : nbaTids;
  const teamsPerRound = pbaMode ? (pbaTids.size || 12) : wnbaMode || isFictional ? Math.max(1, nbaTids.size) : 30;
  const draftLabel = labels.draft;
  const pbaArchiveMaxYear = pbaMode
    ? getPbaBranchStartSeason(state) - 1
    : Number.MAX_SAFE_INTEGER;
  const pbaArchiveRows = useMemo(
    () => getCachedPbaDraftArchive().filter(row => row.draftYear <= pbaArchiveMaxYear),
    [pbaArchiveMaxYear, pbaDraftArchiveVer],
  );
  const playersByPbaName = useMemo(() => {
    const byName = new Map<string, NBAPlayer[]>();
    for (const player of scopedPlayers) {
      const key = normalizePbaDraftPlayerName(player.name);
      if (!key) continue;
      const list = byName.get(key) ?? [];
      list.push(player);
      byName.set(key, list);
    }
    return byName;
  }, [scopedPlayers]);

  const resolvePbaPlayerMatch = (normalizedName: string, draftYear: number) => {
    const matches = playersByPbaName.get(normalizedName) ?? [];
    if (matches.length <= 1) return matches[0] ?? null;
    return [...matches].sort((a, b) => {
      const aYear = Number((a as any).draft?.year ?? 0);
      const bYear = Number((b as any).draft?.year ?? 0);
      const aExact = aYear === draftYear ? 1 : 0;
      const bExact = bYear === draftYear ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aPba = a.status === 'PBA' ? 1 : 0;
      const bPba = b.status === 'PBA' ? 1 : 0;
      if (aPba !== bPba) return bPba - aPba;
      return ((b.stats?.length ?? 0) - (a.stats?.length ?? 0));
    })[0] ?? null;
  };

  const availableDraftYears = useMemo(() => {
    const years = new Set<number>();
    if (pbaMode && pbaArchiveRows.length > 0) {
      for (const row of pbaArchiveRows) years.add(row.draftYear);
    }
    for (const p of scopedPlayers) {
      const d = (p as any).draft;
      const pbaSelection = pbaMode ? resolvePbaDraftHistorySelection(p) : null;
      const draftTid = Number(pbaSelection?.tid ?? d?.tid);
      const isPbaDraft = p.status === 'PBA' || pbaTids.has(p.tid) || pbaTids.has(draftTid);
      if (!wnbaMode && isWnbaPlayerIdentity(p)) continue;
      if (pbaMode && !isPbaDraft) continue;
      if (!pbaMode && isPbaDraft) continue;
      if ((pbaSelection || d?.year) && (pbaSelection || (d?.round && d?.pick))) {
        const draftYear = Number(pbaSelection?.year ?? d.year);
        if (!pbaMode && draftYear > maxVisibleDraftYear) continue;
        const hasBranchDraft = pbaMode ? pbaSelection !== null : ((p as any).transactions ?? []).some((transaction: any) =>
          transaction?.type === 'draft' && Number(transaction?.season) === draftYear
        );
        if (
          !pbaMode
          && isExternalLeaguePlayer(p)
          && draftYear > sourceDraftMaxYear
          && !hasBranchDraft
        ) continue;
        const hasPbaSourceProvenance = !!p.historicalPbaSource || !!(p as any).pbaDraftSource;
        if (
          !pbaMode
          || draftYear <= pbaArchiveMaxYear
          || (hasBranchDraft && draftYear <= Number(state.leagueStats?.year ?? draftYear))
          || !hasPbaSourceProvenance
        ) years.add(draftYear);
        continue;
      }
      const league = !pbaMode ? BIO_LEAGUE_MAP[p.status ?? ''] : undefined;
      if (league) {
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed && parsed.year <= sourceDraftMaxYear && parsed.year <= maxVisibleDraftYear) years.add(parsed.year);
      }
    }
    if (!pbaMode && !wnbaMode) {
      for (const player of historicalDraftPlayers) {
        const year = Number(player.draft?.year ?? 0);
        if (year > 0 && year <= sourceDraftMaxYear) years.add(year);
      }
    }
    if (!pbaMode && isDraftHistoryLiveSession(state, leagueYear, leagueYear, false)) years.add(leagueYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [historicalDraftPlayers, leagueYear, maxVisibleDraftYear, nonNBACacheVer, pbaArchiveMaxYear, pbaArchiveRows, pbaMode, pbaTids, scopedPlayers, sourceDraftMaxYear, state, wnbaMode]);

  const defaultViewYear = availableDraftYears[0] ?? (state.leagueStats?.year ?? new Date().getFullYear());
  const [viewDraftYear, setViewDraftYear] = useState<number>(defaultViewYear);
  const openingFantasyActive = state.gameMode === 'gm' && ((state.leagueStats.openingRosterMode === 'fantasy_draft'
    && state.leagueStats.openingFantasyDraftCompleted !== true)
    || (state.leagueStats.fictionalRosterMode === 'fantasy_draft'
      && state.leagueStats.fictionalFantasyDraftCompleted !== true));
  const fantasyRecords = state.fantasyDraftHistory ?? [];
  const openingFantasyYear = getOpeningFantasyDraftHistoryYear(state.date, leagueYear);
  const historyEvents = useMemo(() => {
    const activeRecord = openingFantasyActive
      ? { season: openingFantasyYear, date: state.date, name: `${openingFantasyYear} Fantasy Draft`, format: 'Pending', picks: [] }
      : undefined;
    return buildDraftHistoryEvents(availableDraftYears, draftLabel, fantasyRecords, activeRecord);
  }, [availableDraftYears, draftLabel, fantasyRecords, openingFantasyActive, openingFantasyYear, state.date]);
  const [viewEventKey, setViewEventKey] = useState<string>(() => historyEvents.at(-1)?.key ?? `draft-${defaultViewYear}`);
  const selectedEvent = historyEvents.find(event => event.key === viewEventKey) ?? historyEvents.at(-1);
  const selectedFantasyRecord = selectedEvent?.kind === 'fantasy' ? selectedEvent.record : null;
  const previousEvent = moveDraftHistoryEvent(historyEvents, selectedEvent?.key ?? '', -1);
  const nextEvent = moveDraftHistoryEvent(historyEvents, selectedEvent?.key ?? '', 1);
  const pbaArchiveRowsForYear = useMemo(
    () => pbaMode ? pbaArchiveRows.filter(row => row.draftYear === viewDraftYear) : [],
    [pbaArchiveRows, pbaMode, viewDraftYear],
  );

  useEffect(() => {
    if (availableDraftYears.length > 0 && !availableDraftYears.includes(viewDraftYear)) {
      setViewDraftYear(availableDraftYears[0]);
    }
  }, [availableDraftYears]);

  useEffect(() => {
    if (!historyEvents.some(event => event.key === viewEventKey)) {
      setViewEventKey(historyEvents.at(-1)?.key ?? `draft-${defaultViewYear}`);
    }
  }, [defaultViewYear, historyEvents, viewEventKey]);

  useEffect(() => {
    if (selectedEvent?.kind === 'draft') setViewDraftYear(selectedEvent.season);
  }, [selectedEvent]);

  const draftClass = useMemo(() => {
    if (pbaMode && pbaArchiveRowsForYear.length > 0) {
      return pbaArchiveRowsForYear.map(row => {
        const matchedPlayer = resolvePbaPlayerMatch(row.normalizedPlayerName, row.draftYear);
        if (!matchedPlayer) {
          return {
            ...row,
            _slot: row.overallPick,
            _draftRound: row.round,
            _draftPick: row.pick,
            _matchedPlayer: null,
            _cardKey: buildPbaDraftHistoryCardKey(row),
            displayOvr: null,
            displayPot: null,
          };
        }

        const simYear = state.leagueStats?.year ?? new Date().getFullYear();
        const archiveOnly = (matchedPlayer as any).historicalPbaArchiveOnly === true;
        const displayOvr = archiveOnly ? null : getScoutedDisplayOverall(state, matchedPlayer, simYear);
        const displayPot = archiveOnly ? null : getScoutedDisplayPotential(state, matchedPlayer, simYear, simYear);
        return {
          ...row,
          ...matchedPlayer,
          _slot: row.overallPick,
          _draftRound: row.round,
          _draftPick: row.pick,
          _matchedPlayer: matchedPlayer,
          _cardKey: buildPbaDraftHistoryCardKey(row, matchedPlayer.internalId),
          _pbaDraftTeamName: row.draftedTeam,
          displayOvr,
          displayPot,
        };
      });
    }

    const candidates: any[] = [];
    const candidatePlayers = pbaMode || wnbaMode ? scopedPlayers : [...scopedPlayers, ...historicalDraftPlayers];
    const savePlayerRefs = new Set(scopedPlayers);
    for (const p of candidatePlayers) {
      const d = (p as any).draft;
      const pbaSelection = pbaMode ? resolvePbaDraftHistorySelection(p) : null;
      const draftTid = Number(pbaSelection?.tid ?? d?.tid);
      const isPbaDraft = p.status === 'PBA' || pbaTids.has(p.tid) || pbaTids.has(draftTid);
      if (!wnbaMode && isWnbaPlayerIdentity(p)) continue;
      if (pbaMode && !isPbaDraft) continue;
      if (!pbaMode && isPbaDraft) continue;
      let dYear  = pbaSelection?.year ?? (d?.year ? Number(d.year) : null);
      let dRound = pbaSelection?.round ?? (d?.round ? Number(d.round) : null);
      let dPick  = pbaSelection?.pick ?? (d?.pick ? Number(d.pick) : null);
      let bioDraftTeamName: string | undefined;
      if (!pbaMode && (!dRound || !dPick) && BIO_LEAGUE_MAP[p.status ?? '']) {
        const league = BIO_LEAGUE_MAP[p.status ?? ''];
        const cached = getNonNBAGistData(league, p.name);
        const parsed = parseBioDraftStr(cached?.d);
        if (parsed) {
          dYear = parsed.year; dRound = parsed.round; dPick = parsed.pick;
          bioDraftTeamName = parsed.team;
        }
      }
      if (!dYear || dYear !== viewDraftYear) continue;
      if (!dRound || !dPick) continue;
      const hasBranchDraft = pbaMode ? pbaSelection !== null : ((p as any).transactions ?? []).some((transaction: any) =>
        transaction?.type === 'draft' && Number(transaction?.season) === dYear
      );
      const hasPbaSourceProvenance = !!p.historicalPbaSource || !!(p as any).pbaDraftSource;
      if (
        pbaMode
        && hasPbaSourceProvenance
        && dYear > pbaArchiveMaxYear
        && !(hasBranchDraft && dYear <= Number(state.leagueStats?.year ?? dYear))
      ) continue;
      const isOnActiveTeam = activeDraftTids.has(p.tid);
      const isExternalDrafted = !isFictional
        && !pbaMode
        && dYear <= sourceDraftMaxYear
        && !!BIO_LEAGUE_MAP[p.status ?? '']
        && !!dRound
        && !!dPick;
      const isFreeAgentDraftee = p.tid === -1 && dYear === viewDraftYear && !!dRound && !!dPick;
      const isSaveResident = savePlayerRefs.has(p);
      const isSourceHistoricalDraftee = !pbaMode && !isSaveResident && dYear <= sourceDraftMaxYear;
      const isRetiredHistoricalDraftee = !pbaMode && (p.status === 'Retired' || p.tid === -3) && dYear <= sourceDraftMaxYear;
      if (!isOnActiveTeam && !isExternalDrafted && !isFreeAgentDraftee && !isSourceHistoricalDraftee && !isRetiredHistoricalDraftee) continue;
      const sourcePlayer = pbaMode || wnbaMode ? null : getFullRosterPlayerForIdentity({
        srID: p.srID,
        slug: p.slug,
        name: p.name,
      });
      const sourcePortrait = pbaMode || wnbaMode ? null : sourcePlayer?.imgURL ?? getPhotoByPlayerIdentity({
        srID: p.srID,
        slug: p.slug,
        name: p.name,
      });
      candidates.push({
        ...p,
        imgURL: p.imgURL ?? sourcePortrait ?? undefined,
        _draftRound: dRound,
        _draftPick: dPick,
        _bioDraftTeamName: bioDraftTeamName,
        _saveResident: isSaveResident,
        _sourceHistorical: isSourceHistoricalDraftee,
      });
    }
    const bySlot = new Map<number, any>();
    for (const p of candidates) {
      const slot = ((p._draftRound - 1) * teamsPerRound) + p._draftPick;
      bySlot.set(slot, chooseDraftHistorySlotCandidate(bySlot.get(slot), p));
    }
    return Array.from(bySlot.entries())
      .sort(([a], [b]) => a - b)
      .map(([slot, p]) => {
        const simYear = state.leagueStats?.year ?? new Date().getFullYear();
        const displayOvr = p._sourceHistorical ? null : getScoutedDisplayOverall(state, p, simYear);
        const displayPot = p._sourceHistorical ? null : getScoutedDisplayPotential(state, p, simYear, simYear);
        return { ...p, _slot: slot, displayOvr, displayPot };
      });
  }, [activeDraftTids, historicalDraftPlayers, isFictional, nonNBACacheVer, pbaArchiveMaxYear, pbaArchiveRowsForYear, pbaMode, pbaTids, scopedPlayers, sourceDraftMaxYear, state.leagueStats?.year, teamsPerRound, viewDraftYear, wnbaMode]);

  const liveDraft = useMemo(
    () => isDraftHistoryLiveSession(state, viewDraftYear, leagueYear, pbaMode)
      ? buildLiveDraftHistoryState(state, draftClass, viewDraftYear, leagueYear, pbaMode)
      : null,
    [draftClass, leagueYear, pbaMode, state, viewDraftYear],
  );
  const isCurrentUnheldDraft = viewDraftYear === leagueYear
    && resolveLeagueSeasonLifecycle(state).draft.draft !== 'complete'
    && !liveDraft
    && !selectedFantasyRecord;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="border-b border-[#333] pb-2 mb-4 flex items-center justify-between">
        <h4 className="text-xl font-black text-white uppercase tracking-tight">{selectedEvent?.label ?? `${viewDraftYear} ${draftLabel}`} Results</h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-white/30 uppercase">{selectedFantasyRecord ? selectedFantasyRecord.picks.length : draftClass.length} picks</span>
          {historyEvents.length > 1 && (
            <div className="flex items-center gap-1 bg-black/40 border border-[#333] rounded-md p-0.5">
              <button
                onClick={() => previousEvent && setViewEventKey(previousEvent.key)}
                disabled={!previousEvent}
                aria-label="Previous draft event"
                className="p-1 text-white/50 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-12 px-1 text-center text-[10px] font-black text-white/60">{getDraftHistoryNavigationLabel(selectedEvent)}</span>
              <button
                onClick={() => nextEvent && setViewEventKey(nextEvent.key)}
                disabled={!nextEvent}
                aria-label="Next draft event"
                className="p-1 text-white/50 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedFantasyRecord ? (
        selectedFantasyRecord.picks.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 py-12 text-center text-sm text-slate-400">This fantasy draft is in progress.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {selectedFantasyRecord.picks.map(pick => {
              const player = state.players.find(candidate => candidate.internalId === pick.playerId);
              const team = resolveDraftHistoryTeam(pick.teamId, state.teams, nonNBATeams);
              const image = player ? getPlayerImage(player) : undefined;
              return (
                <button
                  key={`${pick.pick}-${pick.playerId}`}
                  onClick={() => player && navigateToPlayer(player)}
                  className="flex h-16 overflow-hidden rounded-sm border border-violet-400/40 bg-gradient-to-r from-violet-950/45 to-[#1A1A1A] text-left transition-colors hover:border-amber-400/70"
                >
                  <span className="flex w-10 shrink-0 items-center justify-center bg-violet-700/60 text-base font-black text-white">{String(pick.pick).padStart(2, '0')}</span>
                  <span className="h-full w-16 shrink-0 bg-[#111]">
                    {image && <img src={image} alt={player?.name ?? 'Draft selection'} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center px-2">
                    <span className="truncate text-sm font-black uppercase text-white">{player?.name ?? pick.playerId}</span>
                    <span className="truncate text-[10px] font-bold uppercase text-white/40">
                      {player ? normalizePositionLabel(player.pos, player.hgt) : '—'} · R{pick.round} #{pick.pick}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center border-l border-violet-300/15 bg-black/20 px-2">
                    <DraftTeamBadge
                      logoUrl={team ? getResolvedTeamLogoUrl(team, selectedFantasyRecord?.season ?? leagueYear) : undefined}
                      alt={team ? getTeamFullName(team) : 'Fantasy draft team'}
                      fallback={team?.abbrev ?? '—'}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : liveDraft ? (
        <FullDraftTable
          drafted={liveDraft.drafted}
          passedPicks={liveDraft.passed}
          draftOrder={liveDraft.draftOrder}
          onReview={navigateToPlayer}
          currentPick={liveDraft.currentPick}
          userTeamId={state.userTeamId ?? null}
          isGM={state.gameMode === 'gm'}
        />
      ) : isCurrentUnheldDraft ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 py-12 text-center">
          <div className="text-sm font-black uppercase tracking-widest text-white">The {viewDraftYear} draft has not started</div>
          <div className="mt-2 text-xs text-slate-500">Completed selections will appear here after the draft begins.</div>
        </div>
      ) : draftClass.length === 0 ? (
        <div className="text-center text-white/40 py-12 text-sm">No draft data available for {viewDraftYear}.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {draftClass.map((player: any) => {
            const matchedPlayer = player._matchedPlayer ?? player;
            let drafteeTeam = resolveDraftHistoryTeam(player.draft?.tid, state.teams, nonNBATeams);
            if (pbaMode && player._pbaDraftTeamName) {
              const needle = String(player._pbaDraftTeamName).toLowerCase();
              const pbaDraftTeam = nonNBATeams.find((team: any) =>
                team.league === 'PBA' && (
                  needle.includes(String(team.name ?? '').toLowerCase()) ||
                  String(team.name ?? '').toLowerCase().includes(needle) ||
                  needle.includes(String(team.region ?? '').toLowerCase())
                )
              );
              drafteeTeam = isDraftHistoryTeam(pbaDraftTeam) ? pbaDraftTeam : drafteeTeam;
            }
            if (!drafteeTeam && player._bioDraftTeamName) {
              const needle = player._bioDraftTeamName.toLowerCase();
              const bioDraftTeam = state.teams.find(t =>
                needle.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(needle) ||
                needle.includes((t as any).region?.toLowerCase?.() ?? '')
              );
              drafteeTeam = isDraftHistoryTeam(bioDraftTeam) ? bioDraftTeam : null;
            }
            if (!drafteeTeam && player.draftAbbrev) {
              const abbrev = String(player.draftAbbrev).toUpperCase();
              const abbrevDraftTeam = [...state.teams, ...(state.teamArchive ?? [])].find((team: any) =>
                String(team?.abbrev ?? '').toUpperCase() === abbrev
                || (team?.identitySeasons ?? []).some((identity: any) => String(identity?.abbrev ?? '').toUpperCase() === abbrev),
              );
              drafteeTeam = isDraftHistoryTeam(abbrevDraftTeam) ? abbrevDraftTeam : null;
            }
            const currentTeam = resolveDraftHistoryTeam(matchedPlayer.tid, state.teams, nonNBATeams);
            const currentTeamLogoUrl: string | undefined = currentTeam
              ? getResolvedTeamLogoUrl(currentTeam, leagueYear) || undefined
              : undefined;
            const currentTeamId = currentTeam ? Number('id' in currentTeam ? currentTeam.id : currentTeam.tid) : null;
            const drafteeTeamId = drafteeTeam ? Number('id' in drafteeTeam ? drafteeTeam.id : drafteeTeam.tid) : null;
            const currentTeamIsDraftee = currentTeamId !== null && currentTeamId === drafteeTeamId;
            const dRound = player._draftRound ?? player.draft?.round;
            const dPick  = player._draftPick  ?? player.draft?.pick;
            const canOpenBio = !!player._matchedPlayer || !!player.internalId;
            const achievement = getDraftAchievementTier(matchedPlayer, pbaMode);
            return (
              <div
                key={player._cardKey ?? player.internalId}
                onClick={() => canOpenBio && navigateToPlayer(matchedPlayer as NBAPlayer)}
                className={`bg-[#1A1A1A] border rounded-sm flex h-16 overflow-hidden transition-colors ${
                  achievement?.card ?? 'border-[#333]'
                } ${
                  canOpenBio ? (achievement ? 'cursor-pointer hover:border-white/40' : 'cursor-pointer hover:border-indigo-600/50') : ''
                }`}
              >
                <div className="w-10 bg-indigo-900/60 flex items-center justify-center shrink-0">
                  <span className="text-base font-black text-white">{String(player._slot).padStart(2, '0')}</span>
                </div>
                <div className="w-16 bg-[#111] relative shrink-0 overflow-hidden">
                  <DraftHistoryPortrait player={matchedPlayer} label={player.playerName ?? matchedPlayer.name ?? ''} season={viewDraftYear} />
                </div>
                <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-black text-white text-sm truncate uppercase tracking-tight">{player.playerName ?? matchedPlayer.name}</p>
                    {BIO_LEAGUE_MAP[matchedPlayer.status ?? ''] && (
                      <span className="text-[8px] font-black text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap shrink-0">
                        {matchedPlayer.status}
                      </span>
                    )}
                    {achievement && (
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap shrink-0 border ${achievement.badge}`}>
                        {achievement.label}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-white/40 uppercase">
                    {player.pos ?? matchedPlayer.pos ?? '—'}
                    {typeof player.displayOvr === 'number' && typeof player.displayPot === 'number'
                      ? ` · OVR ${player.displayOvr} | POT ${player.displayPot}`
                      : ''}
                    {dRound != null
                      ? ` · R${dRound} #${dPick ?? '—'}`
                      : ` · #${dPick ?? player._slot}`}
                    {player.schoolClubTeam ? ` · ${player.schoolClubTeam}` : ''}
                  </div>
                </div>
                <div className="flex items-center shrink-0 border-l border-[#333] bg-black/20 px-1 gap-1">
                  <DraftTeamBadge
                    logoUrl={drafteeTeam ? getResolvedTeamLogoUrl(drafteeTeam, viewDraftYear) : undefined}
                    alt={drafteeTeam ? getTeamFullName(drafteeTeam) : 'Draft team'}
                    fallback={drafteeTeam?.abbrev ?? '—'}
                  />
                  {!currentTeamIsDraftee && currentTeam && (
                    <DraftTeamBadge
                      logoUrl={currentTeamLogoUrl}
                      alt={currentTeam?.name ?? 'Current team'}
                      fallback={currentTeam?.abbrev ?? '—'}
                      dimmed
                    />
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
