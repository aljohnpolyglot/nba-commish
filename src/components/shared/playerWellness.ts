export function getMoodBarColor(score: number): string {
  if (score >= 5) return 'bg-emerald-400';
  if (score >= 1) return 'bg-amber-400';
  if (score >= -1) return 'bg-slate-400';
  return 'bg-rose-400';
}

export function getFatigueBarColor(fatigue: number): string {
  if (fatigue > 75) return 'bg-red-500';
  if (fatigue > 40) return 'bg-yellow-500';
  return 'bg-blue-500 shadow-[0_0_8px_#3b82f6]';
}

export function getFatigueTextColor(fatigue: number): string {
  if (fatigue > 75) return 'text-red-400';
  if (fatigue > 40) return 'text-yellow-400';
  return 'text-blue-400';
}

export function getInjuryRisk(fatigue: number): { label: string; color: string } {
  if (fatigue > 85) return { label: 'RED ZONE', color: 'text-red-500 font-bold bg-red-500/10 border-red-500/30' };
  if (fatigue > 70) return { label: 'HIGH', color: 'text-orange-500 font-bold bg-orange-500/10 border-orange-500/30' };
  if (fatigue > 50) return { label: 'MODERATE', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' };
  return { label: 'LOW', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' };
}
