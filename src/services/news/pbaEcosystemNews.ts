import { getPlayerImage } from '../../components/central/view/bioCache';
import type { NewsItem } from '../../components/news/types';
import type { GameState, NBAPlayer } from '../../types';
import { buildBracketLayout, getAllStarWeekendDates } from '../allStar/allStarWeekendDates';
import { getPbaConferenceCalendarForSeason, resolvePbaSeasonDate } from '../pba/calendar';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { isPbaIsolatedMode } from '../../utils/uiMode';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { resolveCompetitionSeason } from '../competition/competitionResolver';
import { compactNewsText, displayNewsDate } from './europeNews';
import { renderNewsTemplate } from './NewsGenerator';
import type { NewsCategory } from './newsTemplates';

const CONFERENCE_NAMES: Record<string, string> = {
  philippine: 'Philippine Cup',
  commissioners: "Commissioner's Cup",
  governors: "Governors' Cup",
};

interface PbaTeamDetails {
  tid: number;
  name: string;
  logoUrl?: string;
  wins: number;
  losses: number;
}

const recordValue = (team: any, keys: string[]): number => {
  for (const key of keys) {
    const value = Number(team?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

function pbaTeamIds(state: GameState): Set<number> {
  const external = (state.nonNBATeams ?? [])
    .filter((team: any) => team?.league === 'PBA')
    .map((team: any) => Number(team.tid ?? team.id));
  const active = external.length > 0 ? external : state.teams.map(team => Number(team.id));
  return new Set(active.filter(Number.isFinite));
}

function teamDetails(state: GameState, tid: number | undefined, season: number): PbaTeamDetails | null {
  if (tid == null) return null;
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  if (!team) return null;
  return {
    tid: Number('tid' in team ? team.tid : team.id),
    name: getTeamFullName(team),
    logoUrl: getResolvedTeamLogoUrl(team, season) || undefined,
    wins: recordValue(team, ['wins', 'won', 'w']),
    losses: recordValue(team, ['losses', 'lost', 'l']),
  };
}

export function getPbaConferenceNewsName(value: string | undefined): string {
  return CONFERENCE_NAMES[value ?? ''] ?? 'PBA conference';
}

function renderPba(state: GameState, category: NewsCategory, vars: Record<string, string | number>, seed: string) {
  return renderNewsTemplate(category, vars, {
    uiMode: state.leagueStats.uiMode,
    moddedLeagueBase: state.moddedLeagueBase,
    seed,
  });
}

function article(
  id: string,
  date: string,
  category: string,
  rendered: { headline: string; content: string },
  details: Partial<NewsItem> = {},
): NewsItem {
  return {
    id,
    category,
    date: displayNewsDate(date),
    title: rendered.headline,
    content: rendered.content,
    impact: 'standard',
    url: '#',
    skipAiExpansion: true,
    scope: 'pba',
    ...details,
  };
}

function topPerformer(stats: any[]): any | null {
  return [...stats].sort((left, right) => Number(right.gameScore ?? right.pts ?? 0) - Number(left.gameScore ?? left.pts ?? 0))[0] ?? null;
}

function dateTimestamp(value: unknown): number {
  const timestamp = new Date(String(value ?? '')).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function calendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function conferenceCompetitionId(conference: string | undefined): string {
  if (conference === 'commissioners') return 'pba-commissioners-cup';
  if (conference === 'governors') return 'pba-governors-cup';
  return 'pba-philippine-cup';
}

function conferenceFinalDate(season: number, conference: string | undefined): string {
  const calendar = getPbaConferenceCalendarForSeason(conferenceCompetitionId(conference), season);
  return resolvePbaSeasonDate(season, calendar.playoffs.final.end);
}

function latestCompetitionGameDate(state: GameState, season: number, conference?: string): string | undefined {
  const currentTimestamp = dateTimestamp(state.date);
  const competitionId = conference ? conferenceCompetitionId(conference) : null;
  return (state.boxScores ?? [])
    .filter((game: any) => Number(game.season) === season)
    .filter((game: any) => !competitionId || String(game.competitionId ?? '').toLowerCase() === competitionId)
    .filter((game: any) => dateTimestamp(game.date) > 0 && dateTimestamp(game.date) <= currentTimestamp)
    .sort((left: any, right: any) => dateTimestamp(right.date) - dateTimestamp(left.date))[0]?.date;
}

function buildGameArticles(state: GameState, season: number, tids: Set<number>): NewsItem[] {
  const earliestVisibleSeason = season - 1;
  return (state.boxScores ?? [])
    .filter((game: any) => game?.gameId != null)
    .filter((game: any) => {
      if (game.season == null) return true;
      const gameSeason = Number(game.season);
      return gameSeason >= earliestVisibleSeason && gameSeason <= season;
    })
    .filter((game: any) => String(game.competitionId ?? '').startsWith('pba-') || (tids.has(Number(game.homeTeamId)) && tids.has(Number(game.awayTeamId))))
    .slice()
    .sort((left, right) => dateTimestamp(right.date) - dateTimestamp(left.date))
    .slice(0, 18)
    .flatMap((game: any) => {
      const home = teamDetails(state, Number(game.homeTeamId), season);
      const away = teamDetails(state, Number(game.awayTeamId), season);
      if (!home || !away) return [];
      const homeScore = Number(game.homeScore);
      const awayScore = Number(game.awayScore);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) return [];
      const homeWon = homeScore > awayScore;
      const winner = homeWon ? home : away;
      const loser = homeWon ? away : home;
      const winnerScore = Math.max(homeScore, awayScore);
      const loserScore = Math.min(homeScore, awayScore);
      const winnerStats = homeWon ? game.homeStats ?? [] : game.awayStats ?? [];
      const top = topPerformer(winnerStats);
      const margin = winnerScore - loserScore;
      const winnerPct = winner.wins + winner.losses > 0 ? winner.wins / (winner.wins + winner.losses) : 0.5;
      const loserPct = loser.wins + loser.losses > 0 ? loser.wins / (loser.wins + loser.losses) : 0.5;
      const category: NewsCategory = margin <= 3 ? 'pba_close_game' : loserPct - winnerPct >= 0.15 ? 'pba_upset' : 'pba_game_recap';
      const id = `pba-game-${game.gameId}`;
      const rendered = renderPba(state, category, {
        winnerName: winner.name,
        loserName: loser.name,
        winnerScore,
        loserScore,
        margin,
        conferenceName: getPbaConferenceNewsName(state.leagueStats.pbaConference),
        topPerformer: top?.name ?? 'The winning side',
        topPts: Number(top?.pts ?? 0),
        topReb: Number(top?.reb ?? top?.trb ?? 0),
        topAst: Number(top?.ast ?? 0),
      }, id);
      if (!rendered) return [];
      const player = top ? state.players.find(candidate => candidate.internalId === top.playerId) : undefined;
      return [article(id, game.date ?? state.date, 'League News', rendered, {
        imageUrl: player ? getPlayerImage(player) : winner.logoUrl,
        gameId: Number(game.gameId),
        homeTeamId: home.tid,
        awayTeamId: away.tid,
        teamIds: [home.tid, away.tid],
      })];
    });
}

export function buildPbaAllStarRosterAnnouncement(state: GameState, id = `pba-allstar-rosters-${state.leagueStats.year}`) {
  const roster = state.allStar?.roster ?? [];
  const captains = roster.filter(player => player.isCaptain);
  if (!state.allStar?.reservesAnnounced || captains.length < 2) return null;
  const layout = buildBracketLayout(state.leagueStats, roster, state.players);
  const rendered = renderPba(state, 'pba_all_star_captains', {
    teamAName: layout.teams[0]?.name ?? 'Team A',
    teamBName: layout.teams[1]?.name ?? 'Team B',
    captainAName: captains[0].playerName,
    captainBName: captains[1].playerName,
    season: state.leagueStats.year,
  }, id);
  return rendered ? { id, ...rendered } : null;
}

export function buildPbaAllStarWeekendAnnouncement(state: GameState, id = `pba-allstar-recap-${state.leagueStats.year}`) {
  const allStar = state.allStar as any;
  const finalGame = allStar?.bracket?.games?.find((game: any) => game.round === 'final' && game.played);
  if (!allStar?.weekendComplete || !finalGame) return null;
  const layoutTeams = allStar.bracket?.teams ?? buildBracketLayout(state.leagueStats, allStar.roster ?? [], state.players).teams;
  const home = layoutTeams.find((team: any) => Number(team.tid) === Number(finalGame.homeTid));
  const away = layoutTeams.find((team: any) => Number(team.tid) === Number(finalGame.awayTid));
  const homeWon = Number(finalGame.homeScore) > Number(finalGame.awayScore);
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const mvpName = allStar.gameMvp?.name ?? finalGame.mvpName ?? 'The game MVP';
  const rendered = renderPba(state, 'pba_all_star_recap', {
    winnerName: winner?.name ?? 'The winning side',
    loserName: loser?.name ?? 'the opposing side',
    winnerScore: Math.max(Number(finalGame.homeScore ?? 0), Number(finalGame.awayScore ?? 0)),
    loserScore: Math.min(Number(finalGame.homeScore ?? 0), Number(finalGame.awayScore ?? 0)),
    mvpName,
    mvpClause: mvpName ? ` ${mvpName} was named All-Star MVP.` : '',
    contestClause: allStar.threePointContest?.winnerName ? ` ${allStar.threePointContest.winnerName} won the Three-Point Contest.` : '',
  }, id);
  return rendered ? { id, mvpName, ...rendered } : null;
}

function buildAllStarArticles(state: GameState): NewsItem[] {
  const allStar = state.allStar as any;
  if (!allStar) return [];
  const articles: NewsItem[] = [];
  const allStarSeason = Number(allStar.season ?? state.leagueStats.year);
  const dates = getAllStarWeekendDates(allStarSeason, state.leagueStats);
  const rosterStory = buildPbaAllStarRosterAnnouncement(state);
  if (rosterStory) {
    const captain = state.players.find(player => player.internalId === allStar.roster?.find((entry: any) => entry.isCaptain)?.playerId);
    articles.push(article(rosterStory.id, calendarDate(dates.reservesAnnounced), 'League News', rosterStory, {
      imageUrl: captain ? getPlayerImage(captain) : undefined,
      impact: 'high',
    }));
  }
  const weekendStory = buildPbaAllStarWeekendAnnouncement(state);
  if (weekendStory) {
      const mvp = state.players.find(player => player.internalId === allStar.gameMvp?.playerId || player.name === weekendStory.mvpName);
      articles.push(article(weekendStory.id, calendarDate(dates.allStarGame), 'League News', weekendStory, {
        imageUrl: mvp ? getPlayerImage(mvp) : undefined,
        impact: 'high',
      }));
  }
  const contests = [
    ['Slam Dunk Contest', allStar.dunkContest?.winnerName, allStar.dunkContest?.winnerId],
    ['Three-Point Contest', allStar.threePointContest?.winnerName, allStar.threePointContest?.winnerId],
    ['Skills Challenge', allStar.skillsChallenge?.winnerName, allStar.skillsChallenge?.winnerId],
    ['Dance Contest', allStar.danceContest?.winnerLabel, undefined],
  ] as const;
  for (const [contestName, winnerName, winnerId] of contests) {
    if (!winnerName) continue;
    const id = `pba-allstar-contest-${contestName.toLowerCase().replace(/[^a-z]+/g, '-')}-${state.leagueStats.year}`;
    const rendered = renderPba(state, 'pba_contest_winner', { winnerName, contestName, season: state.leagueStats.year }, id);
    if (!rendered) continue;
    const winner = state.players.find(player => player.internalId === winnerId || player.name === winnerName);
    articles.push(article(id, calendarDate(dates.saturday), 'League News', rendered, { imageUrl: winner ? getPlayerImage(winner) : undefined }));
  }
  return articles;
}

function buildChampionArticles(state: GameState, season: number): NewsItem[] {
  const champions = state.leagueStats.pbaConferenceChampions ?? [];
  const visibleChampions = champions.filter(entry => {
    const entrySeason = Number(entry.season);
    return entrySeason >= season - 1 && entrySeason <= season;
  });
  const articles = visibleChampions.flatMap(entry => {
    const entrySeason = Number(entry.season);
    const team = teamDetails(state, entry.teamId, entrySeason);
    const id = `pba-champion-${entry.conference}-${entrySeason}`;
    const mvp = state.players.find(player => player.internalId === entry.finalsMvpId);
    const mvpName = entry.finalsMvpName ?? mvp?.name;
    const wins = Number(entry.record?.wins ?? entry.record?.won ?? 0);
    const losses = Number(entry.record?.losses ?? entry.record?.lost ?? 0);
    const rendered = renderPba(state, 'pba_conference_champion', {
      championName: team?.name ?? entry.teamName,
      conferenceName: getPbaConferenceNewsName(entry.conference),
      runnerUpClause: '',
      mvpClause: mvpName ? ` ${mvpName} earned Finals MVP honors.` : '',
      recordClause: wins + losses > 0 ? ` Their conference record finished at ${wins}–${losses}.` : '',
    }, id);
    const eventDate = latestCompetitionGameDate(state, entrySeason, entry.conference)
      ?? conferenceFinalDate(entrySeason, entry.conference);
    return rendered ? [article(id, eventDate, 'League News', rendered, {
      imageUrl: mvp ? getPlayerImage(mvp) : team?.logoUrl,
      impact: 'high',
      teamIds: [entry.teamId],
      competitionId: `pba-${entry.conference}-cup`,
    })] : [];
  });
  for (const visibleSeason of [season, season - 1]) {
    const seasonChampions = visibleChampions.filter(entry => Number(entry.season) === visibleSeason);
    const teamIds = new Set(seasonChampions.map(entry => entry.teamId));
    const savedGrandSlam = state.leagueStats.pbaGrandSlam?.find(entry => Number(entry.season) === visibleSeason);
    const grandSlam = savedGrandSlam ?? (seasonChampions.length >= 3 && teamIds.size === 1 ? {
      season: visibleSeason,
      teamId: seasonChampions[0].teamId,
      teamName: seasonChampions[0].teamName,
    } : null);
    if (!grandSlam) continue;
    const team = teamDetails(state, grandSlam.teamId, visibleSeason);
    const id = `pba-grand-slam-${visibleSeason}-${grandSlam.teamId}`;
    const rendered = renderPba(state, 'pba_grand_slam', { teamName: team?.name ?? grandSlam.teamName, season: visibleSeason }, id);
    const eventDate = latestCompetitionGameDate(state, visibleSeason, 'governors')
      ?? conferenceFinalDate(visibleSeason, 'governors');
    if (rendered) articles.push(article(id, eventDate, 'League News', rendered, { imageUrl: team?.logoUrl, impact: 'high', teamIds: [grandSlam.teamId] }));
  }
  return articles;
}

function buildStandingsArticles(state: GameState, season: number, tids: Set<number>): NewsItem[] {
  const conference = state.leagueStats.pbaConference ?? 'philippine';
  const competitionId = conferenceCompetitionId(conference);
  const spec = state.activeCompetitions?.find(entry => entry.id === competitionId)
    ?? PBA_COMPETITIONS.find(entry => entry.id === competitionId);
  const resolution = spec
    ? resolveCompetitionSeason(spec, state.boxScores ?? [], season, [...tids])
    : null;
  const conferenceTeams = (resolution?.standings ?? [])
    .filter(row => row.wins + row.losses > 0)
    .flatMap(row => {
      const team = teamDetails(state, row.tid, season);
      return team ? [{ ...team, wins: row.wins, losses: row.losses }] : [];
    });
  const teams = conferenceTeams.length >= 2
    ? conferenceTeams
    : [...tids].map(tid => teamDetails(state, tid, season)).filter((team): team is PbaTeamDetails => team !== null);
  if (teams.length < 2) return [];
  const ranked = teams.sort((left, right) => right.wins / Math.max(1, right.wins + right.losses) - left.wins / Math.max(1, left.wins + left.losses));
  const leader = ranked[0];
  const chaser = ranked[1];
  if (leader.wins + leader.losses === 0) return [];
  const id = `pba-standings-${conference}-${season}`;
  const rendered = renderPba(state, 'pba_standings_race', {
    conferenceName: getPbaConferenceNewsName(conference),
    leaderName: leader.name,
    leaderRecord: `${leader.wins}–${leader.losses}`,
    chaserName: chaser.name,
    chaserRecord: `${chaser.wins}–${chaser.losses}`,
  }, id);
  return rendered ? [article(id, state.date, 'League News', rendered, { imageUrl: leader.logoUrl, teamIds: [leader.tid, chaser.tid] })] : [];
}

function buildConferencePreviewArticles(state: GameState, season: number, tids: Set<number>): NewsItem[] {
  if (state.leagueStats.pbaConferencePhase !== 'regularSeason') return [];
  const conference = state.leagueStats.pbaConference ?? 'philippine';
  const id = `pba-conference-preview-${conference}-${season}`;
  const rendered = renderPba(state, 'pba_conference_preview', {
    conferenceName: getPbaConferenceNewsName(conference),
    teamCount: tids.size,
  }, id);
  return rendered ? [article(id, state.date, 'League News', rendered, { impact: 'high', competitionId: `pba-${conference}-cup` })] : [];
}

function conferenceFromCompetition(value: string | undefined): string | undefined {
  if (value?.includes('philippine')) return 'philippine';
  if (value?.includes('commissioner')) return 'commissioners';
  if (value?.includes('governor')) return 'governors';
  return undefined;
}

function buildAwardArticles(state: GameState, season: number): NewsItem[] {
  return (state.historicalAwards ?? [])
    .filter(award => Number(award.season) >= season - 1 && Number(award.season) <= season)
    .filter(award => award.uiMode === 'pba_isolated' || String(award.competitionId ?? '').startsWith('pba-'))
    .filter(award => award.name && award.type && !/champion|all[- ]star/i.test(award.type))
    .slice(-20)
    .flatMap(award => {
      const awardSeason = Number(award.season);
      const team = teamDetails(state, award.tid, awardSeason);
      const conference = award.conference ?? conferenceFromCompetition(award.competitionId) ?? state.leagueStats.pbaConference;
      const player = state.players.find(candidate => String(candidate.internalId) === String(award.pid) || candidate.name === award.name);
      const subject = compactNewsText(award.pid ?? award.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const awardKey = compactNewsText(award.type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `pba-award-${awardSeason}-${subject}-${awardKey}`;
      const eventDate = latestCompetitionGameDate(state, awardSeason, conference)
        ?? conferenceFinalDate(awardSeason, conference);
      const rendered = renderPba(state, 'pba_award_winner', {
        winnerName: award.name,
        awardName: award.type,
        conferenceName: getPbaConferenceNewsName(conference),
        teamClause: team ? ` after representing ${team.name}` : '',
      }, id);
      return rendered ? [article(id, eventDate, 'Awards', rendered, {
        imageUrl: player ? getPlayerImage(player) : team?.logoUrl,
        impact: /mvp|best player|player of the conference/i.test(award.type) ? 'high' : 'standard',
        teamIds: team ? [team.tid] : [],
        competitionId: award.competitionId,
      })] : [];
    });
}

function buildDraftAndImportArticles(state: GameState, season: number, tids: Set<number>): NewsItem[] {
  const draft = state.players.filter(player => Number(player.draft?.year) === season && tids.has(Number(player.tid)))
    .sort((left, right) => Number(left.draft?.pick ?? 999) - Number(right.draft?.pick ?? 999))
    .slice(0, 5)
    .flatMap(player => {
      const team = teamDetails(state, player.tid, season);
      const pick = Number(player.draft?.pick);
      if (!team || !Number.isFinite(pick)) return [];
      const id = `pba-draft-${season}-${player.internalId}`;
      const rendered = renderPba(state, 'pba_draft_pick', { teamName: team.name, playerName: player.name, pickNumber: pick, season }, id);
      return rendered ? [article(id, state.date, 'League News', rendered, { imageUrl: getPlayerImage(player), teamIds: [team.tid] })] : [];
    });
  const imports = state.players.filter(player => {
    const contract = (player as NBAPlayer & { pbaImportContract?: { status?: string; conference?: string } }).pbaImportContract;
    return tids.has(Number(player.tid)) && ((player as any).isImport === true || (contract && contract.status !== 'released'));
  }).slice(0, 6).flatMap(player => {
    const team = teamDetails(state, player.tid, season);
    if (!team) return [];
    const contract = (player as any).pbaImportContract;
    const id = `pba-import-${season}-${player.internalId}-${contract?.conference ?? state.leagueStats.pbaConference}`;
    const rendered = renderPba(state, 'pba_import_signing', {
      teamName: team.name,
      playerName: player.name,
      conferenceName: getPbaConferenceNewsName(contract?.conference ?? state.leagueStats.pbaConference),
    }, id);
    return rendered ? [article(id, contract?.signedDate ?? state.date, 'Transaction', rendered, { imageUrl: getPlayerImage(player), teamIds: [team.tid] })] : [];
  });
  return [...draft, ...imports];
}

export function buildPbaEcosystemArticles(state: GameState, season: number): NewsItem[] {
  if (!isPbaIsolatedMode(state)) return [];
  const tids = pbaTeamIds(state);
  return [
    ...buildAllStarArticles(state),
    ...buildChampionArticles(state, season),
    ...buildAwardArticles(state, season),
    ...buildGameArticles(state, season, tids),
    ...buildConferencePreviewArticles(state, season, tids),
    ...buildStandingsArticles(state, season, tids),
    ...buildDraftAndImportArticles(state, season, tids),
  ];
}
