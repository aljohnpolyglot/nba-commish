import type { GameState, GameResult, NewsItem } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getDraftDate, getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import {
  autoGenerateSchedule,
  autoScheduleIntlPreseason,
  autoPickChristmasGames,
  autoPickGlobalGames,
  autoSimVotes,
  autoAnnounceStarters,
  autoAnnounceReserves,
  autoSelectDunkContestants,
  autoSelectThreePointContestants,
  autoSelectShootingStarsContestants,
  autoSelectSkillsChallengeContestants,
  autoSimBackgroundNbaVotes,
  autoAnnounceBackgroundNbaStarters,
  autoAnnounceBackgroundNbaReserves,
  autoSelectBackgroundNbaDunkContestants,
  autoSelectBackgroundNbaThreePointContestants,
  autoSelectBackgroundNbaShootingStarsContestants,
  autoSelectBackgroundNbaSkillsChallengeContestants,
  autoOpenThroneSignups,
  autoCloseThroneSignups,
  autoOpenThroneVoting,
  autoLockThroneField,
  autoSimAllStarWeekend,
  autoSimBackgroundNbaAllStarWeekend,
  autoRunLottery,
  autoRunDraft,
  autoInductHOFClass,
} from './autoResolvers';
import { announce as announceAwardViaEngine, getAnnouncementEvents } from '../awards/AwardEngine';
import { getHOFCeremonyDateString } from '../playerDevelopment/hofChecker';
import { NewsGenerator } from '../news/NewsGenerator';
import { initialEuroOffseasonChecklist } from '../offseason/offseasonState';
import { DEFAULT_MEDIA_RIGHTS, attachBroadcastersToGames } from '../../utils/broadcastingUtils';
import { injectCompetitionPostseasonGames } from '../competition/competitionResolver';
import { generateForCompetition, repairCompetitionSchedules, selectCompetitionTeamTids } from '../competition/competitionScheduler';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import {
  clearConferenceImports,
  generateNextConferenceSchedule,
  getConferenceStartIso,
  getNextConference,
  type PbaConference,
} from '../pba/conferenceTransition';
import { autoManagePbaImports } from '../pba/importAutomation';

type PlayoffMvpBag = {
  pid: string; gp: number; pts: number; reb: number; ast: number;
  stl: number; blk: number; tov: number; fgm: number; fga: number;
  ftm: number; fta: number; fg3m: number; fg3a: number; mins: number;
};

export interface AutoResolveEvent {
  date: string;
  key: string;
  resolver: (state: GameState) => Promise<Partial<GameState>> | Partial<GameState>;
  phase: string;
}

export function repairEuroCompetitionScheduleForToday(state: GameState): GameState {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return state;
  const activeCompetitions = state.activeCompetitions ?? [];
  if (activeCompetitions.length === 0) return state;
  const repairedRegularSeason = repairCompetitionSchedules(state as any, activeCompetitions as any, state.leagueStats.year);
  const repairedPostseason = injectCompetitionPostseasonGames(
    { ...(state as any), schedule: repairedRegularSeason },
    activeCompetitions as any,
    state.leagueStats.year,
  );
  return repairedPostseason === state.schedule ? state : { ...state, schedule: repairedPostseason };
}

export function hasDueUnplayedEuroCompetitionGames(state: GameState, currentNorm: string): boolean {
  if (state.leagueStats?.uiMode !== 'euro_isolated') return false;
  return (state.schedule ?? []).some(game =>
    !!game.competitionId &&
    !game.played &&
    normalizeDate(game.date) <= currentNorm,
  );
}

export function hasDueUnplayedPbaCompetitionGames(state: GameState, currentNorm: string): boolean {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return false;
  return (state.schedule ?? []).some(game =>
    String(game.competitionId ?? '').startsWith('pba-') &&
    !game.played &&
    normalizeDate(game.date) <= currentNorm,
  );
}

export function autoResolveEuroSetupOffseasonTasks(state: GameState, enabled: boolean): GameState {
  if (!enabled || state.leagueStats?.uiMode !== 'euro_isolated') return state;
  const currentNorm = normalizeDate(state.date);
  const seasonYear = state.leagueStats?.year ?? new Date().getFullYear();
  const y1 = seasonYear - 1;
  const checklist = { ...(state.offseasonChecklist ?? initialEuroOffseasonChecklist()) } as any;
  let changed = !state.offseasonChecklist;
  const done = (row: string) => {
    if (checklist[row] === 'pending' || checklist[row] === 'in-progress') {
      checklist[row] = 'done';
      changed = true;
    }
  };

  if (currentNorm > `${y1}-07-01`) {
    ['transferMarket', 'sponsorRenewals', 'facilityUpgrades', 'staffSignings', 'budgetLock'].forEach(done);
  }
  if (currentNorm >= `${y1}-09-01`) {
    ['youthPromotion', 'preseasonFriendlies'].forEach(done);
  }
  if (currentNorm >= `${y1}-09-22`) {
    done('trainingCamp');
  }

  return changed ? { ...state, offseasonChecklist: checklist } : state;
}

export function autoSignPbaImportsForLazySim(state: GameState, conference: PbaConference): GameState {
  return autoManagePbaImports(state, conference, {
    fillMissingTeams: true,
  });
}

export function autoResolvePbaSetupOffseasonTasks(state: GameState, enabled: boolean, targetDate?: string): GameState {
  if (!enabled || state.leagueStats?.uiMode !== 'pba_isolated') return state;
  const leagueStats = state.leagueStats as any;
  if (leagueStats?.pbaConferencePhase !== 'offseason' || !state.offseasonChecklist) return state;
  const current = (leagueStats.pbaConference ?? 'philippine') as PbaConference;
  const nextConference = getNextConference(current);
  const playersAfterClear = clearConferenceImports(state.players, current);
  let nextState = { ...state, players: playersAfterClear };

  if (nextConference) {
    nextState = autoSignPbaImportsForLazySim(nextState, nextConference);
    const newGames = generateNextConferenceSchedule(nextState, nextConference);
    return {
      ...nextState,
      leagueStats: {
        ...nextState.leagueStats,
        pbaConference: nextConference,
        pbaConferencePhase: 'regularSeason',
      },
      date: normalizeDate(nextState.date) < getConferenceStartIso(nextConference, leagueStats.year ?? new Date().getFullYear())
        ? getConferenceStartIso(nextConference, leagueStats.year ?? new Date().getFullYear())
        : normalizeDate(nextState.date),
      schedule: [...(nextState.schedule ?? []), ...newGames],
      offseasonChecklist: undefined,
    };
  }

  const preparedSeason = Number(leagueStats?.pbaYearEndRolloverPreparedSeason);
  const nextYear = Number.isFinite(preparedSeason)
    ? preparedSeason + 1
    : (leagueStats.year ?? new Date().getFullYear()) + 1;
  const nextSeasonStart = getConferenceStartIso('philippine', nextYear);
  const targetNorm = targetDate ? normalizeDate(targetDate) : null;
  if (targetNorm && targetNorm < nextSeasonStart) return nextState;

  if (!nextState.draftComplete) {
    const draftPatch = autoRunDraft(nextState);
    if (!(draftPatch as any)?._deferred && Object.keys(draftPatch).length > 0) {
      nextState = { ...nextState, ...draftPatch } as GameState;
    }
  }
  const philSpec = PBA_COMPETITIONS[0];
  const tids = selectCompetitionTeamTids(philSpec, nextState as any);
  const start = new Date(Date.UTC(nextYear - 1, philSpec.seasonStart.month - 1, philSpec.seasonStart.day));
  const newGames = generateForCompetition(philSpec, tids.map((tid: number) => ({ tid })), start, 800_000);
  const preservedBackgroundSchedule = (nextState.schedule ?? []).filter((game: any) =>
    !String(game?.competitionId ?? '').startsWith('pba-'),
  );
  return {
    ...nextState,
    leagueStats: {
      ...nextState.leagueStats,
      pbaConference: 'philippine',
      pbaConferencePhase: 'regularSeason',
      pbaYearEndRolloverPreparedSeason: undefined,
      pbaDraftComplete: nextState.draftComplete || (nextState.leagueStats as any)?.pbaDraftComplete,
      pbaDraftCompleteSeason: nextState.draftComplete ? nextYear : (nextState.leagueStats as any)?.pbaDraftCompleteSeason,
    },
    date: normalizeDate(nextState.date) < getConferenceStartIso('philippine', nextYear)
      ? getConferenceStartIso('philippine', nextYear)
      : normalizeDate(nextState.date),
    schedule: [...preservedBackgroundSchedule, ...newGames].sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
    offseasonChecklist: undefined,
  } as GameState;
}

const PLAYOFF_MVP_LEAGUE_TS = 0.57;

export function computePlayoffMvpFromResults(
  results: Array<{ homeTeamId: number; awayTeamId: number; homeStats: any[]; awayStats: any[] }>,
  winnerTid: number,
  minGames = 3,
): { pid: string; score: number; avgPts: number } | null {
  const bags = new Map<string, PlayoffMvpBag>();
  for (const r of results) {
    const stats = r.homeTeamId === winnerTid ? r.homeStats
      : r.awayTeamId === winnerTid ? r.awayStats
      : null;
    if (!stats) continue;
    for (const s of stats) {
      if (!s.playerId) continue;
      const b = bags.get(s.playerId) ?? {
        pid: s.playerId, gp: 0, pts: 0, reb: 0, ast: 0,
        stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0,
        ftm: 0, fta: 0, fg3m: 0, fg3a: 0, mins: 0,
      };
      b.gp += 1;
      b.pts += s.pts ?? 0;
      b.reb += s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0));
      b.ast += s.ast ?? 0;
      b.stl += s.stl ?? 0;
      b.blk += s.blk ?? 0;
      b.tov += s.tov ?? 0;
      b.fgm += s.fgm ?? 0;
      b.fga += s.fga ?? 0;
      b.ftm += s.ftm ?? 0;
      b.fta += s.fta ?? 0;
      b.fg3m += s.threePm ?? 0;
      b.fg3a += s.threePa ?? 0;
      b.mins += s.min ?? 0;
      bags.set(s.playerId, b);
    }
  }
  const candidates = [...bags.values()].filter(b => b.gp >= minGames);
  if (candidates.length === 0) return null;
  const scored = candidates.map(b => {
    const avgPts = b.pts / b.gp;
    const tsDenom = 2 * (b.fga + 0.44 * b.fta);
    const ts = tsDenom > 0 ? b.pts / tsDenom : 0;
    const score =
      avgPts * 1.0
      + (b.reb / b.gp) * 0.5
      + (b.ast / b.gp) * 0.7
      + (b.stl / b.gp) * 1.0
      + (b.blk / b.gp) * 1.0
      - (b.tov / b.gp) * 0.7
      + (ts - PLAYOFF_MVP_LEAGUE_TS) * 8
      + Math.min(b.mins / b.gp, 40) / 40 * 3;
    return { pid: b.pid, score, avgPts };
  });
  scored.sort((a, b) => (b.score - a.score) || (b.avgPts - a.avgPts));
  return scored[0];
}

const autoBroadcastingDefault = (state: GameState): Partial<GameState> => {
  const mediaRights = state.leagueStats.mediaRights ?? DEFAULT_MEDIA_RIGHTS;
  const updatedSchedule = attachBroadcastersToGames(state.schedule, mediaRights, state.teams);
  return {
    leagueStats: {
      ...state.leagueStats,
      mediaRights,
    },
    schedule: updatedSchedule,
  };
};

export const buildAutoResolveEvents = (y: number, leagueStats?: any): AutoResolveEvent[] => {
  const y1 = y - 1;
  const euroIsolated = leagueStats?.uiMode === 'euro_isolated';
  const pbaIsolated = leagueStats?.uiMode === 'pba_isolated';
  const draftLotteryDateStr = toISODateString(getDraftLotteryDate(y, leagueStats));
  const draftDateStr = toISODateString(getDraftDate(y, leagueStats));
  const hofCeremony = getHOFCeremonyDateString(y1);

  const stubState = {
    leagueStats: leagueStats ?? { uiMode: 'nba' },
    players: [], teams: [], nonNBATeams: [], staff: null, historicalAwards: [],
  } as any;
  const awardEvents: AutoResolveEvent[] = getAnnouncementEvents(stubState, y).map(ev => ({
    date: ev.date,
    key: `award_${ev.awardId}`,
    resolver: (state: GameState) => announceAwardViaEngine(state, ev.awardId),
    phase: ev.phase,
  }));

  if (pbaIsolated) {
    return [
      { date: `${y1}-08-14`, key: 'schedule_generation', resolver: autoGenerateSchedule, phase: 'Generating background schedule...' },
      { date: `${y}-01-14`, key: 'background_nba_allstar_votes', resolver: autoSimBackgroundNbaVotes, phase: 'Simulating background NBA All-Star voting...' },
      { date: `${y}-01-22`, key: 'background_nba_allstar_starters', resolver: autoAnnounceBackgroundNbaStarters, phase: 'Announcing background NBA All-Star starters...' },
      { date: `${y}-01-29`, key: 'background_nba_allstar_reserves', resolver: autoAnnounceBackgroundNbaReserves, phase: 'Announcing background NBA All-Star reserves...' },
      { date: `${y}-02-05`, key: 'background_nba_dunk_contestants', resolver: autoSelectBackgroundNbaDunkContestants, phase: 'Selecting background NBA Dunk Contest field...' },
      { date: `${y}-02-08`, key: 'background_nba_threepoint_contestants', resolver: autoSelectBackgroundNbaThreePointContestants, phase: 'Selecting background NBA 3-Point Contest field...' },
      { date: `${y}-02-09`, key: 'background_nba_shooting_stars_contestants', resolver: autoSelectBackgroundNbaShootingStarsContestants, phase: 'Selecting background NBA Shooting Stars field...' },
      { date: `${y}-02-10`, key: 'background_nba_skills_challenge_contestants', resolver: autoSelectBackgroundNbaSkillsChallengeContestants, phase: 'Selecting background NBA Skills Challenge field...' },
      { date: `${y}-02-13`, key: 'background_nba_allstar_weekend', resolver: autoSimBackgroundNbaAllStarWeekend, phase: 'Simulating background NBA All-Star Weekend...' },
      { date: `${y}-03-01`, key: 'allstar_votes', resolver: autoSimVotes, phase: 'Selecting PBA All-Star captains...' },
      { date: `${y}-03-01`, key: 'allstar_reserves', resolver: autoAnnounceReserves, phase: 'Setting PBA All-Star rosters...' },
      { date: `${y}-03-03`, key: 'dunk_contestants', resolver: autoSelectDunkContestants, phase: 'Selecting PBA Dunk Contest field...' },
      { date: `${y}-03-03`, key: 'threepoint_contestants', resolver: autoSelectThreePointContestants, phase: 'Selecting PBA 3-Point Contest field...' },
      { date: `${y}-03-03`, key: 'skills_challenge_contestants', resolver: autoSelectSkillsChallengeContestants, phase: 'Selecting PBA Skills Challenge field...' },
      { date: `${y}-03-08`, key: 'allstar_weekend', resolver: autoSimAllStarWeekend, phase: 'Simulating PBA All-Star Weekend...' },
      ...awardEvents,
    ];
  }

  if (euroIsolated) {
    return [
      { date: `${y1}-08-14`, key: 'schedule_generation', resolver: autoGenerateSchedule, phase: 'Generating Schedule...' },
      ...awardEvents,
    ];
  }

  return [
    { date: `${y1}-08-06`, key: 'broadcasting_default', resolver: autoBroadcastingDefault, phase: 'Setting Broadcasting Deal...' },
    { date: `${y1}-08-12`, key: 'christmas_games', resolver: autoPickChristmasGames, phase: 'Setting Christmas Games...' },
    { date: `${y1}-08-13`, key: 'global_games', resolver: autoPickGlobalGames, phase: 'Finalizing Global Schedule...' },
    { date: `${y1}-08-13`, key: 'intl_preseason', resolver: autoScheduleIntlPreseason, phase: 'Scheduling International Preseason...' },
    { date: `${y1}-08-14`, key: 'schedule_generation', resolver: autoGenerateSchedule, phase: 'Generating Schedule...' },
    { date: hofCeremony, key: 'hof_induction', resolver: autoInductHOFClass, phase: 'Inducting Hall of Fame Class...' },
    { date: `${y1}-12-01`, key: 'throne_signups_open', resolver: autoOpenThroneSignups, phase: 'Opening Throne Sign-Ups...' },
    { date: `${y}-01-14`, key: 'allstar_votes', resolver: autoSimVotes, phase: 'Simulating All-Star Voting...' },
    { date: `${y}-01-15`, key: 'throne_signups_close', resolver: autoCloseThroneSignups, phase: 'Closing Throne Sign-Ups...' },
    { date: `${y}-01-16`, key: 'throne_voting_open', resolver: autoOpenThroneVoting, phase: 'Opening Throne Voting...' },
    { date: `${y}-01-22`, key: 'allstar_starters', resolver: autoAnnounceStarters, phase: 'Announcing All-Star Starters...' },
    { date: `${y}-01-29`, key: 'allstar_reserves', resolver: autoAnnounceReserves, phase: 'Announcing Reserves + Rising Stars...' },
    { date: `${y}-01-30`, key: 'throne_field_reveal', resolver: autoLockThroneField, phase: 'Revealing The Throne — Field of 16...' },
    { date: `${y}-02-05`, key: 'dunk_contestants', resolver: autoSelectDunkContestants, phase: 'Selecting Dunk Contest Field...' },
    { date: `${y}-02-08`, key: 'threepoint_contestants', resolver: autoSelectThreePointContestants, phase: 'Selecting 3-Point Contest Field...' },
    { date: `${y}-02-09`, key: 'shooting_stars_contestants', resolver: autoSelectShootingStarsContestants, phase: 'Selecting Shooting Stars Field...' },
    { date: `${y}-02-10`, key: 'skills_challenge_contestants', resolver: autoSelectSkillsChallengeContestants, phase: 'Selecting Skills Challenge Field...' },
    { date: `${y}-02-13`, key: 'allstar_weekend', resolver: autoSimAllStarWeekend, phase: 'Simulating All-Star Weekend...' },
    ...awardEvents,
    { date: draftLotteryDateStr, key: 'draft_lottery', resolver: autoRunLottery, phase: 'Running Draft Lottery...' },
    { date: draftDateStr, key: 'draft_execute', resolver: autoRunDraft, phase: 'Executing NBA Draft...' },
  ];
};

export function buildAutoNews(eventKey: string, state: GameState) {
  const date = state.date;
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const autoId = (suffix: string) => `auto-news-${season}-${suffix}`;
  const map: Record<string, any> = {
    christmas_games: { id: autoId('christmas-games'), headline: 'Christmas Day Games Set', content: 'The NBA has finalized its Christmas Day slate.', date },
    throne_signups_open: { id: autoId('throne-signups-open'), headline: 'THE THRONE — Sign-Ups Open', content: 'The 1v1 tournament throne is up for grabs. Sign-ups are live through January 15.', date },
    throne_signups_close: { id: autoId('throne-signups-closed'), headline: 'THE THRONE — Sign-Ups Closed', content: 'Sign-ups have closed. Composite vote opens January 16.', date },
    throne_field_reveal: { id: autoId('throne-field-reveal'), headline: 'THE THRONE — Field of 16 Revealed', content: 'The composite vote has spoken. The 16 players who will fight for the crown have been chosen.', date },
    allstar_starters: { id: autoId('nba-allstar-starters'), headline: 'All-Star Starters Announced', content: 'Fan voting has concluded. The All-Star starters have been revealed.', date },
    allstar_reserves: {
      id: autoId(state.leagueStats?.uiMode === 'pba_isolated' ? 'pba-allstar-rosters' : 'nba-allstar-rosters'),
      headline: state.leagueStats?.uiMode === 'pba_isolated' ? 'PBA All-Star Rosters Set' : 'Full All-Star Rosters Set',
      content: state.leagueStats?.uiMode === 'pba_isolated'
        ? 'The captain-draft rosters are set for PBA All-Star Weekend.'
        : 'Coaches have made their picks. The complete All-Star rosters are finalized.',
      date,
    },
    allstar_weekend: {
      id: autoId(state.leagueStats?.uiMode === 'pba_isolated' ? 'pba-allstar-weekend' : 'nba-allstar-weekend'),
      headline: state.leagueStats?.uiMode === 'pba_isolated' ? 'PBA All-Star Weekend Complete' : 'All-Star Weekend Complete',
      content: state.leagueStats?.uiMode === 'pba_isolated'
        ? 'The PBA All-Star Game and weekend contests have concluded. Check the All-Star tab for results.'
        : 'The NBA All-Star Weekend has concluded. Check the All-Star tab for results.',
      date,
    },
    background_nba_allstar_starters: { id: autoId('background-nba-allstar-starters'), headline: 'NBA All-Star Starters Announced', content: 'Fan voting has concluded. The NBA All-Star starters have been revealed.', date },
    background_nba_allstar_reserves: { id: autoId('background-nba-allstar-rosters'), headline: 'NBA All-Star Rosters Set', content: 'Coaches have made their picks. The complete NBA All-Star rosters are finalized.', date },
    background_nba_allstar_weekend: { id: autoId('background-nba-allstar-weekend'), headline: 'NBA All-Star Weekend Complete', content: 'The NBA All-Star Game and weekend contests have concluded.', date },
    award_coy: null, award_smoy: null, award_mip: null,
    award_dpoy: null, award_roy: null, award_allnba: null, award_mvp: null,
    draft_lottery: { id: autoId('draft-lottery'), headline: 'Draft Lottery Complete', content: 'The NBA Draft Lottery has concluded. View the Draft Lottery tab for full results.', date },
    draft_execute: { id: autoId('draft-complete'), headline: 'NBA Draft Complete', content: 'The NBA Draft has concluded. All prospects have been assigned to teams. Undrafted players are now free agents.', date },
    hof_induction: null,
  };
  return map[eventKey] ?? null;
}

export function generatePlayoffSeriesNews(
  prevPlayoffs: GameState['playoffs'],
  newPlayoffs: GameState['playoffs'],
  teams: GameState['teams'],
  date: string,
  season: number,
  allSimResults: GameResult[] = [],
  players: GameState['players'] = [],
  historicalAwards: GameState['historicalAwards'] = [],
): NewsItem[] {
  if (!newPlayoffs || !prevPlayoffs) return [];
  const news: NewsItem[] = [];
  const winsNeededFor7 = 4;

  for (const series of newPlayoffs.series) {
    const prev = prevPlayoffs.series.find(s => s.id === series.id);
    if (!prev || prev.status === 'complete') continue;

    const higherTeam = teams.find(t => t.id === series.higherSeedTid);
    const lowerTeam = teams.find(t => t.id === series.lowerSeedTid);
    if (!higherTeam || !lowerTeam) continue;

    const newHW = series.higherSeedWins;
    const newLW = series.lowerSeedWins;
    const prevHW = prev.higherSeedWins;
    const prevLW = prev.lowerSeedWins;

    if (series.status === 'complete') {
      const winner = teams.find(t => t.id === series.winnerId);
      const loser = teams.find(t => t.id === (series.winnerId === series.higherSeedTid ? series.lowerSeedTid : series.higherSeedTid));
      if (!winner || !loser) continue;

      const totalGames = newHW + newLW;
      const isChampionship = series.round === 4;

      if (!isChampionship) {
        const winnerResults = allSimResults.filter(r => r.homeTeamId === winner.id || r.awayTeamId === winner.id);
        const winnerTopStat = winnerResults
          .flatMap(r => r.homeTeamId === winner.id ? r.homeStats : r.awayStats)
          .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))[0];
        const winnerTopPlayer = winnerTopStat ? players.find(p => p.internalId === winnerTopStat.playerId) : undefined;
        const winCategory = series.round === 3 ? 'playoff_finals_bound'
          : series.round === 2 ? 'playoff_advance_r2'
          : 'playoff_series_win';

        const winItem = NewsGenerator.generate(winCategory, date, {
          teamName: winner.name, teamCity: winner.region ?? winner.name,
          opponentName: loser.name, gamesCount: totalGames,
        }, undefined);
        if (winItem) {
          if (winnerTopPlayer?.imgURL) winItem.playerPortraitUrl = winnerTopPlayer.imgURL;
          if (series.round === 3) {
            const finalsSeasonYears = new Set([
              ...(historicalAwards ?? [])
                .filter((a: any) => (a.type === 'Champion' || a.type === 'Runner Up') && Number(a.tid) === winner.id)
                .map((a: any) => Number(a.season)),
              ...(winner.seasons ?? [])
                .filter((s: any) => s.playoffRoundsWon === 4 || s.playoffRoundsWon === 3)
                .map((s: any) => Number(s.season)),
            ]);
            const priorFinals = [...finalsSeasonYears].filter(yr => yr < season).sort((a, b) => b - a);
            const lastFinalsYear = priorFinals[0];
            const consecutiveFinals = lastFinalsYear === season - 1 && finalsSeasonYears.has(season - 2);
            const fmt = (yr: number) => `${yr - 1}-${String(yr).slice(-2)}`;

            if (consecutiveFinals) winItem.headline = `${winner.name} Return to the NBA Finals for the Third Consecutive Year`;
            else if (lastFinalsYear === season - 1) winItem.headline = `${winner.name} Are Back — Return to the NBA Finals`;
            else if (!lastFinalsYear) winItem.headline = `FIRST FINALS IN FRANCHISE HISTORY! ${winner.name} Are Going to the NBA Finals`;
            else winItem.headline = `${winner.name} Head to NBA Finals for First Time Since ${fmt(lastFinalsYear)}`;
          }
          news.push(winItem);
        }

        const elimItem = NewsGenerator.generate('playoff_elimination', date, {
          teamName: loser.name, teamCity: loser.region ?? loser.name,
          opponentName: winner.name, gamesCount: totalGames,
        }, undefined);
        if (elimItem) {
          if (winnerTopPlayer?.imgURL) elimItem.playerPortraitUrl = winnerTopPlayer.imgURL;
          news.push(elimItem);
        }
      }
      continue;
    }

    if (newHW === prevHW && newLW === prevLW) continue;

    const hGained = newHW - prevHW;
    const lGained = newLW - prevLW;

    if (newHW === winsNeededFor7 - 1 && newLW === winsNeededFor7 - 1 &&
      !(prevHW === winsNeededFor7 - 1 && prevLW === winsNeededFor7 - 1)) {
      const cameBack = lGained > hGained ? lowerTeam : higherTeam;
      const opponent = cameBack === lowerTeam ? higherTeam : lowerTeam;
      const item = NewsGenerator.generate('series_forces_game7', date, {
        teamName: cameBack.name, opponentName: opponent.name, year: season,
      }, cameBack.logoUrl);
      if (item) news.push(item);
      continue;
    }

    const prevHigherOnBrink = prevHW === winsNeededFor7 - 1 && prevLW < winsNeededFor7 - 1;
    const prevLowerOnBrink = prevLW === winsNeededFor7 - 1 && prevHW < winsNeededFor7 - 1;

    if (prevHigherOnBrink && lGained > 0) {
      const item = NewsGenerator.generate('series_alive', date, {
        teamName: lowerTeam.name, opponentName: higherTeam.name, year: season,
      }, lowerTeam.logoUrl);
      if (item) news.push(item);
      continue;
    }
    if (prevLowerOnBrink && hGained > 0) {
      const item = NewsGenerator.generate('series_alive', date, {
        teamName: higherTeam.name, opponentName: lowerTeam.name, year: season,
      }, higherTeam.logoUrl);
      if (item) news.push(item);
      continue;
    }

    const wasUneven = prevHW !== prevLW;
    const nowTied = newHW === newLW;
    if (wasUneven && nowTied && newHW < winsNeededFor7 - 1) {
      const cameBack = prevHW < prevLW ? higherTeam : lowerTeam;
      const opponent = cameBack === higherTeam ? lowerTeam : higherTeam;
      const item = NewsGenerator.generate('series_comeback', date, {
        teamName: cameBack.name, opponentName: opponent.name,
        wins: String(newHW), year: season,
      }, cameBack.logoUrl);
      if (item) news.push(item);
    }
  }

  if (newPlayoffs.bracketComplete && !prevPlayoffs.bracketComplete && newPlayoffs.champion) {
    const champTeam = teams.find(t => t.id === newPlayoffs.champion);
    const finalsSeries = newPlayoffs.series.find(s => s.round === 4 && s.status === 'complete');
    const loserTeam = finalsSeries
      ? teams.find(t => t.id === (finalsSeries.winnerId === finalsSeries.higherSeedTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid))
      : undefined;
    const totalGames = finalsSeries ? finalsSeries.higherSeedWins + finalsSeries.lowerSeedWins : 0;

    if (champTeam) {
      const champSeasonYears = new Set([
        ...(historicalAwards ?? [])
          .filter((a: any) => a.type === 'Champion' && Number(a.tid) === champTeam.id)
          .map((a: any) => Number(a.season)),
        ...(champTeam.seasons ?? [])
          .filter((s: any) => s.playoffRoundsWon === 4)
          .map((s: any) => Number(s.season)),
      ]);
      const priorTitles = [...champSeasonYears].filter(yr => yr < season).length;
      const totalTitles = priorTitles + 1;
      const wonLastYear = champSeasonYears.has(season - 1);
      const wonTwoYearsAgo = champSeasonYears.has(season - 2);
      const isThreePeat = wonLastYear && wonTwoYearsAgo;
      const isRepeat = wonLastYear && !wonTwoYearsAgo;
      const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

      const champItem = NewsGenerator.generate('nba_champion', date, {
        teamName: champTeam.name, teamCity: champTeam.region ?? champTeam.name,
        opponentName: loserTeam?.name ?? 'their opponent',
        year: season, gamesCount: totalGames,
      }, champTeam.logoUrl);
      if (champItem) {
        if (isThreePeat) champItem.headline = `THREE-PEAT! ${champTeam.name} Are the ${season} NBA Champions`;
        else if (isRepeat) champItem.headline = `BACK-TO-BACK! ${champTeam.name} Repeat as ${season} NBA Champions`;
        else if (priorTitles === 0) champItem.headline = `FIRST IN FRANCHISE HISTORY! ${champTeam.name} Are the ${season} NBA Champions`;
        else champItem.headline = `${ordinal(totalTitles)} Title! ${champTeam.name} Capture the ${season} NBA Championship`;
        news.push(champItem);
      }
    }
  }

  return news;
}

export const getPhaseLabel = (dateStr: string, year: number, leagueStats?: { uiMode?: string | null }): string => {
  if (leagueStats?.uiMode === 'pba_isolated') {
    const y1 = year - 1;
    if (dateStr < `${y1}-10-05`) return 'PBA Season Setup...';
    if (dateStr < `${y1}-12-15`) return 'Philippine Cup...';
    if (dateStr < `${year}-01-28`) return 'Philippine Cup Playoffs...';
    if (dateStr < `${year}-03-06`) return 'PBA All-Star Build-Up...';
    if (dateStr < `${year}-03-11`) return 'PBA All-Star Weekend...';
    if (dateStr < `${year}-06-03`) return "Commissioner's Cup...";
    if (dateStr < `${year}-07-08`) return "Commissioner's Cup Playoffs...";
    if (dateStr < `${year}-07-10`) return "Governors' Cup Setup...";
    if (dateStr < `${year}-08-28`) return "Governors' Cup...";
    if (dateStr < `${year}-10-01`) return "Governors' Cup Playoffs...";
    if (dateStr < `${year}-10-05`) return 'PBA Season Awards...';
    if (dateStr < `${year}-12-15`) return 'Philippine Cup...';
    return 'PBA Offseason...';
  }
  const y1 = year - 1;
  if (dateStr < `${y1}-10-24`) return 'Preseason...';
  if (dateStr < `${y1}-12-01`) return 'Early Season...';
  if (dateStr < `${y1}-12-25`) return 'NBA Cup & Voting...';
  if (dateStr < `${year}-01-22`) return 'Mid Season...';
  if (dateStr < `${year}-02-12`) return 'All-Star Race...';
  if (dateStr < `${year}-02-17`) return 'All-Star Weekend...';
  if (dateStr < `${year}-04-01`) return 'Late Season Push...';
  if (dateStr < `${year}-04-20`) return 'Regular Season Final Days...';
  if (dateStr < `${year}-05-15`) return 'Playoffs...';
  if (dateStr < `${year}-06-01`) return 'Conference Finals & Draft Lottery...';
  if (dateStr < `${year}-06-20`) return 'NBA Finals...';
  if (dateStr < `${year}-06-27`) return 'NBA Draft...';
  return 'Offseason...';
};

export const daysBetween = (a: string, b: string): number =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) /
    (1000 * 60 * 60 * 24)
  );

export function advanceDateByOne(state: GameState): GameState {
  const currentNorm = normalizeDate(state.date);
  const nextDate = new Date(`${currentNorm}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return {
    ...state,
    date: nextDate.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    day: state.day + 1,
  };
}
