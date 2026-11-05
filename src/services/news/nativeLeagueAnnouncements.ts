import type { GameState, NewsItem, SocialPost } from '../../types';
import type { RetireeRecord } from '../playerDevelopment/retirementChecker';
import { getSocialHandles } from '../../data/social/handles';
import { getTeamFullName } from '../../utils/teamNames';
import { calculateSocialEngagement, normalizeDate } from '../../utils/helpers';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { appendMediaFacts } from '../media/mediaFacts';
import { getLeagueLifecycleMode } from '../lifecycle/leagueSeasonLifecycle';
import type { SummerLeagueTournamentState } from '../summerLeague/types';
import type { InternationalTournamentState } from '../fiba/types';
import { internationalTournamentTitle } from '../fiba/competitionIdentity';

export interface NativeLeagueAnnouncementEvent {
  type: 'NATIVE_LEAGUE_ANNOUNCEMENT';
  date: string;
  payload: {
    id: string;
    kind: 'player_retirement' | 'performance' | 'memorial_tribute';
    retiree?: RetireeRecord;
    artists?: string[];
    event?: string;
    sponsor?: string;
    playerId?: string;
    playerName?: string;
    teamName?: string;
    honorType?: 'formal_tribute' | 'moment_of_silence';
    gameId?: number;
  };
}

const addDays = (date: string, days: number): string => {
  const next = new Date(`${normalizeDate(date)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const handleFor = (state: GameState, seed: string, keys: string[]) => {
  const handles = getSocialHandles(state.leagueType, state.leagueStats?.uiMode);
  const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return handles[keys[hash % keys.length]] ?? handles.NBAPR;
};

const getPublicLeagueName = (state: GameState) => {
  if (state.leagueType === 'fictional') return state.leagueStats.leagueName ?? 'The league';
  return getLeagueLabels(state.leagueType, state.leagueStats.uiMode).finals.replace(/\s+Finals$/i, '');
};

const publicPatch = (
  state: GameState,
  input: {
    id: string;
    date: string;
    headline: string;
    newsContent: string;
    socialContent: string | ((handle: string) => string);
    handleKeys: string[];
    type?: string;
    playerPortraitUrl?: string;
  },
): Pick<GameState, 'news' | 'socialFeed'> => {
  const newsId = `native-news-${input.id}`;
  const socialId = `native-social-${input.id}`;
  const news: NewsItem[] = state.news.some(item => item.id === newsId)
    ? state.news
    : [{
        id: newsId,
        headline: input.headline,
        content: input.newsContent,
        date: input.date,
        type: input.type ?? 'league',
        category: 'League News',
        isNew: true,
        read: false,
        playerPortraitUrl: input.playerPortraitUrl,
      }, ...state.news].slice(0, 200);
  if (
    !isTwitterAvailable(input.date, state.leagueStats?.year)
    || state.socialFeed.some(post => post.id === socialId)
  ) {
    return { news, socialFeed: state.socialFeed };
  }
  const handle = handleFor(state, input.id, input.handleKeys);
  const atHandle = `@${handle.handle.replace(/^@/, '')}`;
  const socialContent = typeof input.socialContent === 'function'
    ? input.socialContent(atHandle)
    : input.socialContent;
  const engagement = calculateSocialEngagement(atHandle, socialContent);
  const post: SocialPost = {
    id: socialId,
    author: handle.name,
    handle: atHandle,
    content: socialContent,
    date: input.date,
    likes: engagement.likes,
    retweets: engagement.retweets,
    source: 'TwitterX',
    isNew: true,
    verified: handle.verified,
    avatarUrl: handle.avatarUrl,
    playerPortraitUrl: input.playerPortraitUrl,
  };
  return { news, socialFeed: [post, ...state.socialFeed].slice(0, 500) };
};

const tournamentDate = (
  tournament: Pick<SummerLeagueTournamentState | InternationalTournamentState, 'games' | 'year'>,
): string => tournament.games.find(game => game.phase === 'final')?.date ?? `${tournament.year}-07-01`;

export function publishSummerLeagueCoverage(
  state: GameState,
  tournament: SummerLeagueTournamentState,
): Pick<GameState, 'news' | 'socialFeed'> {
  if (!tournament.result || !['complete', 'reviewed'].includes(tournament.status)) {
    return { news: state.news, socialFeed: state.socialFeed };
  }
  const champion = tournament.teams.find(team => team.id === tournament.result?.championTeamId);
  const runnerUp = tournament.teams.find(team => team.id === tournament.result?.runnerUpTeamId);
  if (!champion) return { news: state.news, socialFeed: state.socialFeed };
  const allPlayers = tournament.teams.flatMap(team => [...team.players, ...team.reserves]);
  const mvp = allPlayers.find(player => player.id === tournament.result?.awards.mvpPlayerId);
  const finalMvp = allPlayers.find(player => player.id === tournament.result?.awards.championshipMvpPlayerId);
  const date = tournamentDate(tournament);
  const score = tournament.result.finalScore ? ` ${tournament.result.finalScore}.` : '';
  const finalist = runnerUp ? ` the ${runnerUp.name}` : ' the field';
  const official = publicPatch(state, {
    id: `${tournament.id}-champion`,
    date,
    headline: `${champion.name} Win ${tournament.title}`,
    newsContent: `${champion.name} defeated${finalist} to win the ${tournament.year} ${tournament.title}.${score}${finalMvp ? ` ${finalMvp.name} was named championship MVP.` : ''}`,
    socialContent: `${champion.name} ARE SUMMER LEAGUE CHAMPIONS 🏆${score}${finalMvp ? ` ${finalMvp.name} takes championship MVP.` : ''}`,
    handleKeys: ['NBA'],
    type: 'summer-league',
    playerPortraitUrl: finalMvp?.imageUrl,
  });
  const afterOfficial = { ...state, ...official };
  if (!mvp) return official;
  return publicPatch(afterOfficial, {
    id: `${tournament.id}-mvp`,
    date,
    headline: `${mvp.name} Named ${tournament.title} MVP`,
    newsContent: `${mvp.name} earned ${tournament.title} MVP honors after leading the tournament's top prospect performances.`,
    socialContent: `SUMMER LEAGUE MVP ⭐ ${mvp.name} made the most of the stage.`,
    handleKeys: ['SportsCenter'],
    type: 'summer-league',
    playerPortraitUrl: mvp.imageUrl,
  });
}

export function publishInternationalTournamentCoverage(
  state: GameState,
  tournament: InternationalTournamentState,
): Pick<GameState, 'news' | 'socialFeed'> {
  if (!tournament.result || !['complete', 'reviewed'].includes(tournament.status)) {
    return { news: state.news, socialFeed: state.socialFeed };
  }
  const champion = tournament.teams.find(team => team.id === tournament.result?.championTeamId);
  const runnerUp = tournament.teams.find(team => team.id === tournament.result?.runnerUpTeamId);
  if (!champion) return { news: state.news, socialFeed: state.socialFeed };
  const date = tournamentDate(tournament);
  const title = internationalTournamentTitle(tournament.kind);
  const score = tournament.result.finalScore ? ` ${tournament.result.finalScore}.` : '';
  const finalist = runnerUp ? ` over ${runnerUp.country}` : '';
  const official = publicPatch(state, {
    id: `${tournament.id}-champion`,
    date,
    headline: `${champion.country} Crowned ${title} Champion`,
    newsContent: `${champion.country} won the ${tournament.year} ${title}${finalist}.${score}`,
    socialContent: `${champion.country} ARE ${title.toUpperCase()} CHAMPIONS 🏆${score}`,
    handleKeys: ['NBA'],
    type: 'international',
  });
  const finalBox = tournament.boxScores.find(box => box.date === date)
    ?? tournament.boxScores.at(-1);
  const standout = finalBox
    ? [...finalBox.homeStats, ...finalBox.awayStats].sort((left, right) => right.pts - left.pts || right.reb - left.reb)[0]
    : undefined;
  if (!standout) return official;
  return publicPatch({ ...state, ...official }, {
    id: `${tournament.id}-final-standout`,
    date,
    headline: `${standout.name} Delivers on the International Stage`,
    newsContent: `${standout.name} scored ${standout.pts} points in the ${title} final, adding ${standout.reb} rebounds and ${standout.ast} assists.`,
    socialContent: `A FINAL TO REMEMBER 🌍 ${standout.name}: ${standout.pts} PTS, ${standout.reb} REB, ${standout.ast} AST.`,
    handleKeys: ['SportsCenter'],
    type: 'international',
  });
}

export function buildRetirementSocialContent(retiree: RetireeRecord, handle: string): string {
  const games = retiree.careerGP > 0 ? `${retiree.careerGP} career games` : 'a long professional career';
  const resume = [
    retiree.allStarAppearances > 0
      ? `${retiree.allStarAppearances} All-Star selection${retiree.allStarAppearances === 1 ? '' : 's'}`
      : null,
    retiree.championships > 0
      ? `${retiree.championships} championship${retiree.championships === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean).join(' and ');
  const achievement = resume ? ` The résumé: ${resume}.` : '';
  const normalizedHandle = handle.toLowerCase();

  if (normalizedHandle.includes('sportscenter') || normalizedHandle.includes('nbaonespn')) {
    return `WHAT A RUN 👏 ${retiree.name} is calling it a career at age ${retiree.age} after ${games}.${achievement}`;
  }
  if (normalizedHandle.includes('nbacentral')) {
    return `BREAKING: ${retiree.name} is retiring at age ${retiree.age} after ${games}.${achievement}`;
  }
  return `${retiree.name} is retiring at age ${retiree.age} after ${games}, closing a career${resume ? ` that included ${resume}` : ''}.`;
}

export function publishContestField(
  state: GameState,
  contestId: string,
  contestName: string,
  names: string[],
  includeDerivedMedia = true,
): Pick<GameState, 'news' | 'socialFeed'> {
  if (!includeDerivedMedia || names.length === 0) {
    return { news: state.news, socialFeed: state.socialFeed };
  }
  const leagueName = getPublicLeagueName(state);
  const list = names.join(', ');
  return publicPatch(state, {
    id: `${state.leagueStats.year}-${contestId}-field`,
    date: state.date,
    headline: `${contestName} Field Announced`,
    newsContent: `${leagueName} has announced the ${contestName} field: ${list}.`,
    socialContent: `The ${contestName} field is set: ${list}.`,
    handleKeys: ['NBA', 'NBAPR', 'NBACentral', 'NBAonESPN'],
  });
}

export function publishChristmasSlate(state: GameState): Partial<GameState> {
  if ((state.christmasGames?.length ?? 0) === 0) return {};
  const matchups = state.christmasGames!.flatMap(game => {
    const home = state.teams.find(team => team.id === game.homeTid);
    const away = state.teams.find(team => team.id === game.awayTid);
    return home && away ? [`${getTeamFullName(away)} at ${getTeamFullName(home)}`] : [];
  });
  if (matchups.length === 0) return {};
  const leagueName = getPublicLeagueName(state);
  return publicPatch(state, {
    id: `${state.leagueStats.year}-christmas-slate`,
    date: state.date,
    headline: 'Christmas Day Slate Revealed',
    newsContent: `${leagueName} has revealed its Christmas Day schedule: ${matchups.join('; ')}.`,
    socialContent: `Christmas Day is set 🎄 ${matchups.join(' • ')}`,
    handleKeys: ['NBA', 'NBAPR', 'NBAonESPN', 'SportsCenter'],
  });
}

export function buildRetirementAnnouncementEvents(
  state: GameState,
  retirees: RetireeRecord[],
): NativeLeagueAnnouncementEvent[] {
  const notable = retirees
    .filter(retiree =>
      retiree.isLegend
      || retiree.allStarAppearances > 0
      || retiree.championships > 0
      || retiree.careerGP >= 650
    )
    .sort((left, right) =>
      Number(right.isLegend) - Number(left.isLegend)
      || right.allStarAppearances - left.allStarAppearances
      || right.championships - left.championships
      || right.careerGP - left.careerGP
    )
    .slice(0, 8);
  const offsets = [1, 3, 5, 8, 11, 14, 18, 22];
  return notable.map((retiree, index) => ({
    type: 'NATIVE_LEAGUE_ANNOUNCEMENT',
    date: addDays(state.date, offsets[index]),
    payload: {
      id: `${state.leagueStats.year}-${retiree.playerId}-retirement`,
      kind: 'player_retirement',
      retiree,
    },
  }));
}

export function buildPerformanceAnnouncementEvent(
  state: GameState,
  details: { artists?: string[]; event?: string },
  eventDate: string,
  sponsor?: string,
): NativeLeagueAnnouncementEvent | null {
  const artists = details.artists?.filter(Boolean) ?? [];
  if (artists.length === 0 || !details.event) return null;
  const labels = getLeagueLabels(state.leagueType, state.leagueStats.uiMode);
  const publicEvent = details.event.replace(/NBA Finals Halftime(?: Show)?/i, labels.finalsHalftime);
  const leadDays = publicEvent.includes('All-Star') ? 21 : 14;
  return {
    type: 'NATIVE_LEAGUE_ANNOUNCEMENT',
    date: addDays(eventDate, -leadDays),
    payload: {
      id: `${state.leagueStats.year}-${publicEvent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-performance`,
      kind: 'performance',
      artists,
      event: publicEvent,
      sponsor,
    },
  };
}

export function publishDueNativeAnnouncements(state: GameState, throughDate = state.date): GameState {
  const through = normalizeDate(throughDate);
  const due = (state.scheduledEvents ?? [])
    .filter((event): event is NativeLeagueAnnouncementEvent =>
      event?.type === 'NATIVE_LEAGUE_ANNOUNCEMENT'
      && normalizeDate(event.date) <= through
    )
    .sort((left, right) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)));
  let next = state;
  for (const event of due) {
    if (event.payload.kind === 'player_retirement' && event.payload.retiree) {
      const retiree = event.payload.retiree;
      const accolades = [
        retiree.allStarAppearances > 0 ? `${retiree.allStarAppearances}× All-Star` : null,
        retiree.championships > 0 ? `${retiree.championships}× champion` : null,
      ].filter(Boolean).join(', ');
      const career = retiree.careerGP > 0 ? ` after ${retiree.careerGP} career games` : '';
      const careerClose = accolades
        ? `The ${accolades} veteran closes a professional career at age ${retiree.age}.`
        : `${retiree.name} closes a professional career at age ${retiree.age}.`;
      const patch = publicPatch(next, {
        id: event.payload.id,
        date: event.date,
        headline: `${retiree.name} Announces Retirement`,
        newsContent: `${retiree.name} has announced retirement${career}. ${careerClose}`,
        socialContent: handle => buildRetirementSocialContent(retiree, handle),
        handleKeys: ['Woj', 'Shams', 'NBACentral', 'NBAonESPN', 'SportsCenter'],
        type: 'player',
        playerPortraitUrl: state.players.find(player => player.internalId === retiree.playerId)?.imgURL,
      });
      next = { ...next, ...patch };
    }
    if (event.payload.kind === 'performance' && event.payload.artists?.length) {
      const sponsoredEvent = event.payload.sponsor
        ? `${event.payload.sponsor} ${event.payload.event}`
        : event.payload.event ?? 'league showcase';
      const artists = event.payload.artists.join(', ');
      const patch = publicPatch(next, {
        id: event.payload.id,
        date: event.date,
        headline: `${artists} Reportedly Set to Perform at ${sponsoredEvent}`,
        newsContent: `${artists} will reportedly perform at the ${sponsoredEvent}.`,
        socialContent: `${artists} will reportedly perform at the ${sponsoredEvent}.`,
        handleKeys: ['Woj', 'Shams', 'NBACentral', 'LegionHoops'],
      });
      next = { ...next, ...patch };
    }
    if (event.payload.kind === 'memorial_tribute' && event.payload.playerName) {
      const playerName = event.payload.playerName;
      const teamName = event.payload.teamName;
      const honor = event.payload.honorType === 'moment_of_silence'
        ? 'a moment of silence'
        : 'a formal tribute';
      const venue = teamName ? ` before the ${teamName} home game` : '';
      const patch = publicPatch(next, {
        id: event.payload.id,
        date: event.date,
        headline: `${playerName} Honored in Memorial Tribute`,
        newsContent: `${teamName ?? 'The league'} held ${honor}${venue} in memory of ${playerName}.`,
        socialContent: `${teamName ?? 'The league'} honored ${playerName} with ${honor}${venue}.`,
        handleKeys: ['NBA', 'NBAPR', 'NBACentral', 'SportsCenter'],
        type: 'league',
        playerPortraitUrl: state.players.find(player => player.internalId === event.payload.playerId)?.imgURL,
      });
      next = { ...next, ...patch };
    }
  }
  if (due.length === 0) return next;
  const dueIds = new Set(due.map(event => event.payload.id));
  return {
    ...next,
    scheduledEvents: (next.scheduledEvents ?? []).filter(event =>
      event?.type !== 'NATIVE_LEAGUE_ANNOUNCEMENT'
      || !dueIds.has(event.payload?.id)
    ),
  };
}

/**
 * Long-sim writer for presentation-only native announcements. The scheduled
 * canonical event becomes one compact fact; prose/engagement waits for a feed
 * query. Interactive flows may continue to use publishDueNativeAnnouncements.
 */
export function indexDueNativeAnnouncements(state: GameState, throughDate = state.date): GameState {
  const through = normalizeDate(throughDate);
  const due = (state.scheduledEvents ?? [])
    .filter((event): event is NativeLeagueAnnouncementEvent =>
      event?.type === 'NATIVE_LEAGUE_ANNOUNCEMENT'
      && normalizeDate(event.date) <= through
    )
    .sort((left, right) => normalizeDate(left.date).localeCompare(normalizeDate(right.date)));
  if (due.length === 0) return state;
  const scope = getLeagueLifecycleMode(state);
  const facts = due.map(event => ({
    id: `media:v1:${scope}:commissioner_announcement:native-announcement:${event.payload.id}`,
    type: event.payload.kind === 'player_retirement' ? 'retirement' as const : 'commissioner_announcement' as const,
    occurredAt: normalizeDate(event.date),
    availableAt: normalizeDate(event.date),
    leagueScope: scope,
    season: state.leagueStats.year,
    importance: event.payload.kind === 'memorial_tribute' ? 'major' as const : 'notable' as const,
    entityRefs: {
      personIds: event.payload.playerId
        ? [event.payload.playerId]
        : event.payload.retiree?.playerId
          ? [event.payload.retiree.playerId]
          : undefined,
      gameId: event.payload.gameId,
    },
    sourceRef: { kind: 'native-announcement', id: event.payload.id },
    attributes: {
      kind: event.payload.kind,
      ...(event.payload.playerName ? { playerName: event.payload.playerName } : {}),
      ...(event.payload.retiree?.name ? { playerName: event.payload.retiree.name } : {}),
      ...(event.payload.teamName ? { teamName: event.payload.teamName } : {}),
      ...(event.payload.event ? { event: event.payload.event } : {}),
      ...(event.payload.sponsor ? { sponsor: event.payload.sponsor } : {}),
      ...(event.payload.artists ? { artists: event.payload.artists } : {}),
      ...(event.payload.honorType ? { honorType: event.payload.honorType } : {}),
    },
    templateVersion: 1,
  }));
  const indexed = appendMediaFacts(state, facts);
  const dueIds = new Set(due.map(event => event.payload.id));
  return {
    ...indexed,
    scheduledEvents: (indexed.scheduledEvents ?? []).filter(event =>
      event?.type !== 'NATIVE_LEAGUE_ANNOUNCEMENT'
      || !dueIds.has(event.payload?.id)
    ),
  };
}
