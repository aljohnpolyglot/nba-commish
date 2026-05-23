import type { GameState } from '../../types';
import { copyTextToClipboard, type CheatResult } from './shared';

export async function runPerSample(state: GameState): Promise<CheatResult> {
  const ls = state.leagueStats ?? {};
  const currentYear = (ls as any).year ?? new Date().getFullYear();
  const teams = state.teams ?? [];
  const abbrev = (tid: number) => (teams.find((t: any) => t.id === tid) as any)?.abbrev ?? `T${tid}`;

  type Row = {
    name: string;
    team: string;
    gp: number;
    gs: number;
    mpg: number;
    seasonPer: number;
    recomputedPer: number;
    diff: number;
    minTotal: number;
    sampleGames: string;
  };

  const rows: Row[] = [];
  for (const p of (state.players ?? [])) {
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;
    const stats = ((p as any).stats as any[] | undefined ?? [])
      .filter(s => s.season === currentYear && !s.playoffs && s.tid === p.tid);
    if (stats.length === 0) continue;

    let gp = 0;
    let gs = 0;
    let minTotal = 0;
    let weightedPerSum = 0;
    const gameSamples: Array<{ min: number; per: number }> = [];

    for (const s of stats) {
      const statGp = s.gp ?? 0;
      const statGs = s.gs ?? 0;
      const statMin = s.min ?? 0;
      const statPer = s.per ?? 0;
      gp += statGp;
      gs += statGs;
      minTotal += statMin;
      weightedPerSum += statPer * statMin;

      const minPerGame = statGp > 0 ? statMin / statGp : 0;
      for (let i = 0; i < statGp; i++) {
        gameSamples.push({ min: minPerGame, per: statPer });
      }
    }

    if (gp <= 0 || minTotal <= 0) continue;
    const seasonStat = stats[0];
    const seasonPer = seasonStat.per ?? 0;
    const recomputedPer = weightedPerSum / minTotal;
    const shuffledSamples = [...gameSamples].slice(-3).map(g => `${g.per.toFixed(1)}@${g.min.toFixed(1)}m`).join(' | ');

    rows.push({
      name: p.name,
      team: abbrev(p.tid),
      gp,
      gs,
      mpg: minTotal / gp,
      seasonPer,
      recomputedPer,
      diff: seasonPer - recomputedPer,
      minTotal,
      sampleGames: shuffledSamples || '-',
    });
  }

  if (rows.length < 30) {
    return { title: 'PERSAMPLE', body: `Only ${rows.length} eligible players found in ${currentYear}.`, ok: false };
  }

  const shuffled = [...rows];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const sample = shuffled.slice(0, 30).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const bad = sample.filter(r => Math.abs(r.diff) >= 1.5).length;

  const lines: string[] = [];
  lines.push(`PERSAMPLE — random 30-player PER audit for season ${currentYear}`);
  lines.push('season PER = currently stored value on player.stats row');
  lines.push('recomputed PER = minute-weighted recompute from the current season stat rows');
  lines.push('');
  lines.push('name\tteam\tGP\tGS\tMPG\tstoredPER\trecomputedPER\tdiff\tminTotal\trecentGameSamples');
  sample.forEach(r => lines.push([
    r.name,
    r.team,
    r.gp,
    r.gs,
    r.mpg.toFixed(1),
    r.seasonPer.toFixed(2),
    r.recomputedPer.toFixed(2),
    r.diff >= 0 ? `+${r.diff.toFixed(2)}` : r.diff.toFixed(2),
    r.minTotal.toFixed(1),
    r.sampleGames,
  ].join('\t')));
  lines.push('');
  lines.push('=== DIAGNOSTIC ===');
  if (bad === 0) {
    lines.push('✅ Sample shows stored PER closely matches minute-weighted recompute.');
  } else {
    lines.push(`⚠️ ${bad}/30 sampled players differ by at least 1.5 PER — stale save or bad season aggregation likely.`);
  }

  const tsv = lines.join('\n');
  console.log(tsv);
  await copyTextToClipboard(tsv);
  return {
    title: 'PERSAMPLE',
    body: `30 random players dumped. ${bad} with |diff| >= 1.5. Console + clipboard.`,
    ok: bad === 0,
  };
}

// ─── Entry: detect + trigger ─────────────────────────────────────────────────

/**
 * Try to match an input to a cheat code. Case-insensitive, trimmed, ignores spaces.
 * Returns the matched CheatCode, or null if no match.
 */

