import type { GameState } from '../../types';

function fmt(n: number): string {
  return '$' + (n / 1_000_000).toFixed(1) + 'M';
}

export async function runFaAudit(state: GameState) {
  const P = state.players;
  console.group('📋 FA Status Audit');

  const statusCounts: Record<string, number> = {};
  P.forEach(p => { statusCounts[(p as any).status ?? 'undefined'] = (statusCounts[(p as any).status ?? 'undefined'] || 0) + 1; });
  console.log('status distribution:');
  console.table(statusCounts);

  const tidMinus1 = P.filter(p => p.tid === -1);
  const byStatusAtTidNeg1: Record<string, number> = {};
  tidMinus1.forEach(p => { byStatusAtTidNeg1[(p as any).status ?? 'undefined'] = (byStatusAtTidNeg1[(p as any).status ?? 'undefined'] || 0) + 1; });
  console.log(`tid === -1 breakdown (${tidMinus1.length}):`);
  console.table(byStatusAtTidNeg1);

  const strictFA = P.filter(p => p.tid === -1 && (p as any).status === 'Free Agent');
  const looseFA = P.filter(p => p.tid < 0 && ['Free Agent', 'FreeAgent'].includes((p as any).status));
  console.log(`FA counts: strict=${strictFA.length} loose=${looseFA.length}`);

  if (strictFA.length > 0) {
    const buckets = { '85+': 0, '75-84': 0, '65-74': 0, '55-64': 0, '<55': 0 };
    strictFA.forEach(p => {
      const o = p.overallRating || 0;
      if (o >= 85) buckets['85+']++;
      else if (o >= 75) buckets['75-84']++;
      else if (o >= 65) buckets['65-74']++;
      else if (o >= 55) buckets['55-64']++;
      else buckets['<55']++;
    });
    console.log('OVR distribution:');
    console.table(buckets);
  }
  console.groupEnd();
}

// ─── Realistic-engine debug cheats ──────────────────────────────────────────


export async function runEconAudit(state: GameState) {
  console.group('💰 Economy Audit');
  const ls = state.leagueStats;
  const cap = ls.salaryCap || 0;
  const floorPct = (ls as any).minimumPayrollPercentage ?? 90;
  const floor = cap * (floorPct / 100);
  const userTid = state.gameMode === 'gm' ? (state as any).userTeamId : -999;

  const teamRows = state.teams.filter(t => t.id !== userTid).map(t => {
    const onTeam = state.players.filter(p => p.tid === t.id);
    const standard = onTeam.filter(p => !(p as any).twoWay);
    const twoWay = onTeam.filter(p => (p as any).twoWay);
    const payroll = onTeam.reduce((s, p) => s + (((p as any).contract?.amount || 0) * 1000), 0);
    return { abbrev: (t as any).abbrev ?? t.name, std: `${standard.length}/15`, tw: `${twoWay.length}/3`, payroll: fmt(payroll) };
  });

  console.log(`Cap: ${fmt(cap)} | Floor: ${fmt(floor)} (${floorPct}%)`);
  console.table(teamRows.slice(0, 30));
  console.groupEnd();
}

