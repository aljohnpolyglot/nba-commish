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
  format: { gamesPerSeason?: number; playoffsEnabled?: boolean } = {},
): HistoryResult {
  const awards: HistoryResult['historicalAwards'] = [];
  const teamSeasons = new Map<number, HistoryResult['teamSeasons'] extends Map<any, infer V> ? V : never>();
  for (const t of teams) teamSeasons.set(t.id, []);
  const gamesPerSeason = Math.max(1, Math.floor(format.gamesPerSeason ?? 82));
  const playoffsEnabled = format.playoffsEnabled !== false;

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
    const yearIn = Y - (m.firstStatYr ?? (m.draftYear + 1));
    return m.ovr * careerArc(m.draftAge, yearIn);
  };

  const awardCounts = new Map<string, Map<string, number>>();
  const lastAwardWinner = new Map<string, string>();
  const awardStreak = new Map<string, number>();

  const chooseWinner = <T extends { p: NBAPlayer }>(
    type: 'MVP' | 'DPOY',
    candidates: T[],
    score: (candidate: T) => number,
    careerLimit: number,
  ): T | undefined => {
    const counts = awardCounts.get(type) ?? new Map<string, number>();
    awardCounts.set(type, counts);
    const priorPid = lastAwardWinner.get(type);
    const priorStreak = awardStreak.get(type) ?? 0;
    const ranked = candidates
      .filter(candidate => {
        const pid = candidate.p.internalId ?? candidate.p.name;
        return (counts.get(pid) ?? 0) < careerLimit && (pid !== priorPid || priorStreak < 3);
      })
      .map(candidate => {
        const pid = candidate.p.internalId ?? candidate.p.name;
        const repeatPenalty = 1 - Math.min(0.3, (counts.get(pid) ?? 0) * 0.06);
        return { candidate, score: score(candidate) * repeatPenalty * (0.9 + rng() * 0.2) };
      })
      .sort((left, right) => right.score - left.score);
    const winner = ranked[0]?.candidate;
    if (!winner) return candidates[0];
    const pid = winner.p.internalId ?? winner.p.name;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
    awardStreak.set(type, pid === priorPid ? priorStreak + 1 : 1);
    lastAwardWinner.set(type, pid);
    return winner;
  };

  // ── Per-year award/standings synthesis ───────────────────────────────────
  for (let offset = HISTORY_YEARS; offset >= 1; offset--) {
    const Y = currentYear - offset;
    const active = players
      .filter(p => wasActive(p, Y))
      .map(p => {
        const m = meta.get(p.internalId ?? p.name)!;
        const stat = (p.stats ?? []).find(row => !row.playoffs && Number(row.season) === Y);
        return {
          p,
          m,
          stat,
          tid: Number(stat?.tid ?? p.tid),
          pred: predOvrAt(p, Y),
          yearIn: Y - (m.firstStatYr ?? (m.draftYear + 1)),
        };
      });

    // Empty year (very early history before any current player was drafted) → skip
    if (active.length === 0) continue;

    // ── Team strength + champion / runner-up ────────────────────────────
    const strengthByTid = new Map<number, number>();
    for (const a of active) {
      const tid = a.tid;
      if (tid == null || tid < 0) continue;
      strengthByTid.set(tid, (strengthByTid.get(tid) ?? 0) + a.pred);
    }
    // Add noise so the same team doesn't repeat champion 14×.
    const ranked = [...strengthByTid.entries()]
      .map(([tid, s]) => ({ tid, score: s + (rng() - 0.5) * 60 }))
      .sort((a, b) => b.score - a.score);

    const champTid = ranked[0]?.tid;
    const ruTid = ranked[1]?.tid;
    const playoffTids = new Set(playoffsEnabled ? ranked.slice(0, Math.min(16, teams.length)).map(r => r.tid) : []);

    // Per-team season records — champ wins big, RU close, others scaled
    for (const t of teams) {
      const isChamp = t.id === champTid;
      const isRu = t.id === ruTid;
      const inPlayoffs = playoffTids.has(t.id);
      let winPct: number, playoffRoundsWon: number;
      if (isChamp) {
        winPct = 0.72 + rng() * 0.12;
        playoffRoundsWon = playoffsEnabled ? 4 : -1;
      } else if (isRu) {
        winPct = 0.64 + rng() * 0.06;
        playoffRoundsWon = playoffsEnabled ? 3 : -1;
      } else if (inPlayoffs) {
        winPct = 0.46 + rng() * 0.16;
        playoffRoundsWon = Math.floor(rng() * 3);  // 0-2
      } else {
        winPct = 0.22 + rng() * 0.23;
        playoffRoundsWon = -1;
      }
      const won = Math.min(gamesPerSeason, Math.max(0, Math.round(gamesPerSeason * winPct)));
      teamSeasons.get(t.id)!.push({
        season: Y,
        won,
        lost: gamesPerSeason - won,
        playoffRoundsWon,
      });
    }

    // Champion + Runner Up awards
    if (playoffsEnabled && champTid != null) {
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
        tid: tidOverride ?? entry.tid,
      });
    };

    const perGame = (entry: typeof active[number], key: 'pts' | 'trb' | 'ast' | 'stl' | 'blk') => {
      const gp = Math.max(1, Number(entry.stat?.gp ?? 0));
      return Number(entry.stat?.[key] ?? 0) / gp;
    };
    const teamWins = new Map(teams.map(team => [team.id, teamSeasons.get(team.id)?.find(row => row.season === Y)?.won ?? 0]));
    const mvp = chooseWinner('MVP', active, entry =>
      perGame(entry, 'pts')
      + perGame(entry, 'trb') * 0.65
      + perGame(entry, 'ast') * 0.8
      + perGame(entry, 'stl') * 1.4
      + perGame(entry, 'blk') * 1.2
      + entry.pred * 0.12
      + (teamWins.get(entry.tid) ?? 0) / gamesPerSeason * 5,
    5);
    pushPlayer('MVP', mvp);

    // DPOY — top by diq + 0.3 × reb (year-scaled)
    const dpoy = chooseWinner('DPOY', active, entry => {
      const ratings: any = (entry.p.ratings ?? []).find(row => Number(row.season) === Y)
        ?? entry.p.ratings?.[entry.p.ratings.length - 1]
        ?? {};
      return perGame(entry, 'blk') * 5
        + perGame(entry, 'stl') * 4
        + perGame(entry, 'trb') * 0.55
        + Number(ratings.diq ?? 50) * 0.12
        + Number(ratings.reb ?? 50) * 0.05;
    }, 4);
    pushPlayer('DPOY', dpoy);

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
        .filter(a => a.tid === champTid)
        .sort((a, b) => b.pred - a.pred);
      pushPlayer('Finals MVP', champStars[0], champTid);
    }
  }

  return { historicalAwards: awards, teamSeasons };
}
