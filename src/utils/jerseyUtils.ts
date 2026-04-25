import type { HistoryEntry, NBAPlayer, NBATeam } from '../types';
import { deriveLeagueStartYearFromHistory, getReservedJerseyNumbersByTeam } from '../services/playerDevelopment/jerseyRetirementChecker';

// Jersey number frequency weights derived from ZenGM's genJerseyNumber.ts
// (based on actual NBA historical usage). Numbers with 0 historical usage are omitted.
const JERSEY_WEIGHTS: Record<string, number> = {
  '00': 29, '0': 68, '1': 199, '2': 176, '3': 283, '4': 263, '5': 298, '6': 210,
  '7': 284, '8': 224, '9': 233, '10': 279, '11': 341, '12': 380, '13': 173, '14': 301,
  '15': 304, '16': 108, '17': 145, '18': 120, '19': 87, '20': 305, '21': 274, '22': 282,
  '23': 214, '24': 240, '25': 201, '26': 45, '27': 48, '28': 32, '29': 26, '30': 205,
  '31': 168, '32': 209, '33': 224, '34': 210, '35': 166, '36': 17, '37': 4, '38': 8,
  '39': 4, '40': 162, '41': 100, '42': 158, '43': 99, '44': 209, '45': 106, '46': 4,
  '47': 5, '48': 2, '49': 2, '50': 114, '51': 39, '52': 80, '53': 29, '54': 81, '55': 90,
  '56': 3, '57': 1, '60': 2, '61': 2, '62': 2, '63': 1, '65': 1, '66': 3, '67': 1,
  '68': 1, '70': 7, '71': 3, '72': 1, '73': 1, '77': 10, '83': 1, '84': 1, '85': 1,
  '86': 2, '88': 5, '89': 2, '90': 2, '91': 2, '92': 2, '93': 2, '94': 1, '96': 2,
  '98': 3, '99': 6,
};

const ALL_NUMS = Object.keys(JERSEY_WEIGHTS);
const TOTAL_WEIGHT = ALL_NUMS.reduce((s, n) => s + JERSEY_WEIGHTS[n], 0);

/**
 * Pick a jersey number using NBA historical frequency weights.
 * @param excluded  Numbers to skip (retired jerseys + current teammates).
 * @param rng       Optional seeded RNG; defaults to Math.random.
 */
export function pickJerseyNumber(
  excluded: Set<string> = new Set(),
  rng: () => number = Math.random,
): string {
  const available = ALL_NUMS.filter(n => !excluded.has(n));
  if (available.length === 0) {
    // All weighted numbers taken — fall back to 0-99 brute-force
    for (let attempt = 0; attempt < 200; attempt++) {
      const n = String(Math.floor(rng() * 100));
      if (!excluded.has(n)) return n;
    }
    return '0';
  }
  const total = available.reduce((s, n) => s + JERSEY_WEIGHTS[n], 0);
  let roll = rng() * total;
  for (const n of available) {
    roll -= JERSEY_WEIGHTS[n];
    if (roll <= 0) return n;
  }
  return available[0];
}

export function normalizeTeamJerseyNumbers(
  players: NBAPlayer[],
  teams: NBATeam[],
  year: number,
  opts: {
    history?: Array<string | HistoryEntry>;
    leagueStartYear?: number;
    targetTeamIds?: Iterable<number>;
  } = {},
): NBAPlayer[] {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const targetTeamIds = opts.targetTeamIds
    ? new Set(Array.from(opts.targetTeamIds))
    : new Set(teams.map(t => t.id));
  const leagueStartYear = opts.leagueStartYear ?? deriveLeagueStartYearFromHistory(opts.history, year);
  const reservedByTeam = getReservedJerseyNumbersByTeam(players, teams, year, { leagueStartYear });

  const unavailableByTeam = new Map<number, Set<string>>();
  for (const tid of targetTeamIds) {
    const team = teamMap.get(tid);
    if (!team) continue;
    const retired = new Set<string>(((team as any).retiredJerseyNumbers ?? []).map((j: any) => String(j.number)));
    const reserved = reservedByTeam.get(tid) ?? new Set<string>();
    unavailableByTeam.set(tid, new Set([...retired, ...reserved]));
  }

  const usedByTeam = new Map<number, Set<string>>();
  return players.map(player => {
    const tid = Number((player as any).tid);
    if (!targetTeamIds.has(tid) || tid < 0) return player;
    if ((player as any).status === 'Retired') return player;

    const unavailable = unavailableByTeam.get(tid) ?? new Set<string>();
    if (!usedByTeam.has(tid)) usedByTeam.set(tid, new Set());
    const used = usedByTeam.get(tid)!;

    const current = player.jerseyNumber != null && player.jerseyNumber !== '' ? String(player.jerseyNumber) : '';
    if (current && !unavailable.has(current) && !used.has(current)) {
      used.add(current);
      return player;
    }

    const next = pickJerseyNumber(new Set([...unavailable, ...used]));
    used.add(next);
    return next === current ? player : { ...player, jerseyNumber: next };
  });
}

// Pre-compute total for convenience (used by genDraftPlayers when no exclusions needed)
export { TOTAL_WEIGHT };
