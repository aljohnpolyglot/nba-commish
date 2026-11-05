import type { NBAPlayer } from '../../../types';
import { isWnbaPlayerIdentity } from '../../../utils/playerLeagueScope';

export function hasVerifiedDraftSelection(player: NBAPlayer): boolean {
  return Number(player.draft?.year ?? 0) > 0
    && Number(player.draft?.round ?? 0) > 0
    && Number(player.draft?.pick ?? 0) > 0;
}

export function canExternalBiographySupplySchool(college: string | null | undefined): boolean {
  return !String(college ?? '').trim();
}

export function canExternalBiographySupplyDraft(
  player: NBAPlayer,
  leagueDraftLabel: string | null | undefined,
): boolean {
  return !leagueDraftLabel && !hasVerifiedDraftSelection(player);
}

export function getVerifiedPlayerBioDraftLabel(player: NBAPlayer): string | null {
  if (!hasVerifiedDraftSelection(player)) return null;
  const selection = `${player.draft!.year} R${player.draft!.round} P${player.draft!.pick}`;
  return isWnbaPlayerIdentity(player, false)
    ? `WNBA Draft · ${selection}`
    : selection;
}
