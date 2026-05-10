// Synthesizes ~14 years of fictional league history from already-generated players.
// Drives LeagueHistoryView for fictional leagues — without this, every past season
// shows "TBA / —" because state.historicalAwards is empty and there's no Wikipedia
// fallback for a made-up league.
//
// Outputs match the AutoResolver flat-award schema that LeagueHistoryView reads:
//   { season, type: 'MVP' | 'DPOY' | 'Champion' | …, name, pid, tid }
// Plus team-by-team seasons[] entries with W-L + playoffRoundsWon so the champ
// fallback path lights up.
//
// Approach: predicted-OVR-at-year Y = currentOvr × careerArc(draftAge, Y − draftYr).
// That gives every player a plausible level for any past season they were active,
// from which we pick MVP / DPOY / ROY / etc. Champions are the two highest-summed
// rosters per year (with noise so it's not the same dynasty 14× in a row).

import type { NBAPlayer, NBATeam } from '../types';

const HISTORY_YEARS = 14;

interface HistoryResult {
  historicalAwards: Array<{
    season: number;
    type: string;
    name?: string;
    pid?: string;
    tid?: number;
  }>;
  teamSeasons: Map<number, Array<{
    season: number;
    won: number;
    lost: number;
    playoffRoundsWon: number;
  }>>;
}

// Mirrors the careerArc in fictionalLeagueGenerator — kept local to avoid
// circular import. Same shape / values.
function careerArc(draftAge: number, yearIn: number): number {
  const age = draftAge + yearIn;
  if (age < 22)  return 0.55 + 0.10 * (age - 19);
  if (age < 27)  return 0.85 + 0.04 * (age - 22);
  if (age < 30)  return 1.00;
  if (age < 34)  return 1.00 - 0.05 * (age - 30);
  return Math.max(0.55, 0.80 - 0.04 * (age - 34));
}

export function generateFictionalHistory(
  players: NBAPlayer[],
  teams: NBATeam[],
  currentYear: number,
  rng: () => number,
): HistoryResult {
  const awards: HistoryResult['historicalAwards'] = [];
  const teamSeasons = new Map<number, HistoryResult['teamSeasons'] extends Map<any, infer V> ? V : never>();
  for (const t of teams) teamSeasons.set(t.id, []);

  // ── Per-player meta cache ────────────────────────────────────────────────
  type Meta = { draftYear: number; draftAge: number; ovr: number; firstStatYr?: number; lastStatYr?: number };
  const meta = new Map<string, Meta>();
  for (const p of players) {
    const id = p.internalId ?? p.name;
    const draftYr = p.draft?.year ?? currentYear;
    const bornYr = p.born?.year ?? (currentYear - (p.age ?? 22));
    const draftAge = Math.max(17, Math.min(28, draftYr - bornYr));
    const ovr = p.overallRating ?? 50;
    const stats = p.stats ?? [];
    meta.set(id, {
      draftYear: draftYr,
      draftAge,
      ovr,
      firstStatYr: stats[0]?.season,
      lastStatYr: stats[stats.length - 1]?.season,
    });
  }

  const wasActive = (p: NBAPlayer, Y: number): boolean => {
    const m = meta.get(p.internalId ?? p.name);
    if (!m) return false;
    if (m.draftYear > Y) return false;
    if (m.firstStatYr != null && Y < m.firstStatYr) return false;
    if (m.lastStatYr != null && Y > m.lastStatYr) return false;
    return true;
  };

  const predOvrAt = (p: NBAPlayer, Y: number): number => {
    const m = meta.get(p.internalId ?? p.name)!;
    return m.ovr * careerArc(m.draftAge, Y - m.draftYear);
  };

  // ── Per-year award/standings synthesis ───────────────────────────────────
  for (let offset = 1; offset <= HISTORY_YEARS; offset++) {
    const Y = currentYear - offset;
    const active = players
      .filter(p => wasActive(p, Y))
      .map(p => ({
        p,
        m: meta.get(p.internalId ?? p.name)!,
        pred: predOvrAt(p, Y),
        yearIn: Y - meta.get(p.internalId ?? p.name)!.draftYear,
      }));

    // Empty year (very early history before any current player was drafted) → skip
    if (active.length === 0) continue;

    // ── Team strength + champion / runner-up ────────────────────────────
    const strengthByTid = new Map<number, number>();
    for (const a of active) {
      const tid = a.p.tid;
      if (tid == null || tid < 0) continue;
      strengthByTid.set(tid, (strengthByTid.get(tid) ?? 0) + a.pred);
    }
    // Add noise so the same team doesn't repeat champion 14×.
    const ranked = [...strengthByTid.entries()]
      .map(([tid, s]) => ({ tid, score: s + (rng() - 0.5) * 60 }))
      .sort((a, b) => b.score - a.score);

    const champTid = ranked[0]?.tid;
    const ruTid = ranked[1]?.tid;
    const playoffTids = new Set(ranked.slice(0, 16).map(r => r.tid));

    // Per-team season records — champ wins big, RU close, others scaled
    for (const t of teams) {
      const isChamp = t.id === champTid;
      const isRu = t.id === ruTid;
      const inPlayoffs = playoffTids.has(t.id);
      let won: number, playoffRoundsWon: number;
      if (isChamp) {
        won = 56 + Math.floor(rng() * 13);
        playoffRoundsWon = 4;
      } else if (isRu) {
        won = 50 + Math.floor(rng() * 10);
        playoffRoundsWon = 3;
      } else if (inPlayoffs) {
        won = 38 + Math.floor(rng() * 14);
        playoffRoundsWon = Math.floor(rng() * 3);  // 0-2
      } else {
        won = 18 + Math.floor(rng() * 22);
        playoffRoundsWon = -1;
      }
      teamSeasons.get(t.id)!.push({
        season: Y,
        won,
        lost: 82 - won,
        playoffRoundsWon,
      });
    }

    // Champion + Runner Up awards
    if (champTid != null) {
      const t = teams.find(x => x.id === champTid);
      if (t) awards.push({ season: Y, type: 'Champion', tid: t.id, name: t.name });
    }
    if (ruTid != null) {
      const t = teams.find(x => x.id === ruTid);
      if (t) awards.push({ season: Y, type: 'Runner Up', tid: t.id, name: t.name });
    }

    // ── Player awards ────────────────────────────────────────────────────
    const byPred = [...active].sort((a, b) => b.pred - a.pred);
    const pushPlayer = (type: string, entry?: typeof active[number], tidOverride?: number) => {
      if (!entry) return;
      awards.push({
        season: Y,
        type,
        name: entry.p.name,
        pid: entry.p.internalId,
        tid: tidOverride ?? entry.p.tid,
      });
    };

    // MVP — top predicted OVR
    pushPlayer('MVP', byPred[0]);

    // DPOY — top by diq + 0.3 × reb (year-scaled)
    const byDef = [...active].sort((a, b) => {
      const ar: any = (a.p.ratings as any)?.[(a.p.ratings as any).length - 1] ?? {};
      const br: any = (b.p.ratings as any)?.[(b.p.ratings as any).length - 1] ?? {};
      const aArc = careerArc(a.m.draftAge, a.yearIn);
      const bArc = careerArc(b.m.draftAge, b.yearIn);
      const aScore = ((ar.diq ?? 50) + 0.3 * (ar.reb ?? 50)) * aArc;
      const bScore = ((br.diq ?? 50) + 0.3 * (br.reb ?? 50)) * bArc;
      return bScore - aScore;
    });
    pushPlayer('DPOY', byDef[0]);

    // ROY — best rookie (yearIn === 0) that year
    const rookies = active.filter(a => a.yearIn === 0).sort((a, b) => b.pred - a.pred);
    pushPlayer('ROY', rookies[0]);

    // SMOY + MIP — pulled from top-30 mid-tier (rank 8-30) so they're real players,
    // not the MVP again.
    const midTier = byPred.slice(8, Math.min(byPred.length, 30));
    if (midTier.length > 0) {
      pushPlayer('SMOY', midTier[Math.floor(rng() * midTier.length)]);
      pushPlayer('MIP', midTier[Math.floor(rng() * midTier.length)]);
    }

    // Finals MVP — a star on the championship roster
    if (champTid != null) {
      const champStars = active
        .filter(a => a.p.tid === champTid)
        .sort((a, b) => b.pred - a.pred);
      pushPlayer('Finals MVP', champStars[0], champTid);
    }
  }

  return { historicalAwards: awards, teamSeasons };
}
