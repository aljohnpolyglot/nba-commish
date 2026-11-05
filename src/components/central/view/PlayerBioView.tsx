import React, { useState, useEffect, useMemo } from 'react';
import { NBAPlayer, Game } from '../../../types';
import { ArrowLeft, Ellipsis, Loader2 } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { AwardsView } from './AwardsView';
import { PlayerBioHero } from './PlayerBioHero';
import { TabBar } from '../../shared/ui/TabBar';
import { PlayerBioStatsHistory } from './PlayerBioStatsHistory';
import { PlayerBioOverviewTab } from './PlayerBioOverviewTab';
import { PlayerBioJerseyHistoryTab } from './PlayerBioJerseyHistoryTab';
import { PlayerBioGameLogTab } from './PlayerBioGameLogTab';
import { PlayerBioRatingsTab } from './PlayerBioRatingsTab';
import { PlayerBioContractTab } from './PlayerBioContractTab';
import { PlayerBioTransactionsTab } from './PlayerBioTransactionsTab';
import { TradeDetailView } from './TradeDetailView';
import type { TradeEntry } from './TradeDetailTypes';
import { PlayerBioInjuriesTab } from './PlayerBioInjuriesTab';
import { PlayerBioMoraleTab } from './PlayerBioMoraleTab';
import { PlayerBioFamilyTreeTab } from './PlayerBioFamilyTreeTab';
import { findCollegeTeamProfile, getCollegeTeamLabel } from '../../../services/collegeTeamCatalog';
import { getPhilippineCollegeLabel } from '../../../services/pba/collegeIdentity';
import { getProspectCollege, getProspectPreDraftClub, isDraftProspectLike } from '../../../utils/prospectUtils';
import { filterAwardsToVisibleTimeline, getExternalPlayerAwardLabel, scopeExternalPlayerAwardCompetition, scopeExternalPlayerAwards } from '../../../utils/awardHistory';
import { mergeNormalizedPlayerAwards, normalizePlayerAwardType } from '../../../utils/playerAwardNormalizer';
import { getHistoricalContestAwardsForPlayer } from '../../../data/allStarContestWinners';
import { getHistoricalNbaBranchSeasonCutoff, getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { isFamilyRelationVisible, resolveFamilyRelative } from '../../../utils/familyTies';
import { getPlayerImage, isLowQualityPlayerPortrait } from '../../../utils/playerImage';
import { isExternalLeagueStatus } from '../../../constants';
import { getPbaDraftBioLabel } from '../../../services/pba/pbaDraftArchive';
import { getTeamFullName } from '../../../utils/teamNames';
import {
  getCompetitionSourceAwardsForPlayer,
  loadCompetitionAwardCatalog,
} from '../../../services/competition/competitionAwardHistory';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import { getPlayerBioNbaSourceAwards } from './playerBioCrossLeagueHistory';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';

interface PlayerBioViewProps {
  player: NBAPlayer;
  onBack: () => void;
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

import { fetchWithDedup, getNonNBABioData } from './bioCache';
import { ensureNonNBAFetched, getNonNBAGistData } from './nonNBACache';
import { mergePlayerCareer } from '../../../utils/playerCareerMerge';
import { extractNbaId, getPlayerAgeReferenceYear } from '../../../utils/helpers';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { isEuroIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { getConferenceSpec, type PbaConference } from '../../../services/pba/conferenceTransition';
import { buildHeroStatsFromSave, filterCurrentPbaImportedStats, isPbaCareerPlayer } from './playerBioStatsFilters';
import { isSourceOnlyHistoricalPlayer } from '../../../utils/historicalTimeline';
import { getPlayerNationalityCountries } from '../../../utils/playerNationality';
import { isEuroBasketCountry } from '../../../services/fiba/countryIdentity';
import {
  ensureBiosLoaded,
  ensureFullRosterPlayerDataLoaded,
  ensurePortraitLookupsLoaded,
  getBioBySlug,
  getExplicitFullRosterNationalityForIdentity,
  getFullRosterAwardsForIdentity,
  fmtHeight,
} from '../../../data/realPlayerDataFetcher';
import { getCanonicalEuroStatCompetitionId } from '../../../services/euro/statsArchive';
import { getPbaNationalityFallback } from './playerBiosPbaScope';
import {
  getPreloadedCompetitionAwards,
  getPreloadedExternalPlayers,
  getPreloadedExternalTeams,
} from '../../../services/playerBioPreload';
import { loadNbaEraPortraitCatalog } from '../../../services/nbaEraPortraitCatalog';
import { resolvePlayerBioPrimaryTeam } from './playerBioTeamIdentity';
import { resolveCanonicalPersonId, sameCanonicalPlayerIdentity } from '../../../utils/playerIdentity';
import { isCompatibleExternalNbaCareerIdentity } from '../../../services/playerUniverse/canonicalNbaCareerHydration';
import {
  canExternalBiographySupplyDraft,
  canExternalBiographySupplySchool,
  getVerifiedPlayerBioDraftLabel,
  hasVerifiedDraftSelection,
} from './playerBioExternalBiographyPolicy';
import { hydrateCanonicalSourceBiography } from '../../../services/playerUniverse/realGmBiographyContinuity';

// Request queue — max 1 concurrent fetch to avoid AllOrigins rate limits
const MAX_CONCURRENT = 1;

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getBioPlayerSlug(player: NBAPlayer): string {
  return String((player as any).slug ?? player.srID ?? '').trim().toLowerCase();
}

function sameBioIdentity(left: NBAPlayer, right: NBAPlayer): boolean {
  const leftBorn = Number(left.born?.year ?? 0);
  const rightBorn = Number(right.born?.year ?? 0);
  if (leftBorn > 0 && rightBorn > 0 && Math.abs(leftBorn - rightBorn) > 1) return false;

  const leftDraft = Number(left.draft?.year ?? 0);
  const rightDraft = Number(right.draft?.year ?? 0);
  if (leftDraft > 0 && rightDraft > 0 && leftDraft !== rightDraft) return false;

  return true;
}

function resolveCanonicalBioPlayer(input: NBAPlayer, players: readonly NBAPlayer[]): NBAPlayer {
  const slug = getBioPlayerSlug(input);
  const matches = players.filter(player => (
    player.internalId === input.internalId
    || sameCanonicalPlayerIdentity(input, player)
    || isCompatibleExternalNbaCareerIdentity(input, player)
    || (!!slug && getBioPlayerSlug(player) === slug && sameBioIdentity(input, player))
  ));
  if (matches.length === 0) return input;
  if (matches.length === 1 && !isSourceOnlyHistoricalPlayer(matches[0])) return matches[0];

  const score = (player: NBAPlayer): number => (
    (isSourceOnlyHistoricalPlayer(player) ? 0 : 100_000)
    + (player.tid >= 0 ? 40_000 : 0)
    + ((player as any).externalArchiveOnly === true ? 20_000 : 0)
    + (player.status === 'Retired' ? 0 : 10_000)
    + (player.ratings?.length ?? 0) * 100
    + (player.stats?.length ?? 0) * 10
    + (player.awards?.length ?? 0)
  );
  const sorted = [...matches].sort((left, right) => score(right) - score(left));
  return sorted.slice(1).reduce(
    (canonical, history) => mergePlayerCareer(canonical, history),
    sorted[0] ?? input,
  );
}

function deepGet(obj: any, ...paths: string[][]): any {
  for (const path of paths) {
    try {
      let cur = obj;
      for (const key of path) { cur = cur[key]; if (cur == null) break; }
      if (cur != null) return cur;
    } catch (_) {}
  }
  return null;
}

const buildHeroStatsFromBoxScores = (
  playerId: string,
  season: number,
  boxScores: any[] | undefined,
  schedule: Game[] | undefined,
  playoffs: any,
  nbaCup: any,
  nbaCupHistory: any,
  leagueStats?: { uiMode?: string | null },
  competitionId?: string,
) => {
  const finite = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const rebounds = (line: any): number => {
    const direct = Number(line?.reb ?? line?.trb);
    return Number.isFinite(direct) ? direct : finite(line?.orb) + finite(line?.drb);
  };
  let gp = 0;
  let pts = 0;
  let trb = 0;
  let ast = 0;
  let stl = 0;
  let blk = 0;

  for (const box of boxScores ?? []) {
    const meta = classifyBoxScoreGame(box as any, schedule ?? [], playoffs, nbaCup, nbaCupHistory, season, leagueStats);
    if (meta.seasonYear !== season || meta.isPreseason || meta.isPlayoff || meta.isPlayIn || meta.isCupFinal || meta.isAllStar || (box as any).isExhibition) {
      continue;
    }
    if (
      competitionId
      && getCanonicalEuroStatCompetitionId(box as any) !== competitionId
    ) continue;

    const phase = String((box as any).competitionPhase ?? '').toLowerCase();
    if (['play-in', 'qf', 'quarterfinals', 'sf', 'semifinals', 'final', 'final-four'].includes(phase)) {
      continue;
    }

    const line = [...((box as any).homeStats ?? []), ...((box as any).awayStats ?? [])]
      .find((stat: any) => stat.playerId === playerId);
    if (!line) continue;

    gp += 1;
    pts += finite(line.pts);
    trb += rebounds(line);
    ast += finite(line.ast);
    stl += finite(line.stl);
    blk += finite(line.blk);
  }

  if (gp <= 0) return null;

  return {
    PTS: (pts / gp).toFixed(1),
    REB: (trb / gp).toFixed(1),
    AST: (ast / gp).toFixed(1),
    STL: (stl / gp).toFixed(1),
    BLK: (blk / gp).toFixed(1),
    GP: gp,
    fromSeason: true,
  };
};

function calcAge(birthStr: string, currentYear: number): { label: string; age: string } {
  const bD = new Date(birthStr);
  let age  = currentYear - bD.getFullYear();
  // We don't have a precise sim date anymore, so we'll just use the year difference
  // or a default month/day if we want to be fancy.
  return {
    label: bD.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    age:   `${age} years`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bulletList(items: Array<string | null | undefined>): string {
  return items
    .filter((item): item is string => !!item && item.trim().length > 0)
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');
}

function formatStoredBirthdate(born: NBAPlayer['born']): string {
  if (!born?.year) return 'Unknown';
  if (!born.month || !born.day) return String(born.year);
  return new Date(Date.UTC(born.year, born.month - 1, born.day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getFiniteSeason(value: unknown): number | null {
  const season = Number(value);
  return Number.isFinite(season) && season > 0 ? season : null;
}

function isHallOfFameAward(type: string | undefined): boolean {
  return /hall\s+of\s+fame/i.test(String(type ?? ''));
}


// ─────────────────────────────────────────────────────────────────────────────
// CACHE VALIDITY
// A cache entry is only trusted if it actually has bio text.
// Birthdate/country alone (from old partial fetches) is NOT a valid hit.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CORE FETCH  (pure async — shared by prefetch + component)
// ────

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATED FETCH WRAPPER
// Both prefetch() and the component call this so only one HTTP request fires
// per player regardless of how many callers are waiting.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PREFETCH API
//
// Call from your roster/player-list component to warm the cache for visible
// players before the user taps through. Import like:
//
//   import { prefetchPlayerBio } from './PlayerBioView';
//
//   useEffect(() => {
//     visiblePlayers.slice(0, 10).forEach(p => prefetchPlayerBio(p));
//   }, [visiblePlayers]);
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PlayerBioView: React.FC<PlayerBioViewProps> = ({ player: playerInput, onBack, onGameClick, onTeamClick }) => {
  const { state, navigationRoute, navigateToPlayer } = useGame();
  const quickActions = usePlayerQuickActions();
  const isFictional = state.leagueType === 'fictional';
  const preloadedExternalPlayers = getPreloadedExternalPlayers(state.saveId);
  const preloadedExternalTeams = getPreloadedExternalTeams(state.saveId);
  const canonicalPlayer = useMemo(
    () => resolveCanonicalBioPlayer(
      playerInput,
      [...state.players, ...preloadedExternalPlayers] as NBAPlayer[],
    ),
    [playerInput, preloadedExternalPlayers, state.players],
  );
  const player = useMemo(
    () => hydrateCanonicalSourceBiography(canonicalPlayer),
    [canonicalPlayer],
  );
  const canonicalPersonId = resolveCanonicalPersonId(player);
  useEffect(() => {
    if (!state.saveId) return;
    if (navigationRoute?.kind === 'player' && navigationRoute.personId === canonicalPersonId) return;
    navigateToPlayer(player);
  }, [canonicalPersonId, navigateToPlayer, navigationRoute, player, state.saveId]);
  const currentYear = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const euroIsolated = isEuroIsolatedMode(state);
  const wnbaIsolated = isWnbaIsolatedMode(state);
  const awardTrophyNamespace = state.leagueType !== 'modded' || pbaIsolated
    ? undefined
    : euroIsolated
      ? 'euro' as const
      : wnbaIsolated
        ? 'wnba' as const
        : state.moddedLeagueBase === 'nba' || state.moddedLeagueBase == null
          ? 'nba' as const
          : 'basketball' as const;
  const pbaDraftLabel = useMemo(() => {
    if (!pbaIsolated) return null;
    const archiveLabel = getPbaDraftBioLabel(player.name, player.draft?.year);
    if (archiveLabel) return archiveLabel;
    const draftTid = Number(player.draft?.tid);
    if (draftTid >= 2000 && draftTid < 3000 && player.draft?.year && player.draft.round && player.draft.pick) {
      return `PBA ${player.draft.year} R${player.draft.round} P${player.draft.pick}`;
    }
    return null;
  }, [pbaIsolated, player.name, player.draft]);
  const verifiedDraftLabel = useMemo(
    () => getVerifiedPlayerBioDraftLabel(player),
    [player],
  );
  const maxVisibleSeason = euroIsolated
    ? Math.max(0, Number(state.euroStartSeason ?? currentYear) - 1)
    : getHistoricalNbaCompletedSeasonCutoff({
        currentYear,
        leagueType: state.leagueType,
        moddedLeagueBase: state.moddedLeagueBase,
        nbaStartYear: state.nbaStartYear,
        seasonComplete: state.playoffs?.bracketComplete === true,
      }) ?? currentYear;
  const isProspectProfile = useMemo(
    () => isDraftProspectLike(player, currentYear),
    [player, currentYear],
  );
  const collegeName = useMemo(
    () => {
      const source = getProspectCollege(player);
      return pbaIsolated || isPbaCareerPlayer(player)
        ? getPhilippineCollegeLabel(source) ?? source
        : source;
    },
    [pbaIsolated, player],
  );
  const preDraftClub = useMemo(
    () => getProspectPreDraftClub(player, {
      currentSeason: currentYear,
      completedThrough: maxVisibleSeason,
      teams: [...(state.nonNBATeams ?? []), ...preloadedExternalTeams],
    }),
    [currentYear, maxVisibleSeason, player, preloadedExternalTeams, state.nonNBATeams],
  );
  const prospectProgramName = collegeName ?? preDraftClub?.name ?? null;
  const prospectTeamLabel = prospectProgramName
    ?? (isEuroBasketCountry((player as any).college) ? 'European Team' : null);
  const collegeProfile = useMemo(
    () => findCollegeTeamProfile(collegeName),
    [collegeName],
  );
  const [bioData,     setBioData]    = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchDone, setFetchDone] = useState(false);
  const [sourceAwards, setSourceAwards] = useState<NonNullable<NBAPlayer['awards']>>([]);
  const [competitionSourceAwards, setCompetitionSourceAwards] = useState<NonNullable<NBAPlayer['awards']>>([]);
  const preferCanonicalNbaPortrait = state.leagueType === 'modded' && state.moddedLeagueBase === 'nba';
  const shouldLoadPortraitLookup = preferCanonicalNbaPortrait
    || !player.imgURL
    || isLowQualityPlayerPortrait(player.imgURL);
  const resolvePortrait = () => getPlayerImage(player, { preferCanonicalNbaPortrait, portraitSeason: currentYear }) ?? '';
  const [portraitSrc, setPortraitSrc] = useState<string>(() => {
    return getPlayerImage(player, {
      preferCanonicalNbaPortrait: state.leagueType === 'modded' && state.moddedLeagueBase === 'nba',
      portraitSeason: currentYear,
    }) ?? '';
  });
  const playerDiedYear = getFiniteSeason((player as any).diedYear);

  // Reset portrait when player changes (e.g. navigating between players without unmount)
  useEffect(() => {
    let active = true;
    setPortraitSrc(resolvePortrait());
    if (shouldLoadPortraitLookup) {
      const portraitLoads: Promise<unknown>[] = [ensurePortraitLookupsLoaded()];
      if (preferCanonicalNbaPortrait) portraitLoads.push(loadNbaEraPortraitCatalog());
      Promise.allSettled(portraitLoads)
        .then(() => {
          if (active) setPortraitSrc(resolvePortrait());
        });
    }
    setFetchDone(false);
    setIsSyncing(false);
    return () => { active = false; };
  }, [player.internalId, player.imgURL, player.name, currentYear, player, preferCanonicalNbaPortrait, shouldLoadPortraitLookup]);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Historical Data' | 'Jersey History' | 'Game Log' | 'Awards' | 'Ratings' | 'Salaries' | 'Transactions' | 'Injuries' | 'Morale' | 'Family Tree'>('Historical Data');
  const [selectedTrade, setSelectedTrade] = useState<(TradeEntry & { legs?: TradeEntry[] }) | null>(null);
  useEffect(() => {
    setActiveTab(isProspectProfile ? 'Overview' : 'Historical Data');
  }, [isProspectProfile, player.internalId]);
  const team = useMemo(() => {
    return resolvePlayerBioPrimaryTeam(
      player,
      state.teams,
      state.nonNBATeams ?? [],
      state.teamArchive ?? [],
      currentYear,
      preloadedExternalTeams,
    );
  }, [currentYear, player, preloadedExternalTeams, state.nonNBATeams, state.teamArchive, state.teams]);

  const teamColor = isProspectProfile
    ? (collegeProfile?.primaryColor || collegeProfile?.secondaryColor || preDraftClub?.colors?.[0] || "#1d4ed8")
    : (team?.colors?.[0] || "#CE1141");
  const teamLogo  = isProspectProfile
    ? (collegeProfile?.logoUrl ?? preDraftClub?.logoUrl)
    : ((team as any)?.logoUrl || (team as any)?.imgURL);
  const teamFullName = isProspectProfile
    ? (collegeProfile ? getCollegeTeamLabel(collegeProfile) : prospectProgramName)
    : (team ? getTeamFullName(team) : null);

  const visibleTabs = useMemo(() => {
    const visibleRelativeCount = (player.relatives ?? []).reduce((count, relative) => {
      const match = resolveFamilyRelative(relative, state.players);
      return count + (match && isFamilyRelationVisible(relative, match, currentYear) ? 1 : 0);
    }, 0);

    if (isProspectProfile) {
      return [
        { id: 'Overview', label: 'Overview' },
        { id: 'Historical Data', label: 'Historical Data' },
        { id: 'Awards', label: 'Awards' },
        ...(visibleRelativeCount > 0 ? [{ id: 'Family Tree', label: 'Family Tree' }] : []),
      ];
    }

    return [
      { id: 'Historical Data', label: 'Historical Data' },
      { id: 'Jersey History', label: 'Jersey History' },
      { id: 'Ratings', label: 'Ratings' },
      { id: 'Game Log', label: 'Game Log' },
      { id: 'Salaries', label: 'Salaries' },
      { id: 'Transactions', label: 'Transactions' },
      { id: 'Injuries', label: 'Injuries' },
      { id: 'Morale', label: 'Morale' },
      { id: 'Awards', label: 'Awards' },
      ...(visibleRelativeCount > 0 ? [{ id: 'Family Tree', label: 'Family Tree' }] : []),
    ];
  }, [currentYear, isProspectProfile, player.relatives, state.players]);

  const maxSeason = useMemo(() => {
    return state.players.reduce((max, p) => {
      const pMax = p.stats?.reduce((m, s) => Math.max(m, s.season), 0) || 0;
      return Math.max(max, Math.min(pMax, maxVisibleSeason));
    }, maxVisibleSeason);
  }, [maxVisibleSeason, state.players]);
  const playerWithNativeCareer = player;
  useEffect(() => {
    let mounted = true;
    setSourceAwards([]);
    if (isFictional) return () => { mounted = false; };
    Promise.all([ensureFullRosterPlayerDataLoaded(), ensureBiosLoaded()])
      .then(() => {
        if (!mounted) return;
        setSourceAwards(euroIsolated
          ? getPlayerBioNbaSourceAwards(playerWithNativeCareer, Math.max(0, Number(state.euroStartSeason ?? currentYear) - 1))
          : getFullRosterAwardsForIdentity(playerWithNativeCareer));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [currentYear, euroIsolated, isFictional, playerWithNativeCareer, state.euroStartSeason]);

  const historicalSourceAwardCutoff = isEuroIsolatedMode(state)
    ? Math.max(0, Number(state.euroStartSeason ?? currentYear) - 1)
    : getHistoricalNbaBranchSeasonCutoff({
        currentYear,
        leagueType: state.leagueType,
        moddedLeagueBase: state.moddedLeagueBase,
        nbaStartYear: state.nbaStartYear,
      });
  useEffect(() => {
    let mounted = true;
    setCompetitionSourceAwards([]);
    if (!euroIsolated) return () => { mounted = false; };
    const applyCatalog = (catalog: Awaited<ReturnType<typeof loadCompetitionAwardCatalog>>) => {
      if (!mounted) return;
      setCompetitionSourceAwards(getCompetitionSourceAwardsForPlayer(
        playerWithNativeCareer,
        [...state.players, ...preloadedExternalPlayers],
        catalog.awards,
        historicalSourceAwardCutoff ?? currentYear,
      ) ?? []);
    };
    const preloadedCatalog = getPreloadedCompetitionAwards(state.saveId);
    if (preloadedCatalog) {
      applyCatalog(preloadedCatalog);
      return () => { mounted = false; };
    }
    loadCompetitionAwardCatalog((state.activeCompetitions ?? []).map(spec => spec.id))
      .then(applyCatalog)
      .catch(() => {});
    return () => { mounted = false; };
  }, [
    currentYear,
    euroIsolated,
    historicalSourceAwardCutoff,
    playerWithNativeCareer,
    preloadedExternalPlayers,
    state.activeCompetitions,
    state.players,
    state.saveId,
  ]);
  const timelineSourceAwards = useMemo(
    () => historicalSourceAwardCutoff !== undefined
      ? filterAwardsToVisibleTimeline(sourceAwards, historicalSourceAwardCutoff)
      : sourceAwards,
    [historicalSourceAwardCutoff, sourceAwards],
  );
  const isExternalAwardMode = isEuroIsolatedMode(state) || state.leagueStats?.uiMode === 'pba_isolated';
  const historicalContestAwards = useMemo(() => {
    if (state.leagueType === 'fictional' || isExternalAwardMode) return [];
    return getHistoricalContestAwardsForPlayer(player.name, historicalSourceAwardCutoff);
  }, [historicalSourceAwardCutoff, isExternalAwardMode, player.name, state.leagueType]);
  const scopedPlayerAwards = useMemo(() => {
    const awards = playerWithNativeCareer.awards ?? [];
    if (!isExternalAwardMode) return awards;
    return scopeExternalPlayerAwards(
      awards,
      state.historicalAwards,
      player.internalId,
      player.name,
      currentYear,
    ).map(award => {
      const scopedAward = scopeExternalPlayerAwardCompetition(award, player.stats);
      return {
        ...scopedAward,
        type: getExternalPlayerAwardLabel(scopedAward, player.stats, state.activeCompetitions, state.leagueStats?.uiMode),
      };
    });
  }, [currentYear, isExternalAwardMode, playerWithNativeCareer.awards, playerWithNativeCareer.internalId, playerWithNativeCareer.name, playerWithNativeCareer.stats, state.activeCompetitions, state.historicalAwards, state.leagueStats?.uiMode]);
  const mergedAwards = useMemo(
    () => mergeNormalizedPlayerAwards(scopedPlayerAwards, [
      ...timelineSourceAwards,
      ...competitionSourceAwards,
      ...historicalContestAwards,
    ]),
    [competitionSourceAwards, historicalContestAwards, scopedPlayerAwards, timelineSourceAwards],
  );
  const playerWithSourceAwards = useMemo(
    () => ({ ...playerWithNativeCareer, awards: mergedAwards }),
    [mergedAwards, playerWithNativeCareer],
  );
  const visibleAwards = useMemo(
    () => filterAwardsToVisibleTimeline(mergedAwards, maxVisibleSeason),
    [maxVisibleSeason, mergedAwards],
  );

  const historicalProfileStatus = useMemo(() => {
    const hofYears = [
      getFiniteSeason(player.hofInductionYear),
      getFiniteSeason(player.scheduledHofInductionYear),
      ...visibleAwards
        .filter(award => isHallOfFameAward(award.type))
        .map(award => getFiniteSeason(award.season)),
    ].filter((season): season is number => season != null);
    const hasVisibleHallOfFame = hofYears.some(season => season <= maxVisibleSeason)
      || (!!player.hof && hofYears.length === 0 && player.status === 'Retired');

    if (hasVisibleHallOfFame) {
      return { label: 'Hall of Fame', isHallOfFame: true };
    }

    const retiredYear = getFiniteSeason(player.retiredYear);
    const hasVisibleRetirement = player.status === 'Retired'
      || (retiredYear != null && retiredYear <= maxVisibleSeason)
      || (playerDiedYear != null && playerDiedYear <= currentYear);
    const externalLeagueLabel = isExternalLeagueStatus(player.status)
      ? player.status
      : undefined;

    return {
      label: hasVisibleRetirement ? 'Retired' : externalLeagueLabel ?? 'Free Agent',
      isHallOfFame: false,
    };
  }, [
    currentYear,
    maxVisibleSeason,
    player.hof,
    player.hofInductionYear,
    player.retiredYear,
    player.scheduledHofInductionYear,
    player.status,
    playerDiedYear,
    visibleAwards,
  ]);

  const liveHeroStats = useMemo(() => {
    const season = currentYear;
    const externalArchiveOnly = (player as any).externalArchiveOnly === true;
    const euroCompetitionId = isEuroIsolatedMode(state)
      ? state.euroPrimaryCompetitionId
      : undefined;
    const pbaCompetitionId = state.leagueStats?.uiMode === 'pba_isolated'
      ? getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id
      : undefined;
    const fallback = externalArchiveOnly || player.status === 'Retired' || player.tid < 0
      ? 'career'
      : 'latest-season';
    return buildHeroStatsFromBoxScores(
      player.internalId,
      season,
      state.boxScores,
      state.schedule,
      state.playoffs,
      state.nbaCup,
      state.nbaCupHistory,
      state.leagueStats,
      euroCompetitionId ?? pbaCompetitionId,
    ) ?? buildHeroStatsFromSave(
      player.stats,
      season,
      externalArchiveOnly ? undefined : euroCompetitionId ?? pbaCompetitionId,
      fallback,
      maxVisibleSeason,
    );
  }, [
    currentYear,
    maxVisibleSeason,
    player.internalId,
    player.stats,
    state.boxScores,
    state.schedule,
    state.playoffs,
    state.nbaCup,
    state.nbaCupHistory,
    state.leagueStats?.uiMode,
    state.euroPrimaryCompetitionId,
    (state.leagueStats as any)?.pbaConference,
    pbaIsolated,
  ]);

  useEffect(() => {
    const nextStats = liveHeroStats
      ? {
          PTS: liveHeroStats.PTS,
          REB: liveHeroStats.REB,
          AST: liveHeroStats.AST,
          STL: liveHeroStats.STL,
          BLK: liveHeroStats.BLK,
          GP: liveHeroStats.GP,
          fromSeason: liveHeroStats.fromSeason,
        }
      : { PTS: '0.0', REB: '0.0', AST: '0.0', STL: '0.0', BLK: '0.0' };

    setBioData((prev: any) => {
      if (!prev) return prev;
      const currentStats = prev.stats ?? {};
      if (
        currentStats.PTS === nextStats.PTS &&
        currentStats.REB === nextStats.REB &&
        currentStats.AST === nextStats.AST &&
        currentStats.STL === nextStats.STL &&
        currentStats.BLK === nextStats.BLK &&
        currentStats.GP === nextStats.GP &&
        currentStats.fromSeason === nextStats.fromSeason
      ) {
        return prev;
      }
      return { ...prev, stats: nextStats };
    });
  }, [liveHeroStats]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const run = async () => {
      console.log(`%c[Scout Intel] Opening bio: ${player.name}`, "color:#00d4ff;font-weight:bold");

      // ── 1. Instant BBGM data ─────────────────────────────────────────────
      const curYear = maxSeason;
      const rawBirthYear = Number(player.born?.year);
      const bY = Number.isInteger(rawBirthYear) && rawBirthYear >= 1900 && rawBirthYear <= curYear
        ? rawBirthYear
        : null;
      const dY = player.draft?.year || 2026;
      const heroStats = liveHeroStats;
      const isExternalCareer = isExternalLeagueStatus(player.status) || player.tid >= 1000 || isPbaCareerPlayer(player);
      const draftYear = Number(player.draft?.year ?? 0);
      const experienceLabel = (() => {
        if (isProspectProfile) return 'Pre-NBA';
        if (isExternalCareer && Number.isFinite(draftYear) && draftYear > 0 && draftYear <= curYear) {
          const years = Math.max(0, curYear - draftYear);
          return `${years} Year${years === 1 ? '' : 's'}`;
        }
        const eligibleStats = filterCurrentPbaImportedStats(player, (player.stats ?? []) as any, curYear);
        const playedSeasons = new Set(eligibleStats
          .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0 && Number(s.season ?? 0) <= curYear)
          .map((s: any) => Number(s.season)));
        const played = playedSeasons.size || (
          Number.isFinite(draftYear) && draftYear > 0 && draftYear <= curYear
            ? Math.max(0, curYear - draftYear)
            : 0
        );
        return `${played} Year${played === 1 ? '' : 's'}`;
      })();

      const nonNBABio = isFictional ? null : getNonNBABioData(player);
      const sourceBiography = player.sourceBiography;
      const sourceBiographyBullets = sourceBiography ? bulletList([
        sourceBiography.hometown ? `Hometown: ${sourceBiography.hometown}.` : null,
        sourceBiography.highSchool ? `High School: ${sourceBiography.highSchool}.` : null,
        sourceBiography.preDraftTeam ? `Pre-Draft Team: ${sourceBiography.preDraftTeam}.` : null,
      ]) : '';
      const preDraftRaw = (player as any).pre_draft as string | undefined;
      const collegeDisplay = prospectTeamLabel?.trim() || null;
      const isPreDraftClub = !collegeName && Boolean(preDraftClub);
      const teamLabel = isProspectProfile
        ? (collegeDisplay ?? "Unattached")
        : (teamFullName || historicalProfileStatus.label);
      const diedYear: number | undefined = playerDiedYear ?? undefined;
      const ageYear = getPlayerAgeReferenceYear(player, curYear);
      const metaLine = [
        ...(isProspectProfile ? ['Draft Prospect', teamLabel] : [teamLabel]),
        ...(!isProspectProfile && player.jerseyNumber ? [`#${player.jerseyNumber}`] : []),
        player.pos,
      ].filter(Boolean).join(' | ');
      const rawHeight = Number(player.hgt ?? (player as any).finalHgt);
      const rawWeight = Number(player.weight ?? (player as any).finalWeight);
      const listedHeight = Number.isFinite(rawHeight) && rawHeight >= 48 && rawHeight <= 100 ? rawHeight : null;
      const listedWeight = Number.isFinite(rawWeight) && rawWeight >= 80 && rawWeight <= 500 ? rawWeight : null;
      const playerCountry = getPlayerNationalityCountries(
        player,
        pbaIsolated || isPbaCareerPlayer(player) ? getPbaNationalityFallback(player) : undefined,
      ).join(' / ') || 'Unknown';
      const baseData = {
        n: player.name,
        m: metaLine,
        h: listedHeight ? `${Math.floor(listedHeight / 12)}'${listedHeight % 12}"` : "Unknown",
        w: listedWeight ? `${listedWeight}lb` : "Unknown",
        c: playerCountry,
        s: collegeDisplay ?? '—',
        a: bY ? (diedYear ? `${ageYear - bY} († ${diedYear})` : `${ageYear - bY} years`) : 'Unknown',
        b: formatStoredBirthdate(player.born),
        d: (!hasVerifiedDraftSelection(player) ? sourceBiography?.draftStatus : undefined) ?? (isProspectProfile
          ? (player.draft?.year ? `Draft Eligible: ${player.draft.year}` : 'Draft Prospect')
          : (pbaDraftLabel ?? verifiedDraftLabel ?? (player.draft?.year
            ? `Undrafted (${player.draft.year})`
            : "Undrafted"))),
        e: experienceLabel,
        stats: heroStats
          ? {
              PTS: heroStats.PTS,
              REB: heroStats.REB,
              AST: heroStats.AST,
              STL: heroStats.STL,
              BLK: heroStats.BLK,
              GP: heroStats.GP,
              fromSeason: heroStats.fromSeason,
            }
          : { PTS: '—', REB: '—', AST: '—', STL: '—', BLK: '—' },
        bio: isProspectProfile
          ? {
              pro: bulletList([
                `${player.name} enters the ${dY} draft cycle as a ${player.pos} prospect.`,
                collegeDisplay
                  ? `${isPreDraftClub ? 'Pre-draft club' : 'Last program'} on file: ${teamLabel}.`
                  : 'No college or pre-draft club has been attached to this prospect yet.',
                collegeProfile?.conferenceName ? `${teamLabel} competes in the ${collegeProfile.conferenceName}.` : null,
              ]),
              pre: bulletList([
                preDraftRaw ? `Source listing: ${preDraftRaw}.` : null,
                playerCountry !== 'Unknown' ? `Nationality / birth location on file: ${playerCountry}.` : null,
                listedHeight ? `Listed measurements: ${Math.floor(listedHeight / 12)}'${listedHeight % 12}" and ${listedWeight || 'unknown'} pounds.` : null,
              ]),
              per: bulletList([
                player.draft?.year ? `Draft class: ${player.draft.year}.` : 'Draft class not yet attached.',
                Number(player.age) >= 15 && Number(player.age) <= 80 ? `Current listed age: ${player.age}.` : null,
                collegeDisplay
                  ? `${player.name} has not been drafted yet and is shown under ${isPreDraftClub ? 'club' : 'college'} branding.`
                  : null,
              ]),
            }
          : (nonNBABio
            ? { ...nonNBABio.bio, pro: `${sourceBiographyBullets}${nonNBABio.bio.pro}` }
            : { pro: sourceBiographyBullets, pre: '', per: '' }),
      };

      if (isMounted) setBioData(baseData);

      if (isProspectProfile) {
        if (isMounted) {
          setIsSyncing(false);
          setFetchDone(true);
        }
        return;
      }

      // ── Non-NBA players: enrich hero stats + info + bio from gist ─────────
      if (nonNBABio) {
        if (isMounted) setIsSyncing(true);
        try {
          await ensureNonNBAFetched(player.status!);
          const gist = getNonNBAGistData(player.status!, player.name);
          if (isMounted && gist) {
            setBioData((prev: any) => ({
              ...prev,
              ...(heroStats ? {} : {
                stats: {
                  PTS: gist.stats.PTS,
                  REB: gist.stats.REB,
                  AST: gist.stats.AST,
                  STL: gist.stats.STL ?? prev.stats.STL,
                  BLK: gist.stats.BLK ?? prev.stats.BLK,
                },
              }),
              // Override info grid fields if gist has better data
              ...(gist.h && { h: gist.h }),
              ...(gist.w && { w: gist.w }),
              ...(gist.c && { c: gist.c }),
              ...(gist.s && canExternalBiographySupplySchool(collegeName) && { s: gist.s }),
              ...(gist.b && (!prev.b || prev.b === 'Unknown' || /^\d{4}$/.test(prev.b)) && { b: gist.b }),
              // A live-source age is relative to today. Historical branches must
              // keep the age derived from the save season and stored birth year.
              ...(gist.a && !bY && { a: gist.a }),
              ...(gist.d && canExternalBiographySupplyDraft(player, pbaDraftLabel) && { d: gist.d }),
              // Recompute experience from gist draft year when player.draft.year was missing
              ...(gist.d && !player.draft?.year && (() => {
                const m = gist.d!.match(/^(\d{4})/);
                return m ? { e: `${Math.max(0, curYear - parseInt(m[1]))} Years` } : {};
              })()),
              // Bio section
              bio: { pro: gist.proBio || prev.bio.pro, pre: '', per: '' },
            }));
          }
        } catch (_) {}
        if (isMounted) { setIsSyncing(false); setFetchDone(true); }
        return;
      }

      // ── 1b. ZenGM bio enrichment for retired/historical NBA players ────────
      // Fires only when srID is present and the player is retired (or has missing
      // bio fields). The 17 MB JSON is fetched once and cached in module memory.
      const needsSourceBio = !isFictional;
      if (needsSourceBio) {
        Promise.all([ensureBiosLoaded(), ensureFullRosterPlayerDataLoaded()]).then(() => {
          if (!isMounted) return;
          const zen = player.srID ? getBioBySlug(player.srID) : null;
          const explicitNationality = getExplicitFullRosterNationalityForIdentity(player);
          if (!zen && !explicitNationality) return;
          setBioData((prev: any) => {
            if (!prev) return prev;
            const patch: Record<string, any> = {};
            if (zen?.height && prev.h === 'Unknown') patch.h = fmtHeight(zen.height);
            if (zen?.weight && prev.w === 'Unknown') patch.w = `${zen.weight}lb`;
            if (explicitNationality) patch.c = explicitNationality;
            else if (zen?.country && (prev.c === 'Unknown' || !prev.c)) patch.c = zen.country;
            if (zen?.college && (prev.s === '—' || !prev.s)) patch.s = zen.college;
            if (zen?.bornYear && prev.b === String(bY)) patch.b = String(zen.bornYear);
            if (zen?.draftYear && zen.draftRound && zen.draftPick && (!Number(player.draft?.round) || !Number(player.draft?.pick))) {
              const rd = zen.draftRound ? ` R${zen.draftRound}` : '';
              const pk = zen.draftPick  ? ` P${zen.draftPick}` : '';
              patch.d = `${zen.draftYear}${rd}${pk}`;
              patch.e = `${Math.max(0, curYear - zen.draftYear)} Years`;
            }
            return Object.keys(patch).length ? { ...prev, ...patch } : prev;
          });
        });
      }

      if (isMounted) { setIsSyncing(false); setFetchDone(true); }
      return;

      /*
      const nbaId = extractNbaId(player.imgURL || "", player.name);
      if (!nbaId) return;

      setIsSyncing(true);
      try {
        const payload = await fetchWithDedup(nbaId, state.leagueStats?.year);
        if (isMounted) {
          setBioData((prev: any) => ({
            ...prev,
            ...payload,
            n: baseData.n,
            m: baseData.m,
            stats: baseData.stats,
            h: baseData.h,
            w: baseData.w,
            a: baseData.a,
            d: baseData.d,
            e: baseData.e,
          }));
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") console.error(`[Scout Intel] FAILED for ${player.name}:`, err.message);
      } finally {
        if (isMounted) { setIsSyncing(false); setFetchDone(true); }
      }
      */
    };

    run();
    return () => { isMounted = false; controller.abort(); };
  }, [player, team, maxSeason, currentYear, liveHeroStats, teamFullName, historicalProfileStatus.label, isFictional, isProspectProfile, collegeName, collegeProfile, preDraftClub, prospectTeamLabel, playerDiedYear, pbaDraftLabel, verifiedDraftLabel, pbaIsolated]);

  if (!bioData) return null;

  return (
    <>
    {selectedTrade && (
      <TradeDetailView
        entry={selectedTrade}
        legs={selectedTrade.legs}
        onBack={() => setSelectedTrade(null)}
      />
    )}
    {!selectedTrade && <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden rounded-[2.5rem] border border-white/10 relative shadow-2xl">
      <button aria-label="Back" onClick={onBack} className="absolute top-6 left-6 z-50 w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <ArrowLeft size={20} />
      </button>
      <button aria-label={`Player actions for ${player.name}`} onClick={() => quickActions.openFor(player)} className="absolute top-6 right-6 z-50 flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <Ellipsis size={18} /> Actions
      </button>

      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── HERO ── */}
        <PlayerBioHero
          bioData={bioData}
          teamColor={teamColor}
          teamLogo={teamLogo}
          teamFullName={teamFullName}
          portraitSrc={portraitSrc}
          playerImgURL={getPlayerImage(player, { preferCanonicalNbaPortrait, portraitSeason: currentYear })}
          playerName={player.name}
          isSyncing={isSyncing}
          fetchDone={fetchDone}
          isHoF={historicalProfileStatus.isHallOfFame}
          face={(player as any).face}
          showStatsBar={!isProspectProfile}
          schoolLabel={isProspectProfile ? (preDraftClub && !collegeName ? 'Pre-Draft Club' : 'College') : 'Last Attended'}
        />

        {/* ── TABS ── */}
        <TabBar
          className="px-4 md:px-8 mt-5"
          tabs={visibleTabs}
          active={activeTab}
          onChange={id => setActiveTab(id as typeof activeTab)}
        />

        {activeTab === 'Overview' && isProspectProfile && (
          <PlayerBioOverviewTab
            bioData={bioData}
            teamColor={teamColor}
            isSyncing={isSyncing}
            fetchDone={fetchDone}
          />
        )}
        
        {activeTab === 'Historical Data' && (
          <div className="bg-[#080808]">
            <PlayerBioStatsHistory player={playerWithSourceAwards} />
          </div>
        )}

        {!isProspectProfile && activeTab === 'Game Log' && (
          <PlayerBioGameLogTab player={player} onGameClick={onGameClick} onTeamClick={onTeamClick} />
        )}

        {!isProspectProfile && activeTab === 'Ratings' && (
          <PlayerBioRatingsTab
            player={player}
            currentYear={currentYear}
            teamColor={teamColor}
          />
        )}

        {!isProspectProfile && activeTab === 'Jersey History' && (
          <PlayerBioJerseyHistoryTab player={playerWithSourceAwards} />
        )}

        {!isProspectProfile && activeTab === 'Salaries' && (
          <PlayerBioContractTab player={playerWithSourceAwards} />
        )}

        {!isProspectProfile && activeTab === 'Transactions' && (
          <PlayerBioTransactionsTab player={playerWithSourceAwards} onTradeClick={setSelectedTrade} />
        )}

        {!isProspectProfile && activeTab === 'Injuries' && (
          <PlayerBioInjuriesTab player={player} />
        )}

        {!isProspectProfile && activeTab === 'Morale' && (
          <PlayerBioMoraleTab player={playerWithSourceAwards} />
        )}

        {activeTab === 'Awards' && (
          <AwardsView
            awards={visibleAwards}
            teamColor={teamColor}
            maxSeason={maxVisibleSeason}
            trophyNamespace={awardTrophyNamespace}
            competitions={state.activeCompetitions}
            formatSeasonLabel={season => formatLeagueSeasonLabel(season, state.leagueStats)}
          />
        )}

        {activeTab === 'Family Tree' && (
          <PlayerBioFamilyTreeTab player={player} teamColor={teamColor} />
        )}

      </div>
    </div>}

    {quickActions.portals}
    </>
  );
};
