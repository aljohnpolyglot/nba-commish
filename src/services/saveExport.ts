import type { GameState, NBATeam, NonNBATeam } from '../types';

export type TeamExportLevel = 'none' | 'basic' | 'all';

export interface LeagueExportOptions {
  players: boolean;
  includeGameHighs: boolean;
  teams: TeamExportLevel;
  schedule: boolean;
  draftPicks: boolean;
  leagueSettings: boolean;
  gameState: boolean;
  transactionHistory: boolean;
  otherNews: boolean;
  headToHead: boolean;
  boxScores: boolean;
  compact: boolean;
  gzip: boolean;
  streaming: boolean;
}

export const DEFAULT_LEAGUE_EXPORT_OPTIONS: LeagueExportOptions = {
  players: true,
  includeGameHighs: true,
  teams: 'all',
  schedule: true,
  draftPicks: true,
  leagueSettings: true,
  gameState: true,
  transactionHistory: true,
  otherNews: true,
  headToHead: true,
  boxScores: true,
  compact: true,
  gzip: true,
  streaming: true,
};

export const LEAGUE_EXPORT_PRESETS = {
  default: DEFAULT_LEAGUE_EXPORT_OPTIONS,
  none: {
    ...DEFAULT_LEAGUE_EXPORT_OPTIONS,
    players: false,
    includeGameHighs: false,
    teams: 'none',
    schedule: false,
    draftPicks: false,
    leagueSettings: false,
    gameState: false,
    transactionHistory: false,
    otherNews: false,
    headToHead: false,
    boxScores: false,
  },
  all: {
    ...DEFAULT_LEAGUE_EXPORT_OPTIONS,
    boxScores: true,
  },
  teams: {
    ...DEFAULT_LEAGUE_EXPORT_OPTIONS,
    players: false,
    includeGameHighs: false,
    teams: 'all',
    schedule: false,
    draftPicks: false,
    leagueSettings: false,
    gameState: false,
    transactionHistory: false,
    otherNews: false,
    headToHead: false,
    boxScores: false,
  },
  settings: {
    ...DEFAULT_LEAGUE_EXPORT_OPTIONS,
    players: false,
    includeGameHighs: false,
    teams: 'none',
    schedule: false,
    draftPicks: false,
    leagueSettings: true,
    gameState: false,
    transactionHistory: false,
    otherNews: false,
    headToHead: false,
    boxScores: false,
  },
} satisfies Record<string, LeagueExportOptions>;

export function buildPersistableGameState(state: GameState): GameState {
  const {
    isProcessing,
    isClubbing,
    isWatchingGame,
    lazySimProgress,
    pendingStartPayload,
    prevTeams,
    lastSimResults,
    simCurrentDate,
    processingAction,
    durableSavePending,
    lastDurableSaveError,
    lastActionType,
    lastActionPayload,
    ...persistable
  } = state;
  void isProcessing;
  void isClubbing;
  void isWatchingGame;
  void lazySimProgress;
  void pendingStartPayload;
  void prevTeams;
  void lastSimResults;
  void simCurrentDate;
  void processingAction;
  void durableSavePending;
  void lastDurableSaveError;
  void lastActionType;
  void lastActionPayload;
  return persistable as GameState;
}

const BASIC_TEAM_KEYS = [
  'id',
  'tid',
  'name',
  'region',
  'abbrev',
  'conference',
  'cid',
  'did',
  'logoUrl',
  'imgURL',
  'imgURLSmall',
  'colors',
] as const;

const toBasicTeam = (team: NBATeam | NonNBATeam): Record<string, unknown> => {
  const basic: Record<string, unknown> = {};
  for (const key of BASIC_TEAM_KEYS) {
    const value = (team as unknown as Record<string, unknown>)[key];
    if (value !== undefined) basic[key] = value;
  }
  return basic;
};

const stripPlayerGameHighs = (players: GameState['players']): GameState['players'] =>
  players.map(player => ({
    ...player,
    stats: player.stats?.map(stat => Object.fromEntries(
      Object.entries(stat).filter(([key]) => !key.endsWith('Max')),
    )),
  })) as GameState['players'];

const isTransactionHistoryEntry = (entry: GameState['history'][number]): boolean => {
  const text = typeof entry === 'string' ? entry : `${entry.type ?? ''} ${entry.text ?? ''}`;
  return /\b(trade|traded|sign|signed|waiv|draft|contract|option|released)\b/i.test(text);
};

export function buildLeagueExport(
  state: GameState,
  options: LeagueExportOptions,
): Record<string, unknown> {
  const persistable = buildPersistableGameState(state);
  const output: Record<string, unknown> = options.gameState
    ? { ...persistable }
    : {
        date: persistable.date,
        day: persistable.day,
        commissionerName: persistable.commissionerName,
        gameMode: persistable.gameMode,
        leagueType: persistable.leagueType,
        moddedLeagueBase: persistable.moddedLeagueBase,
      };

  output.exportInfo = {
    format: 'nba-commish',
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
  };

  if (options.players) {
    output.players = options.includeGameHighs
      ? persistable.players
      : stripPlayerGameHighs(persistable.players);
  } else {
    delete output.players;
  }

  if (options.teams === 'all') {
    output.teams = persistable.teams;
    output.nonNBATeams = persistable.nonNBATeams;
    if (persistable.teamArchive) output.teamArchive = persistable.teamArchive;
  } else if (options.teams === 'basic') {
    output.teams = persistable.teams.map(toBasicTeam);
    output.nonNBATeams = persistable.nonNBATeams.map(toBasicTeam);
    delete output.teamArchive;
  } else {
    delete output.teams;
    delete output.nonNBATeams;
    delete output.teamArchive;
  }

  if (options.schedule) {
    output.schedule = persistable.schedule;
    output.christmasGames = persistable.christmasGames;
    output.globalGames = persistable.globalGames;
    output.playoffs = persistable.playoffs;
    output.nbaCup = persistable.nbaCup;
    output.nbaCupHistory = persistable.nbaCupHistory;
  } else {
    delete output.schedule;
    delete output.christmasGames;
    delete output.globalGames;
    delete output.playoffs;
    delete output.nbaCup;
    delete output.nbaCupHistory;
  }

  if (options.draftPicks) {
    output.draftPicks = persistable.draftPicks;
  } else {
    delete output.draftPicks;
    delete output.activeDraftOrder;
    delete output.activeDraftPicks;
    delete output.activeDraftPassedPicks;
  }

  if (options.leagueSettings) output.leagueStats = persistable.leagueStats;
  else delete output.leagueStats;

  if (options.otherNews) {
    output.history = persistable.history;
    output.news = persistable.news;
    output.socialFeed = persistable.socialFeed;
    output.inbox = persistable.inbox;
    output.chats = persistable.chats;
  } else if (options.transactionHistory) {
    output.history = persistable.history.filter(isTransactionHistoryEntry);
    delete output.news;
    delete output.socialFeed;
    delete output.inbox;
    delete output.chats;
  } else {
    delete output.history;
    delete output.news;
    delete output.socialFeed;
    delete output.inbox;
    delete output.chats;
  }

  if (options.headToHead) output.headToHead = persistable.headToHead;
  else delete output.headToHead;

  if (options.boxScores) output.boxScores = persistable.boxScores;
  else delete output.boxScores;

  return output;
}
