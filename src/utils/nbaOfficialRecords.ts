export interface OfficialNbaRecordRow {
  totalWins: number;
  totalLosses: number;
  homeWins: number;
  homeLosses: number;
  confWins: number;
  confLosses: number;
  divWins: number;
  divLosses: number;
  ptsFor: number;
  ptsAgainst: number;
  games: { won: boolean; date: string }[];
}

const emptyRow = (): OfficialNbaRecordRow => ({
  totalWins: 0,
  totalLosses: 0,
  homeWins: 0,
  homeLosses: 0,
  confWins: 0,
  confLosses: 0,
  divWins: 0,
  divLosses: 0,
  ptsFor: 0,
  ptsAgainst: 0,
  games: [],
});

const isNbaTid = (tid: unknown) => typeof tid === 'number' && tid >= 0 && tid < 100;

const isCandidateRegularGame = (game: any, seasonYear: number) => {
  if (!game?.played) return false;
  if (!isNbaTid(game.homeTid) || !isNbaTid(game.awayTid)) return false;
  if (game.season != null && Number(game.season) !== Number(seasonYear)) return false;
  if ((game.homeScore ?? 0) === (game.awayScore ?? 0)) return false;
  if (
    game.isPreseason ||
    game.isPlayoff ||
    game.isPlayIn ||
    game.isAllStar ||
    game.isRisingStars ||
    game.isCelebrityGame ||
    game.isDunkContest ||
    game.isThreePointContest ||
    game.isThroneEvent ||
    game.isExhibition ||
    game.isCupTBD ||
    game.excludeFromRecord
  ) {
    return false;
  }
  return true;
};

export function deriveOfficialNbaRecords(games: any[] | undefined, teams: any[] | undefined, seasonYear: number, maxGamesPerTeam = 82) {
  const teamMap = new Map((teams ?? []).filter((team: any) => isNbaTid(team?.id)).map((team: any) => [team.id, team]));
  const rows = new Map<number, OfficialNbaRecordRow>();
  for (const tid of teamMap.keys()) rows.set(tid, emptyRow());

  const counts = new Map<number, number>();
  for (const tid of teamMap.keys()) counts.set(tid, 0);

  const candidates = (games ?? [])
    .filter((game: any) => isCandidateRegularGame(game, seasonYear))
    .sort((left: any, right: any) => {
      return String(left.date ?? '').localeCompare(String(right.date ?? '')) || Number(left.gid ?? 0) - Number(right.gid ?? 0);
    });

  for (const game of candidates) {
    const home = rows.get(game.homeTid);
    const away = rows.get(game.awayTid);
    const homeTeam = teamMap.get(game.homeTid);
    const awayTeam = teamMap.get(game.awayTid);
    if (!home || !away || !homeTeam || !awayTeam) continue;
    if ((counts.get(game.homeTid) ?? 0) >= maxGamesPerTeam || (counts.get(game.awayTid) ?? 0) >= maxGamesPerTeam) continue;

    const homeWon = game.homeScore > game.awayScore;
    const date = String(game.date ?? '');
    home.ptsFor += game.homeScore;
    home.ptsAgainst += game.awayScore;
    away.ptsFor += game.awayScore;
    away.ptsAgainst += game.homeScore;

    homeWon ? home.totalWins++ : home.totalLosses++;
    homeWon ? home.homeWins++ : home.homeLosses++;
    !homeWon ? away.totalWins++ : away.totalLosses++;

    const sameConf = homeTeam.conference === awayTeam.conference;
    const sameDiv = homeTeam.did !== undefined && homeTeam.did === awayTeam.did;
    if (sameConf) {
      homeWon ? home.confWins++ : home.confLosses++;
      !homeWon ? away.confWins++ : away.confLosses++;
    }
    if (sameDiv) {
      homeWon ? home.divWins++ : home.divLosses++;
      !homeWon ? away.divWins++ : away.divLosses++;
    }

    home.games.push({ won: homeWon, date });
    away.games.push({ won: !homeWon, date });
    counts.set(game.homeTid, (counts.get(game.homeTid) ?? 0) + 1);
    counts.set(game.awayTid, (counts.get(game.awayTid) ?? 0) + 1);
  }

  return rows;
}
