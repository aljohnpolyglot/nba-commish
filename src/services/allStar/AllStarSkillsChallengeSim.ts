import { NBAPlayer } from '../../types';

export interface SkillsChallengeEntry {
  playerId: string;
  playerName: string;
  round1Time: number;
  finalTime: number | null;
  isWinner: boolean;
}

export interface SkillsChallengeStationAttempt {
  attempt: number;
  made: boolean;
  durationSec: number;
}

export interface SkillsChallengeStationRun {
  stationIndex: number;
  stationType: 'START' | 'DRIBBLE_OUT' | 'PASS_TARGET' | 'LAYUP' | 'DRIBBLE_BACK' | 'FINAL_SHOT';
  stationLabel: string;
  moveTimeSec: number;
  actionTimeSec: number;
  timeSec: number;
  attempts: SkillsChallengeStationAttempt[];
}

export interface SkillsChallengeRunLog {
  playerId: string;
  playerName: string;
  round: 1 | 2;
  timeSec: number;
  stations: SkillsChallengeStationRun[];
}

export interface SkillsChallengeResult {
  contestants: SkillsChallengeEntry[];
  winnerId: string;
  winnerName: string;
  log: string[];
  runs?: SkillsChallengeRunLog[];
}

type SkillsRatingKey = 'spd' | 'tp' | 'pss' | 'drb' | 'ins' | 'oiq';

const ratingOf = (p: NBAPlayer, key: SkillsRatingKey): number => {
  const r = p.ratings?.[p.ratings.length - 1] as any;
  return (r?.[key] ?? 50);
};

const skillScore = (p: NBAPlayer): number =>
  // Obstacle course rewards speed, dribbling, passing, mid-range/3PT shooting equally.
  (ratingOf(p, 'spd') + ratingOf(p, 'drb') + ratingOf(p, 'pss') + ratingOf(p, 'tp')) / 4;

const skillsInviteScore = (p: NBAPlayer): number => {
  const age = (p as any).age ?? 27;
  const youngBoost = age <= 22 ? 10 : age <= 25 ? 7 : age <= 28 ? 3 : age >= 33 ? -4 : 0;
  return skillScore(p) + youngBoost;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const STATIONS: Array<{
  type: SkillsChallengeStationRun['stationType'];
  label: string;
  stat: SkillsRatingKey;
  weight: number;
}> = [
  { type: 'START', label: 'Start', stat: 'spd', weight: 0.03 },
  { type: 'DRIBBLE_OUT', label: 'Agility Weave', stat: 'drb', weight: 0.23 },
  { type: 'PASS_TARGET', label: 'Chest Pass', stat: 'pss', weight: 0.09 },
  { type: 'LAYUP', label: 'Fastbreak Layup', stat: 'ins', weight: 0.16 },
  { type: 'DRIBBLE_BACK', label: 'Speed Weave', stat: 'drb', weight: 0.23 },
  { type: 'PASS_TARGET', label: 'Bounce Pass', stat: 'pss', weight: 0.09 },
  { type: 'FINAL_SHOT', label: 'Final Jumper', stat: 'tp', weight: 0.17 },
];

const stationMakeProbability = (player: NBAPlayer, station: (typeof STATIONS)[number]) => {
  const rating = ratingOf(player, station.stat);
  if (station.type === 'PASS_TARGET') return clamp(0.48 + (rating - 50) * 0.006, 0.34, 0.88);
  if (station.type === 'LAYUP') return clamp(0.68 + (rating - 50) * 0.005, 0.45, 0.96);
  if (station.type === 'FINAL_SHOT') return clamp(0.36 + (rating - 50) * 0.006 + (ratingOf(player, 'oiq') - 50) * 0.001, 0.24, 0.82);
  return 1;
};

const stationMoveRatio = (type: SkillsChallengeStationRun['stationType']) => {
  if (type === 'DRIBBLE_OUT' || type === 'DRIBBLE_BACK') return 0.88;
  if (type === 'START') return 0.05;
  if (type === 'PASS_TARGET') return 0.2;
  return 0.58;
};

const simulateRun = (player: NBAPlayer, round: 1 | 2): SkillsChallengeRunLog => {
  const skill = skillScore(player);
  const speed = ratingOf(player, 'spd');
  const rawStations = STATIONS.map((station, stationIndex) => {
    const probability = stationMakeProbability(player, station);
    const maxAttempts = station.type === 'PASS_TARGET' ? 5 : station.type === 'LAYUP' ? 4 : station.type === 'FINAL_SHOT' ? 6 : 1;
    const attempts: SkillsChallengeStationAttempt[] = [];
    let made = false;
    while (!made && attempts.length < maxAttempts) {
      made = Math.random() < probability || attempts.length === maxAttempts - 1;
      attempts.push({ attempt: attempts.length + 1, made, durationSec: 0 });
    }

    const misses = attempts.filter(attempt => !attempt.made).length;
    const moveBase = station.type === 'DRIBBLE_OUT'
      ? 6.1
      : station.type === 'DRIBBLE_BACK'
        ? 6.4
        : station.type === 'LAYUP'
          ? 2.1
          : station.type === 'FINAL_SHOT'
            ? 1.9
            : station.type === 'PASS_TARGET'
              ? 0.7
              : 0.35;
    const moveRaw = Math.max(0.2, moveBase - speed * 0.022);
    const actionRaw = station.type === 'START' || station.type === 'DRIBBLE_OUT' || station.type === 'DRIBBLE_BACK'
      ? 0.2 + misses * 0.6
      : attempts.length * (station.type === 'FINAL_SHOT' ? 1.1 : 0.85) + misses * (station.type === 'FINAL_SHOT' ? 2.2 : 1.7);
    return { station, stationIndex, attempts, misses, moveRaw, actionRaw };
  });

  const misses = rawStations.reduce((sum, station) => sum + station.misses, 0);
  const base = 38 - (skill - 50) * 0.25;
  const noise = 0.92 + Math.random() * 0.18;
  const targetTime = Math.round(Math.max(24, base * noise + misses * 1.65) * 10) / 10;
  const rawTotal = rawStations.reduce((sum, station) => sum + station.moveRaw + station.actionRaw, 0);
  const fallbackScale = rawTotal > 0 ? targetTime / rawTotal : 1;

  let accumulated = 0;
  const stations = rawStations.map((raw, index): SkillsChallengeStationRun => {
    const isLast = index === rawStations.length - 1;
    const scaledTotal = isLast ? targetTime - accumulated : (raw.moveRaw + raw.actionRaw) * fallbackScale;
    const moveRatio = stationMoveRatio(raw.station.type);
    const moveTimeSec = Number((scaledTotal * moveRatio).toFixed(3));
    const actionTimeSec = Number(Math.max(0.1, scaledTotal - moveTimeSec).toFixed(3));
    const attemptDuration = Number((actionTimeSec / Math.max(1, raw.attempts.length)).toFixed(3));
    const attempts = raw.attempts.map(attempt => ({ ...attempt, durationSec: attemptDuration }));
    const timeSec = Number((moveTimeSec + actionTimeSec).toFixed(3));
    accumulated += timeSec;
    return {
      stationIndex: raw.stationIndex,
      stationType: raw.station.type,
      stationLabel: raw.station.label,
      moveTimeSec,
      actionTimeSec,
      timeSec,
      attempts,
    };
  });

  const delta = Number((targetTime - stations.reduce((sum, station) => sum + station.timeSec, 0)).toFixed(3));
  if (Math.abs(delta) > 0 && stations.length > 0) {
    const last = stations[stations.length - 1];
    last.actionTimeSec = Number((last.actionTimeSec + delta).toFixed(3));
    last.timeSec = Number((last.moveTimeSec + last.actionTimeSec).toFixed(3));
    const perAttempt = Number((last.actionTimeSec / Math.max(1, last.attempts.length)).toFixed(3));
    last.attempts = last.attempts.map(attempt => ({ ...attempt, durationSec: perAttempt }));
  }

  return {
    playerId: player.internalId,
    playerName: player.name,
    round,
    timeSec: targetTime,
    stations,
  };
};

export class AllStarSkillsChallengeSim {
  static selectContestants(players: NBAPlayer[], season: number, totalPlayers: number): NBAPlayer[] {
    const ineligibleStatuses = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
    const eligible = players.filter(p =>
      p.tid >= 0 &&
      p.tid < 100 &&
      !ineligibleStatuses.has(p.status ?? '') &&
      p.stats?.some(s => s.season === season && !s.playoffs && (s.gp ?? 0) > 0)
    );
    return eligible.sort((a, b) => skillsInviteScore(b) - skillsInviteScore(a)).slice(0, totalPlayers);
  }

  static simulate(contestants: NBAPlayer[]): SkillsChallengeResult {
    const log: string[] = ['Welcome to the Skills Challenge!', '--- ROUND 1 ---'];
    const runs: SkillsChallengeRunLog[] = [];

    const round1: SkillsChallengeEntry[] = contestants.map(p => {
      const run = simulateRun(p, 1);
      runs.push(run);
      log.push(`${p.name} finishes the course in ${run.timeSec}s.`);
      return { playerId: p.internalId, playerName: p.name, round1Time: run.timeSec, finalTime: null, isWinner: false };
    });

    // Top 2 advance to head-to-head final.
    const finalists = [...round1].sort((a, b) => a.round1Time - b.round1Time).slice(0, 2);
    log.push(`--- FINAL: ${finalists.map(f => f.playerName).join(' vs ')} ---`);

    const finalEntries = finalists.map(f => {
      const player = contestants.find(p => p.internalId === f.playerId)!;
      const run = simulateRun(player, 2);
      runs.push(run);
      log.push(`${f.playerName} runs the final in ${run.timeSec}s.`);
      return { ...f, finalTime: run.timeSec };
    });

    finalEntries.sort((a, b) => (a.finalTime ?? 99) - (b.finalTime ?? 99));
    const winner = finalEntries[0];
    log.push(`${winner.playerName} wins the Skills Challenge with a final time of ${winner.finalTime}s!`);

    // Merge final results back into round1 entries.
    const merged = round1.map(r => {
      const fe = finalEntries.find(f => f.playerId === r.playerId);
      if (!fe) return r;
      return { ...r, finalTime: fe.finalTime, isWinner: fe.playerId === winner.playerId };
    });

    return { contestants: merged, winnerId: winner.playerId, winnerName: winner.playerName, log, runs };
  }
}
