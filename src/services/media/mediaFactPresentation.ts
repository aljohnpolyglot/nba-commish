import type { GameResult, GameState, MediaFact, SocialPost } from '../../types';
import { getSocialHandles, type SocialHandle } from '../../data/social/handles';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import { getTeamFullName, getTeamNickname } from '../../utils/teamNames';
import { getPrimaryInsiderKey } from '../../utils/mediaTimeline';

export interface MediaFactCopy {
  headline: string;
  summary: string;
}

const stableNumber = (seed: string, modulus: number): number => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return (hash >>> 0) % Math.max(1, modulus);
};

const resolveTeam = (state: GameState, id: number | undefined) => {
  if (id == null) return undefined;
  const team = state.teams.find(candidate => candidate.id === id)
    ?? (state.nonNBATeams ?? []).find(candidate => candidate.tid === id);
  return team ? getHistoricalTeamSnapshot(team as any, state.leagueStats.year) as any : undefined;
};

const fullTeamName = (state: GameState, id: number | undefined): string => {
  const team = resolveTeam(state, id);
  return team ? getTeamFullName(team) : 'A league team';
};

const shortTeamName = (state: GameState, id: number | undefined): string => {
  const team = resolveTeam(state, id);
  return team ? getTeamNickname(team) || getTeamFullName(team) : 'A league team';
};

const gameForFact = (state: GameState, fact: MediaFact): {
  result?: GameResult;
  scheduled?: GameState['schedule'][number];
} => {
  const gameId = fact.entityRefs.gameId;
  return {
    result: (state.boxScores ?? []).find(box => box.gameId === gameId) as GameResult | undefined,
    scheduled: (state.schedule ?? []).find(game => game.gid === gameId),
  };
};

const injuryForFact = (state: GameState, fact: MediaFact) => {
  const playerId = fact.entityRefs.personIds?.[0];
  const gameInjury = gameForFact(state, fact).result?.injuries?.find(injury => injury.playerId === playerId);
  const player = state.players.find(candidate => candidate.internalId === playerId);
  const storedType = typeof fact.attributes?.injuryType === 'string'
    ? fact.attributes.injuryType.trim()
    : '';
  const storedGames = Number(fact.attributes?.gamesRemaining);
  const currentInjury = player?.injury?.gamesRemaining && player.injury.gamesRemaining > 0
    ? player.injury
    : undefined;
  const injuryType = storedType || gameInjury?.injuryType || currentInjury?.type || '';
  const gamesRemaining = Number.isFinite(storedGames)
    ? storedGames
    : gameInjury?.gamesRemaining ?? currentInjury?.gamesRemaining;
  return {
    playerName: player?.name ?? gameInjury?.playerName ?? 'A player',
    teamId: fact.entityRefs.teamIds?.[0] ?? gameInjury?.teamId ?? player?.tid,
    injuryType,
    gamesRemaining,
  };
};

const injuryAbsence = (games: number | undefined): string => {
  if (games == null || !Number.isFinite(games)) return 'an undetermined period';
  if (games <= 0) return 'a day-to-day period';
  if (games === 1) return 'the next game';
  if (games === 2) return 'the next two games';
  if (games <= 4) return 'approximately one week';
  if (games <= 7) return 'one-to-two weeks';
  if (games <= 14) return 'approximately two weeks';
  if (games <= 22) return 'approximately one month';
  if (games <= 35) return 'four-to-six weeks';
  if (games <= 55) return 'multiple months';
  return 'the remainder of the season';
};

const injuryArticle = (injuryType: string): string => /^[aeiou]/i.test(injuryType) ? 'an' : 'a';

const gameCopy = (state: GameState, fact: MediaFact): MediaFactCopy => {
  const { result, scheduled } = gameForFact(state, fact);
  const homeId = result?.homeTeamId ?? scheduled?.homeTid;
  const awayId = result?.awayTeamId ?? scheduled?.awayTid;
  const homeName = fullTeamName(state, homeId);
  const awayName = fullTeamName(state, awayId);
  if (!result) return { headline: `${awayName} at ${homeName}`, summary: `Final from ${fact.occurredAt}.` };
  const winnerId = result.winnerId ?? (result.homeScore >= result.awayScore ? homeId : awayId);
  const loserId = winnerId === homeId ? awayId : homeId;
  const winnerScore = winnerId === homeId ? result.homeScore : result.awayScore;
  const loserScore = winnerId === homeId ? result.awayScore : result.homeScore;
  const margin = Math.abs(winnerScore - loserScore);
  const verb = margin <= 5 ? 'edge' : margin >= 15 ? 'roll past' : 'beat';
  const gameLabel = scheduled?.isPlayoff && scheduled.playoffGameNumber
    ? ` in Game ${scheduled.playoffGameNumber}`
    : '';
  const overtime = result.isOT ? ` in ${result.otCount > 1 ? `${result.otCount}OT` : 'OT'}` : '';
  return {
    headline: `${awayName} ${result.awayScore}, ${homeName} ${result.homeScore}`,
    summary: `${shortTeamName(state, winnerId)} ${verb} the ${shortTeamName(state, loserId)} ${winnerScore}-${loserScore}${gameLabel}${overtime}.`,
  };
};

const eventCopy = (state: GameState, fact: MediaFact): MediaFactCopy => {
  const labels = getLeagueLabels(state.leagueType, state.leagueStats.uiMode, state.leagueStats.leagueName);
  const eventKey = fact.sourceRef.kind === 'calendar-event'
    ? fact.sourceRef.id.replace(/^\d+:/, '')
    : '';
  const copyByEvent: Record<string, MediaFactCopy> = {
    draft_lottery: {
      headline: `${fact.season} ${labels.draftLottery}`,
      summary: `The ${fact.season} ${labels.draftLottery} order is set.`,
    },
    draft_execute: {
      headline: `${fact.season} ${labels.draft}`,
      summary: `The ${fact.season} ${labels.draft} is complete.`,
    },
    allstar_weekend: {
      headline: 'All-Star Weekend complete',
      summary: `${labels.leagueName} All-Star Weekend has concluded.`,
    },
    hof_induction: {
      headline: 'Hall of Fame class announced',
      summary: `${labels.leagueName} has welcomed its newest Hall of Fame class.`,
    },
  };
  return copyByEvent[eventKey] ?? {
    headline: `${labels.leagueName} announcement`,
    summary: `${labels.leagueName} has issued an official update for ${fact.occurredAt}.`,
  };
};

export function resolveNewsFactCopy(state: GameState, fact: MediaFact): MediaFactCopy {
  const labels = getLeagueLabels(state.leagueType, state.leagueStats.uiMode, state.leagueStats.leagueName);
  if (fact.type === 'game_result') return gameCopy(state, fact);
  if (fact.type === 'injury') {
    const injury = injuryForFact(state, fact);
    const teamName = fullTeamName(state, injury.teamId);
    if (injury.injuryType) {
      const absence = injuryAbsence(injury.gamesRemaining);
      return {
        headline: `${injury.playerName} sidelined by ${injury.injuryType}`,
        summary: `${teamName} expect ${injury.playerName} to miss ${absence} following ${injuryArticle(injury.injuryType)} ${injury.injuryType} diagnosis.`,
      };
    }
    return {
      headline: `${injury.playerName} added to the injury report`,
      summary: `${teamName} listed ${injury.playerName} on the injury report following the latest game.`,
    };
  }
  if (fact.type === 'series_completed') {
    const series = state.playoffs?.series.find(candidate => candidate.id === fact.entityRefs.seriesId);
    const winnerId = series?.winnerId;
    const loserId = winnerId == null
      ? undefined
      : winnerId === series?.higherSeedTid ? series.lowerSeedTid : series?.higherSeedTid;
    const winnerWins = winnerId == null
      ? undefined
      : winnerId === series?.higherSeedTid ? series.higherSeedWins : series?.lowerSeedWins;
    const loserWins = winnerId == null
      ? undefined
      : winnerId === series?.higherSeedTid ? series.lowerSeedWins : series?.higherSeedWins;
    return winnerId != null
      ? {
          headline: `${fullTeamName(state, winnerId)} advance`,
          summary: `${shortTeamName(state, winnerId)} advance past the ${shortTeamName(state, loserId)}, ${winnerWins}-${loserWins}.`,
        }
      : {
          headline: 'Playoff series complete',
          summary: `${labels.leagueName} has confirmed the latest playoff advancement.`,
        };
  }
  if (fact.type === 'champion') {
    const champion = fullTeamName(state, fact.entityRefs.teamIds?.[0]);
    return { headline: `${champion} win the ${labels.finals}`, summary: `${champion} are the ${fact.season} champions.` };
  }
  if (fact.type === 'award') {
    const awardType = fact.entityRefs.awardId?.split(':')[1] ?? 'league award';
    const person = state.players.find(candidate => candidate.internalId === fact.entityRefs.personIds?.[0]);
    return { headline: `${awardType} announced`, summary: `${person?.name ?? fullTeamName(state, fact.entityRefs.teamIds?.[0])} has won the ${awardType}.` };
  }
  if (fact.type === 'draft_selection') {
    return { headline: `${fact.season} ${labels.draft} complete`, summary: `All selections are in for the ${fact.season} ${labels.draft}.` };
  }
  if (fact.type === 'hall_of_fame') {
    return { headline: 'Hall of Fame class announced', summary: `${labels.leagueName} has welcomed its newest Hall of Fame class.` };
  }
  return eventCopy(state, fact);
}

export function resolveSocialFactCopy(state: GameState, fact: MediaFact): MediaFactCopy {
  if (fact.type !== 'injury') return resolveNewsFactCopy(state, fact);
  const injury = injuryForFact(state, fact);
  if (!injury.injuryType) return {
    headline: `${injury.playerName} injury update`,
    summary: `INJURY UPDATE: ${injury.playerName} has been added to ${fullTeamName(state, injury.teamId)}'s injury report.`,
  };
  return {
    headline: `${injury.playerName} injury update`,
    summary: `INJURY UPDATE: ${injury.playerName} will miss ${injuryAbsence(injury.gamesRemaining)} for ${fullTeamName(state, injury.teamId)} with ${injuryArticle(injury.injuryType)} ${injury.injuryType}.`,
  };
}

const NBA_GAME_VOICES = [
  'NBA',
  'NBACentral',
  'NBAonESPN',
  'SportsCenter',
  'BleacherReport',
  'LegionHoops',
  'HoopCentral',
  'BasketballForever',
  'NBATV',
];

const MODE_GAME_VOICES = ['NBA', 'NBACentral', 'NBAonESPN', 'SportsCenter', 'BleacherReport'];

const primaryInsiderKey = (fact: MediaFact): 'Woj' | 'Shams' => (
  getPrimaryInsiderKey(fact.availableAt, fact.season) === 'woj' ? 'Woj' : 'Shams'
);

const voiceIndex = (fact: MediaFact, count: number): number => {
  const sourceNumber = Number(fact.sourceRef.id);
  return Number.isFinite(sourceNumber)
    ? Math.abs(Math.trunc(sourceNumber)) % count
    : stableNumber(`${fact.id}:voice`, count);
};

const authorKeyForFact = (state: GameState, fact: MediaFact): string => {
  if (fact.type === 'game_result') {
    const nbaMode = state.leagueType !== 'fictional'
      && !['pba_isolated', 'wnba_isolated', 'euro_isolated'].includes(state.leagueStats.uiMode ?? '');
    const voices = nbaMode ? NBA_GAME_VOICES : MODE_GAME_VOICES;
    return voices[voiceIndex(fact, voices.length)];
  }
  if (fact.type === 'injury' || fact.type === 'transaction' || fact.type === 'signing') return primaryInsiderKey(fact);
  if (fact.type === 'player_performance') {
    const voices = ['StatMuse', 'NBAonESPN', 'SportsCenter', 'LegionHoops', 'HoopCentral'];
    return voices[voiceIndex(fact, voices.length)];
  }
  if (fact.type === 'standings_milestone') return 'NBAonESPN';
  if (fact.type === 'commissioner_announcement') return 'NBAPR';
  return 'NBA';
};

const resolveAuthor = (state: GameState, fact: MediaFact): SocialHandle => {
  const handles = getSocialHandles(state.leagueType, state.leagueStats.uiMode);
  return handles[authorKeyForFact(state, fact)] ?? handles.NBA ?? handles.NBACentral;
};

const importanceScale: Record<MediaFact['importance'], number> = {
  routine: 0.12,
  notable: 0.42,
  major: 1,
  critical: 1.8,
};

const reachForAuthor = (author: SocialHandle): number => {
  if (author.id.includes('official')) return 18_000;
  if (author.id.includes('espn') || author.id.includes('central')) return 11_000;
  if (author.id.includes('pr') || author.id.includes('communications')) return 4_000;
  return 7_000;
};

export function shouldProjectSocialFact(state: GameState, fact: MediaFact): boolean {
  void state;
  void fact;
  // Social copy is owned by SocialEngine and explicit native announcements.
  // Raw fact projection has no account-specific editorial voice and must not
  // manufacture posts such as "NBA confirmed the latest advancement".
  return false;
}

export function deriveSocialFactCard(state: GameState, fact: MediaFact): SocialPost {
  const copy = resolveSocialFactCopy(state, fact);
  const author = resolveAuthor(state, fact);
  const reach = reachForAuthor(author);
  const playoffMultiplier = fact.type === 'game_result' && gameForFact(state, fact).scheduled?.isPlayoff ? 1.35 : 1;
  const variation = 0.8 + stableNumber(`${state.saveId ?? 'local-save'}:${fact.season}:${fact.id}:engagement`, 401) / 1000;
  const likes = Math.max(8, Math.round(reach * importanceScale[fact.importance] * playoffMultiplier * variation));
  const retweets = Math.max(1, Math.round(likes * (0.14 + stableNumber(`${fact.id}:retweets`, 13) / 100)));
  const replyCount = Math.max(0, Math.round(likes * (0.04 + stableNumber(`${fact.id}:replies`, 9) / 100)));
  return {
    id: `${fact.id}:social`,
    author: author.name,
    handle: `@${author.handle}`,
    content: copy.summary,
    date: fact.availableAt,
    likes,
    retweets,
    replyCount,
    source: 'TwitterX',
    avatarUrl: author.avatarUrl,
    verified: author.verified,
    isNew: true,
    category: fact.type,
    data: {
      mediaFactId: fact.id,
      gameId: fact.entityRefs.gameId,
      teamIds: fact.entityRefs.teamIds,
    },
  };
}

export function isInternalFallbackSocialPost(post: SocialPost): boolean {
  const content = String(post.content ?? '');
  return /(?:^|@)(?:nba|league|pba|wnba|euro)wire$/i.test(String(post.handle ?? ''))
    && /league event was recorded|completed their game|saved playoff series|reached a final result/i.test(content);
}
