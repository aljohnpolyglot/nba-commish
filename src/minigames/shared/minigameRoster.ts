import type { NBAPlayer, NBATeam } from '../../types';
import { isCurrentNbaPlayer } from '../../services/allStar/allStarSelectionHelpers';
import { getPlayerImage } from '../../utils/playerImage';
import { getTeamFullName } from '../../utils/teamNames';
import type { Player as OlympicsPlayer } from '../olympics/types';

const nameKey = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const withResolvedPortrait = (player: NBAPlayer): NBAPlayer => ({
  ...player,
  imgURL: getPlayerImage(player) ?? player.imgURL,
});

export function resolveMinigameNbaPlayers(activePlayers: NBAPlayer[], fallbackPlayers: NBAPlayer[]): NBAPlayer[] {
  const active = activePlayers.filter(isCurrentNbaPlayer);
  if (active.length >= 30) return active.map(withResolvedPortrait);

  const activeByName = new Map(active.map(player => [nameKey(player.name), player]));
  const fallbackNames = new Set(fallbackPlayers.map(player => nameKey(player.name)));
  return [
    ...fallbackPlayers.map(player => withResolvedPortrait(activeByName.get(nameKey(player.name)) ?? player)),
    ...active.filter(player => !fallbackNames.has(nameKey(player.name))).map(withResolvedPortrait),
  ];
}

export function enrichOlympicsPlayers(
  players: OlympicsPlayer[],
  activePlayers: NBAPlayer[],
  teams: NBATeam[],
  season: number,
): OlympicsPlayer[] {
  const activeByName = new Map(
    activePlayers.filter(isCurrentNbaPlayer).map(player => [nameKey(player.name), player]),
  );
  const teamsById = new Map(teams.map(team => [team.id, team]));

  return players.map(source => {
    const active = activeByName.get(nameKey(`${source.firstName} ${source.lastName}`));
    if (!active) return source;
    const rating = active.ratings?.at(-1) as any;
    const team = teamsById.get(active.tid);
    const parts = active.name.trim().split(/\s+/);
    const bornYear = Number(active.born?.year) || source.bornYear;
    return {
      ...source,
      firstName: parts[0] ?? source.firstName,
      lastName: parts.slice(1).join(' ') || source.lastName,
      tid: active.tid,
      teamAbbrev: team?.abbrev ?? source.teamAbbrev,
      teamName: team ? getTeamFullName(team) : source.teamName,
      teamColors: team?.colors ?? source.teamColors,
      age: bornYear ? season - bornYear : source.age,
      bornYear,
      ovr: active.overallRating ?? source.ovr,
      hgt: rating?.hgt ?? source.hgt,
      spd: rating?.spd ?? source.spd,
      jmp: rating?.jmp ?? source.jmp,
      str: rating?.stre ?? source.str,
      end: rating?.endu ?? source.end,
      pss: rating?.pss ?? source.pss,
      imgURL: getPlayerImage(active) ?? source.imgURL,
      pos: active.pos ?? source.pos,
      jerseyNumber: active.jerseyNumber ?? source.jerseyNumber,
    };
  });
}
