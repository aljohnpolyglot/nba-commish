import { create } from 'zustand';
import {
  fetchCoachData as fetchPrimaryCoachData,
  getCoachPhoto as getPrimaryCoachPhoto,
} from '../data/photos/coaches';
import {
  fetchCoachData as fetchExtendedCoachData,
  getCoachPhoto as getExtendedCoachPhoto,
  getNBA2KCoach,
} from '../services/staffService';
import { deterministicStaffImageId, getStaffImageUrl } from '../utils/staffPortrait';
import {
  getCachedNbaEraPortraitCandidates,
  getCachedNbaHistoricalStaffPortraitCandidates,
} from '../services/nbaEraPortraitCatalog';

type StaffPhotoStatus = 'idle' | 'loading' | 'ready' | 'error';

interface StaffPhotoState {
  status: StaffPhotoStatus;
  version: number;
  error?: string;
  ensureLoaded: () => Promise<void>;
}

let loadPromise: Promise<void> | null = null;
const PREFER_PLAYER_PORTRAIT = new Set(['don nelson']);

export function isGeneratedRealGmPhoto(url?: string | null): boolean {
  return !!url && url.includes('basketball.realgm.com/images/nba/4.2/profiles/photos/2006/');
}

export function sanitizeStaffPhotoUrl(url?: string | null): string | undefined {
  if (!url || isGeneratedRealGmPhoto(url)) return undefined;
  return url;
}

export function resolveCoachPortrait(name?: string, savedPortrait?: string | null): string | undefined {
  const coachName = name ?? '';
  const saved = sanitizeStaffPhotoUrl(savedPortrait);
  const preferredPlayerPortrait = PREFER_PLAYER_PORTRAIT.has(coachName.trim().toLowerCase())
    ? saved ?? getCachedNbaEraPortraitCandidates(coachName)[0]
    : undefined;
  return preferredPlayerPortrait
    ?? getCachedNbaHistoricalStaffPortraitCandidates(coachName)[0]
    ?? getPrimaryCoachPhoto(coachName)
    ?? getExtendedCoachPhoto(coachName)
    ?? getNBA2KCoach(coachName)?.image
    ?? saved;
}

export function resolveStaffPortrait(options: {
  name?: string;
  savedPortrait?: string | null;
  staffImageId?: number;
  teamLogoUrl?: string | null;
  preferTeamLogo?: boolean;
}): string | undefined {
  return resolveCoachPortrait(options.name, options.savedPortrait)
    ?? (options.preferTeamLogo ? sanitizeStaffPhotoUrl(options.teamLogoUrl) : undefined)
    ?? getStaffImageUrl(options.staffImageId)
    ?? (options.name ? getStaffImageUrl(deterministicStaffImageId(options.name)) : undefined)
    ?? sanitizeStaffPhotoUrl(options.teamLogoUrl);
}

export const useStaffPhotoStore = create<StaffPhotoState>((set, get) => ({
  status: 'idle',
  version: 0,
  ensureLoaded: async () => {
    const current = get().status;
    if (current === 'ready') return;
    if (loadPromise) return loadPromise;

    set({ status: 'loading', error: undefined });
    loadPromise = Promise.all([fetchPrimaryCoachData(), fetchExtendedCoachData()])
      .then(() => {
        set(state => ({ status: 'ready', version: state.version + 1, error: undefined }));
      })
      .catch((error: unknown) => {
        loadPromise = null;
        set({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return loadPromise;
  },
}));

export const ensureStaffPhotoData = () => useStaffPhotoStore.getState().ensureLoaded();
