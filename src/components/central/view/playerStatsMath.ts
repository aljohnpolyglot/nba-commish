import { NBAPlayer, NBAGMStat } from '../../../types';
import { ComputedRow, StatType } from './PlayerStatsTypes';

export const fmt1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
export const fmt0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—');
export const fmt3 = (v: number) =>
  Number.isFinite(v) && v > 0 ? `.${Math.round(v * 1000).toString().padStart(3, '0')}` : '—';
export const safePct = (num: number, den: number) => (den > 0 ? num / den : 0);

export function aggregateStats(statsList: NBAGMStat[]): NBAGMStat {
  const out: NBAGMStat = {
    season: 0,
    tid: statsList[0]?.tid ?? 0,
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
  for (const s of statsList) {
    out.gp += s.gp;
    out.gs += s.gs;
    out.min += s.min;
    out.fg += s.fg;
    out.fga += s.fga;
    out.tp += s.tp;
    out.tpa += s.tpa;
    out.fp = (out.fp ?? 0) + (s.fp ?? 0);
    out.fpa = (out.fpa ?? 0) + (s.fpa ?? 0);
    out.ft += s.ft;
    out.fta += s.fta;
    out.orb += s.orb;
    out.drb += s.drb;
    out.trb += s.trb;
    out.ast += s.ast;
    out.stl += s.stl;
    out.blk += s.blk;
    out.tov += s.tov;
    out.pf += s.pf;
    out.pts += s.pts;
    out.pm = (out.pm ?? 0) + (s.pm ?? 0);
  }
  out.fgp = safePct(out.fg, out.fga);
  out.tpp = safePct(out.tp, out.tpa);
  out.fpp = safePct(out.fp ?? 0, out.fpa ?? 0);
  out.ftp = safePct(out.ft, out.fta);
  const totalGp = out.gp || 1;
  const wpd = (k: keyof NBAGMStat) => statsList.reduce((a, s) => a + ((s[k] as number) ?? 0) * s.gp, 0) / totalGp;
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
  out.ws = statsList.reduce((a, s) => a + (s.ws ?? 0), 0);
  out.ows = statsList.reduce((a, s) => a + (s.ows ?? 0), 0);
  out.dws = statsList.reduce((a, s) => a + (s.dws ?? 0), 0);
  out.vorp = statsList.reduce((a, s) => a + (s.vorp ?? 0), 0);
  out.ewa = statsList.reduce((a, s) => a + (s.ewa ?? 0), 0);
  return out;
}

export function dedupeStatsRows(statsList: NBAGMStat[]): NBAGMStat[] {
  const grouped = new Map<string, NBAGMStat[]>();
  for (const row of statsList) {
    const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}`;
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
  stats: NBAGMStat[],
  player: NBAPlayer,
  teams: { id: number; abbrev: string }[],
  statType: StatType,
  seasonLabel: number | 'career',
  age: number,
  teamFilter: string,
): ComputedRow[] {
  const byTid = new Map<number, NBAGMStat[]>();
  for (const stat of stats) {
    if (!byTid.has(stat.tid)) byTid.set(stat.tid, []);
    byTid.get(stat.tid)!.push(stat);
  }

  if (byTid.size <= 1) {
    const agg = stats.length > 1 ? aggregateStats(stats) : stats[0];
    if (agg.gp < 1) return [];
    const team = teams.find(entry => entry.id === agg.tid);
    const rowTeam = team?.abbrev ?? (agg.tid < 0 ? 'FA' : '?');
    if (teamFilter !== 'all' && rowTeam !== teamFilter) return [];
    return [toRow(player, agg, statType, seasonLabel, rowTeam, age)];
  }

  const result: ComputedRow[] = [];
  if (teamFilter === 'all') {
    const agg = aggregateStats(stats);
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
