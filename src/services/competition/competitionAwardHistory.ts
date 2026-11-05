import type { HistoricalAward, NBAPlayer } from '../../types';
import { competitionAwardTypeFamily } from '../../data/competitionAwardTypes';
import {
  cleanPlayerName,
  competitionSeasonEndYear,
  fetchCompetitionHistory,
  hasCompetitionHistorySource,
  type CompetitionGistId,
  type CompetitionHistoryAward,
  type CompetitionSeason,
} from '../../data/euroleagueHistoryFetcher';
import { normalizeHistoricalEndesaPlayerName } from '../historicalEndesa/identity';
import { getPlayerNationalityCountries } from '../../utils/playerNationality';
import type {
  CompetitionAwardKind,
  CompetitionAwardProgramEntry,
  CompetitionSpec,
} from './types';

export interface CompetitionSourceAward {
  season: number;
  competitionId: string;
  type: string;
  kind: CompetitionAwardKind;
  name: string;
  team?: string;
  nationality?: string;
  role: 'player' | 'coach' | 'executive';
  statLine?: string;
  introducedSeason?: number;
  selectionIndex?: number;
}

export interface CompetitionAwardCatalog {
  awards: CompetitionSourceAward[];
  programs: Record<string, CompetitionAwardProgramEntry[]>;
  failures: string[];
}

export const COMPETITION_AWARD_HISTORY_VERSION = 2;

const TOURNAMENT_IDS = new Set([
  'copa-del-rey',
  'supercopa',
  'france-leaders-cup',
  'coppa-italia',
  'supercoppa-italiana',
  'greek-super-cup',
  'turkish-cup',
  'presidential-cup',
  'king-mindaugas-cup',
  'vtb-supercup',
  'aba-supercup',
]);

const SCALAR_AWARDS: Array<{
  key: keyof CompetitionSeason;
  type: string;
  role?: 'player' | 'coach' | 'executive';
}> = [
  { key: 'Season_MVP', type: 'Season MVP' },
  { key: 'Regular_Season_MVP', type: 'Regular Season MVP' },
  { key: 'Finals_MVP', type: 'Finals MVP' },
  { key: 'Final_Four_MVP', type: 'Final Four MVP' },
  { key: 'Playoffs_MVP', type: 'Playoffs MVP' },
  { key: 'Playin_MVP', type: 'Play-In MVP' },
  { key: 'Top_16_MVP', type: 'Top 16 MVP' },
  { key: 'Alphonso_Ford_Trophy', type: 'Alphonso Ford Top Scorer Trophy' },
  { key: 'Best_Defender', type: 'Best Defender Trophy' },
  { key: 'Best_Sixth_Man', type: 'Sixth Man of the Year' },
  { key: 'Most_Improved_Player', type: 'Most Improved Player' },
  { key: 'Most_Spectacular_Player', type: 'Most Spectacular Player' },
  { key: 'Most_Popular_Player', type: 'Most Popular Player' },
  { key: 'Best_Offensive_Player', type: 'Best Offensive Player' },
  { key: 'Most_Effective_Player', type: 'Most Effective International Player' },
  { key: 'Best_Young_Player', type: 'Best Young Player' },
  { key: 'Rising_Star', type: 'Rising Star' },
  { key: 'Best_Coach', type: 'Best Coach', role: 'coach' },
  { key: 'Coach_of_the_Year', type: 'Coach of the Year', role: 'coach' },
];

const cleanText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeName = (value: unknown): string =>
  normalizeHistoricalEndesaPlayerName(cleanText(value));

const isRealPersonName = (value: string): boolean =>
  !!value && !/^(?:—|-|n\/?a|none|not awarded|not held|cancelled|season cancelled)$/i.test(value);

export function inferCompetitionAwardKind(type: string, competitionId = ''): CompetitionAwardKind {
  const value = cleanText(type).toLowerCase();
  if (/final four mvp/.test(value)) return 'finalFourMvp';
  if (/finals? mvp/.test(value)) return 'finalsMvp';
  if (/play[ -]?in mvp/.test(value)) return 'playInMvp';
  if (/top 16 mvp/.test(value)) return 'top16Mvp';
  if (/playoffs? mvp|postseason mvp/.test(value)) return 'playoffsMvp';
  if (TOURNAMENT_IDS.has(competitionId) && /\bmvp\b/.test(value)) return 'tournamentMvp';
  if (/championship coach|winning coach/.test(value)) return 'championshipCoach';
  if (/executive/.test(value)) return 'executive';
  if (/all[ -].*team|(?:first|second|third) team all[ -]|best five|ideal starting five/.test(value)) return 'allLeague';
  if (/sixth man/.test(value)) return 'sixthMan';
  if (/defen[cs]ive|best defender/.test(value)) return 'defender';
  if (/most improved|newcomer/.test(value)) return 'mostImproved';
  if (/young|under[- ]?2[234]|rising star|rookie|prospect/.test(value)) return 'youngPlayer';
  if (/top scorer|scoring leader|scorer trophy|alphonso ford/.test(value)) return 'topScorer';
  if (/assist leader/.test(value)) return 'assistLeader';
  if (/offensive player/.test(value)) return 'offensivePlayer';
  if (/effective|efficiency|pir leader/.test(value)) return 'efficiencyPlayer';
  if (/spectacular/.test(value)) return 'spectacularPlayer';
  if (/popular/.test(value)) return 'popularPlayer';
  if (/coach/.test(value)) return 'coach';
  if (/\bmvp\b|player of the year/.test(value)) return 'mvp';
  return 'other';
}

function scalarPerson(raw: unknown): { name: string; team?: string } | null {
  const value = cleanText(raw);
  if (!value) return null;
  const team = value.match(/\(([^()]*)\)\s*$/)?.[1]?.trim();
  const name = cleanPlayerName(value);
  return isRealPersonName(name) ? { name, team } : null;
}

function allLeagueType(competitionId: string, groupName: string): string {
  const group = cleanText(groupName);
  if (competitionId === 'eurocup') return `All-EuroCup ${group}`;
  if (competitionId === 'endesa') return `All-Liga ACB ${group}`;
  if (competitionId === 'german-bbl') return `All-BBL ${group}`;
  if (competitionId === 'greek-heba-a1') return group;
  if (competitionId === 'adriatic-league') return group === 'Ideal Starting Five' ? 'ABA League Ideal Starting Five' : group;
  return group;
}

export function getCompetitionSeasonAwards(
  competitionId: string,
  season: CompetitionSeason,
): CompetitionSourceAward[] {
  const seasonYear = competitionSeasonEndYear(season);
  if (!seasonYear) return [];
  const rows: CompetitionSourceAward[] = [];
  const add = (award: CompetitionHistoryAward) => {
    const name = cleanPlayerName(award.name);
    if (!isRealPersonName(name)) return;
    const type = cleanText(award.type);
    if (!type) return;
    rows.push({
      season: seasonYear,
      competitionId,
      type,
      kind: inferCompetitionAwardKind(type, competitionId),
      name,
      team: cleanText(award.team) || undefined,
      nationality: cleanText(award.nationality) || undefined,
      role: /executive/i.test(type) ? 'executive' : award.role ?? (/coach/i.test(type) ? 'coach' : 'player'),
      statLine: cleanText(award.statLine) || undefined,
    });
  };

  season.Awards?.forEach(add);
  for (const scalar of SCALAR_AWARDS) {
    const person = scalarPerson(season[scalar.key]);
    if (!person) continue;
    const role = scalar.role ?? 'player';
    const family = competitionAwardTypeFamily(competitionId, scalar.type);
    const duplicate = rows.some(row =>
      row.role === role
      && normalizeName(row.name) === normalizeName(person.name)
      && competitionAwardTypeFamily(competitionId, row.type) === family,
    );
    if (duplicate) continue;
    add({ type: scalar.type, name: person.name, team: person.team, role });
  }

  (season.All_League_Teams ?? []).forEach((team, selectionIndex) => {
    const type = allLeagueType(competitionId, team.name);
    team.players.forEach(player => add({
      type,
      name: player.name,
      team: player.team,
      nationality: player.nationality,
      role: 'player',
    }));
    rows.forEach(row => {
      if (row.season === seasonYear && row.type === type) {
        row.selectionIndex = selectionIndex;
      }
    });
  });

  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.season}|${row.competitionId}|${row.type.toLowerCase()}|${normalizeName(row.name)}|${normalizeName(row.team)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildProgram(
  competitionId: string,
  seasons: CompetitionSeason[],
  awards: CompetitionSourceAward[],
): CompetitionAwardProgramEntry[] {
  const sourceThrough = Math.max(0, ...seasons.map(season => competitionSeasonEndYear(season) ?? 0));
  const grouped = new Map<string, {
    type: string;
    kind: CompetitionAwardKind;
    role: 'player' | 'coach' | 'executive';
    seasons: number[];
    selectionIndex?: number;
  }>();
  for (const award of awards) {
    const selectionIndex = award.selectionIndex;
    const key = `${award.kind}|${award.type.toLowerCase()}|${award.role}|${selectionIndex ?? ''}`;
    const entry = grouped.get(key) ?? {
      type: award.type,
      kind: award.kind,
      role: award.role,
      seasons: [],
      selectionIndex,
    };
    entry.seasons.push(award.season);
    grouped.set(key, entry);
  }
  return [...grouped.values()]
    .map(entry => {
      const firstSeason = Math.min(...entry.seasons);
      const observedLast = Math.max(...entry.seasons);
      return {
        kind: entry.kind,
        type: entry.type,
        firstSeason,
        ...(observedLast < sourceThrough - 1 ? { lastSeason: observedLast } : {}),
        role: entry.role,
        selectionIndex: entry.selectionIndex,
        source: 'competition-history' as const,
      };
    })
    .sort((left, right) => left.firstSeason - right.firstSeason || left.type.localeCompare(right.type));
}

export async function loadCompetitionAwardCatalog(
  competitionIds: readonly string[],
): Promise<CompetitionAwardCatalog> {
  const ids = [...new Set(competitionIds)].filter(hasCompetitionHistorySource);
  const settled = await Promise.allSettled(ids.map(async competitionId => ({
    competitionId,
    seasons: await fetchCompetitionHistory(competitionId as CompetitionGistId),
  })));
  const awards: CompetitionSourceAward[] = [];
  const programs: Record<string, CompetitionAwardProgramEntry[]> = {};
  const failures: string[] = [];
  settled.forEach((result, index) => {
    const competitionId = ids[index];
    if (result.status === 'rejected') {
      failures.push(competitionId);
      return;
    }
    const rows = result.value.seasons.flatMap(season => getCompetitionSeasonAwards(competitionId, season));
    const program = buildProgram(competitionId, result.value.seasons, rows);
    const firstByType = new Map(program.map(entry => [
      `${entry.kind}|${entry.type.toLowerCase()}|${entry.role}`,
      entry.firstSeason,
    ]));
    rows.forEach(row => {
      row.introducedSeason = firstByType.get(`${row.kind}|${row.type.toLowerCase()}|${row.role}`);
    });
    awards.push(...rows);
    programs[competitionId] = program;
  });
  return { awards, programs, failures };
}

export function getActiveCompetitionAwardProgram(
  spec: CompetitionSpec | undefined,
  season: number,
  kinds?: readonly CompetitionAwardKind[],
): CompetitionAwardProgramEntry[] {
  const allowed = kinds ? new Set(kinds) : null;
  return (spec?.awardProgram ?? []).filter(entry =>
    entry.firstSeason <= season
    && (entry.lastSeason == null || entry.lastSeason >= season)
    && (!allowed || allowed.has(entry.kind)),
  );
}

function matchingPlayer(
  award: CompetitionSourceAward,
  players: readonly NBAPlayer[],
): NBAPlayer | undefined {
  const name = normalizeName(award.name);
  let candidates = players.filter(player => normalizeName(player.name) === name);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return undefined;
  const inCompetition = candidates.filter(player => (player.stats ?? []).some(stat =>
    Number(stat.season) === award.season
    && String(stat.competitionId ?? '') === award.competitionId,
  ));
  if (inCompetition.length === 1) return inCompetition[0];
  if (inCompetition.length > 0) candidates = inCompetition;
  const nationality = normalizeName(award.nationality);
  if (nationality) {
    const byCountry = candidates.filter(player =>
      getPlayerNationalityCountries(player).some(country => normalizeName(country) === nationality),
    );
    if (byCountry.length === 1) return byCountry[0];
  }
  return undefined;
}

const semanticKey = (award: {
  season: number;
  competitionId?: string;
  type: string;
  name?: string;
}): string => [
  Number(award.season),
  cleanText(award.competitionId).toLowerCase(),
  inferCompetitionAwardKind(award.type, award.competitionId),
  normalizeName(award.name),
].join('|');

const exactKey = (award: {
  season: number;
  competitionId?: string;
  type: string;
  name?: string;
}): string => [
  Number(award.season),
  cleanText(award.competitionId).toLowerCase(),
  cleanText(award.type).toLowerCase(),
  normalizeName(award.name),
].join('|');

export function getCompetitionSourceAwardsForPlayer(
  player: NBAPlayer,
  allPlayers: readonly NBAPlayer[],
  awards: readonly CompetitionSourceAward[],
  cutoff: number,
): NBAPlayer['awards'] {
  return awards.flatMap(award => {
    if (award.role !== 'player' || award.season > cutoff) return [];
    const match = matchingPlayer(award, allPlayers);
    if (match?.internalId !== player.internalId) return [];
    return [{
      season: award.season,
      type: award.type,
      competitionId: award.competitionId,
      uiMode: 'euro_isolated',
      source: 'competition-history',
      introducedSeason: award.introducedSeason,
    }];
  });
}

export function applyCompetitionAwardHistory(
  players: NBAPlayer[],
  historicalAwards: HistoricalAward[],
  activeCompetitions: CompetitionSpec[],
  catalog: CompetitionAwardCatalog,
  cutoff: number,
): {
  players: NBAPlayer[];
  historicalAwards: HistoricalAward[];
  activeCompetitions: CompetitionSpec[];
} {
  const hydratedCompetitionIds = new Set(Object.keys(catalog.programs));
  const sourceRows = catalog.awards.filter(award => award.season <= cutoff);
  const retainedHistoricalAwards = (historicalAwards ?? []).filter(award => !(
    award.source === 'competition-history'
    && hydratedCompetitionIds.has(String(award.competitionId ?? ''))
  ));
  const matchedPlayers = new Map<CompetitionSourceAward, NBAPlayer>();
  const incomingByPlayer = new Map<string, NonNullable<NBAPlayer['awards']>>();
  const sourceKeysByPlayer = new Map<string, Set<string>>();
  for (const award of sourceRows) {
    if (award.role !== 'player') continue;
    const player = matchingPlayer(award, players);
    if (!player) continue;
    matchedPlayers.set(award, player);
    incomingByPlayer.set(player.internalId, [
      ...(incomingByPlayer.get(player.internalId) ?? []),
      {
        season: award.season,
        type: award.type,
        competitionId: award.competitionId,
        uiMode: 'euro_isolated',
        source: 'competition-history',
        introducedSeason: award.introducedSeason,
      },
    ]);
    const keys = sourceKeysByPlayer.get(player.internalId) ?? new Set<string>();
    keys.add(semanticKey(award));
    sourceKeysByPlayer.set(player.internalId, keys);
  }
  const sourceHistorical: HistoricalAward[] = sourceRows.map(award => {
    const player = matchedPlayers.get(award);
    const seasonStat = player?.stats?.find(stat =>
      Number(stat.season) === award.season
      && String(stat.competitionId ?? '') === award.competitionId,
    );
    return {
      season: award.season,
      type: award.type,
      name: award.name,
      pid: player?.internalId,
      tid: seasonStat?.tid,
      uiMode: 'euro_isolated',
      competitionId: award.competitionId,
      source: 'competition-history',
      introducedSeason: award.introducedSeason,
      nationality: award.nationality,
      role: award.role,
      statLine: award.statLine,
      team: award.team,
    } satisfies HistoricalAward;
  });

  const sourceByExactKey = new Map(sourceHistorical.map(award => [exactKey(award), award]));
  const sourceBySemanticKey = new Map<string, typeof sourceHistorical>();
  for (const award of sourceHistorical) {
    const key = semanticKey(award);
    sourceBySemanticKey.set(key, [...(sourceBySemanticKey.get(key) ?? []), award]);
  }
  const mergedHistorical = [...sourceHistorical];
  for (const existing of retainedHistoricalAwards) {
    const exactSource = sourceByExactKey.get(exactKey(existing));
    const semanticSources = sourceBySemanticKey.get(semanticKey(existing)) ?? [];
    const source = exactSource ?? semanticSources[0];
    if (!source || existing.source === 'competition-history') {
      mergedHistorical.push(existing);
      continue;
    }
    if (!source.pid && existing.pid) source.pid = existing.pid;
    if (source.tid == null && existing.tid != null) source.tid = existing.tid;
  }

  const playersWithAwards = players.map(player => {
    const incoming = incomingByPlayer.get(player.internalId) ?? [];
    const sourcePlayerKeys = sourceKeysByPlayer.get(player.internalId) ?? new Set<string>();
    const retained = (player.awards ?? []).filter(award => !(
      award.source === 'competition-history'
      && hydratedCompetitionIds.has(String(award.competitionId ?? ''))
    )).filter(award => !sourcePlayerKeys.has(semanticKey({
      ...award,
      name: player.name,
    }))).filter(award => inferCompetitionAwardKind(award.type, award.competitionId) !== 'executive');
    if (incoming.length === 0 && retained.length === (player.awards ?? []).length) return player;
    return {
      ...player,
      awards: [...retained, ...incoming]
        .sort((left, right) =>
          left.season - right.season || left.type.localeCompare(right.type),
        ),
    };
  });

  const seen = new Set<string>();
  const dedupedHistorical = mergedHistorical.filter(award => {
    const key = `${exactKey(award)}|${award.role ?? ''}|${normalizeName(award.team)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const specs = activeCompetitions.map(spec => {
    const awardProgram = catalog.programs[spec.id] ?? spec.awardProgram ?? [];
    return { ...spec, awardProgram };
  });
  return { players: playersWithAwards, historicalAwards: dedupedHistorical, activeCompetitions: specs };
}

export async function hydrateCompetitionAwardHistory(
  players: NBAPlayer[],
  historicalAwards: HistoricalAward[],
  activeCompetitions: CompetitionSpec[],
  cutoff: number,
): Promise<ReturnType<typeof applyCompetitionAwardHistory>> {
  const catalog = await loadCompetitionAwardCatalog(activeCompetitions.map(spec => spec.id));
  return applyCompetitionAwardHistory(players, historicalAwards, activeCompetitions, catalog, cutoff);
}
