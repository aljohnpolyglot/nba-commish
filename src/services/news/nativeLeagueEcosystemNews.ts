import { getPlayerImage } from '../../components/central/view/bioCache';
import type { NewsItem } from '../../components/news/types';
import type { GameResult, GameState, HistoricalAward, NBATeam } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { displayNewsDate } from './europeNews';

type NativeNewsMode = 'nba' | 'wnba_isolated';

interface TeamDetails {
  id: number;
  name: string;
  team: NBATeam;
}

const INDIVIDUAL_AWARD_LABELS: Array<[RegExp, string]> = [
  [/^(MVP|Most Valuable Player|WNBA Most Valuable Player)$/i, 'Most Valuable Player'],
  [/^(DPOY|Defensive Player of the Year|WNBA Defensive Player of the Year)$/i, 'Defensive Player of the Year'],
  [/^(ROY|Rookie of the Year)$/i, 'Rookie of the Year'],
  [/^(MIP|Most Improved Player)$/i, 'Most Improved Player'],
  [/^(SMOY|Sixth (Man|Player) of the Year)$/i, 'Sixth Player of the Year'],
  [/^(COY|Coach of the Year|WNBA Coach of the Year)$/i, 'Coach of the Year'],
  [/Clutch Player of the Year/i, 'Clutch Player of the Year'],
  [/Executive of the Year/i, 'Executive of the Year'],
];

const safeSlug = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function article(
  id: string,
  date: string,
  category: string,
  title: string,
  content: string,
  details: Partial<NewsItem> = {},
): NewsItem {
  return {
    id,
    category,
    date: displayNewsDate(date),
    title,
    content,
    impact: 'standard',
    url: '#',
    skipAiExpansion: true,
    scope: 'league',
    ...details,
  };
}

function teamDetails(state: GameState, tid: number): TeamDetails | null {
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  return team ? { id: tid, name: getTeamFullName(team), team } : null;
}

function playerImageForAward(state: GameState, award: HistoricalAward): string | undefined {
  const player = state.players.find(candidate =>
    String(candidate.internalId) === String(award.pid ?? '')
    || candidate.name === award.name
  );
  return player ? getPlayerImage(player) : undefined;
}

function storyDate(mode: NativeNewsMode, season: number): string {
  return mode === 'wnba_isolated' ? `${season}-10-15` : `${season}-06-30`;
}

function visibleAwardSeasons(state: GameState, mode: NativeNewsMode): number[] {
  const asOf = normalizeDate(state.date);
  return [...new Set((state.historicalAwards ?? [])
    .map(award => Number(award.season))
    .filter(season => Number.isFinite(season) && normalizeDate(storyDate(mode, season)) <= asOf))]
    .sort((left, right) => right - left)
    .slice(0, 2);
}

function buildChampionshipArticles(
  state: GameState,
  mode: NativeNewsMode,
  leagueName: string,
  seasons: number[],
): NewsItem[] {
  return seasons.flatMap(season => {
    const rows = (state.historicalAwards ?? []).filter(award => Number(award.season) === season);
    const champion = rows.find(award => /^Champion$/i.test(award.type));
    if (!champion) return [];
    const runnerUp = rows.find(award => /^Runner Up$/i.test(award.type));
    const finalsMvp = rows.find(award => /^(Finals MVP|Finals Most Valuable Player)$/i.test(award.type));
    const team = champion.tid == null ? null : teamDetails(state, champion.tid);
    const championName = team?.name ?? champion.name;
    const runnerClause = runnerUp?.name ? ` over ${runnerUp.name}` : '';
    const mvpClause = finalsMvp?.name ? ` ${finalsMvp.name} earned Finals MVP honors.` : '';
    return [article(
      `native-champion-${mode}-${season}-${champion.tid ?? safeSlug(championName)}`,
      storyDate(mode, season),
      'Breaking News',
      `${championName} Win the ${season} ${leagueName} Championship`,
      `${championName} completed the title run${runnerClause}.${mvpClause}`,
      {
        imageUrl: finalsMvp ? playerImageForAward(state, finalsMvp) : team ? getResolvedTeamLogoUrl(team.team, season) : undefined,
        impact: 'high',
        teamIds: [champion.tid, runnerUp?.tid].filter((tid): tid is number => tid != null),
      },
    )];
  });
}

function buildIndividualAwardArticles(
  state: GameState,
  mode: NativeNewsMode,
  leagueName: string,
  seasons: number[],
): NewsItem[] {
  return seasons.flatMap(season => {
    const seen = new Set<string>();
    return (state.historicalAwards ?? [])
      .filter(award => Number(award.season) === season)
      .flatMap(award => {
        const awardLabel = INDIVIDUAL_AWARD_LABELS.find(([pattern]) => pattern.test(award.type))?.[1];
        if (!awardLabel || !award.name || seen.has(awardLabel)) return [];
        seen.add(awardLabel);
        const team = award.tid == null ? null : teamDetails(state, award.tid);
        const teamClause = team ? ` after a standout season with ${team.name}` : '';
        return [article(
          `native-award-${mode}-${season}-${safeSlug(awardLabel)}-${safeSlug(award.pid ?? award.name)}`,
          storyDate(mode, season),
          'Awards',
          `${award.name} Named ${leagueName} ${awardLabel}`,
          `${award.name} has won ${leagueName} ${awardLabel} honors for the ${season} season${teamClause}.`,
          {
            imageUrl: playerImageForAward(state, award) ?? (team ? getResolvedTeamLogoUrl(team.team, season) : undefined),
            impact: /Most Valuable Player/i.test(awardLabel) ? 'high' : 'standard',
            teamIds: team ? [team.id] : [],
          },
        )];
      });
  });
}

function honorGroup(type: string): string | null {
  if (/^All-(NBA|WNBA|League) (First|Second|Third) Team$/i.test(type)) return type;
  if (/^All-Defensive (First|Second) Team$/i.test(type)) return type;
  if (/^All-Rookie ((First|Second) Team|Team)$/i.test(type)) return type;
  return null;
}

function buildHonorTeamArticles(
  state: GameState,
  mode: NativeNewsMode,
  seasons: number[],
): NewsItem[] {
  return seasons.flatMap(season => {
    const groups = new Map<string, HistoricalAward[]>();
    for (const award of state.historicalAwards ?? []) {
      if (Number(award.season) !== season) continue;
      const group = honorGroup(award.type);
      if (!group) continue;
      groups.set(group, [...(groups.get(group) ?? []), award]);
    }
    return [...groups.entries()].slice(0, 7).map(([group, awards]) => {
      const names = awards.map(award => award.name).filter(Boolean).slice(0, 5);
      const lead = awards[0];
      return article(
        `native-honor-team-${mode}-${season}-${safeSlug(group)}`,
        storyDate(mode, season),
        'Awards',
        `${season} ${group} Announced`,
        `${group}: ${names.join(', ')}.`,
        {
          imageUrl: lead ? playerImageForAward(state, lead) : undefined,
          teamIds: awards.map(award => award.tid).filter((tid): tid is number => tid != null),
        },
      );
    });
  });
}

function recordPct(team: NBATeam, fallbackWins?: number, fallbackLosses?: number): number {
  const wins = Number(fallbackWins ?? team.wins ?? 0);
  const losses = Number(fallbackLosses ?? team.losses ?? 0);
  return wins + losses > 0 ? wins / (wins + losses) : 0.5;
}

function topPerformer(game: GameResult, winnerId: number) {
  const stats = winnerId === game.homeTeamId ? game.homeStats : game.awayStats;
  return [...stats].sort((left, right) => Number(right.gameScore ?? right.pts) - Number(left.gameScore ?? left.pts))[0];
}

function buildGameArticles(state: GameState, mode: NativeNewsMode, leagueName: string): NewsItem[] {
  const activeTids = new Set(state.teams.map(team => team.id));
  return (state.boxScores ?? [])
    .filter(game => !game.isAllStar && !game.isRisingStars && !game.isCelebrityGame)
    .filter(game => normalizeDate(game.date) <= normalizeDate(state.date))
    .filter(game => activeTids.has(game.homeTeamId) && activeTids.has(game.awayTeamId))
    .slice()
    .sort((left, right) => normalizeDate(right.date).localeCompare(normalizeDate(left.date)))
    .slice(0, 18)
    .flatMap(game => {
      if (game.homeScore === game.awayScore) return [];
      const home = teamDetails(state, game.homeTeamId);
      const away = teamDetails(state, game.awayTeamId);
      if (!home || !away) return [];
      const homeWon = game.homeScore > game.awayScore;
      const winner = homeWon ? home : away;
      const loser = homeWon ? away : home;
      const winnerScore = Math.max(game.homeScore, game.awayScore);
      const loserScore = Math.min(game.homeScore, game.awayScore);
      const margin = winnerScore - loserScore;
      const winnerPct = recordPct(winner.team, homeWon ? game.homeWins : game.awayWins, homeWon ? game.homeLosses : game.awayLosses);
      const loserPct = recordPct(loser.team, homeWon ? game.awayWins : game.homeWins, homeWon ? game.awayLosses : game.homeLosses);
      const upset = loserPct - winnerPct >= 0.15;
      const close = margin <= 4;
      const top = topPerformer(game, winner.id);
      const title = close
        ? `${winner.name} Edge ${loser.name}, ${winnerScore}–${loserScore}`
        : upset
          ? `${winner.name} Stun ${loser.name} in ${leagueName} Upset`
          : top
            ? `${top.name} Powers ${winner.name} Past ${loser.name}`
            : `${winner.name} Defeat ${loser.name}, ${winnerScore}–${loserScore}`;
      const statLine = top
        ? ` ${top.name} led the winners with ${top.pts} points, ${top.reb} rebounds and ${top.ast} assists.`
        : '';
      const gameKind = game.isPlayoff ? 'playoff matchup' : close ? 'close finish' : upset ? 'upset' : 'game';
      const player = top ? state.players.find(candidate => candidate.internalId === top.playerId) : undefined;
      return [article(
        `native-game-${mode}-${game.gameId}`,
        game.date,
        upset ? 'Breaking News' : 'League News',
        title,
        `${winner.name} won the ${gameKind} ${winnerScore}–${loserScore}.${statLine}`,
        {
          imageUrl: player ? getPlayerImage(player) : getResolvedTeamLogoUrl(winner.team, game.season),
          gameId: game.gameId,
          homeTeamId: game.homeTeamId,
          awayTeamId: game.awayTeamId,
          teamIds: [game.homeTeamId, game.awayTeamId],
        },
      )];
    });
}

function buildStandingsArticle(state: GameState, mode: NativeNewsMode, leagueName: string): NewsItem[] {
  const ranked = state.teams
    .filter(team => Number(team.wins ?? 0) + Number(team.losses ?? 0) > 0)
    .slice()
    .sort((left, right) => recordPct(right) - recordPct(left) || Number(right.wins) - Number(left.wins));
  if (ranked.length < 2) return [];
  const leader = ranked[0];
  const challenger = ranked[1];
  const gamesPlayed = Number(leader.wins ?? 0) + Number(leader.losses ?? 0);
  const checkpoint = Math.max(5, Math.floor(gamesPlayed / 5) * 5);
  return [article(
    `native-standings-${mode}-${state.leagueStats.year}-${checkpoint}`,
    state.date,
    'League News',
    `${getTeamFullName(leader)} Set the Pace in ${leagueName}`,
    `${getTeamFullName(leader)} lead at ${leader.wins}–${leader.losses}, with ${getTeamFullName(challenger)} close behind at ${challenger.wins}–${challenger.losses}.`,
    {
      imageUrl: getResolvedTeamLogoUrl(leader, state.leagueStats.year),
      teamIds: [leader.id, challenger.id],
    },
  )];
}

export function buildNativeLeagueEcosystemArticles(state: GameState): NewsItem[] {
  const mode: NativeNewsMode = state.leagueStats.uiMode === 'wnba_isolated' ? 'wnba_isolated' : 'nba';
  const leagueName = getLeagueLabels(state.leagueType, state.leagueStats.uiMode, state.leagueStats.leagueName).leagueName;
  const seasons = visibleAwardSeasons(state, mode);
  return [
    ...buildChampionshipArticles(state, mode, leagueName, seasons),
    ...buildIndividualAwardArticles(state, mode, leagueName, seasons),
    ...buildHonorTeamArticles(state, mode, seasons),
    ...buildGameArticles(state, mode, leagueName),
    ...buildStandingsArticle(state, mode, leagueName),
  ];
}
