import type { AllStarHistoryPerson, AllStarHistorySnapshot } from '../../types/offseason';
import type { GameState } from '../../types';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { didHomeTeamWin } from '../../utils/gameOutcome';

function playerEntry(state: GameState, season: number, playerId?: string, fallbackName?: string): AllStarHistoryPerson | undefined {
  const player = playerId
    ? state.players.find(candidate => candidate.internalId === playerId)
    : state.players.find(candidate => candidate.name.toLowerCase() === String(fallbackName ?? '').toLowerCase());
  const name = player?.name ?? fallbackName;
  if (!name) return undefined;
  const stat = [...(player?.stats ?? [])]
    .filter(row => !row.playoffs && row.season === season && Number(row.tid) >= 0)
    .sort((a, b) => Number(b.gp ?? 0) - Number(a.gp ?? 0))[0];
  const tid = stat?.tid ?? player?.tid;
  const team = state.teams.find(candidate => candidate.id === tid);
  return {
    ...(player?.internalId ? { playerId: player.internalId } : {}),
    name,
    team: team ? getTeamFullName(getHistoricalTeamSnapshot(team, season)) : '',
  };
}

function topBoxPlayer(state: GameState, season: number, box: NonNullable<GameState['boxScores']>[number]): AllStarHistoryPerson | undefined {
  const top = [...box.homeStats, ...box.awayStats]
    .sort((a, b) => Number(b.gameScore ?? 0) - Number(a.gameScore ?? 0) || b.pts - a.pts)[0];
  return top ? playerEntry(state, season, top.playerId, top.name) : undefined;
}

export function buildAllStarHistorySnapshot(state: GameState, season: number): AllStarHistorySnapshot | null {
  const allStar = state.allStar;
  if (!allStar || Number(allStar.season) !== Number(season)) return null;
  const finalBracketGame = [...(allStar.bracket?.games ?? [])].reverse().find(game => game.played && game.round === 'final')
    ?? [...(allStar.bracket?.games ?? [])].reverse().find(game => game.played);
  const box = state.boxScores.find(candidate =>
    Number(candidate.season ?? season) === season &&
    (candidate.gameId === allStar.allStarGameId || candidate.gameId === finalBracketGame?.gid || candidate.isAllStarChampionship)
  );
  if (!box && !finalBracketGame) return null;

  const homeBracketTeam = allStar.bracket?.teams.find(team => team.tid === finalBracketGame?.homeTid);
  const awayBracketTeam = allStar.bracket?.teams.find(team => team.tid === finalBracketGame?.awayTid);
  const homeName = box?.homeTeamName ?? homeBracketTeam?.name ?? 'Home';
  const awayName = box?.awayTeamName ?? awayBracketTeam?.name ?? 'Away';
  const homeScore = Number(box?.homeScore ?? finalBracketGame?.homeScore ?? 0);
  const awayScore = Number(box?.awayScore ?? finalBracketGame?.awayScore ?? 0);
  const contestPerson = (contest: { winnerId?: string; winnerName?: string; contestants?: Array<{ playerId?: string; playerName?: string; isWinner?: boolean }> } | undefined) => {
    const winner = contest?.contestants?.find(candidate => candidate.isWinner || candidate.playerId === contest.winnerId);
    return playerEntry(state, season, contest?.winnerId ?? winner?.playerId, contest?.winnerName ?? winner?.playerName);
  };
  const shootingTeam = allStar.shootingStars?.teams.find(team => team.teamId === allStar.shootingStars?.winnerTeamId);
  const shootingStarsWinners = shootingTeam?.playerNames.map((name, index) => (
    playerEntry(state, season, shootingTeam.playerIds[index], name)
  )).filter((winner): winner is AllStarHistoryPerson => !!winner) ?? [];
  const playedBracketGames = (allStar.bracket?.games ?? []).filter(game => game.played);
  const bracketRecap = playedBracketGames.length > 1
    ? [...(allStar.bracket?.teams ?? [])]
        .sort((a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa))
        .map(team => `${team.abbrev} ${team.wins}-${team.losses}`)
        .join(' · ')
    : undefined;

  return {
    season,
    roster: (allStar.roster ?? []).map(entry => ({ ...entry })),
    teams: [homeName, awayName],
    winner: didHomeTeamWin(box ?? finalBracketGame ?? { homeScore, awayScore }) ? homeName : awayName,
    finalScore: { [homeName]: homeScore, [awayName]: awayScore },
    mvp: playerEntry(state, season, allStar.gameMvp?.playerId ?? finalBracketGame?.mvpId, allStar.gameMvp?.name ?? finalBracketGame?.mvpName) ?? (box ? topBoxPlayer(state, season, box) : undefined),
    risingStarsMvp: playerEntry(state, season, allStar.risingStarsMvp?.playerId, allStar.risingStarsMvp?.name),
    dunkWinner: contestPerson(allStar.dunkContest),
    danceWinner: allStar.danceContest?.complete ? allStar.danceContest.winnerLabel : undefined,
    threePointWinner: contestPerson(allStar.threePointContest),
    shootingStarsWinner: shootingStarsWinners[0],
    shootingStarsWinners,
    skillsWinner: contestPerson(allStar.skillsChallenge),
    horseWinner: contestPerson(allStar.horseTournament),
    throneWinner: playerEntry(state, season, allStar.throne?.champion?.playerId, allStar.throne?.champion?.playerName),
    ...(bracketRecap ? { bracketRecap } : {}),
  };
}

export function appendAllStarHistorySnapshot(state: GameState, season: number): GameState['allStarHistory'] {
  const snapshot = buildAllStarHistorySnapshot(state, season);
  return snapshot
    ? { ...(state.allStarHistory ?? {}), [season]: snapshot }
    : state.allStarHistory;
}
