export interface PbaSourceRating {
  season: number;
  tid?: number;
  pbaImportSourceSeason?: number;
  [key: string]: unknown;
}

export interface PbaSourceStat {
  season: number;
  tid: number;
  playoffs?: boolean;
  jerseyNumber?: string | number;
  gp?: number;
  gs?: number;
  min?: number;
  fg?: number;
  fga?: number;
  tp?: number;
  tpa?: number;
  ft?: number;
  fta?: number;
  orb?: number;
  drb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tov?: number;
  pf?: number;
  pts?: number;
  per?: number;
  [key: string]: unknown;
}

export interface PbaSourcePlayer {
  pid?: number;
  tid?: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  pos?: string;
  hgt?: number;
  weight?: number;
  born?: { year?: number; loc?: string };
  imgURL?: string;
  college?: string;
  ratings?: PbaSourceRating[];
  stats?: PbaSourceStat[];
  awards?: Array<{ season?: number; type?: string }>;
  draft?: { year?: number; round?: number; pick?: number; tid?: number; originalTid?: number };
  injury?: { type?: string; gamesRemaining?: number };
  retiredYear?: number | null;
  contract?: { amount?: number; exp?: number; [key: string]: unknown };
  pbaImport?: boolean;
  pbaImportSource?: string;
  pbaImportEvidence?: string | string[];
  pbaImportConfidence?: string;
  [key: string]: unknown;
}

export interface PbaSourceTeamSeason {
  season: number;
  won?: number;
  lost?: number;
  playoffRoundsWon?: number;
  pop?: number;
  stadiumCapacity?: number;
  imgURL?: string;
  imgURLSmall?: string;
  note?: string;
  region?: string;
  name?: string;
  abbrev?: string;
  colors?: string[];
  pbaSeasonLabel?: string;
  pbaTeamName?: string;
  pbaAliases?: string[];
  [key: string]: unknown;
}

export interface PbaSourceTeam {
  tid: number;
  cid?: number;
  did?: number;
  region?: string;
  name?: string;
  abbrev?: string;
  pop?: number;
  stadiumCapacity?: number;
  colors?: string[];
  imgURL?: string;
  imgURLSmall?: string;
  seasons?: PbaSourceTeamSeason[];
  disabled?: boolean;
}

export interface PbaMasterSource {
  startingSeason?: number;
  version?: number;
  players: PbaSourcePlayer[];
  teams: PbaSourceTeam[];
  awards?: unknown[];
  realgmImport?: { historyThrough?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export type PbaHistoricalDataStatus = 'ROSTER_ONLY' | 'POINTS_ONLY' | 'NOT_APPLICABLE' | 'ROSTER_SUPPORTED' | 'COMPLETE';

export interface HistoricalPbaPlayerSourceMeta {
  identityKey: string;
  sourcePid?: number;
  firstEligibleSeason: number;
  sourceSeason: number;
  sourceTeamTid?: number;
  importTagged: boolean;
  importSource?: string;
  importEvidence?: string;
  importConfidence?: string;
  importSourceSeasons?: number[];
  biographyChronologyRejected?: boolean;
  dataStatus: PbaHistoricalDataStatus;
  rosterOnly?: boolean;
  pointsOnly?: boolean;
  rosterSupported?: boolean;
}

export interface HistoricalPbaTeamIdentitySnapshot {
  season: number;
  tid: number;
  region: string;
  name: string;
  abbrev: string;
  imgURL?: string;
  colors?: string[];
}

export interface HistoricalPbaState {
  version: 1;
  sourceVersion: string;
  coachSourceVersion?: string;
  teamHistorySourceVersion?: string;
  startYear: number;
  sourceSeason: number;
  materializedSeasons: number[];
  materializedIdentityKeys: string[];
  materializedNbaMarketSeasons: number[];
  teamIdentityTimeline?: HistoricalPbaTeamIdentitySnapshot[];
  sourceHistoryHydrationVersion?: number;
}

export function getHistoricalPbaTeamIdentitySnapshot(
  historical: HistoricalPbaState | null | undefined,
  tid: number,
  season: number,
): HistoricalPbaTeamIdentitySnapshot | undefined {
  const sameFranchise = historical?.teamIdentityTimeline
    ?.filter(snapshot => snapshot.tid === tid && snapshot.season <= season)
    .sort((left, right) => right.season - left.season) ?? [];
  return sameFranchise[0];
}

type PbaIdentityTeam = {
  tid: number;
  league?: string;
  identitySeasons?: Array<{
    season: number;
    region?: string;
    name?: string;
    abbrev?: string;
    imgURL?: string;
    imgURLSmall?: string;
    logoUrl?: string;
    colors?: string[];
  }>;
};

export function attachHistoricalPbaTeamIdentityTimeline<T extends PbaIdentityTeam>(
  teams: T[],
  historical: HistoricalPbaState | null | undefined,
): T[] {
  const rowsByTid = new Map<number, HistoricalPbaTeamIdentitySnapshot[]>();
  for (const snapshot of historical?.teamIdentityTimeline ?? []) {
    const rows = rowsByTid.get(snapshot.tid) ?? [];
    rows.push(snapshot);
    rowsByTid.set(snapshot.tid, rows);
  }
  if (rowsByTid.size === 0) return teams;
  return teams.map(team => {
    if (team.league !== 'PBA') return team;
    const timeline = rowsByTid.get(team.tid);
    if (!timeline?.length) return team;
    return {
      ...team,
      identitySeasons: timeline
        .map(snapshot => ({
          season: snapshot.season,
          region: snapshot.region,
          name: snapshot.name,
          abbrev: snapshot.abbrev,
          imgURL: snapshot.imgURL,
          imgURLSmall: snapshot.imgURL,
          logoUrl: snapshot.imgURL,
          colors: snapshot.colors,
        }))
        .sort((left, right) => left.season - right.season),
    };
  });
}
