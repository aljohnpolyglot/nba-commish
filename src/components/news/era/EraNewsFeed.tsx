import { useMemo } from 'react';
import type { GameResult, NBAPlayer, NBATeam, NonNBATeam } from '../../../types';
import type { NewsMediaEra } from '../../../utils/mediaTimeline';
import type { NewsItem } from '../types';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { didHomeTeamWin } from '../../../utils/gameOutcome';
import EarlyInternetNewsFeed from './EarlyInternetNewsFeed';
import NewspaperNewsFeed from './NewspaperNewsFeed';
import TvNewsFeed from './TvNewsFeed';
import Web2NewsFeed from './Web2NewsFeed';
import type { NewsBranding } from '../branding';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { getPlayerImage } from '../../../utils/playerImage';

type Era = Exclude<NewsMediaEra, 'modern'>;

interface EraNewsFeedProps {
  era: Era;
  articles: NewsItem[];
  topStories: NewsItem[];
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  boxScores: GameResult[];
  players: NBAPlayer[];
  seasonYear: number;
  date: string;
  leagueName: string;
  branding: NewsBranding;
  onOpen: (article: NewsItem) => void;
}

interface ScoreRow {
  id: number;
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  date: string;
  awayWon: boolean;
  awayLogo?: string;
  homeLogo?: string;
}

interface LeaderRow {
  name: string;
  line: string;
  value: number;
  team?: string;
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  imageUrl?: string;
}

function dateStamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function gameTime(value: string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function teamLabel(team: NBATeam | null): string {
  return team ? getTeamFullName(team) || team.abbrev || 'Team' : 'Team';
}

function buildScores(boxScores: GameResult[], teams: NBATeam[], nonNBATeams: NonNBATeam[], seasonYear: number): ScoreRow[] {
  const activeTids = new Set(teams.map(team => team.id));
  return [...boxScores]
    .filter(game => activeTids.has(game.homeTeamId) && activeTids.has(game.awayTeamId))
    .sort((a, b) => gameTime(b.date) - gameTime(a.date) || b.gameId - a.gameId)
    .slice(0, 5)
    .map(game => {
      const away = resolveAnyTeam(game.awayTeamId, teams, nonNBATeams);
      const home = resolveAnyTeam(game.homeTeamId, teams, nonNBATeams);
      return {
        id: game.gameId,
        away: teamLabel(away),
        home: teamLabel(home),
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        date: game.date,
        awayWon: !didHomeTeamWin(game),
        awayLogo: away ? getResolvedTeamLogoUrl(away, game.season ?? seasonYear) : undefined,
        homeLogo: home ? getResolvedTeamLogoUrl(home, game.season ?? seasonYear) : undefined,
      };
    });
}

function buildLeaders(boxScores: GameResult[], players: NBAPlayer[], seasonYear: number): LeaderRow[] {
  const playersById = new Map(players.map(player => [String(player.internalId), player]));
  const stats = [...boxScores]
    .sort((a, b) => gameTime(b.date) - gameTime(a.date) || b.gameId - a.gameId)
    .slice(0, 8)
    .flatMap(game => [
      ...(game.homeStats ?? []).map(stat => ({ stat, team: game.homeTeamAbbrev ?? 'HOME', season: game.season })),
      ...(game.awayStats ?? []).map(stat => ({ stat, team: game.awayTeamAbbrev ?? 'AWAY', season: game.season })),
    ])
    .sort((a, b) => (b.stat.gameScore ?? b.stat.pts ?? 0) - (a.stat.gameScore ?? a.stat.pts ?? 0))
    .slice(0, 12);

  return stats.map(({ stat, team, season }) => ({
    name: stat.name,
    line: `${stat.pts} PTS · ${stat.reb} REB · ${stat.ast} AST`,
    value: stat.gameScore ?? stat.pts,
    team,
    pts: stat.pts,
    reb: stat.reb,
    ast: stat.ast,
    stl: stat.stl,
    blk: stat.blk,
    imageUrl: (() => {
      const player = playersById.get(String(stat.playerId));
      return player ? getPlayerImage(player, { portraitSeason: season ?? seasonYear }) : undefined;
    })(),
  }));
}

function buildStandings(teams: NBATeam[], boxScores: GameResult[]): NBATeam[] {
  const derived = new Map<number, { wins: number; losses: number }>();
  for (const team of teams) derived.set(team.id, { wins: 0, losses: 0 });
  for (const game of boxScores) {
    if (!derived.has(game.homeTeamId) || !derived.has(game.awayTeamId)) continue;
    const home = derived.get(game.homeTeamId)!;
    const away = derived.get(game.awayTeamId)!;
    if (didHomeTeamWin(game)) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }
  return teams
    .map(team => {
      if ((team.wins ?? 0) + (team.losses ?? 0) > 0) return team;
      const record = derived.get(team.id);
      return record ? { ...team, wins: record.wins, losses: record.losses } : team;
    })
    .filter(t => Number.isFinite(t.wins) && Number.isFinite(t.losses))
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || getTeamFullName(a).localeCompare(getTeamFullName(b)));
}

export default function EraNewsFeed({
  era,
  articles,
  topStories,
  teams,
  nonNBATeams,
  boxScores,
  players,
  seasonYear,
  date,
  leagueName,
  branding,
  onOpen,
}: EraNewsFeedProps) {
  const scores = useMemo(() => buildScores(boxScores, teams, nonNBATeams, seasonYear), [boxScores, teams, nonNBATeams, seasonYear]);
  const leaders = useMemo(() => buildLeaders(boxScores, players, seasonYear), [boxScores, players, seasonYear]);
  const standings = useMemo(() => buildStandings(teams, boxScores), [teams, boxScores]);
  const lead = articles[0] ?? topStories[0];
  const secondary = articles.slice(1, 7);
  const issueDate = dateStamp(date);

  if (!lead) {
    return (
      <div className="min-h-full bg-stone-100 px-4 py-16 text-center text-stone-500">
        <p className="text-lg font-black">No articles found.</p>
        <p className="mt-2 text-sm">Try adjusting your filters.</p>
      </div>
    );
  }

  if (era === 'newspaper') {
    return (
      <NewspaperNewsFeed
        articles={articles}
        lead={lead}
        secondary={secondary}
        scores={scores}
        standings={standings}
        seasonYear={seasonYear}
        date={date}
        leagueName={leagueName}
        branding={branding}
        onOpen={onOpen}
      />
    );
  }

  if (era === 'tv') {
    return (
      <TvNewsFeed
        articles={articles}
        lead={lead}
        scores={scores}
        leaders={leaders}
        standings={standings}
        seasonYear={seasonYear}
        issueDate={issueDate}
        leagueName={leagueName}
        branding={branding}
        onOpen={onOpen}
      />
    );
  }

  if (era === 'earlyInternet') {
    return (
      <EarlyInternetNewsFeed
        articles={articles}
        lead={lead}
        secondary={secondary}
        scores={scores}
        leaders={leaders}
        standings={standings}
        seasonYear={seasonYear}
        issueDate={issueDate}
        leagueName={leagueName}
        branding={branding}
        onOpen={onOpen}
      />
    );
  }

  return (
    <Web2NewsFeed
      articles={articles}
      lead={lead}
      secondary={secondary}
      scores={scores}
      leaders={leaders}
      standings={standings}
      seasonYear={seasonYear}
      leagueName={leagueName}
      branding={branding}
      onOpen={onOpen}
    />
  );
}
