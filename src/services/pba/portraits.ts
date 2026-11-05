import rawPbaRosterData from '../../data/pba_full_roster_data.json';
import { NEWGEN_PORTRAIT_BASE } from '../../data/newgenPortraits';
import type { NBAPlayer } from '../../types';
import { getCanonicalPbaPlayerName, normalizePbaDraftPlayerName } from './pbaDraftArchive';
import { getCachedExternalPortraitCandidatesForName } from '../externalPortraitCatalog';
import { isLowQualityPlayerPortrait, isPba2021FallbackPortrait } from '../../utils/playerImage';

type PbaRosterEntry = {
  roster?: Array<{ name?: string; image?: string }>;
};

const normalizeName = (value: string): string =>
  normalizePbaDraftPlayerName(value);

const exactPortraits = new Map<string, string>();
const lastNamePortraits = new Map<string, string | null>();

for (const team of rawPbaRosterData as PbaRosterEntry[]) {
  for (const player of team.roster ?? []) {
    const name = String(player.name ?? '').trim();
    const image = String(player.image ?? '').trim();
    if (!name || !image) continue;
    exactPortraits.set(normalizeName(name), image);

    const lastName = normalizeName(name.split(/\s+/).at(-1) ?? '');
    if (!lastName) continue;
    if (lastNamePortraits.has(lastName)) lastNamePortraits.set(lastName, null);
    else lastNamePortraits.set(lastName, image);
  }
}

export function getPbaRosterPortrait(playerName: string | undefined, season?: number): string | undefined {
  const name = String(playerName ?? '').trim();
  if (!name) return undefined;
  const portraitNames = [...new Set([getCanonicalPbaPlayerName(name), name])];
  const candidates = [...new Set(portraitNames.flatMap(candidate => (
    getCachedExternalPortraitCandidatesForName('PBA', candidate, season)
  )))];
  const hdPortrait = candidates.find(candidate => (
    !isLowQualityPlayerPortrait(candidate) && !isPba2021FallbackPortrait(candidate)
  ));
  if (hdPortrait) return hdPortrait;
  const exact = exactPortraits.get(normalizeName(name));
  if (exact && !isLowQualityPlayerPortrait(exact)) return exact;

  const pba2021Fallback = candidates.find(isPba2021FallbackPortrait);
  if (pba2021Fallback) return pba2021Fallback;

  const lowQualityCatalogPortrait = candidates.find(isLowQualityPlayerPortrait);
  if (lowQualityCatalogPortrait) return lowQualityCatalogPortrait;
  if (exact) return exact;

  const lastName = normalizeName(name.split(/\s+/).at(-1) ?? '');
  return lastNamePortraits.get(lastName) ?? undefined;
}

const GENERATED_PORTRAIT_MARKERS = [
  NEWGEN_PORTRAIT_BASE.toLowerCase(),
  '/playerfaces_regen_replacements/',
  'raw.githubusercontent.com/aljohnpolyglot/ng-regens-mainpack/',
  'raw.githubusercontent.com/aljohnpolyglot/ng-regens-black/',
  'raw.githubusercontent.com/aljohnpolyglot/ng-regens-afroamerican/',
  'raw.githubusercontent.com/aljohnpolyglot/ng-regens-asia/',
  'raw.githubusercontent.com/aljohnpolyglot/ng-regens-brown/',
  'raw.githubusercontent.com/aljohnpolyglot/ng-regens-filipino/',
];

export function isGeneratedPbaPortraitUrl(value: unknown): boolean {
  const url = String(value ?? '').trim().toLowerCase();
  return !!url && GENERATED_PORTRAIT_MARKERS.some(marker => url.includes(marker));
}

function isRealHistoricalPbaPlayer(player: NBAPlayer): boolean {
  return !!player.historicalPbaSource || (player as NBAPlayer & { historicalPbaDraftProspect?: boolean }).historicalPbaDraftProspect === true;
}

export function healHistoricalPbaPlayerPortraits(players: NBAPlayer[]): NBAPlayer[] {
  let healed = 0;
  const next = players.map(player => {
    if (!isRealHistoricalPbaPlayer(player)) return player;
    const hasGeneratedImage = isGeneratedPbaPortraitUrl(player.imgURL);
    const hasGeneratedFace = !!(player as NBAPlayer & { face?: unknown }).face;
    if (!hasGeneratedImage && !hasGeneratedFace) return player;
    healed += 1;
    return {
      ...player,
      imgURL: hasGeneratedImage ? undefined : player.imgURL,
      face: undefined,
    };
  });
  if (healed > 0) console.log(`[LOAD_GAME] Removed generated portraits from ${healed} historical PBA player row(s).`);
  return next;
}
