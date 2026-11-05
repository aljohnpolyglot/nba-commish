import type { GameState, OffseasonChecklist } from '../../types';
import { EURO_ISOLATED_DEFAULTS, EXTERNAL_LEAGUE_OVR_CAP, EXTERNAL_LEAGUE_STATUSES, PBA_ISOLATED_DEFAULTS, UNDRAFTED_OVR_CAP } from '../../constants';
import { normalizeDate } from '../../utils/helpers';
import { repairGeneratedExternalPlayer } from '../../services/externalLeagueSustainer';
import { applyCupAwardsToPlayers } from '../../services/nbaCup/awards';
import { defaultAwardSettings } from '../../services/awards/AwardEngine';
import { computeRookieSalaryUSD } from '../../utils/rookieContractUtils';
import { isPlausibleActiveMarket, MAX_FA_MARKET_DECISION_WINDOW_DAYS } from '../../services/freeAgencyBidding';
import { hasLiveContractAfterWaive, stripLiveContractAfterWaive } from '../../utils/contractCleanup';
import { repairBirdRightsForLoadedPlayer } from '../../utils/playerBirdRights';
import { resolveYearsWithCurrentTeamFromStats } from '../../utils/playerTenure';
import { getDraftSeasonYearForState, isNoDraftLeague } from '../../services/offseason/offseasonState';
import { initialState } from '../initialState';
import { deriveOfficialNbaRecords, type OfficialNbaRecordRow } from '../../utils/nbaOfficialRecords';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { classifyBoxScoreGame } from '../../utils/gameClassification';
import { DEFAULT_TRADABLE_PICK_SEASONS, generateDraftPicksForTeamIdsAndSeasons, generateFuturePicksForTeamIds, getDraftRoundsForLeague, isCurrentDraftClassComplete } from '../../services/draft/DraftPickGenerator';
import { computeContractOffer, getContractLimits, seasonLabelToYear } from '../../utils/salaryUtils';
import { buildPbaImportContractMetadata, clampPbaImportOfferSalary, getPbaImportOfferRange, isPbaRosterLocal, isRegisteredPbaRosterIdentity } from '../../services/pba/importManager';
import { applyPbaStaffEconomyScale, attachPbaStaffToTeam } from '../../services/pba/staffSources';
import { createPortraitUsageSet } from '../../utils/newgenPortrait';
import { computeLocalPBASalaryUSD, getPBARosterEconomyConfig } from '../../services/externalRosterService';
import { tunePbaDraftProspects } from '../../services/pba/draftRules';
import { getPbaCompetitionIdForConference, isPbaActiveConferenceMode, isPbaActiveConferencePhase } from '../../utils/uiMode';
import { getPbaRosterPortrait } from '../../services/pba/portraits';
import {
  isDefaultProballers,
  isLowQualityPlayerPortrait,
  resolvePersistentPlayerImage,
  resolveWnbaPlayerPortrait,
} from '../../utils/playerImage';
import { hasTwoWayContractMarker, normalizeContractOptionKind } from '../../utils/contractTypes';
import { syncPlayerContractAmountForSeason } from '../../utils/contractSeasonSync';
import { getHistoricalNbaRisingStarsFormat, isHistoricalNbaStart } from '../../data/historicalNbaSeasons';
import { getPbaHistoricalEconomyFactor, PBA_PLAYER_ECONOMY_VERSION } from '../../services/pba/historicalEconomy';
import {
  AWARD_SETTINGS_ERA_VERSION,
  migrateAwardSettingsToCurrentEra,
} from '../../services/awards/awardEraProgression';
import {
  healWnbaAwardDefaults,
  healWnbaAllStarTimingDefaults,
  healWnbaDevelopmentalContractDefaults,
  healWnbaDraftLotteryDefaults,
  healWnbaTransactionCalendarDefaults,
} from '../../services/wnba/history';
import { ensureOpeningTeamHeadCoach, isOpeningNbaStaffWindow } from '../../services/staff/activeStaffContracts';
import { isDraftLotteryEnabled } from '../../lib/lotteryPresets';
import { getCachedExternalPortraitForName } from '../../services/externalPortraitCatalog';
import { getPbaDraftPickYears } from '../../services/pba/draftCalendar';
import { resolveSeasonRolloverPlayerScope } from '../../services/logic/seasonRollover/leagueScope';
import { isPlayerInLeagueScope } from '../../utils/playerLeagueScope';
import { daysBetweenGameDates, getDraftDate, parseGameDate } from '../../utils/dateUtils';
import { getPlayoffCompletionEvidence } from '../../services/playoffs/playoffCompletion';
import { getVerifiedBioForPlayerIdentity } from '../../data/realPlayerDataFetcher';
import { isInternationalTournamentOnlyPlayer } from '../../utils/prospectUtils';
import { mergePlayerSalaries } from '../../utils/playerCareerMerge';
import { buildAutomaticGameDiscipline } from '../../services/disciplinePolicy';
import { appendPlayerDisciplineRecord } from '../../services/playerDisciplineHistory';
import { getLeagueCurrencyCode } from '../../utils/helpers';

const EXTERNAL_STATUSES_SET = new Set(EXTERNAL_LEAGUE_STATUSES);
const DEAD_MONEY_FLOOR_USD = 50_000;
const NBA_TO_FICTIONAL_HANDLES: Record<string, string> = {
  nba: 'TheLeagueOfficial',
  NBA: 'TheLeagueOfficial',
  wojespn: 'KowalskiESPN',
  ShamsCharania: 'TariqHassan',
  shamscharania: 'TariqHassan',
};
const NBA_TO_PBA_HANDLES: Record<string, string> = {
  nba: 'PBAOfficial',
  NBA: 'PBAOfficial',
  wojespn: 'CourtsideDeskPH',
  ShamsCharania: 'ManilaHoopsWire',
  shamscharania: 'ManilaHoopsWire',
};

const PBA_LEGACY_ECONOMY_CAP_FLOOR = 1_000_000;
const PBA_CONFERENCES = new Set(['philippine', 'commissioners', 'governors']);
const PBA_CONFERENCE_PHASES = new Set(['regularSeason', 'playoffs', 'offseason', 'complete']);

/** Backfill the factual ledger for GM-save brawls created before automatic discipline existed. */
export function healLegacyAutomaticBrawlDiscipline<T extends GameState>(loaded: T): T {
  if (loaded.gameMode !== 'gm') return loaded;
  const brawls = (loaded.boxScores ?? []).filter(result => result.fight?.severity === 'brawl');
  if (brawls.length === 0) return loaded;
  const notices = buildAutomaticGameDiscipline(loaded, brawls);
  if (notices.length === 0) return loaded;
  const noticesByPlayer = new Map<string, typeof notices>();
  for (const notice of notices) {
    noticesByPlayer.set(notice.playerId, [...(noticesByPlayer.get(notice.playerId) ?? []), notice]);
  }
  const currencyCode = getLeagueCurrencyCode(loaded.leagueStats);
  const seasonForDate = (date: string) => {
    const parsed = parseGameDate(date);
    return parsed.getMonth() >= 6 ? parsed.getFullYear() + 1 : parsed.getFullYear();
  };
  return {
    ...loaded,
    players: loaded.players.map(player => {
      const playerNotices = noticesByPlayer.get(player.internalId);
      if (!playerNotices) return player;
      return playerNotices.reduce((current, notice) => appendPlayerDisciplineRecord(current, {
        id: notice.id,
        date: notice.gameDate,
        season: seasonForDate(notice.gameDate) || Number(loaded.leagueStats.year),
        action: 'fine_and_suspension',
        amount: notice.amountUSD,
        currencyCode,
        games: notice.suspensionGames,
        reason: notice.reason,
        authority: 'automatic',
        templateId: notice.templateId,
        templateName: notice.templateName,
        tid: notice.teamId,
        source: 'game',
      }), player);
    }),
  };
}

export function healStaleCompletedNbaFinalsLifecycle<T extends GameState>(loaded: T): T {
  const lifecycle = loaded.seasonLifecycle;
  const playoffs = loaded.playoffs;
  const season = Number(playoffs?.season);
  const isAffectedNbaGmSave = loaded.gameMode === 'gm'
    && loaded.leagueType === 'modded'
    && (loaded.moddedLeagueBase ?? 'nba') === 'nba'
    && loaded.leagueStats?.uiMode === 'nba';
  if (!isAffectedNbaGmSave) return loaded;
  const staleSelectedIds = Object.values(lifecycle?.draft?.selectedPlayerIdsBySlot ?? {});
  const selectedPlayers = new Map((loaded.players ?? []).map(player => [player.internalId, player]));
  const selectedIdsBelongToAnotherDraft = staleSelectedIds.length > 0
    && staleSelectedIds.every(playerId => Number(selectedPlayers.get(playerId)?.draft?.year) !== season);
  const hasCurrentDraftTransaction = (loaded.players ?? []).some(player =>
    (player.transactions ?? []).some(transaction => transaction.type === 'draft' && Number(transaction.season) === season),
  );
  const finals = playoffs?.series?.find(series => series.conference === 'Finals' && series.status === 'complete');
  const finalsDates = (loaded.schedule ?? [])
    .filter(game => game.isPlayoff && game.played && game.playoffSeriesId === finals?.id && game.date)
    .map(game => normalizeDate(game.date))
    .sort();
  const finalsDate = finalsDates.at(-1);
  const today = normalizeDate(loaded.date);
  const snapshot = loaded.completedSeasonSnapshots?.[`nba:${season}`] ?? loaded.completedSeasonSnapshot;
  const staleFinalizationDate = Number(snapshot?.season) === season
    && !!finalsDate
    && normalizeDate(snapshot?.completedAtDate ?? '') > finalsDate;
  const beforeOrOnDraft = !!finalsDate
    && today > finalsDate
    && today <= normalizeDate(getDraftDate(season, loaded.leagueStats).toISOString());
  const staleTaskCycle = lifecycle?.currentPhase === 'PRESEASON_ACTIVE'
    && Number(lifecycle.completedSeason) < season
    && lifecycle.offseasonOpen === true
    && lifecycle.taskCycle?.season === season
    && lifecycle.taskCycle.status === 'complete'
    && loaded.offseasonChecklist?.seasonSummary === 'done'
    && loaded.offseasonChecklist?.performanceReview !== 'done';
  const staleBoardTask = loaded.pendingGovernorsBoardMeeting?.season === season
    && loaded.pendingGovernorsBoardMeeting.reviewed === true
    && !!finalsDate
    && normalizeDate(loaded.pendingGovernorsBoardMeeting.generatedAt ?? '') < finalsDate;
  const staleSummerTask = Number(loaded.summerLeagueTournament?.year) < season
    && loaded.offseasonChecklist?.summerLeague === 'done';
  const alreadyRestoredTaskCycle = lifecycle?.currentPhase === 'OFFSEASON_TASKS_ACTIVE'
    && lifecycle.completedSeason === season
    && lifecycle.taskCycle?.season === season
    && lifecycle.taskCycle.status === 'pending'
    && today === finalsDate;

  if (
    isAffectedNbaGmSave
    && Number.isFinite(season)
    && Number(loaded.leagueStats?.year) === season
    && !hasCurrentDraftTransaction
    && alreadyRestoredTaskCycle
    && (staleBoardTask || staleSummerTask)
  ) {
    console.log(`[LOAD_GAME] Removed stale prior-cycle task evidence from the restored ${season} NBA offseason.`);
    return {
      ...loaded,
      ...(staleBoardTask ? { pendingGovernorsBoardMeeting: undefined } : {}),
      offseasonChecklist: loaded.offseasonChecklist ? {
        ...loaded.offseasonChecklist,
        ...(staleBoardTask ? { governorsBoardMeeting: 'skipped' as const } : {}),
        ...(staleSummerTask ? { summerLeague: 'pending' as const } : {}),
      } : loaded.offseasonChecklist,
    };
  }

  if (
    !isAffectedNbaGmSave
    || !Number.isFinite(season)
    || Number(loaded.leagueStats?.year) !== season
    || !getPlayoffCompletionEvidence(playoffs, loaded.schedule).complete
    || !staleTaskCycle
    || !selectedIdsBelongToAnotherDraft
    || hasCurrentDraftTransaction
    || !(loaded.draftLotteryResult?.length)
    || !staleFinalizationDate
    || !beforeOrOnDraft
    || !finalsDate
  ) return loaded;

  const rewindDays = Math.max(0, Math.round(daysBetweenGameDates(finalsDate, loaded.date)));
  const runnerUpTeamId = finals?.higherSeedTid === playoffs?.champion
    ? finals?.lowerSeedTid
    : finals?.higherSeedTid;
  const repairedSnapshot = { ...snapshot!, completedAtDate: finalsDate };
  const reset = {
    ...loaded,
    date: finalsDate,
    day: Number.isFinite(Number(loaded.day)) ? Math.max(0, Number(loaded.day) - rewindDays) : loaded.day,
    activeDraftOrder: undefined,
    activeDraftPicks: {},
    activeDraftPassedPicks: {},
    offseasonChecklist: undefined,
    pendingGovernorsBoardMeeting: undefined,
    completedSeasonSnapshot: Number(loaded.completedSeasonSnapshot?.season) === season
      ? repairedSnapshot
      : loaded.completedSeasonSnapshot,
    completedSeasonSnapshots: {
      ...(loaded.completedSeasonSnapshots ?? {}),
      [`nba:${season}`]: repairedSnapshot,
    },
    seasonLifecycle: {
      ...lifecycle,
      activeSeason: season,
      completedSeason: season,
      currentPhase: 'OFFSEASON_TASKS_ACTIVE' as const,
      regularSeason: {
        ...lifecycle.regularSeason,
        season,
        status: 'complete' as const,
        completedGameIds: (loaded.schedule ?? [])
          .filter(game => !game.isPreseason && !game.isPlayoff && !game.isPlayIn && game.played)
          .map(game => game.gid)
          .sort((left, right) => left - right),
      },
      playoffs: {
        ...lifecycle.playoffs,
        season,
        materialized: true,
        bracketFingerprint: repairedSnapshot.bracketFingerprint,
        championTeamId: playoffs?.champion,
        runnerUpTeamId,
        finalizedAtDate: finalsDate,
      },
      awards: {
        season,
        status: 'complete' as const,
        finalizedAwardKeys: repairedSnapshot.enabledAwardKeys,
      },
      taskCycle: { id: `nba:${season}`, season, status: 'pending' as const },
      offseasonCycle: season,
      offseasonOpen: true,
      retirements: 'pending' as const,
      transition: {
        ...lifecycle.transition,
        fromSeason: season,
        toSeason: season + 1,
        status: 'pending' as const,
        completedAtDate: undefined,
      },
      nextSeason: season + 1,
      nextValidTransition: 'NEXT_SEASON_PREPARED' as const,
      draft: {
        ...lifecycle.draft,
        year: season,
        lottery: 'complete' as const,
        lotteryEvidence: undefined,
        orderReview: 'pending' as const,
        orderLedger: [],
        orderReviewedSeason: undefined,
        draft: 'pending' as const,
        draftCompleteSeason: undefined,
        selectedPlayerIdsBySlot: {},
        passedSlots: [],
        historyPersisted: false,
        rookieContracts: 'blocked' as const,
        rookieContractsResolvedSeason: undefined,
      },
    },
  } as T;
  console.log(`[LOAD_GAME] Restored stale ${season} NBA Finals save to ${finalsDate} and reopened its offseason tasks.`);
  return reset;
}

export function healNbaDraftCycleState<T extends GameState | Record<string, any>>(loaded: T): T {
  const isNba = loaded?.leagueType === 'modded' && (loaded?.moddedLeagueBase ?? 'nba') === 'nba';
  if (!isNba || isNoDraftLeague(loaded?.leagueStats)) return loaded;
  if (loaded?.draftComplete === true) {
    if (isCurrentDraftClassComplete(loaded as any)) return loaded;
    console.log(`[LOAD_GAME] Restored the open ${loaded?.leagueStats?.year ?? ''} NBA Draft cycle.`);
    return { ...loaded, draftComplete: false };
  }

  const draftSeason = getDraftSeasonYearForState(loaded as any);
  const leagueYear = Number(loaded?.leagueStats?.year);
  if (!Number.isFinite(leagueYear) || draftSeason >= leagueYear) return loaded;
  const activeTeamCount = (loaded?.teams ?? []).filter((team: any) => {
    const id = Number(team?.id ?? team?.tid);
    return Number.isFinite(id) && id >= 0 && id < 100 && team?.disabled !== true;
  }).length;
  const expectedSelections = activeTeamCount * 2;
  if (expectedSelections <= 0) return loaded;

  const completedSlots = new Set<number>();
  let currentProspectRemains = false;
  for (const player of loaded?.players ?? []) {
    const isProspect = player?.tid === -2 || player?.status === 'Prospect' || player?.status === 'Draft Prospect';
    if (isProspect && Number(player?.draft?.year) === draftSeason) currentProspectRemains = true;
    for (const transaction of player?.transactions ?? []) {
      if (transaction?.type !== 'draft' || Number(transaction?.season) !== draftSeason) continue;
      const pick = Number(transaction?.pickNum);
      if (Number.isFinite(pick) && pick > 0) completedSlots.add(pick);
    }
  }
  if (currentProspectRemains || completedSlots.size < expectedSelections) return loaded;

  console.log(`[LOAD_GAME] Recovered the completed ${draftSeason} NBA Draft from ${completedSlots.size} saved selections.`);
  return {
    ...loaded,
    draftComplete: true,
    offseasonChecklist: loaded?.offseasonChecklist
      ? { ...loaded.offseasonChecklist, draft: 'done' }
      : loaded?.offseasonChecklist,
  };
}

export function healPbaEconomySettings(leagueStats: any) {
  if (leagueStats?.uiMode !== 'pba_isolated') return leagueStats;
  let changed = false;
  const next = { ...leagueStats };
  const needsPlayerEconomyMigration =
    Number(next.pbaPlayerEconomyVersion ?? 0) !== PBA_PLAYER_ECONOMY_VERSION;
  const salaryCap = Number(next.salaryCap ?? 0);
  const minContract = Number(next.minContractStaticAmount ?? 0);
  if (!Number.isFinite(salaryCap) || salaryCap <= 0 || salaryCap >= PBA_LEGACY_ECONOMY_CAP_FLOOR) {
    next.salaryCap = PBA_ISOLATED_DEFAULTS.salaryCap;
    changed = true;
  }
  if (!Number.isFinite(minContract) || minContract <= 0 || minContract >= 0.25) {
    next.minContractStaticAmount = PBA_ISOLATED_DEFAULTS.minContractStaticAmount;
    changed = true;
  }
  if (Number(next.maxContractStaticPercentage ?? 0) < 30) {
    next.maxContractStaticPercentage = PBA_ISOLATED_DEFAULTS.maxContractStaticPercentage;
    changed = true;
  }
  if (
    needsPlayerEconomyMigration
    || !Number.isFinite(Number(next.historicalEconomyScale))
    || Number(next.historicalEconomyScale) <= 0
  ) {
    next.historicalEconomyScale = getPbaHistoricalEconomyFactor(Number(next.year));
    changed = true;
  }
  if (needsPlayerEconomyMigration) {
    next.pbaPlayerEconomyVersion = PBA_PLAYER_ECONOMY_VERSION;
    changed = true;
  }
  const forced = {
    salaryCapEnabled: false,
    salaryCapType: 'none',
    luxuryTaxEnabled: false,
    apronsEnabled: false,
    minimumPayrollEnabled: false,
    maxContractType: 'none',
    twoWayContractsEnabled: false,
    maxTwoWayPlayersPerTeam: 0,
    minPlayersPerTeam: next.minPlayersPerTeam ?? PBA_ISOLATED_DEFAULTS.minPlayersPerTeam,
    maxPlayersPerTeam: PBA_ISOLATED_DEFAULTS.maxPlayersPerTeam,
    maxStandardPlayersPerTeam: PBA_ISOLATED_DEFAULTS.maxStandardPlayersPerTeam,
    maxTrainingCampRoster: PBA_ISOLATED_DEFAULTS.maxTrainingCampRoster,
    mleEnabled: false,
    biannualEnabled: false,
    playerOptionsEnabled: false,
    inflationEnabled: false,
    pbaLocalEligibilityMode: next.pbaLocalEligibilityMode ?? PBA_ISOLATED_DEFAULTS.pbaLocalEligibilityMode,
    pbaLocalFreeAgencyDays: next.pbaLocalFreeAgencyDays ?? PBA_ISOLATED_DEFAULTS.pbaLocalFreeAgencyDays,
  };
  for (const [key, value] of Object.entries(forced)) {
    if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (changed) console.log('[LOAD_GAME] Healed PBA economy settings.');
  return changed ? next : leagueStats;
}

function dedupePlayerStats(stats: any[] | undefined) {
  if (!stats?.length) return stats ?? [];
  const grouped = new Map<string, any[]>();
  for (const row of stats) {
    const competition = String(row.competitionId ?? row.tag ?? row.league ?? '').toLowerCase();
    const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${competition}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  return Array.from(grouped.values()).map(rows =>
    rows.reduce((best, row) => ((row?.gp ?? 0) > (best?.gp ?? 0) ? row : best), rows[0]),
  );
}

function isBadPortrait(player: any) {
  if (!player.imgURL) return false;
  if (player.imgURL.includes('head-par-defaut')) return true;
  if (EXTERNAL_STATUSES_SET.has(player.status ?? '') && player.imgURL.includes('cdn.nba.com/headshots') && !player.srID) return true;
  return false;
}

function clampExternalLeaguePlayer(player: any) {
  if (player?.status === 'PBA') return player;
  const cap = EXTERNAL_LEAGUE_OVR_CAP[player?.status as keyof typeof EXTERNAL_LEAGUE_OVR_CAP];
  if (cap === undefined) return player;
  const overallRating = Math.min(Number(player?.overallRating ?? 0), cap);
  const ratings = Array.isArray(player?.ratings) ? [...player.ratings] : undefined;
  if (ratings?.length) {
    const lastIndex = ratings.length - 1;
    const last = ratings[lastIndex];
    if (last && typeof last.ovr === 'number' && last.ovr > cap) {
      ratings[lastIndex] = { ...last, ovr: cap };
    }
  }
  return {
    ...player,
    overallRating,
    ...(ratings ? { ratings } : {}),
  };
}

export function normalizeExternalLeagueRatingCaps(players: any[]): any[] {
  return players.map(clampExternalLeaguePlayer);
}

function recoverAmountFromContractYears(player: any, currentSeasonStr: string, saneGuaranteedCapUsd: number, saneContractCapThousands: number): number | undefined {
  const contractYears = player.contractYears as Array<{ season: string; guaranteed: number }> | undefined;
  if (!Array.isArray(contractYears) || contractYears.length === 0) return undefined;
  const exact = contractYears.find(entry => entry.season === currentSeasonStr);
  const candidates: number[] = [];
  if (exact && exact.guaranteed > 0 && exact.guaranteed <= saneGuaranteedCapUsd) {
    candidates.push(Math.round(exact.guaranteed / 1000));
  }
  for (const entry of contractYears) {
    if (entry === exact) continue;
    if (entry.guaranteed > 0 && entry.guaranteed <= saneGuaranteedCapUsd) {
      candidates.push(Math.round(entry.guaranteed / 1000));
    }
  }
  return candidates.find(value => value > 0 && value <= saneContractCapThousands);
}

function historyTime(value: unknown): number {
  const time = new Date(String(value ?? '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeContractYears(player: any, incoming: any[]): any[] {
  const incomingSeasons = new Set(incoming.map(row => String(row?.season ?? '')));
  return [
    ...(Array.isArray(player.contractYears) ? player.contractYears : []).filter((row: any) => !incomingSeasons.has(String(row?.season ?? ''))),
    ...incoming,
  ].sort((left, right) => String(left?.season ?? '').localeCompare(String(right?.season ?? '')));
}

function restoreSavedSigningContract(loaded: any, player: any, currentSeasonYear: number): any {
  if (player.tid < 0 || player.status !== 'Active') return player;
  const loadedTime = historyTime(loaded.date);
  const entries = (loaded.history ?? [])
    .filter((entry: any) => typeof entry === 'object'
      && entry?.type === 'Signing'
      && entry?.playerIds?.includes(player.internalId)
      && Number(entry?.tid) === Number(player.tid)
      && (!loadedTime || !historyTime(entry?.date) || historyTime(entry?.date) <= loadedTime))
    .sort((left: any, right: any) => historyTime(right?.date) - historyTime(left?.date));
  for (const entry of entries) {
    const saved = entry.contractTransaction;
    if (
      saved?.playerId === player.internalId
      && Number(saved?.teamId) === Number(player.tid)
      && Number(saved?.contract?.exp) > Number(player.contract?.exp ?? 0)
      && Array.isArray(saved.contractYears)
    ) {
      return {
        ...player,
        contract: { ...saved.contract },
        contractYears: mergeContractYears(player, saved.contractYears),
        salaries: mergePlayerSalaries(saved.salaries, player.salaries),
      };
    }

    if (Number(player.contract?.exp ?? 0) > currentSeasonYear) continue;
    const text = String(entry?.text ?? '');
    if (!text.toLowerCase().startsWith(`${String(player.name).toLowerCase()} re-signs with `)) continue;
    const match = text.match(/\$([\d.]+)\s*([mk])\s*\/\s*(\d+)\s*yr/i);
    if (!match) continue;
    const total = Number(match[1]) * (match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000);
    const guaranteedYears = Math.max(1, Number(match[3]) || 1);
    if (!Number.isFinite(total) || total <= 0 || guaranteedYears > 6) continue;
    const baseSalaryUSD = Math.round(total / guaranteedYears);
    const startSeason = currentSeasonYear + 1;
    const option = /player option/i.test(text) ? 'player' : /team option/i.test(text) ? 'team' : '';
    const totalSeasons = guaranteedYears + (option ? 1 : 0);
    const contractYears = Array.from({ length: totalSeasons }, (_, index) => ({
      season: `${startSeason + index - 1}-${String(startSeason + index).slice(-2)}`,
      guaranteed: Math.round(baseSalaryUSD * Math.pow(1.05, index)),
      option: index === totalSeasons - 1 ? option : '',
    }));
    const salaries = contractYears.map((row, index) => ({
      season: startSeason + index,
      amount: Math.round(row.guaranteed / 1_000),
      tid: player.tid,
      option: row.option || undefined,
    }));
    return {
      ...player,
      contract: {
        ...player.contract,
        exp: startSeason + totalSeasons - 1,
        hasPlayerOption: option === 'player' || undefined,
        hasTeamOption: option === 'team' || undefined,
        playerOptionExp: option === 'player' ? startSeason + totalSeasons - 1 : undefined,
        teamOptionExp: option === 'team' ? startSeason + totalSeasons - 1 : undefined,
      },
      contractYears: mergeContractYears(player, contractYears),
      salaries: mergePlayerSalaries(salaries, player.salaries),
    };
  }
  return player;
}

function restoreTournamentPlayerToDraftClass(
  loaded: any,
  player: any,
  currentSeasonYear: number,
  canonicalProspect?: any,
): any {
  const isHistoricalNba = loaded.leagueType === 'modded'
    && (loaded.moddedLeagueBase ?? 'nba') === 'nba'
    && isHistoricalNbaStart(Number(loaded.nbaStartYear ?? loaded.leagueStats?.historicalEraStartYear ?? 0));
  if (!isHistoricalNba || !isInternationalTournamentOnlyPlayer(player)) return player;
  const isLeakedFreeAgent = player.tid === -1 && player.status === 'Free Agent';
  const isRecoveredProspect = player.tid === -2 && player.status === 'Draft Prospect';
  if (!isLeakedFreeAgent && !isRecoveredProspect) return player;
  const bio = getVerifiedBioForPlayerIdentity(player);
  const draftYear = Number(canonicalProspect?.draft?.year ?? bio?.draftYear ?? 0);
  if (!Number.isFinite(draftYear) || draftYear <= currentSeasonYear) return player;
  const transactions = (player.transactions ?? []).filter((row: any) =>
    Number(row?.season) < currentSeasonYear || (row?.type !== 'freeAgent' && row?.type !== 'waive'),
  );
  return {
    ...player,
    ...(canonicalProspect?.personId ? { personId: canonicalProspect.personId } : {}),
    ...(canonicalProspect?.sourceIds ? { sourceIds: canonicalProspect.sourceIds } : {}),
    tid: -2,
    status: 'Draft Prospect',
    internationalTournamentOnly: undefined,
    draft: { year: draftYear, tid: -2, originalTid: -1, round: 0, pick: 0 },
    contract: undefined,
    contractYears: [],
    salaries: (player.salaries ?? []).filter((row: any) => Number(row?.season) < currentSeasonYear),
    transactions: [
      ...transactions,
      ...(!transactions.some((row: any) => row?.type === 'draftDeclaration' && Number(row?.season) === draftYear)
        ? [{ season: draftYear, tid: -2, type: 'draftDeclaration' }]
        : []),
    ],
    recentlyWaivedBy: undefined,
    recentlyWaivedDate: undefined,
    hasBirdRights: false,
    yearsWithTeam: 0,
    signedDate: undefined,
    tradeEligibleDate: undefined,
  };
}

export function healLoadedSigningContractsAndTournamentDraftClasses(
  loaded: any,
  players: any[],
  currentSeasonYear: number,
): any[] {
  const normalizedSurname = (name: unknown) => String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .at(-1);
  const futureProspects = (players ?? []).filter(player =>
    !isInternationalTournamentOnlyPlayer(player)
    && (player.tid === -2 || player.status === 'Draft Prospect')
    && Number(player.draft?.year ?? 0) > currentSeasonYear,
  );
  return (players ?? []).map(player => {
    const matches = isInternationalTournamentOnlyPlayer(player)
      ? futureProspects.filter(candidate =>
          Number(candidate.born?.year ?? 0) === Number(player.born?.year ?? 0)
          && normalizedSurname(candidate.name) === normalizedSurname(player.name),
        )
      : [];
    const restored = restoreTournamentPlayerToDraftClass(
      loaded,
      player,
      currentSeasonYear,
      matches.length === 1 ? matches[0] : undefined,
    );
    return restoreSavedSigningContract(loaded, restored, currentSeasonYear);
  });
}

export function migrateLoadedPlayers(loaded: any, currentSeasonYear: number) {
  const currentSeasonStr = `${currentSeasonYear - 1}-${String(currentSeasonYear).slice(-2)}`;
  const saneContractCapThousands = 250_000;
  const saneGuaranteedCapUsd = 250_000_000;
  const pbaDraftRoundSize = loaded.leagueStats?.uiMode === 'pba_isolated'
    ? Math.max(1, (loaded.nonNBATeams ?? []).filter((team: any) => team?.league === 'PBA').length || 12)
    : 30;
  let normalizedFreeAgentTypoCount = 0;
  let healedWaivedGhostContractCount = 0;
  const isWnbaIsolated = loaded.leagueStats?.uiMode === 'wnba_isolated'
    || loaded.moddedLeagueBase === 'wnba';
  const wnbaCoreStatuses = new Set(['Active', 'Free Agent', 'Waived', 'Retired', 'Draft Prospect', 'Prospect', 'WNBA']);
  const { playerScope, activeTeamIds } = resolveSeasonRolloverPlayerScope(loaded as GameState);

  const migratedPlayers = (loaded.players as any[] | undefined)?.map(player => {
    const isWnbaCoreIdentity = isWnbaIsolated && (
      (Number(player?.tid) >= 0 && Number(player?.tid) < 100)
      || wnbaCoreStatuses.has(String(player?.status ?? ''))
    );
    const externalLeague = isWnbaCoreIdentity
      ? 'WNBA'
      : player?.status === 'PBA' && /^pba-\d+-/.test(String(player?.internalId ?? ''))
        ? 'PBA'
        : String(player?.status ?? '');
    const catalogPortrait = getCachedExternalPortraitForName(externalLeague, player.name, currentSeasonYear);
    const pbaPortrait = externalLeague === 'PBA'
      ? catalogPortrait ?? getPbaRosterPortrait(player.name, currentSeasonYear)
      : undefined;
    const preferredPortrait = catalogPortrait ?? pbaPortrait;
    const replaceablePortrait = !player.imgURL
      || isBadPortrait(player)
      || isDefaultProballers(String(player.imgURL))
      || isLowQualityPlayerPortrait(String(player.imgURL));
    let updated = preferredPortrait && replaceablePortrait
      ? { ...player, imgURL: preferredPortrait }
      : isBadPortrait(player) ? { ...player, imgURL: undefined } : player;
    const isWnbaCorePlayer = isWnbaIsolated && (
      (Number(updated.tid) >= 0 && Number(updated.tid) < 100)
      || wnbaCoreStatuses.has(String(updated.status ?? ''))
    );
    if (isWnbaCorePlayer) {
      updated = { ...updated, imgURL: resolveWnbaPlayerPortrait(updated.imgURL) };
    }
    updated = restoreTournamentPlayerToDraftClass(loaded, updated, currentSeasonYear);
    updated = restoreSavedSigningContract(loaded, updated, currentSeasonYear);
    updated = repairGeneratedExternalPlayer(updated as any, currentSeasonYear) as any;
    updated = clampExternalLeaguePlayer(updated);
    const isBackgroundNbaPlayerInPbaSave = loaded.leagueStats?.uiMode === 'pba_isolated'
      && Number(updated.tid) >= 0
      && Number(updated.tid) < 100
      && updated.status !== 'PBA';
    const isReleasedPbaImportInPbaSave = loaded.leagueStats?.uiMode === 'pba_isolated'
      && Number(updated.tid) === -1
      && updated.status === 'Free Agent'
      && Array.isArray(updated.pbaImportHistory)
      && updated.pbaImportHistory.length > 0;
    const isActiveLeaguePlayer = isPlayerInLeagueScope(updated, playerScope, activeTeamIds);
    if (isActiveLeaguePlayer && !isBackgroundNbaPlayerInPbaSave && !isReleasedPbaImportInPbaSave && updated.contract && Array.isArray(updated.contractYears)) {
      updated = syncPlayerContractAmountForSeason(updated, currentSeasonYear);
    }
    if (
      updated.contract?.rookie &&
      updated.draft?.round && updated.draft?.pick &&
      updated.draft?.year &&
      typeof updated.contract.amount === 'number' &&
      updated.contract.amount > saneContractCapThousands
    ) {
      const round = Number(updated.draft.round);
      const pickInRound = Number(updated.draft.pick);
      const pickSlot = (round - 1) * pbaDraftRoundSize + pickInRound;
      const fixedUsd = computeRookieSalaryUSD(pickSlot, loaded.leagueStats, pbaDraftRoundSize);
      const fixedAmount = Math.round(fixedUsd / 1000);
      const draftYear = Number(updated.draft.year);
      const expYear = Number(updated.contract.exp ?? 0);
      const totalYears = expYear > draftYear && expYear - draftYear <= 6 ? expYear - draftYear : null;
      const teamOptionExp = updated.contract.teamOptionExp;
      const firstOptionYear = updated.contract.hasTeamOption && teamOptionExp ? Number(teamOptionExp) : undefined;
      const rebuiltContractYears = totalYears
        ? Array.from({ length: totalYears }, (_, i) => {
            const year = draftYear + i;
            const leagueYear = year + 1;
            return {
              season: `${year}-${String(year + 1).slice(-2)}`,
              guaranteed: Math.round(fixedUsd * Math.pow(1.05, i)),
              option: firstOptionYear != null && leagueYear >= firstOptionYear ? 'Team' : '',
            };
          })
        : updated.contractYears;
      console.warn(`[LOAD_GAME] Repaired inflated rookie contract for ${updated.name}: ${updated.contract.amount} → ${fixedAmount}`);
      updated = {
        ...updated,
        contract: { ...updated.contract, amount: fixedAmount },
        ...(rebuiltContractYears ? { contractYears: rebuiltContractYears } : {}),
      };
    }
    const amount = updated.contract?.amount;
    if (updated.contract && typeof amount === 'number' && (amount > saneContractCapThousands || amount < 0 || !Number.isFinite(amount))) {
      const recovered = recoverAmountFromContractYears(updated, currentSeasonStr, saneGuaranteedCapUsd, saneContractCapThousands) ?? 1300;
      console.warn(`[LOAD_GAME] Repaired corrupt contract.amount for ${updated.name}: ${amount} → ${recovered}`);
      updated = { ...updated, contract: { ...updated.contract, amount: recovered } };
    }
    const liveContractYears = Array.isArray(updated.contractYears)
      ? updated.contractYears.filter((contractYear: any) => {
          const seasonStart = parseInt(String(contractYear?.season ?? '').split('-')[0], 10);
          return Number.isFinite(seasonStart) && seasonStart + 1 >= currentSeasonYear;
        })
      : [];
    const currentSeasonContractYear = liveContractYears.find((contractYear: any) => contractYear.season === currentSeasonStr)
      ?? liveContractYears[0];
    const currentGuaranteedUSD = Number(currentSeasonContractYear?.guaranteed ?? 0);
    const currentOptionKind = normalizeContractOptionKind(currentSeasonContractYear?.option);
    const finalLiveContractYear = liveContractYears[liveContractYears.length - 1];
    const finalOptionKind = normalizeContractOptionKind(finalLiveContractYear?.option);
    const finalContractYear = seasonLabelToYear(String(finalLiveContractYear?.season ?? ''));
    const hasCompleteContractYearCoverage = Number.isFinite(finalContractYear)
      && finalContractYear >= Number(updated.contract?.exp ?? Number.POSITIVE_INFINITY);
    if (
      updated.contract
      && finalLiveContractYear
      && (hasCompleteContractYearCoverage || finalOptionKind === 'player' || finalOptionKind === 'team')
    ) {
      const optionExp = seasonLabelToYear(String(finalLiveContractYear?.season ?? ''));
      updated = {
        ...updated,
        contract: {
          ...updated.contract,
          hasPlayerOption: finalOptionKind === 'player' || undefined,
          hasTeamOption: finalOptionKind === 'team' || undefined,
          teamOptionExp: finalOptionKind === 'team' && Number.isFinite(optionExp) ? optionExp : undefined,
        },
      };
    }
    if (currentOptionKind === 'twoWay' && !hasTwoWayContractMarker(updated)) {
      updated = { ...updated, twoWay: true, contract: { ...updated.contract, type: 'TWO_WAY' } };
    }
    if (currentOptionKind === 'nonGuaranteed' && !updated.nonGuaranteed) {
      updated = { ...updated, nonGuaranteed: true };
    }
    const shouldInferLegacyTwoWay =
      loaded.leagueStats?.uiMode !== 'euro_isolated' &&
      !hasTwoWayContractMarker(updated) &&
      !updated.nonGuaranteed &&
      updated.tid >= 0 &&
      updated.status === 'Active' &&
      !updated.contract?.rookie &&
      (updated.contract?.amount ?? 0) > 0 &&
      (updated.contract?.amount ?? 9999) <= 700 &&
      currentGuaranteedUSD > 0 &&
      currentGuaranteedUSD <= 700_000 &&
      liveContractYears.length <= 1;
    if (shouldInferLegacyTwoWay) {
      updated = { ...updated, twoWay: true, contract: { ...updated.contract, type: 'TWO_WAY' } };
    }
    const persistentPortrait = isWnbaCorePlayer
      ? resolveWnbaPlayerPortrait(updated.imgURL)
      : resolvePersistentPlayerImage(updated as any);
    if (persistentPortrait && persistentPortrait !== updated.imgURL) {
      updated = { ...updated, imgURL: persistentPortrait };
    }
    if ((updated as any).status === 'FreeAgent') {
      updated = { ...updated, status: 'Free Agent' };
      normalizedFreeAgentTypoCount++;
    }
    if (updated.tid === -1 && updated.status === 'Free Agent' && updated.recentlyWaivedDate && !isReleasedPbaImportInPbaSave) {
      if (hasLiveContractAfterWaive(updated, currentSeasonYear)) {
        healedWaivedGhostContractCount++;
        updated = {
          ...stripLiveContractAfterWaive(updated, currentSeasonYear),
          twoWay: undefined,
          nonGuaranteed: false,
          gLeagueAssigned: false,
          mleSignedVia: undefined,
          baeSignedVia: undefined,
          hasBirdRights: false,
          yearsWithTeam: 0,
          signedDate: undefined,
          tradeEligibleDate: undefined,
        };
      }
    }
    if (updated.contract?.rookie && updated.contract.hasTeamOption && updated.draft?.year) {
      const draftYear = Number(updated.draft.year);
      const guaranteedYears = loaded.leagueStats?.rookieContractLength ?? 2;
      const optionYears = loaded.leagueStats?.rookieTeamOptionYears ?? 2;
      const latestRookieContractExpiry = draftYear + guaranteedYears + optionYears;
      if (
        updated.contract.teamOptionExp === draftYear + guaranteedYears
        && Number(updated.contract.exp ?? 0) <= latestRookieContractExpiry
      ) {
        updated = {
          ...updated,
          contract: {
            ...updated.contract,
            teamOptionExp: draftYear + guaranteedYears + 1,
            exp: (updated.contract.exp ?? 0) + 1,
          },
        };
      }
    }
    if (
      updated.contract?.rookie &&
      updated.draft?.year &&
      updated.contract?.exp &&
      (!Array.isArray(updated.contractYears) || updated.contractYears.length === 0)
    ) {
      const draftYear = Number(updated.draft.year);
      const expYear = Number(updated.contract.exp);
      const totalYears = expYear - draftYear;
      if (totalYears > 0 && totalYears <= 6) {
        const baseUsd = (updated.contract.amount ?? 0) * 1000;
        if (baseUsd > 0) {
          const teamOptionExp = updated.contract.teamOptionExp as number | undefined;
          const firstOptionYear = updated.contract.hasTeamOption && teamOptionExp ? teamOptionExp : undefined;
          const backfilled = Array.from({ length: totalYears }, (_, i) => {
            const year = draftYear + i;
            const leagueYear = year + 1;
            return {
              season: `${year}-${String(year + 1).slice(-2)}`,
              guaranteed: Math.round(baseUsd * Math.pow(1.05, i)),
              option: firstOptionYear != null && leagueYear >= firstOptionYear ? 'Team' : '',
            };
          });
          updated = { ...updated, contractYears: backfilled };
        }
      }
    }
    if (
      updated.tid >= 0 && updated.tid < 100 &&
      updated.contract?.amount &&
      updated.contract?.exp &&
      (!Array.isArray((updated as any).contractYears) || (updated as any).contractYears.length === 0) &&
      !updated.contract.rookie
    ) {
      const exp = updated.contract.exp as number;
      const amountValue = updated.contract.amount as number;
      if (amountValue > 0 && exp >= currentSeasonYear) {
        const salaryUsd = amountValue * 1_000;
        const backfilled = Array.from({ length: exp - currentSeasonYear + 1 }, (_, i) => {
          const year = currentSeasonYear + i;
          return {
            season: `${year - 1}-${String(year).slice(-2)}`,
            guaranteed: Math.round(salaryUsd * Math.pow(1.05, i)),
            option: '',
          };
        });
        updated = { ...updated, contractYears: backfilled } as any;
      }
    }
    if ((updated as any).status === 'Retired' && !(updated as any).diedYear) {
      const currentAge = currentSeasonYear - ((updated as any).born?.year ?? 2000);
      if (currentAge > 95) {
        const assumedDeathAge = Math.max(85, currentAge - 8);
        updated = { ...updated, diedYear: ((updated as any).born?.year ?? 2000) + assumedDeathAge } as any;
      }
    }
    return updated;
  }) ?? loaded.players;

  if (normalizedFreeAgentTypoCount > 0) {
    console.log(`[LOAD_GAME] Healed ${normalizedFreeAgentTypoCount} legacy 'FreeAgent' status records → 'Free Agent'.`);
  }
  if (healedWaivedGhostContractCount > 0) {
    console.log(`[LOAD_GAME] Healed ${healedWaivedGhostContractCount} waived FA ghost contract(s).`);
  }

  return migratedPlayers;
}


function isFilipinoPbaPlayer(player: any): boolean {
  const explicit = String(player?.born?.country ?? player?.nationality ?? '').toLowerCase();
  const loc = String(player?.born?.loc ?? '').toLowerCase();
  return explicit.includes('philippines') || loc.includes('philippines');
}

function hasPbaNationalityInfo(player: any): boolean {
  return Boolean(player?.born?.country || player?.nationality || player?.born?.loc);
}

function currentSeasonLabel(seasonYear: number) {
  return `${seasonYear - 1}-${String(seasonYear).slice(-2)}`;
}

function rebuildLiveContractYears(player: any, currentSeasonYear: number, salaryUSD: number) {
  const exp = Math.max(Number(player?.contract?.exp ?? currentSeasonYear), currentSeasonYear);
  const currentLabel = currentSeasonLabel(currentSeasonYear);
  const liveSeasonSet = new Set<string>();
  const patched = Array.isArray(player?.contractYears)
    ? player.contractYears.map((row: any) => {
        const seasonStart = parseInt(String(row?.season ?? '').split('-')[0], 10);
        const seasonYear = Number.isFinite(seasonStart) ? seasonStart + 1 : 0;
        if (seasonYear < currentSeasonYear || seasonYear > exp) return row;
        liveSeasonSet.add(row.season);
        const idx = Math.max(0, seasonYear - currentSeasonYear);
        return {
          ...row,
          guaranteed: Math.round(salaryUSD * Math.pow(1.05, idx)),
        };
      })
    : [];
  const additions = Array.from({ length: exp - currentSeasonYear + 1 }, (_, i) => {
    const seasonYear = currentSeasonYear + i;
    const season = currentSeasonLabel(seasonYear);
    if (liveSeasonSet.has(season)) return null;
    return {
      season,
      guaranteed: Math.round(salaryUSD * Math.pow(1.05, i)),
      option: '',
    };
  }).filter(Boolean);
  if (patched.length === 0 && additions.length === 0) {
    return [{
      season: currentLabel,
      guaranteed: salaryUSD,
      option: '',
    }];
  }
  return [...patched, ...additions].sort((a: any, b: any) => String(a.season).localeCompare(String(b.season)));
}

export function healLoadedPbaContracts(players: any[], leagueStats: any, currentSeasonYear: number, nonNBATeams: any[] = []) {
  if (leagueStats?.uiMode !== 'pba_isolated') return players;
  const pbaTeamIds = new Set((nonNBATeams ?? []).filter((team: any) => team?.league === 'PBA').map((team: any) => Number(team?.tid ?? team?.id)));
  let healed = 0;
  const nextPlayers = (players ?? []).map((player: any) => {
    if (Number(player?.tid ?? -1) < 0) return player;
    const isPbaPlayer = player.status === 'PBA' || pbaTeamIds.has(Number(player.tid));
    if (!isPbaPlayer) return player;
    const currentSalaryUSD = Number(player.contract?.amount ?? 0) * 1_000;
    const hasCurrentEconomyContract =
      Number(player.contract?.pbaEconomyVersion ?? 0) === PBA_PLAYER_ECONOMY_VERSION
      && Number.isFinite(currentSalaryUSD)
      && currentSalaryUSD > 0;
    const registeredLocal = isFilipinoPbaPlayer(player) || isRegisteredPbaRosterIdentity(player);
    const staleLocalFlag = !!player.pbaLocalEligible && !registeredLocal;
    const classificationPlayer = staleLocalFlag ? { ...player, pbaLocalEligible: undefined } : player;
    const explicitImport = !!player.isImport || !isPbaRosterLocal(classificationPlayer, leagueStats);
    const currentConference = String(player.importConference ?? leagueStats?.pbaConference ?? '');
    const canRestoreConferenceImport = currentConference === 'commissioners' || currentConference === 'governors';
    const shouldRestoreImport = explicitImport && pbaTeamIds.has(Number(player.tid)) && canRestoreConferenceImport;
    if (shouldRestoreImport && !isPbaActiveConferencePhase(leagueStats?.pbaConferencePhase)) {
      healed++;
      return {
        ...player,
        ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
        tid: -1,
        status: 'Free Agent',
        isImport: undefined,
        importConference: undefined,
        importTeamId: undefined,
        pbaImportContract: {
          ...(player.pbaImportContract ?? {}),
          status: 'released',
          releaseDate: player.pbaImportContract?.releaseDate ?? undefined,
        },
        contract: undefined,
      };
    }
    const hasActiveConferenceImportContract =
      shouldRestoreImport &&
      !!player.pbaImportContract &&
      player.pbaImportContract.status !== 'released';
    if (hasActiveConferenceImportContract) {
      const importIdentityNeedsRepair =
        staleLocalFlag
        || !player.isImport
        || player.importConference !== currentConference
        || Number(player.importTeamId ?? player.tid) !== Number(player.tid);
      if (!importIdentityNeedsRepair && hasCurrentEconomyContract) return player;
      const range = getPbaImportOfferRange(player, leagueStats, currentConference as any);
      const targetSalaryUSD = clampPbaImportOfferSalary(
        currentSalaryUSD > 0 ? currentSalaryUSD : range.marketSalaryUSD,
        player,
        leagueStats,
        currentConference as any,
      );
      const exp = Math.max(Number(player.contract?.exp ?? currentSeasonYear), currentSeasonYear);
      const contractPlayer = {
        ...player,
        contract: { ...(player.contract ?? {}), exp },
      };
      healed++;
      return {
        ...player,
        ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
        isImport: true,
        importConference: currentConference,
        importTeamId: Number(player.tid),
        pbaImportContract: player.pbaImportContract,
        contract: {
          ...(player.contract ?? {}),
          amount: Math.round(targetSalaryUSD / 1_000),
          exp,
          type: 'PBA_IMPORT',
          pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
          pbaSalarySource: 'import',
        },
        contractYears: rebuildLiveContractYears(contractPlayer, currentSeasonYear, targetSalaryUSD),
      };
    }
    const isImport = explicitImport;
    const localIdentityNeedsRepair =
      staleLocalFlag
      || (!explicitImport && registeredLocal && player.pbaLocalEligible !== true);
    if (hasCurrentEconomyContract && !localIdentityNeedsRepair) return player;
    if (hasCurrentEconomyContract) {
      healed++;
      return {
        ...player,
        ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
        ...(!explicitImport && registeredLocal ? { pbaLocalEligible: true } : {}),
      };
    }
    const limits = getContractLimits(player, leagueStats);
    const offer = computeContractOffer(player, leagueStats);
    const ratings = Array.isArray(player.ratings) ? player.ratings : [];
    const pbaOvr = Number(player.overallRating ?? ratings[ratings.length - 1]?.ovr ?? 55);
    const pbaEconomy = getPBARosterEconomyConfig(leagueStats, 'pba_isolated');
    const targetSalaryUSD = isImport
      ? Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, offer.salaryUSD))
      : computeLocalPBASalaryUSD(pbaOvr, pbaEconomy, player, currentSeasonYear);
    const exp = Math.max(
      Number(player.contract?.exp ?? currentSeasonYear + Math.max(1, offer.years) - 1),
      currentSeasonYear,
    );
    const contractPlayer = {
      ...player,
      contract: { ...(player.contract ?? {}), exp },
    };
    healed++;
    return {
      ...player,
      ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
      ...(!explicitImport && registeredLocal ? { pbaLocalEligible: true } : {}),
      ...(shouldRestoreImport ? {
        isImport: true,
        importConference: currentConference,
        importTeamId: Number(player.tid),
        pbaImportContract: player.pbaImportContract ?? buildPbaImportContractMetadata(Number(player.tid), currentConference as any, undefined),
      } : {}),
      contract: {
        ...(player.contract ?? {}),
        amount: Math.round(targetSalaryUSD / 1_000),
        exp,
        pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
        pbaSalarySource: isImport ? 'import' : 'generated',
      },
      contractYears: rebuildLiveContractYears(contractPlayer, currentSeasonYear, targetSalaryUSD),
    };
  });
  if (healed > 0) console.log(`[LOAD_GAME] Healed ${healed} PBA contract salary row(s).`);
  return nextPlayers;
}

export function healLoadedPbaDraftProspects(players: any[], leagueStats: any, currentSeasonYear: number) {
  if (leagueStats?.uiMode !== 'pba_isolated') return players;
  return tunePbaDraftProspects(players as any, currentSeasonYear, leagueStats);
}

export function healCompletedNbaDraftUndraftedFreeAgents(players: any[], loaded: any, currentSeasonYear: number) {
  const isNba = loaded?.leagueType === 'modded' && (loaded?.moddedLeagueBase ?? 'nba') === 'nba';
  if (!isNba || !loaded?.draftComplete || isNoDraftLeague(loaded?.leagueStats)) return players;
  let healed = 0;
  const nextPlayers = (players ?? []).map((player: any) => {
    const isProspectState = player?.tid === -2 || player?.status === 'Prospect' || player?.status === 'Draft Prospect';
    if (!isProspectState) return player;
    const isBranchDraftSelection = Number(player?.tid) >= 0
      && Number(player?.draft?.round ?? 0) > 0
      && Number(player?.draft?.pick ?? 0) > 0;
    if (isBranchDraftSelection) return player;
    const rawDraftYear = Number(player?.draft?.year ?? 0);
    const draftYear = Number.isFinite(rawDraftYear) && rawDraftYear > 0 ? rawDraftYear : currentSeasonYear;
    if (draftYear > currentSeasonYear) return player;
    const transactions = Array.isArray(player?.transactions) ? player.transactions : [];
    const hasUndraftedTx = transactions.some((tx: any) =>
      tx?.type === 'draft' &&
      Number(tx?.season) === draftYear &&
      Number(tx?.pickNum ?? -1) === 0
    );
    const rawOverall = Number(player?.overallRating ?? UNDRAFTED_OVR_CAP);
    healed++;
    return {
      ...player,
      overallRating: Number.isFinite(rawOverall) ? Math.min(rawOverall, UNDRAFTED_OVR_CAP) : UNDRAFTED_OVR_CAP,
      tid: -1,
      status: 'Free Agent',
      transactions: hasUndraftedTx
        ? transactions
        : [...transactions, { season: draftYear, tid: -1, type: 'draft', phase: 0, pickNum: 0 }],
      draft: { ...(player?.draft ?? {}), round: 0, pick: 0, year: draftYear, tid: -1, originalTid: -1 },
    };
  });
  if (healed > 0) console.log(`[LOAD_GAME] Healed ${healed} completed-draft prospect(s) into undrafted free agents.`);
  return nextPlayers;
}

export function finalizeLoadedPlayers(loaded: any, players: any[], currentSeasonYear: number) {
  let healedPhantomUserRosterCount = 0;
  const loadedPlayers = (players as any[]).map((player: any) => {
    const userTid = loaded.gameMode === 'gm' ? Number(loaded.userTeamId) : -999;
    const normalizedStats = dedupePlayerStats(player.stats);
    if (!Number.isFinite(userTid) || player.tid !== userTid || player.status !== 'Free Agent') {
      return normalizedStats === player.stats ? player : { ...player, stats: normalizedStats };
    }
    const hasCommittedContract =
      !!player.contract &&
      Number(player.contract.amount ?? 0) > 0 &&
      Number(player.contract.exp ?? 0) >= currentSeasonYear;
    if (hasCommittedContract) {
      return normalizedStats === player.stats ? player : { ...player, stats: normalizedStats };
    }
    healedPhantomUserRosterCount++;
    return {
      ...player,
      stats: normalizedStats,
      tid: -1,
      twoWay: undefined,
      nonGuaranteed: false,
      gLeagueAssigned: false,
      signedDate: undefined,
      tradeEligibleDate: undefined,
    };
  });
  if (healedPhantomUserRosterCount > 0) {
    console.warn(`[LOAD_GAME] Released ${healedPhantomUserRosterCount} phantom user-roster FA(s) back to free agency.`);
  }

  const finalPlayers = loadedPlayers.map((player: any) => {
    const repaired = repairBirdRightsForLoadedPlayer(player);
    const rebuiltYearsWithTeam = resolveYearsWithCurrentTeamFromStats(repaired);
    return rebuiltYearsWithTeam === Number((repaired as any).yearsWithTeam ?? 0)
      ? repaired
      : { ...repaired, yearsWithTeam: rebuiltYearsWithTeam };
  });

  const allHistoricalCups = Object.values((loaded.nbaCupHistory ?? {}) as Record<string, any>);
  if (loaded.nbaCup?.mvpPlayerId) allHistoricalCups.push(loaded.nbaCup);
  const backfilledPlayers = allHistoricalCups.reduce(
    (acc: any[], cup: any) => cup?.mvpPlayerId || cup?.allTournamentTeam?.length || cup?.championTid != null
      ? applyCupAwardsToPlayers(cup, acc, loaded.leagueStats)
      : acc,
    finalPlayers,
  );

  return { finalPlayers, backfilledPlayers };
}

const normalizeDuplicateName = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const playerCareerGames = (player: any): number =>
  Array.isArray(player?.stats)
    ? player.stats.reduce((sum: number, stat: any) => sum + Number(stat?.gp ?? 0), 0)
    : 0;

const duplicatePriority = (player: any, currentSeasonYear: number): number => {
  const draftYear = Number(player?.draft?.year ?? 0);
  const currentClassPenalty = Number.isFinite(draftYear) && draftYear >= currentSeasonYear ? -2000 : 0;
  const prospectPenalty = player?.tid === -2 || player?.status === 'Draft Prospect' || player?.status === 'Prospect' ? -1500 : 0;
  const activeBonus = player?.tid >= 0 ? 400 : 0;
  const pbaBonus = player?.status === 'PBA' ? 250 : 0;
  const gamesBonus = playerCareerGames(player);
  const ageBonus = Number(player?.age ?? 0);
  return currentClassPenalty + prospectPenalty + activeBonus + pbaBonus + gamesBonus + ageBonus;
};

const makeUniqueDuplicateId = (baseId: string, usedIds: Set<string>): string => {
  let attempt = 2;
  let candidate = `${baseId}--dup-${attempt}`;
  while (usedIds.has(candidate)) {
    attempt += 1;
    candidate = `${baseId}--dup-${attempt}`;
  }
  usedIds.add(candidate);
  return candidate;
};

export function healDuplicatePlayerInternalIds(players: any[], boxScores: any[], currentSeasonYear: number) {
  const groups = new Map<string, any[]>();
  for (const player of players ?? []) {
    const id = String(player?.internalId ?? '');
    if (!id) continue;
    const bucket = groups.get(id) ?? [];
    bucket.push(player);
    groups.set(id, bucket);
  }

  const duplicateGroups = [...groups.entries()].filter(([, bucket]) => bucket.length > 1);
  if (duplicateGroups.length === 0) {
    return { players, boxScores };
  }

  const usedIds = new Set(
    (players ?? [])
      .map((player: any) => String(player?.internalId ?? ''))
      .filter((id: string) => id.length > 0),
  );
  const replacementByPlayer = new Map<any, string>();
  const metaByOldId = new Map<string, Array<{ currentId: string; nameKey: string; tid: number }>>();
  let renamedPlayers = 0;

  for (const [oldId, bucket] of duplicateGroups) {
    const ordered = [...bucket].sort((a, b) => duplicatePriority(b, currentSeasonYear) - duplicatePriority(a, currentSeasonYear));
    const canonical = ordered[0];
    const meta: Array<{ currentId: string; nameKey: string; tid: number }> = [{
      currentId: oldId,
      nameKey: normalizeDuplicateName(canonical?.name),
      tid: Number(canonical?.tid ?? NaN),
    }];
    for (let index = 1; index < ordered.length; index++) {
      const player = ordered[index];
      const nextId = makeUniqueDuplicateId(oldId, usedIds);
      replacementByPlayer.set(player, nextId);
      meta.push({
        currentId: nextId,
        nameKey: normalizeDuplicateName(player?.name),
        tid: Number(player?.tid ?? NaN),
      });
      renamedPlayers += 1;
    }
    metaByOldId.set(oldId, meta);
  }

  const healedPlayers = (players ?? []).map((player: any) =>
    replacementByPlayer.has(player)
      ? { ...player, internalId: replacementByPlayer.get(player) }
      : player,
  );

  const resolveDuplicateStatId = (oldId: string, stat: any, teamId: number): string => {
    const meta = metaByOldId.get(oldId);
    if (!meta) return oldId;
    const statNameKey = normalizeDuplicateName(stat?.name);
    const nameMatches = statNameKey ? meta.filter(entry => entry.nameKey === statNameKey) : [];
    if (nameMatches.length === 1) return nameMatches[0].currentId;
    const teamMatches = (nameMatches.length > 0 ? nameMatches : meta).filter(entry => entry.tid === teamId);
    if (teamMatches.length === 1) return teamMatches[0].currentId;
    return oldId;
  };

  const resolveDuplicateMapKey = (oldId: string, homeTeamId: number, awayTeamId: number): string => {
    const meta = metaByOldId.get(oldId);
    if (!meta) return oldId;
    const homeMatches = meta.filter(entry => entry.tid === homeTeamId);
    if (homeMatches.length === 1) return homeMatches[0].currentId;
    const awayMatches = meta.filter(entry => entry.tid === awayTeamId);
    if (awayMatches.length === 1) return awayMatches[0].currentId;
    return oldId;
  };

  let rewiredStats = 0;
  let rewiredMaps = 0;
  const rewriteSideStats = (stats: any[], teamId: number) =>
    (stats ?? []).map((stat: any) => {
      const oldId = String(stat?.playerId ?? '');
      if (!metaByOldId.has(oldId)) return stat;
      const nextId = resolveDuplicateStatId(oldId, stat, teamId);
      if (nextId === oldId) return stat;
      rewiredStats += 1;
      return { ...stat, playerId: nextId };
    });

  const rewriteKeyedMap = (map: Record<string, any> | undefined, homeTeamId: number, awayTeamId: number) => {
    if (!map || typeof map !== 'object') return map;
    let changed = false;
    const next: Record<string, any> = {};
    for (const [key, value] of Object.entries(map)) {
      const nextKey = metaByOldId.has(key) ? resolveDuplicateMapKey(key, homeTeamId, awayTeamId) : key;
      if (nextKey !== key) {
        rewiredMaps += 1;
        changed = true;
      }
      next[nextKey] = value;
    }
    return changed ? next : map;
  };

  const healedBoxScores = (boxScores ?? []).map((box: any) => {
    const homeStats = rewriteSideStats(box?.homeStats ?? [], Number(box?.homeTeamId ?? NaN));
    const awayStats = rewriteSideStats(box?.awayStats ?? [], Number(box?.awayTeamId ?? NaN));
    const playerDNPs = rewriteKeyedMap(box?.playerDNPs, Number(box?.homeTeamId ?? NaN), Number(box?.awayTeamId ?? NaN));
    const playerInGameInjuries = rewriteKeyedMap(box?.playerInGameInjuries, Number(box?.homeTeamId ?? NaN), Number(box?.awayTeamId ?? NaN));
    const playersPlayingHurt = rewriteKeyedMap(box?.playersPlayingHurt, Number(box?.homeTeamId ?? NaN), Number(box?.awayTeamId ?? NaN));
    if (
      homeStats === box?.homeStats &&
      awayStats === box?.awayStats &&
      playerDNPs === box?.playerDNPs &&
      playerInGameInjuries === box?.playerInGameInjuries &&
      playersPlayingHurt === box?.playersPlayingHurt
    ) {
      return box;
    }
    return {
      ...box,
      homeStats,
      awayStats,
      playerDNPs,
      playerInGameInjuries,
      playersPlayingHurt,
    };
  });

  console.warn(
    `[LOAD_GAME] Healed ${duplicateGroups.length} duplicate player internalId group(s); renamed ${renamedPlayers} player(s), rewired ${rewiredStats} box-score row(s), ${rewiredMaps} keyed map entr${rewiredMaps === 1 ? 'y' : 'ies'}.`,
  );

  return { players: healedPlayers, boxScores: healedBoxScores };
}

export function healLoadedDraftPicks(loaded: any, currentSeasonYear: number) {
  let draftPicks = Array.isArray(loaded?.draftPicks) ? loaded.draftPicks : [];
  const noDraft = isNoDraftLeague(loaded?.leagueStats);
  const windowFallback = loaded?.leagueType === 'modded' && loaded?.moddedLeagueBase === 'philippines'
    ? 3
    : DEFAULT_TRADABLE_PICK_SEASONS;
  const windowSize = Number(loaded?.leagueStats?.tradableDraftPickSeasons ?? windowFallback);
  const includeActiveDraft = !loaded?.draftComplete;
  if (!noDraft && loaded?.leagueStats?.uiMode !== 'euro_isolated') {
    const nbaTeamIds = (loaded?.teams ?? [])
      .filter((team: any) => Number(team?.id) >= 0 && Number(team?.id) < 100)
      .map((team: any) => Number(team.id))
      .filter((tid: number) => Number.isFinite(tid));

    if (nbaTeamIds.length > 0) {
      const before = draftPicks.length;
      draftPicks = generateFuturePicksForTeamIds(
        draftPicks,
        nbaTeamIds,
        currentSeasonYear,
        windowSize,
        getDraftRoundsForLeague(loaded?.leagueStats),
        includeActiveDraft,
      );
      if (draftPicks.length > before) {
        console.log(`[LOAD_GAME] Healed ${draftPicks.length - before} missing NBA draft pick(s).`);
      }
    }
  }

  if (loaded?.leagueType !== 'modded' || loaded?.moddedLeagueBase !== 'philippines') return draftPicks;

  const pbaTeamIds = (loaded?.nonNBATeams ?? [])
    .filter((team: any) => team?.league === 'PBA')
    .map((team: any) => Number(team?.tid))
    .filter((tid: number) => Number.isFinite(tid));

  if (pbaTeamIds.length === 0) return draftPicks;

  const healedDraftPicks = generateDraftPicksForTeamIdsAndSeasons(
    draftPicks,
    pbaTeamIds,
    getPbaDraftPickYears(currentSeasonYear, windowSize, includeActiveDraft),
    2,
  );
  if (healedDraftPicks.length > draftPicks.length) {
    console.log(`[LOAD_GAME] Healed ${healedDraftPicks.length - draftPicks.length} missing PBA draft pick(s).`);
  }
  return healedDraftPicks;
}

export function migrateLeagueStats(loaded: any) {
  const loadedLeagueStats = loaded.leagueStats ?? {};
  const migratedLeagueStats = { ...loadedLeagueStats };
  let staleRulesMigrated = false;
  if (!migratedLeagueStats.uiMode) {
    if (loaded.moddedLeagueBase === 'europe' || loaded.euroSetupSeed) {
      Object.assign(migratedLeagueStats, EURO_ISOLATED_DEFAULTS, loadedLeagueStats, { uiMode: 'euro_isolated' });
      console.log('[LOAD_GAME] Restored missing Euro isolated mode flag.');
    } else if (loaded.moddedLeagueBase === 'philippines') {
      migratedLeagueStats.uiMode = 'pba_isolated';
      console.log('[LOAD_GAME] Restored missing PBA isolated mode flag.');
    }
  }
  if (!migratedLeagueStats.awardSettings) {
    const uiMode = migratedLeagueStats.uiMode ?? 'nba';
    migratedLeagueStats.awardSettings = defaultAwardSettings(
      uiMode === 'euro_isolated' || uiMode === 'pba_isolated' || uiMode === 'wnba_isolated' || uiMode === 'fictional' ? uiMode : 'nba',
      Number(migratedLeagueStats.year),
    );
    console.log(`[LOAD_GAME] Seeded default awardSettings for uiMode=${uiMode}`);
  }
  const historicalAwardSeason = Number(migratedLeagueStats.year);
  const historicalNbaAwards = loaded.leagueType === 'modded'
    && (loaded.moddedLeagueBase ?? 'nba') === 'nba'
    && isHistoricalNbaStart(Number(loaded.nbaStartYear ?? migratedLeagueStats.historicalEraStartYear ?? 0));
  if (
    historicalNbaAwards
    && Number(migratedLeagueStats.awardSettingsEraVersion ?? 0) < AWARD_SETTINGS_ERA_VERSION
  ) {
    Object.assign(
      migratedLeagueStats,
      migrateAwardSettingsToCurrentEra(migratedLeagueStats, historicalAwardSeason),
    );
    console.log(`[LOAD_GAME] Applied NBA award-era defaults for season ${historicalAwardSeason}.`);
  }
  if (migratedLeagueStats.allStarGameTargetScore == null) {
    migratedLeagueStats.allStarGameTargetScore =
      loadedLeagueStats.allStarGameFormat === 'target_score'
        ? Math.max(40, loadedLeagueStats.allStarOvertimeTargetPoints ?? 40)
        : 40;
    staleRulesMigrated = true;
  }
  if (migratedLeagueStats.gameTargetScore == null || migratedLeagueStats.gameTargetScore <= 0) {
    migratedLeagueStats.gameTargetScore = 100;
  }
  if (migratedLeagueStats.celebrityGameMirrorLeagueRules == null) {
    migratedLeagueStats.celebrityGameMirrorLeagueRules = true;
    staleRulesMigrated = true;
  }
  if (loadedLeagueStats.allStarOneOnOneEnabled === true) {
    migratedLeagueStats.allStarThroneEnabled = true;
    migratedLeagueStats.allStarThroneFieldSize =
      Number(loadedLeagueStats.allStarOneOnOneParticipants ?? 8) > 8 ? 16 : 8;
    migratedLeagueStats.allStarThroneFormat =
      migratedLeagueStats.allStarThroneFieldSize === 16 ? 'full16' : 'mini8';
    migratedLeagueStats.allStarOneOnOneEnabled = false;
    staleRulesMigrated = true;
  }
  const currentUiMode = migratedLeagueStats.uiMode ?? 'nba';
  if (currentUiMode === 'wnba_isolated') {
    Object.assign(
      migratedLeagueStats,
      healWnbaAllStarTimingDefaults(
        healWnbaDevelopmentalContractDefaults(
          healWnbaAwardDefaults(
            healWnbaDraftLotteryDefaults(healWnbaTransactionCalendarDefaults(migratedLeagueStats)),
          ),
        ),
      ),
    );
  }
  const usesCurrentNbaTournamentDefaults = currentUiMode !== 'fictional'
    && currentUiMode !== 'euro_isolated'
    && currentUiMode !== 'pba_isolated'
    && currentUiMode !== 'wnba_isolated';
  if (usesCurrentNbaTournamentDefaults && loadedLeagueStats.allStarMirrorLeagueRules === true && loadedLeagueStats.allStarQuarterLength === 12) {
    migratedLeagueStats.allStarMirrorLeagueRules = false;
    migratedLeagueStats.allStarQuarterLength = 3;
    staleRulesMigrated = true;
  }
  if (usesCurrentNbaTournamentDefaults && loadedLeagueStats.allStarMirrorLeagueRules === false && loadedLeagueStats.allStarQuarterLength === 12) {
    migratedLeagueStats.allStarQuarterLength = 3;
    staleRulesMigrated = true;
  }
  if (usesCurrentNbaTournamentDefaults && loadedLeagueStats.risingStarsMirrorLeagueRules === false && loadedLeagueStats.risingStarsQuarterLength === 12) {
    migratedLeagueStats.risingStarsQuarterLength = 3;
    staleRulesMigrated = true;
  }
  if (currentUiMode === 'fictional' && Number(migratedLeagueStats.allStarQuarterLength ?? 0) <= 3) {
    migratedLeagueStats.allStarQuarterLength = 12;
    migratedLeagueStats.allStarNumQuarters = 4;
    staleRulesMigrated = true;
  }
  const historicalStartYear = Number(loaded.nbaStartYear ?? migratedLeagueStats.historicalEraStartYear ?? 0);
  const historicalRisingStarsFormat = isHistoricalNbaStart(historicalStartYear)
    ? getHistoricalNbaRisingStarsFormat(historicalStartYear)
    : null;
  if (historicalRisingStarsFormat && loadedLeagueStats.risingStarsFormat !== historicalRisingStarsFormat) {
    migratedLeagueStats.risingStarsFormat = historicalRisingStarsFormat;
    staleRulesMigrated = true;
  } else if (!historicalRisingStarsFormat && (loadedLeagueStats.risingStarsFormat === 'rookies_vs_sophomores' || loadedLeagueStats.risingStarsFormat === 'tournament')) {
    migratedLeagueStats.risingStarsFormat = '4team_tournament';
    staleRulesMigrated = true;
  }
  if (migratedLeagueStats.risingStarsFormat === 'captains_draft' && migratedLeagueStats.risingStarsCaptainType !== 'legend') {
    migratedLeagueStats.risingStarsCaptainType = 'legend';
    staleRulesMigrated = true;
  }
  if (staleRulesMigrated) {
    console.log('[LOAD_GAME] Migrated stale exhibition rules to tournament defaults.');
  }
  if (migratedLeagueStats.uiMode === 'pba_isolated') {
    migratedLeagueStats.allStarGameEnabled = true;
    migratedLeagueStats.allStarMirrorLeagueRules = false;
    migratedLeagueStats.allStarGameFormat = 'timed';
    migratedLeagueStats.allStarQuarterLength = 12;
    migratedLeagueStats.allStarNumQuarters = 4;
    migratedLeagueStats.allStarOvertimeDuration = 5;
    migratedLeagueStats.risingStarsEnabled = false;
    migratedLeagueStats.celebrityGameEnabled = false;
    if (!PBA_CONFERENCES.has(String(migratedLeagueStats.pbaConference ?? ''))) {
      migratedLeagueStats.pbaConference = 'philippine';
    }
    if (!PBA_CONFERENCE_PHASES.has(String(migratedLeagueStats.pbaConferencePhase ?? ''))) {
      const competitionId = getPbaCompetitionIdForConference(migratedLeagueStats.pbaConference);
      const currentConferenceGames = (loaded.schedule ?? []).filter((game: any) => game.competitionId === competitionId);
      const currentConferenceBoxScores = (loaded.boxScores ?? []).filter((game: any) => game.competitionId === competitionId);
      const hasUnplayedCurrentConference = currentConferenceGames.some((game: any) => !game.played);
      const hasPostseasonMaterial = [...currentConferenceGames, ...currentConferenceBoxScores].some((game: any) =>
        ['qf', 'sf', 'final'].includes(String(game.competitionPhase)),
      );
      migratedLeagueStats.pbaConferencePhase = hasUnplayedCurrentConference || currentConferenceGames.length > 0 || currentConferenceBoxScores.length > 0
        ? hasPostseasonMaterial ? 'playoffs' : 'regularSeason'
        : loaded.offseasonChecklist ? 'offseason' : 'regularSeason';
      console.log(`[LOAD_GAME] Normalized missing PBA conference phase to ${migratedLeagueStats.pbaConferencePhase}.`);
    }
    if (!isPbaActiveConferencePhase(migratedLeagueStats.pbaConferencePhase) && migratedLeagueStats.pbaConferencePhase !== 'offseason' && migratedLeagueStats.pbaConferencePhase !== 'complete') {
      migratedLeagueStats.pbaConferencePhase = 'regularSeason';
      console.log('[LOAD_GAME] Repaired invalid PBA conference phase.');
    }
  }
  return migratedLeagueStats;
}

export function healSchedule(schedule: any[] | undefined, migratedLeagueStats: any) {
  const risingStarsFormat = migratedLeagueStats?.risingStarsFormat ?? '4team_tournament';
  const risingStarsIsTournament = risingStarsFormat === '4team_tournament' || risingStarsFormat === 'random_4team';
  return (schedule ?? []).map((game: any) => {
    if (game?.isRisingStars && !risingStarsIsTournament) {
      const healed = { ...game };
      delete healed.gameFormat;
      delete healed.targetScore;
      return healed;
    }
    if (game?.isRisingStars && game.gid === 91001) return { ...game, gameFormat: 'target_score', targetScore: game.targetScore ?? 40 };
    if (game?.isRisingStars && game.gid === 91002) return { ...game, gameFormat: 'target_score', targetScore: game.targetScore ?? 40 };
    if (game?.isRisingStars && game.gid === 91099) return { ...game, gameFormat: 'target_score', targetScore: game.targetScore ?? 25 };
    if (game?.isAllStar && migratedLeagueStats.allStarGameFormat === 'timed') {
      const healed = { ...game };
      delete healed.gameFormat;
      delete healed.targetScore;
      return healed;
    }
    if (game?.isAllStar && migratedLeagueStats.allStarGameFormat && migratedLeagueStats.allStarGameFormat !== 'timed') {
      return {
        ...game,
        gameFormat: migratedLeagueStats.allStarGameFormat,
        targetScore: migratedLeagueStats.allStarGameFormat === 'target_score'
          ? (game.targetScore ?? migratedLeagueStats.allStarGameTargetScore ?? 40)
          : game.targetScore,
      };
    }
    return game;
  });
}

export function cleanDeadMoneyTeams(teams: any[] | undefined) {
  let deadMoneyTrimmed = 0;
  const cleanedTeams = (teams ?? []).map((team: any) => {
    if (!team.deadMoney || team.deadMoney.length === 0) return team;
    const cleanedEntries = team.deadMoney
      .map((entry: any) => ({
        ...entry,
        remainingByYear: (entry.remainingByYear ?? []).filter((year: any) => (year.amountUSD ?? 0) >= DEAD_MONEY_FLOOR_USD),
      }))
      .filter((entry: any) => {
        if (!entry.remainingByYear || entry.remainingByYear.length === 0) return false;
        const total = entry.remainingByYear.reduce((sum: number, year: any) => sum + year.amountUSD, 0);
        return total >= DEAD_MONEY_FLOOR_USD;
      });
    const removed = team.deadMoney.length - cleanedEntries.length;
    if (removed > 0) deadMoneyTrimmed += removed;
    return { ...team, deadMoney: cleanedEntries };
  });
  if (deadMoneyTrimmed > 0) {
    console.log(`[LOAD_GAME] Stripped ${deadMoneyTrimmed} zero-amount dead-money entries.`);
  }
  return cleanedTeams;
}

const emptyNbaRecordRow = (): OfficialNbaRecordRow => ({
  totalWins: 0,
  totalLosses: 0,
  totalTies: 0,
  homeWins: 0,
  homeLosses: 0,
  confWins: 0,
  confLosses: 0,
  divWins: 0,
  divLosses: 0,
  ptsFor: 0,
  ptsAgainst: 0,
  games: [],
});

const countRecordGames = (records: Map<number, OfficialNbaRecordRow>) =>
  Array.from(records.values()).reduce((sum, row) => sum + row.totalWins + row.totalLosses, 0);

function deriveLoadedNbaRecordsFromBoxScores(loaded: any, teams: any[], healedSchedule: any[], season: number) {
  const teamMap = new Map(
    (teams ?? [])
      .filter((team: any) => typeof team?.id === 'number' && team.id >= 0 && team.id < 100)
      .map((team: any) => [team.id, team]),
  );
  const rows = new Map<number, OfficialNbaRecordRow>();
  for (const tid of teamMap.keys()) rows.set(tid, emptyNbaRecordRow());

  for (const game of loaded?.boxScores ?? []) {
    const homeTid = Number(game?.homeTeamId);
    const awayTid = Number(game?.awayTeamId);
    if (!teamMap.has(homeTid) || !teamMap.has(awayTid)) continue;
    const homeScore = Number(game?.homeScore);
    const awayScore = Number(game?.awayScore);
    if (
      !Number.isFinite(homeScore)
      || !Number.isFinite(awayScore)
      || (homeScore === awayScore && game?.winnerId == null)
    ) continue;
    const meta = classifyBoxScoreGame(
      game,
      healedSchedule,
      loaded?.playoffs,
      loaded?.nbaCup,
      loaded?.nbaCupHistory,
      season,
      loaded?.leagueStats,
    );
    if (meta.seasonYear !== season) continue;
    if (meta.isPreseason || meta.isPlayoff || meta.isPlayIn || meta.isAllStar || meta.excludeFromRecord) continue;

    const home = rows.get(homeTid);
    const away = rows.get(awayTid);
    const homeTeam = teamMap.get(homeTid);
    const awayTeam = teamMap.get(awayTid);
    if (!home || !away || !homeTeam || !awayTeam) continue;

    const homeWon = didHomeTeamWin(game);
    home.ptsFor += homeScore;
    home.ptsAgainst += awayScore;
    away.ptsFor += awayScore;
    away.ptsAgainst += homeScore;
    homeWon ? home.totalWins++ : home.totalLosses++;
    homeWon ? home.homeWins++ : home.homeLosses++;
    !homeWon ? away.totalWins++ : away.totalLosses++;

    const sameConf = homeTeam.conference === awayTeam.conference;
    const sameDiv = homeTeam.did !== undefined && homeTeam.did === awayTeam.did;
    if (sameConf) {
      homeWon ? home.confWins++ : home.confLosses++;
      !homeWon ? away.confWins++ : away.confLosses++;
    }
    if (sameDiv) {
      homeWon ? home.divWins++ : home.divLosses++;
      !homeWon ? away.divWins++ : away.divLosses++;
    }
    const date = String(game?.date ?? '');
    home.games.push({ won: homeWon, date });
    away.games.push({ won: !homeWon, date });
  }

  return rows;
}

export function healLoadedNbaTeamRecords(loaded: any, migratedLeagueStats: any, healedSchedule: any[], teams: any[]) {
  const uiMode = migratedLeagueStats?.uiMode ?? 'nba';
  if (uiMode === 'euro_isolated' || uiMode === 'pba_isolated') return teams;

  const season = migratedLeagueStats?.year ?? loaded?.leagueStats?.year ?? new Date().getFullYear();
  const nbaStartYear = Number(loaded?.nbaStartYear ?? 0);
  const isHistoricalNbaBranch =
    loaded?.leagueType === 'modded' &&
    loaded?.moddedLeagueBase === 'nba' &&
    isHistoricalNbaStart(nbaStartYear) &&
    Number(season) > nbaStartYear;
  const nbaTeams = (teams ?? []).filter((team: any) => typeof team?.id === 'number' && team.id >= 0 && team.id < 100);
  if (nbaTeams.length === 0) return teams;

  let recordMap = deriveOfficialNbaRecords(healedSchedule, teams, season);
  if (countRecordGames(recordMap) === 0) {
    recordMap = deriveLoadedNbaRecordsFromBoxScores(
      { ...loaded, leagueStats: migratedLeagueStats },
      teams,
      healedSchedule,
      season,
    );
  }
  const rebuiltLeagueGames = countRecordGames(recordMap);
  if (rebuiltLeagueGames === 0 && !isHistoricalNbaBranch) return teams;

  const corruptedTeams = nbaTeams.filter((team: any) => {
    const rec = recordMap.get(team.id);
    const row = team.seasons?.find((entry: any) => Number(entry?.season) === Number(season));
    const savedTotal = Number(row?.won ?? row?.wins ?? team.wins ?? 0) + Number(row?.lost ?? row?.losses ?? team.losses ?? 0);
    const rebuiltTotal = Number(rec?.totalWins ?? 0) + Number(rec?.totalLosses ?? 0);
    const staleFullSeasonRecord = savedTotal >= 82 && rebuiltTotal < savedTotal;
    return savedTotal !== rebuiltTotal && (isHistoricalNbaBranch ||
      (rebuiltTotal > 0 && (savedTotal === 0 || rebuiltTotal >= savedTotal || savedTotal > 82)) ||
      staleFullSeasonRecord
    );
  });
  if (corruptedTeams.length === 0) return teams;
  const corruptedTeamIds = new Set(corruptedTeams.map((team: any) => team.id));

  const champTid = loaded?.playoffs?.bracketComplete ? loaded?.playoffs?.champion : undefined;
  const finalsSeries = (loaded?.playoffs?.series ?? []).find((series: any) => series.round === 4);
  const runnerTid = champTid != null && finalsSeries
    ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
    : undefined;

  const healedTeams = teams.map((team: any) => {
    if (!corruptedTeamIds.has(team?.id)) return team;
    const rec = recordMap.get(team.id);
    if (!rec) return team;
    const seasons = Array.isArray(team.seasons) ? [...team.seasons] : [];
    const seasonIndex = seasons.findIndex((entry: any) => Number(entry?.season) === Number(season));
    const prev = seasonIndex >= 0 ? seasons[seasonIndex] : {};
    const playoffRoundsWon = team.id === champTid
      ? 4
      : team.id === runnerTid
        ? 3
        : prev?.playoffRoundsWon;
    const nextSeasonRow = {
      ...prev,
      season,
      won: rec.totalWins,
      lost: rec.totalLosses,
      wins: rec.totalWins,
      losses: rec.totalLosses,
      playoffRoundsWon,
    };
    if (seasonIndex >= 0) seasons[seasonIndex] = nextSeasonRow;
    else seasons.push(nextSeasonRow);
    return {
      ...team,
      wins: rec.totalWins,
      losses: rec.totalLosses,
      seasons,
    };
  });

  console.log(`[LOAD_GAME] Healed ${corruptedTeams.length} NBA team record row(s) from ${rebuiltLeagueGames > 0 ? 'current-season games' : 'historical current-season reset'}.`);
  return healedTeams;
}

export function healLegacyNbaStaff(teams: any[], loaded: any) {
  const branchStartYear = Number(loaded?.nbaStartYear ?? loaded?.leagueStats?.historicalEraStartYear ?? 0);
  if (!Number.isFinite(branchStartYear) || branchStartYear < 2025) return teams;
  let patched = 0;
  const healedTeams = (teams ?? []).map((team: any) => {
    const teamName = `${team?.region ?? ''} ${team?.name ?? ''}`.trim();
    if (teamName !== 'San Antonio Spurs') return team;
    const members = Array.isArray(team?.tycoon?.staffMembers) ? team.tycoon.staffMembers : [];
    const headIndex = members.findIndex((member: any) => String(member?.role ?? member?.position ?? member?.jobTitle ?? '').replace(/ \d+$/, '') === 'Head Coach');
    if (headIndex < 0 || members[headIndex]?.name !== 'Gregg Popovich') return team;
    const historyText = (loaded?.history ?? []).map((entry: any) => String(typeof entry === 'string' ? entry : entry?.text ?? ''));
    const hasLaterSpursHire = historyText.some((text: string) => /San Antonio Spurs hired .+ as Head Coach/i.test(text));
    if (hasLaterSpursHire) return team;
    const nextMembers = [...members];
    nextMembers[headIndex] = {
      ...nextMembers[headIndex],
      name: 'Mitch Johnson',
      role: 'Head Coach',
      position: 'Head Coach',
      jobTitle: 'Head Coach',
      nationality: 'American',
      yearsWithTeam: 0,
      hiredYear: loaded?.leagueStats?.year ?? new Date().getFullYear(),
      career_history: `${loaded?.leagueStats?.year ?? new Date().getFullYear()}-Present San Antonio Spurs (Head Coach)`,
      coaching_career: `${loaded?.leagueStats?.year ?? new Date().getFullYear()}-Present San Antonio Spurs (Head Coach)`,
    };
    patched++;
    return { ...team, tycoon: { ...(team.tycoon ?? {}), staffMembers: nextMembers } };
  });
  if (patched > 0) console.log(`[LOAD_GAME] Healed ${patched} legacy Spurs Popovich staff assignment.`);
  return healedTeams;
}

export function healNbaActiveStaffContracts(teams: any[], loaded: any) {
  if (!isOpeningNbaStaffWindow(loaded)) return { teams, releasedStaff: [], historyEntries: [] };
  const currentYear = Number(loaded.leagueStats.year);
  const directoryCoaches = loaded?.staff?.coaches ?? [];
  let changed = false;
  const healedTeams = (teams ?? []).map((team: any) => {
    const repair = ensureOpeningTeamHeadCoach(team, currentYear, directoryCoaches);
    changed ||= repair.changed;
    return repair.team;
  });
  if (changed) console.log('[LOAD_GAME] Restored active opening-day NBA head-coach assignments.');
  return { teams: changed ? healedTeams : teams, releasedStaff: [], historyEntries: [] };
}

export function healHistoricalNbaStaffFreeAgents(loaded: any, migratedLeagueStats: any, staffFreeAgents: any[], players: any[]) {
  const nbaStartYear = Number(loaded?.nbaStartYear ?? loaded?.leagueStats?.historicalEraStartYear ?? 0);
  const isHistoricalNbaSave = loaded?.leagueType === 'modded'
    && loaded?.moddedLeagueBase === 'nba'
    && isHistoricalNbaStart(nbaStartYear)
    && migratedLeagueStats?.uiMode !== 'pba_isolated'
    && migratedLeagueStats?.uiMode !== 'euro_isolated';
  if (!isHistoricalNbaSave) return staffFreeAgents;

  const activeRosterPlayerIds = new Set(
    (players ?? [])
      .filter((player: any) => Number(player?.tid ?? -1) >= 0 && Number(player?.tid ?? -1) < 100)
      .map((player: any) => String(player?.internalId ?? '').trim())
      .filter(Boolean),
  );
  const filtered = (staffFreeAgents ?? []).filter((member: any) => {
    const sourcePlayerId = String(member?.sourcePlayerId ?? '').trim();
    if (sourcePlayerId && activeRosterPlayerIds.has(sourcePlayerId)) return false;
    return true;
  });
  if (filtered.length !== (staffFreeAgents ?? []).length) {
    console.log(`[LOAD_GAME] Removed ${(staffFreeAgents ?? []).length - filtered.length} active-player staff free-agent row(s) from historical NBA market.`);
  }
  return filtered;
}

export function healPbaTeamStaff(nonNBATeams: any[], leagueStats: any, historicalPba?: { sourceVersion?: string }) {
  if (leagueStats?.uiMode !== 'pba_isolated') return nonNBATeams;
  let patched = 0;
  const year = leagueStats?.year ?? new Date().getFullYear();
  const usedPortraitUrls = createPortraitUsageSet(
    (nonNBATeams ?? []).flatMap((team: any) =>
      (team?.tycoon?.staffMembers ?? []).map((member: any) => member?.playerPortraitUrl),
    ),
  );
  const healed = (nonNBATeams ?? []).map((team: any) => {
    if (team?.league !== 'PBA') return team;
    const before = team;
    const attached = historicalPba?.sourceVersion
      ? team
      : attachPbaStaffToTeam(team, year, usedPortraitUrls);
    const next = applyPbaStaffEconomyScale(attached, year);
    if (next !== before) patched++;
    return next;
  });
  if (patched > 0) console.log(`[LOAD_GAME] Healed PBA staff contracts and era salary scale for ${patched} team(s).`);
  return healed;
}

export function healHistoricalTeamIdentity(loaded: any, teams: any[], players: any[]) {
  const seasonAbbrevByTid = new Map<number, Map<number, string>>();
  for (const player of players ?? []) {
    for (const stat of player?.stats ?? []) {
      const tid = Number(stat?.tid);
      const season = Number(stat?.season);
      if (!Number.isFinite(tid) || !Number.isFinite(season) || tid < 0) continue;
      const abbrevRaw = String(stat?.abbrev ?? stat?.teamAbbrev ?? stat?.tm ?? stat?.TM ?? '').trim().toUpperCase();
      if (!abbrevRaw) continue;
      if (!seasonAbbrevByTid.has(tid)) seasonAbbrevByTid.set(tid, new Map<number, string>());
      const bySeason = seasonAbbrevByTid.get(tid)!;
      if (!bySeason.has(season)) bySeason.set(season, abbrevRaw);
    }
  }

  let patchedSeasonRows = 0;
  const healedTeams = (teams ?? []).map((team: any) => {
    const bySeason = seasonAbbrevByTid.get(Number(team?.id));
    if (!Array.isArray(team?.seasons) || team.seasons.length === 0) return team;
    let changed = false;
    const seasons = team.seasons.map((row: any) => {
      const season = Number(row?.season);
      const inferredAbbrev = bySeason?.get(season);
      const next = {
        ...row,
        abbrev: row?.abbrev ?? inferredAbbrev ?? team?.abbrev,
        region: row?.region ?? team?.region ?? '',
        name: row?.name ?? team?.name ?? '',
      };
      if (next.abbrev !== row?.abbrev || next.region !== row?.region || next.name !== row?.name) {
        changed = true;
        patchedSeasonRows++;
      }
      return next;
    });
    return changed ? { ...team, seasons } : team;
  });

  if (patchedSeasonRows > 0) {
    console.log(`[LOAD_GAME] Healed ${patchedSeasonRows} historical team season identity row(s).`);
  }
  return healedTeams;
}

export function cleanFaMarkets(loaded: any, migratedLeagueStats: any, healedSchedule: any[], backfilledPlayers: any[], teamsWithCleanDeadMoney: any[]) {
  const loadedForMarketCheck = {
    ...initialState,
    ...loaded,
    leagueStats: migratedLeagueStats,
    schedule: healedSchedule,
    players: backfilledPlayers,
    teams: teamsWithCleanDeadMoney as any,
  } as GameState;
  const playerById = new Map(backfilledPlayers.map((player: any) => [player.internalId, player]));
  let purgedResolvedFAMarkets = 0;
  let purgedExpiredFAMarkets = 0;
  let purgedSignedFAMarkets = 0;
  const cleanedFAMarkets = (loaded.faBidding?.markets ?? []).filter((market: any) => {
    const player = playerById.get(market.playerId) as any;
    if (market.resolved) {
      purgedResolvedFAMarkets++;
      return false;
    }
    if (player && player.tid >= 0) {
      purgedSignedFAMarkets++;
      return false;
    }
    if (market.openedDay != null && ((loadedForMarketCheck.day ?? 0) - market.openedDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) {
      purgedExpiredFAMarkets++;
      return false;
    }
    if (!isPlausibleActiveMarket(market, loadedForMarketCheck, player)) {
      purgedExpiredFAMarkets++;
      return false;
    }
    return true;
  });
  const removedFAMarkets = purgedResolvedFAMarkets + purgedExpiredFAMarkets + purgedSignedFAMarkets;
  if (removedFAMarkets > 0) {
    console.log(`[LOAD_GAME] Purged ${removedFAMarkets} stale FA markets (resolved=${purgedResolvedFAMarkets}, expired=${purgedExpiredFAMarkets}, signed=${purgedSignedFAMarkets})`);
  }
  return cleanedFAMarkets;
}

export function cleanOptionHistory(history: any[] | undefined) {
  const seenOptionHistory = new Set<string>();
  let removedOptionHistory = 0;
  const cleanedHistory = [...(history ?? [])].reverse().filter((entry: any) => {
    const text = String(entry?.text ?? '').toLowerCase();
    const isOptionDecision = text.includes('player option') || text.includes('team option');
    if (!isOptionDecision) return true;
    const playerKey = Array.isArray(entry.playerIds) && entry.playerIds.length > 0
      ? entry.playerIds.join(',')
      : text.replace(/\$[\d.]+m/g, '').replace(/\s+/g, ' ').trim();
    const kind = text.includes('player option') ? 'player-option' : 'team-option';
    const key = `${kind}|${entry.date ?? ''}|${playerKey}`;
    if (seenOptionHistory.has(key)) {
      removedOptionHistory++;
      return false;
    }
    seenOptionHistory.add(key);
    return true;
  }).reverse();
  if (removedOptionHistory > 0) {
    console.log(`[LOAD_GAME] Removed ${removedOptionHistory} duplicate option transaction(s).`);
  }
  return cleanedHistory;
}

const LEGACY_AUTO_NEWS_HEADLINES = new Set([
  'Christmas Day Games Set',
  'THE THRONE — Sign-Ups Open',
  'THE THRONE — Sign-Ups Closed',
  'THE THRONE — Field of 16 Revealed',
  'All-Star Starters Announced',
  'Full All-Star Rosters Set',
  'All-Star Weekend Complete',
  'NBA All-Star Starters Announced',
  'NBA All-Star Rosters Set',
  'NBA All-Star Weekend Complete',
  'PBA All-Star Rosters Set',
  'PBA All-Star Weekend Complete',
  'Draft Lottery Complete',
  'NBA Draft Complete',
]);

const extractNewsYear = (item: any): string => {
  const match = String(item?.date ?? '').match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? 'unknown';
};

export function cleanDuplicateAutoNews(news: any[] | undefined) {
  if (!Array.isArray(news) || news.length === 0) return news ?? [];
  const seen = new Set<string>();
  let removed = 0;
  const cleaned = news.filter((item: any) => {
    const headline = String(item?.headline ?? '').trim();
    if (!LEGACY_AUTO_NEWS_HEADLINES.has(headline)) return true;
    const key = `${extractNewsYear(item)}|${headline}`;
    if (seen.has(key)) {
      removed++;
      return false;
    }
    seen.add(key);
    return true;
  });
  if (removed > 0) {
    console.log(`[LOAD_GAME] Removed ${removed} duplicate auto-news item(s).`);
  }
  return cleaned;
}

export async function refreshTrainingCalendars(loaded: any, teams: any[]) {
  let teamsWithFreshTraining = teams;
  try {
    const {
      autoGenerateTrainingCalendarsForAllTeams,
      haveCurrentTrainingCalendars,
    } = await import('../../services/training/trainingScheduler');
    let migratedCount = 0;
    teamsWithFreshTraining = teamsWithFreshTraining.map((team: any) => {
      const calendar = team.trainingCalendar;
      if (!calendar) return team;
      const isoOnly: Record<string, any> = {};
      for (const [key, value] of Object.entries(calendar)) {
        if (typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) isoOnly[key] = value;
        else migratedCount++;
      }
      return { ...team, trainingCalendar: isoOnly };
    });
    if (migratedCount > 0) {
      console.log(`[LOAD_GAME] Stripped ${migratedCount} legacy training-calendar entries (numeric-keyed).`);
    }
    if (loaded.schedule && Array.isArray(loaded.schedule) && loaded.date) {
      const startIso = normalizeDate(loaded.date);
      const lifecyclePhase = String(loaded.seasonLifecycle?.currentPhase ?? '');
      const completedPostseason = lifecyclePhase === 'CHAMPION_FINALIZED'
        || lifecyclePhase === 'OFFSEASON_OPEN'
        || lifecyclePhase === 'OFFSEASON_TASKS_ACTIVE';
      if (
        migratedCount > 0
        || !haveCurrentTrainingCalendars(
          teamsWithFreshTraining,
          loaded.schedule,
          startIso,
          365,
          completedPostseason,
        )
      ) {
        teamsWithFreshTraining = autoGenerateTrainingCalendarsForAllTeams(
          teamsWithFreshTraining,
          loaded.schedule,
          startIso,
          365,
          loaded.leagueStats,
        );
        console.log(`[LOAD_GAME] Refreshed training calendars via auto-scheduler (startISO=${startIso}).`);
      }
    }
  } catch (error) {
    console.warn('[LOAD_GAME] training-calendar migration failed', error);
  }
  return teamsWithFreshTraining;
}

export async function applyTrainingAiSetup(loaded: any, players: any[], teams: any[]) {
  let playersWithAISetup = players;
  try {
    const { applyAIAutoSetup, shouldRunAIAutoSetup } = await import('../../services/training/aiAutoSetup');
    if (shouldRunAIAutoSetup(playersWithAISetup, loaded.userTeamId, loaded.gameMode)) {
      playersWithAISetup = applyAIAutoSetup(
        playersWithAISetup,
        teams as any,
        loaded.leagueStats?.year ?? new Date().getFullYear(),
        loaded.userTeamId,
        loaded.gameMode,
      );
      console.log('[LOAD_GAME] AI auto-setup applied: dev-focus + mentor pairings for AI teams.');
    }
  } catch (error) {
    console.warn('[LOAD_GAME] AI auto-setup failed', error);
  }
  return playersWithAISetup;
}

export function healFollowedHandles(loaded: any) {
  if (!Array.isArray(loaded.followedHandles)) return loaded.followedHandles;
  if (loaded.leagueStats?.uiMode === 'pba_isolated') {
    return loaded.followedHandles.map((handle: string) => NBA_TO_PBA_HANDLES[handle] ?? handle);
  }
  return loaded.leagueType === 'fictional'
    ? loaded.followedHandles.map((handle: string) => NBA_TO_FICTIONAL_HANDLES[handle] ?? handle)
    : loaded.followedHandles;
}

export function healOffseasonChecklist(loaded: any) {
  const persistedChecklist = loaded.offseasonChecklist as OffseasonChecklist | undefined;
  const legacyEuroScheduleDraw = persistedChecklist
    && loaded.leagueStats?.uiMode === 'euro_isolated'
    && persistedChecklist.euroScheduleDraw == null;
  let healedOffseasonChecklist = persistedChecklist ? {
    ...persistedChecklist,
    euroScheduleDraw: legacyEuroScheduleDraw
      ? persistedChecklist.preseasonFriendlies ?? 'pending'
      : persistedChecklist.euroScheduleDraw ?? 'skipped',
    preseasonFriendlies: legacyEuroScheduleDraw
      ? persistedChecklist.preseasonFriendlies === 'done'
        || persistedChecklist.preseasonFriendlies === 'in-progress'
        || persistedChecklist.trainingCamp === 'done'
        ? 'done'
        : 'pending'
      : persistedChecklist.preseasonFriendlies,
    summerLeague: persistedChecklist.summerLeague
      ?? (loaded.summerLeagueTournament?.reviewed || loaded.summerLeagueTournament?.status === 'reviewed'
        ? 'done'
        : loaded.summerLeagueTournament ? 'pending' : 'skipped'),
    internationalTournament: persistedChecklist.internationalTournament
      ?? (loaded.internationalTournament?.reviewed || loaded.internationalTournament?.status === 'reviewed' ? 'done' : loaded.internationalTournament ? 'pending' : 'skipped'),
  } : undefined;
  const isPbaYearEnd = loaded.leagueStats?.uiMode === 'pba_isolated'
    && loaded.leagueStats?.pbaConference === 'governors'
    && loaded.leagueStats?.pbaConferencePhase === 'offseason';
  const isSeasonEndChecklist = !!healedOffseasonChecklist && (
    isPbaYearEnd
    || healedOffseasonChecklist.seasonSummary !== 'skipped'
  );
  if (healedOffseasonChecklist && loaded.gameMode !== 'gm') {
    healedOffseasonChecklist = {
      ...healedOffseasonChecklist,
      performanceReview: 'skipped',
    };
  } else if (healedOffseasonChecklist && isSeasonEndChecklist) {
    const gmDecisionOpen = !!loaded.gmCareer && (
      !!loaded.gmCareer.pendingReview
      || !!loaded.gmCareer.pendingContractDecision
      || loaded.gmCareer.jobOffers !== undefined
    );
    const hasUnfinishedSeasonTask = Object.entries(healedOffseasonChecklist).some(([row, status]) =>
      row !== 'performanceReview'
      && (status === 'pending' || status === 'in-progress')
    );
    healedOffseasonChecklist = {
      ...healedOffseasonChecklist,
      performanceReview: healedOffseasonChecklist.performanceReview === 'done'
        ? 'done'
        : gmDecisionOpen
          ? 'in-progress'
          : hasUnfinishedSeasonTask ? 'pending' : 'done',
    };
  }
  if (healedOffseasonChecklist && isPbaYearEnd) {
    const pbaDraftOpen = healedOffseasonChecklist.pbaDraft === 'pending'
      || healedOffseasonChecklist.pbaDraft === 'in-progress';
    const pbaLocalMarketOpen = healedOffseasonChecklist.pbaLocalFreeAgency === 'pending'
      || healedOffseasonChecklist.pbaLocalFreeAgency === 'in-progress';
    healedOffseasonChecklist = {
      ...healedOffseasonChecklist,
      draftLottery: pbaDraftOpen && (healedOffseasonChecklist.draftLottery == null || healedOffseasonChecklist.draftLottery === 'skipped')
        ? 'pending'
        : healedOffseasonChecklist.draftLottery,
      myFAs: pbaLocalMarketOpen && (healedOffseasonChecklist.myFAs == null || healedOffseasonChecklist.myFAs === 'skipped')
        ? 'pending'
        : healedOffseasonChecklist.myFAs,
      hofCeremony: healedOffseasonChecklist.hofCeremony === 'done' ? 'done' : 'skipped',
      pbaOpeningCeremony: healedOffseasonChecklist.pbaOpeningCeremony === 'done'
        ? 'done'
        : healedOffseasonChecklist.pbaOpeningCeremony === 'in-progress'
          ? 'in-progress'
          : 'pending',
      strategyReview: 'skipped',
    };
  }
  if (persistedChecklist && isPbaActiveConferenceMode(loaded)) {
    console.log('[LOAD_GAME] Cleared stale PBA offseason checklist during active conference play.');
    return undefined;
  }
  if (persistedChecklist && isNoDraftLeague(loaded.leagueStats)) {
    const isUnfinished = (status: string | undefined) => status === 'pending' || status === 'in-progress';
    const needsHeal =
      isUnfinished(persistedChecklist.draftLottery) ||
      isUnfinished(persistedChecklist.draft) ||
      isUnfinished(persistedChecklist.rookieContracts);
    if (needsHeal) {
      healedOffseasonChecklist = {
        ...healedOffseasonChecklist,
        draftLottery: 'skipped',
        draft: 'skipped',
        rookieContracts: 'skipped',
      };
      console.log('[LOAD_GAME] Healed legacy draft rows → skipped (no_draft active).');
    }
  }
  if (
    healedOffseasonChecklist
    && loaded.leagueStats?.uiMode !== 'pba_isolated'
    && isDraftLotteryEnabled(loaded.leagueStats?.draftType)
    && !loaded.draftComplete
    && !(loaded.draftLotteryResult?.length)
    && (healedOffseasonChecklist.draft === 'pending' || healedOffseasonChecklist.draft === 'in-progress')
  ) {
    healedOffseasonChecklist = {
      ...healedOffseasonChecklist,
      draftLottery: 'pending',
      draft: 'pending',
    };
  }
  return healedOffseasonChecklist;
}

export function healPbaCommissionerBootstrapDraftState(state: GameState): GameState {
  if (state.gameMode === 'gm' || state.leagueStats?.uiMode !== 'pba_isolated') return state;
  const sourceSeason = Number(
    state.pbaSeasonKey
    ?? state.historicalPba?.sourceSeason
    ?? (state.pbaStartYear != null ? state.pbaStartYear + 1 : Number.NaN),
  );
  if (!Number.isFinite(sourceSeason) || sourceSeason !== Number(state.leagueStats.year)) return state;
  const checklist = state.offseasonChecklist;
  const pbaDraftResolved = checklist?.pbaDraft === 'done';
  if (state.draftComplete && (!checklist || pbaDraftResolved)) return state;
  return {
    ...state,
    draftComplete: true,
    offseasonChecklist: checklist
      ? { ...checklist, pbaDraft: 'done' }
      : checklist,
  };
}
