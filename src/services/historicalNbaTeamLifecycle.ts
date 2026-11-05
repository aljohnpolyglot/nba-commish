import type { DraftPick, NBATeam, NBAPlayer } from '../types';
import { findHistoricalNbaContractedTeamIds } from '../data/historicalNbaExpansionSchedule';
import { stripLiveContractAfterWaive } from '../utils/contractCleanup';
import { appendPlayerTransaction } from '../utils/playerBirdRights';
import { mergeTeamArchive } from '../utils/teamArchive';
import { getTeamFullName } from '../utils/teamNames';
import { getBbgmTeamLogoUrl } from '../utils/teamAssets';

export type HistoricalNbaContractionPatch = {
  teams: NBATeam[];
  players: NBAPlayer[];
  draftPicks?: DraftPick[];
  teamArchive?: NBATeam[];
  removedTeamIds: number[];
  removedTeamNames: string[];
};

type HistoricalNbaContractionInput = {
  leagueYear: number | undefined;
  teams: NBATeam[];
  players: NBAPlayer[];
  draftPicks?: DraftPick[];
  teamArchive?: NBATeam[];
  archiveThroughSeason?: number;
};

type HistoricalNbaTeamStructureRow = {
  firstStartYear: number;
  lastStartYear: number;
  abbrev: string;
  aliases: string[];
  region: string;
  name: string;
  conference: 'East' | 'West';
  colors: string[];
};

const EARLY_NBA_TEAM_STRUCTURE: readonly HistoricalNbaTeamStructureRow[] = [
  { firstStartYear: 1946, lastStartYear: 1946, abbrev: 'CLR', aliases: ['CLE'], region: 'Cleveland', name: 'Rebels', conference: 'West', colors: ['#7f1d1d', '#f8fafc', '#111827'] },
  { firstStartYear: 1946, lastStartYear: 1946, abbrev: 'DTF', aliases: ['DET'], region: 'Detroit', name: 'Falcons', conference: 'West', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
  { firstStartYear: 1946, lastStartYear: 1949, abbrev: 'CHS', aliases: ['CHI'], region: 'Chicago', name: 'Stags', conference: 'West', colors: ['#991b1b', '#f8fafc', '#111827'] },
  { firstStartYear: 1946, lastStartYear: 1949, abbrev: 'STB', aliases: ['STL'], region: 'St. Louis', name: 'Bombers', conference: 'West', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
  { firstStartYear: 1946, lastStartYear: 1946, abbrev: 'TRH', aliases: ['TOR'], region: 'Toronto', name: 'Huskies', conference: 'East', colors: ['#1e3a8a', '#f8fafc', '#111827'] },
  { firstStartYear: 1946, lastStartYear: 1950, abbrev: 'WSC', aliases: ['WAS'], region: 'Washington', name: 'Capitols', conference: 'East', colors: ['#1d4ed8', '#dc2626', '#f8fafc'] },
  { firstStartYear: 1946, lastStartYear: 1961, abbrev: 'PHW', aliases: ['GSW', 'GS'], region: 'Philadelphia', name: 'Warriors', conference: 'East', colors: ['#1d428a', '#ffc72c', '#ffffff'] },
  { firstStartYear: 1947, lastStartYear: 1953, abbrev: 'BLB', aliases: ['BAL'], region: 'Baltimore', name: 'Bullets', conference: 'East', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
  { firstStartYear: 1948, lastStartYear: 1956, abbrev: 'FTW', aliases: ['DET'], region: 'Fort Wayne', name: 'Pistons', conference: 'West', colors: ['#1d4ed8', '#dc2626', '#f8fafc'] },
  { firstStartYear: 1948, lastStartYear: 1959, abbrev: 'MNL', aliases: ['MPL', 'LAL'], region: 'Minneapolis', name: 'Lakers', conference: 'West', colors: ['#552583', '#fdb927', '#ffffff'] },
  { firstStartYear: 1948, lastStartYear: 1956, abbrev: 'ROC', aliases: ['SAC'], region: 'Rochester', name: 'Royals', conference: 'West', colors: ['#5a2d81', '#f8fafc', '#111827'] },
  { firstStartYear: 1948, lastStartYear: 1948, abbrev: 'INJ', aliases: ['IND'], region: 'Indianapolis', name: 'Jets', conference: 'West', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
  { firstStartYear: 1949, lastStartYear: 1949, abbrev: 'AND', aliases: [], region: 'Anderson', name: 'Packers', conference: 'West', colors: ['#166534', '#f8fafc', '#111827'] },
  { firstStartYear: 1949, lastStartYear: 1949, abbrev: 'DNN', aliases: ['DEN'], region: 'Denver', name: 'Nuggets', conference: 'West', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
  { firstStartYear: 1949, lastStartYear: 1952, abbrev: 'INO', aliases: ['IND'], region: 'Indianapolis', name: 'Olympians', conference: 'West', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
  { firstStartYear: 1949, lastStartYear: 1949, abbrev: 'SHE', aliases: [], region: 'Sheboygan', name: 'Red Skins', conference: 'West', colors: ['#991b1b', '#f8fafc', '#111827'] },
  { firstStartYear: 1949, lastStartYear: 1962, abbrev: 'SYR', aliases: ['PHI'], region: 'Syracuse', name: 'Nationals', conference: 'East', colors: ['#1d4ed8', '#dc2626', '#f8fafc'] },
  { firstStartYear: 1949, lastStartYear: 1950, abbrev: 'TRI', aliases: ['ATL'], region: 'Tri-Cities', name: 'Blackhawks', conference: 'West', colors: ['#dc2626', '#f8fafc', '#111827'] },
  { firstStartYear: 1949, lastStartYear: 1949, abbrev: 'WAT', aliases: [], region: 'Waterloo', name: 'Hawks', conference: 'West', colors: ['#1d4ed8', '#f8fafc', '#111827'] },
];

function normalizeAbbrev(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[.'’`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowMatchesTeam(row: HistoricalNbaTeamStructureRow, team: NBATeam): boolean {
  const abbrev = normalizeAbbrev((team as any).abbrev);
  if ([row.abbrev, ...row.aliases].map(normalizeAbbrev).includes(abbrev)) return true;
  const fullName = normalizeName(getTeamFullName(team));
  return fullName === normalizeName(`${row.region} ${row.name}`);
}

function pickStructureRow(team: NBATeam, startYear: number): HistoricalNbaTeamStructureRow | undefined {
  return EARLY_NBA_TEAM_STRUCTURE.find(row =>
    startYear >= row.firstStartYear &&
    startYear <= row.lastStartYear &&
    rowMatchesTeam(row, team)
  );
}

export function applyHistoricalNbaTeamStructure(
  teams: NBATeam[],
  leagueYear: number | undefined,
): { teams: NBATeam[]; changedTeamIds: number[] } {
  const year = Number(leagueYear);
  if (!Number.isFinite(year) || year - 1 >= 1970) return { teams, changedTeamIds: [] };
  const startYear = year - 1;
  const changedTeamIds: number[] = [];
  const patched = teams.map(team => {
    if (team.id == null || team.id < 0 || team.id >= 100) return team;
    const row = pickStructureRow(team, startYear);
    if (!row) return team;
    const cid = row.conference === 'East' ? 0 : 1;
    const next = {
      ...team,
      abbrev: row.abbrev,
      region: row.region,
      name: row.name,
      conference: row.conference,
      cid,
      did: cid,
      colors: row.colors,
      logoUrl: getBbgmTeamLogoUrl(row.abbrev) || team.logoUrl,
    } as NBATeam;
    const changed = next.abbrev !== team.abbrev ||
      next.region !== team.region ||
      next.name !== team.name ||
      next.conference !== team.conference ||
      next.cid !== team.cid ||
      next.did !== team.did;
    if (changed) changedTeamIds.push(team.id);
    return changed ? next : team;
  });
  return { teams: changedTeamIds.length > 0 ? patched : teams, changedTeamIds };
}

export function applyHistoricalNbaContractions(input: HistoricalNbaContractionInput): HistoricalNbaContractionPatch {
  const year = Number(input.leagueYear);
  const removedTeamIds = findHistoricalNbaContractedTeamIds(year, input.teams);
  if (!Number.isFinite(year) || removedTeamIds.length === 0) {
    return {
      teams: input.teams,
      players: input.players,
      draftPicks: input.draftPicks,
      teamArchive: input.teamArchive,
      removedTeamIds: [],
      removedTeamNames: [],
    };
  }

  const removedIdSet = new Set(removedTeamIds);
  const removedTeams = input.teams.filter(team => removedIdSet.has(team.id));
  const teams = input.teams.filter(team => !removedIdSet.has(team.id));
  const players = input.players.map(player => {
    if (!removedIdSet.has(player.tid)) return player;
    const stripped = stripLiveContractAfterWaive(player, year);
    return {
      ...stripped,
      tid: -1,
      status: 'Free Agent' as const,
      yearsWithTeam: 0,
      twoWay: undefined,
      nonGuaranteed: false,
      gLeagueAssigned: false,
      hasBirdRights: false,
      signedDate: undefined,
      tradeEligibleDate: undefined,
      transactions: appendPlayerTransaction(player, { season: year, tid: -1, type: 'freeAgent' }),
    } as NBAPlayer;
  });
  const draftPicks = input.draftPicks?.filter(pick =>
    !removedIdSet.has(pick.tid) &&
    !removedIdSet.has(pick.originalTid)
  );
  const throughSeason = Number(input.archiveThroughSeason);
  const teamArchive = mergeTeamArchive(
    input.teamArchive,
    removedTeams,
    Number.isFinite(throughSeason) ? throughSeason : year - 1,
  );

  return {
    teams,
    players,
    draftPicks,
    teamArchive,
    removedTeamIds,
    removedTeamNames: removedTeams.map(getTeamFullName),
  };
}
