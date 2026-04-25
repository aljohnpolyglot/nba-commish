/**
 * jerseyRetirementChecker.ts
 *
 * Franchise jersey retirement logic — called at season rollover after HOF checks.
 *
 * Real-world inspired timing:
 *  - Automatic franchise icons: 1-2 years after retirement
 *  - Clear title-core / HOF-level franchise legends: 3-5 years
 *  - Long-tenured stars: 6-10 years
 *  - Nostalgia / late honors: 11-20 years
 */

import type { HistoryEntry, NBAPlayer, NBATeam, RetiredJerseyRecord } from '../../types';

export type JerseyRetirementTier = RetiredJerseyRecord['tier'];
export type JerseyRetirementReason = RetiredJerseyRecord['reason'];

export interface JerseyRetirementRecord {
  playerId: string;
  name: string;
  number: string;
  teamId: number;
  teamName: string;
  seasonRetired: number;
  retiredYear: number;
  score: number;
  tier: JerseyRetirementTier;
  reason: JerseyRetirementReason;
  seasonsWithTeam: number;
  gamesWithTeam: number;
  allStarAppearances: number;
  championships: number;
}

export interface JerseyRetirementDebugRow {
  playerId: string;
  name: string;
  status: string;
  retiredYear?: number;
  teamId: number;
  teamName: string;
  number?: string;
  score?: number;
  scheduledYear?: number;
  seasonsWithTeam?: number;
  gamesWithTeam?: number;
  allStarAppearances?: number;
  championships?: number;
  tier?: JerseyRetirementTier;
  reason?: JerseyRetirementReason;
  outcome: 'candidate' | 'new_retirement' | 'skip_pre_save_retiree' | 'skip_existing' | 'skip_number_taken' | 'skip_not_due' | 'skip_not_qualified' | 'skip_missing_number';
}

interface TeamLegacyCase {
  player: NBAPlayer;
  team: NBATeam;
  number: string;
  score: number;
  tier: JerseyRetirementTier;
  reason: JerseyRetirementReason;
  delayYears: number;
  scheduledYear: number;
  seasonsWithTeam: number;
  gamesWithTeam: number;
  allStarAppearances: number;
  championships: number;
}

interface JerseyRetirementOptions {
  leagueStartYear?: number;
}

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function countAward(player: NBAPlayer, type: string, seasons: Set<number>): number {
  return (player.awards ?? []).filter(a => a.type === type && seasons.has(Number(a.season))).length;
}

function countAwardIncludes(player: NBAPlayer, needle: string, seasons: Set<number>): number {
  return (player.awards ?? []).filter(a => a.type.includes(needle) && seasons.has(Number(a.season))).length;
}

function getTeamDisplayName(team: NBATeam): string {
  const name = String(team.name ?? '').trim();
  const region = String(team.region ?? '').trim();
  if (!region) return name;
  const lowerName = name.toLowerCase();
  const lowerRegion = region.toLowerCase();
  return lowerName.startsWith(`${lowerRegion} `) || lowerName === lowerRegion
    ? name
    : `${region} ${name}`.trim();
}

function getJerseyNumberForTeam(player: NBAPlayer, tid: number): string | null {
  const teamStats = [...(player.stats ?? [])]
    .filter((s: any) => s.tid === tid && s.jerseyNumber != null)
    .sort((a: any, b: any) => Number(b.season ?? 0) - Number(a.season ?? 0));

  const raw = teamStats[0]?.jerseyNumber ?? (player as any).jerseyNumber;
  if (raw == null || raw === '') return null;
  return String(raw);
}

function tierDelay(playerId: string, teamId: number, retiredYear: number, tier: JerseyRetirementTier): number {
  const roll = seededRandom(`jersey_delay_${playerId}_${teamId}_${retiredYear}_${tier}`);
  if (tier === 'automatic') return roll < 0.55 ? 1 : 2;
  if (tier === 'fast_track') return 3 + Math.floor(roll * 3);
  if (tier === 'standard') return 6 + Math.floor(roll * 5);
  return 11 + Math.floor(roll * 10);
}

function classifyLegacy(score: number, facts: {
  seasonsWithTeam: number;
  gamesWithTeam: number;
  allStars: number;
  championships: number;
  mvps: number;
  finalsMVPs: number;
  hof: boolean;
}): { tier: JerseyRetirementTier; reason: JerseyRetirementReason } | null {
  const { seasonsWithTeam, gamesWithTeam, allStars, championships, mvps, finalsMVPs, hof } = facts;
  const tenureQualified = seasonsWithTeam >= 4 || gamesWithTeam >= 250;
  const titleException = championships >= 2 || finalsMVPs >= 1 || mvps >= 1;

  if (!tenureQualified && !titleException) return null;

  if (score >= 115 && (seasonsWithTeam >= 7 || championships >= 2 || mvps >= 1 || finalsMVPs >= 1)) {
    return { tier: 'automatic', reason: mvps > 0 || finalsMVPs > 0 ? 'franchise_icon' : 'championship_core' };
  }

  if (score >= 82 && (hof || championships > 0 || allStars >= 4 || seasonsWithTeam >= 7)) {
    return { tier: 'fast_track', reason: championships > 0 ? 'championship_core' : hof ? 'hof_legend' : 'franchise_icon' };
  }

  if (score >= 58 && (seasonsWithTeam >= 6 || gamesWithTeam >= 420 || allStars >= 3)) {
    return { tier: 'standard', reason: hof ? 'hof_legend' : 'loyal_star' };
  }

  if (score >= 44 && (seasonsWithTeam >= 8 || allStars >= 2 || championships > 0)) {
    return { tier: 'late_honor', reason: championships > 0 ? 'championship_core' : 'honorary' };
  }

  return null;
}

function buildLegacyCase(player: NBAPlayer, team: NBATeam, year: number): TeamLegacyCase | null {
  if ((player as any).status !== 'Retired') return null;
  if (!player.retiredYear || year < player.retiredYear + 1) return null;

  const tid = team.id;
  const regStats = (player.stats ?? []).filter((s: any) => !s.playoffs && s.tid === tid);
  if (regStats.length === 0) return null;

  const seasons = new Set(regStats.map((s: any) => Number(s.season)).filter(Boolean));
  const seasonsWithTeam = seasons.size;
  const gamesWithTeam = regStats.reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
  const pts = regStats.reduce((sum: number, s: any) => sum + (s.pts ?? 0), 0);
  const reb = regStats.reduce((sum: number, s: any) => sum + (s.trb ?? ((s.orb ?? 0) + (s.drb ?? 0))), 0);
  const ast = regStats.reduce((sum: number, s: any) => sum + (s.ast ?? 0), 0);
  const winValue = regStats.reduce((sum: number, s: any) => sum + ((s as any).ws ?? ((s.ows ?? 0) + (s.dws ?? 0) + (s.ewa ?? 0))), 0);

  const allStars = countAward(player, 'All-Star', seasons);
  const mvps = countAward(player, 'Most Valuable Player', seasons);
  const finalsMVPs = countAward(player, 'Finals MVP', seasons);
  const championships = countAward(player, 'Champion', seasons) + countAward(player, 'Won Championship', seasons);
  const allNBA = countAwardIncludes(player, 'All-NBA', seasons) + countAwardIncludes(player, 'All-League', seasons);

  const score =
    seasonsWithTeam * 4
    + gamesWithTeam / 35
    + pts / 2000
    + reb / 1000
    + ast / 1000
    + winValue * 1.2
    + championships * 22
    + finalsMVPs * 25
    + mvps * 30
    + allNBA * 7
    + allStars * 4
    + (player.hof ? 18 : 0);

  const classified = classifyLegacy(score, {
    seasonsWithTeam,
    gamesWithTeam,
    allStars,
    championships,
    mvps,
    finalsMVPs,
    hof: !!player.hof,
  });
  if (!classified) return null;

  const number = getJerseyNumberForTeam(player, tid);
  if (!number) return null;

  const delayYears = tierDelay(player.internalId, tid, player.retiredYear, classified.tier);
  return {
    player,
    team,
    number,
    score,
    delayYears,
    scheduledYear: player.retiredYear + delayYears,
    seasonsWithTeam,
    gamesWithTeam,
    allStarAppearances: allStars,
    championships,
    ...classified,
  };
}

function seasonYearFromDate(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getMonth() + 1;
  const calYear = d.getFullYear();
  return month >= 7 || (month === 6 && d.getDate() >= 28) ? calYear + 1 : calYear;
}

export function deriveLeagueStartYearFromHistory(
  history: Array<string | HistoryEntry> | undefined,
  fallbackYear: number,
): number {
  const entries = history ?? [];
  for (const raw of entries) {
    if (typeof raw === 'string') continue;
    const text = (raw.text ?? '').toLowerCase();
    if (!text.includes('took office as the new nba commissioner')) continue;
    const derived = seasonYearFromDate(raw.date ?? '');
    if (derived) return derived;
  }
  return fallbackYear;
}

export function runJerseyRetirementChecks(
  players: NBAPlayer[],
  teams: NBATeam[],
  year: number,
  options: JerseyRetirementOptions = {},
): { teams: NBATeam[]; newRetirements: JerseyRetirementRecord[] } {
  const newRetirements: JerseyRetirementRecord[] = [];
  const teamById = new Map(teams.map(t => [t.id, t]));
  const pendingByTeam = new Map<number, TeamLegacyCase[]>();
  const leagueStartYear = options.leagueStartYear ?? year;

  for (const p of players) {
    if ((p as any).status !== 'Retired' || !p.retiredYear) continue;
    if (p.retiredYear < leagueStartYear) continue;

    const tids = new Set<number>();
    for (const s of p.stats ?? []) {
      if ((s as any).playoffs) continue;
      const tid = Number((s as any).tid);
      if (tid >= 0 && tid < 100 && teamById.has(tid)) tids.add(tid);
    }

    for (const tid of tids) {
      const team = teamById.get(tid)!;
      const existing = ((team as any).retiredJerseyNumbers ?? []) as RetiredJerseyRecord[];
      if (existing.some(j => j.playerId === p.internalId || String(j.pid ?? '') === String((p as any).pid ?? ''))) continue;

      const candidate = buildLegacyCase(p, team, year);
      if (!candidate || year < candidate.scheduledYear) continue;

      const list = pendingByTeam.get(tid) ?? [];
      list.push(candidate);
      pendingByTeam.set(tid, list);
    }
  }

  const updatedTeams = teams.map(team => {
    const candidates = (pendingByTeam.get(team.id) ?? []).sort((a, b) => b.score - a.score);
    if (candidates.length === 0) return team;

    const existing = ((team as any).retiredJerseyNumbers ?? []) as RetiredJerseyRecord[];
    const retiredNumbers = new Set(existing.map(j => String(j.number)));
    const additions: RetiredJerseyRecord[] = [];

    for (const c of candidates) {
      if (retiredNumbers.has(c.number)) continue;
      retiredNumbers.add(c.number);
      const record: RetiredJerseyRecord = {
        number: c.number,
        text: c.player.name,
        pid: (c.player as any).pid,
        playerId: c.player.internalId,
        seasonRetired: year,
        teamId: team.id,
        reason: c.reason,
        tier: c.tier,
      };
      additions.push(record);
      newRetirements.push({
        playerId: c.player.internalId,
        name: c.player.name,
        number: c.number,
        teamId: team.id,
        teamName: getTeamDisplayName(team),
        seasonRetired: year,
        retiredYear: c.player.retiredYear!,
        score: c.score,
        tier: c.tier,
        reason: c.reason,
        seasonsWithTeam: c.seasonsWithTeam,
        gamesWithTeam: c.gamesWithTeam,
        allStarAppearances: c.allStarAppearances,
        championships: c.championships,
      });
    }

    if (additions.length === 0) return team;
    return {
      ...team,
      retiredJerseyNumbers: [...existing, ...additions],
    };
  });

  return { teams: updatedTeams, newRetirements };
}

export function getReservedJerseyNumbersByTeam(
  players: NBAPlayer[],
  teams: NBATeam[],
  year: number,
  options: JerseyRetirementOptions = {},
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  const teamById = new Map(teams.map(t => [t.id, t]));
  const leagueStartYear = options.leagueStartYear ?? year;

  for (const p of players) {
    if ((p as any).status !== 'Retired' || !p.retiredYear) continue;
    if (p.retiredYear < leagueStartYear) continue;

    const tids = new Set<number>();
    for (const s of p.stats ?? []) {
      if ((s as any).playoffs) continue;
      const tid = Number((s as any).tid);
      if (tid >= 0 && tid < 100 && teamById.has(tid)) tids.add(tid);
    }

    for (const tid of tids) {
      const team = teamById.get(tid)!;
      const existing = ((team as any).retiredJerseyNumbers ?? []) as RetiredJerseyRecord[];
      if (existing.some(j => j.playerId === p.internalId || String(j.pid ?? '') === String((p as any).pid ?? ''))) continue;
      const candidate = buildLegacyCase(p, team, year);
      if (!candidate) continue;
      if (!out.has(tid)) out.set(tid, new Set());
      out.get(tid)!.add(candidate.number);
    }
  }

  return out;
}

export function explainJerseyRetirementCandidates(
  players: NBAPlayer[],
  teams: NBATeam[],
  year: number,
  options: JerseyRetirementOptions = {},
): JerseyRetirementDebugRow[] {
  const rows: JerseyRetirementDebugRow[] = [];
  const teamById = new Map(teams.map(t => [t.id, t]));
  const leagueStartYear = options.leagueStartYear ?? year;

  for (const p of players) {
    if ((p as any).status !== 'Retired' || !p.retiredYear) continue;

    const tids = new Set<number>();
    for (const s of p.stats ?? []) {
      if ((s as any).playoffs) continue;
      const tid = Number((s as any).tid);
      if (tid >= 0 && tid < 100 && teamById.has(tid)) tids.add(tid);
    }

    for (const tid of tids) {
      const team = teamById.get(tid)!;
      const base = {
        playerId: p.internalId,
        name: p.name,
        status: String((p as any).status ?? ''),
        retiredYear: p.retiredYear,
        teamId: tid,
        teamName: getTeamDisplayName(team),
      } satisfies Omit<JerseyRetirementDebugRow, 'outcome'>;

      if (p.retiredYear < leagueStartYear) {
        rows.push({ ...base, outcome: 'skip_pre_save_retiree' });
        continue;
      }

      const existing = ((team as any).retiredJerseyNumbers ?? []) as RetiredJerseyRecord[];
      if (existing.some(j => j.playerId === p.internalId || String(j.pid ?? '') === String((p as any).pid ?? ''))) {
        rows.push({ ...base, outcome: 'skip_existing' });
        continue;
      }

      const candidate = buildLegacyCase(p, team, year);
      if (!candidate) {
        const number = getJerseyNumberForTeam(p, tid) ?? undefined;
        rows.push({ ...base, number, outcome: number ? 'skip_not_qualified' : 'skip_missing_number' });
        continue;
      }

      const rowBase = {
        ...base,
        number: candidate.number,
        score: Math.round(candidate.score * 10) / 10,
        scheduledYear: candidate.scheduledYear,
        seasonsWithTeam: candidate.seasonsWithTeam,
        gamesWithTeam: candidate.gamesWithTeam,
        allStarAppearances: candidate.allStarAppearances,
        championships: candidate.championships,
        tier: candidate.tier,
        reason: candidate.reason,
      };

      if (year < candidate.scheduledYear) {
        rows.push({ ...rowBase, outcome: 'skip_not_due' });
        continue;
      }

      const retiredNumbers = new Set(existing.map(j => String(j.number)));
      if (retiredNumbers.has(candidate.number)) {
        rows.push({ ...rowBase, outcome: 'skip_number_taken' });
        continue;
      }

      rows.push({ ...rowBase, outcome: 'candidate' });
    }
  }

  return rows.sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.name.localeCompare(b.name);
  });
}
