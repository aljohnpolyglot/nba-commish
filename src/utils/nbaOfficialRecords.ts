export interface OfficialNbaRecordRow {
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  homeWins: number;
  homeLosses: number;
  confWins: number;
  confLosses: number;
  divWins: number;
  divLosses: number;
  ptsFor: number;
  ptsAgainst: number;
  games: { won: boolean | null; date: string }[];
}

const emptyRow = (): OfficialNbaRecordRow => ({
  totalWins: 0,
  totalLosses: 0,
  totalTies: 0,
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

const homeTidOf = (game: any): number | undefined => game?.homeTid ?? game?.homeTeamId;
const awayTidOf = (game: any): number | undefined => game?.awayTid ?? game?.awayTeamId;

const isCandidateRegularGame = (game: any, seasonYear: number) => {
  if (!game?.played) return false;
  if (!isNbaTid(homeTidOf(game)) || !isNbaTid(awayTidOf(game))) return false;
  if (game.season != null && Number(game.season) !== Number(seasonYear)) return false;
  if ((game.homeScore ?? 0) === (game.awayScore ?? 0) && game.winnerId == null && game.isDraw !== true) return false;
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
    const homeTid = homeTidOf(game);
    const awayTid = awayTidOf(game);
    const home = rows.get(homeTid!);
    const away = rows.get(awayTid!);
    const homeTeam = teamMap.get(homeTid!);
    const awayTeam = teamMap.get(awayTid!);
    if (!home || !away || !homeTeam || !awayTeam) continue;
    if ((counts.get(homeTid!) ?? 0) >= maxGamesPerTeam || (counts.get(awayTid!) ?? 0) >= maxGamesPerTeam) continue;

    const draw = game.isDraw === true || game.winnerId === -1;
    const homeWon = !draw && didHomeTeamWin(game);
    const date = String(game.date ?? '');
    home.ptsFor += game.homeScore;
    home.ptsAgainst += game.awayScore;
    away.ptsFor += game.awayScore;
    away.ptsAgainst += game.homeScore;

    if (draw) {
      home.totalTies++;
      away.totalTies++;
    } else {
      homeWon ? home.totalWins++ : home.totalLosses++;
      homeWon ? home.homeWins++ : home.homeLosses++;
      !homeWon ? away.totalWins++ : away.totalLosses++;
    }

    const sameConf = homeTeam.conference === awayTeam.conference;
    const sameDiv = homeTeam.did !== undefined && homeTeam.did === awayTeam.did;
    if (sameConf && !draw) {
      homeWon ? home.confWins++ : home.confLosses++;
      !homeWon ? away.confWins++ : away.confLosses++;
    }
    if (sameDiv && !draw) {
      homeWon ? home.divWins++ : home.divLosses++;
      !homeWon ? away.divWins++ : away.divLosses++;
    }

    home.games.push({ won: draw ? null : homeWon, date });
    away.games.push({ won: draw ? null : !homeWon, date });
    counts.set(homeTid!, (counts.get(homeTid!) ?? 0) + 1);
    counts.set(awayTid!, (counts.get(awayTid!) ?? 0) + 1);
  }

  return rows;
}

export function syncNbaTeamRecordsFromSchedule<T extends { id: number; wins?: number; losses?: number; tied?: number; standingsPoints?: number; pointDifferential?: number }>(
  teams: T[],
  games: any[] | undefined,
  seasonYear: number,
  maxGamesPerTeam = 82,
  rules?: { standingsMode?: 'win_pct' | 'points'; pointsForWin?: number; pointsForDraw?: number; pointsForLoss?: number },
): T[] {
  const records = deriveOfficialNbaRecords(games, teams, seasonYear, maxGamesPerTeam);
  const officialGames = Array.from(records.values())
    .reduce((sum, row) => sum + row.totalWins + row.totalLosses + row.totalTies, 0);
  if (officialGames === 0) return teams;

  let changed = false;
  const synced = teams.map(team => {
    const record = records.get(team.id);
    if (!record || (team.wins === record.totalWins && team.losses === record.totalLosses && (team.tied ?? 0) === record.totalTies)) return team;
    changed = true;
    return {
      ...team,
      wins: record.totalWins,
      losses: record.totalLosses,
      tied: record.totalTies,
      pointDifferential: record.ptsFor - record.ptsAgainst,
      standingsPoints: rules?.standingsMode === 'points'
        ? record.totalWins * (rules.pointsForWin ?? 2)
          + record.totalTies * (rules.pointsForDraw ?? 1)
          + record.totalLosses * (rules.pointsForLoss ?? 0)
        : team.standingsPoints,
    };
  });
  return changed ? synced : teams;
}
import { didHomeTeamWin } from './gameOutcome';
