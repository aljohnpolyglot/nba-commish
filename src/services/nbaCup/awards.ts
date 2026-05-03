import { NBACupState, NBAPlayer, Game, GameResult } from '../../types';
import { seededRandom } from './seededRandom';

interface KOPerfEntry {
  playerId: string;
  tid: number;
  pos: string;
  avgPts: number;
  avgReb: number;
  avgAst: number;
  score: number;
}

function buildKOPerf(
  cup: NBACupState,
  schedule: Game[],
  boxScores: GameResult[],
  players: NBAPlayer[],
): KOPerfEntry[] {
  // All cup games (group + KO) — same source PlayerStatsView uses for the Cup filter.
  const cupGids = new Set<number>();
  for (const g of schedule) {
    if ((g as any).isNBACup) cupGids.add(g.gid);
  }
  // Fallback: KO-only when schedule isn't tagged (older saves)
  if (cupGids.size === 0) {
    for (const k of cup.knockout) if (k.gameId !== undefined) cupGids.add(k.gameId);
  }
  const koGids = new Set(cup.knockout.filter(k => k.gameId !== undefined).map(k => k.gameId!));

  const acc = new Map<string, { pts: number; reb: number; ast: number; stl: number; blk: number; gp: number; koGp: number; tid: number; pos: string }>();

  for (const box of boxScores) {
    if (!cupGids.has(box.gameId)) continue;
    const isKO = koGids.has(box.gameId);
    const allStats = [...(box.homeStats ?? []), ...(box.awayStats ?? [])];
    for (const s of allStats) {
      const pid = s.playerId != null ? String(s.playerId) : undefined;
      if (!pid) continue;
      const prev = acc.get(pid) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, gp: 0, koGp: 0, tid: 0, pos: '' };
      const player = players.find(p => p.internalId === pid);
      acc.set(pid, {
        pts: prev.pts + (s.pts ?? 0),
        reb: prev.reb + ((s.reb ?? 0) || ((s.orb ?? 0) + (s.drb ?? 0))),
        ast: prev.ast + (s.ast ?? 0),
        stl: prev.stl + (s.stl ?? 0),
        blk: prev.blk + (s.blk ?? 0),
        gp: prev.gp + 1,
        koGp: prev.koGp + (isKO ? 1 : 0),
        tid: (box.homeStats?.some(x => x.playerId === pid) ? box.homeTeamId : box.awayTeamId),
        pos: (player as any)?.pos ?? prev.pos,
      });
    }
  }

  return Array.from(acc.entries()).filter(([, v]) => v.koGp > 0).map(([pid, v]) => {
    const avg = (n: number) => v.gp > 0 ? n / v.gp : 0;
    const isChampion = v.tid === cup.championTid;
    // Weight KO games heavier — 4 group games vs 1-3 KO games means KO impact would
    // wash out otherwise. Bonus = avg KO performance × KO count.
    const koWeight = v.koGp * 0.5;
    const score =
      avg(v.pts) * 0.45 +
      avg(v.reb) * 0.20 +
      avg(v.ast) * 0.20 +
      avg(v.stl) * 0.5 +
      avg(v.blk) * 0.5 +
      koWeight +
      (isChampion ? 4 : 0);
    return { playerId: pid, tid: v.tid, pos: v.pos, avgPts: avg(v.pts), avgReb: avg(v.reb), avgAst: avg(v.ast), score };
  }).sort((a, b) => b.score - a.score);
}

const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

// Generic positions cover multiple slots — 'G' fills PG or SG, 'F' fills SF or PF, etc.
// Without this Cade Cunningham (pos='G') was excluded from every slot.
function fitsPos(playerPos: string, slot: string): boolean {
  if (!playerPos) return false;
  if (playerPos === slot) return true;
  const p = playerPos.toUpperCase();
  if (slot === 'PG' || slot === 'SG') return p === 'G' || p.includes(slot) || p === 'GF';
  if (slot === 'SF' || slot === 'PF') return p === 'F' || p.includes(slot) || p === 'GF' || p === 'FC';
  if (slot === 'C') return p === 'C' || p === 'FC';
  return false;
}

/**
 * Computes Cup MVP and All-Tournament Team after the Final.
 * Mutates cup.mvpPlayerId and cup.allTournamentTeam in the returned object.
 */
export function computeCupAwards(
  cup: NBACupState,
  schedule: Game[],
  boxScores: GameResult[],
  players: NBAPlayer[],
): NBACupState {
  const perf = buildKOPerf(cup, schedule, boxScores, players);
  if (perf.length === 0) return cup;

  // MVP: must be from the winning team
  const champPerf = perf.filter(p => p.tid === cup.championTid);
  const mvpPool = champPerf.length > 0 ? champPerf : perf;
  const top10 = mvpPool.slice(0, 10);
  let mvpEntry = top10[0];
  for (let i = 1; i < top10.length; i++) {
    if (top10[i].score === mvpEntry.score) {
      const coin = seededRandom(`cup_mvp_${cup.year}_${mvpEntry.playerId}_${top10[i].playerId}`);
      if (coin > 0.5) mvpEntry = top10[i];
    } else break;
  }

  // All-Tournament Team: top 5 slotted by position (PG/SG/SF/PF/C).
  // MVP is guaranteed a slot — placed first at the position they best fit.
  const team: NBACupState['allTournamentTeam'] = [];
  const usedIds = new Set<string>();
  const usedSlots = new Set<string>();

  // Reserve MVP slot first
  const mvpSlot = POS_ORDER.find(s => fitsPos(mvpEntry.pos, s)) ?? mvpEntry.pos ?? POS_ORDER[0];
  team.push({ playerId: mvpEntry.playerId, tid: mvpEntry.tid, pos: mvpSlot, isMvp: true });
  usedIds.add(mvpEntry.playerId);
  usedSlots.add(mvpSlot);

  // Fill remaining 4 positions in order
  for (const slot of POS_ORDER) {
    if (usedSlots.has(slot)) continue;
    const candidate = perf.find(p => !usedIds.has(p.playerId) && fitsPos(p.pos, slot));
    if (candidate) {
      usedIds.add(candidate.playerId);
      usedSlots.add(slot);
      team.push({ playerId: candidate.playerId, tid: candidate.tid, pos: slot, isMvp: false });
    }
  }

  // Fallback: any open slot gets the next-best performer regardless of position
  for (const slot of POS_ORDER) {
    if (team.length >= 5) break;
    if (usedSlots.has(slot)) continue;
    const candidate = perf.find(p => !usedIds.has(p.playerId));
    if (candidate) {
      usedIds.add(candidate.playerId);
      usedSlots.add(slot);
      team.push({ playerId: candidate.playerId, tid: candidate.tid, pos: slot, isMvp: false });
    }
  }

  // Sort to canonical PG → C order so the UI grid renders in position order
  team.sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));

  return { ...cup, mvpPlayerId: mvpEntry.playerId, allTournamentTeam: team };
}

/**
 * Writes Cup awards to player.awards[]:
 *   - 'NBA Cup MVP'                 (1 player)
 *   - 'NBA Cup All-Tournament Team' (5 players, including MVP)
 *   - 'NBA Cup Champion'            (every player on the championTid roster)
 *
 * Idempotent: if a player already has the same award for cup.year, it is not
 * duplicated (so re-running doesn't pile up entries).
 */
export function applyCupAwardsToPlayers(cup: NBACupState, players: NBAPlayer[]): NBAPlayer[] {
  if (!cup.mvpPlayerId && !cup.allTournamentTeam?.length && cup.championTid == null) return players;

  const allTeamIds = new Set((cup.allTournamentTeam ?? []).map(e => String(e.playerId)));
  const mvpId = cup.mvpPlayerId ? String(cup.mvpPlayerId) : undefined;
  const champTid = cup.championTid;
  const season = cup.year;

  const has = (player: NBAPlayer, type: string): boolean =>
    !!(player as any).awards?.some((a: any) => a.season === season && a.type === type);

  return players.map(p => {
    const additions: Array<{ season: number; type: string }> = [];
    if (mvpId && String(p.internalId) === mvpId && !has(p, 'NBA Cup MVP')) {
      additions.push({ season, type: 'NBA Cup MVP' });
    }
    if (allTeamIds.has(String(p.internalId)) && !has(p, 'NBA Cup All-Tournament Team')) {
      additions.push({ season, type: 'NBA Cup All-Tournament Team' });
    }
    if (champTid != null && p.tid === champTid && !has(p, 'NBA Cup Champion')) {
      additions.push({ season, type: 'NBA Cup Champion' });
    }
    if (additions.length === 0) return p;
    return { ...p, awards: [...((p as any).awards ?? []), ...additions] } as NBAPlayer;
  });
}

/** Populate prize pool amounts on the cup state if commissioner enabled it. */
export function applyPrizePool(
  cup: NBACupState,
  enabled: boolean,
  amounts?: { winner: number; runnerUp: number; semi: number; quarter: number },
): NBACupState {
  if (!enabled) return { ...cup, prizePool: undefined };
  return {
    ...cup,
    prizePool: {
      perPlayerByFinish: amounts ?? {
        winner:    500_000,
        runnerUp:  200_000,
        semi:      100_000,
        quarter:    50_000,
      },
    },
  };
}
