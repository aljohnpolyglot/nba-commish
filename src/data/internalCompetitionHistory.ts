import { readJsonResponse } from '../services/utils/jsonResponse';
import type {
  CompetitionAllLeagueTeam,
  CompetitionHistoryAward,
  CompetitionSeason,
} from './euroleagueHistoryFetcher';

type RecordValue = Record<string, unknown>;

const URLS = {
  nba: '/data/historical/competitions/nba.json',
  euroleague: '/data/historical/competitions/euroleague.json',
  eurocup: '/data/historical/competitions/eurocup.json',
  wnba: '/data/historical/competitions/wnba.json',
  bleague: '/data/historical/competitions/bleague.json',
  'china-cba': '/data/historical/competitions/china-cba.json',
  gleague: '/data/historical/competitions/gleague.json',
  'summer-league': '/data/historical/competitions/summer-league.json',
  'israeli-bsl': '/data/historical/competitions/israeli-bsl.json',
  'nbl-australia': '/data/historical/competitions/nbl-australia.json',
} as const;

const LEAGUE_FILE_URLS = {
  wnba: '/data/historical/league-files/wnba.json',
  pba: '/data/historical/league-files/pba.json',
  euroleague: '/data/historical/league-files/euroleague.json',
  eurocup: '/data/historical/league-files/eurocup.json',
  bleague: '/data/historical/league-files/bleague.json',
  'china-cba': '/data/historical/league-files/china-cba.json',
  'nbl-australia': '/data/historical/league-files/nbl-australia.json',
  gleague: '/data/historical/league-files/gleague.json',
  'summer-league': '/data/historical/league-files/summer-league.json',
  'french-jeep-elite': '/data/historical/league-files/french-jeep-elite.json',
  'italian-serie-a': '/data/historical/league-files/italian-serie-a.json',
  'german-bbl': '/data/historical/league-files/german-bbl.json',
  'greek-heba-a1': '/data/historical/league-files/greek-heba-a1.json',
  'turkish-bsl': '/data/historical/league-files/turkish-bsl.json',
  'lithuanian-lkl': '/data/historical/league-files/lithuanian-lkl.json',
  'israeli-bsl': '/data/historical/league-files/israeli-bsl.json',
  'vtb-united-league': '/data/historical/league-files/vtb-united-league.json',
  'adriatic-league': '/data/historical/league-files/adriatic-league.json',
} as const;

export type InternalCompetitionHistoryKey = keyof typeof URLS;
export type InternalLeagueFileHistoryKey = keyof typeof LEAGUE_FILE_URLS;

export function hasInternalLeagueFileHistory(key: string): key is InternalLeagueFileHistoryKey {
  return Object.prototype.hasOwnProperty.call(LEAGUE_FILE_URLS, key);
}

export function hasInternalCompetitionHistory(key: string): key is InternalCompetitionHistoryKey {
  return Object.prototype.hasOwnProperty.call(URLS, key);
}

const object = (value: unknown): RecordValue | undefined => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined
);

const entityName = (value: unknown): string => String(object(value)?.sourceName ?? '').trim();

const winner = (value: unknown) => {
  const row = object(value);
  const name = entityName(row?.person);
  return name ? { name, team: entityName(row?.team) || undefined } : undefined;
};

const seasonLabel = (value: unknown, season: number) => {
  const label = String(value ?? '').trim();
  if (label) return label;
  const suffix = String(season).slice(-2).padStart(2, '0');
  return `${season - 1}–${suffix}`;
};

const mapAwards = (value: unknown) => {
  const awards: CompetitionHistoryAward[] = [];
  const allLeague = new Map<string, CompetitionAllLeagueTeam['players']>();
  for (const raw of Array.isArray(value) ? value : []) {
    const award = object(raw);
    if (award?.status !== 'awarded') continue;
    const type = String(award.awardName ?? '').trim();
    const key = String(award.awardKey ?? '');
    const winners = Array.isArray(award.winners) ? award.winners.map(winner).filter(Boolean) : [];
    if (!type || winners.length === 0) continue;
    if (/^all-(?:league|wnba|euroleague|defensive|rookie)/.test(key)) {
      allLeague.set(type, [...(allLeague.get(type) ?? []), ...winners]);
      continue;
    }
    for (const entry of winners) awards.push({
      type,
      name: entry!.name,
      team: entry!.team,
      role: award.role === 'coach' || award.role === 'executive' ? award.role : 'player',
      sourceKey: key,
    });
  }
  return {
    awards,
    allLeague: [...allLeague].map(([name, players]) => ({ name, players })),
  };
};

const validDataset = (value: unknown, key: string) => {
  const root = object(value);
  return root?.schemaVersion === 1 && root.competitionKey === key && Array.isArray(root.seasons) ? root : undefined;
};

async function fetchDataset(url: string, key: string): Promise<CompetitionSeason[]> {
  const response = await fetch(url);
  const root = validDataset(await readJsonResponse<unknown>(response, `${key} history`), key);
  if (!root) throw new Error(`${key} history schema could not be used.`);
  const firstSource = object(object((root.sources as unknown[])?.[0])?.source);
  const sourceUrl = String(firstSource?.pageUrl ?? '').trim();
  return (root.seasons as unknown[]).flatMap(raw => {
    const row = object(raw);
    const season = Number(row?.season);
    if (!Number.isFinite(season)) return [];
    const mapped = mapAwards(row?.awards);
    const championCoach = entityName(row?.championCoach);
    const bestRecord = object(row?.bestRecord);
    if (championCoach) mapped.awards.push({ type: 'Championship Coach', name: championCoach, role: 'coach' });
    return [{
      Season: seasonLabel(row?.seasonLabel, season),
      League: String(root.competitionName ?? key),
      Wikipedia_URL: sourceUrl || undefined,
      Champions: entityName(row?.champion) || undefined,
      Runnersup: entityName(row?.runnerUp) || undefined,
      Top_seed: entityName(bestRecord?.team) || undefined,
      Note: row?.status === 'cancelled' ? 'Season cancelled' : undefined,
      Awards: mapped.awards,
      All_League_Teams: mapped.allLeague,
    } satisfies CompetitionSeason];
  }).sort((left, right) => Number(right.Season?.slice(0, 4)) - Number(left.Season?.slice(0, 4)));
}

export function fetchInternalCompetitionHistory(key: InternalCompetitionHistoryKey): Promise<CompetitionSeason[]> {
  return fetchDataset(URLS[key], key);
}

export function fetchInternalLeagueFileHistory(key: InternalLeagueFileHistoryKey): Promise<CompetitionSeason[]> {
  return fetchDataset(LEAGUE_FILE_URLS[key], key);
}

const awardByKey = (awards: unknown, key: string) => {
  const award = (Array.isArray(awards) ? awards : []).map(object).find(row => row?.awardKey === key && row.status === 'awarded');
  const entry = Array.isArray(award?.winners) ? winner(award.winners[0]) : undefined;
  return entry ? { name: entry.name, team: entry.team } : undefined;
};

const awardGroup = (awards: unknown, key: string) => {
  const award = (Array.isArray(awards) ? awards : []).map(object).find(row => row?.awardKey === key && row.status === 'awarded');
  return (Array.isArray(award?.winners) ? award.winners : []).map(winner).filter(Boolean);
};

const additionalAwardWinners = (awards: unknown) => (Array.isArray(awards) ? awards : []).flatMap(raw => {
  const award = object(raw);
  if (award?.status !== 'awarded' || /^all-/.test(String(award.awardKey ?? ''))) return [];
  const role = award.role === 'coach' || award.role === 'executive' ? award.role : 'player';
  return (Array.isArray(award.winners) ? award.winners.slice(1) : []).map(winner).filter(Boolean).map(entry => ({
    ...entry,
    type: String(award.awardName ?? ''),
    role,
  }));
});

export async function fetchInternalWnbaAwardHistory(): Promise<RecordValue[]> {
  const response = await fetch(URLS.wnba);
  const root = validDataset(await readJsonResponse<unknown>(response, 'WNBA history'), 'wnba');
  if (!root) throw new Error('WNBA history schema could not be used.');
  return (root.seasons as unknown[]).flatMap(raw => {
    const row = object(raw);
    const season = Number(row?.season);
    if (!Number.isFinite(season)) return [];
    const champion = entityName(row?.champion);
    const runnerUp = entityName(row?.runnerUp);
    const championCoach = entityName(row?.championCoach);
    const runnerUpCoach = entityName(row?.runnerUpCoach);
    const allLeague = [
      ['First Team', awardGroup(row?.awards, 'all-wnba-first-team')],
      ['Second Team', awardGroup(row?.awards, 'all-wnba-second-team')],
    ].filter(([, players]) => (players as unknown[]).length > 0).map(([title, players]) => ({ title, players }));
    const allDefensive = [
      ['First Team', awardGroup(row?.awards, 'all-defensive-first-team')],
      ['Second Team', awardGroup(row?.awards, 'all-defensive-second-team')],
    ].filter(([, players]) => (players as unknown[]).length > 0).map(([title, players]) => ({ title, players }));
    return [{
      season,
      champion: champion ? { name: champion, coach: championCoach || undefined } : undefined,
      runnerUp: runnerUp ? { name: runnerUp, coach: runnerUpCoach || undefined } : undefined,
      finalsResult: String(row?.result ?? '').trim() || undefined,
      mvp: awardByKey(row?.awards, 'mvp'),
      dpoy: awardByKey(row?.awards, 'defensive-player-of-the-year'),
      roy: awardByKey(row?.awards, 'rookie-of-the-year'),
      mip: awardByKey(row?.awards, 'most-improved-player'),
      smoy: awardByKey(row?.awards, 'sixth-player-of-the-year'),
      coy: awardByKey(row?.awards, 'coach-of-the-year'),
      executiveOfYear: awardByKey(row?.awards, 'executive-of-the-year'),
      finalsMvp: awardByKey(row?.awards, 'finals-mvp'),
      commissionersCupMvp: awardByKey(row?.awards, 'commissioners-cup-mvp'),
      additionalAwards: additionalAwardWinners(row?.awards),
      allLeague,
      allDefensive,
      allRookie: awardGroup(row?.awards, 'all-rookie-team'),
    }];
  });
}
