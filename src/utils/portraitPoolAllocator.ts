import { NEWGEN_FEMALE_IDS, NEWGEN_MALE_IDS, NEWGEN_PORTRAIT_BASE } from '../data/newgenPortraits';
import { REGEN_HAIR_BASE, REGEN_HAIR_FOLDERS } from '../data/portraitPackCatalog';

export type PortraitGender = 'male' | 'female';
export type PortraitRace = 'black' | 'asian' | 'brown' | 'white';

export function hashPortraitSeed(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function portraitUsageKey(url: string): string {
  const clean = decodeURIComponent(url.split(/[?#]/)[0] ?? url).replace(/\\/g, '/');
  const parts = clean.split('/').filter(Boolean);
  if (clean.includes('/ng-regens-staff/')) return `staff:${parts.slice(-3).join('/')}`;
  if (clean.includes('/playerfaces_regen_replacements/hair/')) return `hair:${parts.slice(-4).join('/')}`;
  return `player:${parts.at(-1) ?? clean}`;
}

export function createPortraitUsageSet(urls: Iterable<string | undefined | null> = []): Set<string> {
  const used = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    used.add(url);
    used.add(portraitUsageKey(url));
  }
  return used;
}

export function claimPortraitUrl(url: string, used: Set<string>): string | null {
  const key = portraitUsageKey(url);
  if (used.has(url) || used.has(key)) return null;
  used.add(url);
  used.add(key);
  return url;
}

export function claimGenericPortraitUrl(seed: string, gender: PortraitGender, used: Set<string>): string | null {
  const pool = gender === 'female' ? NEWGEN_FEMALE_IDS : NEWGEN_MALE_IDS;
  const start = hashPortraitSeed(seed) % pool.length;
  for (let offset = 0; offset < pool.length; offset++) {
    const id = pool[(start + offset) % pool.length];
    if (!id) continue;
    const claimed = claimPortraitUrl(`${NEWGEN_PORTRAIT_BASE}/portrait_${gender}-${id}.png`, used);
    if (claimed) return claimed;
  }
  return null;
}

export function claimHairPortraitUrl(seed: string, race: PortraitRace, used: Set<string>): string | null {
  if (race === 'brown') return null;
  const ranges = REGEN_HAIR_FOLDERS[race];
  const total = ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0);
  const start = hashPortraitSeed(seed) % total;
  for (let offset = 0; offset < total; offset++) {
    let ordinal = (start + offset) % total;
    let selected = ranges[0];
    for (const range of ranges) {
      const count = range.last - range.first + 1;
      if (ordinal < count) {
        selected = range;
        break;
      }
      ordinal -= count;
    }
    if (!selected) continue;
    const filename = `${selected.prefix}${selected.first + ordinal}.png`;
    const claimed = claimPortraitUrl(`${REGEN_HAIR_BASE}/${selected.path}/${filename}`, used);
    if (claimed) return claimed;
  }
  return null;
}
