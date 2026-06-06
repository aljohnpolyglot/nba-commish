import type { NBAPlayer as Player, NBATeam as Team } from '../../types';
import { getTeamRotationManagementEffects } from '../staff/staffGameplayEffects';

function latestQualifiedStat(player: Player, season: number): { per: number; gp: number; mpg: number } | null {
  const rows = ((player as any).stats ?? []).filter((s: any) => s.season === season && !s.playoffs && (s.gp ?? 0) > 0);
  if (rows.length === 0) return null;
  const gp = rows.reduce((sum: number, s: any) => sum + ((s.gp as number) ?? 0), 0);
  const minSum = rows.reduce((sum: number, s: any) => sum + ((s.min as number) ?? 0), 0);
  if (gp < 5 || (gp > 0 && minSum / gp < 5)) return null;
  const per = minSum > 0
    ? rows.reduce((sum: number, s: any) => sum + ((s.per as number) ?? 0) * ((s.min as number) ?? 0), 0) / minSum
    : 15;
  return { per, gp, mpg: gp > 0 ? minSum / gp : 0 };
}

function stableNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function playerPoliticsScore(player: Player, teamId: number): number {
  const salaryM = Math.max(0, Number(player.contract?.amount ?? 0) / 1000);
  const salaryScore = Math.min(1, salaryM / 35);
  const veteranScore = Math.max(0, Math.min(1, ((player.age ?? 26) - 28) / 8));
  const pick = player.draft?.pick;
  const draftScore = player.draft?.round === 1
    ? Math.max(0, Math.min(1, (31 - (pick ?? 30)) / 30))
    : 0;
  const homegrown = player.draft?.tid === teamId || player.draft?.originalTid === teamId ? 0.35 : 0;
  return salaryScore * 0.45 + veteranScore * 0.25 + draftScore * 0.20 + homegrown;
}

export function applyManManagementToPool(team: Team, pool: Player[], season: number): Player[] {
  if (pool.length === 0) return pool;
  const effects = getTeamRotationManagementEffects(team as any);
  if (Math.abs(effects.perTrust - 1) < 0.01 && effects.politicsBias <= 0.01 && effects.orderNoise <= 0.01) return pool;

  const samples = pool.map(player => latestQualifiedStat(player, season)).filter((stat): stat is { per: number; gp: number; mpg: number } => !!stat);
  const leaguePERAvg = samples.length > 0
    ? samples.reduce((sum, stat) => sum + stat.per, 0) / samples.length
    : 15;

  return pool.map(player => {
    const stat = latestQualifiedStat(player, season);
    const perDelta = stat ? Math.max(-5, Math.min(5, (stat.per - leaguePERAvg) / 2.2)) : 0;
    const politics = playerPoliticsScore(player, team.id) * effects.politicsBias;
    const noise = stableNoise(`${team.id}:${season}:${player.internalId}:rotation`) * effects.orderNoise;
    const managedDelta = perDelta * effects.perTrust + politics + noise;
    return {
      ...player,
      overallRating: Math.max(20, Math.min(100, (player.overallRating ?? 50) + managedDelta)),
    };
  });
}
