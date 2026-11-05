import type { Group } from '../../../data/fiba/groupsData';
import type { Team as StandingTeam } from '../../../data/fiba/types';
import type { Team } from '../../../data/fiba/teamsData';
import type { LeaderCategory } from '../../../data/fiba/leadersData';
import { calculateInternationalGroupStandings } from '../../../services/fiba/calculateGroupStandings';
import type {
  InternationalTournamentGame,
  InternationalTournamentState,
  InternationalTournamentTeam,
} from '../../../services/fiba/types';
import { internationalTournamentTitle } from '../../../services/fiba/competitionIdentity';
import type { FibaGameCard } from './GamesList';
import type { FibaPlayerCard } from './PlayersList';
import type { PlayerStatRow } from './StatsTable';
import type { FibaBracketMatch, KnockoutBracketData } from './KnockoutBracket';
import type { NBAPlayer } from '../../../types';
import { getFibaPortraitFallback, type FibaPortraitFallbackCatalog } from '../../../services/fiba/portraitFallbacks';
import { isUsablePlayerPortraitUrl } from '../../../utils/playerImage';

export interface FibaTournamentViewModel {
  title: string;
  infoItems: Array<{ label: string; value: string }>;
  navTabs: string[];
  gameTabs: string[];
  standingsTabs: string[];
  games: FibaGameCard[];
  firstRoundGroups: Group[];
  secondRoundGroups: Group[];
  classificationGroups: Group[];
  teams: Team[];
  players: FibaPlayerCard[];
  stats: PlayerStatRow[];
  leaders: LeaderCategory[];
  standings: StandingTeam[];
  topThree: StandingTeam[];
  standingsMode: 'standings' | 'odds';
  bracket?: KnockoutBracketData;
}

function placeholderMatch(id: string, label: string): FibaBracketMatch {
  return {
    id,
    gameNum: label,
    dateStr: 'TBD',
    status: 'SCHEDULED',
    team1Code: 'TBD',
    team1FlagId: '',
    team1Score: '—',
    team2Code: 'TBD',
    team2FlagId: '',
    team2Score: '—',
    winner: 0,
  };
}

interface PlayerTotals {
  id: string;
  playerId?: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  name: string;
  teamCode: string;
  teamName?: string;
  teamFlagUrl?: string;
  pos: string;
  age: number;
  G: number;
  GS: number;
  MP: number;
  FG: number;
  FGA: number;
  threeP: number;
  threePA: number;
  FT: number;
  FTA: number;
  ORB: number;
  DRB: number;
  TRB: number;
  AST: number;
  TOV: number;
  STL: number;
  BLK: number;
  PF: number;
  PTS: number;
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function dateRange(tournament: InternationalTournamentState): string {
  const dates = [...new Set(tournament.games.map(game => game.date))].sort();
  if (dates.length === 0) return String(tournament.year);
  if (dates.length === 1) return displayDate(dates[0]);
  return `${displayDate(dates[0])} - ${displayDate(dates[dates.length - 1])}`;
}

function phaseLabel(game: InternationalTournamentGame): string {
  if (game.phase === 'group') {
    const round = game.groupStage === 'second-round' ? 'Second Round' : 'First Round';
    return `${round}${game.group ? ` · Group ${game.group}` : ''}`;
  }
  if (game.phase === 'classification') return `Class. Games 17-32${game.group ? ` · Group ${game.group}` : ''}`;
  if (game.phase === 'round-of-16') return 'Round of 16';
  if (game.phase === 'quarterfinal') return 'Quarter-Finals';
  if (game.phase === 'semifinal') return 'Semi-Finals';
  if (game.phase === 'third-place') return '3rd Place Game';
  return 'Final';
}

function phaseTab(game: InternationalTournamentGame): string {
  if (game.phase === 'group') return game.groupStage === 'second-round' ? 'Second Round' : 'First Round';
  if (game.phase === 'classification') return 'Class. Games 17-32';
  return 'Bracket';
}

function teamMap(tournament: InternationalTournamentState): Map<string, InternationalTournamentTeam> {
  return new Map(tournament.teams.map(team => [team.id, team]));
}

function gameCards(tournament: InternationalTournamentState): FibaGameCard[] {
  const teams = teamMap(tournament);
  const boxScores = new Map(tournament.boxScores.map(boxScore => [boxScore.gameId, boxScore]));
  return tournament.games.map(game => {
    const home = teams.get(game.homeTeamId)!;
    const away = teams.get(game.awayTeamId)!;
    return {
      id: game.id,
      date: displayDate(game.date),
      scheduledDate: game.date,
      phaseAndGroup: phaseLabel(game),
      status: game.played ? 'Final' : 'Scheduled',
      team1Code: home.abbrev,
      team1Score: game.played ? game.homeScore ?? '—' : '—',
      team1FlagId: '',
      team1FlagUrl: home.imageUrl,
      team2Code: away.abbrev,
      team2Score: game.played ? game.awayScore ?? '—' : '—',
      team2FlagId: '',
      team2FlagUrl: away.imageUrl,
      winner: game.winnerTeamId === home.id ? 1 : game.winnerTeamId === away.id ? 2 : 0,
      boxScore: game.gameId == null ? undefined : boxScores.get(game.gameId),
    };
  });
}

function bracketMatch(
  tournament: InternationalTournamentState,
  game: InternationalTournamentGame,
  index: number,
): FibaBracketMatch {
  const teams = teamMap(tournament);
  const home = teams.get(game.homeTeamId)!;
  const away = teams.get(game.awayTeamId)!;
  return {
    id: game.id,
    gameNum: `#${index + 1}`,
    dateStr: displayDate(game.date),
    scheduledDate: game.date,
    status: game.played ? 'FINAL' : 'SCHEDULED',
    team1Code: home.abbrev,
    team1FlagId: '',
    team1FlagUrl: home.imageUrl,
    team1Score: game.played ? game.homeScore ?? '—' : '—',
    team2Code: away.abbrev,
    team2FlagId: '',
    team2FlagUrl: away.imageUrl,
    team2Score: game.played ? game.awayScore ?? '—' : '—',
    winner: game.winnerTeamId === home.id ? 1 : game.winnerTeamId === away.id ? 2 : 0,
    boxScore: game.gameId == null
      ? undefined
      : tournament.boxScores.find(boxScore => boxScore.gameId === game.gameId),
  };
}

function runtimeBracket(tournament: InternationalTournamentState): KnockoutBracketData | undefined {
  const roundOf16 = tournament.games.filter(game => game.phase === 'round-of-16');
  const quarterFinals = tournament.games.filter(game => game.phase === 'quarterfinal');
  if (roundOf16.length === 0 && quarterFinals.length === 0) return undefined;
  const semiFinals = tournament.games.filter(game => game.phase === 'semifinal');
  const final = tournament.games.find(game => game.phase === 'final');
  const thirdPlace = tournament.games.find(game => game.phase === 'third-place');
  const visibleQuarterFinals = quarterFinals.length > 0
    ? quarterFinals.map((game, index) => bracketMatch(tournament, game, roundOf16.length + index))
    : Array.from({ length: 4 }, (_, index) => placeholderMatch(`${tournament.id}:quarterfinal:tbd-${index + 1}`, `QF${index + 1}`));
  return {
    roundOf16: roundOf16.length > 0
      ? roundOf16.map((game, index) => bracketMatch(tournament, game, index))
      : undefined,
    quarterFinals: visibleQuarterFinals,
    semiFinals: semiFinals.length > 0
      ? semiFinals.map((game, index) => bracketMatch(tournament, game, roundOf16.length + quarterFinals.length + index))
      : [placeholderMatch(`${tournament.id}:semifinal:tbd-1`, 'SF1'), placeholderMatch(`${tournament.id}:semifinal:tbd-2`, 'SF2')],
    final: final
      ? bracketMatch(tournament, final, roundOf16.length + quarterFinals.length + semiFinals.length)
      : placeholderMatch(`${tournament.id}:final:tbd`, 'Final'),
    thirdPlace: thirdPlace
      ? bracketMatch(tournament, thirdPlace, roundOf16.length + quarterFinals.length + semiFinals.length + 1)
      : placeholderMatch(`${tournament.id}:third-place:tbd`, '3rd'),
  };
}

function groupCards(
  tournament: InternationalTournamentState,
  stage: 'first-round' | 'second-round' | 'classification',
): Group[] {
  const standings = calculateInternationalGroupStandings(tournament);
  const teams = teamMap(tournament);
  return tournament.groups.filter(group => (group.stage ?? 'first-round') === stage).map(group => ({
    name: `Group ${group.id}`,
    teams: (standings[group.id] ?? []).map(row => {
      const team = teams.get(row.teamId)!;
      return {
        rank: row.rank,
        name: team.country,
        code: team.abbrev,
        flagId: '',
        flagUrl: team.imageUrl,
        gp: row.played,
        w: row.wins,
        l: row.losses,
        pct: row.played > 0 ? ((row.wins / row.played) * 100).toFixed(1) : '0.0',
        forPts: row.pointsFor,
        agtPts: row.pointsAgainst,
        diff: row.pointDifference,
      };
    }),
    games: tournament.games
      .filter(game => game.group === group.id && (
        stage === 'classification' ? game.phase === 'classification' : game.phase === 'group'
      ))
      .map(game => {
        const home = teams.get(game.homeTeamId)!;
        const away = teams.get(game.awayTeamId)!;
        return {
          id: game.id,
          dateStr: displayDate(game.date),
          groupPhase: phaseLabel(game),
          status: game.played ? 'Final' : 'Scheduled',
          team1Code: home.abbrev,
          team1FlagId: '',
          team1FlagUrl: home.imageUrl,
          team1Score: game.played ? game.homeScore ?? '—' : '—',
          team2Code: away.abbrev,
          team2FlagId: '',
          team2FlagUrl: away.imageUrl,
          team2Score: game.played ? game.awayScore ?? '—' : '—',
        };
      }),
  }));
}

function playerCards(tournament: InternationalTournamentState): FibaPlayerCard[] {
  return tournament.teams.flatMap(team => team.players.map(player => {
    const parts = player.name.trim().split(/\s+/);
    const lastName = parts.pop() ?? player.name;
    const firstName = parts.join(' ');
    return {
      playerId: player.savePlayerId,
      firstName,
      lastName,
      dob: player.birthYear ? String(player.birthYear) : '—',
      teamCode: team.abbrev,
      teamFlagId: '',
      teamFlagUrl: team.imageUrl,
      letter: lastName.charAt(0).toUpperCase() || '#',
    };
  })).sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName));
}

function ratio(value: number, attempts: number): number {
  return attempts > 0 ? value / attempts : 0;
}

export interface TournamentPlayerStatsSource {
  year: number;
  teams: Array<{
    seed: number;
    country?: string;
    abbrev: string;
    imageUrl?: string;
    logoUrl?: string;
    players: InternationalTournamentTeam['players'];
  }>;
  boxScores: InternationalTournamentState['boxScores'];
}

export function buildTournamentPlayerStatRows(
  tournament: TournamentPlayerStatsSource,
  savePlayersById: ReadonlyMap<string, NBAPlayer>,
  portraitFallbacks?: FibaPortraitFallbackCatalog,
): PlayerStatRow[] {
  const selectedById = new Map(tournament.teams.flatMap(team =>
    team.players.flatMap(player => [
      [player.id, { player, team }] as const,
      ...(player.savePlayerId ? [[player.savePlayerId, { player, team }] as const] : []),
    ]),
  ));
  const totals = new Map<string, PlayerTotals>();

  for (const boxScore of tournament.boxScores) {
    const sides = [
      { stats: boxScore.homeStats, code: boxScore.homeTeamAbbrev ?? '', teamId: boxScore.homeTeamId },
      { stats: boxScore.awayStats, code: boxScore.awayTeamAbbrev ?? '', teamId: boxScore.awayTeamId },
    ];
    for (const side of sides) {
      const tournamentTeam = tournament.teams.find(team => 900_000 + team.seed === side.teamId);
      for (const stat of side.stats) {
        const selectedEntry = selectedById.get(stat.playerId);
        const selected = selectedEntry?.player;
        const playerId = selected?.savePlayerId ?? stat.playerId;
        const savePlayer = selected?.savePlayerId ? savePlayersById.get(selected.savePlayerId) : undefined;
        const primaryImageUrl = [selected?.imageUrl, savePlayer?.imgURL].find(isUsablePlayerPortraitUrl);
        const fallbackImageUrl = [
          savePlayer?.imgURL,
          getFibaPortraitFallback(portraitFallbacks, selected?.name ?? stat.name, selected?.birthYear ?? savePlayer?.born?.year),
        ].find(url => isUsablePlayerPortraitUrl(url) && url !== primaryImageUrl);
        const existing = totals.get(playerId) ?? {
          id: playerId,
          playerId: selected?.savePlayerId,
          imageUrl: primaryImageUrl,
          fallbackImageUrl,
          name: stat.name,
          teamCode: side.code || tournamentTeam?.abbrev || '',
          teamName: tournamentTeam?.country ?? selectedEntry?.team.country,
          teamFlagUrl: tournamentTeam?.imageUrl ?? tournamentTeam?.logoUrl,
          pos: selected?.position ?? '',
          age: selected?.birthYear ? tournament.year - selected.birthYear : 0,
          G: 0,
          GS: 0,
          MP: 0,
          FG: 0,
          FGA: 0,
          threeP: 0,
          threePA: 0,
          FT: 0,
          FTA: 0,
          ORB: 0,
          DRB: 0,
          TRB: 0,
          AST: 0,
          TOV: 0,
          STL: 0,
          BLK: 0,
          PF: 0,
          PTS: 0,
        };
        existing.G += 1;
        existing.GS += stat.gs > 0 ? 1 : 0;
        existing.MP += stat.min;
        existing.FG += stat.fgm;
        existing.FGA += stat.fga;
        existing.threeP += stat.threePm;
        existing.threePA += stat.threePa;
        existing.FT += stat.ftm;
        existing.FTA += stat.fta;
        existing.ORB += stat.orb;
        existing.DRB += stat.drb;
        existing.TRB += stat.reb;
        existing.AST += stat.ast;
        existing.TOV += stat.tov;
        existing.STL += stat.stl;
        existing.BLK += stat.blk;
        existing.PF += stat.pf;
        existing.PTS += stat.pts;
        totals.set(playerId, existing);
      }
    }
  }

  return [...totals.values()].map(total => {
    const names = total.name.trim().split(/\s+/);
    const lastName = names.pop() ?? total.name;
    const twoP = total.FG - total.threeP;
    const twoPA = total.FGA - total.threePA;
    return {
      id: total.id,
      playerId: total.playerId,
      imageUrl: total.imageUrl,
      fallbackImageUrl: total.fallbackImageUrl,
      name: total.name,
      firstName: names.join(' '),
      lastName,
      teamCode: total.teamCode,
      teamName: total.teamName,
      teamFlagId: '',
      teamFlagUrl: total.teamFlagUrl,
      pos: total.pos,
      age: total.age,
      G: total.G,
      GS: total.GS,
      MP: total.MP,
      MP_pg: ratio(total.MP, total.G),
      FG: total.FG,
      FG_pg: ratio(total.FG, total.G),
      FGA: total.FGA,
      FGA_pg: ratio(total.FGA, total.G),
      FG_pct: ratio(total.FG, total.FGA),
      '3P': total.threeP,
      '3P_pg': ratio(total.threeP, total.G),
      '3PA': total.threePA,
      '3PA_pg': ratio(total.threePA, total.G),
      '3P_pct': ratio(total.threeP, total.threePA),
      '2P': twoP,
      '2P_pg': ratio(twoP, total.G),
      '2PA': twoPA,
      '2PA_pg': ratio(twoPA, total.G),
      '2P_pct': ratio(twoP, twoPA),
      eFG_pct: ratio(total.FG + total.threeP * 0.5, total.FGA),
      FT: total.FT,
      FT_pg: ratio(total.FT, total.G),
      FTA: total.FTA,
      FTA_pg: ratio(total.FTA, total.G),
      FT_pct: ratio(total.FT, total.FTA),
      ORB: total.ORB,
      ORB_pg: ratio(total.ORB, total.G),
      DRB: total.DRB,
      DRB_pg: ratio(total.DRB, total.G),
      TRB: total.TRB,
      TRB_pg: ratio(total.TRB, total.G),
      AST: total.AST,
      AST_pg: ratio(total.AST, total.G),
      TOV: total.TOV,
      TOV_pg: ratio(total.TOV, total.G),
      STL: total.STL,
      STL_pg: ratio(total.STL, total.G),
      BLK: total.BLK,
      BLK_pg: ratio(total.BLK, total.G),
      PF: total.PF,
      PF_pg: ratio(total.PF, total.G),
      PTS: total.PTS,
      PTS_pg: ratio(total.PTS, total.G),
    };
  }).sort((left, right) => right.PTS_pg - left.PTS_pg || left.name.localeCompare(right.name));
}

function runtimeLeaders(stats: readonly PlayerStatRow[]): LeaderCategory[] {
  const categories: Array<{ title: string; field: keyof PlayerStatRow }> = [
    { title: 'Points', field: 'PTS_pg' },
    { title: 'Rebounds', field: 'TRB_pg' },
    { title: 'Assists', field: 'AST_pg' },
    { title: 'Steals', field: 'STL_pg' },
    { title: 'Blocks', field: 'BLK_pg' },
  ];
  return categories.map(category => ({
    title: category.title,
    subtitle: 'PER GAME',
    players: [...stats]
      .sort((left, right) => Number(right[category.field]) - Number(left[category.field]))
      .slice(0, 3)
      .map((player, index) => ({
        id: `${category.title}-${player.id}-${index}`,
        playerId: player.playerId,
        imageUrl: player.imageUrl,
        fallbackImageUrl: player.fallbackImageUrl,
        firstName: player.firstName,
        lastName: player.lastName,
        countryCode: player.teamCode,
        countryFlagId: player.teamFlagId,
        countryFlagUrl: player.teamFlagUrl,
        value: Number(player[category.field]).toFixed(1),
      })),
  }));
}

function orderedTeams(tournament: InternationalTournamentState): InternationalTournamentTeam[] {
  const byId = teamMap(tournament);
  const resultIds = tournament.result ? [
    tournament.result.championTeamId,
    tournament.result.runnerUpTeamId,
    tournament.result.thirdPlaceTeamId,
    tournament.result.fourthPlaceTeamId,
  ].filter((teamId): teamId is string => !!teamId) : [];
  const used = new Set(resultIds);
  return [
    ...resultIds.map(teamId => byId.get(teamId)).filter((team): team is InternationalTournamentTeam => !!team),
    ...tournament.teams.filter(team => !used.has(team.id)).sort((left, right) => left.seed - right.seed),
  ];
}

function tournamentStandings(tournament: InternationalTournamentState): StandingTeam[] {
  if (!['complete', 'reviewed'].includes(tournament.status)) {
    const teams = [...tournament.teams].sort((left, right) => right.strength - left.strength || left.country.localeCompare(right.country));
    const weights = teams.map(team => Math.exp(team.strength / 8));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    return teams.map((team, index) => ({
      rank: index + 1,
      name: team.country,
      code: team.abbrev,
      flagId: '',
      flagUrl: team.imageUrl,
      odds: `+${Math.max(100, Math.round(((totalWeight / weights[index]) - 1) * 100 / 10) * 10)}`,
    }));
  }
  return orderedTeams(tournament).map((team, index) => ({
    rank: index + 1,
    name: team.country,
    code: team.abbrev,
    flagId: '',
    flagUrl: team.imageUrl,
  }));
}

export function buildFibaTournamentViewModel(
  tournament: InternationalTournamentState,
  savePlayers: readonly NBAPlayer[] = [],
  portraitFallbacks?: FibaPortraitFallbackCatalog,
): FibaTournamentViewModel {
  const standings = tournamentStandings(tournament);
  const games = gameCards(tournament);
  const stats = buildTournamentPlayerStatRows(
    tournament,
    new Map(savePlayers.map(player => [player.internalId, player])),
    portraitFallbacks,
  );
  const gameTabs = ['First Round', 'Second Round', 'Class. Games 17-32', 'Bracket'].filter(tab =>
    tournament.games.some(game => phaseTab(game) === tab),
  );
  const champion = tournament.result
    ? tournament.teams.find(team => team.id === tournament.result?.championTeamId)?.country
    : undefined;
  const status = ['complete', 'reviewed'].includes(tournament.status) ? 'Complete' : 'In Progress';
  const tournamentComplete = ['complete', 'reviewed'].includes(tournament.status);
  return {
    title: `${internationalTournamentTitle(tournament.kind)} ${tournament.year}`,
    infoItems: [
      { label: 'Date', value: dateRange(tournament) },
      { label: 'Host', value: tournament.hostCountries.join(', ') || 'To be announced' },
      { label: 'Winner', value: champion ?? 'To be decided' },
      { label: 'Status', value: status },
    ],
    navTabs: ['Standings', ...(stats.length > 0 ? ['Leaders', 'Stats'] : []), 'Games', 'Teams', 'Players'],
    gameTabs: gameTabs.length > 0 ? gameTabs : ['First Round'],
    standingsTabs: [
      'Standings',
      ...(tournament.groups.some(group => (group.stage ?? 'first-round') === 'first-round') ? ['First Round'] : []),
      ...(tournament.groups.some(group => group.stage === 'second-round') ? ['Second Round'] : []),
      ...(tournament.groups.some(group => group.stage === 'classification') ? ['Class. Games 17-32'] : []),
      ...(tournament.games.some(game => !['group', 'classification'].includes(game.phase)) ? ['Bracket'] : []),
    ],
    games,
    firstRoundGroups: groupCards(tournament, 'first-round'),
    secondRoundGroups: groupCards(tournament, 'second-round'),
    classificationGroups: groupCards(tournament, 'classification'),
    teams: tournament.teams.map(team => ({
      name: team.country,
      code: team.abbrev,
      flagId: '',
      flagUrl: team.imageUrl,
    })),
    players: playerCards(tournament),
    stats,
    leaders: runtimeLeaders(stats),
    standings: tournamentComplete ? standings.slice(3) : standings,
    topThree: tournamentComplete ? standings.slice(0, 3) : [],
    standingsMode: tournamentComplete ? 'standings' : 'odds',
    bracket: runtimeBracket(tournament),
  };
}
