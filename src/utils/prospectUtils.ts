import type { NBAPlayer } from '../types';

export function getProspectCollege(player: NBAPlayer): string | null {
  const college = (player as any).college;
  if (typeof college === 'string' && college.trim()) return college.trim();

  const preDraftRaw = (player as any).pre_draft;
  if (typeof preDraftRaw === 'string' && preDraftRaw.trim()) {
    const parsed = preDraftRaw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return parsed || null;
  }

  return null;
}

export function isDraftProspectLike(player: NBAPlayer, currentYear: number): boolean {
  if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
    return true;
  }

  const draftYear = Number((player as any).draft?.year ?? 0);
  const college = getProspectCollege(player);
  const age = (player as any).born?.year
    ? currentYear - (player as any).born.year
    : (player.age ?? 99);
  const regularSeasonGames = (player.stats ?? []).reduce(
    (sum, stat) => sum + (!stat.playoffs ? (stat.gp ?? 0) : 0),
    0,
  );

  return !!college && draftYear >= currentYear && regularSeasonGames === 0 && age <= 23;
}
