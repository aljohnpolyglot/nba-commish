import { getPlayerStatIdentityKey } from './playerStatIdentity';

export function mergePlayerStats(primaryStats: any[] | undefined, historyStats: any[] | undefined) {
  const merged = [...(primaryStats ?? []), ...(historyStats ?? [])];
  const byKey = new Map<string, any>();
  for (const row of merged) {
    if (!row) continue;
    const key = getPlayerStatIdentityKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const preferred = (row.gp ?? 0) > (existing.gp ?? 0) ? row : existing;
    const fallback = preferred === row ? existing : row;
    byKey.set(key, {
      ...fallback,
      ...preferred,
      jerseyNumber: preferred.jerseyNumber ?? fallback.jerseyNumber,
    });
  }
  return Array.from(byKey.values()).sort((left, right) =>
    (left.season - right.season)
    || ((left.playoffs ? 1 : 0) - (right.playoffs ? 1 : 0))
    || ((left.tid ?? 0) - (right.tid ?? 0))
  );
}

export function mergePlayerRatings(primaryRatings: any[] | undefined, historyRatings: any[] | undefined) {
  const primary = [...(primaryRatings ?? [])];
  const existingSeasons = new Set(primary
    .map(row => Number(row?.season ?? 0))
    .filter(season => season > 0));
  const historical = (historyRatings ?? []).filter(row => {
    const season = Number(row?.season ?? 0);
    return season > 0 && !existingSeasons.has(season);
  });
  return [...historical, ...primary].sort((left, right) => Number(left?.season ?? 0) - Number(right?.season ?? 0));
}

export function mergeSeasonAwards(primaryAwards: any[] | undefined, historyAwards: any[] | undefined) {
  const seen = new Set<string>();
  return [...(primaryAwards ?? []), ...(historyAwards ?? [])].filter(award => {
    const key = `${award?.season ?? 0}|${award?.type ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergePlayerTransactions(primaryTransactions: any[] | undefined, historyTransactions: any[] | undefined) {
  const seen = new Set<string>();
  return [...(primaryTransactions ?? []), ...(historyTransactions ?? [])].filter(transaction => {
    const key = `${transaction?.season ?? 0}|${transaction?.tid ?? -999}|${transaction?.type ?? ''}|${transaction?.phase ?? ''}|${transaction?.pickNum ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergePlayerSalaries(primarySalaries: any[] | undefined, historySalaries: any[] | undefined) {
  const byIdentity = new Map<string, any>();
  const teamKey = (salary: any) => Number(salary?.tid ?? -1) >= 0
    ? `tid:${Number(salary.tid)}`
    : String(salary?.teamAbbrev ?? '').trim().toUpperCase()
      ? `abbr:${String(salary.teamAbbrev).trim().toUpperCase()}`
      : 'unknown';
  const scopeKey = (salary: any) => [
    String(salary?.competitionId ?? '').trim().toLowerCase(),
    String(salary?.conference ?? '').trim().toLowerCase(),
    String(salary?.type ?? '').trim().toLowerCase(),
  ].join('|');
  const identityKey = (salary: any) => `${Number(salary?.season ?? 0)}|${teamKey(salary)}|${scopeKey(salary)}`;
  for (const salary of [...(historySalaries ?? []), ...(primarySalaries ?? [])]) {
    const season = Number(salary?.season ?? 0);
    if (season <= 0) continue;
    const key = identityKey(salary);
    const scope = scopeKey(salary);
    const amount = Number(salary?.amount ?? 0);
    const abbrev = String(salary?.teamAbbrev ?? '').trim().toUpperCase();
    const equivalentExistingKey = [...byIdentity.entries()].find(([candidateKey, candidate]) => {
      if (!candidateKey.startsWith(`${season}|`) || Number(candidate.amount ?? 0) !== amount) return false;
      const candidateAbbrev = String(candidate?.teamAbbrev ?? '').trim().toUpperCase();
      return !!abbrev && candidateAbbrev === abbrev;
    })?.[0];
    if (equivalentExistingKey && equivalentExistingKey !== key) byIdentity.delete(equivalentExistingKey);
    if (teamKey(salary) !== 'unknown') {
      for (const [candidateKey, candidate] of byIdentity.entries()) {
        if (
          candidateKey.startsWith(`${season}|unknown|`)
          && Number(candidate.amount ?? 0) === amount
        ) byIdentity.delete(candidateKey);
      }
    } else {
      const concrete = [...byIdentity.entries()].find(([candidateKey, candidate]) =>
        candidateKey.startsWith(`${season}|`)
        && teamKey(candidate) !== 'unknown'
        && Number(candidate.amount ?? 0) === amount,
      );
      if (concrete) continue;
    }
    byIdentity.set(key, salary);
  }
  return [...byIdentity.values()].sort((left, right) =>
    Number(left.season) - Number(right.season)
    || teamKey(left).localeCompare(teamKey(right))
    || scopeKey(left).localeCompare(scopeKey(right)),
  );
}

export function mergePlayerSourceIds(
  primarySourceIds: Record<string, string | string[]> | undefined,
  historySourceIds: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> {
  const merged: Record<string, string | string[]> = {};
  for (const sourceIds of [historySourceIds, primarySourceIds]) {
    for (const [namespace, rawValue] of Object.entries(sourceIds ?? {})) {
      const values = new Set(Array.isArray(merged[namespace]) ? merged[namespace] : merged[namespace] ? [merged[namespace] as string] : []);
      for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
        if (value) values.add(value);
      }
      merged[namespace] = values.size === 1 ? [...values][0] : [...values];
    }
  }
  return merged;
}

export function mergePlayerDraft(primaryDraft: any, historyDraft: any) {
  const primaryYear = Number(primaryDraft?.year ?? 0);
  const historyYear = Number(historyDraft?.year ?? 0);
  const primaryHasSelection = Number(primaryDraft?.round ?? 0) > 0 && Number(primaryDraft?.pick ?? 0) > 0;
  const historyHasSelection = Number(historyDraft?.round ?? 0) > 0 && Number(historyDraft?.pick ?? 0) > 0;
  if (historyHasSelection && !primaryHasSelection) return historyDraft;
  if (primaryYear > 0) return historyYear > 0 ? { ...historyDraft, ...primaryDraft } : primaryDraft;
  return historyYear > 0 ? historyDraft : primaryDraft;
}

export function isEligiblePlayerPortrait(value?: string): boolean {
  const url = String(value ?? '').trim();
  return url.length > 0
    && !/(head-par-defaut|blank-face|placeholder|logoman|no[-_ ]?photo|ui-avatars|flagcdn|logos-primary|logos-secondary)/i.test(url);
}

function isLowQualityPlayerPortrait(value?: string): boolean {
  return /(basketball\.realgm\.com|basketball-reference\.com|proballers\.com)/i.test(String(value ?? ''));
}

function preferPrimaryText(primary: unknown, history: unknown): unknown {
  return typeof primary === 'string' && primary.trim().length === 0 ? history : primary ?? history;
}

export function mergePlayerCareer(
  primary: any,
  history?: any,
  options: { preferHistoryPortrait?: boolean } = {},
) {
  if (!history) return primary;
  const shouldPreferHistoryPortrait = options.preferHistoryPortrait
    || (isLowQualityPlayerPortrait(primary.imgURL) && isEligiblePlayerPortrait(history.imgURL) && !isLowQualityPlayerPortrait(history.imgURL));
  const imgURL = shouldPreferHistoryPortrait && isEligiblePlayerPortrait(history.imgURL)
    ? history.imgURL
    : primary.imgURL ?? history.imgURL;
  return {
    ...history,
    ...primary,
    imgURL,
    personId: primary.personId ?? history.personId,
    sourceIds: mergePlayerSourceIds(primary.sourceIds, history.sourceIds),
    born: primary.born ?? history.born,
    nationality: primary.nationality ?? history.nationality,
    college: preferPrimaryText(primary.college, history.college),
    draft: mergePlayerDraft(primary.draft, history.draft),
    awards: mergeSeasonAwards(primary.awards, history.awards),
    transactions: mergePlayerTransactions(primary.transactions, history.transactions),
    salaries: mergePlayerSalaries(primary.salaries, history.salaries),
    ratings: mergePlayerRatings(primary.ratings, history.ratings),
    stats: mergePlayerStats(primary.stats, history.stats),
  };
}
