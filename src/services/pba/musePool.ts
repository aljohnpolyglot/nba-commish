const PBA_MUSE_POOL_PATH = '/data/pba/muses/pba-muse-decade-pools.json';
const PBA_MUSE_ASSET_ROOT = '/data/pba/muses/';

export interface PbaMuseCandidate {
  id: string;
  name: string;
  occupation?: string;
  imageUrl?: string;
  eligibleFromYear: number;
  eligibleToYear: number;
  targetPortraitYear?: number;
  isFictional?: boolean;
  museRatings?: Record<string, number>;
}

export interface PbaMuseSelection {
  season: number;
  museId: string;
  teamId?: number;
  selectedAt: string;
}

type MuseTemplate = {
  id: string;
  templateSlot: number;
  occupation?: string;
  imageUrl?: string;
  museRatings?: Record<string, number>;
};

type MusePayload = {
  defaultCandidateCount?: number;
  repeatCooldownYears?: number;
  muses?: PbaMuseCandidate[];
  futureFictionalMuseTemplates?: MuseTemplate[];
  futureFictionalMuseGenerator?: {
    startYear?: number;
    periodYears?: number;
    generatedIdentity?: { birthYearFormula?: string };
    nameBanks?: {
      firstNames?: string[];
      middleInitials?: string[];
      lastNames?: string[];
    };
  };
};

let cachedPayload: MusePayload | null = null;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function assetUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `${PBA_MUSE_ASSET_ROOT}${value.replace(/^[/\\]+/, '')}`;
}

async function loadPayload(): Promise<MusePayload> {
  if (cachedPayload) return cachedPayload;
  const response = await fetch(PBA_MUSE_POOL_PATH);
  if (!response.ok) throw new Error(`${PBA_MUSE_POOL_PATH}: HTTP ${response.status}`);
  cachedPayload = await response.json() as MusePayload;
  return cachedPayload;
}

function generatedFuturePool(payload: MusePayload, season: number): PbaMuseCandidate[] {
  const generator = payload.futureFictionalMuseGenerator;
  const templates = payload.futureFictionalMuseTemplates ?? [];
  const startYear = generator?.startYear ?? 2030;
  const periodYears = generator?.periodYears ?? 10;
  const periodStart = startYear + Math.floor((season - startYear) / periodYears) * periodYears;
  const firstNames = generator?.nameBanks?.firstNames ?? ['Maria'];
  const middleInitials = generator?.nameBanks?.middleInitials ?? ['A'];
  const lastNames = generator?.nameBanks?.lastNames ?? ['Santos'];
  const periodIndex = Math.max(0, Math.floor((periodStart - startYear) / periodYears));

  return templates.map((template, index) => {
    const identityIndex = periodIndex * templates.length + index;
    const firstName = firstNames[identityIndex % firstNames.length];
    const middleInitial = middleInitials[Math.floor(identityIndex / firstNames.length) % middleInitials.length];
    const lastName = lastNames[
      Math.floor(identityIndex / Math.max(1, firstNames.length * middleInitials.length)) % lastNames.length
    ];
    return {
      id: `pba_future_muse_${periodStart}_${String(index + 1).padStart(3, '0')}`,
      name: `${firstName} ${middleInitial}. ${lastName}`,
      occupation: template.occupation,
      imageUrl: assetUrl(template.imageUrl),
      eligibleFromYear: periodStart,
      eligibleToYear: periodStart + periodYears - 1,
      targetPortraitYear: periodStart + Math.floor(periodYears / 2),
      isFictional: true,
      museRatings: template.museRatings,
    };
  });
}

export async function getPbaMuseCandidates(
  season: number,
  previousSelections: PbaMuseSelection[] = [],
  limit?: number,
): Promise<PbaMuseCandidate[]> {
  const payload = await loadPayload();
  const generatorStart = payload.futureFictionalMuseGenerator?.startYear ?? 2030;
  const pool = season >= generatorStart
    ? generatedFuturePool(payload, season)
    : (payload.muses ?? [])
      .filter(muse => muse.eligibleFromYear <= season && muse.eligibleToYear >= season)
      .map(muse => ({ ...muse, imageUrl: assetUrl(muse.imageUrl) }));
  const cooldownYears = payload.repeatCooldownYears ?? 3;
  const recentIds = new Set(previousSelections
    .filter(selection => selection.season >= season - cooldownYears)
    .map(selection => selection.museId));
  return pool
    .filter(muse => !recentIds.has(muse.id))
    .map(muse => ({ muse, order: hashSeed(`${season}:${muse.id}`) }))
    .sort((left, right) => left.order - right.order)
    .slice(0, limit ?? payload.defaultCandidateCount ?? 12)
    .map(row => row.muse);
}

export async function getPbaMusePoolForSeason(season: number): Promise<PbaMuseCandidate[]> {
  const payload = await loadPayload();
  const generatorStart = payload.futureFictionalMuseGenerator?.startYear ?? 2030;
  if (season >= generatorStart) return generatedFuturePool(payload, season);
  return (payload.muses ?? [])
    .filter(muse => muse.eligibleFromYear <= season && muse.eligibleToYear >= season)
    .map(muse => ({ ...muse, imageUrl: assetUrl(muse.imageUrl) }));
}
