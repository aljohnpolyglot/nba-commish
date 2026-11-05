import type { NBAPlayer } from '../../types';
import { getBioByName, getBioBySlug, type ZenGMBio } from '../../data/realPlayerDataFetcher';
import { findCollegeTeamProfile } from '../collegeTeamCatalog';

export type HistoricalDraftProspectSource = 'drafted' | 'ncaa-undrafted';

export function getHistoricalDraftProspectSource(
  bio: Pick<ZenGMBio, 'college' | 'draftPick' | 'draftRound'>,
): HistoricalDraftProspectSource | null {
  const round = Number(bio.draftRound ?? 0);
  const pick = Number(bio.draftPick ?? 0);
  if (round > 0 && pick > 0) return 'drafted';
  return findCollegeTeamProfile(bio.college) ? 'ncaa-undrafted' : null;
}

export function isEligibleHistoricalNbaProspect(player: NBAPlayer): boolean {
  if (!player.internalId.startsWith('zengm-draft-')) return true;
  if (player.historicalDraftProspectSource) return true;
  if (findCollegeTeamProfile(player.college)) return true;

  const slug = String(player.slug ?? player.srID ?? '').trim();
  const bio = (slug ? getBioBySlug(slug) : null) ?? getBioByName(player.name);
  if (!bio) return false;
  return getHistoricalDraftProspectSource(bio) !== null;
}
