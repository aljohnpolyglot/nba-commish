import { NBAPlayer, NBAGMStat } from '../../../types';
import { ComputedRow, StatType } from './PlayerStatsTypes';

export const fmt1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
export const fmt0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—');
export const fmt3 = (v: number) =>
  Number.isFinite(v) && v > 0 ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '—';
export const safePct = (num: number, den: number) => (den > 0 ? num / den : 0);

function validStatRows(statsList: Array<NBAGMStat | null | undefined>): NBAGMStat[] {
  return statsList.filter((row): row is NBAGMStat => !!row && typeof row === 'object');
}

export function aggregateStats(statsList: Array<NBAGMStat | null | undefined>): NBAGMStat {
  const rows = validStatRows(statsList);
  const out: NBAGMStat = {
    season: 0,
    tid: rows[0]?.tid ?? 0,
    gp: 0,
    gs: 0,
    min: 0,
    fg: 0,
    fga: 0,
    fgp: 0,
    tp: 0,
    tpa: 0,
    tpp: 0,
    fp: 0,
    fpa: 0,
    fpp: 0,
    ft: 0,
    fta: 0,
    ftp: 0,
    orb: 0,
    drb: 0,
    trb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    pts: 0,
    per: 0,
    pm: 0,
  };
  for (const s of rows) {
    out.gp += s.gp ?? 0;
    out.gs += s.gs ?? 0;
    out.min += s.min ?? 0;
    out.fg += s.fg ?? 0;
    out.fga += s.fga ?? 0;
    out.tp += s.tp ?? 0;
    out.tpa += s.tpa ?? 0;
    out.fp = (out.fp ?? 0) + (s.fp ?? 0);
    out.fpa = (out.fpa ?? 0) + (s.fpa ?? 0);
    out.ft += s.ft ?? 0;
    out.fta += s.fta ?? 0;
    out.orb += s.orb ?? 0;
    out.drb += s.drb ?? 0;
    out.trb += s.trb ?? 0;
    out.ast += s.ast ?? 0;
    out.stl += s.stl ?? 0;
    out.blk += s.blk ?? 0;
    out.tov += s.tov ?? 0;
    out.pf += s.pf ?? 0;
    out.pts += s.pts ?? 0;
    out.pm = (out.pm ?? 0) + (s.pm ?? 0);
  }
  out.fgp = safePct(out.fg, out.fga);
  out.tpp = safePct(out.tp, out.tpa);
  out.fpp = safePct(out.fp ?? 0, out.fpa ?? 0);
  out.ftp = safePct(out.ft, out.fta);
  const totalGp = out.gp || 1;
  const wpd = (k: keyof NBAGMStat) => rows.reduce((a, s) => a + ((s[k] as number) ?? 0) * (s.gp ?? 0), 0) / totalGp;
  out.per = wpd('per');
  out.tsPct = wpd('tsPct');
  out.efgPct = wpd('efgPct');
  out.usgPct = wpd('usgPct');
  out.ortg = wpd('ortg');
  out.drtg = wpd('drtg');
  out.bpm = wpd('bpm');
  out.obpm = wpd('obpm');
  out.dbpm = wpd('dbpm');
  out.orbPct = wpd('orbPct');
  out.drbPct = wpd('drbPct');
  out.rebPct = wpd('rebPct');
  out.astPct = wpd('astPct');
  out.stlPct = wpd('stlPct');
  out.blkPct = wpd('blkPct');
  out.tovPct = wpd('tovPct');
  out.ws = rows.reduce((a, s) => a + (s.ws ?? 0), 0);
  out.ows = rows.reduce((a, s) => a + (s.ows ?? 0), 0);
  out.dws = rows.reduce((a, s) => a + (s.dws ?? 0), 0);
  out.vorp = rows.reduce((a, s) => a + (s.vorp ?? 0), 0);
  out.ewa = rows.reduce((a, s) => a + (s.ewa ?? 0), 0);
  return out;
}

export function dedupeStatsRows(statsList: Array<NBAGMStat | null | undefined>): NBAGMStat[] {
  const grouped = new Map<string, NBAGMStat[]>();
  for (const row of validStatRows(statsList)) {
    const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${row.competitionId ?? ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  return Array.from(grouped.values()).map(rows =>
    rows.reduce((best, row) => ((row.gp ?? 0) > (best.gp ?? 0) ? row : best), rows[0]),
  );
}

export function zeroStatRow(season: number, tid: number): NBAGMStat {
  return {
    season,
    tid,
    gp: 0,
    gs: 0,
    min: 0,
    fg: 0,
    fga: 0,
    fgp: 0,
    tp: 0,
    tpa: 0,
    tpp: 0,
    fp: 0,
    fpa: 0,
    fpp: 0,
    ft: 0,
    fta: 0,
    ftp: 0,
    orb: 0,
    drb: 0,
    trb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    pts: 0,
    per: 0,
    pm: 0,
    tsPct: 0,
    efgPct: 0,
    usgPct: 0,
    ortg: 0,
    drtg: 0,
    bpm: 0,
    obpm: 0,
    dbpm: 0,
    ws: 0,
    ows: 0,
    dws: 0,
    vorp: 0,
    ewa: 0,
    orbPct: 0,
    drbPct: 0,
    rebPct: 0,
    astPct: 0,
    stlPct: 0,
    blkPct: 0,
    tovPct: 0,
  };
}

export function toRow(
  player: NBAPlayer,
  rawStat: NBAGMStat,
  statType: StatType,
  seasonLabel: number | 'career',
  teamAbbrev: string,
  age: number,
): ComputedRow {
  const gp = rawStat.gp || 1;
  const minPer36 = rawStat.min / 36 || 1;
  const div = statType === 'totals' ? 1 : statType === 'per36' ? minPer36 : gp;
  const fg = rawStat.fg / div;
  const fga = rawStat.fga / div;
  const tp = rawStat.tp / div;
  const tpa = rawStat.tpa / div;
  const fp = (rawStat.fp ?? 0) / div;
  const fpa = (rawStat.fpa ?? 0) / div;
  const ft = rawStat.ft / div;
  const fta = rawStat.fta / div;
  const min = statType === 'totals' ? rawStat.min : rawStat.min / gp;

  return {
    player,
    season: seasonLabel,
    seasonLabel: (rawStat as any)._seasonLabel,
    teamAbbrev,
    age,
    gp: rawStat.gp,
    gs: rawStat.gs,
    min,
    fg,
    fga,
    fgPct: safePct(rawStat.fg, rawStat.fga),
    tp,
    tpa,
    tpPct: safePct(rawStat.tp, rawStat.tpa),
    fp,
    fpa,
    fpPct: safePct(rawStat.fp ?? 0, rawStat.fpa ?? 0),
    twop: fg - tp - fp,
    twopa: fga - tpa - fpa,
    twopPct: safePct(rawStat.fg - rawStat.tp - (rawStat.fp ?? 0), rawStat.fga - rawStat.tpa - (rawStat.fpa ?? 0)),
    efgPct: safePct(rawStat.fg + 0.5 * rawStat.tp + (rawStat.fp ?? 0), rawStat.fga),
    ft,
    fta,
    ftPct: safePct(rawStat.ft, rawStat.fta),
    orb: rawStat.orb / div,
    drb: rawStat.drb / div,
    trb: rawStat.trb / div,
    ast: rawStat.ast / div,
    tov: rawStat.tov / div,
    stl: rawStat.stl / div,
    blk: rawStat.blk / div,
    pf: rawStat.pf / div,
    pts: rawStat.pts / div,
    pm: (rawStat.pm ?? 0) / div,
    per: rawStat.per ?? 0,
    ewa: rawStat.ewa ?? 0,
    tsPct: rawStat.tsPct ?? 0,
    efgPctA: rawStat.efgPct ?? 0,
    usgPct: rawStat.usgPct ?? 0,
    ortg: rawStat.ortg ?? 0,
    drtg: rawStat.drtg ?? 0,
    bpm: rawStat.bpm ?? 0,
    obpm: rawStat.obpm ?? 0,
    dbpm: rawStat.dbpm ?? 0,
    ws: rawStat.ws ?? 0,
    ows: rawStat.ows ?? 0,
    dws: rawStat.dws ?? 0,
    ws48: rawStat.min > 0 ? (rawStat.ws ?? 0) / (rawStat.min / 48) : 0,
    vorp: rawStat.vorp ?? 0,
    orbPct: rawStat.orbPct ?? 0,
    drbPct: rawStat.drbPct ?? 0,
    trbPct: rawStat.rebPct ?? 0,
    astPct: rawStat.astPct ?? 0,
    stlPct: rawStat.stlPct ?? 0,
    blkPct: rawStat.blkPct ?? 0,
    tovPct: rawStat.tovPct ?? 0,
    threePAr: safePct(rawStat.tpa, rawStat.fga),
    ftRate: safePct(rawStat.fta, rawStat.fga),
  };
}

export function historicalTeamRows(
  stats: Array<NBAGMStat | null | undefined>,
  player: NBAPlayer,
  teams: { id: number; abbrev: string }[],
  statType: StatType,
  seasonLabel: number | 'career',
  age: number,
  teamFilter: string,
): ComputedRow[] {
  const rows = validStatRows(stats);
  const byTid = new Map<number, NBAGMStat[]>();
  for (const stat of rows) {
    if (!byTid.has(stat.tid)) byTid.set(stat.tid, []);
    byTid.get(stat.tid)!.push(stat);
  }

  if (byTid.size <= 1) {
    const agg = rows.length > 1 ? aggregateStats(rows) : rows[0];
    if (!agg || agg.gp < 1) return [];
    const team = teams.find(entry => entry.id === agg.tid);
    const rowTeam = team?.abbrev ?? (agg.tid < 0 ? 'FA' : '?');
    if (teamFilter !== 'all' && rowTeam !== teamFilter) return [];
    return [toRow(player, agg, statType, seasonLabel, rowTeam, age)];
  }

  const result: ComputedRow[] = [];
  if (teamFilter === 'all') {
    const agg = aggregateStats(rows);
    if (agg.gp >= 1) result.push(toRow(player, agg, statType, seasonLabel, `${byTid.size}TM`, age));
  }
  for (const [tid, teamStats] of byTid) {
    const agg = teamStats.length > 1 ? aggregateStats(teamStats) : teamStats[0];
    if (agg.gp < 1) continue;
    const team = teams.find(entry => entry.id === tid);
    const rowTeam = team?.abbrev ?? (tid < 0 ? 'FA' : '?');
    if (teamFilter !== 'all' && rowTeam !== teamFilter) continue;
    result.push(toRow(player, agg, statType, seasonLabel, rowTeam, age));
  }
  return result;
}
