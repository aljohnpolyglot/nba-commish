import { GameState, LazySimProgress, HistoricalStatPoint } from '../../types';
import { runSimulation } from '../../store/logic/turn/simulationHandler';
import { processSimulationResults } from '../../store/logic/turn/postProcessor';
import { calculateNewStats } from '../../store/logic/turn/statUpdater';
import { generatePaychecks } from './financialService';
import { SocialEngine } from '../social/SocialEngine';
import { SettingsManager } from '../SettingsManager';
import { normalizeDate, calculateSocialEngagement } from '../../utils/helpers';
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
} from './autoResolvers';
import { NewsGenerator } from '../news/NewsGenerator';
import { PlayoffSeries, HistoricalAward, SeasonHistoryEntry } from '../../types';
import { DEFAULT_MEDIA_RIGHTS, attachBroadcastersToGames } from '../../utils/broadcastingUtils';

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
const buildAutoResolveEvents = (y: number): AutoResolveEvent[] => {
  const y1 = y - 1;
  return [
    { date: `${y1}-08-06`, key: 'broadcasting_default',   resolver: autoBroadcastingDefault,         phase: 'Setting Broadcasting Deal...' },
    { date: `${y1}-08-13`, key: 'global_games',           resolver: autoPickGlobalGames,             phase: 'Finalizing Global Schedule...' },
    { date: `${y1}-08-13`, key: 'intl_preseason',         resolver: autoScheduleIntlPreseason,       phase: 'Scheduling International Preseason...' },
    { date: `${y1}-08-14`, key: 'schedule_generation',    resolver: autoGenerateSchedule,            phase: 'Generating Schedule...' },
    { date: `${y1}-12-24`, key: 'christmas_games',        resolver: autoPickChristmasGames,          phase: 'Setting Christmas Games...' },
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
    { date: `${y}-05-14`,  key: 'draft_lottery',          resolver: autoRunLottery,                  phase: 'Running Draft Lottery...' },
    { date: `${y}-06-26`,  key: 'draft_execute',          resolver: autoRunDraft,                    phase: 'Executing NBA Draft...' },
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
  };
  return map[eventKey] ?? null;
};

/** Detect newly-completed playoff series and championship, return news items. */
function generatePlayoffSeriesNews(
  prevPlayoffs: GameState['playoffs'],
  newPlayoffs: GameState['playoffs'],
  teams: GameState['teams'],
  date: string,
  season: number
): import('../../types').NewsItem[] {
  if (!newPlayoffs || !prevPlayoffs) return [];
  const news: import('../../types').NewsItem[] = [];

  for (const series of newPlayoffs.series) {
    const prev = prevPlayoffs.series.find(s => s.id === series.id);
    if (!prev || prev.status === 'complete' || series.status !== 'complete') continue;

    const winner = teams.find(t => t.id === series.winnerId);
    const loser  = teams.find(t => t.id === (series.winnerId === series.higherSeedTid ? series.lowerSeedTid : series.higherSeedTid));
    if (!winner || !loser) continue;

    const totalGames = series.higherSeedWins + series.lowerSeedWins;
    const isChampionship = series.round === 4;

    if (!isChampionship) {
      const winItem = NewsGenerator.generate('playoff_series_win', date, {
        teamName: winner.name, teamCity: winner.region ?? winner.name,
        opponentName: loser.name, gamesCount: totalGames,
      }, winner.logoUrl);
      if (winItem) news.push(winItem);

      const elimItem = NewsGenerator.generate('playoff_elimination', date, {
        teamName: loser.name, teamCity: loser.region ?? loser.name,
        opponentName: winner.name, gamesCount: totalGames,
      }, loser.logoUrl);
      if (elimItem) news.push(elimItem);
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
      const champItem = NewsGenerator.generate('nba_champion', date, {
        teamName: champTeam.name, teamCity: champTeam.region ?? champTeam.name,
        opponentName: loserTeam?.name ?? 'their opponent',
        year: season, gamesCount: totalGames,
      }, champTeam.logoUrl);
      if (champItem) news.push(champItem);

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

export const runLazySim = async (
  initialState: GameState,
  targetDateStr: string,
  onProgress?: (progress: LazySimProgress) => void
): Promise<GameState> => {
  const targetNorm = normalizeDate(targetDateStr);
  const startNorm = normalizeDate(initialState.date);
  const daysTotal = daysBetween(startNorm, targetNorm);

  if (daysTotal <= 0) return initialState;

  // Force LLM off for the entire lazy sim
  const originalSettings = SettingsManager.getSettings();
  SettingsManager.saveSettings({ ...originalSettings, enableLLM: false, gameSpeed: 10 });
  const restoreOnUnload = () => SettingsManager.saveSettings(originalSettings);
  window.addEventListener('beforeunload', restoreOnUnload);

  let state = { ...initialState };
  // Keys are `${seasonYear}:${eventKey}` so events re-fire correctly after season rollover
  const firedEvents = new Set<string>();
  // Pre-seed with all injuries already on players so only NEW injuries generate news
  const reportedInjuries = new Set<string>(
    (initialState.players ?? [])
      .filter(p => p.injury && p.injury.gamesRemaining > 0)
      .map(p => `${p.internalId}-${p.injury!.type}`)
  );
  let daysComplete = 0;
  let currentPhase = 'Starting...';

  const BATCH_SIZE = 7;

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
    while (true) {
      const currentNorm = normalizeDate(state.date);
      if (currentNorm >= targetNorm) break;

      // Fire any auto-resolvers whose date has been reached.
      // Events are keyed by `${seasonYear}:${key}` so they re-fire after season rollover.
      const seasonYear = state.leagueStats.year;
      for (const event of buildAutoResolveEvents(seasonYear)) {
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

      // Determine batch size (don't overshoot target)
      const remaining = daysBetween(currentNorm, targetNorm);
      const batchDays = Math.min(BATCH_SIZE, remaining);
      if (batchDays <= 0) break;

      const { stateWithSim, allSimResults, perDayResults } = runSimulation(state, batchDays, undefined);

      // Accumulate player season stats — normally called in processTurn, bypassed here
      const { updatedPlayers, updatedDraftPicks } = processSimulationResults(
        allSimResults,
        stateWithSim.players,
        stateWithSim.draftPicks,
        stateWithSim.schedule,
        stateWithSim.leagueStats?.year
      );

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

      // Generate social posts for the batch — player reactions, media posts, Shams injuries
      const nbaPlayers = updatedPlayers.filter(p => !['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa'].includes(p.status || ''));
      const socialEngine = new SocialEngine();
      const batchDateString = stateWithSim.date;
      const enginePosts = await socialEngine.generateDailyPosts(allSimResults, nbaPlayers, stateWithSim.teams, batchDateString, batchDays, stateWithSim.playoffs, stateWithSim.schedule);

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

      // Playoff series news — detect series completions & championship this batch
      const playoffSeriesNews = generatePlayoffSeriesNews(
        state.playoffs,
        stateWithSim.playoffs,
        stateWithSim.teams,
        stateWithSim.date,
        state.leagueStats.year
      );

      // Store championship in historicalAwards (Finals MVP determined by top playoff scorer on champ team)
      let champHistoricalAwards: HistoricalAward[] = [];
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

        // Finals MVP: highest gameScore among champ players in this batch's playoff games
        const champStats = allSimResults
          .filter(r => r.homeTeamId === champTid || r.awayTeamId === champTid)
          .flatMap(r => r.homeTeamId === champTid ? r.homeStats : r.awayStats)
          .filter(s => s.gameScore !== undefined);
        if (champStats.length > 0) {
          const mvpStat = champStats.sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0))[0];
          const mvpPlayer = updatedPlayers.find(p => p.internalId === mvpStat.playerId);
          if (mvpPlayer) {
            champHistoricalAwards.push({ season, type: 'Finals MVP', name: mvpPlayer.name, pid: mvpPlayer.internalId, tid: champTid });
            // Also add to player awards
            const updatedWithMvp = updatedPlayers.map(p =>
              p.internalId === mvpPlayer.internalId
                ? { ...p, awards: [...(p.awards ?? []), { season, type: 'Finals MVP' }] }
                : p
            );
            // Patch updatedPlayers (we reassign below when building state)
            Object.assign(updatedPlayers, updatedWithMvp); // mutable patch before state build
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
      const safeSchedule = stateWithSim.schedule.length === 0 && state.schedule.length > 0
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
        historicalAwards: champHistoricalAwards.length > 0
          ? [...(stateWithSim.historicalAwards ?? []), ...champHistoricalAwards]
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
      const currentNormAfterSim = normalizeDate(stateWithSim.date);
      if (currentNormAfterSim < targetNorm) {
        state = advanceDateByOne(state);
      }

      currentPhase = getPhaseLabel(normalizeDate(state.date), state.leagueStats.year);
      report();

      // Yield to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Fire any remaining events that should have fired before target but were missed
    const finalSeasonYear = state.leagueStats.year;
    for (const event of buildAutoResolveEvents(finalSeasonYear)) {
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
    window.removeEventListener('beforeunload', restoreOnUnload);
    SettingsManager.saveSettings(originalSettings);
  }

  report({ percentComplete: 100, currentPhase: 'Done!', daysComplete: daysTotal });

  return state;
};
