import { calculateK2, K2_CATS, type K2Data } from './convert2kAttributes';

export const K2_CORE_RATING_KEYS = [
  'hgt', 'stre', 'spd', 'jmp', 'endu',
  'ins', 'dnk', 'ft', 'fg', 'tp',
  'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

export const K2_PROJECTABLE_RATING_KEYS = K2_CORE_RATING_KEYS.filter(key => key !== 'hgt');

export type K2CoreRatingKey = typeof K2_CORE_RATING_KEYS[number];
export type K2CategoryKey = keyof K2Data;
export type K2DetailOffsets = Partial<Record<K2CategoryKey, number[]>>;

export interface K2Physicals {
  pos?: string;
  heightIn?: number;
  weightLbs?: number;
  age?: number;
}

export interface K2ProjectionResult {
  ratings: Record<string, number>;
  detailOffsets: K2DetailOffsets;
  projectedK2: K2Data;
}

const clampK2 = (value: number) => Math.max(25, Math.min(99, Math.round(value)));
const clampCore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const detailKey = (category: K2CategoryKey, index: number) => `${category}.${index}`;

export function getK2DetailAttributeKey(category: K2CategoryKey, index: number): string {
  return detailKey(category, index);
}

function copyK2(k2: K2Data): K2Data {
  return Object.fromEntries(
    (Object.keys(k2) as K2CategoryKey[]).map(key => [
      key,
      { sub: [...k2[key].sub], ovr: k2[key].ovr },
    ]),
  ) as unknown as K2Data;
}

function recalculateCategory(category: { sub: number[]; ovr: number }) {
  category.ovr = Math.round(
    category.sub.reduce((sum, value) => sum + value, 0) / Math.max(1, category.sub.length),
  );
}

export function normalizeK2DetailOffsets(value: unknown): K2DetailOffsets {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const normalized: K2DetailOffsets = {};
  for (const category of K2_CATS) {
    if (category.k === 'MI') continue;
    const raw = source[category.k];
    if (!Array.isArray(raw)) continue;
    const offsets = category.sub.map((_, index) => {
      const offset = Number(raw[index]);
      return Number.isFinite(offset) ? Math.max(-74, Math.min(74, Math.round(offset))) : 0;
    });
    if (offsets.some(offset => offset !== 0)) normalized[category.k] = offsets;
  }
  return normalized;
}

export function hasK2DetailOffsets(value: unknown): boolean {
  return Object.values(normalizeK2DetailOffsets(value)).some(offsets =>
    offsets?.some(offset => offset !== 0),
  );
}

export function getK2DetailSignature(value: unknown): string {
  const offsets = normalizeK2DetailOffsets(value);
  return K2_CATS
    .filter(category => category.k !== 'MI')
    .map(category => `${category.k}:${offsets[category.k]?.join(',') ?? ''}`)
    .join('|');
}

export function getK2DetailedAttributeKeys(value: unknown): Set<string> {
  const offsets = normalizeK2DetailOffsets(value);
  const keys = new Set<string>();
  for (const category of K2_CATS) {
    const categoryOffsets = offsets[category.k];
    categoryOffsets?.forEach((offset, index) => {
      if (offset !== 0) keys.add(detailKey(category.k, index));
    });
  }
  return keys;
}

export function applyK2DetailOffsets(base: K2Data, value: unknown): K2Data {
  const offsets = normalizeK2DetailOffsets(value);
  if (!hasK2DetailOffsets(offsets)) return base;
  const resolved = copyK2(base);
  for (const category of K2_CATS) {
    const categoryOffsets = offsets[category.k];
    if (!categoryOffsets) continue;
    resolved[category.k].sub = resolved[category.k].sub.map((rating, index) =>
      clampK2(rating + (categoryOffsets[index] ?? 0)),
    );
    recalculateCategory(resolved[category.k]);
  }
  return resolved;
}

export function deriveK2DetailOffsets(base: K2Data, desired: K2Data): K2DetailOffsets {
  const offsets: K2DetailOffsets = {};
  for (const category of K2_CATS) {
    if (category.k === 'MI') continue;
    const categoryOffsets = category.sub.map((_, index) => {
      const baseValue = base[category.k].sub[index] ?? 50;
      const desiredValue = desired[category.k].sub[index] ?? baseValue;
      return Math.round(clampK2(desiredValue) - baseValue);
    });
    if (categoryOffsets.some(offset => offset !== 0)) offsets[category.k] = categoryOffsets;
  }
  return offsets;
}

export function setK2DetailValue(
  base: K2Data,
  value: unknown,
  category: K2CategoryKey,
  index: number,
  nextValue: number,
): K2DetailOffsets {
  if (category === 'MI') return normalizeK2DetailOffsets(value);
  const desired = copyK2(applyK2DetailOffsets(base, value));
  const categoryData = desired[category];
  if (!categoryData || index < 0 || index >= categoryData.sub.length) {
    return normalizeK2DetailOffsets(value);
  }
  categoryData.sub[index] = clampK2(nextValue);
  recalculateCategory(categoryData);
  return deriveK2DetailOffsets(base, desired);
}

function defaultEvaluate(ratings: Record<string, number>, physicals?: K2Physicals): K2Data {
  return calculateK2(ratings as any, physicals);
}

export function projectK2ToCoreRatings({
  ratings,
  desiredK2,
  physicals,
  evaluate,
  authoredAttributes,
}: {
  ratings: Record<string, number>;
  desiredK2: K2Data;
  physicals?: K2Physicals;
  evaluate?: (candidate: Record<string, number>) => K2Data;
  authoredAttributes?: Iterable<string>;
}): K2ProjectionResult {
  const initial = { ...ratings };
  const run = evaluate ?? ((candidate: Record<string, number>) => defaultEvaluate(candidate, physicals));
  const initialK2 = run(initial);
  const explicitAuthoredKeys = authoredAttributes == null ? null : new Set(authoredAttributes);
  const authoredKeys = explicitAuthoredKeys ?? new Set<string>();
  if (!explicitAuthoredKeys) {
    for (const category of K2_CATS) {
      if (category.k === 'MI') continue;
      category.sub.forEach((_, index) => {
        if ((desiredK2[category.k].sub[index] ?? 50) !== (initialK2[category.k].sub[index] ?? 50)) {
          authoredKeys.add(detailKey(category.k, index));
        }
      });
    }
  }

  const score = (candidate: Record<string, number>) => {
    const candidateK2 = run(candidate);
    let total = 0;
    for (const category of K2_CATS) {
      if (category.k === 'MI') continue;
      category.sub.forEach((_, index) => {
        const delta = (candidateK2[category.k].sub[index] ?? 50) - (desiredK2[category.k].sub[index] ?? 50);
        const weight = authoredKeys.has(detailKey(category.k, index))
          ? 12
          : explicitAuthoredKeys ? 0 : 1;
        total += delta * delta * weight;
      });
    }
    for (const key of K2_PROJECTABLE_RATING_KEYS) {
      const delta = (candidate[key] ?? 50) - (initial[key] ?? 50);
      total += delta * delta * 0.04;
    }
    return total;
  };

  const candidate = { ...initial };
  let bestScore = score(candidate);
  for (const step of [8, 4, 2, 1]) {
    for (let round = 0; round < 3; round += 1) {
      let improved = false;
      for (const key of K2_PROJECTABLE_RATING_KEYS) {
        const current = candidate[key] ?? 50;
        let keyBest = current;
        let keyScore = bestScore;
        for (const direction of [-1, 1]) {
          const next = clampCore(current + direction * step);
          if (next === current) continue;
          candidate[key] = next;
          const nextScore = score(candidate);
          if (nextScore < keyScore) {
            keyBest = next;
            keyScore = nextScore;
          }
        }
        candidate[key] = keyBest;
        if (keyScore < bestScore) {
          bestScore = keyScore;
          improved = true;
        }
      }
      if (!improved) break;
    }
  }

  const projectedK2 = run(candidate);
  return {
    ratings: candidate,
    projectedK2,
    detailOffsets: deriveK2DetailOffsets(projectedK2, desiredK2),
  };
}
