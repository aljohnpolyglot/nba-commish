import { GameState, LazySimProgress } from '../../types';
import { runSimulation } from '../../store/logic/turn/simulationHandler';
import { processSimulationResults } from '../../store/logic/turn/postProcessor';
import { SettingsManager } from '../SettingsManager';
import { normalizeDate, calculateSocialEngagement } from '../../utils/helpers';
import { buildShamsPost } from '../social/templates/charania';
import { generateLazySimNews } from '../news/lazySimNewsGenerator';
import { convertTo2KRating } from '../../utils/helpers';
import {
  autoPickChristmasGames,
  autoPickGlobalGames,
  autoSimVotes,
  autoAnnounceStarters,
  autoAnnounceReserves,
  autoSelectDunkContestants,
  autoSelectThreePointContestants,
  autoSimAllStarWeekend,
} from './autoResolvers';

interface AutoResolveEvent {
  date: string;
  key: string;
  resolver: (state: GameState) => Promise<Partial<GameState>> | Partial<GameState>;
  phase: string;
}

const AUTO_RESOLVE_EVENTS: AutoResolveEvent[] = [
  { date: '2025-08-13', key: 'global_games',           resolver: autoPickGlobalGames,            phase: 'Finalizing Global Schedule...' },
  { date: '2025-12-24', key: 'christmas_games',        resolver: autoPickChristmasGames,         phase: 'Setting Christmas Games...' },
  { date: '2026-01-14', key: 'allstar_votes',          resolver: autoSimVotes,                   phase: 'Simulating All-Star Voting...' },
  { date: '2026-01-22', key: 'allstar_starters',       resolver: autoAnnounceStarters,           phase: 'Announcing All-Star Starters...' },
  { date: '2026-01-29', key: 'allstar_reserves',       resolver: autoAnnounceReserves,           phase: 'Announcing Reserves + Rising Stars...' },
  { date: '2026-02-05', key: 'dunk_contestants',       resolver: autoSelectDunkContestants,      phase: 'Selecting Dunk Contest Field...' },
  { date: '2026-02-08', key: 'threepoint_contestants', resolver: autoSelectThreePointContestants, phase: 'Selecting 3-Point Contest Field...' },
  { date: '2026-02-13', key: 'allstar_weekend',        resolver: autoSimAllStarWeekend,          phase: 'Simulating All-Star Weekend...' },
];

const buildAutoNews = (eventKey: string, state: GameState) => {
  const date = state.date;
  const map: Record<string, any> = {
    christmas_games:  { id: `auto-xmas-${Date.now()}`,      headline: 'Christmas Day Games Set',       content: 'The NBA has finalized its Christmas Day slate.',                                     date },
    allstar_starters: { id: `auto-starters-${Date.now()}`,  headline: 'All-Star Starters Announced',   content: 'Fan voting has concluded. The All-Star starters have been revealed.',              date },
    allstar_reserves: { id: `auto-reserves-${Date.now()}`,  headline: 'Full All-Star Rosters Set',     content: 'Coaches have made their picks. The complete All-Star rosters are finalized.',      date },
    allstar_weekend:  { id: `auto-asw-${Date.now()}`,       headline: 'All-Star Weekend Complete',     content: 'The NBA All-Star Weekend has concluded. Check the All-Star tab for results.',      date },
  };
  return map[eventKey] ?? null;
};

const getPhaseLabel = (dateStr: string): string => {
  if (dateStr < '2025-10-24') return 'Preseason...';
  if (dateStr < '2025-12-01') return 'Early Season...';
  if (dateStr < '2025-12-25') return 'NBA Cup & Voting...';
  if (dateStr < '2026-01-22') return 'Mid Season...';
  if (dateStr < '2026-02-12') return 'All-Star Race...';
  if (dateStr < '2026-02-17') return 'All-Star Weekend...';
  if (dateStr < '2026-04-01') return 'Late Season Push...';
  return 'Final Days...';
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
  const firedEvents = new Set<string>();
  const reportedInjuries = new Set<string>();
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

      // Fire any auto-resolvers whose date has been reached
      for (const event of AUTO_RESOLVE_EVENTS) {
        if (!firedEvents.has(event.key) && event.date <= currentNorm) {
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
          firedEvents.add(event.key);
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

      const { stateWithSim, allSimResults } = runSimulation(state, batchDays, undefined);

      // Accumulate player season stats — normally called in processTurn, bypassed here
      const { updatedPlayers, updatedDraftPicks } = processSimulationResults(
        allSimResults,
        stateWithSim.players,
        stateWithSim.draftPicks,
        stateWithSim.schedule
      );

      // Shams injury posts — surface key injuries even during lazy sim
      const shamsInjuryPosts: any[] = [];
      for (const simResult of allSimResults) {
        if (!simResult.injuries?.length) continue;
        for (const injury of simResult.injuries) {
          const player = updatedPlayers.find(p => p.internalId === injury.playerId);
          if (!player || convertTo2KRating(player.overallRating ?? player.ratings?.[0]?.ovr ?? 0, player.hgt ?? 77) < 70) continue;
          const team = stateWithSim.teams.find((t: any) => t.id === (injury.teamId ?? player.tid));
          if (!team) continue;
          const content = buildShamsPost({ player, team, injury: { injuryType: injury.injuryType, gamesRemaining: injury.gamesRemaining }, opponent: null } as any);
          if (!content) continue;
          const engagement = calculateSocialEngagement('@ShamsCharania', content, player.overallRating);
          shamsInjuryPosts.push({
            id: `shams-injury-${injury.playerId}-${Date.now()}-${Math.random()}`,
            author: 'Shams Charania',
            handle: '@ShamsCharania',
            content,
            date: new Date(stateWithSim.date).toISOString(),
            likes: engagement.likes,
            retweets: engagement.retweets,
            source: 'TwitterX' as const,
            isNew: true,
            playerPortraitUrl: player.imgURL,
          });
        }
      }

      // Generate narrative news for this batch (streaks, big games, injuries, drama)
      const batchNews = generateLazySimNews(
        stateWithSim.teams,
        updatedPlayers,
        allSimResults,
        stateWithSim.date,
        reportedInjuries
      );

      state = {
        ...stateWithSim,
        players: updatedPlayers,
        draftPicks: updatedDraftPicks,
        boxScores: [
          ...(stateWithSim.boxScores || []),
          ...allSimResults.map(r => ({ ...r, date: r.date || stateWithSim.date }))
        ],
        socialFeed: shamsInjuryPosts.length > 0
          ? [...shamsInjuryPosts, ...(stateWithSim.socialFeed || [])].slice(0, 500)
          : stateWithSim.socialFeed,
        news: batchNews.length > 0
          ? [...batchNews, ...(stateWithSim.news || [])].slice(0, 200)
          : stateWithSim.news,
      };
      daysComplete += batchDays;

      // Advance past the last simulated day so the next batch starts fresh,
      // but only if we haven't reached the target yet
      const currentNormAfterSim = normalizeDate(stateWithSim.date);
      if (currentNormAfterSim < targetNorm) {
        state = advanceDateByOne(state);
      }

      currentPhase = getPhaseLabel(normalizeDate(state.date));
      report();

      // Yield to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Fire any remaining events that should have fired before target but were missed
    for (const event of AUTO_RESOLVE_EVENTS) {
      if (!firedEvents.has(event.key) && event.date < targetNorm) {
        try {
          const patch = await event.resolver(state);
          if (patch && Object.keys(patch).length > 0) {
            state = { ...state, ...patch };
          }
        } catch (err) {
          console.warn(`Auto-resolver ${event.key} (post-loop) failed:`, err);
        }
        firedEvents.add(event.key);
      }
    }
  } finally {
    window.removeEventListener('beforeunload', restoreOnUnload);
    SettingsManager.saveSettings(originalSettings);
  }

  report({ percentComplete: 100, currentPhase: 'Done!', daysComplete: daysTotal });

  return state;
};
