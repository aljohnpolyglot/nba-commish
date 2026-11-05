const SKILL_KEYS = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'diq', 'oiq', 'drb', 'pss', 'reb'] as const;

export function discountHistoricalProspectRating<T extends { season?: number }>(rating: T, draftYear: number): T {
  // ponytail: user-approved 90% estimate for late/undated source skills; replace with dated pre-draft ratings when available.
  const adjusted = { ...rating, season: draftYear };
  for (const key of SKILL_KEYS) {
    const value = (rating as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      (adjusted as Record<string, unknown>)[key] = Math.round(value * 0.9);
    }
  }
  return adjusted;
}
