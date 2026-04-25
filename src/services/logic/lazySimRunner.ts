import { GameState, LazySimProgress, HistoricalStatPoint, GameResult } from '../../types';
import { runSimulation } from '../../store/logic/turn/simulationHandler';
import { processSimulationResults } from '../../store/logic/turn/postProcessor';
import { calculateNewStats } from '../../store/logic/turn/statUpdater';
import { generatePaychecks } from './financialService';
import { SocialEngine } from '../social/SocialEngine';
import { SettingsManager } from '../SettingsManager';
import { normalizeDate, calculateSocialEngagement } from '../../utils/helpers';
import { getDraftDate, getDraftLotteryDate, toISODateString } from '../../utils/dateUtils';
import { buildShamsPost } from '../social/templates/charania';
import { findShamsPhoto } from '../social/charaniaphotos';
import { generateLazySimNews } from '../news/lazySimNewsGenerator';
import { convertTo2KRating } from '../../utils/helpers';
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
  autoSimAllStarWeekend,
  autoAnnounceCOY,
  autoAnnounceSMOY,
  autoAnnounceMIP,
  autoAnnounceDPOY,
  autoAnnounceROY,
  autoAnnounceAllNBA,
  autoAnnounceMVP,
  autoRunLottery,
  autoRunDraft,
  autoInductHOFClass,
} from './autoResolvers';
import { getHOFCeremonyDateString } from '../playerDevelopment/hofChecker';
import { NewsGenerator } from '../news/NewsGenerator';
import { applySeasonRollover, shouldFireRollover } from './seasonRollover';
import { autoResolveAllStarHosts } from '../allStar/hostAutoResolver';
import { PlayoffSeries, HistoricalAward, SeasonHistoryEntry } from '../../types';
import { DEFAULT_MEDIA_RIGHTS, attachBroadcastersToGames } from '../../utils/broadcastingUtils';
import { setAssistantGMActive } from '../assistantGMFlag';

interface AutoResolveEvent {
  date: string;
  key: string;
  resolver: (state: GameState) => Promise<Partial<GameState>> | Partial<GameState>;
  phase: string;
}

// Ensure the schedule has broadcaster metadata before the season begins.
// Uses whatever deal the player set, falling back to the default ESPN/NBC/Amazon package.
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

/** Builds milestone events dynamically from the current season year.
 *  y  = season end year (e.g. 2026 for the 2025-26 season)
 *  y1 = previous calendar year (e.g. 2025) — preseason / early-season events */
export const buildAutoResolveEvents = (y: number, leagueStats?: any): AutoResolveEvent[] => {
  const y1 = y - 1;
  const draftLotteryDateStr = toISODateString(getDraftLotteryDate(y, leagueStats));
  const draftDateStr        = toISODateString(getDraftDate(y, leagueStats));
  // HOF ceremony falls on the first Saturday of September (real-life Naismith)
  const hofCeremony = getHOFCeremonyDateString(y1);
  return [
    { date: `${y1}-08-06`, key: 'broadcasting_default',   resolver: autoBroadcastingDefault,         phase: 'Setting Broadcasting Deal...' },
    { date: `${y1}-08-12`, key: 'christmas_games',        resolver: autoPickChristmasGames,          phase: 'Setting Christmas Games...' },
    { date: `${y1}-08-13`, key: 'global_games',           resolver: autoPickGlobalGames,             phase: 'Finalizing Global Schedule...' },
    { date: `${y1}-08-13`, key: 'intl_preseason',         resolver: autoScheduleIntlPreseason,       phase: 'Scheduling International Preseason...' },
    { date: `${y1}-08-14`, key: 'schedule_generation',    resolver: autoGenerateSchedule,            phase: 'Generating Schedule...' },
    { date: hofCeremony,   key: 'hof_induction',          resolver: autoInductHOFClass,              phase: 'Inducting Hall of Fame Class...' },
    { date: `${y}-01-14`,  key: 'allstar_votes',          resolver: autoSimVotes,                    phase: 'Simulating All-Star Voting...' },
    { date: `${y}-01-22`,  key: 'allstar_starters',       resolver: autoAnnounceStarters,            phase: 'Announcing All-Star Starters...' },
    { date: `${y}-01-29`,  key: 'allstar_reserves',       resolver: autoAnnounceReserves,            phase: 'Announcing Reserves + Rising Stars...' },
    { date: `${y}-02-05`,  key: 'dunk_contestants',       resolver: autoSelectDunkContestants,       phase: 'Selecting Dunk Contest Field...' },
    { date: `${y}-02-08`,  key: 'threepoint_contestants', resolver: autoSelectThreePointContestants, phase: 'Selecting 3-Point Contest Field...' },
    { date: `${y}-02-13`,  key: 'allstar_weekend',        resolver: autoSimAllStarWeekend,           phase: 'Simulating All-Star Weekend...' },
    // Award announcements — staggered to match real NBA calendar
    { date: `${y}-04-19`,  key: 'award_coy',              resolver: autoAnnounceCOY,                 phase: 'Announcing Coach of the Year...' },
    { date: `${y}-04-22`,  key: 'award_smoy',             resolver: autoAnnounceSMOY,                phase: 'Announcing Sixth Man of the Year...' },
    { date: `${y}-04-25`,  key: 'award_mip',              resolver: autoAnnounceMIP,                 phase: 'Announcing Most Improved Player...' },
    { date: `${y}-04-28`,  key: 'award_dpoy',             resolver: autoAnnounceDPOY,                phase: 'Announcing Defensive Player of the Year...' },
    { date: `${y}-05-02`,  key: 'award_roy',              resolver: autoAnnounceROY,                 phase: 'Announcing Rookie of the Year...' },
    { date: `${y}-05-07`,  key: 'award_allnba',           resolver: autoAnnounceAllNBA,              phase: 'Announcing All-NBA Teams...' },
    { date: `${y}-05-21`,  key: 'award_mvp',              resolver: autoAnnounceMVP,                 phase: 'Announcing MVP...' },
    // Draft events
    { date: draftLotteryDateStr, key: 'draft_lottery', resolver: autoRunLottery, phase: 'Running Draft Lottery...' },
    { date: draftDateStr,        key: 'draft_execute', resolver: autoRunDraft,   phase: 'Executing NBA Draft...' },
  ];
};

const buildAutoNews = (eventKey: string, state: GameState) => {
  const date = state.date;
  const map: Record<string, any> = {
    christmas_games:     { id: `auto-xmas-${Date.now()}`,    headline: 'Christmas Day Games Set',       content: 'The NBA has finalized its Christmas Day slate.',                               date },
    allstar_starters:    { id: `auto-starters-${Date.now()}`, headline: 'All-Star Starters Announced', content: 'Fan voting has concluded. The All-Star starters have been revealed.',           date },
    allstar_reserves:    { id: `auto-reserves-${Date.now()}`, headline: 'Full All-Star Rosters Set',   content: 'Coaches have made their picks. The complete All-Star rosters are finalized.',   date },
    allstar_weekend:     { id: `auto-asw-${Date.now()}`,      headline: 'All-Star Weekend Complete',   content: 'The NBA All-Star Weekend has concluded. Check the All-Star tab for results.',   date },
    // award_* keys: news is injected directly by each resolver — no auto-news needed here
    award_coy: null, award_smoy: null, award_mip: null,
    award_dpoy: null, award_roy: null, award_allnba: null, award_mvp: null,
    draft_lottery: { id: `auto-lottery-${Date.now()}`, headline: 'Draft Lottery Complete', content: 'The NBA Draft Lottery has concluded. View the Draft Lottery tab for full results.', date },
    draft_execute: { id: `auto-draft-${Date.now()}`, headline: 'NBA Draft Complete', content: 'The NBA Draft has concluded. All prospects have been assigned to teams. Undrafted players are now free agents.', date },
    // hof_induction: news is injected directly by the resolver (Class item + per-inductee items) — no auto-news needed here
    hof_induction: null,
  };
  return map[eventKey] ?? null;
};

/** Detect newly-completed playoff series and championship, return news items. */
function generatePlayoffSeriesNews(
  prevPlayoffs: GameState['playoffs'],
  newPlayoffs: GameState['playoffs'],
  teams: GameState['teams'],
  date: string,
  season: number,
  allSimResults: GameResult[] = [],
  players: GameState['players'] = [],
  historicalAwards: GameState['historicalAwards'] = []
): import('../../types').NewsItem[] {
  if (!newPlayoffs || !prevPlayoffs) return [];
  const news: import('../../types').NewsItem[] = [];

  const winsNeededFor7 = 4; // always best-of-7

  for (const series of newPlayoffs.series) {
    const prev = prevPlayoffs.series.find(s => s.id === series.id);
    if (!prev || prev.status === 'complete') continue;

    const higherTeam = teams.find(t => t.id === series.higherSeedTid);
    const lowerTeam  = teams.find(t => t.id === series.lowerSeedTid);
    if (!higherTeam || !lowerTeam) continue;

    const newHW = series.higherSeedWins;
    const newLW = series.lowerSeedWins;
    const prevHW = prev.higherSeedWins;
    const prevLW = prev.lowerSeedWins;

    if (series.status === 'complete') {
      // Series just ended this batch
      const winner = teams.find(t => t.id === series.winnerId);
      const loser  = teams.find(t => t.id === (series.winnerId === series.higherSeedTid ? series.lowerSeedTid : series.higherSeedTid));
      if (!winner || !loser) continue;

      const totalGames = newHW + newLW;
      const isChampionship = series.round === 4;

      if (!isChampionship) {
        // Find the top performer from the winner's side in this batch for portrait enrichment
        const winnerResults = allSimResults.filter(r => r.homeTeamId === winner.id || r.awayTeamId === winner.id);
        const winnerTopStat = winnerResults
          .flatMap(r => r.homeTeamId === winner.id ? r.homeStats : r.awayStats)
          .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))[0];
        const winnerTopPlayer = winnerTopStat ? players.find(p => p.internalId === winnerTopStat.playerId) : undefined;

        // Pick template based on round: R1=playoff_series_win, R2=playoff_advance_r2, R3=playoff_finals_bound
        const winCategory = series.round === 3 ? 'playoff_finals_bound'
          : series.round === 2 ? 'playoff_advance_r2'
          : 'playoff_series_win';

        const winItem = NewsGenerator.generate(winCategory, date, {
          teamName: winner.name, teamCity: winner.region ?? winner.name,
          opponentName: loser.name, gamesCount: totalGames,
        }, undefined); // no static image — allow Imagn enrichment
        if (winItem) {
          if (winnerTopPlayer?.imgURL) winItem.playerPortraitUrl = winnerTopPlayer.imgURL;

          // For Conference Finals winner heading to NBA Finals, enrich headline with historical context
          if (series.round === 3) {
            // Combine flat historicalAwards (sim format) with team.seasons (real-world BBGM history)
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
            const fmt = (yr: number) => `${yr - 1}–${String(yr).slice(-2)}`;

            if (consecutiveFinals) {
              winItem.headline = `${winner.name} Return to the NBA Finals for the Third Consecutive Year`;
            } else if (lastFinalsYear === season - 1) {
              winItem.headline = `${winner.name} Are Back — Return to the NBA Finals`;
            } else if (!lastFinalsYear) {
              winItem.headline = `FIRST FINALS IN FRANCHISE HISTORY! ${winner.name} Are Going to the NBA Finals`;
            } else {
              winItem.headline = `${winner.name} Head to NBA Finals for First Time Since ${fmt(lastFinalsYear)}`;
            }
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

    // Series still in progress — detect mid-series narrative beats
    if (newHW === prevHW && newLW === prevLW) continue; // no games played this batch

    // Determine who gained wins this batch
    const hGained = newHW - prevHW;
    const lGained = newLW - prevLW;

    // Forces Game 7: series now 3-3 (wasn't before)
    if (newHW === winsNeededFor7 - 1 && newLW === winsNeededFor7 - 1 &&
        !(prevHW === winsNeededFor7 - 1 && prevLW === winsNeededFor7 - 1)) {
      // Who just tied it?
      const cameBack = lGained > hGained ? lowerTeam : higherTeam;
      const opponent = cameBack === lowerTeam ? higherTeam : lowerTeam;
      const item = NewsGenerator.generate('series_forces_game7', date, {
        teamName: cameBack.name, opponentName: opponent.name, year: season,
      }, cameBack.logoUrl);
      if (item) news.push(item);
      continue;
    }

    // Keeps alive: team was on elimination brink (opponent had 3 wins) and won
    const prevHigherOnBrink = prevHW === winsNeededFor7 - 1 && prevLW < winsNeededFor7 - 1;
    const prevLowerOnBrink  = prevLW === winsNeededFor7 - 1 && prevHW < winsNeededFor7 - 1;

    if (prevHigherOnBrink && lGained > 0) {
      // Lower seed kept alive
      const item = NewsGenerator.generate('series_alive', date, {
        teamName: lowerTeam.name, opponentName: higherTeam.name, year: season,
      }, lowerTeam.logoUrl);
      if (item) news.push(item);
      continue;
    }
    if (prevLowerOnBrink && hGained > 0) {
      // Higher seed kept alive
      const item = NewsGenerator.generate('series_alive', date, {
        teamName: higherTeam.name, opponentName: lowerTeam.name, year: season,
      }, higherTeam.logoUrl);
      if (item) news.push(item);
      continue;
    }

    // Comeback: series was uneven, now tied (but not 3-3 — handled above)
    const wasUneven = prevHW !== prevLW;
    const nowTied   = newHW === newLW;
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

  // Championship — only when bracket completes and wasn't complete before
  if (newPlayoffs.bracketComplete && !prevPlayoffs.bracketComplete && newPlayoffs.champion) {
    const champTeam = teams.find(t => t.id === newPlayoffs.champion);
    const finalsSeries = newPlayoffs.series.find(s => s.round === 4 && s.status === 'complete');
    const loserTeam = finalsSeries
      ? teams.find(t => t.id === (finalsSeries.winnerId === finalsSeries.higherSeedTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid))
      : undefined;
    const totalGames = finalsSeries ? finalsSeries.higherSeedWins + finalsSeries.lowerSeedWins : 0;

    if (champTeam) {
      // Count prior championships: check both historicalAwards (flat sim format) AND team.seasons
      // (which has real-world BBGM history via playoffRoundsWon===4). team.seasons is always
      // populated from the roster JSON and works for both new and existing saved games.
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
        if (isThreePeat) {
          champItem.headline = `THREE-PEAT! ${champTeam.name} Are the ${season} NBA Champions`;
        } else if (isRepeat) {
          champItem.headline = `BACK-TO-BACK! ${champTeam.name} Repeat as ${season} NBA Champions`;
        } else if (priorTitles === 0) {
          champItem.headline = `FIRST IN FRANCHISE HISTORY! ${champTeam.name} Are the ${season} NBA Champions`;
        } else {
          champItem.headline = `${ordinal(totalTitles)} Title! ${champTeam.name} Capture the ${season} NBA Championship`;
        }
        news.push(champItem);
      }

      // Determine Finals MVP: highest-scoring player on champ team in Finals
      // (approximate from player.stats playoff data — use the Finals winner's top performer)
    }
  }

  return news;
}

const getPhaseLabel = (dateStr: string, year: number): string => {
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

const daysBetween = (a: string, b: string): number =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24)
  );

const advanceDateByOne = (state: GameState): GameState => {
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
};

export interface LazySimOptions {
  /** 'overlay' = show progress UI (long skips, load game). 'silent' = no UI, collect lastSimResults (short skips). */
  mode?: 'overlay' | 'silent';
  /** Days per batch. Default 7 for overlay, 1 for silent. */
  batchSize?: number;
  /** If true, stop AT target date without simulating target day's games.
   *  Use for "Sim to Date" from ScheduleView where the user wants to land on that date
   *  and decide whether to watch/sim those games manually.
   *  Default false — target day is simmed (needed for Sim Round / Sim Playoffs). */
  stopBefore?: boolean;
  /** If true, AI handles the user's team for all transactions during this lazy sim
   *  (re-signings, FA signings, waivings, trades, extensions, two-way promotions).
   *  Clears automatically when the sim completes. Default false. */
  assistantGM?: boolean;
  /** Called after each individual game result during silent-mode short sims.
   *  Use with flushSync in GameContext to stream results to the ticker in real-time. */
  onGame?: (result: any) => void;
}

export interface LazySimResult {
  state: GameState;
  /** Box scores from the LAST batch — used by silent mode so GameContext can show game results modal. */
  lastSimResults: any[];
}

export const runLazySim = async (
  initialState: GameState,
  targetDateStr: string,
  onProgress?: (progress: LazySimProgress) => void,
  options?: LazySimOptions,
): Promise<LazySimResult> => {
  const mode = options?.mode ?? 'overlay';
  const defaultBatch = mode === 'silent' ? 1 : 7;
  const BATCH_SIZE = options?.batchSize ?? defaultBatch;
  const stopBefore = options?.stopBefore ?? false;
  const assistantGM = options?.assistantGM ?? false;

  setAssistantGMActive(assistantGM);

  const targetNorm = normalizeDate(targetDateStr);
  const startNorm = normalizeDate(initialState.date);
  const daysTotal = daysBetween(startNorm, targetNorm);

  console.log('[LAZY_SIM] ▶️ start', {
    rawTargetDate: targetDateStr,
    targetNorm,
    rawStartDate: initialState.date,
    startNorm,
    daysTotal,
    mode,
    BATCH_SIZE,
  });

  if (daysTotal < 0) {
    console.log('[LAZY_SIM] ⛔ daysTotal < 0 — returning initial state');
    return { state: initialState, lastSimResults: [] };
  }

  // Force LLM off for the entire lazy sim
  const originalSettings = SettingsManager.getSettings();
  SettingsManager.saveSettings({ ...originalSettings, enableLLM: false, gameSpeed: 10 });
  const restoreOnUnload = () => SettingsManager.saveSettings(originalSettings);
  window.addEventListener('beforeunload', restoreOnUnload);

  let state = { ...initialState };
  let lastBatchSimResults: any[] = []; // Track last batch for silent mode
  // Keys are `${seasonYear}:${eventKey}` so events re-fire correctly after season rollover
  const firedEvents = new Set<string>();

  // §0 Fix: if starting before schedule generation (Aug 14) with no regular-season
  // games, eagerly fire the early-season scheduling events so the full schedule is
  // in state before any simulation days run. Without this, the schedule is only
  // patched into state on the first outer-loop iteration that crosses Aug 14, but
  // by then the batch has already run with an empty schedule for those days.
  {
    const eagerSeasonYear = state.leagueStats.year;
    const eagerKeys = ['broadcasting_default', 'global_games', 'intl_preseason', 'schedule_generation'];
    const hasRegularSeason = state.schedule.some(
      (g: any) => !g.isPreseason && !g.isPlayoff && !g.isPlayIn
    );
    if (!hasRegularSeason) {
      for (const event of buildAutoResolveEvents(eagerSeasonYear, state.leagueStats)) {
        if (!eagerKeys.includes(event.key)) continue;
        if (event.date >= targetNorm) continue; // target is before this event
        const compositeKey = `${eagerSeasonYear}:${event.key}`;
        if (firedEvents.has(compositeKey)) continue;
        try {
          const patch = await event.resolver(state);
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
          }
        } catch (err) {
          console.warn(`[lazySim eager] ${event.key} failed:`, err);
        }
        firedEvents.add(compositeKey);
      }
    }
  }
  // Pre-seed with all injuries already on players so only NEW injuries generate news
  const reportedInjuries = new Set<string>(
    (initialState.players ?? [])
      .filter(p => p.injury && p.injury.gamesRemaining > 0)
      .map(p => `${p.internalId}-${p.injury!.type}`)
  );
  let daysComplete = 0;
  let currentPhase = 'Starting...';

  const report = (override?: Partial<LazySimProgress>) => {
    const currentNorm = normalizeDate(state.date);
    onProgress?.({
      currentDate: currentNorm,
      targetDate: targetNorm,
      daysComplete,
      daysTotal,
      currentPhase,
      percentComplete: Math.min(99, Math.round((daysComplete / daysTotal) * 100)),
      ...override,
    });
  };

  try {
    let iterNum = 0;
    while (true) {
      iterNum++;
      const currentNorm = normalizeDate(state.date);
      // Phase defaults to the date-stage label each iteration so event-specific
      // strings (e.g. "Inducting HOF Class...") don't persist across later batches.
      currentPhase = getPhaseLabel(currentNorm, state.leagueStats.year);
      console.log(`[LAZY_SIM] 🔁 iter ${iterNum} — currentNorm=${currentNorm}, targetNorm=${targetNorm}, state.day=${state.day}, stopBefore=${stopBefore}`);
      // stopBefore=true: break AT target (don't sim target day's games — land on target with games unplayed).
      // stopBefore=false: break only when past target (sim target day's games — default, needed for Sim Round / Sim Playoffs).
      const shouldBreakTop = stopBefore ? currentNorm >= targetNorm : currentNorm > targetNorm;
      if (shouldBreakTop) {
        console.log(`[LAZY_SIM] 🛑 iter ${iterNum} — break at top (stopBefore=${stopBefore})`);
        break;
      }

      // Fire any auto-resolvers whose date has been reached.
      // Events are keyed by `${seasonYear}:${key}` so they re-fire after season rollover.
      const seasonYear = state.leagueStats.year;
      for (const event of buildAutoResolveEvents(seasonYear, state.leagueStats)) {
        const compositeKey = `${seasonYear}:${event.key}`;
        if (!firedEvents.has(compositeKey) && event.date <= currentNorm) {
          currentPhase = event.phase;
          report();
          try {
            const patch = await event.resolver(state);
            if (patch && Object.keys(patch).length > 0) {
              state = { ...state, ...patch };
            }
          } catch (err) {
            console.warn(`Auto-resolver ${event.key} failed:`, err);
          }
          firedEvents.add(compositeKey);
          const autoNews = buildAutoNews(event.key, state);
          if (autoNews) {
            state = { ...state, news: [autoNews, ...(state.news || [])] };
          }
        }
      }

      // After all events fired, restore phase to the calendar-stage label.
      // Without this reset, the last event's phase text (e.g. "Inducting Hall of Fame
      // Class...") persists through the entire next simulation batch — visible to the
      // user even when the sim is in, say, the middle of the regular season.
      currentPhase = getPhaseLabel(currentNorm, seasonYear);
      report();

      // Season rollover — fires once when date crosses June 30 of the current season year.
      // Must run in the lazy sim loop (not just simulationHandler) so that contracts expire,
      // the year advances, and schedule_generation fires for the new season.
      if (shouldFireRollover(state, currentNorm)) {
        const rolloverPatch = applySeasonRollover(state);
        state = { ...state, ...rolloverPatch };
        // Ensure All-Star host always has the current + next season locked in
        // (horizon=1 — like real life we always know "this year" and "next year").
        const resolvedHosts = autoResolveAllStarHosts(state.leagueStats, state.teams, { horizon: 1 });
        if (resolvedHosts !== state.leagueStats.allStarHosts) {
          state = { ...state, leagueStats: { ...state.leagueStats, allStarHosts: resolvedHosts } };
        }
        currentPhase = 'Season Rollover...';
        report();
      }

      // Determine batch size (don't overshoot target)
      // Use batch=1 near Jun 30 to ensure rollover fires BEFORE any July games sim
      const rolloverDate = `${state.leagueStats.year}-06-30`;
      const nearRollover = currentNorm >= `${state.leagueStats.year}-06-25` && currentNorm < rolloverDate;
      const remaining = daysBetween(currentNorm, targetNorm);
      const effectiveBatch = nearRollover ? 1 : BATCH_SIZE;
      // remaining=0 when currentNorm==targetNorm — still need 1 iteration to sim today's games
      let batchDays = Math.max(1, Math.min(effectiveBatch, remaining));

      // Clamp: never overshoot the next unfired scheduled event for this season.
      // Without this, a 7-day batch can skip past e.g. the draft date (Jun 25), and
      // by the next iteration season rollover has already flipped the year — causing
      // the event to never fire in-year, or worse, to double-fire via the post-sim
      // gameLogic path once state.draftComplete gets reset by rollover mid-batch.
      const nextEventDate = buildAutoResolveEvents(state.leagueStats.year, state.leagueStats)
        .filter(e => !firedEvents.has(`${state.leagueStats.year}:${e.key}`) && e.date > currentNorm)
        .map(e => e.date)
        .sort()[0];
      if (nextEventDate) {
        const daysToEvent = daysBetween(currentNorm, nextEventDate);
        if (daysToEvent > 0 && daysToEvent < batchDays) batchDays = daysToEvent;
      }
      console.log(`[LAZY_SIM] 📊 iter ${iterNum} — remaining=${remaining}, batchDays=${batchDays}, nearRollover=${nearRollover}, nextEvent=${nextEventDate ?? 'none'}`);
      if (remaining < 0) {
        console.log(`[LAZY_SIM] 🛑 iter ${iterNum} — remaining < 0, breaking`);
        break;
      }

      const { stateWithSim, allSimResults, perDayResults } = await runSimulation(state, batchDays, undefined, options?.onGame);
      console.log(`[LAZY_SIM] 🎮 iter ${iterNum} — after runSimulation: state.date=${stateWithSim.date}, simResults=${allSimResults.length}, perDayResults=${perDayResults.length}`);
      lastBatchSimResults = allSimResults; // track for silent mode return
      console.log(`[LAZY_SIM] ✓ 581 post-runSim — iter ${iterNum}`);

      // Accumulate player season stats — normally called in processTurn, bypassed here
      const { updatedPlayers, updatedDraftPicks } = processSimulationResults(
        allSimResults,
        stateWithSim.players,
        stateWithSim.draftPicks,
        stateWithSim.schedule,
        stateWithSim.leagueStats?.year
      );
      console.log(`[LAZY_SIM] ✓ 591 post-processSimulationResults — iter ${iterNum}, updatedPlayers=${updatedPlayers.length}`);

      // Calculate per-day stats (approvals, viewership, funds) and build history points
      // This mirrors what gameLogic.ts does for normal turns so graphs stay continuous
      let runningState = { ...state };
      const newHistoricalPoints: HistoricalStatPoint[] = [];
      for (const dayData of perDayResults) {
        const { newStats, newLeagueStats } = calculateNewStats(
          runningState,
          { type: 'ADVANCE_DAY' } as any,
          {},
          dayData.results,
          0,
          dayData.date
        );
        runningState = {
          ...runningState,
          stats: { ...runningState.stats, ...newStats },
          leagueStats: { ...runningState.leagueStats, ...newLeagueStats },
        };
        newHistoricalPoints.push({
          date: dayData.date,
          publicApproval: newStats.publicApproval,
          ownerApproval: newStats.ownerApproval,
          playerApproval: newStats.playerApproval,
          legacy: newStats.legacy,
          revenue: newLeagueStats.revenue,
          viewership: newLeagueStats.viewership,
        });
      }

      console.log(`[LAZY_SIM] ✓ 620 post-perDayLoop — iter ${iterNum}, histPoints=${newHistoricalPoints.length}`);

      // Generate social posts for the batch — player reactions, media posts, Shams injuries
      const nbaPlayers = updatedPlayers.filter(p => !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || ''));
      const socialEngine = new SocialEngine();
      const batchDateString = stateWithSim.date;
      console.log(`[LAZY_SIM] ✓ 625 pre-socialEngine — iter ${iterNum}, nbaPlayers=${nbaPlayers.length}`);
      const enginePosts = await socialEngine.generateDailyPosts(allSimResults, nbaPlayers, stateWithSim.teams, batchDateString, batchDays, stateWithSim.playoffs, stateWithSim.schedule);
      console.log(`[LAZY_SIM] ✓ 626 post-socialEngine — iter ${iterNum}, posts=${enginePosts.length}`);

      // Shams injury posts — supplement engine with explicit injury coverage
      const shamsInjuryPosts: any[] = [];
      for (const simResult of allSimResults) {
        if (!simResult.injuries?.length) continue;
        for (const injury of simResult.injuries) {
          const player = updatedPlayers.find(p => p.internalId === injury.playerId);
          if (!player || convertTo2KRating(player.overallRating ?? player.ratings?.[0]?.ovr ?? 0, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp) < 70) continue;
          const team = stateWithSim.teams.find((t: any) => t.id === (injury.teamId ?? player.tid));
          if (!team) continue;
          const content = buildShamsPost({ player, team, injury: { injuryType: injury.injuryType, gamesRemaining: injury.gamesRemaining }, opponent: null } as any);
          if (!content) continue;
          const engagement = calculateSocialEngagement('@ShamsCharania', content, player.overallRating);
          const shamsPhoto = findShamsPhoto(player.name, team?.name);
          shamsInjuryPosts.push({
            id: `shams-injury-${injury.playerId}-${Date.now()}-${Math.random()}`,
            author: 'Shams Charania',
            handle: '@ShamsCharania',
            content,
            date: new Date(simResult.date).toISOString(),
            likes: engagement.likes,
            retweets: engagement.retweets,
            source: 'TwitterX' as const,
            isNew: true,
            playerPortraitUrl: player.imgURL,
            ...(shamsPhoto ? { mediaUrl: shamsPhoto.image_url } : {}),
          });
        }
      }
      const allBatchPosts = [...enginePosts, ...shamsInjuryPosts];
      console.log(`[LAZY_SIM] ✓ 662 post-shams — iter ${iterNum}, totalPosts=${allBatchPosts.length}`);

      // Generate narrative news for this batch (streaks, big games, injuries, drama)
      const batchNews = generateLazySimNews(
        stateWithSim.teams,
        updatedPlayers,
        allSimResults,
        stateWithSim.date,
        reportedInjuries,
        false,
        state.teams,
        stateWithSim.playoffs,
        stateWithSim.schedule,
        stateWithSim.leagueStats?.year ?? 2026
      );
      console.log(`[LAZY_SIM] ✓ 676 post-lazySimNews — iter ${iterNum}, news=${batchNews?.length ?? 0}`);

      // Playoff series news — detect series completions & championship this batch
      const playoffSeriesNews = generatePlayoffSeriesNews(
        state.playoffs,
        stateWithSim.playoffs,
        stateWithSim.teams,
        stateWithSim.date,
        state.leagueStats.year,
        allSimResults,
        updatedPlayers,
        stateWithSim.historicalAwards
      );
      console.log(`[LAZY_SIM] ✓ 690 post-playoffSeriesNews — iter ${iterNum}, news=${playoffSeriesNews?.length ?? 0}`);

      // Store championship in historicalAwards (Finals MVP determined by top playoff scorer on champ team)
      let champHistoricalAwards: HistoricalAward[] = [];
      let semifinalsMvpAwards: HistoricalAward[] = [];
      let champTeamsWithRoundsWon: typeof stateWithSim.teams | null = null;
      if (stateWithSim.playoffs?.bracketComplete && !state.playoffs?.bracketComplete && stateWithSim.playoffs.champion) {
        const champTid = stateWithSim.playoffs.champion;
        // Derive runner-up from champTid directly — avoids relying on winnerId/status
        const finalsSeries = stateWithSim.playoffs.series.find(s => s.round === 4);
        const loserTid = finalsSeries
          ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
          : undefined;
        const champTeam = stateWithSim.teams.find(t => t.id === champTid);
        const loserTeam = loserTid !== undefined ? stateWithSim.teams.find(t => t.id === loserTid) : undefined;
        const season = state.leagueStats.year;

        if (champTeam) {
          champHistoricalAwards.push({ season, type: 'Champion', name: champTeam.name, tid: champTid });
        }
        if (loserTeam) {
          champHistoricalAwards.push({ season, type: 'Runner Up', name: loserTeam.name, tid: loserTid });
        }

        // Also stamp playoffRoundsWon on the teams' current-season record so the
        // playoffRoundsWon fallback in LeagueHistoryView works for the sim season.
        if (champTeam || loserTeam) {
          champTeamsWithRoundsWon = stateWithSim.teams.map(t => {
            const isChamp  = t.id === champTid;
            const isRunner = loserTid !== undefined && t.id === loserTid;
            if (!isChamp && !isRunner) return t;
            return {
              ...t,
              seasons: (t.seasons ?? []).map((s: any) =>
                Number(s.season) === Number(season)
                  ? { ...s, playoffRoundsWon: isChamp ? 4 : 3 }
                  : s
              ),
            };
          });
        }

        // Write 'NBA Champion' award to every player on the champ team
        if (champTeam) {
          const champRosterIds = new Set(
            updatedPlayers.filter(p => p.tid === champTid).map(p => p.internalId)
          );
          const withChampion = updatedPlayers.map(p => {
            if (!champRosterIds.has(p.internalId)) return p;
            const already = (p.awards ?? []).some(a => a.season === season && a.type === 'NBA Champion');
            if (already) return p;
            return { ...p, awards: [...(p.awards ?? []), { season, type: 'NBA Champion' }] };
          });
          Object.assign(updatedPlayers, withChampion);
        }

        // Finals MVP: per-player series score across the Finals ONLY (round 4), not all playoffs.
        // Formula blends scoring, efficiency, rebounds, assists, defense and team result so
        // stat-stuffers in losing roles don't outrank the series' primary driver.
        //
        // MVP score per player =
        //   (avgPts * 1.0)
        // + (avgReb * 0.5) + (avgAst * 0.7)
        // + (avgStl * 1.0) + (avgBlk * 1.0)
        // - (avgTov * 0.7)
        // + (trueShootingPct above league avg) * 8
        // + (usage bonus: games started / total games) * 3
        // Min 3 games played to qualify (NBA-style eligibility).
        const finalsGameIds = new Set<number>(finalsSeries?.gameIds ?? []);
        // Combine current-batch results with prior box scores so every Finals game is captured,
        // even when earlier games were processed in a different lazy-sim batch.
        const priorFinalsResults = ((state.boxScores ?? []) as GameResult[]).filter(r => finalsGameIds.has(r.gameId));
        const finalsResults = [...priorFinalsResults, ...allSimResults.filter(r => finalsGameIds.has(r.gameId))];
        if (finalsResults.length > 0 && finalsSeries) {
          // Collect per-player Finals stat bags for the champ team
          type Bag = {
            pid: string; gp: number; pts: number; reb: number; ast: number;
            stl: number; blk: number; tov: number; fgm: number; fga: number;
            ftm: number; fta: number; fg3m: number; fg3a: number; mins: number;
          };
          const bags = new Map<string, Bag>();
          for (const r of finalsResults) {
            const stats = r.homeTeamId === champTid ? r.homeStats
                        : r.awayTeamId === champTid ? r.awayStats
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
              b.pts  += s.pts     ?? 0;
              b.reb  += s.reb     ?? ((s.orb ?? 0) + (s.drb ?? 0));
              b.ast  += s.ast     ?? 0;
              b.stl  += s.stl     ?? 0;
              b.blk  += s.blk     ?? 0;
              b.tov  += s.tov     ?? 0;
              b.fgm  += s.fgm     ?? 0;
              b.fga  += s.fga     ?? 0;
              b.ftm  += s.ftm     ?? 0;
              b.fta  += s.fta     ?? 0;
              b.fg3m += s.threePm ?? 0;
              b.fg3a += s.threePa ?? 0;
              b.mins += s.min     ?? 0;
              bags.set(s.playerId, b);
            }
          }

          const candidates = [...bags.values()].filter(b => b.gp >= 3);
          if (candidates.length > 0) {
            // League-avg TS% reference (≈0.57 in modern NBA). Used as efficiency baseline.
            const LEAGUE_TS = 0.57;
            const scored = candidates.map(b => {
              const avgPts = b.pts / b.gp;
              const avgReb = b.reb / b.gp;
              const avgAst = b.ast / b.gp;
              const avgStl = b.stl / b.gp;
              const avgBlk = b.blk / b.gp;
              const avgTov = b.tov / b.gp;
              const tsDenom = 2 * (b.fga + 0.44 * b.fta);
              const ts = tsDenom > 0 ? b.pts / tsDenom : 0;
              const score =
                avgPts * 1.0
                + avgReb * 0.5
                + avgAst * 0.7
                + avgStl * 1.0
                + avgBlk * 1.0
                - avgTov * 0.7
                + (ts - LEAGUE_TS) * 8
                // small minutes-load bonus (fatigue/usage proxy)
                + Math.min(b.mins / b.gp, 40) / 40 * 3;
              return { pid: b.pid, score, avgPts };
            });
            // Tiebreaker: higher avgPts wins.
            scored.sort((a, b) =>
              (b.score - a.score) || (b.avgPts - a.avgPts)
            );
            const mvpStat = scored[0];
            const mvpPlayer = updatedPlayers.find(p => p.internalId === mvpStat.pid);
            if (mvpPlayer) {
              champHistoricalAwards.push({ season, type: 'Finals MVP', name: mvpPlayer.name, pid: mvpPlayer.internalId, tid: champTid });
              const updatedWithMvp = updatedPlayers.map(p =>
                p.internalId === mvpPlayer.internalId
                  ? { ...p, awards: [...(p.awards ?? []), { season, type: 'Finals MVP' }] }
                  : p
              );
              Object.assign(updatedPlayers, updatedWithMvp);
            }
          }
        }

        // Finals MVP news
        const fmvpAward = champHistoricalAwards.find(a => a.type === 'Finals MVP');
        if (fmvpAward && champTeam) {
          const champPlayerStats = allSimResults
            .filter(r => r.homeTeamId === champTid || r.awayTeamId === champTid)
            .flatMap(r => r.homeTeamId === champTid ? r.homeStats : r.awayStats)
            .filter(s => s.playerId === fmvpAward.pid);
          const avgPts = champPlayerStats.length > 0
            ? (champPlayerStats.reduce((s, x) => s + x.pts, 0) / champPlayerStats.length).toFixed(1)
            : '?';
          const fmvpItem = NewsGenerator.generate('finals_mvp', stateWithSim.date, {
            playerName: fmvpAward.name, teamName: champTeam.name,
            teamCity: champTeam.region ?? champTeam.name,
            year: season, pts: avgPts,
          });
          if (fmvpItem) playoffSeriesNews.push(fmvpItem);
        }
      }

      // Semifinals MVP — one per round-3 (Conference Finals) series that just
      // completed this batch. Round 3 can finish in an earlier batch than round 4,
      // so this runs independently of bracketComplete. Box scores may span batches
      // (prior games in state.boxScores, current in allSimResults) — both consulted.
      if (stateWithSim.playoffs && state.playoffs) {
        for (const newSeries of stateWithSim.playoffs.series) {
          if (newSeries.round !== 3 || newSeries.status !== 'complete') continue;
          const prevSeries = state.playoffs.series.find(s => s.id === newSeries.id);
          if (prevSeries && prevSeries.status === 'complete') continue;
          const winnerTid = newSeries.winnerId;
          if (winnerTid == null) continue;

          const seriesGameIds = new Set<number>(newSeries.gameIds ?? []);
          const priorBox = (state.boxScores ?? []) as any[];
          const seriesResults: any[] = [
            ...priorBox.filter((b: any) => seriesGameIds.has(b.gameId)),
            ...allSimResults.filter(r => seriesGameIds.has(r.gameId)),
          ];
          if (seriesResults.length === 0) continue;

          type Bag = {
            pid: string; gp: number; pts: number; reb: number; ast: number;
            stl: number; blk: number; tov: number; fgm: number; fga: number;
            ftm: number; fta: number; fg3m: number; fg3a: number; mins: number;
          };
          const bags = new Map<string, Bag>();
          for (const r of seriesResults) {
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
              b.pts  += s.pts     ?? 0;
              b.reb  += s.reb     ?? ((s.orb ?? 0) + (s.drb ?? 0));
              b.ast  += s.ast     ?? 0;
              b.stl  += s.stl     ?? 0;
              b.blk  += s.blk     ?? 0;
              b.tov  += s.tov     ?? 0;
              b.fgm  += s.fgm     ?? 0;
              b.fga  += s.fga     ?? 0;
              b.ftm  += s.ftm     ?? 0;
              b.fta  += s.fta     ?? 0;
              b.fg3m += s.threePm ?? 0;
              b.fg3a += s.threePa ?? 0;
              b.mins += s.min     ?? 0;
              bags.set(s.playerId, b);
            }
          }
          const candidates = [...bags.values()].filter(b => b.gp >= 3);
          if (candidates.length === 0) continue;

          const LEAGUE_TS = 0.57;
          const scored = candidates.map(b => {
            const avgPts = b.pts / b.gp;
            const avgReb = b.reb / b.gp;
            const avgAst = b.ast / b.gp;
            const avgStl = b.stl / b.gp;
            const avgBlk = b.blk / b.gp;
            const avgTov = b.tov / b.gp;
            const tsDenom = 2 * (b.fga + 0.44 * b.fta);
            const ts = tsDenom > 0 ? b.pts / tsDenom : 0;
            const score =
              avgPts * 1.0
              + avgReb * 0.5
              + avgAst * 0.7
              + avgStl * 1.0
              + avgBlk * 1.0
              - avgTov * 0.7
              + (ts - LEAGUE_TS) * 8
              + Math.min(b.mins / b.gp, 40) / 40 * 3;
            return { pid: b.pid, score, avgPts };
          });
          scored.sort((a, b) => (b.score - a.score) || (b.avgPts - a.avgPts));
          const mvpStat = scored[0];
          const season = state.leagueStats.year;
          const mvpPlayer = updatedPlayers.find(p => p.internalId === mvpStat.pid);
          if (!mvpPlayer) continue;

          semifinalsMvpAwards.push({
            season, type: 'Semifinals MVP',
            name: mvpPlayer.name, pid: mvpPlayer.internalId, tid: winnerTid,
          });
          const withSfmvp = updatedPlayers.map(p =>
            p.internalId === mvpPlayer.internalId
              ? { ...p, awards: [...(p.awards ?? []), { season, type: 'Semifinals MVP' }] }
              : p
          );
          Object.assign(updatedPlayers, withSfmvp);
        }
      }

      // Apply paychecks earned during this batch — prevents all salary from
      // stacking up and landing in one lump sum on the next real-day advance
      const batchPayResult = generatePaychecks(
        state.lastPayDate || new Date(initialState.date).toISOString(),
        new Date(stateWithSim.date).toISOString(),
        state.salary || 10000000
      );
      const batchPayWealth = batchPayResult.totalNetPay / 1_000_000;

      // Ghost real estate passive income — silently trickles in each batch
      const monthlyPassive = (state.realEstateInventory ?? [])
        .reduce((s: number, a: any) => s + Math.floor(a.price * 0.004), 0);
      const passiveBatchWealth = monthlyPassive > 0
        ? (monthlyPassive * (batchDays / 30)) / 1_000_000
        : 0;

      const allBatchNews = [...playoffSeriesNews, ...batchNews];

      // Defensive: if the sim returned an empty schedule but we had one before the batch
      // (can happen when no games fall in the Aug 14–Oct 23 window), preserve the pre-batch schedule.
      // BUT: if rollover just fired (year advanced), the empty schedule is intentional — don't restore!
      const yearAdvanced = stateWithSim.leagueStats.year !== state.leagueStats.year;
      const safeSchedule = !yearAdvanced && stateWithSim.schedule.length === 0 && state.schedule.length > 0
        ? state.schedule
        : stateWithSim.schedule;

      state = {
        ...stateWithSim,
        schedule: safeSchedule,
        // Apply the compounded stats from per-day calculations
        stats: {
          ...runningState.stats,
          personalWealth: Number((runningState.stats.personalWealth + batchPayWealth + passiveBatchWealth).toFixed(2)),
        },
        leagueStats: runningState.leagueStats,
        players: updatedPlayers,
        draftPicks: updatedDraftPicks,
        historicalStats: [...(state.historicalStats || []), ...newHistoricalPoints].slice(-365),
        boxScores: [
          ...(stateWithSim.boxScores || []),
          ...allSimResults.map(r => ({ ...r, date: r.date || stateWithSim.date }))
        ],
        socialFeed: allBatchPosts.length > 0
          ? [...allBatchPosts, ...(stateWithSim.socialFeed || [])].slice(0, 500)
          : stateWithSim.socialFeed,
        news: allBatchNews.length > 0
          ? [...allBatchNews, ...(stateWithSim.news || [])].slice(0, 200)
          : stateWithSim.news,
        lastPayDate: batchPayResult.newLastPayDate,
        payslips: [...(state.payslips || []), ...batchPayResult.newPayslips].slice(-50),
        historicalAwards: (champHistoricalAwards.length > 0 || semifinalsMvpAwards.length > 0)
          ? [...(stateWithSim.historicalAwards ?? []), ...semifinalsMvpAwards, ...champHistoricalAwards]
          : stateWithSim.historicalAwards,
        ...(champTeamsWithRoundsWon ? { teams: champTeamsWithRoundsWon } : {}),
        // ── Season history snapshot ───────────────────────────────────────
        // Appended exactly once when bracketComplete flips true this batch.
        ...(stateWithSim.playoffs?.bracketComplete && !state.playoffs?.bracketComplete && stateWithSim.playoffs.champion
          ? (() => {
              const champTidSnap = stateWithSim.playoffs.champion;
              const loserSnap = stateWithSim.playoffs.series.find((s: any) => s.round === 4);
              const loserTidSnap = loserSnap
                ? (loserSnap.higherSeedTid === champTidSnap ? loserSnap.lowerSeedTid : loserSnap.higherSeedTid)
                : undefined;
              const yearSnap = state.leagueStats.year;
              const champTeamSnap = stateWithSim.teams.find(t => t.id === champTidSnap);
              const loserTeamSnap = loserTidSnap != null ? stateWithSim.teams.find(t => t.id === loserTidSnap) : undefined;
              // Pull current-season award winners from historicalAwards
              const awards = [...(stateWithSim.historicalAwards ?? []), ...champHistoricalAwards];
              const seasonAward = (type: string) => awards.find(a => a.season === yearSnap && a.type === type);
              const newEntry: SeasonHistoryEntry = {
                year: yearSnap,
                champion: champTeamSnap?.name ?? 'Unknown',
                championTid: champTidSnap,
                runnerUp: loserTeamSnap?.name,
                runnerUpTid: loserTidSnap,
                mvp: seasonAward('MVP')?.name,
                mvpPid: seasonAward('MVP')?.pid as string | undefined,
                finalsMvp: seasonAward('Finals MVP')?.name,
                finalsMvpPid: seasonAward('Finals MVP')?.pid as string | undefined,
                roty: seasonAward('ROY')?.name,
                rotyPid: seasonAward('ROY')?.pid as string | undefined,
                dpoy: seasonAward('DPOY')?.name,
                dpoyPid: seasonAward('DPOY')?.pid as string | undefined,
              };
              return {
                seasonHistory: [
                  ...(stateWithSim.seasonHistory ?? []).filter(e => e.year !== yearSnap),
                  newEntry,
                ],
              };
            })()
          : {}),
      };
      daysComplete += batchDays;

      // Advance past the last simulated day so the next batch starts fresh,
      // but only if we haven't reached the target yet
      const currentNormAfterSim = normalizeDate(state.date);
      console.log(`[LAZY_SIM] 📍 iter ${iterNum} — post-batch: state.date=${state.date}, currentNormAfterSim=${currentNormAfterSim}, daysComplete=${daysComplete}`);
      if (currentNormAfterSim >= targetNorm) {
        // We've simmed the target day — exit the loop
        console.log(`[LAZY_SIM] 🏁 iter ${iterNum} — currentNormAfterSim >= targetNorm, breaking (target reached)`);
        break;
      }
      state = advanceDateByOne(state);
      console.log(`[LAZY_SIM] ⏭️ iter ${iterNum} — advanceDateByOne → state.date=${state.date}, state.day=${state.day}`);

      currentPhase = getPhaseLabel(normalizeDate(state.date), state.leagueStats.year);
      report();

      // Yield to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Fire any remaining events that should have fired before target but were missed
    const finalSeasonYear = state.leagueStats.year;
    for (const event of buildAutoResolveEvents(finalSeasonYear, state.leagueStats)) {
      const compositeKey = `${finalSeasonYear}:${event.key}`;
      if (!firedEvents.has(compositeKey) && event.date < targetNorm) {
        try {
          const patch = await event.resolver(state);
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
          }
        } catch (err) {
          console.warn(`Auto-resolver ${event.key} (post-loop) failed:`, err);
        }
        firedEvents.add(compositeKey);
      }
    }
  } finally {
    setAssistantGMActive(false);
    window.removeEventListener('beforeunload', restoreOnUnload);
    SettingsManager.saveSettings(originalSettings);
  }

  report({ percentComplete: 100, currentPhase: 'Done!', daysComplete: daysTotal });

  console.log('[LAZY_SIM] 🎯 DONE', {
    finalStateDate: state.date,
    finalNorm: normalizeDate(state.date),
    finalDay: state.day,
    targetNorm,
    reachedTarget: normalizeDate(state.date) === targetNorm,
    lastBatchCount: lastBatchSimResults.length,
  });

  return { state, lastSimResults: lastBatchSimResults };
};
