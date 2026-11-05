import { GameState, HistoricalStatPoint, NBAPlayer as Player, DraftPick, LazySimProgress, type NBATeam, type NonNBATeam, type NbaGmStartMode } from '../../types';
import { generateInitialContent } from '../../services/llm/llm';
import { getRosterData, getHistoricalAwards } from '../../services/rosterService';
import { generateFictionalLeague } from '../../services/fictionalLeagueGenerator';
import {
    buildFictionalCoachAwardRows,
    FICTIONAL_STAFF_SEED_VERSION,
    generateFictionalStaffSetup,
} from '../../services/fictionalStaffGenerator';
import { setRefereeData } from '../../data/photos/referees';
import { loadRefereeRoster } from '../../services/referees/refereeRoster';
import type { EuropeMarket, LeagueType, ModdedLeagueBase } from '../../types';
import { DEFAULT_CAP_INFLATION_AVERAGE, EURO_ISOLATED_DEFAULTS, EXTERNAL_SALARY_SCALE, INITIAL_LEAGUE_STATS, PBA_ISOLATED_DEFAULTS } from '../../constants';
import { addGameDays, getSeasonSimStartDate, toISODateString } from '../../utils/dateUtils';
import { DEFAULT_MEDIA_RIGHTS } from '../../utils/broadcastingUtils';
import { buildHistoricalMediaRights } from '../../data/historicalBroadcastRights';
import { buildPbaMediaRights } from '../../data/pbaBroadcastRights';
import { buildInitialBroadcastTalent } from '../../services/broadcasting/broadcastTalent';
import { computeLocalPBASalaryUSD, fetchEuroleagueRoster, fetchWNBARoster, fetchPBARoster, fetchBLeagueRoster, fetchGLeagueRoster, fetchEndesaRoster, fetchChinaCBARoster, fetchNBLAustraliaRoster, getPBARosterEconomyConfig } from '../../services/externalRosterService';
import { convertTo2KRating } from '../../utils/helpers';
import { loadNameData } from '../../data/nameDataFetcher';
import { ensureBiosLoaded, getVerifiedBioForPlayerIdentity } from '../../data/realPlayerDataFetcher';
import { preloadHOFData } from '../../data/HOFData';
import { enforceExternalMinRoster } from '../../services/externalLeagueSustainer';
import { SPAIN_COMPETITIONS } from '../../data/templates/spain/competitions';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { calculateSocialEngagement } from '../../utils/helpers';
import { generateDraftPicksForTeamIdsAndSeasons, generateFuturePicks, getDraftRoundsForLeague, DEFAULT_TRADABLE_PICK_SEASONS } from '../../services/draft/DraftPickGenerator';
import { applyPbaAwardsToPlayers, buildPbaHistoricalAwardsFromSource, preparePbaAwardArchive } from '../../services/pba/awards';
import { applyHistoricalNbaClutchAwardsToPlayers } from '../../data/historicalNbaClutchAwards';
import { applyHistoricalNbaExtraAwardsToPlayers } from '../../data/historicalNbaExtraAwards';
import { ensureDraftClasses } from '../../services/draftClassFiller';
import { buildPbaCollegePoolFromSource } from '../../services/pba/collegeSources';
import { getPbaDraftClassTargetSize, tunePbaDraftProspects } from '../../services/pba/draftRules';
import { materializeRealPbaDraftClasses } from '../../services/pba/archiveDraftProspects';
import { getPbaDraftPickYears, getUpcomingPbaDraftYears } from '../../services/pba/draftCalendar';
import { HOF_FIRST_BALLOT_WAIT_YEARS } from '../../services/playerDevelopment/hofChecker';
import { hydrateHistoricalCareerMetrics } from '../../services/playerDevelopment/historicalCareerMetrics';
import {
    DEFAULT_HISTORICAL_NBA_START_YEAR,
    getHistoricalExternalLeagueAvailability,
    getHistoricalNbaRuleOverrides,
    isHistoricalNbaStart,
} from '../../data/historicalNbaSeasons';
import { applyTeamIdentitiesForTimeline } from '../../utils/teamAssets';
import { getHistoricalCompletedSeasonCutoff, timelineInputFromState } from '../../utils/historicalTimeline';
import { applyHistoricalNbaContractions, applyHistoricalNbaTeamStructure } from '../../services/historicalNbaTeamLifecycle';
import { applyHistoricalNbaInjuryProfilePolicy } from '../../utils/durabilityUtils';
import { coerceInsiderPostToEra, getDefaultFollowedHandles } from '../../data/social/handles';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import { enrichPlayersWithFibaHistoricalAwards, prepareInternationalTournamentWindow } from '../../services/fiba/prepareTournamentWindow';
import { getTeamFullName } from '../../utils/teamNames';
import { createPortraitUsageSet } from '../../utils/newgenPortrait';
import { createInitialGmCareerState } from '../../services/gmCareer/careerService';
import { applyHistoricalNationalityProfiles } from '../../services/identity/historicalNationality';
import { hydrateCompletedKnownNaturalizations } from '../../services/identity/playerNaturalization';
import { applyGeneratedFamilyLineages } from '../../services/playerFamilyLineage';
import { buildHistoricalEndesaRoster } from '../../services/historicalEndesa/seasonBuilder';
import { ENDESA_HISTORICAL_CATALOG, endesaSourceSeasonToStartYear, endesaStartYearToSourceSeason } from '../../services/historicalEndesa/catalog';
import { normalizeHistoricalEndesaPlayerName } from '../../services/historicalEndesa/identity';
import { buildHistoricalPbaRoster, buildHistoricalPbaRosterFromSource } from '../../services/pba/historicalSeasonBuilder';
import {
    PBA_HISTORICAL_CATALOG,
    getHistoricalPbaRuleOverrides,
    pbaStartYearToSourceSeason,
} from '../../services/pba/historicalCatalog';
import { getLatestPlayablePbaSeason, isPlayablePbaSeason } from '../../services/pba/historyConfig';
import { loadHistoricalPbaSource } from '../../services/pba/historicalLoader';
import { resolvePbaStartupSelection } from '../../services/pba/startupSelection';
import { PBA_SOURCE_HISTORY_HYDRATION_VERSION } from '../../services/pba/historicalHistoryHydration';
import { isPbaSourceAwardAvailableAtBranch } from '../../services/pba/branchHistoryOwnership';
import { getEurostashRightsTid } from '../../services/freeAgency/eurostashRights';
import { getEuroHistoricalEconomyFactor } from '../../services/euro/historicalEconomy';
import { getPbaHistoricalEconomyFactor, PBA_PLAYER_ECONOMY_VERSION } from '../../services/pba/historicalEconomy';
import {
    buildSpainClubAliasMap,
    canonicalizeEuroleaguePlayerForSpain,
    fitEuroleaguePlayersIntoSpainOpeningRosters,
    getSpainCrossSourcePlayerIdentityKey,
} from '../../services/euro/spainOpeningMerge';
import { trimEuroOpeningRosters } from '../../services/euro/rosterTrim';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { EUROLEAGUE_2026_SOURCE, EURO_BASKETBALL_SOURCE_ARCHIVES, getEuroDomesticSourceForMarket, resolveEuroBasketballSourceSeason } from '../../data/euroBasketballSources';
import { getEuropeHistoricalBackfillSource, getEuropeHistoricalBackfillSources } from '../../data/europeHistoricalBackfill';
import { fetchEuroBasketballRoster } from '../../services/euroleagueRosterFetcher';
import { mergeEuroRosterBucket } from '../../services/euro/clubUniverseMerge';
import { getLeagueScheduleReleaseDate } from '../../services/leagueCalendar';
import { buildEuroDomesticTournaments, buildEuroSourceCompetition } from '../../services/euro/competitionCatalog';
import { seedDomesticTournamentParticipants } from '../../services/euro/domesticCompetitionQualification';
import { buildHistoricalNbaEuroMarket, loadHistoricalNbaMarketPlayers } from '../../services/euro/historicalNbaMarket';
import {
    healHistoricalNbaAwardTeamIds,
    healHistoricalNbaPlayerStatTeamIds,
} from '../gameContext/historicalNbaTeamIdHealer';
import { materializeInitialExternalNbaDraftClass } from '../../services/euroScouting/nbaDraft';
import { COMPETITION_AWARD_HISTORY_VERSION, hydrateCompetitionAwardHistory } from '../../services/competition/competitionAwardHistory';
import { selectExternalMarketPlayers } from '../../services/externalLeague/marketPool';
import { prepareHistoricalCoachArchive } from '../../services/staff/historicalCoachArchive';
import { prepareHistoricalExecutiveArchive } from '../../services/staff/historicalExecutiveArchive';
import { buildWorkerNbaStaffAwardsThrough } from '../../services/history/workerNbaStaffAwards';
import {
    FULL_OFFSEASON_NBA_HISTORY_VERSION,
    hydrateFullOffseasonNbaHistoricalAwards,
} from '../../services/history/fullOffseasonNbaHistory';
import { buildOpeningSeasonReviewNews, fetchPriorNbaSeasonRecap, previousNbaSeasonLabelForStartYear } from '../../services/news/seasonRecaps';
import { fetchAllStarHistory } from '../../data/allStarHistoryFetcher';
import { materializeKnownNbaAllStarHosts } from '../../services/allStar/hostAutoResolver';
import { buildRealNbaLotteryHydration } from '../../services/draft/realNbaLotterySnapshot';
import { runLazySim } from '../../services/logic/lazySimRunner';
import { autoGenerateSchedule, autoPickChristmasGames, autoPickGlobalGames, autoScheduleIntlPreseason } from '../../services/logic/autoResolvers';
import { defaultOffseasonChecklist, initialPbaEndOfSeasonChecklist } from '../../services/offseason/offseasonState';
import { getPbaCalendarPosition } from '../../services/pba/conferenceTransition';
import { initialState } from '../initialState';
import { loadBundledWnbaLeagueState } from '../../services/modded/wnbaLeagueLoader';
import { createLeagueStartupProgressReporter } from './leagueStartupProgress';
import { prepareOpeningFantasyDraftPlayers, resolveOpeningRosterMode } from '../../services/fantasyDraft/openingFantasyDraft';
import type {
    FictionalHistoryMode,
    FictionalNationalityFrequency,
    FictionalPlayerPool,
    FictionalRosterMode,
    FictionalStartupTeamDef,
    LeagueStats,
} from '../../types';
import { mergePlayerCareer } from '../../utils/playerCareerMerge';
import { createCanonicalPlayerIdentityIndex, sameCanonicalPlayerIdentity } from '../../utils/playerIdentity';
import {
    isExplicitHistoricalPbaImport,
    mergePbaImportReference,
    restorePbaImportReferenceBios,
} from '../../services/pba/importIdentity';
import { autoManagePbaImports } from '../../services/pba/importAutomation';
import { shouldRetainNbaMasterPlayer } from '../../services/playerUniverse/canonicalNbaIdentity';
import { initializeLeagueSeasonLifecycle } from '../../services/lifecycle/leagueSeasonLifecycle';
import {
    CANONICAL_HISTORICAL_PEOPLE_VERSION,
    materializeCanonicalHistoricalPeople,
} from '../../services/playerUniverse/canonicalHistoricalPeople';
import {
    CANONICAL_CROSS_LEAGUE_IDENTITY_VERSION,
    canonicalizeCrossLeaguePlayerIdentities,
} from '../../services/playerUniverse/canonicalCrossLeagueIdentity';
import { canonicalizeDraftProspectIdentities } from '../../services/playerUniverse/canonicalDraftProspectIdentity';
import { CANONICAL_NBA_CAREER_HYDRATION_VERSION } from '../../services/playerUniverse/canonicalNbaCareerHydration';
import { CANONICAL_PLAYER_LOAD_MIGRATION_VERSION } from '../../services/playerUniverse/playerLoadMigration';
import { withCanonicalPersonIdentity } from '../../utils/playerIdentity';
import { withFranchiseCareerLoyalty } from '../../utils/franchiseCareerLoyalty';
import { canonicalizeTeamIdentitiesForState } from '../../services/teamIdentity';
import { seedOpeningTeamChemistry } from '../../services/teamChemistry';
import { createNewSaveIdentity } from '../../services/saveIdentity';
import { applyRealDunkContestWinnerBoost } from '../../services/allStar/allStarDunkContestHelpers';
interface StartGamePayload {
    name: string;
    startScenario?: string;
    skipLLM?: boolean;
    startDate?: string;
    jumpRequired?: boolean;
    onProgress?: (progress: LazySimProgress) => void;
    gameMode?: 'commissioner' | 'gm';
    userTeamId?: number;
    assistantGM?: boolean;
    leagueType?: LeagueType;
    moddedLeagueBase?: ModdedLeagueBase;
    europeMarket?: EuropeMarket;
    fictionalLeagueSeed?: number;
    simulationSeed?: string;
    nbaStartYear?: number;
    nbaGmStartMode?: NbaGmStartMode;
    endesaStartYear?: number;
    euroStartSeason?: number;
    pbaStartYear?: number;
    pbaSeasonKey?: number;
    fictionalLeagueName?: string;
    fictionalSeasonYear?: number;
    fictionalHistoryMode?: FictionalHistoryMode;
    fictionalTeams?: FictionalStartupTeamDef[];
    fictionalPlayerPool?: FictionalPlayerPool;
    fictionalRosterMode?: FictionalRosterMode;
    openingRosterMode?: import('../../types').OpeningRosterMode;
    fictionalNationalityFrequencies?: FictionalNationalityFrequency[];
    fictionalLeagueRules?: Partial<LeagueStats>;
    startModePolicy?: import('../../services/lifecycle/startModePolicy').SeasonStartModePolicy;
    firstActionDate?: string;
}

const EMPTY_ROSTER = { players: [], teams: [], competitionHistory: [] };
const hasRealDisplayName = (value?: string | null): boolean => {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 && !/^\d+$/.test(trimmed);
};
const resolveCommissionerDisplayName = (value?: string | null): string =>
    hasRealDisplayName(value) ? String(value).trim() : 'the new front-office lead';
const resolveTeamNewsSubject = (teamName?: string | null, leagueName?: string): string =>
    hasRealDisplayName(teamName) ? String(teamName).trim() : `${leagueName ?? 'League'} Team`;
const resolveTeamNewsObject = (teamName?: string | null): string =>
    hasRealDisplayName(teamName) ? String(teamName).trim() : 'the club';
const inferKnownHOFInductionYear = (player: any): number | undefined => {
    const directYear = Number(player?.hofInductionYear ?? 0);
    if (directYear > 0) return directYear;
    const hofAward = (player?.awards ?? []).find((award: any) => {
        const type = String(award?.type ?? '').toLowerCase();
        return type.includes('inducted into the hall of fame') || type === 'hall of fame';
    });
    const awardYear = Number(hofAward?.season ?? 0);
    return awardYear > 0 ? awardYear : undefined;
};
const resetFutureHOFStatus = (
    player: any,
    maxCompletedInductionYear: number,
    sourceInductionYear?: number,
) => {
    const knownInductionYear = sourceInductionYear ?? inferKnownHOFInductionYear(player);
    const existingScheduledYear = Number(player?.scheduledHofInductionYear ?? 0);
    const hasFutureSchedule =
        (knownInductionYear !== undefined && knownInductionYear > maxCompletedInductionYear) ||
        existingScheduledYear > maxCompletedInductionYear;
    if (player?.hof !== true && !hasFutureSchedule) return player;
    const earliestPossibleInductionYear = Number(player?.retiredYear ?? 0) > 0
        ? Number(player.retiredYear) + HOF_FIRST_BALLOT_WAIT_YEARS
        : undefined;
    const shouldReset =
        (knownInductionYear !== undefined && knownInductionYear > maxCompletedInductionYear) ||
        hasFutureSchedule ||
        (earliestPossibleInductionYear !== undefined && earliestPossibleInductionYear > maxCompletedInductionYear) ||
        ((player?.status !== 'Retired' && player?.tid !== -3));
    if (!shouldReset) return player;
    return {
        ...player,
        hof: false,
        hofInductionYear: undefined,
        hofLeague: undefined,
        scheduledHofInductionYear: undefined,
    };
};
const mergeMainRosterCareer = (
    player: any,
    legacyMainRosterPlayer?: any,
    options: { preferLegacyPortrait?: boolean } = {},
) => mergePlayerCareer(player, legacyMainRosterPlayer, { preferHistoryPortrait: options.preferLegacyPortrait });
export const handleStartGame = async (payload: StartGamePayload): Promise<Partial<GameState>> => {
    const { name: commissionerName } = payload;
    const saveIdentity = createNewSaveIdentity(payload.simulationSeed);
    const reportStartupProgress = createLeagueStartupProgressReporter(payload.onProgress, payload.startDate);
    await reportStartupProgress('Starting league creation...', 2, 1);
    const isFictional = payload.leagueType === 'fictional';
    const isEuropeModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'europe';
    const isPbaModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'philippines';
    const isWnbaModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'wnba';
    const isNbaModded = payload.leagueType === 'modded' && payload.moddedLeagueBase === 'nba';
    const openingRosterMode = resolveOpeningRosterMode(
        payload.gameMode ?? 'commissioner',
        payload.openingRosterMode ?? payload.fictionalRosterMode,
    );
    const openingFantasyRequested = openingRosterMode === 'fantasy_draft';
    if (isWnbaModded) {
        await reportStartupProgress('Loading WNBA teams and player careers...', 31, 5);
        const imported = await loadBundledWnbaLeagueState();
        const gameMode = payload.gameMode ?? 'commissioner';
        const requestedTeamId = Number(payload.userTeamId);
        const userTeamId = gameMode === 'gm' && imported.teams.some(team => team.id === requestedTeamId)
            ? requestedTeamId
            : undefined;
        const date = imported.date;
        await reportStartupProgress('Finalizing teams and league identity...', 97, 32);
        await reportStartupProgress('Preparing the league home screen...', 98, 33);
        await reportStartupProgress('Warming up the simulation...', 99, 34);
        const openingPlayers = prepareOpeningFantasyDraftPlayers(
            imported.players,
            new Set(imported.teams.map(team => team.id)),
            openingFantasyRequested,
        );
        const wnbaState = {
            ...imported,
            commissionerName,
            gameMode,
            userTeamId,
            leagueType: 'modded',
            moddedLeagueBase: 'wnba',
            players: openingPlayers,
            ...saveIdentity,
            history: [{
                text: `${commissionerName} began a new WNBA season as ${gameMode === 'gm' ? 'General Manager' : 'Commissioner'}.`,
                date,
                type: 'League Event',
            } as any],
            leagueStats: {
                ...imported.leagueStats,
                 uiMode: 'wnba_isolated',
                 leagueName: 'WNBA',
                 fictionalPlayerPool: 'womens',
                 openingRosterMode,
                 openingFantasyDraftCompleted: !openingFantasyRequested,
             },
        } as GameState;
        if (gameMode !== 'gm' || userTeamId == null) return wnbaState;
        const gmCareer = createInitialGmCareerState(wnbaState);
        return { ...wnbaState, gmCareer, salary: gmCareer.employment.annualSalary };
    }
    const nbaGmStartMode = isNbaModded ? payload.nbaGmStartMode : undefined;
    const isNbaFullOffseasonStart = nbaGmStartMode === 'full_offseason';
    await reportStartupProgress('Setting season rules and league structure...', 8, 2);
    if (isPbaModded) await preparePbaAwardArchive();
    const isSpainEurope = isEuropeModded && payload.europeMarket === 'spain';
    const modernPrimaryDomesticSource = isEuropeModded ? getEuroDomesticSourceForMarket(payload.europeMarket) : null;
    const endesaStartYear = payload.endesaStartYear ?? ENDESA_HISTORICAL_CATALOG.latestStartYear;
    const endesaSourceSeason = endesaStartYearToSourceSeason(endesaStartYear);
    const nbaStartYear = isNbaModded ? (payload.nbaStartYear ?? DEFAULT_HISTORICAL_NBA_START_YEAR) : DEFAULT_HISTORICAL_NBA_START_YEAR;
    const nbaRosterStartYear = isNbaFullOffseasonStart ? nbaStartYear - 1 : nbaStartYear;
    const requestedEuroSourceSeason = payload.euroStartSeason
        ?? modernPrimaryDomesticSource?.coverageThrough
        ?? endesaSourceSeason;
    const historicalPrimaryDomesticSource = isEuropeModded
        ? getEuropeHistoricalBackfillSource(payload.europeMarket, requestedEuroSourceSeason)
        : null;
    const primaryDomesticSource = historicalPrimaryDomesticSource ?? modernPrimaryDomesticSource;
    const euroSourceSeason = isSpainEurope
        ? endesaSourceSeason
        : historicalPrimaryDomesticSource
            ? requestedEuroSourceSeason
            : modernPrimaryDomesticSource
              ? resolveEuroBasketballSourceSeason(modernPrimaryDomesticSource, requestedEuroSourceSeason) ?? modernPrimaryDomesticSource.coverageStart
            : endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.latestStartYear);
    const euroEconomyScale = getEuroHistoricalEconomyFactor(euroSourceSeason);
    const firstEndesaSourceSeason = endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.firstStartYear);
    const latestEndesaSourceSeason = endesaStartYearToSourceSeason(ENDESA_HISTORICAL_CATALOG.latestStartYear);
    const pbaSource = isPbaModded || isNbaModded ? await loadHistoricalPbaSource() : null;
    const requestedPbaSourceSeason = isNbaModded
        ? nbaRosterStartYear + 1
        : payload.pbaSeasonKey
            ?? (payload.pbaStartYear != null
                ? pbaStartYearToSourceSeason(payload.pbaStartYear)
                : pbaSource
                    ? getLatestPlayablePbaSeason(pbaSource)
                    : INITIAL_LEAGUE_STATS.year);
    const pbaStartupSelection = isPbaModded && pbaSource
        ? resolvePbaStartupSelection(pbaSource, requestedPbaSourceSeason, payload.startDate)
        : undefined;
    const pbaSourceSeason = pbaStartupSelection?.sourceSeason ?? requestedPbaSourceSeason;
    const startupDate = pbaStartupSelection?.startDate ?? payload.startDate;
    const pbaEconomyScale = getPbaHistoricalEconomyFactor(
        pbaSourceSeason,
        Number(INITIAL_LEAGUE_STATS.inflationAverage ?? DEFAULT_CAP_INFLATION_AVERAGE) / 100,
    );
    const pbaStartYear = pbaSourceSeason - 1;
    const externalEuropeanSourceSeason = isNbaModded ? nbaRosterStartYear + 1 : euroSourceSeason;
    const externalReferenceStartYear = isEuropeModded ? euroSourceSeason - 1 : nbaRosterStartYear;
    const externalSourceSeason = externalReferenceStartYear + 1;
    const externalAvailability = getHistoricalExternalLeagueAvailability(externalReferenceStartYear);
    const endesaUniverseSourceSeason = isSpainEurope
        ? endesaSourceSeason
        : Math.min(latestEndesaSourceSeason, Math.max(firstEndesaSourceSeason, externalEuropeanSourceSeason));
    const fictionalSeasonYear = payload.fictionalSeasonYear ?? INITIAL_LEAGUE_STATS.year;
    const fictionalLeagueName = (payload.fictionalLeagueName ?? 'Association').trim() || 'Association';
    const historicalNbaStart = isNbaModded && isHistoricalNbaStart(nbaStartYear);
    const nbaRuleOverrides = isNbaModded
        ? (historicalNbaStart ? getHistoricalNbaRuleOverrides(nbaStartYear) : { year: nbaStartYear + 1 })
        : {};
    const fictionalRuleOverrides = isFictional ? (payload.fictionalLeagueRules ?? {}) : {};
    const fictionalConfs = payload.fictionalTeams
        ? Array.from(new Map(payload.fictionalTeams.map(team => [team.cid, { cid: team.cid, name: team.conferenceName ?? team.conference }])).values())
        : undefined;
    const fictionalDivs = payload.fictionalTeams
        ? Array.from(new Map(payload.fictionalTeams.map(team => [team.did, { cid: team.cid, did: team.did, name: team.divisionName ?? `Division ${team.did + 1}` }])).values())
        : undefined;
    const initialLeagueStats = {
        ...INITIAL_LEAGUE_STATS,
        ...nbaRuleOverrides,
        ...fictionalRuleOverrides,
        ...(isFictional ? {
            year: fictionalSeasonYear,
            uiMode: 'fictional' as const,
            leagueName: fictionalLeagueName,
            fictionalHistoryMode: payload.fictionalHistoryMode ?? 'established',
            fictionalPlayerPool: payload.fictionalPlayerPool ?? 'mens',
            fictionalRosterMode: openingRosterMode,
            fictionalFantasyDraftCompleted: !openingFantasyRequested,
            fictionalNationalityFrequencies: payload.fictionalNationalityFrequencies,
            allStarQuarterLength: fictionalRuleOverrides.allStarQuarterLength ?? 12,
            allStarNumQuarters: fictionalRuleOverrides.allStarNumQuarters ?? 4,
            ...(fictionalConfs ? { confs: fictionalConfs } : {}),
            ...(fictionalDivs ? { divs: fictionalDivs } : {}),
        } : {}),
        ...(isEuropeModded ? EURO_ISOLATED_DEFAULTS : {}),
        ...(isPbaModded ? PBA_ISOLATED_DEFAULTS : {}),
        ...(isPbaModded ? {
            year: pbaSourceSeason,
            leagueName: 'Philippine Basketball Association',
            historicalEconomyScale: pbaEconomyScale,
            pbaPlayerEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
            ...getHistoricalPbaRuleOverrides(pbaSourceSeason),
        } : {}),
        ...(isEuropeModded ? {
            year: euroSourceSeason,
            leagueName: isSpainEurope ? 'Liga Endesa' : primaryDomesticSource?.displayName ?? 'European Basketball',
            historicalEndesaEnabled: isSpainEurope && euroSourceSeason >= firstEndesaSourceSeason,
            historicalEconomyScale: euroEconomyScale,
            salaryCap: Math.round(Number(EURO_ISOLATED_DEFAULTS.salaryCap ?? 33_750_000) * euroEconomyScale),
            confs: [{ cid: 0, name: isSpainEurope ? 'Liga Endesa' : primaryDomesticSource?.displayName ?? 'Domestic League' }],
            divs: [{ did: 0, cid: 0, name: isSpainEurope ? 'Liga Endesa' : primaryDomesticSource?.displayName ?? 'Domestic League' }],
        } : {}),
        ...(isNbaFullOffseasonStart ? { year: nbaStartYear } : {}),
        mediaRights: isFictional ? fictionalRuleOverrides.mediaRights ?? DEFAULT_MEDIA_RIGHTS : DEFAULT_MEDIA_RIGHTS,
        allStarHosts: isNbaModded
            ? (nbaRuleOverrides.allStarHosts ?? INITIAL_LEAGUE_STATS.allStarHosts)
            : (fictionalRuleOverrides.allStarHosts ?? []),
        draftType: isEuropeModded ? 'no_draft' : ((isFictional ? fictionalRuleOverrides : nbaRuleOverrides).draftType ?? INITIAL_LEAGUE_STATS.draftType),
        tradableDraftPickSeasons: isEuropeModded ? 0 : (fictionalRuleOverrides.tradableDraftPickSeasons ?? INITIAL_LEAGUE_STATS.tradableDraftPickSeasons),
        stepienRuleEnabled: isEuropeModded ? false : (fictionalRuleOverrides.stepienRuleEnabled ?? INITIAL_LEAGUE_STATS.stepienRuleEnabled),
        rookieScaleType: isEuropeModded ? 'none' : (fictionalRuleOverrides.rookieScaleType ?? INITIAL_LEAGUE_STATS.rookieScaleType),
    };
    const pbaStartPosition = isPbaModded
        ? getPbaCalendarPosition(startupDate ?? `${pbaSourceSeason - 1}-10-05`)
        : undefined;
    if (pbaStartPosition) {
        initialLeagueStats.year = pbaStartPosition.seasonYear;
        initialLeagueStats.pbaConference = pbaStartPosition.conference;
        initialLeagueStats.pbaConferencePhase = pbaStartPosition.phase;
    }
    if (isPbaModded) {
        initialLeagueStats.mediaRights = buildPbaMediaRights(
            pbaSourceSeason,
            Number(initialLeagueStats.salaryCap ?? PBA_ISOLATED_DEFAULTS.salaryCap ?? 427_000),
        );
    }
    if (historicalNbaStart) {
        initialLeagueStats.mediaRights = buildHistoricalMediaRights(
            nbaStartYear,
            Number(initialLeagueStats.salaryCap ?? INITIAL_LEAGUE_STATS.salaryCap),
        );
        (initialLeagueStats as any).historicalBroadcastsEnabled = true;
        (initialLeagueStats as any).alternateBroadcastHistory = false;
    }
    const timelineInput = {
        currentYear: initialLeagueStats.year,
        leagueType: payload.leagueType ?? 'modded',
        moddedLeagueBase: payload.leagueType === 'modded' ? (payload.moddedLeagueBase ?? 'nba') : undefined,
        nbaStartYear: isNbaModded ? nbaStartYear : undefined,
        nbaBranchDate: isNbaModded && startupDate ? startupDate : undefined,
        date: startupDate,
    };
    const startupHistoryCompletedSeasonCutoff = getHistoricalCompletedSeasonCutoff(timelineInput)
        ?? (isEuropeModded ? externalReferenceStartYear : nbaStartYear);
    await reportStartupProgress('Loading season records and team archives...', 14, 3);
    const nameDataPromise = loadNameData();
    const pbaImportBioPromise = isPbaModded || isNbaModded ? ensureBiosLoaded() : Promise.resolve();
    const hofDataPromise = isFictional || isEuropeModded || isPbaModded ? Promise.resolve([]) : preloadHOFData();
    const allStarHistoryPromise = isNbaModded ? fetchAllStarHistory() : Promise.resolve([]);
    const historicalStaffArchivePromise = isNbaModded
        ? Promise.all([prepareHistoricalCoachArchive(), prepareHistoricalExecutiveArchive()])
        : Promise.resolve();
    let teams: any[], rawNbaPlayers: any[], draftPicks: DraftPick[];
    let fictionalHistoricalAwards: any[] = [];
    const historicalEndesaRoster = (isEuropeModded || isNbaModded) && externalEuropeanSourceSeason >= firstEndesaSourceSeason
        ? await buildHistoricalEndesaRoster(endesaSourceSeasonToStartYear(endesaUniverseSourceSeason))
        : null;
    const historicalPbaRoster = pbaSource
        && (isPbaModded || externalAvailability.pba)
        && isPlayablePbaSeason(pbaSourceSeason, pbaSource)
        ? isPbaModded
            ? await buildHistoricalPbaRoster(pbaSourceSeason)
            : buildHistoricalPbaRosterFromSource(pbaSource, pbaSourceSeason)
        : null;
    const primaryEuroRoster = primaryDomesticSource
        ? await fetchEuroBasketballRoster(primaryDomesticSource, euroSourceSeason)
        : EMPTY_ROSTER;
    await reportStartupProgress('Preparing clubs and primary rosters...', 22, 4);
    const historicalNbaEuroBackfills = isNbaModded && externalAvailability.europeDomestic
        ? getEuropeHistoricalBackfillSources(externalEuropeanSourceSeason)
        : [];
    const backgroundEuroSources = isEuropeModded || isNbaModded
        ? [...historicalNbaEuroBackfills, ...EURO_BASKETBALL_SOURCE_ARCHIVES].filter(source => (
            source.id !== primaryDomesticSource?.id
            && resolveEuroBasketballSourceSeason(source, externalEuropeanSourceSeason) !== null
        ))
        : [];
    const backgroundEuroRosters = await Promise.all(backgroundEuroSources.map(async source => {
        const roster = await fetchEuroBasketballRoster(source, externalEuropeanSourceSeason);
        return {
            source,
            careerPlayers: roster.players,
            roster: isNbaModded ? { ...roster, players: selectExternalMarketPlayers(roster.players, { showcaseRosterSize: 8 }) } : roster,
        };
    }));
    await reportStartupProgress('Building players and career history...', 31, 5);
    if (isFictional) {
        const fic = generateFictionalLeague(
            initialLeagueStats.year,
            payload.fictionalLeagueSeed,
            {
                teams: payload.fictionalTeams,
                historyMode: payload.fictionalHistoryMode,
                playerPool: payload.fictionalPlayerPool,
                nationalityFrequencies: payload.fictionalNationalityFrequencies,
                leagueRules: initialLeagueStats,
            },
        );
        teams = fic.teams;
        rawNbaPlayers = fic.players;
        draftPicks = [];
        fictionalHistoricalAwards = fic.historicalAwards;
    } else if (isEuropeModded) {
        teams = [];
        try {
            const historicalNbaMarket = await getRosterData(
                startupHistoryCompletedSeasonCutoff,
                'Opening Week',
                startupDate ?? `${externalReferenceStartYear}-07-01`,
            );
            rawNbaPlayers = historicalNbaMarket.supported === false ? [] : historicalNbaMarket.players;
            rawNbaPlayers = await loadHistoricalNbaMarketPlayers(rawNbaPlayers, startupDate ?? `${externalReferenceStartYear}-07-01`)
                .catch(error => {
                    console.warn('[INITIALIZE] Dated NBA free-agent supplement unavailable:', error);
                    return rawNbaPlayers;
                });
        } catch (error) {
            console.warn(`[INITIALIZE] Historical NBA free-agent market unavailable for ${startupHistoryCompletedSeasonCutoff}:`, error);
            rawNbaPlayers = [];
        }
        draftPicks = [];
    } else if (isPbaModded) {
        try {
            const nbaReference = await getRosterData(pbaStartYear, 'Opening Week');
            if (nbaReference.supported === false) {
                teams = [];
                rawNbaPlayers = [];
                draftPicks = [];
            } else if (pbaSourceSeason >= PBA_HISTORICAL_CATALOG.nbaCoexistSourceSeason) {
                teams = nbaReference.teams;
                rawNbaPlayers = nbaReference.players;
                draftPicks = nbaReference.draftPicks;
            } else {
                teams = [];
                rawNbaPlayers = nbaReference.players
                    .filter((player: any) => player.tid === -1 || player.status === 'Free Agent')
                    .map((player: any) => ({ ...player, tid: -1, status: 'Free Agent' as const }));
                draftPicks = [];
            }
        } catch (error) {
            console.warn(`[INITIALIZE] NBA import market unavailable for PBA ${pbaSourceSeason}:`, error);
            teams = [];
            rawNbaPlayers = [];
            draftPicks = [];
        }
    } else {
        const selectedSeasonData = await getRosterData(nbaStartYear, 'Opening Week', startupDate);
        if (selectedSeasonData.supported === false) {
            throw new Error(`NBA season ${nbaStartYear}-${String(nbaStartYear + 1).slice(-2)} is not startable yet.`);
        }
        if (isNbaFullOffseasonStart) {
            const completedSeasonData = await getRosterData(nbaRosterStartYear, 'Offseason', startupDate);
            if (completedSeasonData.supported === false) {
                throw new Error(`The prior NBA season needed for this offseason start is unavailable.`);
            }
            const selectedPlayersByIdentity = new Map(
                selectedSeasonData.players.map(player => [getSpainCrossSourcePlayerIdentityKey(player), player]),
            );
            rawNbaPlayers = completedSeasonData.players.map(player => {
                const merged = mergeMainRosterCareer(
                    player,
                    selectedPlayersByIdentity.get(getSpainCrossSourcePlayerIdentityKey(player)),
                    { preferLegacyPortrait: true },
                );
                return {
                    ...merged,
                    transactions: player.transactions,
                };
            });
            const completedTeamsById = new Map(completedSeasonData.teams.map(team => [team.id, team]));
            teams = selectedSeasonData.teams.map(team => {
                const completedTeam = completedTeamsById.get(team.id);
                const completedSeason = team.seasons?.find(season => Number(season.season) === nbaStartYear);
                return {
                    ...team,
                    strength: completedTeam?.strength ?? team.strength,
                    wins: Number(completedSeason?.won ?? 0),
                    losses: Number(completedSeason?.lost ?? 0),
                };
            });
            draftPicks = completedSeasonData.draftPicks;
        } else {
            teams = selectedSeasonData.teams;
            rawNbaPlayers = selectedSeasonData.players;
            draftPicks = selectedSeasonData.draftPicks;
        }
    }
    await reportStartupProgress('Restoring awards and staff history...', 40, 6);
    const baseHistoricalAwardsData = isFictional
        ? fictionalHistoricalAwards
        : isEuropeModded
          ? isSpainEurope ? historicalEndesaRoster?.historicalAwards ?? [] : []
        : isPbaModded
          ? pbaSource
            ? buildPbaHistoricalAwardsFromSource(pbaSource, pbaSourceSeason)
              .filter(award => isPbaSourceAwardAvailableAtBranch(award, {
                pbaSeasonKey: pbaSourceSeason,
                pbaStartDate: startupDate,
                historicalPba: undefined,
                leagueStats: initialLeagueStats,
              }))
            : []
          : await getHistoricalAwards();
    await reportStartupProgress('Historical awards ready. Preparing staff archives...', 43, 7);
    await historicalStaffArchivePromise;
    await reportStartupProgress('Staff archives ready. Completing award history...', 46, 8);
    const fullOffseasonNbaHistory = isNbaFullOffseasonStart
        ? await hydrateFullOffseasonNbaHistoricalAwards(
            baseHistoricalAwardsData,
            teams as NBATeam[],
            nbaStartYear,
          )
        : null;
    const completedNbaHistoricalAwards = fullOffseasonNbaHistory?.awards ?? baseHistoricalAwardsData;
    if (fullOffseasonNbaHistory?.hydrated) {
        (initialLeagueStats as any).fullOffseasonNbaHistoryVersion = FULL_OFFSEASON_NBA_HISTORY_VERSION;
    }
    const workerNbaStaffAwards = isNbaModded
        ? await buildWorkerNbaStaffAwardsThrough(teams as NBATeam[], startupHistoryCompletedSeasonCutoff)
        : [];
    const existingStaffAwardKeys = new Set(completedNbaHistoricalAwards.map((award: any) => [
        Number(award.season),
        String(award.type ?? ''),
        String(award.name ?? ''),
    ].join('|')));
    const newWorkerNbaStaffAwards = workerNbaStaffAwards.filter(award => !existingStaffAwardKeys.has([
        award.season,
        award.type,
        award.name,
    ].join('|')));
    const historicalAwardsData = [...completedNbaHistoricalAwards, ...newWorkerNbaStaffAwards];
    if (newWorkerNbaStaffAwards.length > 0) {
        (initialLeagueStats as any).workerNbaStaffAwardHydrationPending = true;
    }
    await reportStartupProgress('Loading free agents and international talent...', 48, 9);
    let externalSourcesReady = 0;
    const trackExternalRoster = async <T,>(label: string, load: Promise<T>): Promise<T> => {
        const result = await load;
        externalSourcesReady += 1;
        await reportStartupProgress(
            `${label} players ready...`,
            Math.min(56, 48 + externalSourcesReady),
            Math.min(17, 9 + externalSourcesReady),
        );
        return result;
    };
    const loadTrackedExternalRosters = async (europeMode: boolean) => {
        const loads = europeMode
            ? [
                externalAvailability.euroleague ? fetchEuroleagueRoster(externalSourceSeason) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.wnba ? fetchWNBARoster(externalSourceSeason) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.currentOnlySources
                    ? fetchPBARoster(getPBARosterEconomyConfig(INITIAL_LEAGUE_STATS, 'external'))
                    : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.bleague ? fetchBLeagueRoster(externalSourceSeason) : Promise.resolve(EMPTY_ROSTER),
                Promise.resolve(historicalEndesaRoster ?? (externalAvailability.currentOnlySources ? fetchEndesaRoster() : EMPTY_ROSTER)),
                externalAvailability.gleague ? fetchGLeagueRoster(externalSourceSeason, 16000) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.chinaCba ? fetchChinaCBARoster(externalSourceSeason, 17000) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.nblAustralia ? fetchNBLAustraliaRoster(externalSourceSeason, 18000) : Promise.resolve(EMPTY_ROSTER),
              ]
            : [
                externalAvailability.euroleague ? fetchEuroleagueRoster(externalSourceSeason) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.wnba ? fetchWNBARoster(externalSourceSeason) : Promise.resolve(EMPTY_ROSTER),
                Promise.resolve(historicalPbaRoster ?? (
                    externalAvailability.currentOnlySources ? fetchPBARoster(getPBARosterEconomyConfig(
                        INITIAL_LEAGUE_STATS,
                        'external',
                    )) : EMPTY_ROSTER
                )),
                externalAvailability.bleague ? fetchBLeagueRoster(externalSourceSeason) : Promise.resolve(EMPTY_ROSTER),
                Promise.resolve(historicalEndesaRoster ?? (externalAvailability.currentOnlySources ? fetchEndesaRoster() : EMPTY_ROSTER)),
                externalAvailability.gleague ? fetchGLeagueRoster(externalSourceSeason, 16000) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.chinaCba ? fetchChinaCBARoster(externalSourceSeason, 17000) : Promise.resolve(EMPTY_ROSTER),
                externalAvailability.nblAustralia ? fetchNBLAustraliaRoster(externalSourceSeason, 18000) : Promise.resolve(EMPTY_ROSTER),
              ];
        const labels = ['EuroLeague', 'WNBA', 'PBA', 'B.League', 'Spanish league', 'G League', 'China CBA', 'NBL Australia'];
        return Promise.all(loads.map((load, index) => trackExternalRoster(labels[index], load)));
    };
    const externalRosterBundle: any[] = isFictional
        ? [EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER]
        : isEuropeModded
        ? await loadTrackedExternalRosters(true)
        : isPbaModded
        ? [EMPTY_ROSTER, EMPTY_ROSTER, historicalPbaRoster ?? EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER, EMPTY_ROSTER]
        : await loadTrackedExternalRosters(false);
    const [
        { players: euroPlayers,    teams: euroTeams, competitionHistory: euroleagueHistoricalCompetitionHistory = [] },
        { players: wnbaPlayers,    teams: wnbaTeams },
        { players: pbaPlayers,     teams: pbaTeams },
        { players: bleaguePlayers, teams: bleagueTeams },
        { players: endesaPlayers,  teams: endesaTeams },
        { players: gleaguePlayers, teams: gleagueTeams },
        { players: chinaPlayers,   teams: chinaTeams },
        { players: nblAusPlayers,  teams: nblAusTeams },
    ] = externalRosterBundle;
    await reportStartupProgress('Building the free-agent and external player market...', 57, 18);
    const visibleEuroPlayers = isNbaModded ? selectExternalMarketPlayers(euroPlayers, { showcaseRosterSize: 8 }) : euroPlayers;
    const visibleWnbaPlayers = wnbaPlayers;
    const visiblePbaPlayers = isNbaModded
        ? selectExternalMarketPlayers(pbaPlayers.filter(player => {
            const draftYear = Number(player.draft?.year ?? 0);
            return player.status !== 'Retired'
                && (!Number.isFinite(draftYear) || draftYear <= nbaStartYear);
          }), { showcaseRosterSize: 8 })
        : pbaPlayers;
    const visibleBLeaguePlayers = isNbaModded ? selectExternalMarketPlayers(bleaguePlayers, { showcaseRosterSize: 8 }) : bleaguePlayers;
    const visibleEndesaPlayers = isNbaModded ? selectExternalMarketPlayers(endesaPlayers, { showcaseRosterSize: 8 }) : endesaPlayers;
    const visibleChinaPlayers = isNbaModded ? selectExternalMarketPlayers(chinaPlayers, { showcaseRosterSize: 8 }) : chinaPlayers;
    const visibleNblAusPlayers = isNbaModded ? selectExternalMarketPlayers(nblAusPlayers, { showcaseRosterSize: 8 }) : nblAusPlayers;
    const normName = (name: string) => normalizeHistoricalEndesaPlayerName(name);
    const rawNbaByName = new Map<string, any>();
    rawNbaPlayers.forEach(player => {
        const key = normName(player.name);
        const existing = rawNbaByName.get(key);
        const existingScore = (existing?.stats?.length ?? 0) + (existing?.awards?.length ?? 0);
        const incomingScore = (player?.stats?.length ?? 0) + (player?.awards?.length ?? 0);
        if (!existing || incomingScore > existingScore) rawNbaByName.set(key, player);
    });
    const rawNbaByIdentity = new Map<string, any>();
    const rawNbaNameCounts = new Map<string, number>();
    rawNbaPlayers.forEach(player => {
        const nameKey = normName(player.name);
        rawNbaNameCounts.set(nameKey, (rawNbaNameCounts.get(nameKey) ?? 0) + 1);
        const identityKey = getSpainCrossSourcePlayerIdentityKey(player);
        const existing = rawNbaByIdentity.get(identityKey);
        const existingScore = (existing?.stats?.length ?? 0) + (existing?.awards?.length ?? 0);
        const incomingScore = (player?.stats?.length ?? 0) + (player?.awards?.length ?? 0);
        if (!existing || incomingScore > existingScore) rawNbaByIdentity.set(identityKey, player);
    });
    const resolveRawNbaPlayer = (player: any) => {
        const exact = rawNbaByIdentity.get(getSpainCrossSourcePlayerIdentityKey(player));
        if (exact) return exact;
        const nameKey = normName(player.name);
        if (rawNbaNameCounts.get(nameKey) !== 1) return undefined;
        const nameMatch = rawNbaByName.get(nameKey);
        const playerBirthYear = Number(player?.born?.year ?? 0);
        const matchBirthYear = Number(nameMatch?.born?.year ?? 0);
        const playerDraftYear = Number(player?.draft?.year ?? 0);
        const matchDraftYear = Number(nameMatch?.draft?.year ?? 0);
        const identityMatches = playerBirthYear && matchBirthYear
            ? Math.abs(playerBirthYear - matchBirthYear) <= 1
            : !playerDraftYear || !matchDraftYear || playerDraftYear === matchDraftYear;
        return identityMatches
            ? nameMatch
            : undefined;
    };
    const mergeNbaMasterCareer = (player: any) => mergeMainRosterCareer(
        player,
        resolveRawNbaPlayer(player),
        { preferLegacyPortrait: true },
    );
    const { clubAliasMap, mergedEuroTeamTids } = (isEuropeModded || isNbaModded) && endesaTeams.length > 0
        ? buildSpainClubAliasMap(endesaTeams, euroTeams)
        : { clubAliasMap: {}, mergedEuroTeamTids: new Set<number>() };
    const euroByIdentity = new Map(visibleEuroPlayers.map(player => [
        getSpainCrossSourcePlayerIdentityKey(player),
        canonicalizeEuroleaguePlayerForSpain(player, clubAliasMap),
    ] as const));
    const endesaIdentityKeys = new Set(visibleEndesaPlayers.map(getSpainCrossSourcePlayerIdentityKey));
    const uniqueEuroPlayersBeforeRosterFit = visibleEuroPlayers
        .filter(player => !endesaIdentityKeys.has(getSpainCrossSourcePlayerIdentityKey(player)))
        .map(p => mergeNbaMasterCareer({
                ...canonicalizeEuroleaguePlayerForSpain(p, clubAliasMap),
                status: clubAliasMap[p.tid] !== undefined
                    ? 'Endesa' as const
                    : p.status || 'Euroleague' as const,
            }));
    const uniqueEuroPlayers = isSpainEurope
        ? fitEuroleaguePlayersIntoSpainOpeningRosters({
            endesaPlayers: visibleEndesaPlayers,
            euroleaguePlayers: uniqueEuroPlayersBeforeRosterFit,
            endesaTeams,
            sourceSeason: endesaSourceSeason,
            rosterLimit: getStandardRosterLimit(initialLeagueStats),
        })
        : uniqueEuroPlayersBeforeRosterFit;
    const externalIdentityPlayers = [
        ...uniqueEuroPlayers,
        ...visibleEndesaPlayers,
        ...backgroundEuroRosters.flatMap(entry => entry.roster.players),
        ...visibleWnbaPlayers,
        ...visiblePbaPlayers,
        ...visibleBLeaguePlayers,
        ...visibleChinaPlayers,
        ...visibleNblAusPlayers,
    ];
    await reportStartupProgress('Reconciling cross-league player identities...', 61, 19);
    const externalIdentityIndex = createCanonicalPlayerIdentityIndex(externalIdentityPlayers as Player[]);
    const rawExternalStatuses = new Set([
        'WNBA',
        'Euroleague',
        'EuroCup',
        'PBA',
        'B-League',
        'G-League',
        'Endesa',
        'China CBA',
        'NBL Australia',
        ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
    ]);
    const nbaPlayers = isEuropeModded
        ? []
        : rawNbaPlayers.filter(p => shouldRetainNbaMasterPlayer(
            p,
            externalIdentityIndex,
            rawExternalStatuses,
        ));
    const existingNbaIdentityIndex = createCanonicalPlayerIdentityIndex(nbaPlayers);
    const nonGLeagueExternalIdentityIndex = createCanonicalPlayerIdentityIndex(externalIdentityPlayers as Player[]);
    const uniqueGLeaguePlayers = gleaguePlayers
        .filter(p => !existingNbaIdentityIndex.has(p) && !nonGLeagueExternalIdentityIndex.has(p))
        .map(p => mergeNbaMasterCareer({ ...p, status: 'G-League' as const }));
    const filteredEuroTeams = endesaTeams.length > 0
        ? euroTeams.filter(team => !mergedEuroTeamTids.has(team.tid))
        : euroTeams;
    const spainDomesticTeamCount = primaryDomesticSource?.competitionId === 'endesa'
        ? primaryEuroRoster.teams.length
        : endesaTeams.length;
    const spainCompetitions = isSpainEurope
        ? (euroTeams.length > 0 ? SPAIN_COMPETITIONS : SPAIN_COMPETITIONS.filter(competition => competition.id !== 'euroleague'))
            .map(competition => competition.id === 'euroleague'
                ? {
                    ...competition,
                    teamCount: euroTeams.length,
                    gamesPerTeam: Math.max(0, (euroTeams.length - 1) * 2),
                }
                : competition.id === 'endesa' && spainDomesticTeamCount >= 2
                  ? {
                      ...competition,
                      teamCount: spainDomesticTeamCount,
                      gamesPerTeam: Math.max(0, (spainDomesticTeamCount - 1) * 2),
                    }
                  : competition)
        : [];
    const uniqueEndesaPlayers = visibleEndesaPlayers
        .filter(p => !existingNbaIdentityIndex.has(p))
        .map(p => {
            const endesaPlayer = mergeMainRosterCareer(
                p.status === 'Retired' ? p : { ...p, status: 'Endesa' as const },
                euroByIdentity.get(getSpainCrossSourcePlayerIdentityKey(p)),
            );
            return mergeNbaMasterCareer(endesaPlayer);
        });
    let euroUniverse = {
        players: [
            ...uniqueEuroPlayers.map(player => ({ ...player, tid: clubAliasMap[player.tid] ?? player.tid })),
            ...uniqueEndesaPlayers,
        ],
        teams: [...filteredEuroTeams, ...endesaTeams],
    };
    const euroUniverseAliases: Record<number, number> = { ...clubAliasMap };
    if (primaryDomesticSource && primaryEuroRoster.teams.length > 0) {
        const merged = mergeEuroRosterBucket(euroUniverse, primaryEuroRoster, { incomingOwnsDomesticIdentity: true });
        euroUniverse = { players: merged.players, teams: merged.teams };
        Object.assign(euroUniverseAliases, merged.aliases);
    }
    for (const entry of backgroundEuroRosters) {
        if (entry.roster.teams.length === 0) continue;
        const merged = mergeEuroRosterBucket(euroUniverse, entry.roster, {
            incomingOwnsDomesticIdentity: entry.source.kind === 'domestic',
        });
        euroUniverse = { players: merged.players, teams: merged.teams };
        Object.assign(euroUniverseAliases, merged.aliases);
    }
    if (isEuropeModded || isNbaModded) {
        euroUniverse = {
            ...euroUniverse,
            players: trimEuroOpeningRosters(euroUniverse.players, euroUniverse.teams, {
                rosterLimit: getStandardRosterLimit(initialLeagueStats),
                sourceSeason: externalEuropeanSourceSeason,
                retainWithSourceClub: isNbaModded,
            }),
        };
    }
    const externalCareerByIdentity = new Map<string, Player>();
    if (isNbaModded) {
        for (const candidate of [
            ...euroPlayers,
            ...endesaPlayers,
            ...backgroundEuroRosters.flatMap(entry => entry.careerPlayers),
            ...pbaPlayers,
            ...bleaguePlayers,
            ...gleaguePlayers,
            ...chinaPlayers,
            ...nblAusPlayers,
        ]) {
            const key = getSpainCrossSourcePlayerIdentityKey(candidate);
            const existing = externalCareerByIdentity.get(key);
            externalCareerByIdentity.set(key, existing ? mergeMainRosterCareer(existing, candidate) : candidate);
        }
    }
    const nbaPlayersWithExternalHistory = isNbaModded
        ? nbaPlayers.map(player => {
            const external = externalCareerByIdentity.get(getSpainCrossSourcePlayerIdentityKey(player));
            return external ? mergeMainRosterCareer(player, external) : player;
          })
        : nbaPlayers;
    if (isNbaModded) {
        const nbaIdentities = new Set(nbaPlayersWithExternalHistory.map(getSpainCrossSourcePlayerIdentityKey));
        euroUniverse = {
            ...euroUniverse,
            players: euroUniverse.players.filter(player => !nbaIdentities.has(getSpainCrossSourcePlayerIdentityKey(player))),
        };
    }
    if ((isEuropeModded || isNbaModded) && rawNbaPlayers.length > 0) {
        euroUniverse = {
            ...euroUniverse,
            players: euroUniverse.players.map(mergeNbaMasterCareer),
        };
    }
    const finalEuroleagueSeededTids: number[] | undefined = isEuropeModded
        ? [...new Set<number>(euroTeams.map((team: NonNBATeam) => euroUniverseAliases[team.tid] ?? team.tid))]
        : undefined;
    const finalEndesaTids: number[] | undefined = isEuropeModded
        ? [...new Set<number>(endesaTeams.map((team: NonNBATeam) => euroUniverseAliases[team.tid] ?? team.tid))]
        : undefined;
    const canonicalUserTeamId = isEuropeModded && payload.userTeamId != null
        ? euroUniverseAliases[payload.userTeamId] ?? payload.userTeamId
        : payload.userTeamId;
    const baseEuroCompetitionTeamTids = isEuropeModded
        ? Object.fromEntries([
            ...(primaryDomesticSource && primaryEuroRoster.teams.length > 0
                ? [[primaryDomesticSource.competitionId, [...new Set(primaryEuroRoster.teams.map(team => euroUniverseAliases[team.tid] ?? team.tid))]] as const]
                : []),
            ...(finalEndesaTids?.length
                ? [['endesa', finalEndesaTids] as const]
                : []),
            ...backgroundEuroRosters
                .filter(entry => entry.roster.teams.length > 0)
                .map(entry => [
                    entry.source.competitionId,
                    [...new Set(entry.roster.teams.map(team => euroUniverseAliases[team.tid] ?? team.tid))],
                ] as const),
          ]) as Record<string, number[]>
        : undefined;
    const primaryCompetition = primaryDomesticSource
        ? buildEuroSourceCompetition(
            primaryDomesticSource,
            baseEuroCompetitionTeamTids?.[primaryDomesticSource.competitionId]?.length ?? 0,
            false,
        )
        : null;
    const primaryDomesticTournaments = primaryDomesticSource
        ? buildEuroDomesticTournaments(primaryDomesticSource, false)
        : [];
    const backgroundSourceCompetitions = backgroundEuroRosters.flatMap(entry => {
        if (entry.source.competitionId === 'euroleague') return [];
        const teamCount = baseEuroCompetitionTeamTids?.[entry.source.competitionId]?.length ?? 0;
        if (teamCount < 2) return [];
        return [
            buildEuroSourceCompetition(entry.source, teamCount, true),
            ...buildEuroDomesticTournaments(entry.source, true),
        ];
    });
    const euroleagueCompetition = SPAIN_COMPETITIONS.find(competition => competition.id === 'euroleague');
    const endesaCompetition = SPAIN_COMPETITIONS.find(competition => competition.id === 'endesa');
    const activeEuroCompetitions = isSpainEurope
        ? [...spainCompetitions, ...backgroundSourceCompetitions]
        : isEuropeModded
          ? [
              ...(primaryCompetition ? [primaryCompetition] : []),
              ...primaryDomesticTournaments,
              ...(euroleagueCompetition && finalEuroleagueSeededTids?.length
                  ? [{
                      ...euroleagueCompetition,
                      teamCount: finalEuroleagueSeededTids.length,
                      gamesPerTeam: Math.max(0, (finalEuroleagueSeededTids.length - 1) * 2),
                  }]
                  : []),
              ...(endesaCompetition && finalEndesaTids?.length
                  ? [{
                      ...endesaCompetition,
                      teamCount: finalEndesaTids.length,
                      gamesPerTeam: Math.max(0, (finalEndesaTids.length - 1) * 2),
                      backgroundOnly: true,
                  }]
                  : []),
              ...backgroundSourceCompetitions,
            ]
          : [];
    const euroCompetitionTeamTids = isEuropeModded && baseEuroCompetitionTeamTids
        ? seedDomesticTournamentParticipants(
            activeEuroCompetitions,
            euroUniverse.teams,
            euroSourceSeason,
            baseEuroCompetitionTeamTids,
        )
        : undefined;
    await reportStartupProgress('Combining external player careers...', 64, 20);
    await pbaImportBioPromise;
    const pbaPlayersWithVerifiedBios = isPbaModded
        ? restorePbaImportReferenceBios(visiblePbaPlayers, getVerifiedBioForPlayerIdentity)
        : visiblePbaPlayers;
    const uniquePBAPlayers = pbaPlayersWithVerifiedBios
        .filter(p => !existingNbaIdentityIndex.has(p))
        .map(p => isPbaModded
            ? isExplicitHistoricalPbaImport(p)
                ? mergePbaImportReference(p, rawNbaByName.get(normName(p.name)))
                : p
            : mergeNbaMasterCareer({ ...p, status: p.status || 'PBA' as const }));
    const uniqueBLeaguePlayers = visibleBLeaguePlayers
        .filter(p => !existingNbaIdentityIndex.has(p))
        .map(p => mergeNbaMasterCareer({ ...p, status: p.status || 'B-League' as const }));
    const uniqueChinaPlayers = visibleChinaPlayers
        .filter(p => !existingNbaIdentityIndex.has(p))
        .map(p => mergeNbaMasterCareer({ ...p, status: 'China CBA' as const }));
    const uniqueNBLAusPlayers = visibleNblAusPlayers
        .filter(p => !existingNbaIdentityIndex.has(p))
        .map(p => mergeNbaMasterCareer({ ...p, status: 'NBL Australia' as const }));
    const canonicalExternalPlayers: Player[] = [];
    const canonicalExternalIndicesByName = new Map<string, number[]>();
    for (const player of [
        ...euroUniverse.players,
        ...uniquePBAPlayers,
        ...uniqueNBLAusPlayers,
        ...uniqueBLeaguePlayers,
        ...uniqueGLeaguePlayers,
        ...uniqueChinaPlayers,
    ]) {
        const nameKey = normName(player.name);
        const existingIndex = (canonicalExternalIndicesByName.get(nameKey) ?? []).find(index => {
            const existing = canonicalExternalPlayers[index];
            if (!existing) return false;
            const playerPbaIdentity = player.historicalPbaSource?.identityKey;
            const existingPbaIdentity = existing.historicalPbaSource?.identityKey;
            if (playerPbaIdentity && existingPbaIdentity) return playerPbaIdentity === existingPbaIdentity;
            return sameCanonicalPlayerIdentity(existing, player);
        }) ?? -1;
        if (existingIndex === -1) {
            const index = canonicalExternalPlayers.length;
            canonicalExternalPlayers.push(player);
            const nameIndices = canonicalExternalIndicesByName.get(nameKey) ?? [];
            nameIndices.push(index);
            canonicalExternalIndicesByName.set(nameKey, nameIndices);
        } else {
            canonicalExternalPlayers[existingIndex] = mergeMainRosterCareer(
                canonicalExternalPlayers[existingIndex],
                player,
            );
        }
    }
    await reportStartupProgress('Building the opening player pool...', 66, 21);
    const historicalNbaEuroMarketPlayers = isEuropeModded
        ? buildHistoricalNbaEuroMarket(rawNbaPlayers, [...canonicalExternalPlayers, ...visibleWnbaPlayers], {
            completedSeasonCutoff: startupHistoryCompletedSeasonCutoff,
            salaryLeagueStatus: isSpainEurope ? 'Endesa' : primaryDomesticSource?.leagueStatus ?? 'Euroleague',
          })
        : [];
    const initialNonNBATeams = [...euroUniverse.teams, ...pbaTeams, ...wnbaTeams, ...bleagueTeams, ...gleagueTeams, ...chinaTeams, ...nblAusTeams];
    const mergedPlayers = [
        ...nbaPlayersWithExternalHistory,
        ...historicalNbaEuroMarketPlayers,
        ...canonicalExternalPlayers,
        ...visibleWnbaPlayers,
    ];
    const players = isNbaModded
        ? materializeInitialExternalNbaDraftClass(
            mergedPlayers,
            initialNonNBATeams,
            initialLeagueStats.year,
          )
        : mergedPlayers;
    await reportStartupProgress('Setting player contracts...', 68, 22);
    const startYear = initialLeagueStats.year;
    const salaryCap = initialLeagueStats.salaryCap;
    const pbaPlayerEconomy = isPbaModded
        ? getPBARosterEconomyConfig(initialLeagueStats, 'pba_isolated')
        : null;
    const EXTERNAL = new Set(['Euroleague', 'Endesa', 'PBA', 'B-League', 'G-League', 'China CBA', 'NBL Australia', 'WNBA', ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus)]);
    for (let i = 0; i < players.length; i++) {
        const p: any = players[i];
        if (!EXTERNAL.has(p.status)) continue;
        const isIsolatedPbaPlayer = isPbaModded && p.status === 'PBA' && !!pbaPlayerEconomy;
        const hasAmount = p.contract?.amount && p.contract.amount > 0;
        const hasExp    = typeof p.contract?.exp === 'number' && p.contract.exp >= startYear;
        if (!isIsolatedPbaPlayer && hasAmount && hasExp) continue;
        const scale = EXTERNAL_SALARY_SCALE[p.status];
        if (!scale) continue;
        const lastR = p.ratings?.[p.ratings.length - 1];
        const hgt   = lastR?.hgt ?? 50;
        const k2    = convertTo2KRating(p.overallRating ?? lastR?.ovr ?? 60, hgt, lastR?.tp);
        const ovrNorm = Math.min(1, Math.max(0, (k2 - 55) / 30));
        const salaryUSD = isIsolatedPbaPlayer
            ? computeLocalPBASalaryUSD(
                Number(p.overallRating ?? lastR?.ovr ?? 50),
                pbaPlayerEconomy!,
                p,
                startYear,
            )
            : Math.round(salaryCap * (scale.minPct + ovrNorm * (scale.maxPct - scale.minPct)));
        const years = k2 >= 78 ? 3 : k2 >= 70 ? 2 : 1;
        const expYear = startYear + years - 1;
        let seed = 0;
        for (let ci = 0; ci < (p.internalId ?? '').length; ci++) seed += p.internalId.charCodeAt(ci);
        const offset = (seed % 3); // 0, 1, or 2 extra seasons
        const finalExp = expYear + offset;
        const contractYears = Array.from({ length: finalExp - startYear + 1 }).map((_, yi) => {
            const season = `${startYear + yi - 1}-${String(startYear + yi).slice(-2)}`;
            const escalated = Math.round(salaryUSD * Math.pow(1.04, yi));
            return { season, guaranteed: escalated, option: '' };
        });
        players[i] = {
            ...p,
            contract: {
                ...(p.contract ?? {}),
                amount: Math.round(salaryUSD / 1_000), // BBGM thousands
                exp: finalExp,
                ...(isIsolatedPbaPlayer ? {
                    pbaEconomyVersion: PBA_PLAYER_ECONOMY_VERSION,
                    pbaSalarySource: 'generated',
                } : {}),
            },
            contractYears,
        } as any;
    }
    const initSeasonStr = `${startYear - 1}-${String(startYear).slice(-2)}`;
    const SANE_GUARANTEED_USD_INIT = 250_000_000;
    const SANE_AMOUNT_THOUSANDS_INIT = 250_000;
    for (let i = 0; i < players.length; i++) {
        const p: any = players[i];
        if (!p.contract || !Array.isArray(p.contractYears)) continue;
        const entry = p.contractYears.find((cy: any) => cy.season === initSeasonStr);
        if (!entry || entry.guaranteed <= 0 || entry.guaranteed > SANE_GUARANTEED_USD_INIT) continue;
        const synced = Math.round(entry.guaranteed / 1000);
        if (synced <= 0 || synced > SANE_AMOUNT_THOUSANDS_INIT) continue;
        if (synced === p.contract.amount) continue;
        players[i] = { ...p, contract: { ...p.contract, amount: synced } };
    }
    await reportStartupProgress('Reconciling canonical players...', 70, 23);
    const canonicalOpeningPlayers = applyHistoricalNationalityProfiles((isFictional
        ? players.map(withCanonicalPersonIdentity)
        : canonicalizeCrossLeaguePlayerIdentities(players as Player[], startYear, {
            preserveUndraftedProspectsFromYear: isNbaModded ? startYear : undefined,
        }).players).map(withFranchiseCareerLoyalty), startYear, { generated: isFictional });
    const { additions: initialExternalFillers } = enforceExternalMinRoster({
            players: canonicalOpeningPlayers,
            nonNBATeams: initialNonNBATeams,
            leagueType: payload.leagueType ?? 'modded',
            moddedLeagueBase: payload.leagueType === 'modded'
                ? (payload.moddedLeagueBase ?? 'nba')
                : undefined,
            leagueStats: {
                ...initialLeagueStats,
            } as any,
        } as any, startYear);
    const allPlayersBase = applyHistoricalNationalityProfiles(initialExternalFillers.length > 0
        ? [...canonicalOpeningPlayers, ...initialExternalFillers]
        : canonicalOpeningPlayers, startYear, { generated: isFictional });
    await reportStartupProgress('Building Draft classes...', 72, 24);
    const playersWithRealPbaDraftClasses = isPbaModded && historicalPbaRoster
        ? materializeRealPbaDraftClasses(
            allPlayersBase as any,
            historicalPbaRoster.source,
            startYear,
            initialLeagueStats.draftEligibilityRule,
          ).players
        : allPlayersBase;
    const initialDraftFill = isPbaModded
        ? ensureDraftClasses(
            playersWithRealPbaDraftClasses as any,
            startYear,
            initialLeagueStats.draftEligibilityRule,
            'regen_pack',
            {
                collegePool: buildPbaCollegePoolFromSource(allPlayersBase as any),
                nationalityOverride: 'Philippines',
                forceCollegePath: true,
                talentProfile: 'pba',
                targetClassSize: getPbaDraftClassTargetSize(pbaTeams.length),
                draftYears: getUpcomingPbaDraftYears(startYear),
            },
          )
        : historicalNbaStart
        ? ensureDraftClasses(
            allPlayersBase as any,
            startYear,
            initialLeagueStats.draftEligibilityRule,
            'legacy_newgen',
            { playerScope: 'nba' },
          )
        : { additions: [], generatedByYear: {} };
    const playersWithDraftProspects = initialDraftFill.additions.length > 0
        ? [...playersWithRealPbaDraftClasses, ...initialDraftFill.additions]
        : playersWithRealPbaDraftClasses;
    const tunedPlayersWithDraftProspects = isPbaModded
        ? tunePbaDraftProspects(playersWithDraftProspects as any, startYear, initialLeagueStats)
        : playersWithDraftProspects;
    const historicalHofInductionByName = new Map(
        historicalNbaStart
            ? (await hofDataPromise.catch(() => [])).map(inductee => [
                String(inductee.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''),
                Number(inductee.inductionYear),
              ] as const)
            : [],
    );
    const allPlayersWithAwards = isPbaModded
        ? applyPbaAwardsToPlayers(tunedPlayersWithDraftProspects, historicalAwardsData)
        : isNbaModded
          ? applyHistoricalNbaExtraAwardsToPlayers(
              applyHistoricalNbaClutchAwardsToPlayers(tunedPlayersWithDraftProspects as Player[], startupHistoryCompletedSeasonCutoff),
              startupHistoryCompletedSeasonCutoff,
            )
          : tunedPlayersWithDraftProspects;
    const allPlayersWithDunkWinnerBoost = isPbaModded || isNbaModded
        ? applyRealDunkContestWinnerBoost(allPlayersWithAwards)
        : allPlayersWithAwards;
    const allPlayersBeforeFamily = historicalNbaStart
        ? applyHistoricalNbaInjuryProfilePolicy(
            allPlayersWithDunkWinnerBoost.map(player => resetFutureHOFStatus(
                player,
                startupHistoryCompletedSeasonCutoff,
                historicalHofInductionByName.get(String(player.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')),
            )) as Player[],
            nbaStartYear,
          )
        : allPlayersWithDunkWinnerBoost;
    const initialFamilyAdditionIds = new Set(initialDraftFill.additions.map(player => player.internalId));
    const initialFamilyLineages = applyGeneratedFamilyLineages(
          allPlayersBeforeFamily.filter(player => !initialFamilyAdditionIds.has(player.internalId)) as Player[],
          allPlayersBeforeFamily.filter(player => initialFamilyAdditionIds.has(player.internalId)) as Player[],
          startYear,
          isEuropeModded ? 'euro' : isPbaModded ? 'pba' : isFictional ? 'fictional' : 'nba',
          historicalNbaStart ? nbaStartYear : undefined,
        );
    await reportStartupProgress('Completing league history...', 76, 25);
    const euroAwardHydration = isEuropeModded
        ? await hydrateCompetitionAwardHistory(
            initialFamilyLineages.players as Player[],
            historicalAwardsData,
            activeEuroCompetitions,
            Math.max(0, initialLeagueStats.year - 1),
          )
        : null;
    if (euroAwardHydration) {
        (initialLeagueStats as any).competitionAwardHistoryVersion = COMPETITION_AWARD_HISTORY_VERSION;
        (initialLeagueStats as any).competitionAwardHistoryCutoff = Math.max(0, initialLeagueStats.year - 1);
    }
    const allPlayers = hydrateCompletedKnownNaturalizations(
        euroAwardHydration?.players ?? initialFamilyLineages.players,
        startupDate ?? `${startYear}-12-31`,
    );
    const hydratedEuroCompetitions = euroAwardHydration?.activeCompetitions ?? activeEuroCompetitions;
    const hydratedHistoricalAwardsData = euroAwardHydration?.historicalAwards ?? historicalAwardsData;
    if (!isPbaModded && !isFictional && !isEuropeModded) {
      import('../../services/draftScoutingGist')
        .then(m => m.prefetchDraftScouting(initialLeagueStats.year))
        .catch(() => {});
    }
    nameDataPromise.catch(() => {}); // fire-and-forget; errors tolerable
    hofDataPromise.catch(() => {});
    if (allPlayers.some(p => p.name.toLowerCase() === 'devin booker')) {
        console.log("🏀 DEV1N B00K3R 1S L0AD3D! 🏀");
    }
    const emptyStaff = { owners: [], gms: [], coaches: [], leagueOffice: [] };
    const schedule: any[] = [];
    const defaultInitialDate = isPbaModded && startupDate
        ? new Date(`${startupDate}T00:00:00Z`)
        : getSeasonSimStartDate(initialLeagueStats.year, initialLeagueStats);
    const requestedDate = startupDate
        ? new Date(`${startupDate}T00:00:00Z`)
        : null;
    const requestedDateIsBeforeDefault = requestedDate
        && Number.isFinite(requestedDate.getTime())
        && requestedDate < defaultInitialDate;
    const requestedCommissionerDate = (
        (payload.gameMode ?? 'commissioner') !== 'gm'
        || isPbaModded
        || requestedDateIsBeforeDefault
        || Boolean(nbaGmStartMode)
    )
        ? requestedDate
        : null;
    const initialDate = requestedCommissionerDate && Number.isFinite(requestedCommissionerDate.getTime())
        ? requestedCommissionerDate
        : defaultInitialDate;
    const startDateFormatted = initialDate.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
    await reportStartupProgress('Preparing opening news and season context...', 82, 26);
    let initialContent: any = { newEmails: [], newNews: [], newSocialPosts: [] };
    if (!payload.skipLLM) {
        try {
            initialContent = await generateInitialContent(startDateFormatted, commissionerName, allPlayers, teams, emptyStaff);
        } catch (error) {
            console.warn('[INITIALIZE] Opening content unavailable; using the standard welcome package.', error);
        }
    }
    const hasGeneratedOpeningContent = (
        (initialContent.newEmails?.length ?? 0)
        + (initialContent.newNews?.length ?? 0)
        + (initialContent.newSocialPosts?.length ?? 0)
    ) > 0;
    if (payload.skipLLM || !hasGeneratedOpeningContent) {
        const isGM = payload.gameMode === 'gm';
        const userTeam = isGM && typeof canonicalUserTeamId === 'number'
            ? teams.find(t => t.id === canonicalUserTeamId) ?? initialNonNBATeams.find(t => t.tid === canonicalUserTeamId)
            : undefined;
        const commissionerDisplayName = resolveCommissionerDisplayName(commissionerName);
        const leagueName = isFictional
            ? fictionalLeagueName
            : isEuropeModded
              ? isSpainEurope ? 'Liga Endesa' : primaryDomesticSource?.displayName ?? 'European Basketball'
              : isPbaModded
                ? 'PBA'
                : isWnbaModded
                  ? 'WNBA'
                  : 'NBA';
        const userTeamName = userTeam ? getTeamFullName(userTeam) : undefined;
        const teamLabel = resolveTeamNewsObject(userTeamName);
        const teamHeadlineLabel = resolveTeamNewsSubject(userTeamName, leagueName);
        const officialHandle = isFictional || isEuropeModded
            ? `${leagueName.replace(/[^A-Za-z0-9]/g, '')}Official`
            : isWnbaModded
              ? 'wnba'
              : isPbaModded
                ? 'pbaconnect'
                : 'nba';
        const officialAuthor = leagueName;
        const priorNbaSeasonLabel = isNbaModded
            ? previousNbaSeasonLabelForStartYear(nbaStartYear)
            : null;
        const scheduleReleaseLabel = getLeagueScheduleReleaseDate(initialLeagueStats.year, initialLeagueStats)
            .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        initialContent = {
            newEmails: [{
                sender: isGM ? `${userTeamName ?? 'Your Team'} Front Office` : `${leagueName} Office`,
                senderRole: isGM ? 'Owner' : 'Operations',
                subject: isGM ? 'Welcome Aboard' : priorNbaSeasonLabel ? `${priorNbaSeasonLabel} Season Review Ready` : 'Schedule Generation Approaching',
                body: isGM
                    ? `${commissionerDisplayName}, welcome to ${teamLabel}. We're signing you to a five-year contract as General Manager. Build us something special.`
                    : priorNbaSeasonLabel
                        ? `Commissioner ${commissionerDisplayName}, the ${priorNbaSeasonLabel} season review is ready. Complete the remaining league planning before the new schedule is released.`
                    : `Commissioner ${commissionerDisplayName}, the league schedule will be released on ${scheduleReleaseLabel}. Review the competition calendar and league events before opening day.`,
                playerPortraitUrl: userTeam?.logoUrl ?? userTeam?.imgURL ?? (isNbaModded ? 'https://cdn.nba.com/headshots/nba/latest/1040x760/logoman.png' : undefined),
            }],
            newNews: [{
                headline: isGM
                    ? `${teamHeadlineLabel} Hires ${commissionerDisplayName} as General Manager`
                    : priorNbaSeasonLabel
                        ? `${priorNbaSeasonLabel} Season Review Opens the New League Year`
                        : 'League Awaits Schedule Release',
                content: isGM
                    ? `${teamHeadlineLabel} has named ${commissionerDisplayName} its new General Manager on a five-year contract. The front office cited ${commissionerDisplayName === 'the new front-office lead' ? 'the hire’s' : 'their'} vision for roster construction and player development.`
                    : priorNbaSeasonLabel
                        ? `The league has opened its official review of the ${priorNbaSeasonLabel} season before the remaining summer calendar is finalized. Commissioner ${commissionerDisplayName} has officially taken office.`
                    : `With the schedule release set for ${scheduleReleaseLabel}, fans and teams are awaiting the new competition calendar. Commissioner ${commissionerDisplayName} has officially taken office.`,
                type: 'league',
            }],
            newSocialPosts: [{
                author: officialAuthor,
                handle: officialHandle,
                content: isGM
                    ? `BREAKING: ${teamHeadlineLabel} has hired ${commissionerDisplayName} as its new General Manager. Five-year contract. 📝`
                    : `Welcome to the new era of ${leagueName}. Commissioner ${commissionerDisplayName} is officially on the job! 🏀`,
                source: 'TwitterX',
            }],
        };
    }
    let openingSeasonRecap: any = null;
    if (isNbaModded) {
        try {
            const recap = await fetchPriorNbaSeasonRecap(nbaStartYear);
            if (recap) openingSeasonRecap = recap;
        } catch (error) {
            console.warn('[INITIALIZE] Prior NBA season recap unavailable; continuing with the saved opening news.', error);
        }
    }
    const openingLeagueName = isFictional
        ? fictionalLeagueName
        : isEuropeModded
          ? isSpainEurope ? 'Liga Endesa' : primaryDomesticSource?.displayName ?? 'European Basketball'
          : isPbaModded
            ? 'PBA'
            : 'NBA';
    const openingSeasonLabel = isNbaModded
        ? previousNbaSeasonLabelForStartYear(nbaStartYear) ?? String(initialLeagueStats.year - 1)
        : isPbaModded
          ? String(initialLeagueStats.year - 1)
          : `${initialLeagueStats.year - 1}-${String(initialLeagueStats.year).slice(-2)}`;
    initialContent = {
        ...initialContent,
        newNews: [openingSeasonRecap ?? buildOpeningSeasonReviewNews(
            openingLeagueName,
            openingSeasonLabel,
            startDateFormatted,
        )],
    };
    const initialInbox = (initialContent.newEmails || []).map((e: any, i: number) => {
        let teamLogoUrl = e.teamLogoUrl;
        if (!teamLogoUrl) {
            const team = teams.find(t =>
                (e.sender && e.sender.toLowerCase().includes(t.name.toLowerCase())) ||
                (e.senderRole && e.senderRole.toLowerCase().includes(t.name.toLowerCase())) ||
                (e.organization && e.organization.toLowerCase().includes(t.name.toLowerCase()))
            );
            if (team) teamLogoUrl = team.logoUrl;
        }
        return {
            ...e,
            id: `init-email-${i}`,
            read: false,
            replied: false,
            date: startDateFormatted,
            teamLogoUrl
        };
    });
    const initialNews = (initialContent.newNews || []).map((n: any, i: number) => ({
        ...n,
        id: n.id ?? `init-news-${i}`,
        date: startDateFormatted,
        isNew: true
    }));
    const initialSocial = isTwitterAvailable(startDateFormatted, initialLeagueStats.year)
      ? (initialContent.newSocialPosts || []).map((s: any, i: number) => {
        const timelinePost = coerceInsiderPostToEra(s, payload.leagueType, startDateFormatted, initialLeagueStats.year, initialLeagueStats.uiMode);
        const engagement = calculateSocialEngagement(timelinePost.handle, timelinePost.content);
        return {
            ...timelinePost,
            id: `init-social-${i}`,
            date: startDateFormatted,
            likes: engagement.likes,
            retweets: engagement.retweets,
        };
      })
      : [];
    const initialHistoricalPoint: HistoricalStatPoint = {
        date: startDateFormatted,
        publicApproval: 48,
        ownerApproval: 55,
        playerApproval: 45,
        legacy: 0,
        revenue: initialLeagueStats.revenue,
        annualRevenue: initialLeagueStats.mediaRights?.totalRev
            ? initialLeagueStats.mediaRights.totalRev * 1000
            : initialLeagueStats.revenue,
        leagueReserve: 1000,
        availableBudget: 1000,
        viewership: initialLeagueStats.viewership,
    };
    console.log("=== ROSTER INITIALIZATION DEBUG ===");
    console.log(`NBA: ${nbaPlayers.length} players, ${teams.length} teams`);
    console.log(`WNBA: ${visibleWnbaPlayers.length} players, ${wnbaTeams.length} teams`);
    console.log(`Euroleague: ${visibleEuroPlayers.length} players, ${filteredEuroTeams.length} teams`);
    console.log(`PBA: ${visiblePbaPlayers.length} players, ${pbaTeams.length} teams`);
    console.log(`B-League: ${visibleBLeaguePlayers.length} players, ${bleagueTeams.length} teams`);
    console.log(`G-League: ${gleaguePlayers.length} players, ${gleagueTeams.length} teams`);
    console.log(`Endesa: ${uniqueEndesaPlayers.length} players, ${endesaTeams.length} teams`);
    console.log(`China CBA: ${visibleChinaPlayers.length} players, ${chinaTeams.length} teams`);
    console.log(`NBL Australia: ${visibleNblAusPlayers.length} players, ${nblAusTeams.length} teams`);
    console.log(`Generated External Fillers: ${initialExternalFillers.length}`);
    console.log(`Total Players: ${allPlayers.length}`);
    console.log("====================================");
    const initialAllStar = null;
    const activeSeasonTeamsRaw = applyTeamIdentitiesForTimeline(teams, timelineInput, { mode: 'setup' });
    const historicalTeamStructurePatch = historicalNbaStart
        ? applyHistoricalNbaTeamStructure(activeSeasonTeamsRaw as any, initialLeagueStats.year)
        : null;
    if (historicalTeamStructurePatch?.changedTeamIds.length) {
        console.log(`[INITIALIZE] Corrected ${historicalTeamStructurePatch.changedTeamIds.length} historical NBA team structure row(s).`);
    }
    const initialContractionPatch = historicalNbaStart
        ? applyHistoricalNbaContractions({
            leagueYear: initialLeagueStats.year,
            teams: historicalTeamStructurePatch?.teams ?? activeSeasonTeamsRaw as any,
            players: allPlayers as any,
            archiveThroughSeason: initialLeagueStats.year - 1,
        })
        : null;
    if (initialContractionPatch?.removedTeamIds.length) {
        console.log(`[INITIALIZE] Removed contracted historical NBA teams: ${initialContractionPatch.removedTeamNames.join(', ')}`);
    }
    const activeSeasonTeams = initialContractionPatch?.teams ?? historicalTeamStructurePatch?.teams ?? activeSeasonTeamsRaw;
    const initialRealNbaLottery = isNbaFullOffseasonStart
        ? buildRealNbaLotteryHydration(nbaStartYear, activeSeasonTeams as NBATeam[])
        : undefined;
    if (isNbaModded) {
        initialLeagueStats.allStarHosts = materializeKnownNbaAllStarHosts({
            existing: initialLeagueStats.allStarHosts,
            teams: activeSeasonTeams as NBATeam[],
            seedSeasonYear: initialLeagueStats.year,
            knowledgeDate: initialDate,
            history: await allStarHistoryPromise,
        });
    }
    const activeSeasonPlayers = initialContractionPatch?.players ?? allPlayers;
    const fictionalSalaryBasis = initialLeagueStats.salaryCap > 0
        ? initialLeagueStats.salaryCap
        : initialLeagueStats.historicalContractScaleCap ?? INITIAL_LEAGUE_STATS.salaryCap;
    const fictionalFinancialScale = isFictional
        ? Math.max(0.000001, fictionalSalaryBasis / INITIAL_LEAGUE_STATS.salaryCap)
        : 1;
    await reportStartupProgress('Setting international basketball and broadcasts...', 88, 27);
    let internationalSetup: Awaited<ReturnType<typeof prepareInternationalTournamentWindow>> = {
        players: activeSeasonPlayers,
        tournament: undefined,
    };
    if (isNbaModded || isEuropeModded) {
        try {
            const internationalStartYear = isNbaModded ? nbaStartYear : startYear;
            internationalSetup = isNbaModded && nbaGmStartMode === 'fixed_preseason'
                ? {
                    players: await enrichPlayersWithFibaHistoricalAwards(activeSeasonPlayers as any, internationalStartYear),
                    tournament: undefined,
                }
                : await prepareInternationalTournamentWindow(
                    activeSeasonPlayers as any,
                    internationalStartYear,
                    internationalStartYear,
                    internationalStartYear,
                    startupDate,
                );
        } catch (error) {
            console.warn('[INITIALIZE] Optional international history unavailable; continuing league startup.', error);
        }
    }
    let initialBroadcastSetup = {
        players: internationalSetup.players,
        records: [] as GameState['broadcastTalent'],
    };
    try {
        initialBroadcastSetup = await buildInitialBroadcastTalent(
            {
                leagueType: payload.leagueType,
                moddedLeagueBase: payload.moddedLeagueBase,
                leagueStats: initialLeagueStats,
                nbaStartYear,
            },
            internationalSetup.players,
        );
    } catch (error) {
        console.warn('[INITIALIZE] Broadcast talent archive unavailable; continuing with an empty talent desk.', error);
    }
    await reportStartupProgress('Broadcast team ready. Preparing Draft picks...', 91, 28);
    const nbaNBATeams = activeSeasonTeams.filter((t: any) => t.id >= 0 && t.id < 100);
    const initYear = initialLeagueStats.year;
    const initWindowSize = initialLeagueStats.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
    const initialDraftPicks = isEuropeModded
        ? []
        : (() => {
            const withNba = generateFuturePicks(
                draftPicks,
                nbaNBATeams as any,
                initYear,
                initWindowSize,
                true,
                getDraftRoundsForLeague(initialLeagueStats),
            );
            if (!isPbaModded) return withNba;
            const pbaTeamIds = (initialNonNBATeams ?? []).filter((team: any) => team.league === 'PBA').map((team: any) => team.tid);
            return generateDraftPicksForTeamIdsAndSeasons(
                withNba,
                pbaTeamIds,
                getPbaDraftPickYears(initYear, initWindowSize, true),
                2,
            );
          })();
    await reportStartupProgress('Assigning staff, officials, and front offices...', 93, 29);
    await historicalStaffArchivePromise;
    let initialStaff: any = null;
    let fictionalStaffSetup: ReturnType<typeof generateFictionalStaffSetup> | null = null;
    if (isFictional) {
        const nameDataResolved = await nameDataPromise;
        fictionalStaffSetup = generateFictionalStaffSetup({
            teams: activeSeasonTeams,
            nameData: nameDataResolved,
            currentYear: initialLeagueStats.year,
            seed: payload.fictionalLeagueSeed ?? Date.now(),
            gameMode: payload.gameMode ?? 'commissioner',
            userTeamId: payload.userTeamId,
            historyMode: payload.fictionalHistoryMode,
            usedPortraitUrls: createPortraitUsageSet(activeSeasonPlayers.map(player => player.imgURL)),
            genderMode: payload.fictionalPlayerPool === 'womens'
              ? 'female'
              : payload.fictionalPlayerPool === 'mixed'
                ? 'mixed'
                : 'male',
        });
        setRefereeData(fictionalStaffSetup.referees);
        initialStaff = fictionalStaffSetup.staff;
    }
    let initialRefereeSetup: Awaited<ReturnType<typeof loadRefereeRoster>> | undefined;
    try {
        initialRefereeSetup = await loadRefereeRoster({
            leagueType: payload.leagueType,
            leagueStats: initialLeagueStats,
        } as Pick<GameState, 'leagueType' | 'leagueStats'>);
        setRefereeData(initialRefereeSetup.active);
        if (initialStaff) {
            initialStaff = { ...initialStaff, referees: initialRefereeSetup.active };
        }
    } catch (error) {
        console.warn('[INITIALIZE] Bundled referee roster unavailable; continuing with the existing fallback crew.', error);
    }
    await reportStartupProgress('Preparing team chemistry...', 94, 30);
    const activeSeasonNonNBATeamsRaw = applyTeamIdentitiesForTimeline(initialNonNBATeams, timelineInput, { mode: 'setup' });
    const chemistryPlayers = initialBroadcastSetup.players as Player[];
    const chemistryPlayersByLeague = new Map<string, Player[]>();
    for (const player of chemistryPlayers) {
        const leagueKey = String(player.status ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const leaguePlayers = chemistryPlayersByLeague.get(leagueKey) ?? [];
        leaguePlayers.push(player);
        chemistryPlayersByLeague.set(leagueKey, leaguePlayers);
    }
    const activeMainLeaguePlayers = chemistryPlayers.filter(player => (
        player.tid >= 0
        && player.tid < 100
        && !['WNBA', 'PBA', 'Euroleague', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(String(player.status ?? ''))
    ));
    const activeSeasonTeamsWithChemistry = seedOpeningTeamChemistry(
        fictionalStaffSetup?.teams ?? activeSeasonTeams,
        activeMainLeaguePlayers,
        initialLeagueStats.year,
    );
    const activeSeasonNonNBATeams = activeSeasonNonNBATeamsRaw.map(team => {
        const leagueKey = String((team as NonNBATeam).league ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const leaguePlayers = chemistryPlayersByLeague.get(leagueKey) ?? [];
        return seedOpeningTeamChemistry([team], leaguePlayers, initialLeagueStats.year)[0];
    });
    const openingDraftTeams = isPbaModded
        ? activeSeasonNonNBATeams.filter((team: any) => team.league === 'PBA')
        : isEuropeModded
          ? activeSeasonNonNBATeams.filter((team: any) => team.league === (primaryDomesticSource?.leagueStatus ?? 'Endesa'))
          : activeSeasonTeams;
    const openingDraftTeamIds = new Set(openingDraftTeams.map((team: any) => Number(team.id ?? team.tid)));
    if (isNbaModded) {
        initialBroadcastSetup = {
            ...initialBroadcastSetup,
            players: healHistoricalNbaPlayerStatTeamIds(teams as NBATeam[], initialBroadcastSetup.players),
        };
    }
    initialBroadcastSetup = {
        ...initialBroadcastSetup,
        players: hydrateHistoricalCareerMetrics(initialBroadcastSetup.players, initialLeagueStats.year),
    };
    if (isNbaModded) {
        await reportStartupProgress('Reconciling Draft prospect identities...', 95, 31);
        initialBroadcastSetup = {
            ...initialBroadcastSetup,
            players: canonicalizeDraftProspectIdentities(
                initialBroadcastSetup.players,
                initialLeagueStats.year,
            ).players,
        };
    }
    const historicalPeople = isNbaModded
        ? await (async () => {
            await reportStartupProgress('Indexing historical players and ratings...', 96, 32);
            return materializeCanonicalHistoricalPeople(
                initialBroadcastSetup.players,
                startupHistoryCompletedSeasonCutoff,
            );
          })()
        : undefined;
    const initialEuroCompetitionHistory = isEuropeModded
        ? (() => {
            const archiveRows = [
                ...euroleagueHistoricalCompetitionHistory,
                ...primaryEuroRoster.competitionHistory,
                ...backgroundEuroRosters.flatMap(entry => entry.roster.competitionHistory),
            ];
            if (isSpainEurope) {
                const endesaRows = new Map<number, any>();
                for (const award of historicalEndesaRoster?.historicalAwards ?? []) {
                    if (award.competitionId !== 'endesa' || !['Champion', 'Runner Up'].includes(award.type)) continue;
                    const season = Number(award.season);
                    if (!Number.isFinite(season) || season >= initialLeagueStats.year) continue;
                    const row = endesaRows.get(season) ?? { competitionId: 'endesa', season };
                    if (award.type === 'Champion') {
                        row.championTid = award.tid;
                        row.championName = award.name;
                    } else {
                        row.runnerUpTid = award.tid;
                        row.runnerUpName = award.name;
                    }
                    endesaRows.set(season, row);
                }
                archiveRows.push(...[...endesaRows.values()].filter(row => row.championTid != null));
            }
            const byCompetition = new Map<string, Map<number, any>>();
            for (const row of archiveRows) {
                if (row.championTid == null || row.season >= initialLeagueStats.year) continue;
                if (!byCompetition.has(row.competitionId)) byCompetition.set(row.competitionId, new Map());
                byCompetition.get(row.competitionId)!.set(row.season, {
                    ...row,
                    standings: [],
                    playInMatches: [],
                    knockoutMatches: [],
                    semifinalistTids: [],
                    quarterfinalistTids: [],
                    championTid: row.championTid ?? null,
                    runnerUpTid: row.runnerUpTid ?? null,
                });
            }
            return Object.fromEntries([...byCompetition].map(([competitionId, rows]) => [
                competitionId,
                [...rows.values()].sort((left, right) => left.season - right.season),
            ]));
          })()
        : undefined;
    const openingHistoricalAwardsData = isFictional && fictionalStaffSetup
        ? [
            ...hydratedHistoricalAwardsData,
            ...buildFictionalCoachAwardRows(
                fictionalStaffSetup.teams,
                fictionalStaffSetup.staff.coaches,
                initialLeagueStats.year,
            ),
          ]
        : hydratedHistoricalAwardsData;
    await reportStartupProgress('Finalizing teams and league identity...', 97, 32);
    const nbaRightsTeamIds = new Set(activeSeasonTeams.map(team => Number((team as any).id)));
    const initializedPlayers = initialBroadcastSetup.players.map(player => {
        const rightsTid = getEurostashRightsTid(player, nbaRightsTeamIds);
        return rightsTid == null ? player : { ...player, euroStashRightsTid: rightsTid };
    });
    const statePatch: Partial<GameState> = {
        commissionerName,
        teams: activeSeasonTeamsWithChemistry,
        teamArchive: initialContractionPatch?.teamArchive,
        nonNBATeams: activeSeasonNonNBATeams,
        clubAliasMap: euroUniverseAliases,
        euroleagueSeededTids: finalEuroleagueSeededTids,
        euroleagueSeedSeason: isEuropeModded ? startYear : undefined,
        euroSourceSeasons: isEuropeModded || isNbaModded ? Object.fromEntries([
            ...(primaryDomesticSource ? [[primaryDomesticSource.id, euroSourceSeason] as const] : []),
            ...(euroTeams.length > 0
                ? [[EUROLEAGUE_2026_SOURCE.id, resolveEuroBasketballSourceSeason(EUROLEAGUE_2026_SOURCE, externalEuropeanSourceSeason) ?? externalEuropeanSourceSeason] as const]
                : []),
            ...(historicalEndesaRoster ? [['historical-endesa', historicalEndesaRoster.sourceSeason] as const] : []),
            ...backgroundEuroSources.map(source => [
                source.id,
                resolveEuroBasketballSourceSeason(source, externalEuropeanSourceSeason) ?? externalEuropeanSourceSeason,
            ] as const),
        ]) : undefined,
        euroCompetitionTeamTids,
        activeCompetitions: isEuropeModded ? hydratedEuroCompetitions : isPbaModded ? PBA_COMPETITIONS : [],
        competitionHistory: initialEuroCompetitionHistory,
        euroPrimaryCompetitionId: isSpainEurope ? 'endesa' : primaryDomesticSource?.competitionId,
        players: prepareOpeningFantasyDraftPlayers(initializedPlayers, openingDraftTeamIds, openingFantasyRequested),
        canonicalPlayerIdentityVersion: CANONICAL_CROSS_LEAGUE_IDENTITY_VERSION,
        canonicalNbaCareerHydrationVersion: CANONICAL_NBA_CAREER_HYDRATION_VERSION,
        canonicalPlayerLoadMigrationVersion: CANONICAL_PLAYER_LOAD_MIGRATION_VERSION,
        historicalPeople,
        historicalPeopleVersion: historicalPeople ? CANONICAL_HISTORICAL_PEOPLE_VERSION : undefined,
        internationalTournament: internationalSetup.tournament,
        broadcastTalent: initialBroadcastSetup.records,
        draftPicks: initialDraftPicks,
        draftLotteryResult: initialRealNbaLottery?.results,
        draftLotterySourceSnapshot: initialRealNbaLottery?.metadata,
        draftLotteryReplayPendingYear: initialRealNbaLottery?.metadata.season,
        staff: initialStaff,
        staffFreeAgents: fictionalStaffSetup?.staffFreeAgents
            ?? (isPbaModded ? historicalPbaRoster?.staffFreeAgents : undefined),
        staffRetirementAnnouncements: isPbaModded
            ? historicalPbaRoster?.staffRetirementAnnouncements
            : undefined,
        refereePool: initialRefereeSetup?.pool,
        refereeRetirementAnnouncements: initialRefereeSetup?.yearZeroRetirements,
        schedule,
        inbox: initialInbox,
        news: initialNews,
        socialFeed: initialSocial,
        historicalStats: [initialHistoricalPoint],
        historicalAwards: (() => {
            if (isPbaModded) {
                const key = (a: any) => `${a.season}-${a.type}-${String(a.name ?? '')}-${String(a.team ?? '')}-${String(a.conference ?? '')}`;
                const seen = new Set<string>();
                return openingHistoricalAwardsData.filter((a: any) => {
                    const k = key(a);
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
            }
            const fromSeasons: any[] = [];
            for (const team of teams as any[]) {
                for (const s of team.seasons ?? []) {
                    if (isEuropeModded) continue;
                    if (isNbaModded && Number(s.season ?? 0) > startupHistoryCompletedSeasonCutoff) continue;
                    if (s.playoffRoundsWon === 4) {
                        fromSeasons.push({ season: s.season, type: 'Champion', name: team.name, tid: team.id });
                    } else if (s.playoffRoundsWon === 3) {
                        fromSeasons.push({ season: s.season, type: 'Runner Up', name: team.name, tid: team.id });
                    }
                }
            }
            const key = (a: any) => isEuropeModded
                ? `${a.season}-${a.competitionId ?? ''}-${a.type}-${a.pid ?? a.name ?? ''}`
                : `${a.season}-${a.tid}-${a.type}`;
            const seen = new Set(fromSeasons.map(key));
            const merged = [...fromSeasons];
            for (const a of openingHistoricalAwardsData) {
                if (isNbaModded && Number(a.season ?? 0) > startupHistoryCompletedSeasonCutoff) continue;
                if (!seen.has(key(a))) merged.push(a);
            }
            return isNbaModded
                ? healHistoricalNbaAwardTeamIds(initialBroadcastSetup.players, merged)
                : merged;
        })(),
        followedHandles: getDefaultFollowedHandles(payload.leagueType, startDateFormatted, initialLeagueStats.year, initialLeagueStats.uiMode),
        history: [{ text: `${commissionerName} took office as the new ${isFictional ? fictionalLeagueName : isEuropeModded ? isSpainEurope ? 'Liga Endesa' : primaryDomesticSource?.displayName ?? 'European league' : isPbaModded ? 'PBA' : 'NBA'} ${payload.gameMode === 'gm' ? 'General Manager' : 'Commissioner'}.`, date: startDateFormatted || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), type: 'League Event' } as any],
        isDataLoaded: true,
        isProcessing: false,
        date: startDateFormatted,
        day: 1,
        ...(isFictional ? {
            stats: {
                publicApproval: 50,
                ownerApproval: 50,
                playerApproval: 50,
                leagueFunds: 1000,
                leagueReserve: 1000,
                availableBudget: 1000,
                personalWealth: Number((2.5 * fictionalFinancialScale).toFixed(4)),
                legacy: 0,
            },
            salary: Math.max(1, Math.round(10_000_000 * fictionalFinancialScale)),
        } : {}),
        payslips: [],
        lastPayDate: initialDate.toISOString(),
        hasUnreadPayslip: false,
        ...saveIdentity,
        gameMode: payload.gameMode ?? 'commissioner',
        startModePolicy: payload.startModePolicy,
        firstActionDate: payload.firstActionDate ?? payload.startModePolicy?.firstActionDate,
        commissionerBootstrapCycle: nbaGmStartMode === 'fixed_preseason'
            || (
                (payload.gameMode ?? 'commissioner') !== 'gm'
                && nbaGmStartMode !== 'full_offseason'
            )
            ? initialDate.getUTCFullYear()
            : undefined,
        userTeamId: canonicalUserTeamId,
        leagueType: payload.leagueType ?? 'modded',
        moddedLeagueBase: payload.leagueType === 'modded' ? (payload.moddedLeagueBase ?? 'nba') : undefined,
        nbaGmStartMode,
        europeMarket: payload.leagueType === 'modded' ? payload.europeMarket : undefined,
        nbaStartYear: isNbaModded ? nbaStartYear : undefined,
        endesaStartYear: isSpainEurope ? endesaStartYear : undefined,
        euroStartSeason: isEuropeModded ? euroSourceSeason : undefined,
        pbaStartYear: isPbaModded ? pbaStartYear : undefined,
        pbaSeasonKey: isPbaModded ? pbaSourceSeason : undefined,
        pbaStartDate: isPbaModded ? startupDate : undefined,
        historicalEndesa: isSpainEurope && historicalEndesaRoster ? {
            version: 1,
            sourceVersion: historicalEndesaRoster.sourceVersion,
            startYear: endesaStartYear,
            sourceSeason: historicalEndesaRoster.sourceSeason,
            materializedSeasons: [historicalEndesaRoster.sourceSeason],
            claimedIdentityKeys: [],
            reservedIdentityKeys: [],
            returnedIdentityKeys: [],
            draftDepartures: [],
            preparedDraftSeasons: [],
            draftOutcomes: [],
            broadcastMeetings: [],
            clubMovements: [],
        } : undefined,
        historicalPba: isPbaModded && historicalPbaRoster ? {
            version: 1,
            sourceVersion: historicalPbaRoster.sourceVersion,
            coachSourceVersion: historicalPbaRoster.coachSourceVersion,
            teamHistorySourceVersion: historicalPbaRoster.teamHistorySourceVersion,
            startYear: pbaStartYear,
            sourceSeason: historicalPbaRoster.sourceSeason,
            materializedSeasons: [historicalPbaRoster.sourceSeason],
            materializedIdentityKeys: historicalPbaRoster.players
                .map(player => player.historicalPbaSource?.identityKey)
                .filter((key): key is string => !!key),
            materializedNbaMarketSeasons: [historicalPbaRoster.sourceSeason],
            teamIdentityTimeline: historicalPbaRoster.teamIdentityTimeline,
            sourceHistoryHydrationVersion: PBA_SOURCE_HISTORY_HYDRATION_VERSION,
          } : undefined,
        nbaExternalPbaMarket: isNbaModded && historicalPbaRoster ? {
            sourceVersion: historicalPbaRoster.sourceVersion,
            materializedSeasons: [historicalPbaRoster.sourceSeason],
            activeSeason: historicalPbaRoster.sourceSeason,
          } : undefined,
        allStar: initialAllStar as any,
        leagueStats: {
            ...initialLeagueStats,
            openingRosterMode,
            openingFantasyDraftCompleted: !openingFantasyRequested,
            ...(isFictional ? {
                leagueName: fictionalLeagueName,
                fictionalHistoryMode: payload.fictionalHistoryMode ?? 'established',
                fictionalPlayerPool: payload.fictionalPlayerPool ?? 'mens',
                fictionalRosterMode: openingRosterMode,
                fictionalFantasyDraftCompleted: !openingFantasyRequested,
                fictionalNationalityFrequencies: payload.fictionalNationalityFrequencies,
                staffPoolSeeded: true,
                fictionalStaffSeedVersion: FICTIONAL_STAFF_SEED_VERSION,
            } : {}),
        },
        ...(isNbaFullOffseasonStart ? {
            offseasonChecklist: defaultOffseasonChecklist(initialLeagueStats, payload.gameMode === 'gm'),
            draftComplete: false,
        } : pbaStartPosition?.phase === 'offseason' ? {
            offseasonChecklist: {
                ...initialPbaEndOfSeasonChecklist(payload.gameMode === 'gm'),
                ...(payload.gameMode !== 'gm' ? { pbaDraft: 'done' as const } : {}),
            },
            draftComplete: payload.gameMode !== 'gm',
        } : nbaGmStartMode ? {
            draftComplete: false,
        } : {}),
        ...(nbaGmStartMode === 'fixed_preseason' ? {
            offseasonExitedYear: initialDate.getUTCFullYear(),
        } : {}),
    };
    if (
        isPbaModded
        && pbaStartPosition?.phase === 'regularSeason'
        && (pbaStartPosition.conference === 'commissioners' || pbaStartPosition.conference === 'governors')
    ) {
        const importReadyState = autoManagePbaImports(
            { ...initialState, ...statePatch } as GameState,
            pbaStartPosition.conference,
            { fillMissingTeams: true, excludeUserTeam: false },
        );
        statePatch.players = importReadyState.players;
        statePatch.history = importReadyState.history;
    }
    const canonicalIdentityState = canonicalizeTeamIdentitiesForState({
        ...initialState,
        ...statePatch,
    } as GameState);
    statePatch.teams = canonicalIdentityState.teams;
    statePatch.nonNBATeams = canonicalIdentityState.nonNBATeams;
    statePatch.seasonLifecycle = initializeLeagueSeasonLifecycle({
        ...initialState,
        ...statePatch,
        teams: canonicalIdentityState.teams,
        nonNBATeams: canonicalIdentityState.nonNBATeams,
    } as GameState);
    const initialDateIso = initialDate.toISOString().slice(0, 10);
    if (payload.gameMode === 'gm' && canonicalUserTeamId != null) {
        const gmInitialState = { ...initialState, ...statePatch } as GameState;
        const gmCareer = createInitialGmCareerState(gmInitialState);
        statePatch.gmCareer = gmCareer;
        statePatch.salary = gmCareer.employment.annualSalary;
    }
    const needsSnapshotSchedule = Boolean(
        nbaGmStartMode
        && !isNbaFullOffseasonStart
        && initialDateIso >= toISODateString(addGameDays(getSeasonSimStartDate(nbaStartYear + 1, initialLeagueStats), 8)),
    );
    if (needsSnapshotSchedule) {
        await reportStartupProgress('Building the opening schedule...', 98, 33);
        const fullInitialState = { ...initialState, ...statePatch } as GameState;
        const christmasPatch = autoPickChristmasGames(fullInitialState);
        const withChristmas = { ...fullInitialState, ...christmasPatch };
        const globalPatch = autoPickGlobalGames(withChristmas);
        const withLeagueEvents = { ...withChristmas, ...globalPatch };
        await reportStartupProgress('Opening showcase assignments ready...', 98, 33);
        const internationalPatch = autoScheduleIntlPreseason(withLeagueEvents);
        const withOpeningEvents = { ...withLeagueEvents, ...internationalPatch };
        await reportStartupProgress('International preseason slate ready...', 98, 33);
        const schedulePatch = autoGenerateSchedule(withOpeningEvents);
        await reportStartupProgress('Warming up the simulation...', 99, 34);
        return {
            ...statePatch,
            ...christmasPatch,
            ...globalPatch,
            ...internationalPatch,
            ...schedulePatch,
        };
    }
    const defaultSimStart = initialDate.toISOString().slice(0, 10);
    if (payload.jumpRequired && startupDate && startupDate > defaultSimStart) {
        await reportStartupProgress('Advancing to the selected start date...', 98, 33);
        const fullInitialState = {
            ...initialState,
            ...statePatch,
        } as GameState;
        const lazyResult = await runLazySim(
            fullInitialState,
            startupDate,
            payload.onProgress,
            { assistantGM: payload.assistantGM ?? false, stopBefore: true }
        );
        const lazyTimelineInput = timelineInputFromState(lazyResult.state);
        await reportStartupProgress('Warming up the simulation...', 99, 34);
        return {
            ...lazyResult.state,
            teams: applyTeamIdentitiesForTimeline(lazyResult.state.teams, lazyTimelineInput),
            nonNBATeams: applyTeamIdentitiesForTimeline(lazyResult.state.nonNBATeams, lazyTimelineInput),
            isProcessing: false,
            isDataLoaded: true,
        };
    }
    await reportStartupProgress('Preparing the league home screen...', 98, 33);
    await reportStartupProgress('Warming up the simulation...', 99, 34);
    return statePatch;
};
