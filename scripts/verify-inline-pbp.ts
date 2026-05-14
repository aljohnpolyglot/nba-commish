// Verify AC1+AC2 for the new inline-pbp synthesizer.
// Run with: npx tsx scripts/verify-inline-pbp.ts
//
// Mocks a finished game with the bug-repro numbers (HOME 107, AWAY 99),
// invokes synthesizeInlinePbp, and asserts:
//   AC1: last play.cs === 107 && last play.ds === 99
//   AC2: Σ pts per quarter per team === quarterScores per quarter per team

import { synthesizeInlinePbp } from '../src/services/simulation/inline-pbp/InlinePbpSynthesizer';
import type { PlayerGameStats } from '../src/services/simulation/types';
import type { NBAPlayer } from '../src/types';

const NUM_QUARTERS = 4;
const QUARTER_LENGTH = 720; // 12:00 in seconds
const OT_LENGTH = 300;

const timingConfig = {
  numQuarters: NUM_QUARTERS,
  quarterLengthSeconds: QUARTER_LENGTH,
  overtimeLengthSeconds: OT_LENGTH,
};

// Bug-repro quarter scores: HOME 107, AWAY 99 (107=27+28+24+28, 99=24+22+27+26)
const quarterScores = {
  home: [27, 28, 24, 28],
  away: [24, 22, 27, 26],
};

// Build 10 mock players per team with stats summing to quarter totals.
function mockPlayer(id: number, name: string, pos: 'G' | 'F' | 'C'): NBAPlayer {
  return {
    internalId: id,
    name,
    pos,
    imgURL: '',
  } as unknown as NBAPlayer;
}

// Each team gets stats that sum to the correct point total via fgm/threePm/ftm.
function mockStatsForTeam(totalPts: number, startId: number, teamLabel: string): { stats: PlayerGameStats[], players: NBAPlayer[] } {
  // 8 players: 2 stars at ~25 pts, 3 starters at ~12, 3 bench at ~5
  const distribution = [
    { name: `${teamLabel}_Star1`, pts: Math.round(totalPts * 0.25), pos: 'G' as const },
    { name: `${teamLabel}_Star2`, pts: Math.round(totalPts * 0.20), pos: 'F' as const },
    { name: `${teamLabel}_S3`,    pts: Math.round(totalPts * 0.15), pos: 'F' as const },
    { name: `${teamLabel}_S4`,    pts: Math.round(totalPts * 0.12), pos: 'C' as const },
    { name: `${teamLabel}_S5`,    pts: Math.round(totalPts * 0.10), pos: 'G' as const },
    { name: `${teamLabel}_B6`,    pts: Math.round(totalPts * 0.08), pos: 'G' as const },
    { name: `${teamLabel}_B7`,    pts: Math.round(totalPts * 0.06), pos: 'F' as const },
    { name: `${teamLabel}_B8`,    pts: Math.round(totalPts * 0.04), pos: 'C' as const },
  ];

  // Patch sum to exact totalPts via last player
  const sum = distribution.reduce((s, p) => s + p.pts, 0);
  distribution[distribution.length - 1].pts += (totalPts - sum);

  const stats: PlayerGameStats[] = [];
  const players: NBAPlayer[] = [];

  distribution.forEach((d, i) => {
    const pid = startId + i;
    players.push(mockPlayer(pid, d.name, d.pos));

    // Decompose pts into fg2/fg3/ftm. Simple: ~30% 3s, ~10% FTs, rest 2s.
    const tpm = Math.floor((d.pts * 0.30) / 3);
    const ftm = Math.floor(d.pts * 0.10);
    const remaining = d.pts - tpm * 3 - ftm;
    const fg2m = Math.floor(remaining / 2);
    // Round-off: nudge ftm if 1pt drift
    const realPts = fg2m * 2 + tpm * 3 + ftm;
    const ftmAdjusted = ftm + (d.pts - realPts);

    const fga = fg2m * 2 + tpm; // 50% accuracy
    const tpa = tpm * 3;        // 33% accuracy
    const fta = ftmAdjusted + 1; // 1 miss

    stats.push({
      playerId: pid.toString(),
      name: d.name,
      fgm: fg2m + tpm,
      fga: fga + tpa - tpm,
      threePm: tpm,
      threePa: tpa,
      ftm: Math.max(0, ftmAdjusted),
      fta: Math.max(0, ftmAdjusted + 1),
      ast: Math.floor(d.pts * 0.15),
      orb: Math.floor(d.pts * 0.05),
      drb: Math.floor(d.pts * 0.15),
      stl: Math.floor(d.pts * 0.04),
      blk: Math.floor(d.pts * 0.03),
      tov: Math.floor(d.pts * 0.06),
      pf: Math.floor(d.pts * 0.05),
      pm: 0,
      min: 28,
    } as unknown as PlayerGameStats);
  });

  return { stats, players };
}

async function main() {
  const home = mockStatsForTeam(107, 1000, 'HOME');
  const away = mockStatsForTeam(99, 2000, 'AWAY');

  const plays = await synthesizeInlinePbp({
    homeStats: home.stats,
    awayStats: away.stats,
    players: [...home.players, ...away.players],
    quarterScores,
    otCount: 0,
    gameWinner: undefined,
    homeTeamName: 'HOME',
    awayTeamName: 'AWAY',
    timingConfig,
  });

  console.log(`\n=== inline-pbp verification ===`);
  console.log(`Total plays emitted: ${plays.length}`);

  // AC1: last play running scores
  const last = plays[plays.length - 1];
  const ac1Pass = last.cs === 107 && last.ds === 99;
  console.log(`AC1: last play cs=${last.cs} ds=${last.ds} (target 107-99) — ${ac1Pass ? '✅ PASS' : '❌ FAIL'}`);

  // AC2: per-quarter totals from event stream
  const perQ: { h: number[]; a: number[] } = { h: [0, 0, 0, 0], a: [0, 0, 0, 0] };
  plays.forEach(p => {
    if (p.q >= 1 && p.q <= 4 && p.pts > 0) {
      if (p.tm === 'HOME') perQ.h[p.q - 1] += p.pts;
      else if (p.tm === 'AWAY') perQ.a[p.q - 1] += p.pts;
    }
  });
  let ac2Pass = true;
  for (let q = 0; q < 4; q++) {
    const hOk = perQ.h[q] === quarterScores.home[q];
    const aOk = perQ.a[q] === quarterScores.away[q];
    if (!hOk || !aOk) ac2Pass = false;
    console.log(`  Q${q + 1}: HOME ${perQ.h[q]}/${quarterScores.home[q]} ${hOk ? '✓' : '✗'} | AWAY ${perQ.a[q]}/${quarterScores.away[q]} ${aOk ? '✓' : '✗'}`);
  }
  console.log(`AC2: per-quarter pts === quarterScores — ${ac2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // Sanity: total event types
  const typeCounts: Record<string, number> = {};
  plays.forEach(p => { typeCounts[p.type] = (typeCounts[p.type] ?? 0) + 1; });
  console.log(`Event type breakdown:`, typeCounts);

  if (!ac1Pass || !ac2Pass) {
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exitCode = 1;
});
