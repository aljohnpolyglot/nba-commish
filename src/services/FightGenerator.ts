/**
 * FightGenerator — rare in-game altercation system
 *
 * Base probability: ~0.4% per game.
 * Boosted by:
 *   - VOLATILE or DRAMA_MAGNET mood traits on participating players
 *   - Real-player propensity constants (name-matched)
 *   - Close/physical game contexts (high fouls, low-scoring slugfests)
 *
 * Returns a FightResult attached to GameResult.fight when triggered.
 * The description field is injected as an LLM story seed.
 */

import { NBAPlayer, NBATeam } from '../types';
import { FightResult } from './simulation/types';
import { computeMoodScore } from '../utils/mood';

// ─── Real-player propensity map ───────────────────────────────────────────────
// Keys are lowercase name substrings. Value is a multiplier on base fight prob.
// High-drama players: well above 1×. Calm/family-man players: below 1×.

const PLAYER_PROPENSITY: { name: string; mult: number }[] = [
  // Known high-drama / physical players
  { name: 'draymond green',    mult: 8.0 },
  { name: 'ja morant',         mult: 5.0 },
  { name: 'dillon brooks',     mult: 4.5 },
  { name: 'grayson allen',     mult: 4.5 },
  { name: 'nikola jokic',      mult: 3.5 }, // the amir johnson incident
  { name: 'pat beverley',      mult: 4.0 },
  { name: 'marcus smart',      mult: 3.0 },
  { name: 'kevin durant',      mult: 2.5 }, // verbal eruptions
  { name: 'russell westbrook', mult: 2.5 },
  { name: 'dennis schroder',   mult: 2.0 },
  { name: 'matisse thybulle',  mult: 1.8 },
  { name: 'kyle lowry',        mult: 2.0 },
  { name: 'rajon rondo',       mult: 3.0 },
  { name: 'lance stephenson',  mult: 3.5 },
  { name: 'nate robinson',     mult: 2.0 },
  { name: 'zach lavine',       mult: 1.5 },
  // Family men / low-drama players
  { name: 'stephen curry',     mult: 0.1 },
  { name: 'chris paul',        mult: 0.3 }, // instigator but rarely physical
  { name: 'kawhi leonard',     mult: 0.1 },
  { name: 'rudy gobert',       mult: 0.5 },
  { name: 'kemba walker',      mult: 0.1 },
  { name: 'tim duncan',        mult: 0.05 },
  { name: 'pau gasol',         mult: 0.1 },
  { name: 'grant hill',        mult: 0.05 },
];

function getPropensity(name: string): number {
  const lower = name.toLowerCase();
  for (const entry of PLAYER_PROPENSITY) {
    if (lower.includes(entry.name)) return entry.mult;
  }
  return 1.0; // default
}

function traitMult(player: NBAPlayer): number {
  const traits = player.moodTraits ?? [];
  let m = 1.0;
  if (traits.includes('VOLATILE'))     m *= 2.5;
  if (traits.includes('DRAMA_MAGNET')) m *= 2.0;
  if (traits.includes('LOYAL'))        m *= 0.5;
  if (traits.includes('AMBASSADOR'))   m *= 0.3;
  return m;
}

// ─── Scenario descriptions ────────────────────────────────────────────────────

type Severity = 'scuffle' | 'ejection' | 'brawl';

interface FightScenario {
  description: string;
  severity: Severity;
}

const SCUFFLE_SCENARIOS: FightScenario[] = [
  {
    description: '{p1} and {p2} exchanged heated words after a hard foul, needing teammates to separate them before play resumed. Both received technical fouls.',
    severity: 'scuffle',
  },
  {
    description: '{p1} shoved {p2} in the chest after a disputed call, drawing double technical fouls. Both remained in the game but officials issued a stern warning.',
    severity: 'scuffle',
  },
  {
    description: '{p2} got in {p1}\'s face after what appeared to be a flagrant foul. Benches cleared briefly but cooler heads prevailed. No ejections.',
    severity: 'scuffle',
  },
];

const EJECTION_SCENARIOS: FightScenario[] = [
  {
    description: '{p1} threw a punch at {p2} after a hard screen, connecting before teammates intervened. Both players were ejected and the league is expected to review the footage.',
    severity: 'ejection',
  },
  {
    description: '{p1} aggressively confronted {p2} during a dead-ball situation, escalating to shoving that required multiple players and coaches to separate them. {p1} was ejected; {p2} was assessed a technical.',
    severity: 'ejection',
  },
  {
    description: 'A hard foul by {p2} triggered an immediate reaction from {p1}, who charged at the {t2} bench. Officials ejected both players and reviewed the play for suspension consideration.',
    severity: 'ejection',
  },
];

const BRAWL_SCENARIOS: FightScenario[] = [
  {
    description: 'An all-out brawl erupted when {p1} went after {p2} following a flagrant foul. Benches emptied, coaches and security staff were caught in the melee. Three players from each team were ejected. The league office has confirmed a formal investigation is underway.',
    severity: 'brawl',
  },
  {
    description: 'Tensions that had been building all game finally boiled over: {p1} and {p2} squared off at halfcourt, triggering a full bench-clearing incident. The game was delayed 14 minutes. Multiple ejections and suspensions are expected.',
    severity: 'brawl',
  },
];

function pickScenario(roll: number): FightScenario {
  if (roll < 0.55) return SCUFFLE_SCENARIOS[Math.floor(Math.random() * SCUFFLE_SCENARIOS.length)];
  if (roll < 0.87) return EJECTION_SCENARIOS[Math.floor(Math.random() * EJECTION_SCENARIOS.length)];
  return BRAWL_SCENARIOS[Math.floor(Math.random() * BRAWL_SCENARIOS.length)];
}

function fillTemplate(
  template: string,
  p1: NBAPlayer, p1team: NBATeam | undefined,
  p2: NBAPlayer, p2team: NBATeam | undefined,
): string {
  return template
    .replace(/\{p1\}/g, p1.name)
    .replace(/\{p2\}/g, p2.name)
    .replace(/\{t1\}/g, p1team?.name ?? 'his team')
    .replace(/\{t2\}/g, p2team?.name ?? 'his team');
}

// ─── Main generator ───────────────────────────────────────────────────────────

const BASE_PROB = 0.004; // 0.4% per game

/**
 * Should be called once per simulated game with the full player list.
 * homePlayerIds / awayPlayerIds are the internalIds of players who played.
 */
export function generateFight(
  homePlayerIds: string[],
  awayPlayerIds: string[],
  players: NBAPlayer[],
  teams: NBATeam[],
  dateStr: string,
  endorsedPlayers?: string[],
): FightResult | null {
  if (homePlayerIds.length === 0 || awayPlayerIds.length === 0) return null;

  // Build candidate pool from home + away active players
  const lookup = new Map(players.map(p => [p.internalId, p]));

  const homePlayers = homePlayerIds.map(id => lookup.get(id)).filter(Boolean) as NBAPlayer[];
  const awayPlayers = awayPlayerIds.map(id => lookup.get(id)).filter(Boolean) as NBAPlayer[];

  if (homePlayers.length === 0 || awayPlayers.length === 0) return null;

  // Compute per-player combined weight (propensity × trait mult × mood factor)
  function playerWeight(p: NBAPlayer, team: NBATeam | undefined): number {
    const endorsed = endorsedPlayers?.includes(p.internalId) ?? false;
    const { score } = computeMoodScore(p, team, dateStr, endorsed);
    // Mood contribution: disgruntled players are more volatile
    const moodFactor = 1 + Math.max(0, -score) * 0.15;
    return getPropensity(p.name) * traitMult(p) * moodFactor;
  }

  // Pick the most volatile player from each side
  const pickHighest = (pool: NBAPlayer[], team: NBATeam | undefined) =>
    pool.reduce((best, p) => playerWeight(p, team) > playerWeight(best, team) ? p : best, pool[0]);

  // For game-level probability, use the max weight pair across both sides
  let maxPairWeight = 0;
  let bestHome = homePlayers[0];
  let bestAway = awayPlayers[0];

  for (const hp of homePlayers) {
    for (const ap of awayPlayers) {
      const hTeam = teams.find(t => t.id === hp.tid);
      const aTeam = teams.find(t => t.id === ap.tid);
      const pairW = playerWeight(hp, hTeam) * playerWeight(ap, aTeam);
      if (pairW > maxPairWeight) {
        maxPairWeight = pairW;
        bestHome = hp;
        bestAway = ap;
      }
    }
  }

  // Game-level probability: base × geometric mean of the best pair weight
  const gameProbability = BASE_PROB * Math.sqrt(maxPairWeight);
  if (Math.random() > gameProbability) return null;

  // Fight fired — determine severity via second roll
  const severityRoll = Math.random();
  const scenario = pickScenario(severityRoll);

  const homeTeam = teams.find(t => t.id === bestHome.tid);
  const awayTeam = teams.find(t => t.id === bestAway.tid);

  // Randomly decide who's p1 vs p2
  const [p1, t1, p2, t2] = Math.random() < 0.5
    ? [bestHome, homeTeam, bestAway, awayTeam]
    : [bestAway, awayTeam, bestHome, homeTeam];

  return {
    player1Id: p1.internalId,
    player1Name: p1.name,
    player1TeamId: p1.tid,
    player2Id: p2.internalId,
    player2Name: p2.name,
    player2TeamId: p2.tid,
    severity: scenario.severity,
    description: fillTemplate(scenario.description, p1, t1, p2, t2),
  };
}
