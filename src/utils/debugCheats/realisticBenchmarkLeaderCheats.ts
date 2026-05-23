import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

const BENCH_LEADERS = {
  ppg: [
    { name: 'Luka Doncic', team: 'LAL', value: 33.5 },
    { name: 'Shai Gilgeous-Alexander', team: 'OKC', value: 31.1 },
    { name: 'Anthony Edwards', team: 'MIN', value: 28.8 },
    { name: 'Jaylen Brown', team: 'BOS', value: 28.7 },
    { name: 'Tyrese Maxey', team: 'PHI', value: 28.3 },
    { name: 'Kawhi Leonard', team: 'LAC', value: 27.9 },
    { name: 'Donovan Mitchell', team: 'CLE', value: 27.9 },
    { name: 'Nikola Jokic', team: 'DEN', value: 27.7 },
    { name: 'Devin Booker', team: 'PHO', value: 26.1 },
    { name: 'Jalen Brunson', team: 'NYK', value: 26.0 },
  ],
  rpg: [
    { name: 'Nikola Jokic', team: 'DEN', value: 12.9 },
    { name: 'Karl-Anthony Towns', team: 'NYK', value: 11.9 },
    { name: 'Donovan Clingan', team: 'POR', value: 11.6 },
    { name: 'Victor Wembanyama', team: 'SAS', value: 11.5 },
    { name: 'Rudy Gobert', team: 'MIN', value: 11.5 },
    { name: 'Jalen Duren', team: 'DET', value: 10.5 },
    { name: 'Jalen Johnson', team: 'ATL', value: 10.3 },
    { name: 'Bam Adebayo', team: 'MIA', value: 10.0 },
    { name: 'Evan Mobley', team: 'CLE', value: 9.0 },
    { name: 'Kelel Ware', team: 'MIA', value: 9.0 },
  ],
  apg: [
    { name: 'Nikola Jokic', team: 'DEN', value: 10.7 },
    { name: 'Cade Cunningham', team: 'DET', value: 9.9 },
    { name: 'Luka Doncic', team: 'LAL', value: 8.3 },
    { name: 'James Harden', team: 'TOT', value: 8.0 },
    { name: 'Jalen Johnson', team: 'ATL', value: 7.9 },
    { name: 'Stephon Castle', team: 'SAS', value: 7.4 },
    { name: 'LeBron James', team: 'LAL', value: 7.2 },
    { name: 'Isaiah Collier', team: 'UTA', value: 7.2 },
    { name: 'LaMelo Ball', team: 'CHO', value: 7.1 },
    { name: 'Jamal Murray', team: 'DEN', value: 7.1 },
  ],
  spg: [
    { name: 'Cason Wallace', team: 'OKC', value: 2.1 },
    { name: 'Dyson Daniels', team: 'ATL', value: 2.0 },
    { name: 'Ausar Thompson', team: 'DET', value: 2.0 },
    { name: 'Kris Dunn', team: 'LAC', value: 1.8 },
    { name: 'Tyrese Maxey', team: 'PHI', value: 1.8 },
    { name: 'Luka Doncic', team: 'LAL', value: 1.8 },
    { name: 'Shai Gilgeous-Alexander', team: 'OKC', value: 1.8 },
    { name: 'Amen Thompson', team: 'HOU', value: 1.8 },
    { name: 'Victor Wembanyama', team: 'SAS', value: 1.8 },
    { name: 'Kawhi Leonard', team: 'LAC', value: 1.7 },
  ],
  bpg: [
    { name: 'Victor Wembanyama', team: 'SAS', value: 4.0 },
    { name: 'Chet Holmgren', team: 'OKC', value: 2.8 },
    { name: 'Donovan Clingan', team: 'POR', value: 2.7 },
    { name: 'Rudy Gobert', team: 'MIN', value: 2.2 },
    { name: 'Nic Claxton', team: 'BRK', value: 1.9 },
    { name: 'Brook Lopez', team: 'MIL', value: 1.9 },
    { name: 'Dereck Lively II', team: 'DAL', value: 1.8 },
    { name: 'Anthony Davis', team: 'LAL', value: 1.8 },
    { name: 'Walker Kessler', team: 'UTA', value: 1.8 },
    { name: 'Kristaps Porzingis', team: 'BOS', value: 1.7 },
  ],
  threePm: [
    { name: 'Stephen Curry', team: 'GSW', value: 4.6 },
    { name: 'Luka Doncic', team: 'LAL', value: 4.1 },
    { name: 'Donovan Mitchell', team: 'CLE', value: 3.8 },
    { name: 'Tyrese Maxey', team: 'PHI', value: 3.5 },
    { name: 'Devin Booker', team: 'PHO', value: 3.4 },
    { name: 'Anthony Edwards', team: 'MIN', value: 3.4 },
    { name: 'Jalen Brunson', team: 'NYK', value: 3.2 },
    { name: 'Klay Thompson', team: 'DAL', value: 3.2 },
    { name: 'Paul George', team: 'PHI', value: 3.1 },
    { name: 'LaMelo Ball', team: 'CHO', value: 3.1 },
  ],
  fga: [
    { name: 'Luka Doncic', team: 'LAL', value: 22.8 },
    { name: 'Shai Gilgeous-Alexander', team: 'OKC', value: 22.4 },
    { name: 'Jaylen Brown', team: 'BOS', value: 21.7 },
    { name: 'Tyrese Maxey', team: 'PHI', value: 21.4 },
    { name: 'Nikola Jokic', team: 'DEN', value: 21.4 },
    { name: 'Anthony Edwards', team: 'MIN', value: 21.3 },
    { name: 'Kawhi Leonard', team: 'LAC', value: 21.2 },
    { name: 'Donovan Mitchell', team: 'CLE', value: 21.0 },
    { name: 'Jalen Brunson', team: 'NYK', value: 20.3 },
    { name: 'Kevin Durant', team: 'HOU', value: 19.9 },
  ],
};

// 2026SimBenchmark.md Part 2 — team ranges
const BENCH_TEAM_RANGES = {
  ppg:  { min: 105.9, max: 122.1, top: 'Denver Nuggets',     bot: 'Brooklyn Nets' },
  fgPct:{ min: .448,  max: .491,  top: 'Denver Nuggets',     bot: 'Brooklyn Nets' },
  threePct: { min: .330, max: .392, top: 'San Antonio Spurs', bot: 'Utah Jazz' },
  ftPct:{ min: .740,  max: .820,  top: 'Golden State Warriors', bot: 'Milwaukee Bucks' },
  efgPct:{ min: .510, max: .588,  top: 'Denver Nuggets',     bot: 'Brooklyn Nets' },
  pace: { min: 94.0,  max: 101.5, top: 'Indiana Pacers',     bot: 'Philadelphia 76ers' },
};

export async function runSimLeaders(state: GameState): Promise<CheatResult> {
  const boxes = (state.boxScores ?? []).filter((g: any) => {
    if (g.isAllStar || g.isRisingStars || g.isCelebrityGame || g.isPreseason) return false;
    if (g.homeTeamId >= 100 || g.awayTeamId >= 100) return false;
    if (g.homeTeamId === g.awayTeamId) return false;
    return Array.isArray(g.homeStats) && Array.isArray(g.awayStats);
  });
  if (boxes.length < 30) {
    return { title: 'SIMLEADERS', body: `Only ${boxes.length} games — need ≥30. Sim more.`, ok: false };
  }

  // Player aggregation (same shape as PLAYERBENCH but tracks more).
  // PlayerGameStats lines don't carry tid — look up the team via state.players once.
  const tidById = new Map<string, number>();
  (state.players ?? []).forEach((p: any) => {
    if (p.internalId != null) tidById.set(p.internalId, p.tid);
  });
  type Agg = {
    name: string; tid: number;
    gp: number; min: number;
    pts: number; fga: number; fgm: number; threePa: number; threePm: number;
    fta: number; ftm: number; ast: number; reb: number; orb: number; drb: number;
    stl: number; blk: number; tov: number;
  };
  const byId = new Map<string, Agg>();
  const ingest = (lines: any[]) => {
    for (const ps of lines) {
      const id = ps.playerId ?? ps.internalId;
      if (!id) continue;
      let a = byId.get(id);
      if (!a) {
        a = {
          name: ps.name ?? id, tid: tidById.get(id) ?? -1,
          gp: 0, min: 0, pts: 0, fga: 0, fgm: 0, threePa: 0, threePm: 0,
          fta: 0, ftm: 0, ast: 0, reb: 0, orb: 0, drb: 0,
          stl: 0, blk: 0, tov: 0,
        };
        byId.set(id, a);
      }
      const min = ps.min || 0;
      if (min <= 0) continue;
      a.gp++; a.min += min;
      a.pts += ps.pts || 0;
      a.fga += ps.fga || 0; a.fgm += ps.fgm || 0;
      a.threePa += ps.threePa || 0; a.threePm += ps.threePm || 0;
      a.fta += ps.fta || 0; a.ftm += ps.ftm || 0;
      a.ast += ps.ast || 0;
      a.orb += ps.orb || 0; a.drb += ps.drb || 0;
      a.reb += (ps.reb ?? ((ps.orb || 0) + (ps.drb || 0)));
      a.stl += ps.stl || 0; a.blk += ps.blk || 0; a.tov += ps.tov || 0;
    }
  };
  for (const g of boxes as any[]) { ingest(g.homeStats); ingest(g.awayStats); }

  const maxGp = Math.max(...Array.from(byId.values(), a => a.gp), 0);
  const gpFloor = Math.max(5, Math.min(20, Math.floor(maxGp * 0.5)));
  const all = Array.from(byId.values()).filter(a => a.gp >= gpFloor);
  const teamAbbrev = (tid: number) => (state.teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;
  const perGame = (a: Agg, k: keyof Agg) => a.gp > 0 ? (a[k] as number) / a.gp : 0;
  const ftPct = (a: Agg) => a.fta > 0 ? a.ftm / a.fta : 0;

  // Top-N picker by metric
  const top = (key: keyof Agg, n = 10, minDenom = 1) => {
    return all.filter(a => (a[key] as number) >= minDenom)
      .sort((x, y) => perGame(y, key) - perGame(x, key))
      .slice(0, n);
  };
  const topFtPct = (n = 10) => {
    return all.filter(a => a.fta >= 50)
      .sort((x, y) => ftPct(y) - ftPct(x))
      .slice(0, n);
  };

  const buildRows = (kind: keyof typeof BENCH_LEADERS, key: keyof Agg | 'ftPct', label: string, fmt: 'count' | 'pct') => {
    const ref = BENCH_LEADERS[kind];
    const simTop = key === 'ftPct' ? topFtPct() : top(key as keyof Agg);
    const fmtV = (v: number) => fmt === 'pct' ? (v * 100).toFixed(1) + '%' : v.toFixed(1);
    return ref.map((r, i) => {
      const sim = simTop[i];
      const simV = sim ? (key === 'ftPct' ? ftPct(sim) : perGame(sim, key as keyof Agg)) : 0;
      const flag = sim ? (Math.abs(simV - r.value) / Math.max(0.01, r.value) > 0.20 ? '⚠️'
                         : Math.abs(simV - r.value) / Math.max(0.01, r.value) > 0.10 ? '·' : '✓') : '✗';
      return {
        rank: i + 1,
        category: i === 0 ? label : '',
        simPlayer: sim ? `${sim.name} (${teamAbbrev(sim.tid)})` : '—',
        simValue: sim ? fmtV(simV) : '—',
        nbaPlayer: `${r.name} (${r.team})`,
        nbaValue: fmtV(r.value),
        flag,
      };
    });
  };

  const ppgRows     = buildRows('ppg',     'pts',     'PPG',  'count');
  const rpgRows     = buildRows('rpg',     'reb',     'RPG',  'count');
  const apgRows     = buildRows('apg',     'ast',     'APG',  'count');
  const spgRows     = buildRows('spg',     'stl',     'SPG',  'count');
  const bpgRows     = buildRows('bpg',     'blk',     'BPG',  'count');
  const threePmRows = buildRows('threePm', 'threePm', '3PM',  'count');
  const fgaRows     = buildRows('fga',     'fga',     'FGA',  'count');

  // Team ranges
  const teamRows = state.teams
    .filter((t: any) => t.id < 100)
    .map((t: any) => {
      const tBoxes = (boxes as any[]).filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id);
      let pts = 0, fga = 0, fgm = 0, tpa = 0, tpm = 0, fta = 0, ftm = 0, gp = 0;
      tBoxes.forEach(g => {
        const isHome = g.homeTeamId === t.id;
        const lines = isHome ? g.homeStats : g.awayStats;
        const score = isHome ? g.homeScore : g.awayScore;
        if (!Array.isArray(lines) || lines.length === 0) return;
        gp++; pts += score || 0;
        lines.forEach((ps: any) => {
          fga += ps.fga || 0; fgm += ps.fgm || 0;
          tpa += ps.threePa || 0; tpm += ps.threePm || 0;
          fta += ps.fta || 0; ftm += ps.ftm || 0;
        });
      });
      return {
        name: t.name ?? t.abbrev,
        gp, ppg: gp > 0 ? pts / gp : 0,
        fgPct: fga > 0 ? fgm / fga : 0,
        threePct: tpa > 0 ? tpm / tpa : 0,
        ftPct: fta > 0 ? ftm / fta : 0,
        efgPct: fga > 0 ? (fgm + 0.5 * tpm) / fga : 0,
      };
    })
    .filter(t => t.gp > 0);

  const tMin = (k: keyof typeof teamRows[0]) => Math.min(...teamRows.map(t => t[k] as number));
  const tMax = (k: keyof typeof teamRows[0]) => Math.max(...teamRows.map(t => t[k] as number));
  const teamRangeRow = (label: string, simMin: number, simMax: number, bench: { min: number; max: number; top: string; bot: string }, fmt: 'count' | 'pct') => {
    const fmtV = (v: number) => fmt === 'pct' ? (v * 100).toFixed(1) + '%' : v.toFixed(1);
    const minOk = Math.abs(simMin - bench.min) / Math.max(0.01, bench.min) < 0.05;
    const maxOk = Math.abs(simMax - bench.max) / Math.max(0.01, bench.max) < 0.05;
    return {
      metric: label,
      simMin: fmtV(simMin),
      benchMin: `${fmtV(bench.min)} (${bench.bot})`,
      simMax: fmtV(simMax),
      benchMax: `${fmtV(bench.max)} (${bench.top})`,
      flag: minOk && maxOk ? '✓' : (minOk || maxOk) ? '·' : '⚠️',
    };
  };

  const teamRangeRows = [
    teamRangeRow('PPG',  tMin('ppg'),  tMax('ppg'),  BENCH_TEAM_RANGES.ppg,    'count'),
    teamRangeRow('FG%',  tMin('fgPct'),tMax('fgPct'),BENCH_TEAM_RANGES.fgPct,  'pct'),
    teamRangeRow('3P%',  tMin('threePct'),tMax('threePct'),BENCH_TEAM_RANGES.threePct,'pct'),
    teamRangeRow('FT%',  tMin('ftPct'),tMax('ftPct'),BENCH_TEAM_RANGES.ftPct,  'pct'),
    teamRangeRow('eFG%', tMin('efgPct'),tMax('efgPct'),BENCH_TEAM_RANGES.efgPct,'pct'),
  ];

  // Build TSV
  const allRows = [...ppgRows, ...rpgRows, ...apgRows, ...spgRows, ...bpgRows, ...threePmRows, ...fgaRows];
  const tsv = [
    'TOP 10 LEADERS (sim vs NBA 2025-26)',
    ['cat', 'rank', 'simPlayer', 'simValue', 'nbaPlayer', 'nbaValue', 'flag'].join('\t'),
    ...allRows.map(r => [r.category, r.rank, r.simPlayer, r.simValue, r.nbaPlayer, r.nbaValue, r.flag].join('\t')),
    '',
    'TEAM RANGES (min / max across 30 NBA teams)',
    ['metric', 'simMin', 'benchMin', 'simMax', 'benchMax', 'flag'].join('\t'),
    ...teamRangeRows.map(r => [r.metric, r.simMin, r.benchMin, r.simMax, r.benchMax, r.flag].join('\t')),
  ].join('\n');

  console.group(`🏆 SIMLEADERS — ${boxes.length} games, ${all.length} qualifying players (≥${gpFloor} GP)`);
  console.log('PPG leaders:');     console.table(ppgRows);
  console.log('RPG leaders:');     console.table(rpgRows);
  console.log('APG leaders:');     console.table(apgRows);
  console.log('SPG leaders:');     console.table(spgRows);
  console.log('BPG leaders:');     console.table(bpgRows);
  console.log('3PM leaders:');     console.table(threePmRows);
  console.log('FGA leaders:');     console.table(fgaRows);
  console.log('Team ranges:');     console.table(teamRangeRows);
  console.log('TSV:\n' + tsv);
  console.groupEnd();

  await copyTextToClipboard(tsv).catch(() => undefined);

  return {
    title: 'SIMLEADERS done',
    body: `${all.length} qualifying players, ${teamRows.length} teams. Top 10 leaders + team ranges logged. TSV in clipboard.`,
    ok: true,
  };
}

export function runSimTrace(): CheatResult {
  const g = globalThis as any;
  if (g.__realisticTrace) {
    g.__realisticTrace = undefined;
    console.log('🔇 Realistic possession trace OFF');
    return { title: 'SIMTRACE OFF', body: 'Possession trace disabled.', ok: true };
  }
  let n = 0;
  g.__realisticTrace = (end: any, side: 'home' | 'away') => {
    n++;
    if (end.kind === 'shot') {
      console.log(`#${n} [${side}] ${end.zone.padEnd(8)} ${end.made ? '✓' : '✗'} pts=${end.pts}${end.fouled ? ' FOULED' : ''}${end.assisterId ? ' ast' : ''}${end.blockerId ? ' BLK' : ''}`);
    } else if (end.kind === 'turnover') {
      console.log(`#${n} [${side}] TOV${end.stealerId ? ' STL' : ''}`);
    } else {
      console.log(`#${n} [${side}] FOUL fta=${end.ftAttempts} ftm=${end.ftMade}`);
    }
  };
  console.log('🎙️ Realistic possession trace ON — every possession of the next sim will log here. Run SIMTRACE again to disable.');
  return { title: 'SIMTRACE ON', body: 'Trace enabled. Watch a game or run SIMBENCH; every possession will log to console.', ok: true };
}


