import { NBAPlayer, GameState } from '../../types';
import { Player as ThronePlayer, GameSettings, GameStatus, GameState as ThroneGameState } from '../../throne/types/throne';
import { GameSim } from '../../throne/engine/GameSim';
import { convertTo2KRating } from '../../utils/helpers';

const FIELD_SIZE = 16;

const jitter = (mag: number) => (Math.random() * 2 - 1) * mag;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const currentRatings = (p: NBAPlayer): any => {
  const arr = (p.ratings ?? []) as any[];
  return arr[arr.length - 1] ?? {};
};

export function toThronePlayer(p: NBAPlayer, seed: number): ThronePlayer {
  const r = currentRatings(p);
  const [first, ...rest] = (p.name ?? '').split(' ');
  return {
    id: p.internalId,
    name: p.name,
    firstName: first ?? p.name,
    lastName: rest.join(' ') || p.name,
    imgURL: p.imgURL ?? '',
    ovr: p.overallRating,
    pos: p.pos ?? 'F',
    team: String(p.tid),
    seed,
    ratings: {
      tp: r.tp ?? 50, fg: r.fg ?? 50, ins: r.ins ?? 50,
      dnk: r.dnk ?? 50, def: r.diq ?? r.def ?? 50, spd: r.spd ?? 50,
      drb: r.drb ?? 50, blk: r.blk ?? 50, reb: r.reb ?? 50,
      jmp: r.jmp ?? 50, hgt: r.hgt ?? 50,
    },
  };
}

export function buildThroneSettings(state: GameState): GameSettings {
  const ls = state.leagueStats;
  return {
    targetPoints: ls.allStarThroneTargetScore ?? 12,
    winByTwo: true,
    makeItTakeIt: true,
    scoringSystem: ls.allStarThroneScoring === '1s_and_2s' ? '1-2' : '2-3',
    isDoubleElim: false,
  };
}

interface VoteEntry {
  player: NBAPlayer;
  fan: number;
  player_: number;
  media: number;
  coach: number;
  composite: number;
}

function decidesToSignUp(p: NBAPlayer, prizePool: number, isDefendingKing: boolean): boolean {
  if (p.injury && p.injury.gamesRemaining > 0) return false;
  if (p.status && p.status !== 'Active') return false;
  if (p.contract?.amount == null) return false;
  if (isDefendingKing) return true;
  const annualSalary = (p.contract?.amount ?? 0) * 1000;
  const cashMotivated = annualSalary < prizePool * 5;
  const competitive = (p.moodTraits ?? []).includes('competitive' as any);
  const fame = (p as any).fame ?? 50;
  const gloryMotivated = competitive || fame > 70;
  return cashMotivated || gloryMotivated;
}

function oneOnOneSkill(p: NBAPlayer): number {
  const r = currentRatings(p);
  return 0.30 * (r.tp ?? 50)
       + 0.25 * (r.fg ?? 50)
       + 0.20 * (r.drb ?? 50)
       + 0.15 * (r.spd ?? 50)
       + 0.10 * (r.ins ?? 50);
}

function careerAccolades(p: NBAPlayer): number {
  const aw = p.awards ?? [];
  const allStar = aw.filter(a => a.type?.toLowerCase().includes('all-star') && !a.type.toLowerCase().includes('mvp')).length;
  const otherTrophies = aw.filter(a => /mvp|champion|all-league|defensive player|throne/i.test(a.type)).length;
  return allStar * 5 + otherTrophies * 4;
}

function compositeVote(p: NBAPlayer, beltHolderId: string | null): VoteEntry {
  const r = currentRatings(p);
  const fan = convertTo2KRating(p.overallRating, r.hgt ?? 50);
  const player_ = clamp(40 + careerAccolades(p), 0, 100);
  const fame = (p as any).fame ?? 50;
  const storylineBonus = p.internalId === beltHolderId ? 15 : 0;
  const media = clamp(fame + storylineBonus, 0, 100);
  const coach = clamp(oneOnOneSkill(p), 0, 100);

  const fanW = fan * (1 + jitter(0.10));
  const playerW = player_ * (1 + jitter(0.15));
  const mediaW = media * (1 + jitter(0.20));
  const coachW = coach * (1 + jitter(0.05));

  const composite = 0.40 * fanW + 0.30 * playerW + 0.20 * mediaW + 0.10 * coachW;
  return { player: p, fan: Math.round(fan), player_: Math.round(player_), media: Math.round(media), coach: Math.round(coach), composite };
}

export interface SelectionResult {
  fieldPlayerIds: string[];
  titleDefenderId: string | null;
  vacated: boolean;
  voteBreakdown: Record<string, { fan: number; player: number; media: number; coach: number; composite: number; rank: number }>;
}

export function selectThroneField(state: GameState): SelectionResult {
  const ls = state.leagueStats;
  const prizePool = ls.allStarThronePrizePool ?? 5_000_000;
  const beltHolderId = state.allStar?.beltHolderInternalId ?? null;
  const mandatoryDefense = ls.allStarThroneMandatoryDefense !== false;

  const beltHolder = beltHolderId
    ? state.players.find(p => p.internalId === beltHolderId) ?? null
    : null;
  const beltHolderActive = !!beltHolder
    && (!beltHolder.status || beltHolder.status === 'Active')
    && !(beltHolder.injury && beltHolder.injury.gamesRemaining > 0)
    && (beltHolder.contract?.amount ?? 0) > 0;

  const titleDefender = mandatoryDefense && beltHolderActive ? beltHolder : null;
  const vacated = mandatoryDefense && !!beltHolder && !beltHolderActive;

  const candidates = state.players.filter(p =>
    (!p.status || p.status === 'Active')
    && p.internalId !== titleDefender?.internalId
    && decidesToSignUp(p, prizePool, false)
  );

  const votes = candidates.map(p => compositeVote(p, beltHolderId));
  votes.sort((a, b) => b.composite - a.composite);

  const slots = FIELD_SIZE - (titleDefender ? 1 : 0);
  const elected = votes.slice(0, slots);

  const fieldPlayerIds: string[] = [];
  if (titleDefender) fieldPlayerIds.push(titleDefender.internalId);
  fieldPlayerIds.push(...elected.map(e => e.player.internalId));

  const voteBreakdown: SelectionResult['voteBreakdown'] = {};
  if (titleDefender) {
    const td = compositeVote(titleDefender, beltHolderId);
    voteBreakdown[titleDefender.internalId] = {
      fan: td.fan, player: td.player_, media: td.media, coach: td.coach,
      composite: Math.round(td.composite), rank: 1,
    };
  }
  elected.forEach((v, idx) => {
    voteBreakdown[v.player.internalId] = {
      fan: v.fan, player: v.player_, media: v.media, coach: v.coach,
      composite: Math.round(v.composite),
      rank: (titleDefender ? 2 : 1) + idx,
    };
  });

  return { fieldPlayerIds, titleDefenderId: titleDefender?.internalId ?? null, vacated, voteBreakdown };
}

function runMatchSync(p1: ThronePlayer, p2: ThronePlayer, settings: GameSettings): ThroneGameState {
  const firstPossId = Math.random() < 0.5 ? p1.id : p2.id;
  const sim = new GameSim(p1, p2, firstPossId, settings);
  let safety = 0;
  while (sim.getState().status !== GameStatus.FINISHED && safety++ < 2000) {
    sim.nextPossession();
  }
  return sim.getState();
}

interface BracketMatch {
  round: number;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  score1: number;
  score2: number;
  pd: number;
}

function pickAndPlayRound(
  round: number,
  survivors: ThronePlayer[],
  cumulativePDs: Record<string, number>,
  settings: GameSettings,
): { matches: BracketMatch[]; winners: ThronePlayer[] } {
  // Reseed by cumulative PD
  const ranked = [...survivors].sort((a, b) =>
    (cumulativePDs[b.id] ?? 0) - (cumulativePDs[a.id] ?? 0)
  );
  const half = Math.floor(ranked.length / 2);
  const topHalf = ranked.slice(0, half);
  const bottomPool = ranked.slice(half);

  const matches: BracketMatch[] = [];
  const winners: ThronePlayer[] = [];

  for (const seed of topHalf) {
    if (bottomPool.length === 0) break;
    // AI greedy: pick weakest remaining (lowest cumulative PD; tiebreak by lower ovr)
    bottomPool.sort((a, b) =>
      (cumulativePDs[a.id] ?? 0) - (cumulativePDs[b.id] ?? 0) || a.ovr - b.ovr
    );
    const opp = bottomPool.shift()!;
    const result = runMatchSync(seed, opp, settings);
    const winner = result.winner ?? (result.score1 >= result.score2 ? seed : opp);
    const loser = winner.id === seed.id ? opp : seed;
    const wScore = winner.id === result.player1.id ? result.score1 : result.score2;
    const lScore = winner.id === result.player1.id ? result.score2 : result.score1;
    const pd = wScore - lScore;
    cumulativePDs[winner.id] = (cumulativePDs[winner.id] ?? 0) + pd;
    cumulativePDs[loser.id] = (cumulativePDs[loser.id] ?? 0) - pd;
    winners.push(winner);
    matches.push({
      round,
      player1Id: seed.id,
      player2Id: opp.id,
      winnerId: winner.id,
      score1: seed.id === result.player1.id ? result.score1 : result.score2,
      score2: opp.id === result.player1.id ? result.score1 : result.score2,
      pd,
    });
  }

  return { matches, winners };
}

function runFinal(
  p1: ThronePlayer,
  p2: ThronePlayer,
  cumulativePDs: Record<string, number>,
  settings: GameSettings,
): { match: BracketMatch; winner: ThronePlayer } {
  const result = runMatchSync(p1, p2, settings);
  const winner = result.winner ?? (result.score1 >= result.score2 ? p1 : p2);
  const loser = winner.id === p1.id ? p2 : p1;
  const wScore = winner.id === result.player1.id ? result.score1 : result.score2;
  const lScore = winner.id === result.player1.id ? result.score2 : result.score1;
  const pd = wScore - lScore;
  cumulativePDs[winner.id] = (cumulativePDs[winner.id] ?? 0) + pd;
  cumulativePDs[loser.id] = (cumulativePDs[loser.id] ?? 0) - pd;
  return {
    match: {
      round: 4,
      player1Id: p1.id,
      player2Id: p2.id,
      winnerId: winner.id,
      score1: p1.id === result.player1.id ? result.score1 : result.score2,
      score2: p2.id === result.player1.id ? result.score1 : result.score2,
      pd,
    },
    winner,
  };
}

export function simulateThroneTournament(state: GameState): Partial<GameState> {
  const allStar = state.allStar;
  if (!allStar) return {};

  const existing = (allStar as any).throne;
  if (existing?.complete) {
    return { allStar: { ...allStar } };
  }

  const settings = buildThroneSettings(state);

  let fieldPlayerIds = (allStar as any).throneFieldPlayerIds as string[] | undefined;
  let titleDefenderId = (allStar as any).throne?.titleDefenderId ?? null;
  let voteBreakdown = (allStar as any).throne?.voteBreakdown ?? {};

  if (!fieldPlayerIds || fieldPlayerIds.length < FIELD_SIZE) {
    const sel = selectThroneField(state);
    fieldPlayerIds = sel.fieldPlayerIds;
    titleDefenderId = sel.titleDefenderId;
    voteBreakdown = sel.voteBreakdown;
  }

  const fieldPlayers = fieldPlayerIds
    .map((id, idx) => {
      const np = state.players.find(p => p.internalId === id);
      return np ? toThronePlayer(np, idx + 1) : null;
    })
    .filter((p): p is ThronePlayer => p !== null);

  if (fieldPlayers.length < 2) {
    return { allStar: { ...allStar, throne: { complete: true, fieldPlayerIds: [], bracket: [], cumulativePDs: {}, champion: null } } };
  }

  const cumulativePDs: Record<string, number> = {};
  fieldPlayers.forEach(p => { cumulativePDs[p.id] = 0; });

  const allMatches: BracketMatch[] = [];
  let survivors = fieldPlayers;
  let round = 1;

  while (survivors.length > 2) {
    const { matches, winners } = pickAndPlayRound(round, survivors, cumulativePDs, settings);
    allMatches.push(...matches);
    survivors = winners;
    round++;
  }

  let champion: ThronePlayer | null = null;
  if (survivors.length === 2) {
    const f = runFinal(survivors[0], survivors[1], cumulativePDs, settings);
    allMatches.push(f.match);
    champion = f.winner;
  } else if (survivors.length === 1) {
    champion = survivors[0];
  }

  return {
    allStar: {
      ...allStar,
      throne: {
        complete: true,
        fieldPlayerIds,
        titleDefenderId,
        voteBreakdown,
        bracket: allMatches,
        cumulativePDs,
        champion: champion
          ? { playerId: champion.id, playerName: champion.name }
          : null,
      },
    } as any,
  };
}

// ──────────────────────────────────────────────────────────────
//  PHASE 1 — Sign-up era (Dec 1 → Jan 15)
//  Pre-roll the full "yes" pool on Dec 1, then assign each player
//  a random sign-up date inside the 45-day window. UI filters by
//  date <= currentDate to show the rolling counter.
// ──────────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dayDiff(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function initThroneSignups(
  state: GameState,
  signupOpens: Date,
  signupCloses: Date,
): Partial<GameState> {
  const allStar = state.allStar;
  if (!allStar) return {};
  if ((allStar as any).throneSignupSchedule) return {}; // already initialized

  const ls = state.leagueStats;
  const prizePool = ls.allStarThronePrizePool ?? 5_000_000;
  const beltHolderId = (allStar as any).beltHolderInternalId ?? null;

  const eligible = state.players.filter(p =>
    (!p.status || p.status === 'Active') && decidesToSignUp(p, prizePool, p.internalId === beltHolderId)
  );

  const totalDays = Math.max(1, dayDiff(signupOpens, signupCloses));
  const schedule: Array<{ playerId: string; date: string }> = eligible.map(p => {
    // Bias: defending king signs Day 1; superstars (high fame) tend to declare later (peer pressure);
    // mid-tier guys early to stake a claim. Use fame as a soft skew.
    const fame = (p as any).fame ?? 50;
    const isKing = p.internalId === beltHolderId;
    const skew = isKing ? 0 : Math.min(1, Math.max(0, (fame - 30) / 80)); // 0..1, late if famous
    const base = Math.random();
    const blended = base * 0.5 + skew * 0.5;
    const dayOffset = Math.floor(blended * totalDays);
    const d = new Date(signupOpens);
    d.setUTCDate(signupOpens.getUTCDate() + dayOffset);
    return { playerId: p.internalId, date: isoDay(d) };
  });

  return {
    allStar: {
      ...allStar,
      throneSignupSchedule: schedule,
      throneSignupComplete: false,
    } as any,
  };
}

export function closeThroneSignups(state: GameState): Partial<GameState> {
  const allStar = state.allStar;
  if (!allStar) return {};
  if ((allStar as any).throneSignupComplete) return {};
  return { allStar: { ...allStar, throneSignupComplete: true } as any };
}

// ──────────────────────────────────────────────────────────────
//  PHASE 2 — Voting era (Jan 16 → Jan 30)
//  Pre-decide final composite; each daily tick blends from 0 →
//  final by progress fraction. Tiny per-tick jitter so the
//  leaderboard moves day-to-day.
// ──────────────────────────────────────────────────────────────

export function tickThroneVoting(
  state: GameState,
  currentDate: Date,
  votingOpens: Date,
  fieldReveal: Date,
): Partial<GameState> {
  const allStar = state.allStar;
  if (!allStar) return {};
  if ((allStar as any).throneAnnounced) return {};

  const sched = (allStar as any).throneSignupSchedule as Array<{ playerId: string; date: string }> | undefined;
  if (!sched) return {};

  const beltHolderId = (allStar as any).beltHolderInternalId ?? null;
  const signupIds = sched.map(s => s.playerId);
  const candidates = state.players.filter(p => signupIds.includes(p.internalId));

  // Compute the FINAL composite once per tick (deterministic-ish per day).
  // Single-pass votes for everyone who signed up.
  const allVotes = candidates.map(p => compositeVote(p, beltHolderId));
  allVotes.sort((a, b) => b.composite - a.composite);

  const totalDays = Math.max(1, dayDiff(votingOpens, fieldReveal));
  const elapsed = Math.max(0, dayDiff(votingOpens, currentDate));
  const progress = Math.min(1, elapsed / totalDays);

  const tally: Record<string, { fan: number; player: number; media: number; coach: number; composite: number; rank: number }> = {};
  allVotes.forEach((v, idx) => {
    // Daily jitter so the live tally has movement. Smaller as we approach the close.
    const dailyJitter = (1 - progress) * 0.06;
    const jit = 1 + (Math.random() * 2 - 1) * dailyJitter;
    tally[v.player.internalId] = {
      fan: Math.round(v.fan * progress * jit),
      player: Math.round(v.player_ * progress * jit),
      media: Math.round(v.media * progress * jit),
      coach: Math.round(v.coach * progress * jit),
      composite: Math.round(v.composite * progress * jit),
      rank: idx + 1,
    };
  });

  return {
    allStar: {
      ...allStar,
      throneVoteTally: tally,
      throneVotingProgress: progress,
    } as any,
  };
}

// ──────────────────────────────────────────────────────────────
//  PHASE 3 — Field reveal (Jan 30)
//  Lock the top 16 (with mandatory title defense applied).
// ──────────────────────────────────────────────────────────────

export function lockThroneField(state: GameState): Partial<GameState> {
  const allStar = state.allStar;
  if (!allStar) return {};
  if ((allStar as any).throneAnnounced) return {};

  const sel = selectThroneField(state);
  return {
    allStar: {
      ...allStar,
      throneAnnounced: true,
      throneVacated: sel.vacated,
      throneVotingProgress: 1,
      throne: {
        complete: false,
        fieldPlayerIds: sel.fieldPlayerIds,
        titleDefenderId: sel.titleDefenderId,
        voteBreakdown: sel.voteBreakdown,
        bracket: [],
        cumulativePDs: {},
        champion: null,
      },
    } as any,
  };
}

/** @deprecated Pre-lifecycle helper. Use lockThroneField instead. */
export const announceThroneField = lockThroneField;
