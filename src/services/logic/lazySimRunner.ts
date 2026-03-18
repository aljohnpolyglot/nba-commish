import { GameState, LazySimProgress } from '../../types';
import { runSimulation } from '../../store/logic/turn/simulationHandler';
import { SettingsManager } from '../SettingsManager';
import { normalizeDate } from '../../utils/helpers';
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

  let state = { ...initialState };
  const firedEvents = new Set<string>();
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
        }
      }

      // Determine batch size (don't overshoot target)
      const remaining = daysBetween(currentNorm, targetNorm);
      const batchDays = Math.min(BATCH_SIZE, remaining);
      if (batchDays <= 0) break;

      const { stateWithSim } = runSimulation(state, batchDays, undefined);
      state = stateWithSim;
      daysComplete += batchDays;

      // Advance past the last simulated day so the next batch starts fresh
      state = advanceDateByOne(state);

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
    SettingsManager.saveSettings(originalSettings);
  }

  report({ percentComplete: 100, currentPhase: 'Done!', daysComplete: daysTotal });

  return state;
};
