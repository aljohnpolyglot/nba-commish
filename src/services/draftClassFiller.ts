/**
 * draftClassFiller.ts
 *
 * Keeps every upcoming draft class at a healthy size. Detects which years have
 * fewer than the target head-count and synthesizes prospects to fill the gap.
 *
 * Runs at:
 *   • Game init — after roster import, before the player sees the dashboard.
 *   • Every season rollover — after the year bump, so the far-future class stays
 *     populated season over season.
 *
 * Design: synthesize only the DEFICIT, never replace existing prospects. BBGM
 * import may have real prospects for the next couple years; we just top them up.
 */

import type { NBAPlayer } from '../types';
import { DRAFT_CLASS_HORIZON_YEARS } from '../constants';
import { type DraftClassQualityMode, type GeneratedPlayerGender, type GeneratedPortraitMode, generateDraftClassForGame } from './genDraftPlayers';
import { getNameData } from '../data/nameDataFetcher';
import { createPortraitUsageSet } from '../utils/newgenPortrait';
import { isDraftProspectEligibleForScope, type PlayerLeagueScope } from '../utils/playerLeagueScope';

const TARGET_CLASS_SIZE = 80;

export interface FillResult {
  /** Only the newly-synthesized prospects. Caller appends these to state.players. */
  additions: NBAPlayer[];
  generatedByYear: Record<number, number>;
}

export interface DraftCollegeContext {
  collegePool?: Record<string, number>;
  nationalityOverride?: string;
  nationalityFrequencies?: Record<string, number>;
  gender?: GeneratedPlayerGender;
  targetClassSize?: number;
  forceCollegePath?: boolean;
  talentProfile?: 'pba';
  suppressRealWorldOrigin?: boolean;
  firstDraftYear?: number;
  draftYears?: number[];
  playerScope?: Extract<PlayerLeagueScope, 'nba' | 'wnba' | 'fictional'>;
}

function isGeneratedProspect(player: NBAPlayer): boolean {
  return String(player.internalId ?? '').startsWith('gen-');
}

function prospectMatchesNationality(player: NBAPlayer, nationality?: string): boolean {
  if (!nationality) return true;
  const target = nationality.toLowerCase();
  return [
    (player as any).nationality,
    (player as any).born?.country,
    player.born?.loc,
  ].some(value => String(value ?? '').toLowerCase().includes(target));
}

function qualityModeForClass(realProspectCount: number): DraftClassQualityMode {
  if (realProspectCount >= 45) return 'bums_only';
  if (realProspectCount >= 25) return 'weak_fill';
  return 'normal';
}

function belongsToDraftClass(player: NBAPlayer, year: number, context?: DraftCollegeContext): boolean {
  if (player.tid !== -2 || Number(player.draft?.year) !== year) return false;
  if (!prospectMatchesNationality(player, context?.nationalityOverride)) return false;
  return context?.playerScope
    ? isDraftProspectEligibleForScope(player, context.playerScope, year)
    : true;
}

/**
 * Returns ONLY the newly-synthesized prospects (caller pushes them into state.players).
 * If every class is already full, additions is empty.
 */
export function ensureDraftClasses(
  players: NBAPlayer[],
  currentYear: number,
  eligibilityRule?: string,
  portraitMode: GeneratedPortraitMode = 'legacy_newgen',
  draftCollegeContext?: DraftCollegeContext,
): FillResult {
  const nameData = getNameData();
  const usedPortraitUrls = createPortraitUsageSet(players.map(player => player.imgURL));
  const requestedClassSize = Math.floor(draftCollegeContext?.targetClassSize ?? 0);
  const targetClassSize = requestedClassSize > 0 ? requestedClassSize : TARGET_CLASS_SIZE;
  const firstDraftYear = Math.max(currentYear, Math.floor(draftCollegeContext?.firstDraftYear ?? currentYear));
  const requestedDraftYears = [...new Set((draftCollegeContext?.draftYears ?? [])
    .map(Number)
    .filter(Number.isInteger))]
    .sort((left, right) => left - right);
  const draftYears = requestedDraftYears.length > 0
    ? requestedDraftYears
    : Array.from({ length: DRAFT_CLASS_HORIZON_YEARS }, (_, offset) => firstDraftYear + offset);
  const draftYearSet = new Set(draftYears);
  // Count ANY prospect pool entry — `tid === -2` is canonical for "not yet drafted"
  // per the project README. Status varies ('Prospect', 'Draft Prospect') so don't
  // filter on it or we'll miscount and add duplicates.
  const counts: Record<number, number> = {};
  for (const p of players) {
    const dy = p.draft?.year;
    if (typeof dy !== 'number') continue;
    if (!draftYearSet.has(dy)) continue;
    if (!belongsToDraftClass(p, dy, draftCollegeContext)) continue;
    counts[dy] = (counts[dy] ?? 0) + 1;
  }

  const additions: NBAPlayer[] = [];
  const generatedByYear: Record<number, number> = {};
  for (const year of draftYears) {
    const have = counts[year] ?? 0;
    const need = targetClassSize - have;
    if (need <= 0) continue;
    const realProspectCount = players.filter(player =>
      belongsToDraftClass(player, year, draftCollegeContext) &&
      !isGeneratedProspect(player),
    ).length;
    const qualityMode = qualityModeForClass(realProspectCount);
    // Pass currentYear so prospects for future classes are aged-down appropriately.
    const fresh = generateDraftClassForGame(
      year,
      need,
      Math.random,
      nameData,
      currentYear,
      eligibilityRule,
      draftCollegeContext?.gender,
      portraitMode,
      qualityMode,
      {
        collegePool: draftCollegeContext?.collegePool,
        forceCollegePath: draftCollegeContext?.forceCollegePath ?? false,
        nationalityOverride: draftCollegeContext?.nationalityOverride,
        nationalityFrequencies: draftCollegeContext?.nationalityFrequencies,
        talentProfile: draftCollegeContext?.talentProfile,
        suppressRealWorldOrigin: draftCollegeContext?.suppressRealWorldOrigin,
      },
      usedPortraitUrls,
    );
    // Stamp each prospect with a deterministic id prefix so they don't collide with BBGM ids.
    for (let i = 0; i < fresh.length; i++) {
      (fresh[i] as any).internalId = `gen-${year}-${Date.now().toString(36)}-${i}`;
    }
    additions.push(...fresh);
    generatedByYear[year] = fresh.length;
  }

  return { additions, generatedByYear };
}
