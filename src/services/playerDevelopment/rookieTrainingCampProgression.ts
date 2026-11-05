import type { NBAPlayer } from '../../types';
import { EXTERNAL_LEAGUE_STATUSES } from '../../constants';
import { calculatePlayerOverallForYear } from '../../utils/playerRatings';
import { getRookieDraftSeason } from '../awards/eligibility';
import type { UIMode } from '../awards/types';
import { calculateLeagueOverall } from '../logic/leagueOvr';

const ATTRIBUTES = [
  'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft',
  'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

const EXTERNAL_STATUSES = new Set(EXTERNAL_LEAGUE_STATUSES);

function hashUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_296;
}

function bellBoost(seed: string): number {
  let sum = 0;
  for (let index = 0; index < 6; index++) sum += hashUnit(`${seed}:${index}`);
  return Math.max(0, Math.min(3, Math.round(1 + ((sum / 6) - 0.5) * 4)));
}

export function applyRookieTrainingCampProgression(
  players: NBAPlayer[],
  season: number,
  uiMode: UIMode,
  activeTeamIds: ReadonlySet<number>,
  saveSeed: string,
): { players: NBAPlayer[]; events: Array<{ playerId: string; boost: number }> } {
  if (uiMode === 'euro_isolated') return { players, events: [] };
  const draftSeason = getRookieDraftSeason(season, uiMode);
  const events: Array<{ playerId: string; boost: number }> = [];
  let changed = false;
  const nextPlayers = players.map(player => {
    if (!activeTeamIds.has(Number(player.tid))) return player;
    if (Number(player.draft?.year) !== draftSeason) return player;
    if (!player.ratings?.length || player.status === 'Retired' || player.rookieCampProgressionSeason === season) return player;
    const ratingIndex = player.ratings.findIndex(row => Number(row.season) === season);
    const index = ratingIndex >= 0 ? ratingIndex : player.ratings.length - 1;
    const rating = { ...player.ratings[index] } as Record<string, any>;
    const currentOverall = Number(rating.ovr ?? player.overallRating ?? 0);
    const potential = Number(rating.pot ?? player.potential ?? currentOverall);
    const potentialRoom = Number.isFinite(potential) ? Math.max(0, Math.floor(potential - currentOverall)) : 0;
    const boost = Math.min(bellBoost(`${saveSeed}:rookie-camp:${season}:${player.internalId}`), potentialRoom, 3);
    if (boost === 0) {
      events.push({ playerId: player.internalId, boost: 0 });
      changed = true;
      return { ...player, rookieCampProgressionSeason: season };
    }
    const attributeBoost = boost + 1;
    for (const attribute of ATTRIBUTES) {
      const current = Number(rating[attribute]);
      if (Number.isFinite(current)) rating[attribute] = Math.min(99, current + attributeBoost);
    }
    const ceiling = Math.max(currentOverall, potential);
    rating.ovr = Math.min(ceiling, currentOverall + boost);
    const ratings = player.ratings.map((row, rowIndex) => rowIndex === index ? rating : row);
    const updated = {
      ...player,
      ratings,
      rookieCampProgressionSeason: season,
    } as NBAPlayer;
    updated.overallRating = EXTERNAL_STATUSES.has(String(player.status ?? ''))
      ? calculateLeagueOverall(rating, String(player.status ?? ''))
      : calculatePlayerOverallForYear(updated, season);
    updated.overallRating = Math.max(player.overallRating, Math.min(ceiling, updated.overallRating));
    events.push({ playerId: player.internalId, boost: updated.overallRating - player.overallRating });
    changed = true;
    return updated;
  });
  return { players: changed ? nextPlayers : players, events };
}
