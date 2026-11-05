import type { GameState, NBAPlayer } from '../../types';
import { formatExternalSalary } from '../../constants';
import { computeAge, normalizeDate } from '../../utils/helpers';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';
import { getDisplayOverall } from '../../utils/playerRatings';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { computeMoodScore, normalizeMoodTraits } from '../../utils/mood/moodScore';
import {
  computeResignProbability,
  getContractThoughts,
} from '../../components/central/view/playerBioMoraleShared';

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export function findChatPlayer(
  state: GameState,
  recipientId: string | undefined,
  recipientName: string,
): NBAPlayer | null {
  const normalizedId = String(recipientId ?? '').replace(/^player-/, '');
  const byId = normalizedId
    ? state.players.find(candidate => String(candidate.internalId) === normalizedId)
    : undefined;
  return byId ?? state.players.find(candidate => normalize(candidate.name) === normalize(recipientName)) ?? null;
}

function isPlayerOnChatRoster(state: GameState, player: NBAPlayer): boolean {
  if (isOnRoster(player)) return true;
  const externalTeam = state.nonNBATeams.find(team => team.tid === player.tid);
  return !!externalTeam && normalize(player.status) === normalize(externalTeam.league);
}

export function findManagedChatPlayer(
  state: GameState,
  recipientId: string,
  recipientName: string,
): NBAPlayer | null {
  const player = findChatPlayer(state, recipientId, recipientName);
  return player
    && Number(player.tid) === Number(state.userTeamId)
    && isPlayerOnChatRoster(state, player)
    ? player
    : null;
}

const finite = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const perGame = (value: unknown, games: number): string => (
  (finite(value) / Math.max(1, games)).toFixed(1)
);

const identifierLabel = (value: string): string => value
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

function teamName(state: GameState, teamId: number): string {
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams);
  return team ? getTeamFullName(team) : `Team ${teamId}`;
}

export function getPlayerChatAffiliation(state: GameState, player: NBAPlayer): {
  currentTeamName?: string;
  formerTeamName?: string;
  formerTeamId?: number;
} {
  const currentTeam = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams);
  if (currentTeam && isPlayerOnChatRoster(state, player)) {
    return { currentTeamName: getTeamFullName(currentTeam) };
  }
  const prior = [
    ...(player.transactions ?? []).map((entry, index) => ({ tid: Number(entry.tid), season: Number(entry.season ?? 0), index: index + 10_000 })),
    ...(player.stats ?? []).filter(entry => !entry.playoffs && Number(entry.gp ?? 0) > 0).map((entry, index) => ({ tid: Number(entry.tid), season: Number(entry.season ?? 0), index })),
  ]
    .filter(entry => entry.tid >= 0 && !!resolveAnyTeam(entry.tid, state.teams, state.nonNBATeams))
    .sort((left, right) => right.season - left.season || right.index - left.index)[0];
  const formerTeam = prior ? resolveAnyTeam(prior.tid, state.teams, state.nonNBATeams) : undefined;
  return formerTeam ? { formerTeamName: getTeamFullName(formerTeam), formerTeamId: prior.tid } : {};
}

function competitionName(state: GameState, competitionId: string | undefined, leagueName: string): string {
  if (!competitionId) return leagueName;
  return state.activeCompetitions?.find(competition => competition.id === competitionId)?.displayName
    ?? identifierLabel(competitionId);
}

function currentSeasonStatLines(
  state: GameState,
  player: NBAPlayer,
  leagueName: string,
): string[] {
  const currentYear = state.leagueStats.year;
  const seasonRows = (player.stats ?? []).filter(row => row.season === currentYear);
  const teamRows = seasonRows.filter(row => Number(row.tid) === Number(player.tid));
  return (teamRows.length > 0 ? teamRows : seasonRows)
    .slice(0, 8)
    .map(row => {
      const games = Math.max(0, finite(row.gp));
      const label = competitionName(state, row.competitionId, leagueName);
      const phase = row.playoffs ? 'postseason' : row.competitionPhase || 'regular season';
      const fgPct = finite(row.fga) > 0 ? `${(finite(row.fg) / finite(row.fga) * 100).toFixed(1)}% FG` : 'no FG attempts';
      const tpPct = finite(row.tpa) > 0 ? `, ${(finite(row.tp) / finite(row.tpa) * 100).toFixed(1)}% 3PT` : '';
      return `${label}, ${phase}: ${games} GP, ${perGame(row.pts, games)} PPG, ${perGame(row.trb, games)} RPG, ${perGame(row.ast, games)} APG, ${perGame(row.stl, games)} SPG, ${perGame(row.blk, games)} BPG, ${perGame(row.min, games)} MPG, ${fgPct}${tpPct}`;
    });
}

function primarySeasonStatLine(player: NBAPlayer, season: number): string {
  const rows = (player.stats ?? [])
    .filter(row => row.season === season && Number(row.tid) === Number(player.tid) && !row.playoffs)
    .sort((left, right) => finite(right.gp) - finite(left.gp));
  const row = rows[0];
  if (!row) return 'no current-season appearances';
  const games = Math.max(0, finite(row.gp));
  return `${games} GP, ${perGame(row.pts, games)} PPG, ${perGame(row.trb, games)} RPG, ${perGame(row.ast, games)} APG`;
}

function formatSalary(player: NBAPlayer, leagueName: string, external: boolean): string | null {
  if (!player.contract) return null;
  const salaryUSD = finite(player.contract.amount) * 1_000;
  if (external) return formatExternalSalary(salaryUSD, leagueName);
  if (salaryUSD >= 1_000_000) return `$${(salaryUSD / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(salaryUSD / 1_000)}K`;
}

function competitionRecordLines(state: GameState, teamId: number, leagueName: string): string[] {
  const records = new Map<string, { wins: number; losses: number; pointsFor: number; pointsAgainst: number }>();
  for (const game of state.boxScores) {
    if (game.season !== state.leagueStats.year || game.isPreseason || game.excludeFromRecord) continue;
    const isHome = game.homeTeamId === teamId;
    const isAway = game.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const baseLabel = competitionName(state, game.competitionId, leagueName);
    const label = game.isPlayoff || game.isPlayIn ? `${baseLabel} postseason` : baseLabel;
    const record = records.get(label) ?? { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
    const pointsFor = isHome ? finite(game.homeScore) : finite(game.awayScore);
    const pointsAgainst = isHome ? finite(game.awayScore) : finite(game.homeScore);
    record.wins += game.winnerId === teamId ? 1 : 0;
    record.losses += game.winnerId === teamId ? 0 : 1;
    record.pointsFor += pointsFor;
    record.pointsAgainst += pointsAgainst;
    records.set(label, record);
  }
  return [...records.entries()].slice(0, 8).map(([label, record]) => {
    const games = Math.max(1, record.wins + record.losses);
    const differential = (record.pointsFor - record.pointsAgainst) / games;
    return `${label}: ${record.wins}-${record.losses}, ${differential >= 0 ? '+' : ''}${differential.toFixed(1)} average point differential`;
  });
}

function recentGameLines(
  state: GameState,
  player: NBAPlayer,
  leagueName: string,
): { results: string[]; playerLines: string[] } {
  const today = normalizeDate(state.date);
  const games = state.boxScores
    .filter(game => (
      (game.homeTeamId === player.tid || game.awayTeamId === player.tid)
      && normalizeDate(game.date) <= today
    ))
    .sort((left, right) => normalizeDate(right.date).localeCompare(normalizeDate(left.date)))
    .slice(0, 5);
  return {
    results: games.map(game => {
      const isHome = game.homeTeamId === player.tid;
      const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
      const ownScore = isHome ? game.homeScore : game.awayScore;
      const opponentScore = isHome ? game.awayScore : game.homeScore;
      const competition = competitionName(state, game.competitionId, leagueName);
      return `${game.date}, ${competition}: ${game.winnerId === player.tid ? 'W' : 'L'} ${ownScore}-${opponentScore} ${isHome ? 'vs' : 'at'} ${teamName(state, opponentId)}`;
    }),
    playerLines: games.flatMap(game => {
      const stat = [...game.homeStats, ...game.awayStats].find(row =>
        String(row.playerId) === String(player.internalId) || normalize(row.name) === normalize(player.name),
      );
      if (!stat) return [];
      return [`${game.date} vs ${teamName(state, game.homeTeamId === player.tid ? game.awayTeamId : game.homeTeamId)}: ${stat.pts} PTS, ${stat.reb} REB, ${stat.ast} AST, ${stat.stl} STL, ${stat.blk} BLK, ${stat.min.toFixed(1)} MIN, ${stat.pm >= 0 ? '+' : ''}${stat.pm}`];
    }),
  };
}

function upcomingGameLines(state: GameState, teamId: number, leagueName: string): string[] {
  const today = normalizeDate(state.date);
  return state.schedule
    .filter(game => (
      !game.played
      && (game.homeTid === teamId || game.awayTid === teamId)
      && normalizeDate(game.date) >= today
    ))
    .sort((left, right) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)))
    .slice(0, 5)
    .map(game => {
      const isHome = game.homeTid === teamId;
      const opponentId = isHome ? game.awayTid : game.homeTid;
      const competition = competitionName(state, game.competitionId, leagueName);
      const location = [game.venue, game.city, game.country].filter(Boolean).join(', ');
      return `${game.date}, ${competition}: ${isHome ? 'home vs' : 'away at'} ${teamName(state, opponentId)}${location ? ` (${location})` : ''}`;
    });
}

export function buildPlayerChatContext(state: GameState, player: NBAPlayer): string {
  const nbaTeam = state.teams.find(team => team.id === player.tid);
  const externalTeam = state.nonNBATeams.find(team => team.tid === player.tid);
  const affiliation = getPlayerChatAffiliation(state, player);
  const clubName = affiliation.currentTeamName ?? affiliation.formerTeamName ?? 'no current club';
  const leagueName = externalTeam?.league
    ?? state.leagueStats.leagueName
    ?? (state.leagueType === 'fictional' ? 'Fictional League' : player.status === 'Active' ? 'NBA' : player.status || 'League');
  const currentYear = state.leagueStats.year;
  const nationalities = getPlayerNationalityCountries(player);
  const age = computeAge(player, currentYear);
  const salary = formatSalary(player, leagueName, !!externalTeam);
  const roster = state.players
    .filter(candidate => candidate.tid === player.tid && isPlayerOnChatRoster(state, candidate))
    .sort((left, right) => getDisplayOverall(right, currentYear) - getDisplayOverall(left, currentYear))
    .slice(0, 24);
  const recent = recentGameLines(state, player, leagueName);
  const upcoming = upcomingGameLines(state, player.tid, leagueName);
  const competitionRecords = competitionRecordLines(state, player.tid, leagueName);
  const statLines = currentSeasonStatLines(state, player, leagueName);
  const lines = [
    affiliation.currentTeamName
      ? `You are ${player.name}, a professional player for ${clubName} in ${leagueName}.`
      : `You are ${player.name}, currently a ${player.status === 'Retired' || player.tid === -3 ? 'retired player' : 'free agent'} with no current club${affiliation.formerTeamName ? `; your most recent club was ${affiliation.formerTeamName}` : ''}.`,
    `Current save date: ${state.date}. Current season: ${currentYear}.`,
    `Player profile: ${player.pos || 'position unavailable'}, age ${age}, ${player.hgt ? `${player.hgt} inches` : 'height unavailable'}${nationalities.length ? `, nationality ${nationalities.join(' / ')}` : ''}.`,
  ];

  const seasonRecord = externalTeam?.seasons?.find(season => season.season === currentYear);
  const wins = nbaTeam?.wins ?? seasonRecord?.wins ?? seasonRecord?.won;
  const losses = nbaTeam?.losses ?? seasonRecord?.losses ?? seasonRecord?.lost;
  if (wins != null && losses != null) lines.push(`Club record: ${wins}-${losses}.`);
  if (competitionRecords.length) lines.push(`Current competition records: ${competitionRecords.join(' | ')}.`);

  if (player.contract) {
    const options = [
      player.contract.hasPlayerOption ? 'player option' : null,
      player.contract.hasTeamOption ? 'team option' : null,
      player.contract.type ? `type ${player.contract.type}` : null,
    ].filter(Boolean).join(', ');
    lines.push(`Your contract: ${salary ?? 'salary unavailable'} annually, expires after ${player.contract.exp}${options ? `, ${options}` : ''}.`);

    const teamPlayers = state.players.filter(candidate => candidate.tid === player.tid && isPlayerOnChatRoster(state, candidate));
    const mood = computeMoodScore(player, nbaTeam, state.date, false, false, false, teamPlayers, currentYear);
    const traits = normalizeMoodTraits((player as NBAPlayer & { moodTraits?: string[] }).moodTraits ?? []);
    const gamesPlayed = finite(nbaTeam?.wins) + finite(nbaTeam?.losses);
    const teamWinPct = gamesPlayed > 0 ? finite(nbaTeam?.wins) / gamesPlayed : 0.5;
    const outlook = computeResignProbability(player, traits, mood.score, currentYear, teamWinPct, nbaTeam);
    lines.push(`Your contract thoughts: "${getContractThoughts(player, traits, mood.score, currentYear, teamWinPct, state.leagueStats)}"`);
    if (outlook?.retirementStatus === 'retiring') {
      lines.push('Your binding decision: you will retire after this season. Never claim that you want another season or would re-sign.');
    } else if (outlook?.retirementStatus === 'considering') {
      lines.push('Your current outlook: you are considering retirement and have not committed to playing another season.');
    } else if (outlook) {
      lines.push(`Your current re-sign outlook: ${outlook.score}% likelihood of re-signing with this club.`);
    }
  } else {
    lines.push('Your save has no active contract terms recorded.');
  }

  if (player.injury?.gamesRemaining > 0) {
    lines.push(`Your health: ${player.injury.type}, ${player.injury.gamesRemaining} games remaining${player.injury.startDate ? `, recorded ${player.injury.startDate}` : ''}.`);
  } else {
    lines.push('Your health: available, with no saved active injury.');
  }
  if (player.suspension?.gamesRemaining > 0) {
    lines.push(`Your suspension: ${player.suspension.reason}, ${player.suspension.gamesRemaining} games remaining.`);
  }

  const playerState = player as NBAPlayer & { morale?: number; moodTraits?: string[] };
  if (Number.isFinite(playerState.morale)) {
    lines.push(`Your current morale: ${playerState.morale}/100${playerState.moodTraits?.length ? `; mood traits ${playerState.moodTraits.slice(0, 4).join(', ')}` : ''}.`);
  }

  const availability = state.euroTransferAvailability?.[player.internalId];
  const listing = state.transferListings?.find(item => item.playerId === player.internalId && item.status === 'active');
  if (availability) lines.push(`Your saved transfer status: ${availability.state}.`);
  if (listing) lines.push(`Your active transfer listing: €${Math.round(listing.askingEUR).toLocaleString('en-US')} asking fee, ${listing.daysLeft} days left, ${listing.bidsCount} bids.`);

  lines.push(statLines.length
    ? `Your current-season statistics: ${statLines.join(' | ')}.`
    : 'Your save has no current-season statistical row for you yet.');
  if (recent.playerLines.length) lines.push(`Your recent game lines: ${recent.playerLines.join(' | ')}.`);
  if (recent.results.length) lines.push(`Recent club results: ${recent.results.join(' | ')}.`);
  if (upcoming.length) lines.push(`Upcoming fixtures: ${upcoming.join(' | ')}.`);

  const awards = (player.awards ?? [])
    .filter(award => award.season <= currentYear)
    .slice(-8)
    .map(award => `${award.type} (${award.season}${award.competitionId ? `, ${competitionName(state, award.competitionId, leagueName)}` : ''})`);
  if (awards.length) lines.push(`Your saved awards: ${awards.join(', ')}.`);

  lines.push(`Current senior roster (${roster.length}): ${roster.map(teammate => {
    const injury = teammate.injury?.gamesRemaining > 0 ? `, out ${teammate.injury.gamesRemaining} games (${teammate.injury.type})` : '';
    return `${teammate.name} (${teammate.pos || 'N/A'}, ${primarySeasonStatLine(teammate, currentYear)}${injury})`;
  }).join(' | ')}.`);

  if (normalize(leagueName).includes('pba')) {
    lines.push('Language: speak primarily English; natural, restrained Taglish is appropriate when it fits, but remain understandable and follow an explicit language request.');
  } else {
    lines.push(`Language: speak primarily English; natural phrasing influenced by ${nationalities.join(' / ') || 'your background'} is acceptable, but remain understandable and follow an explicit language request.`);
  }
  lines.push(`Use only facts above and the supplied chat history. Do not invent a result, fixture, injury, contract, transfer, teammate, competition, or award. ${affiliation.currentTeamName ? `Treat ${clubName} and ${leagueName} as the active basketball context` : `Treat Free Agency as the active context and ${clubName} only as a former club`}; do not import facts from another league running in the same save.`);
  return lines.join('\n');
}
