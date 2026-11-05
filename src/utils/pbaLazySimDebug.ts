import { PBA_COMPETITIONS } from '../data/templates/philippines/competitions';
import { resolveCompetitionSeason } from '../services/competition/competitionResolver';
import { dateForCompetitionSeason } from '../services/competition/competitionSeasonState';
import { selectCompetitionTeamTids } from '../services/competition/competitionScheduler';
import { getAllStarWeekendDates } from '../services/allStar/AllStarWeekendOrchestrator';
import {
  getEffectivePbaConference,
  hasExplicitPbaImportProvenance,
  hasLegalPbaGovernorsImportHeight,
  isPbaImportPoolCandidate,
  isPbaRosterLocal,
  type PbaConference,
} from '../services/pba/importManager';
import { getHistoricalPbaRuleOverrides, PBA_HISTORICAL_CATALOG } from '../services/pba/historicalCatalog';
import { buildPbaDraftOrderTeams, getPbaDraftPool, PBA_DRAFT_ROUNDS } from '../services/pba/draftRules';
import { getHistoricalPbaConferenceLabels } from '../services/pba/conferenceHistory';
import { PBA_SOURCE_HISTORY_HYDRATION_VERSION } from '../services/pba/historicalHistoryHydration';
import { getPbaBranchStartSeason } from '../services/pba/branchHistoryOwnership';
import { buildPbaHistoricalAwards } from '../services/pba/awards';
import { PBA_PLAYER_ECONOMY_VERSION } from '../services/pba/historicalEconomy';
import { getCurrentPbaOffseasonTaskTarget } from '../services/pba/offseasonTaskTarget';
import { getPBARosterEconomyConfig } from '../services/externalRosterService.shared';
import type { GameState } from '../types';
import { normalizeDate } from './helpers';
import { getStandardRosterLimit } from './rosterLimits';
import { isOnRoster } from './teamLookup';
import { getPlayerCurrentSalaryUSD } from './salaryUtils';
import { PBA_HISTORICAL_IMPORT_POOL_MINIMUM } from '../services/pba/historicalImportPool';
import { getConferenceSpec, getPbaFirstPlayoffDate } from '../services/pba/conferenceTransition';

const TAG = '[PBA_TEST_LAZY_SIM]';
const POSTSEASON_PHASES = new Set(['qf', 'sf', 'final']);
const pbaCompetitionSpecsForSeason = (season: number) => [
  getConferenceSpec('philippine', season),
  getConferenceSpec('commissioners', season),
  getConferenceSpec('governors', season),
];
const PBA_AWARD_TYPES = [
  'Champion',
  'Runner Up',
  'Finals MVP',
  'Best Player of the Conference',
  'Best Import of the Conference',
  'Most Valuable Player',
  'MVP',
  'Rookie of the Year',
  'Most Improved Player',
  'Defensive Player of the Year',
  'Coach of the Year',
  'Mr. Quality Minutes',
  'Sixth Man of the Year',
  'Scoring Champion',
  'PBA Mythical First Team',
  'PBA Mythical Second Team',
  'PBA All-Defensive Team',
  'PBA All-Rookie Team',
] as const;

const isRegularPhase = (phase: unknown) => {
  const key = String(phase ?? '');
  return key === 'group' || key.startsWith('r');
};

const phaseCounts = (rows: any[]) => rows.reduce((acc: Record<string, number>, row) => {
  const key = String(row?.competitionPhase ?? 'unknown');
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const auditedPbaSeason = (state: GameState) => {
  const currentSeason = state.leagueStats?.year ?? new Date().getFullYear();
  if (Number.isFinite(Number(currentSeason))) return Number(currentSeason);
  const championSeasons = ((state.leagueStats as any)?.pbaConferenceChampions ?? [])
    .map((entry: any) => Number(entry?.season))
    .filter((season: number) => Number.isFinite(season));
  return championSeasons.length > 0 ? Math.max(...championSeasons) : currentSeason;
};

const pbaCompetitionSeasonEnd = (spec: (typeof PBA_COMPETITIONS)[number], season: number): string => {
  const rounds = spec.playoffFormat?.rounds ?? [];
  const finalRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
  const end = finalRound?.end ?? spec.seasonEnd;
  return dateForCompetitionSeason(spec, season, end.month, end.day).slice(0, 10);
};

const matchesPbaCompetitionSeason = (game: any, spec: (typeof PBA_COMPETITIONS)[number], season: number) => {
  const norm = normalizeDate(game?.date);
  if (!norm) return false;
  const start = dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day).slice(0, 10);
  const end = pbaCompetitionSeasonEnd(spec, season);
  return norm >= start && norm <= end;
};

const isPbaTeamTid = (tid: unknown) => {
  const numericTid = Number(tid);
  return Number.isFinite(numericTid) && numericTid >= 2000 && numericTid < 3000;
};

const isPbaAwardRow = (award: any, competitionId?: string) => {
  if (award?.uiMode === 'pba_isolated' || award?.competitionId === 'pba') return true;
  if (competitionId && String(award?.competitionId ?? '') === competitionId) return true;
  if (String(award?.competitionId ?? '').startsWith('pba-')) return true;
  if (isPbaTeamTid(award?.tid)) return true;
  const key = `${String(award?.source ?? '')} ${String(award?.conference ?? '')} ${String(award?.competitionId ?? '')}`.toLowerCase();
  return key.includes('pba')
    || key.includes('philippine cup')
    || key.includes("commissioner's cup")
    || key.includes("governors' cup")
    || key.includes('governors cup')
    || key.includes('commissioners cup');
};

const pbaAwardsForCompetition = (state: GameState, competitionId: string) =>
  (state.historicalAwards ?? []).filter((award: any) =>
    isPbaAwardRow(award, competitionId)
  );

const pbaAwardsForSeason = (state: GameState) => {
  const season = auditedPbaSeason(state);
  return (state.historicalAwards ?? []).filter((award: any) =>
    Number(award?.season) === Number(season) &&
    isPbaAwardRow(award)
  );
};

const pbaCalendarMilestones = (state: GameState) => {
  const season = auditedPbaSeason(state);
  const allStarDates = getAllStarWeekendDates(season, state.leagueStats);
  const ymd = (date: Date) => date.toISOString().slice(0, 10);
  return [
    ...pbaCompetitionSpecsForSeason(season).flatMap(spec => {
      return [
        { id: spec.id, label: `${spec.shortName} regular season`, date: dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day).slice(0, 10) },
        ...(spec.playoffFormat?.rounds ?? []).map(round => ({
          id: spec.id,
          label: `${spec.shortName} ${round.phase}`,
          date: dateForCompetitionSeason(spec, season, round.start.month, round.start.day).slice(0, 10),
        })),
      ];
    }),
    { id: 'pba-all-star', label: 'PBA All-Star Friday', date: ymd(allStarDates.breakStart) },
    { id: 'pba-all-star', label: 'PBA All-Star Saturday', date: ymd(allStarDates.saturday) },
    { id: 'pba-all-star', label: 'PBA All-Star Sunday', date: ymd(allStarDates.allStarGame) },
  ];
};

function expectedRegularGames(spec: (typeof PBA_COMPETITIONS)[number], teamCount: number): number {
  if (teamCount < 2) return 0;
  const gamesPerTeam = Math.floor(Number(spec.gamesPerTeam ?? teamCount - 1));
  if (gamesPerTeam > 0 && gamesPerTeam < teamCount - 1) return Math.floor((teamCount * gamesPerTeam) / 2);
  const singleRoundRobin = (teamCount * (teamCount - 1)) / 2;
  return (spec.gamesPerTeam ?? 0) >= (teamCount - 1) * 2 ? singleRoundRobin * 2 : singleRoundRobin;
}

const playoffStartForSpec = (spec: (typeof PBA_COMPETITIONS)[number], season: number): string => {
  const firstRound = spec.playoffFormat?.rounds?.[0];
  return firstRound
    ? dateForCompetitionSeason(spec, season, firstRound.start.month, firstRound.start.day).slice(0, 10)
    : pbaCompetitionSeasonEnd(spec, season);
};

function buildCompetitionRows(state: GameState) {
  const season = auditedPbaSeason(state);
  const schedule = state.schedule ?? [];
  const boxScores = state.boxScores ?? [];

  return pbaCompetitionSpecsForSeason(season).map(spec => {
    const games = schedule.filter((game: any) =>
      game.competitionId === spec.id &&
      matchesPbaCompetitionSeason(game, spec, season)
    );
    const scores = boxScores.filter((game: any) =>
      game.competitionId === spec.id &&
      matchesPbaCompetitionSeason(game, spec, season)
    );
    const regularGames = games.filter((game: any) => isRegularPhase(game.competitionPhase));
    const playoffGames = games.filter((game: any) => POSTSEASON_PHASES.has(String(game.competitionPhase)));
    const regularScores = scores.filter((game: any) => isRegularPhase(game.competitionPhase));
    const playoffScores = scores.filter((game: any) => POSTSEASON_PHASES.has(String(game.competitionPhase)));
    const teamTids = selectCompetitionTeamTids(spec, state as any);
    const resolution = resolveCompetitionSeason(spec, scores as any, season, teamTids);
    const awards = pbaAwardsForCompetition(state, spec.id).filter((award: any) => Number(award?.season) === Number(season));
    const expectedRegular = expectedRegularGames(spec, teamTids.length);
    return {
      competition: spec.shortName,
      id: spec.id,
      expectedRegular,
      regularComplete: `${regularScores.length}/${expectedRegular}`,
      playoffStart: playoffStartForSpec(spec, season),
      regularScheduled: regularGames.length,
      regularPlayed: regularScores.length,
      playoffScheduled: playoffGames.length,
      playoffPlayed: playoffScores.length,
      finalsPlayed: scores.filter((game: any) => game.competitionPhase === 'final').length,
      championTid: resolution.championTid ?? '',
      championRecorded: (state.leagueStats as any)?.pbaConferenceChampions?.some((entry: any) =>
        Number(entry.season) === Number(season) &&
        String(spec.id).includes(String(entry.conference ?? '').replace('commissioners', 'commissioner').replace('governors', 'governor').replace('philippine', 'philippine')),
      ) ? 'yes' : 'no',
      awards: awards.length,
      schedulePhases: JSON.stringify(phaseCounts(games)),
      boxScorePhases: JSON.stringify(phaseCounts(scores)),
    };
  });
}

function buildImportRows(state: GameState) {
  const pbaTeams = (state.nonNBATeams ?? []).filter((team: any) => team.league === 'PBA');
  return (['commissioners', 'governors'] as PbaConference[]).map(conference => {
    const imports = (state.players ?? []).filter((player: any) =>
      player.isImport &&
      player.importConference === conference &&
      Number(player.tid) >= 2000 &&
      Number(player.tid) < 2100
    );
    const pool = (state.players ?? []).filter(player =>
      isPbaImportPoolCandidate(player, conference, state.players, state.leagueStats),
    );
    const sourcePool = pool.filter(player => player.historicalPbaSource?.importTagged === true);
    const legalPool = conference === 'governors'
      ? pool.filter(hasLegalPbaGovernorsImportHeight)
      : pool;
    return {
      conference,
      activeImports: imports.length,
      pbaTeams: pbaTeams.length,
      missingTeams: Math.max(0, pbaTeams.length - new Set(imports.map((player: any) => player.tid)).size),
      pool: pool.length,
      sourcePool: sourcePool.length,
      legalPool: legalPool.length,
      poolMinimum: PBA_HISTORICAL_IMPORT_POOL_MINIMUM,
      poolGap: Math.max(0, PBA_HISTORICAL_IMPORT_POOL_MINIMUM - legalPool.length),
      players: imports.slice(0, 12).map((player: any) => `${player.name} (${player.tid})`).join(', '),
    };
  });
}

function buildLocalFreeAgencyRows(state: GameState) {
  const market = state.pbaLocalFreeAgency;
  const minimum = Math.max(1, Math.round(Number(state.leagueStats.minPlayersPerTeam ?? 10)));
  const maximum = Math.max(minimum, getStandardRosterLimit(state.leagueStats));
  const teams = (state.nonNBATeams ?? [])
    .filter((team: any) => team.league === 'PBA' && isPbaTeamTid(team.tid ?? team.id));
  return teams.map((team: any) => {
    const teamId = Number(team.tid ?? team.id);
    const teamBids = market?.markets.flatMap(entry => entry.bids).filter(bid => bid.teamId === teamId) ?? [];
    const roster = (state.players ?? []).filter(player =>
      Number(player.tid) === teamId && isOnRoster(player)
    ).length;
    return {
      team: team.abbrev ?? team.name ?? teamId,
      teamId,
      userTeam: state.gameMode === 'gm' && Number(state.userTeamId) === teamId ? 'yes' : 'no',
      roster,
      minimum,
      maximum,
      activeBids: teamBids.filter(bid => bid.status === 'active').length,
      acceptedBids: teamBids.filter(bid => bid.status === 'accepted').length,
      status: roster < minimum ? 'under minimum' : roster > maximum ? 'over maximum' : 'legal',
    };
  });
}

function buildAwardRows(state: GameState) {
  const seasonAwards = pbaAwardsForSeason(state);
  return PBA_AWARD_TYPES.map(type => {
    const rows = seasonAwards.filter((award: any) => String(award.type ?? '') === type);
    return {
      type,
      count: rows.length,
      conferences: [...new Set(rows.map((award: any) => award.conference ?? award.source ?? award.competitionId).filter(Boolean))].join(', '),
      winners: rows.slice(0, 10).map((award: any) => award.name ?? award.team ?? award.tid).filter(Boolean).join(', '),
    };
  });
}

function buildHistoricalAwardCoverageRows(state: GameState) {
  const branchStartSeason = getPbaBranchStartSeason(state);
  const expected = buildPbaHistoricalAwards(branchStartSeason);
  const actual = (state.historicalAwards ?? []).filter((award: any) =>
    Number(award?.season) < branchStartSeason && isPbaAwardRow(award),
  );
  return [
    'Most Valuable Player',
    'Defensive Player of the Year',
    'Coach of the Year',
    'Scoring Champion',
    'Most Improved Player',
    'Rookie of the Year',
    'Mr. Quality Minutes',
  ].map(type => {
    const expectedSeasons = new Set(expected.filter(award => award.type === type).map(award => award.season));
    const actualRows = actual.filter((award: any) => award.type === type);
    const actualSeasons = new Set(actualRows.map((award: any) => Number(award.season)));
    return {
      type,
      expected: expectedSeasons.size,
      saved: actualSeasons.size,
      stableIdentity: actualRows.filter((award: any) => award.pid || Number.isFinite(Number(award.tid))).length,
      missingSeasons: [...expectedSeasons].filter(season => !actualSeasons.has(season)).join(', '),
    };
  });
}

function buildFeatureRows(state: GameState, competitionRows: any[], importRows: any[]) {
  const checklist = (state.offseasonChecklist ?? {}) as Record<string, unknown>;
  const allStar = (state as any).allStar ?? {};
  const backgroundAllStar = (state as any).backgroundNbaAllStar ?? {};
  const backgroundAllStarSchedule = (state.schedule ?? []).filter((game: any) =>
    game?.isAllStar ||
    game?.isRisingStars ||
    game?.isCelebrity ||
    game?.isShootingStars ||
    game?.isSkillsChallenge ||
    String(game?.eventType ?? '').toLowerCase().includes('all-star')
  );
  const pbaHistory = (state.history ?? []).filter((entry: any) =>
    String(entry?.type ?? '').includes('PBA') ||
    String(entry?.text ?? '').toLowerCase().includes('pba')
  );
  const pbaSigningHistory = pbaHistory.filter((entry: any) => String(entry?.text ?? '').toLowerCase().includes('signed'));
  const localFreeAgencyRows = buildLocalFreeAgencyRows(state);
  const localFreeAgencyMarket = state.pbaLocalFreeAgency;
  const pbaDraftedPlayers = (state.players ?? []).filter((player: any) =>
    player.draft &&
    Number(player.draft.year) === Number(auditedPbaSeason(state)) &&
    Number(player.tid) >= 2000 &&
    Number(player.tid) < 2100
  );
  const pbaDraftPool = getPbaDraftPool(state.players ?? [], auditedPbaSeason(state), state.leagueStats);
  const realPbaDraftProspects = pbaDraftPool.filter((player: any) => player.historicalPbaDraftProspect === true);
  const pbaDraftOrder = buildPbaDraftOrderTeams(
    state.nonNBATeams ?? [],
    state.boxScores ?? [],
    auditedPbaSeason(state),
    pbaDraftPool.length,
    state.draftPicks,
  );
  const seasonAwards = pbaAwardsForSeason(state);
  const championCount = Array.isArray((state.leagueStats as any)?.pbaConferenceChampions)
    ? (state.leagueStats as any).pbaConferenceChampions.filter((entry: any) => Number(entry?.season) === Number(auditedPbaSeason(state))).length
    : 0;
  const historical = state.historicalPba;
  const sourceSeason = Number(historical?.sourceSeason ?? auditedPbaSeason(state));
  const branchStartSeason = getPbaBranchStartSeason(state);
  const postBranchSourceAwards = (state.historicalAwards ?? []).filter(award =>
    isPbaAwardRow(award)
    && Number(award.season) >= branchStartSeason
    && String(award.source ?? '').trim().toUpperCase() !== 'PBA',
  );
  const expectedRules = getHistoricalPbaRuleOverrides(sourceSeason);
  const sourcePlayers = (state.players ?? []).filter(player => !!player.historicalPbaSource);
  const futureSourcePlayers = sourcePlayers.filter(player =>
    Number(player.historicalPbaSource?.firstEligibleSeason) > sourceSeason
  );
  const activeNbaPlayers = (state.players ?? []).filter(player =>
    Number(player.tid) >= 0 && Number(player.tid) < 100
  );
  const nbaCoexistEnabled = sourceSeason >= PBA_HISTORICAL_CATALOG.nbaCoexistSourceSeason;
  const activePbaPlayers = (state.players ?? []).filter(player => Number(player.tid) >= 2000 && Number(player.tid) < 3000 && player.status === 'PBA');
  const contractHistogram = activePbaPlayers.reduce((counts: Record<string, number>, player: any) => {
    const years = Math.max(0, Number(player.contract?.exp ?? sourceSeason - 1) - sourceSeason + 1);
    const key = `${years}yr`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const pbaEconomy = getPBARosterEconomyConfig(state.leagueStats, 'pba_isolated');
  const activePbaSalaries = activePbaPlayers
    .map(player => getPlayerCurrentSalaryUSD(player, sourceSeason))
    .filter(salary => Number.isFinite(salary) && salary > 0)
    .sort((left, right) => left - right);
  const pbaSalaryMedian = activePbaSalaries.length > 0
    ? activePbaSalaries[Math.floor((activePbaSalaries.length - 1) / 2)]
    : 0;
  const unversionedPbaContracts = activePbaPlayers.filter(player =>
    Number(player.contract?.pbaEconomyVersion ?? 0) !== PBA_PLAYER_ECONOMY_VERSION
  );
  const belowPbaSalaryFloor = activePbaPlayers.filter(player => {
    const salary = getPlayerCurrentSalaryUSD(player, sourceSeason);
    return salary > 0 && salary < pbaEconomy.minSalaryUSD * 0.8;
  });
  const requiredStaffRoles = new Set([
    'Head Coach', 'Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3',
    'Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Chief Scout', 'Head of Analytics',
  ]);
  const pbaTeams = (state.nonNBATeams ?? []).filter(team => team.league === 'PBA');
  const fullStaffTeams = pbaTeams.filter((team: any) => {
    const roles = new Set((team?.tycoon?.staffMembers ?? []).map((member: any) => member?.role ?? member?.position ?? member?.jobTitle));
    return [...requiredStaffRoles].every(role => roles.has(role));
  });
  const expectedConferenceLabels = getHistoricalPbaConferenceLabels(sourceSeason);
  const activePbaCompetitions = (state.activeCompetitions ?? []).filter(competition => competition.id.startsWith('pba-'));
  const allStarDates = getAllStarWeekendDates(sourceSeason, state.leagueStats);
  const allStarWeekdays = [allStarDates.breakStart, allStarDates.saturday, allStarDates.allStarGame].map(date => date.getUTCDay());

  return [
    {
      feature: 'Historical PBA source',
      status: historical
        ? historical.materializedSeasons.includes(sourceSeason) ? 'current season materialized' : 'current season missing'
        : 'legacy/current roster',
      detail: historical
        ? `source=${historical.sourceVersion}, start=${historical.startYear}, current=${sourceSeason}, seasons=${historical.materializedSeasons.join(',')}, players=${sourcePlayers.length}, future=${futureSourcePlayers.length}`
        : 'No historical source state on this save.',
    },
    {
      feature: 'PBA branch history ownership',
      status: postBranchSourceAwards.length === 0 ? 'branch-owned' : 'source future leaked',
      detail: `branch=${branchStartSeason}, post-branch source awards=${postBranchSourceAwards.length}`,
    },
    {
      feature: 'Historical four-point rule',
      status: state.leagueStats.fourPointLine === expectedRules.fourPointLine ? 'correct for season' : 'rule mismatch',
      detail: `season=${sourceSeason}, active=${state.leagueStats.fourPointLine === true}, expected=${expectedRules.fourPointLine}`,
    },
    {
      feature: 'PBA player contracts',
      status: Object.keys(contractHistogram).some(key => Number(key.replace('yr', '')) >= 3 && contractHistogram[key] > 0)
        ? 'multi-year distribution present'
        : 'only short contracts found',
      detail: JSON.stringify(contractHistogram),
    },
    {
      feature: 'PBA player salary economy',
      status: unversionedPbaContracts.length === 0 && belowPbaSalaryFloor.length === 0
        ? 'era scale aligned'
        : 'legacy/suspicious salaries found',
      detail: `scale=${pbaEconomy.economyScale.toFixed(4)}, floor=$${pbaEconomy.minSalaryUSD}, cap-basis=$${pbaEconomy.salaryCapUSD}, min=$${activePbaSalaries[0] ?? 0}, median=$${pbaSalaryMedian}, max=$${activePbaSalaries.at(-1) ?? 0}, payroll=$${activePbaSalaries.reduce((sum, salary) => sum + salary, 0)}, unversioned=${unversionedPbaContracts.length}, belowFloor=${belowPbaSalaryFloor.length}`,
    },
    {
      feature: 'PBA team staff',
      status: `${fullStaffTeams.length}/${pbaTeams.length} teams complete`,
      detail: 'Expected nine visible roles per active PBA team.',
    },
    {
      feature: 'Historical conference plan',
      status: expectedConferenceLabels.length === 0 || activePbaCompetitions.length === expectedConferenceLabels.length
        ? 'conference count aligned'
        : 'archive and branch formats differ',
      detail: `history=${expectedConferenceLabels.length} (${expectedConferenceLabels.join(' | ')}), active=${activePbaCompetitions.length} (${activePbaCompetitions.map(competition => competition.id).join(',')})`,
    },
    {
      feature: 'PBA All-Star calendar',
      status: allStarWeekdays.join(',') === '5,6,0'
        ? 'Friday-Sunday aligned'
        : sourceSeason === 2020 ? 'compressed-season bridge' : 'weekday mismatch',
      detail: `${allStarDates.breakStart.toISOString().slice(0, 10)}–${allStarDates.allStarGame.toISOString().slice(0, 10)}`,
    },
    {
      feature: 'PBA staff candidate market',
      status: 'available',
      detail: `date=${state.date}, phase=${String((state.leagueStats as any)?.pbaConferencePhase ?? '')}; replacements remain available in season`,
    },
    {
      feature: 'NBA coexistence',
      status: nbaCoexistEnabled
        ? 'enabled'
        : state.teams.length === 0 && activeNbaPlayers.length === 0 ? 'isolated as expected' : 'unexpected active NBA bucket',
      detail: `threshold=${PBA_HISTORICAL_CATALOG.nbaCoexistSourceSeason}, teams=${state.teams.length}, activePlayers=${activeNbaPlayers.length}`,
    },
    {
      feature: 'Philippine Cup',
      status: competitionRows.find(row => row.id === 'pba-philippine-cup')?.championTid ? 'champion resolved' : 'pending/missing',
      detail: JSON.stringify(competitionRows.find(row => row.id === 'pba-philippine-cup') ?? {}),
    },
    {
      feature: "Commissioner's Cup",
      status: competitionRows.find(row => row.id === 'pba-commissioners-cup')?.championTid ? 'champion resolved' : 'pending/missing',
      detail: JSON.stringify(competitionRows.find(row => row.id === 'pba-commissioners-cup') ?? {}),
    },
    {
      feature: "Governors' Cup",
      status: competitionRows.find(row => row.id === 'pba-governors-cup')?.championTid ? 'champion resolved' : 'pending/missing',
      detail: JSON.stringify(competitionRows.find(row => row.id === 'pba-governors-cup') ?? {}),
    },
    {
      feature: 'AI imports',
      status: importRows.some(row => row.activeImports > 0) ? 'active imports found' : 'no active imports',
      detail: JSON.stringify(importRows),
    },
    {
      feature: 'PBA draft',
      status: state.draftComplete || (state.leagueStats as any)?.pbaDraftComplete || checklist.pbaDraft === 'done' ? 'done' : String(checklist.pbaDraft ?? 'not mounted'),
      detail: `${pbaDraftedPlayers.length} drafted; pool=${pbaDraftPool.length}, real=${realPbaDraftProspects.length}, picks=${pbaDraftOrder.length}, rounds=${Math.max(0, ...pbaDraftOrder.map(team => Number((team as any)._round ?? 0)))}`,
    },
    {
      feature: 'PBA expansion',
      status: state.expansionSchedule?.league === 'pba'
        ? `scheduled ${state.expansionSchedule.year}`
        : (state.leagueStats.pbaExpansionCompletedYears?.length ?? 0) > 0
          ? 'latest cycle complete'
          : 'no active window',
      detail: state.expansionSchedule?.league === 'pba'
        ? `teams=${state.expansionSchedule.teams.map(team => team.abbrev).join(',')}; decision=${JSON.stringify(state.expansionBidDecisions?.[state.expansionSchedule.year] ?? null)}; expansionTids=${(state.expansionTeamIds ?? []).join(',')}`
        : `completed=${(state.leagueStats.pbaExpansionCompletedYears ?? []).join(',')}`,
    },
    {
      feature: 'Local free agency',
      status: localFreeAgencyMarket
        ? `${localFreeAgencyMarket.status} · day ${localFreeAgencyMarket.currentDay}/${localFreeAgencyMarket.totalDays}`
        : String(checklist.pbaLocalFreeAgency ?? 'not mounted'),
      detail: `${pbaSigningHistory.length} signing history row(s); ${localFreeAgencyMarket?.markets.flatMap(market => market.bids).filter(bid => bid.status === 'active').length ?? 0} active bid(s); ${localFreeAgencyRows.filter(row => row.status === 'under minimum').length} under minimum`,
    },
    {
      feature: 'Opening ceremony',
      status: String(checklist.pbaOpeningCeremony ?? 'not mounted'),
      detail: `conference=${(state.leagueStats as any)?.pbaConference}`,
    },
    {
      feature: 'PBA All-Star weekend',
      status: allStar.weekendComplete || allStar.pbaWeekendComplete ? 'complete' : 'pending/unknown',
      detail: `roster=${allStar.roster?.length ?? 0}, dunk=${!!allStar.dunkContest?.complete}, three=${!!allStar.threePointContest?.complete}, skills=${!!allStar.skillsChallenge?.complete}`,
    },
    {
      feature: 'Background NBA All-Star',
      status: backgroundAllStar.weekendComplete
        ? 'complete'
        : backgroundAllStar.reservesAnnounced
          ? 'rosters set'
          : (backgroundAllStar.votes?.length ?? 0) > 0
            ? 'votes simulated'
            : 'pending/unknown',
      detail: `votes=${backgroundAllStar.votes?.length ?? 0}, roster=${backgroundAllStar.roster?.length ?? 0}, starters=${!!backgroundAllStar.startersAnnounced}, reserves=${!!backgroundAllStar.reservesAnnounced}, dunk=${!!backgroundAllStar.dunkContest?.complete || !!backgroundAllStar.dunkContestAnnounced}, three=${!!backgroundAllStar.threePointContest?.complete || !!backgroundAllStar.threePointAnnounced}, skills=${!!backgroundAllStar.skillsChallenge?.complete || !!backgroundAllStar.skillsChallengeAnnounced}, game=${!!backgroundAllStar.allStarGameId || !!backgroundAllStar.bracket?.complete}, schedule=${backgroundAllStarSchedule.length}`,
    },
    {
      feature: 'Conference champions',
      status: `${championCount}/3 recorded`,
      detail: JSON.stringify((state.leagueStats as any)?.pbaConferenceChampions ?? []),
    },
    {
      feature: 'Awards',
      status: seasonAwards.length > 0 ? `${seasonAwards.length} PBA award row(s)` : 'none recorded',
      detail: [...new Set(seasonAwards.map((award: any) => award.type))].join(', '),
    },
  ];
}

function buildMissingRows(
  state: GameState,
  competitionRows: any[],
  importRows: any[],
  awardRows: any[],
  historicalAwardCoverageRows: any[],
  featureRows: any[],
) {
  const currentConference = (state.leagueStats as any)?.pbaConference;
  const phase = (state.leagueStats as any)?.pbaConferencePhase;
  const effectiveConference = getEffectivePbaConference(state.leagueStats as any);
  const season = auditedPbaSeason(state);
  const currentNorm = normalizeDate(state.date);
  const backgroundAllStar = (state as any).backgroundNbaAllStar ?? {};
  const historical = state.historicalPba;
  const sourceSeason = Number(historical?.sourceSeason ?? season);
  const branchStartSeason = getPbaBranchStartSeason(state);
  const expectedRules = getHistoricalPbaRuleOverrides(sourceSeason);
  const nbaCoexistEnabled = sourceSeason >= PBA_HISTORICAL_CATALOG.nbaCoexistSourceSeason;
  const missing: Array<{ area: string; issue: string }> = [];
  const localFreeAgencyRows = buildLocalFreeAgencyRows(state);
  const completedLocalFreeAgency = state.pbaLocalFreeAgency?.status === 'complete'
    || Number(state.leagueStats.pbaLocalFreeAgencyResolvedSeason) === season;
  const overfilledPbaTeams = localFreeAgencyRows.filter(row => row.roster > row.maximum);
  const underfilledAiTeams = localFreeAgencyRows.filter(row =>
    row.userTeam === 'no' && row.roster < row.minimum
  );
  if (overfilledPbaTeams.length > 0) {
    missing.push({ area: 'PBA local free agency', issue: `${overfilledPbaTeams.length} team(s) exceed the saved roster maximum` });
  }
  if (completedLocalFreeAgency && underfilledAiTeams.length > 0) {
    missing.push({ area: 'PBA local free agency', issue: `${underfilledAiTeams.length} AI team(s) remain below the saved roster minimum after the market closed` });
  }
  if (historical && !historical.materializedSeasons.includes(sourceSeason)) {
    missing.push({ area: 'Historical PBA source', issue: `source season ${sourceSeason} is not materialized` });
  }
  const postBranchSourceAwards = (state.historicalAwards ?? []).filter(award =>
    isPbaAwardRow(award)
    && Number(award.season) >= branchStartSeason
    && String(award.source ?? '').trim().toUpperCase() !== 'PBA',
  );
  if (postBranchSourceAwards.length > 0) {
    missing.push({
      area: 'PBA branch history',
      issue: `${postBranchSourceAwards.length} source award/champion row(s) exist at or after immutable branch season ${branchStartSeason}`,
    });
  }
  if (
    historical
    && Number(historical.sourceHistoryHydrationVersion ?? 0) < PBA_SOURCE_HISTORY_HYDRATION_VERSION
  ) {
    missing.push({ area: 'Historical PBA source', issue: 'saved player/team history has not completed source hydration' });
  }
  const futureSourcePlayers = (state.players ?? []).filter(player =>
    Number(player.historicalPbaSource?.firstEligibleSeason) > sourceSeason
  );
  if (futureSourcePlayers.length > 0) {
    missing.push({ area: 'Historical PBA source', issue: `${futureSourcePlayers.length} player(s) exist before their first ratings/stat season` });
  }
  if (state.leagueStats.fourPointLine !== expectedRules.fourPointLine) {
    missing.push({ area: 'Four-point line', issue: `season ${sourceSeason} expected ${expectedRules.fourPointLine ? 'enabled' : 'disabled'}` });
  }
  if (!nbaCoexistEnabled) {
    const activeNbaPlayers = (state.players ?? []).filter(player => Number(player.tid) >= 0 && Number(player.tid) < 100);
    if (state.teams.length > 0 || activeNbaPlayers.length > 0) {
      missing.push({ area: 'PBA isolation', issue: `${state.teams.length} NBA team(s) and ${activeNbaPlayers.length} active NBA player(s) exist before 2025/26` });
    }
  }
  const misclassifiedImports = (state.players ?? []).filter(player =>
    hasExplicitPbaImportProvenance(player) && isPbaRosterLocal(player, state.leagueStats as any)
  );
  if (misclassifiedImports.length > 0) {
    missing.push({ area: 'PBA import identity', issue: `${misclassifiedImports.length} explicit import(s) are classified as locals` });
  }
  const requiredStaffRoles = new Set([
    'Head Coach', 'Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3',
    'Head of Sports Science', 'Head Physio', 'Player Development Coach', 'Chief Scout', 'Head of Analytics',
  ]);
  const incompleteStaffTeams = (state.nonNBATeams ?? []).filter((team: any) => {
    if (team?.league !== 'PBA') return false;
    const roles = new Set((team?.tycoon?.staffMembers ?? []).map((member: any) => member?.role ?? member?.position ?? member?.jobTitle));
    return [...requiredStaffRoles].some(role => !roles.has(role));
  });
  if (incompleteStaffTeams.length > 0) {
    missing.push({ area: 'PBA staff', issue: `${incompleteStaffTeams.length} active team(s) are missing one or more of the nine staff roles` });
  }
  const activeHistoricalContracts = (state.players ?? []).filter(player =>
    !!player.historicalPbaSource && player.status === 'PBA' && Number(player.tid) >= 2000 && Number(player.tid) < 3000
  );
  if (activeHistoricalContracts.length > 0 && !activeHistoricalContracts.some(player => Number(player.contract?.exp ?? sourceSeason) - sourceSeason + 1 >= 3)) {
    missing.push({ area: 'PBA contracts', issue: 'historical roster has no contract longer than two years' });
  }
  for (const row of historicalAwardCoverageRows) {
    if (row.missingSeasons) {
      missing.push({ area: 'PBA historical awards', issue: `${row.type} missing for ${row.missingSeasons}` });
    }
  }
  const salaryEconomyRow = featureRows.find(row => row.feature === 'PBA player salary economy');
  if (salaryEconomyRow?.status !== 'era scale aligned') {
    missing.push({ area: 'PBA contracts', issue: String(salaryEconomyRow?.detail ?? 'salary economy audit unavailable') });
  }
  const activePbaTeamCount = (state.nonNBATeams ?? []).filter(team => team.league === 'PBA').length;
  const pbaDraftPool = getPbaDraftPool(state.players ?? [], season, state.leagueStats);
  const pbaDraftOrder = buildPbaDraftOrderTeams(state.nonNBATeams ?? [], state.boxScores ?? [], season, pbaDraftPool.length, state.draftPicks);
  const pbaDraftRounds = Math.max(0, ...pbaDraftOrder.map(team => Number((team as any)._round ?? 0)));
  if (pbaDraftPool.length < activePbaTeamCount * PBA_DRAFT_ROUNDS) {
    missing.push({ area: 'PBA draft', issue: `${pbaDraftPool.length} prospects for ${activePbaTeamCount * PBA_DRAFT_ROUNDS} two-round picks` });
  }
  if (pbaDraftRounds !== PBA_DRAFT_ROUNDS) {
    missing.push({ area: 'PBA draft', issue: `draft order has ${pbaDraftRounds} rounds instead of ${PBA_DRAFT_ROUNDS}` });
  }
  if (historical && sourceSeason <= 2026 && !pbaDraftPool.some((player: any) => player.historicalPbaDraftProspect === true)) {
    missing.push({ area: 'PBA draft', issue: `season ${sourceSeason} has no real source/archive prospects` });
  }
  for (const row of competitionRows) {
    const spec = pbaCompetitionSpecsForSeason(season).find(entry => entry.id === row.id);
    const seasonStart = spec
      ? dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day).slice(0, 10)
      : '';
    const hasAnyMaterial =
      row.regularScheduled > 0 ||
      row.regularPlayed > 0 ||
      row.playoffScheduled > 0 ||
      row.playoffPlayed > 0 ||
      row.finalsPlayed > 0 ||
      row.championRecorded === 'yes';
    const shouldExistByDate = !!seasonStart && currentNorm >= seasonStart;
    if (shouldExistByDate && !hasAnyMaterial && row.regularScheduled === 0 && row.regularPlayed === 0) {
      missing.push({ area: row.competition, issue: 'no regular-season games found' });
    }
    if (row.regularPlayed > 0 && row.playoffScheduled === 0 && !row.championTid) {
      missing.push({ area: row.competition, issue: 'regular season has played data but no playoff material' });
    }
    if (row.finalsPlayed > 0 && row.championRecorded !== 'yes') {
      missing.push({ area: row.competition, issue: 'finals played but champion record missing' });
    }
  }
  if (phase === 'offseason' && effectiveConference !== 'philippine') {
    const importRow = importRows.find(row => row.conference === effectiveConference);
    const spec = effectiveConference === 'commissioners'
      ? getConferenceSpec('commissioners', season)
      : effectiveConference === 'governors'
        ? getConferenceSpec('governors', season)
        : null;
    const importWindowDue = spec
      ? currentNorm >= dateForCompetitionSeason(spec, season, spec.seasonStart.month, spec.seasonStart.day).slice(0, 10)
      : true;
    if (importWindowDue && importRow && importRow.activeImports === 0) {
      missing.push({ area: `${effectiveConference} imports`, issue: 'offseason import window has no active imports yet' });
    }
  }
  if (currentConference === 'governors' && phase === 'regularSeason') {
    const gov = competitionRows.find(row => row.id === 'pba-governors-cup');
    if (gov && gov.regularScheduled === 0 && gov.regularPlayed === 0) {
      missing.push({ area: 'Gov. Cup', issue: 'active Governors Cup has no games' });
    }
  }
  const allThreeChampions = ((state.leagueStats as any)?.pbaConferenceChampions ?? [])
    .filter((entry: any) => Number(entry?.season) === Number(auditedPbaSeason(state))).length >= 3;
  if (allThreeChampions) {
    for (const type of [
      'Most Valuable Player',
      'Rookie of the Year',
      'Most Improved Player',
      'Defensive Player of the Year',
      'Coach of the Year',
      'Mr. Quality Minutes',
      'Sixth Man of the Year',
      'Scoring Champion',
      'PBA Mythical First Team',
      'PBA All-Defensive Team',
      'PBA All-Rookie Team',
    ]) {
      const row = awardRows.find(entry => entry.type === type);
      if (!row || row.count === 0) missing.push({ area: 'PBA awards', issue: `${type} missing after all conferences completed` });
    }
    const seasonAwards = pbaAwardsForSeason(state);
    const competitionByConference = {
      philippine: 'pba-philippine-cup',
      commissioners: 'pba-commissioners-cup',
      governors: 'pba-governors-cup',
    } as const;
    for (const [conference, competitionId] of Object.entries(competitionByConference)) {
      const conferenceAwards = seasonAwards.filter((award: any) =>
        String(award?.conference ?? '') === conference
        || String(award?.competitionId ?? '') === competitionId,
      );
      if (!conferenceAwards.some((award: any) => award?.type === 'Best Player of the Conference')) {
        missing.push({ area: `${conference} awards`, issue: 'Best Player of the Conference missing after conference completion' });
      }
      if (
        conference !== 'philippine'
        && !conferenceAwards.some((award: any) => award?.type === 'Best Import of the Conference')
      ) {
        missing.push({ area: `${conference} awards`, issue: 'Best Import of the Conference missing after conference completion' });
      }
    }
  }
  if (nbaCoexistEnabled && currentNorm >= `${season}-02-16` && !backgroundAllStar.weekendComplete) {
    missing.push({ area: 'Background NBA All-Star', issue: 'NBA All-Star Weekend not complete after All-Star window' });
  }
  for (const row of featureRows) {
    if (String(row.status).includes('pending/missing') && String(row.feature).includes('Cup')) {
      const competition = competitionRows.find(entry => row.feature.startsWith(entry.competition.split('.')[0]) || String(entry.id).includes(String(row.feature).toLowerCase().split("'")[0].replace(/[^a-z]+/g, '-')));
      if (competition?.regularPlayed > 0 || competition?.playoffPlayed > 0) {
        missing.push({ area: row.feature, issue: 'played games exist but feature is still pending/missing' });
      }
    }
  }
  return missing;
}

export function logPbaLazySimAudit(state: GameState, context = 'audit'): void {
  if ((state.leagueStats as any)?.uiMode !== 'pba_isolated') return;
  const competitionRows = buildCompetitionRows(state);
  const importRows = buildImportRows(state);
  const awardRows = buildAwardRows(state);
  const historicalAwardCoverageRows = buildHistoricalAwardCoverageRows(state);
  const featureRows = buildFeatureRows(state, competitionRows, importRows);
  const missingRows = buildMissingRows(state, competitionRows, importRows, awardRows, historicalAwardCoverageRows, featureRows);
  console.group(`${TAG} ${context}`);
  console.log(TAG, {
    date: state.date,
    normalizedDate: normalizeDate(state.date),
    season: state.leagueStats?.year,
    pbaConference: (state.leagueStats as any)?.pbaConference,
    pbaConferencePhase: (state.leagueStats as any)?.pbaConferencePhase,
    effectiveImportConference: getEffectivePbaConference(state.leagueStats as any),
    historicalPba: state.historicalPba,
    fourPointLine: state.leagueStats.fourPointLine,
    checklist: state.offseasonChecklist,
    currentOffseasonTaskTarget: getCurrentPbaOffseasonTaskTarget(state),
    firstPlayoffDate: getPbaFirstPlayoffDate(state),
  });
  console.table(competitionRows);
  console.table(importRows);
  console.table(buildLocalFreeAgencyRows(state));
  console.table(featureRows);
  console.table(awardRows);
  console.table(historicalAwardCoverageRows);
  console.table((state.leagueStats as any)?.pbaConferenceChampions ?? []);
  console.table(pbaCalendarMilestones(state));
  if (missingRows.length > 0) {
    console.table(missingRows);
    console.warn(TAG, 'Missing or suspicious PBA checkpoints', missingRows);
  } else {
    console.log(TAG, 'All audited PBA checkpoints present for the current save state.');
  }
  console.groupEnd();
}

export function shouldLogPbaLazySimCheckpoint(before: GameState, after: GameState): boolean {
  if ((after.leagueStats as any)?.uiMode !== 'pba_isolated') return false;
  const beforeDate = normalizeDate(before.date);
  const afterDate = normalizeDate(after.date);
  if ((before.leagueStats as any)?.pbaConference !== (after.leagueStats as any)?.pbaConference) return true;
  if ((before.leagueStats as any)?.pbaConferencePhase !== (after.leagueStats as any)?.pbaConferencePhase) return true;
  const beforeChamps = ((before.leagueStats as any)?.pbaConferenceChampions ?? []).length;
  const afterChamps = ((after.leagueStats as any)?.pbaConferenceChampions ?? []).length;
  if (beforeChamps !== afterChamps) return true;
  const beforeAwards = (before.historicalAwards ?? []).filter((award: any) => award?.uiMode === 'pba_isolated' || String(award?.source ?? '').toLowerCase().includes('pba')).length;
  const afterAwards = (after.historicalAwards ?? []).filter((award: any) => award?.uiMode === 'pba_isolated' || String(award?.source ?? '').toLowerCase().includes('pba')).length;
  if (beforeAwards !== afterAwards) return true;
  const beforeImports = buildImportRows(before).map(row => row.activeImports).join('|');
  const afterImports = buildImportRows(after).map(row => row.activeImports).join('|');
  if (beforeImports !== afterImports) return true;
  return pbaCalendarMilestones(after).some(milestone => beforeDate < milestone.date && afterDate >= milestone.date);
}
