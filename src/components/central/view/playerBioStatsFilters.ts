import type { NBAPlayer, NBAGMStat } from '../../../types';
import { getCanonicalEuroStatCompetitionId } from '../../../services/euro/statsArchive';

export const isPbaCareerPlayer = (player: NBAPlayer): boolean =>
  player.status === 'PBA' ||
  (player.tid >= 2000 && player.tid < 3000) ||
  !!player.historicalPbaSource ||
  player.internalId.startsWith('pba-draft-source:');

export function isCurrentPbaImportedStat(player: NBAPlayer, stat: NBAGMStat, currentSeason: number): boolean {
  if (!isPbaCareerPlayer(player)) return false;
  if (Number(stat.season ?? 0) !== currentSeason || !!stat.playoffs) return false;

  const raw = stat as any;
  const source = String(raw._source ?? '').trim().toLowerCase();
  const archiveCompetitionId = String(raw._archiveCompetitionId ?? '').trim().toLowerCase();
  const competitionId = String(raw.competitionId ?? '').trim().toLowerCase();
  const tid = Number(stat.tid ?? player.tid);

  return (
    raw.historicalPbaSourceStat === true ||
    source === 'pba-stats-archive' ||
    archiveCompetitionId.startsWith('pba-') ||
    competitionId === 'pba' ||
    (!competitionId && tid >= 2000 && tid < 3000)
  );
}

export function filterCurrentPbaImportedStats(
  player: NBAPlayer,
  stats: NBAGMStat[],
  currentSeason: number,
): NBAGMStat[] {
  if (!isPbaCareerPlayer(player)) return stats;
  return stats.filter(stat => !isCurrentPbaImportedStat(player, stat, currentSeason));
}

export function buildHeroStatsFromSave(
  stats: NBAGMStat[] | undefined,
  season: number,
  competitionId?: string,
  fallback: 'career' | 'latest-season' | 'none' = 'career',
  maxSeason = season,
) {
  const finite = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const rebounds = (row: NBAGMStat & Record<string, unknown>): number => {
    const direct = Number(row.trb ?? row.reb);
    return Number.isFinite(direct) ? direct : finite(row.orb) + finite(row.drb);
  };
  const aggregate = (rows: Array<NBAGMStat & Record<string, unknown>>, fromSeason: boolean) => {
    const totals = rows.reduce((acc, row) => ({
      gp: acc.gp + finite(row.gp),
      pts: acc.pts + finite(row.pts),
      trb: acc.trb + rebounds(row),
      ast: acc.ast + finite(row.ast),
      stl: acc.stl + finite(row.stl),
      blk: acc.blk + finite(row.blk),
    }), { gp: 0, pts: 0, trb: 0, ast: 0, stl: 0, blk: 0 });
    if (totals.gp <= 0) return null;
    return {
      PTS: (totals.pts / totals.gp).toFixed(1),
      REB: (totals.trb / totals.gp).toFixed(1),
      AST: (totals.ast / totals.gp).toFixed(1),
      STL: (totals.stl / totals.gp).toFixed(1),
      BLK: (totals.blk / totals.gp).toFixed(1),
      GP: totals.gp,
      fromSeason,
    };
  };
  const teamAbbrev = (row: Record<string, unknown>): string => String(
    row.abbrev ?? row.teamAbbrev ?? row.tm ?? row.TM ?? '',
  ).trim().toUpperCase();
  const normalizeScopeRows = (scopeRows: Array<NBAGMStat & Record<string, unknown>>) => {
    const components = scopeRows.filter(row => teamAbbrev(row) !== 'TOT');
    const candidates = components.length > 0 ? components : scopeRows;
    const seen = new Set<string>();
    return candidates.filter(row => {
      const tid = Number(row.tid ?? -1);
      const teamIdentity = tid >= 0 ? tid : teamAbbrev(row);
      const signature = [
        teamIdentity, row.gp, row.gs, row.min, row.pts, row.trb ?? row.reb, row.orb, row.drb,
        row.ast, row.stl, row.blk, row.fg, row.fga, row.tp, row.tpa, row.ft, row.fta,
      ].map(value => String(value ?? '')).join('|');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  };
  const rawRegularStats = (stats ?? [])
    .map(row => row as NBAGMStat & Record<string, unknown>)
    .filter(row => {
      if (row.playoffs || finite(row.gp) <= 0 || Number(row.season) > maxSeason) return false;
      return Number(row.tid ?? -1) >= 0 || Boolean(teamAbbrev(row));
    });
  const byScope = new Map<string, Array<NBAGMStat & Record<string, unknown>>>();
  for (const row of rawRegularStats) {
    const key = `${Number(row.season)}|${getCanonicalEuroStatCompetitionId(row)}`;
    byScope.set(key, [...(byScope.get(key) ?? []), row]);
  }
  const regularStats = Array.from(byScope.values()).flatMap(normalizeScopeRows);
  const seasonStats = regularStats.filter(row =>
    Number(row.season) === season
    && (!competitionId || getCanonicalEuroStatCompetitionId(row) === competitionId)
  );
  if (seasonStats.length > 0) return aggregate(seasonStats, true);
  if (fallback === 'none' || regularStats.length === 0) return null;

  if (fallback === 'latest-season') {
    const latestSeason = Math.max(...regularStats.map(row => Number(row.season)));
    return aggregate(regularStats.filter(row => Number(row.season) === latestSeason), true);
  }

  return aggregate(regularStats, false);
}
