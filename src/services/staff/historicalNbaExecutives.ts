import type { GameState, NBATeam, StaffData, StaffMember } from '../../types';
import { deterministicStaffImageId } from '../../utils/staffPortrait';
import { getTeamFullName } from '../../utils/teamNames';
import { makePlaceholderGM } from './staffFallback';
import { generateGMAttributes } from './gmAttributes';
import { getHistoricalExecutiveArchive } from './historicalExecutiveArchive';
import { getSourcedGMByIdentity, sourceFieldsForStaff } from './gmAttributeSource';

export const HISTORICAL_NBA_EXECUTIVES_VERSION = 2;

const EXECUTIVE_SOURCE = 'basketball-reference-executives';
type RawExecutive = {
  executive_id?: string;
  name?: string;
  profile_url?: string;
  biography?: {
    display_name?: string | null;
    full_name?: string | null;
    birth_date?: string | null;
    birth_date_text?: string | null;
    birthplace?: string | null;
    high_school?: string | null;
    college?: string | null;
    metadata?: Record<string, string>;
  };
  franchises?: Array<{
    franchise?: string | null;
    team_id?: string | null;
    tenure_text?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    is_current?: boolean;
  }>;
  awards?: Array<{ season_or_year?: string; award?: string; text?: string }>;
  career_records?: Array<{
    season?: string | null;
    end_year?: number | null;
    team_id?: string | null;
    team_name?: string | null;
    league?: string | null;
    games?: number | null;
    wins?: number | null;
    losses?: number | null;
    win_percentage?: number | null;
    playoff_games?: number | null;
    playoff_wins?: number | null;
    playoff_losses?: number | null;
    remarks?: string | null;
  }>;
};

const rawExecutives = (): RawExecutive[] =>
  ((getHistoricalExecutiveArchive() as { executives?: RawExecutive[] }).executives ?? []);

const TEAM_ID_ALIASES: Record<string, string[]> = {
  ATL: ['ATL'],
  BOS: ['BOS'],
  BRK: ['BRK', 'BKN', 'NJN', 'NYN', 'NYA'],
  BKN: ['BRK', 'BKN', 'NJN', 'NYN', 'NYA'],
  NJN: ['NJN', 'BRK', 'BKN', 'NYN', 'NYA'],
  CHA: ['CHA', 'CHO', 'CHH'],
  CHO: ['CHO', 'CHA', 'CHH'],
  CHH: ['CHH', 'CHA', 'CHO'],
  CHI: ['CHI'],
  CLE: ['CLE'],
  DAL: ['DAL'],
  DEN: ['DEN'],
  DET: ['DET', 'FTW'],
  GS: ['GSW', 'GS', 'SFW', 'PHW'],
  GSW: ['GSW', 'GS', 'SFW', 'PHW'],
  HOU: ['HOU', 'SDR'],
  IND: ['IND'],
  LAC: ['LAC', 'SDC', 'BUF'],
  LAL: ['LAL', 'MNL'],
  MEM: ['MEM', 'VAN'],
  MIA: ['MIA'],
  MIL: ['MIL'],
  MIN: ['MIN'],
  NOL: ['NOP', 'NOH', 'NOK', 'NOL'],
  NOP: ['NOP', 'NOH', 'NOK', 'NOL'],
  NOH: ['NOH', 'NOK', 'NOP', 'NOL'],
  NY: ['NYK', 'NYC', 'NY'],
  NYC: ['NYK', 'NYC', 'NY'],
  NYK: ['NYK', 'NYC', 'NY'],
  OKC: ['OKC', 'SEA'],
  ORL: ['ORL'],
  PHI: ['PHI', 'SYR'],
  PHO: ['PHO'],
  POR: ['POR'],
  SAC: ['SAC', 'KCK', 'KCO', 'CIN', 'ROC'],
  SA: ['SAS', 'SAA', 'DLC'],
  SAS: ['SAS', 'SAA', 'DLC'],
  TOR: ['TOR'],
  UTA: ['UTA', 'NOJ'],
  WAS: ['WAS', 'WSB', 'BAL', 'CAP', 'CHP'],
};

function norm(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compact(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function displayTeamName(team: NBATeam): string {
  return getTeamFullName(team);
}

function teamIdsFor(team: NBATeam): Set<string> {
  const raw = compact((team as any).abbrev ?? (team as any).abbreviation ?? '');
  const aliases = TEAM_ID_ALIASES[raw] ?? (raw ? [raw] : []);
  return new Set(aliases.map(compact).filter(Boolean));
}

function teamNamesFor(team: NBATeam): Set<string> {
  const values = [
    team.name,
    team.region,
    displayTeamName(team),
    `${team.region ?? ''} ${team.name ?? ''}`,
  ];
  return new Set(values.map(norm).filter(Boolean));
}

function recordMatchesTeam(record: NonNullable<RawExecutive['career_records']>[number], ids: Set<string>, names: Set<string>): boolean {
  const teamId = compact(record.team_id);
  if (teamId && ids.has(teamId)) return true;
  const teamName = norm(record.team_name);
  return !!teamName && names.has(teamName);
}

function yearFromDateText(value: unknown): number | null {
  const text = String(value ?? '');
  if (!text || text === '?' || text.toLowerCase() === 'present') return null;
  const match = text.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function bornYearFromExecutive(exec: RawExecutive): number | undefined {
  const direct = exec.biography?.birth_date?.match(/^(\d{4})/);
  if (direct) return Number(direct[1]);
  const born = exec.biography?.metadata?.Born ?? exec.biography?.birth_date_text ?? '';
  const match = born.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function maxKnownExecutiveSeason(): number {
  let max = 0;
  for (const exec of rawExecutives()) {
    for (const row of exec.career_records ?? []) {
      if (typeof row.end_year === 'number' && row.end_year > max) max = row.end_year;
    }
  }
  return max || 2026;
}

function tenureMatches(exec: RawExecutive, ids: Set<string>, names: Set<string>, seasonEndYear: number): boolean {
  const latestKnown = maxKnownExecutiveSeason();
  if (seasonEndYear > latestKnown + 1) return false;
  for (const tenure of exec.franchises ?? []) {
    const teamId = compact(tenure.team_id);
    const teamName = norm(tenure.franchise);
    if (!ids.has(teamId) && !names.has(teamName)) continue;
    const startYear = yearFromDateText(tenure.start_date) ?? 0;
    const endYear = yearFromDateText(tenure.end_date) ?? (tenure.is_current ? latestKnown + 1 : startYear);
    if (startYear <= seasonEndYear && endYear >= seasonEndYear - 1) return true;
  }
  return false;
}

function findExecutiveForTeamSeason(team: NBATeam, seasonEndYear: number): RawExecutive | null {
  const ids = teamIdsFor(team);
  const names = teamNamesFor(team);
  const exact = rawExecutives()
    .map(exec => {
      const records = (exec.career_records ?? []).filter(row =>
        row.end_year === seasonEndYear &&
        row.team_id &&
        row.team_id !== 'Tm' &&
        recordMatchesTeam(row, ids, names),
      );
      if (records.length === 0) return null;
      const games = Math.max(...records.map(row => Number(row.games ?? 0)));
      return { exec, games };
    })
    .filter(Boolean) as Array<{ exec: RawExecutive; games: number }>;
  exact.sort((a, b) => b.games - a.games || String(a.exec.name).localeCompare(String(b.exec.name)));
  if (exact[0]?.exec) return exact[0].exec;

  return rawExecutives().find(exec => tenureMatches(exec, ids, names, seasonEndYear)) ?? null;
}

function executiveTenures(exec: RawExecutive) {
  return (exec.franchises ?? []).map(tenure => ({
    team: tenure.franchise,
    teamId: tenure.team_id,
    span: tenure.tenure_text,
    startYear: yearFromDateText(tenure.start_date),
    endYear: yearFromDateText(tenure.end_date),
    isCurrent: !!tenure.is_current,
  }));
}

function existingPortrait(existingGms: StaffMember[], execName: string): string | undefined {
  const nameKey = norm(execName);
  return existingGms.find(gm => norm(gm.name) === nameKey)?.playerPortraitUrl;
}

function existingExecutiveMember(existingGms: StaffMember[], exec: RawExecutive): StaffMember | undefined {
  const executiveId = String(exec.executive_id ?? '').trim();
  const nameKey = norm(exec.name?.replace(/\*+$/, ''));
  return existingGms.find(gm => (
    (executiveId && gm.executiveId === executiveId)
    || (nameKey && norm(gm.name) === nameKey)
  ));
}

function sourceAwardEndYear(value: unknown): number | null {
  const text = String(value ?? '').trim();
  const season = text.match(/^(\d{4})-(\d{2})$/);
  if (season) {
    const startYear = Number(season[1]);
    let endYear = Math.floor(startYear / 100) * 100 + Number(season[2]);
    if (endYear <= startYear) endYear += 100;
    return endYear;
  }
  const year = text.match(/^(18|19|20)\d{2}$/);
  return year ? Number(year[0]) : null;
}

function executiveAchievementsThrough(
  exec: RawExecutive,
  cutoffYear: number,
): NonNullable<StaffMember['coachAchievements']> {
  return (exec.awards ?? []).flatMap(award => {
    const season = sourceAwardEndYear(award.season_or_year);
    const type = String(award.award ?? '').trim();
    if (season == null || season > cutoffYear || !type) return [];
    const record = (exec.career_records ?? []).find(row => row.end_year === season && row.team_id !== 'Tm');
    return [{
      season,
      type,
      label: `${season} ${type}`,
      league: 'nba',
      teamName: record?.team_name ?? undefined,
      role: 'General Manager',
    }];
  });
}

function mergeAchievements(
  source: NonNullable<StaffMember['coachAchievements']>,
  existing: StaffMember['coachAchievements'],
): NonNullable<StaffMember['coachAchievements']> {
  const merged = [...source];
  const keys = new Set(merged.map(row => `${row.season}|${row.type}|${row.competitionId ?? ''}`));
  for (const row of existing ?? []) {
    const key = `${row.season}|${row.type}|${row.competitionId ?? ''}`;
    if (!keys.has(key)) {
      keys.add(key);
      merged.push(row);
    }
  }
  return merged.sort((left, right) => left.season - right.season || left.type.localeCompare(right.type));
}

function fallbackExecutive(team: NBATeam, seasonEndYear: number): StaffMember {
  const placeholder = makePlaceholderGM(team);
  return {
    ...placeholder,
    id: `nba-ai-gm-${team.id ?? (team as any).tid}-${seasonEndYear}`,
    jobTitle: 'General Manager',
    position: 'General Manager',
    team: displayTeamName(team),
    teamLogoUrl: team.logoUrl ?? (team as any).imgURL,
    attributes: generateGMAttributes(`nba-fallback:${team.id}:${displayTeamName(team)}:${placeholder.name}`),
    source: 'generated-nba-general-manager',
  } as StaffMember;
}

function buildExecutiveGM(team: NBATeam, exec: RawExecutive, seasonEndYear: number, existingGms: StaffMember[]): StaffMember {
  const name = exec.name?.replace(/\*+$/, '').trim() || 'General Manager';
  const existing = existingExecutiveMember(existingGms, exec);
  const completedSeasonCutoff = seasonEndYear - 1;
  const sourceAchievements = executiveAchievementsThrough(exec, completedSeasonCutoff);
  const coachAchievements = mergeAchievements(sourceAchievements, existing?.coachAchievements);
  const executiveAwards = (exec.awards ?? []).filter(award => {
    const awardYear = sourceAwardEndYear(award.season_or_year);
    return awardYear != null && awardYear <= completedSeasonCutoff;
  });
  const bornYear = bornYearFromExecutive(exec);
  const tenures = executiveTenures(exec);
  const activeTenure = tenures.find(tenure => {
    const ids = teamIdsFor(team);
    const names = teamNamesFor(team);
    return ids.has(compact(tenure.teamId)) || names.has(norm(tenure.team));
  });
  const sourced = getSourcedGMByIdentity('nba', { executiveId: exec.executive_id, name }, seasonEndYear);
  return {
    name,
    team: displayTeamName(team),
    position: 'General Manager',
    jobTitle: 'General Manager',
    teamLogoUrl: team.logoUrl ?? (team as any).imgURL,
    playerPortraitUrl: sourced?.imageUrl ?? existingPortrait(existingGms, name),
    staffImageId: deterministicStaffImageId(name),
    bornYear,
    born: bornYear ? { year: bornYear, loc: exec.biography?.birthplace, text: exec.biography?.metadata?.Born ?? exec.biography?.birth_date_text } : undefined,
    age: bornYear ? Math.max(0, seasonEndYear - bornYear) : undefined,
    careerStartYear: activeTenure?.startYear ?? undefined,
    hiredYear: activeTenure?.startYear ?? undefined,
    yearsWithTeam: activeTenure?.startYear ? Math.max(0, seasonEndYear - activeTenure.startYear) : undefined,
    attributes: sourced?.attributes ?? generateGMAttributes(`nba-executive:${exec.executive_id ?? name}`),
    basketballReferenceUrl: exec.profile_url,
    source: EXECUTIVE_SOURCE,
    executiveId: exec.executive_id,
    executiveBio: exec.biography,
    executiveAwards,
    executiveCareerRecords: exec.career_records ?? [],
    tenures,
    coachAchievements,
    awardsSummary: Array.from(new Set([
      ...(existing?.awardsSummary ?? []),
      ...coachAchievements.map(achievement => achievement.label),
    ])),
    ...(sourced ? sourceFieldsForStaff(sourced) : {}),
    id: `bref-executive-${exec.executive_id ?? name.replace(/[^a-z0-9]+/gi, '-')}-${team.id ?? (team as any).tid}-${seasonEndYear}`,
  } as StaffMember;
}

export interface HistoricalNbaExecutiveAwardIdentity {
  executiveId?: string;
  name: string;
  team: NBATeam;
}

export function resolveHistoricalNbaExecutiveAwardIdentity(
  sourceName: string,
  seasonEndYear: number,
  teams: NBATeam[],
): HistoricalNbaExecutiveAwardIdentity | null {
  const nameKey = norm(sourceName.replace(/\*+$/, ''));
  if (!nameKey) return null;
  const executive = rawExecutives().find(candidate => norm(candidate.name?.replace(/\*+$/, '')) === nameKey);
  if (!executive) return null;
  const records = (executive.career_records ?? [])
    .filter(record => record.end_year === seasonEndYear && record.team_id && record.team_id !== 'Tm')
    .sort((left, right) => Number(right.games ?? 0) - Number(left.games ?? 0));
  const team = teams.find(candidate => {
    const ids = teamIdsFor(candidate);
    const names = teamNamesFor(candidate);
    return records.some(record => recordMatchesTeam(record, ids, names));
  });
  if (!team) return null;
  return {
    executiveId: executive.executive_id,
    name: executive.name?.replace(/\*+$/, '').trim() || sourceName.trim(),
    team,
  };
}

function matchesAnyNbaTeam(gm: StaffMember, teams: NBATeam[]): boolean {
  const label = norm(gm.team ?? gm.position);
  if (!label) return false;
  return teams.some(team => {
    const names = teamNamesFor(team);
    const ids = teamIdsFor(team);
    return names.has(label) || [...names].some(name => label.includes(name)) || ids.has(compact(label));
  });
}

export function refreshHistoricalNbaGeneralManagers(staff: StaffData, teams: NBATeam[], seasonEndYear: number): StaffData {
  const nbaTeams = (teams ?? []).filter(team => team.id >= 0 && team.id < 100);
  if (nbaTeams.length === 0) return staff;
  const existingGms = staff.gms ?? [];
  const nbaGms = nbaTeams.map(team => {
    const executive = findExecutiveForTeamSeason(team, seasonEndYear);
    return executive
      ? buildExecutiveGM(team, executive, seasonEndYear, existingGms)
      : fallbackExecutive(team, seasonEndYear);
  });
  const otherGms = existingGms.filter(gm =>
    gm.source !== EXECUTIVE_SOURCE &&
    gm.source !== 'generated-nba-general-manager' &&
    !matchesAnyNbaTeam(gm, nbaTeams),
  );
  return { ...staff, gms: [...nbaGms, ...otherGms] };
}

export function shouldUseHistoricalNbaExecutives(state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'teams'>): boolean {
  if (state.leagueType === 'fictional') return false;
  if (state.leagueStats?.uiMode && state.leagueStats.uiMode !== 'nba') return false;
  return state.moddedLeagueBase === 'nba' || (state.teams ?? []).some(team => team.id >= 0 && team.id < 100);
}
