import { PBA_COMPETITIONS } from '../data/templates/philippines/competitions';
import { resolveCompetitionSeason } from '../services/competition/competitionResolver';
import { dateForCompetitionSeason } from '../services/competition/competitionSeasonState';
import { selectCompetitionTeamTids } from '../services/competition/competitionScheduler';
import { getAllStarWeekendDates } from '../services/allStar/AllStarWeekendOrchestrator';
import { getEffectivePbaConference } from '../services/pba/importManager';
import type { GameState } from '../types';
import { normalizeDate } from './helpers';

const TAG = '[PBA_TEST_LAZY_SIM]';
const POSTSEASON_PHASES = new Set(['qf', 'sf', 'final']);
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
  return Number.isFinite(numericTid) && numericTid >= 2000 && numericTid < 2100;
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
    ...PBA_COMPETITIONS.flatMap(spec => {
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

  return PBA_COMPETITIONS.map(spec => {
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
  return ['commissioners', 'governors'].map(conference => {
    const imports = (state.players ?? []).filter((player: any) =>
      player.isImport &&
      player.importConference === conference &&
      Number(player.tid) >= 2000 &&
      Number(player.tid) < 2100
    );
    return {
      conference,
      activeImports: imports.length,
      pbaTeams: pbaTeams.length,
      missingTeams: Math.max(0, pbaTeams.length - new Set(imports.map((player: any) => player.tid)).size),
      players: imports.slice(0, 12).map((player: any) => `${player.name} (${player.tid})`).join(', '),
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
  const pbaDraftedPlayers = (state.players ?? []).filter((player: any) =>
    player.draft &&
    Number(player.draft.year) === Number(auditedPbaSeason(state)) &&
    Number(player.tid) >= 2000 &&
    Number(player.tid) < 2100
  );
  const seasonAwards = pbaAwardsForSeason(state);
  const championCount = Array.isArray((state.leagueStats as any)?.pbaConferenceChampions)
    ? (state.leagueStats as any).pbaConferenceChampions.filter((entry: any) => Number(entry?.season) === Number(auditedPbaSeason(state))).length
    : 0;

  return [
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
      detail: `${pbaDraftedPlayers.length} drafted PBA player(s) this season`,
    },
    {
      feature: 'Local free agency',
      status: String(checklist.pbaLocalFreeAgency ?? 'not mounted'),
      detail: `${pbaSigningHistory.length} PBA signing history row(s)`,
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

function buildMissingRows(state: GameState, competitionRows: any[], importRows: any[], awardRows: any[], featureRows: any[]) {
  const currentConference = (state.leagueStats as any)?.pbaConference;
  const phase = (state.leagueStats as any)?.pbaConferencePhase;
  const effectiveConference = getEffectivePbaConference(state.leagueStats as any);
  const season = auditedPbaSeason(state);
  const currentNorm = normalizeDate(state.date);
  const backgroundAllStar = (state as any).backgroundNbaAllStar ?? {};
  const missing: Array<{ area: string; issue: string }> = [];
  for (const row of competitionRows) {
    const spec = PBA_COMPETITIONS.find(entry => entry.id === row.id);
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
      ? PBA_COMPETITIONS[1]
      : effectiveConference === 'governors'
        ? PBA_COMPETITIONS[2]
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
      'Scoring Champion',
      'PBA Mythical First Team',
      'PBA All-Defensive Team',
      'PBA All-Rookie Team',
    ]) {
      const row = awardRows.find(entry => entry.type === type);
      if (!row || row.count === 0) missing.push({ area: 'PBA awards', issue: `${type} missing after all conferences completed` });
    }
  }
  if (currentNorm >= `${season}-02-16` && !backgroundAllStar.weekendComplete) {
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
  const featureRows = buildFeatureRows(state, competitionRows, importRows);
  const missingRows = buildMissingRows(state, competitionRows, importRows, awardRows, featureRows);
  console.group(`${TAG} ${context}`);
  console.log(TAG, {
    date: state.date,
    normalizedDate: normalizeDate(state.date),
    season: state.leagueStats?.year,
    pbaConference: (state.leagueStats as any)?.pbaConference,
    pbaConferencePhase: (state.leagueStats as any)?.pbaConferencePhase,
    effectiveImportConference: getEffectivePbaConference(state.leagueStats as any),
    checklist: state.offseasonChecklist,
  });
  console.table(competitionRows);
  console.table(importRows);
  console.table(featureRows);
  console.table(awardRows);
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
