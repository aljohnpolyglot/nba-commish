import { readJsonResponse } from '../services/utils/jsonResponse';
import type { BRefAllTeam, BRefAwardEntry, BRefNamedAward, BRefSeasonData, BRefTeamRecord } from './brefFetcher';

type JsonObject = Record<string, unknown>;

interface ManifestDataset {
  leagueKey: string;
  seasonKey: string;
  path: string;
}

const BUNDLED_SNAPSHOTS: Record<number, string> = {
  2026: '/data/real-world/nba/2025-26.json',
};
const BUNDLED_COMPETITION_HISTORY_PATH = '/data/historical/competitions/nba.json';

const workerBaseUrl = String(import.meta.env?.VITE_BASKETBALL_DATA_WORKER_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

let manifestPromise: Promise<ManifestDataset[]> | null = null;
let competitionHistoryPromise: Promise<Map<number, BRefSeasonData>> | null = null;

const isObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const asObject = (value: unknown): JsonObject | undefined => isObject(value) ? value : undefined;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const asNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const entityName = (value: unknown): string => asString(asObject(value)?.sourceName);

const personTeamResult = (value: unknown): BRefAwardEntry | undefined => {
  const result = asObject(value);
  const name = entityName(result?.person);
  if (!name) return undefined;
  return { name, team: entityName(result?.team) };
};

const teamResult = (value: unknown): BRefAwardEntry | undefined => {
  const name = entityName(value);
  return name ? { name, team: name } : undefined;
};

const normalizeAwardName = (value: unknown): string => asString(value)
  .toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const awardRecipient = (awards: unknown[], awardName: string): BRefAwardEntry | undefined => {
  const target = normalizeAwardName(awardName);
  const award = awards
    .map(asObject)
    .find(candidate => normalizeAwardName(candidate?.awardName) === target);
  const recipient = asObject(asArray(award?.recipients)[0]);
  return personTeamResult(recipient);
};

const mapNamedAwards = (awards: unknown[]): BRefNamedAward[] => awards.flatMap(value => {
  const award = asObject(value);
  if (award?.resultStatus !== 'awarded') return [];
  const awardName = asString(award?.awardName);
  const recipients = asArray(award?.recipients)
    .map(personTeamResult)
    .filter((recipient): recipient is BRefAwardEntry => Boolean(recipient));
  return awardName && recipients.length > 0 ? [{ awardName, recipients }] : [];
});

const mapHonorTeams = (honorTeams: unknown[], category: string): BRefAllTeam[] => honorTeams
  .map(asObject)
  .filter(team => asString(team?.category) === category)
  .map(team => ({
    teamName: asString(team?.level)
      ? `${asString(team?.level)[0].toUpperCase()}${asString(team?.level).slice(1)} Team`
      : asString(team?.name),
    players: asArray(team?.selections)
      .map(asObject)
      .map(selection => ({
        name: entityName(asObject(selection)?.person),
        team: entityName(asObject(selection)?.team),
      }))
      .filter(player => player.name.length > 0),
  }))
  .filter(team => team.players.length > 0);

const mapBestRecords = (standings: unknown[]): BRefTeamRecord[] => standings.flatMap(value => {
  const conference = asObject(value);
  const rows = asArray(conference?.rows).map(asObject);
  const leader = rows.find(row => row?.isConferenceBestRecord === true)
    ?? rows.find(row => asNumber(row?.rank) === 1);
  const name = entityName(leader?.team);
  const wins = asNumber(leader?.wins);
  const losses = asNumber(leader?.losses);
  if (!name || wins == null || losses == null) return [];
  return [{
    conference: asString(conference?.conferenceName) || asString(conference?.conferenceKey),
    name,
    wins,
    losses,
  }];
});

const mapTeamRecords = (standings: unknown[]): BRefTeamRecord[] => standings.flatMap(value => {
  const conference = asObject(value);
  const conferenceName = asString(conference?.conferenceName) || asString(conference?.conferenceKey);
  return asArray(conference?.rows).flatMap(rowValue => {
    const row = asObject(rowValue);
    const name = entityName(row?.team);
    const wins = asNumber(row?.wins);
    const losses = asNumber(row?.losses);
    return name && wins != null && losses != null
      ? [{ conference: conferenceName, name, wins, losses }]
      : [];
  });
});

export function parseWorkerNbaSeasonSnapshot(value: unknown, expectedYear: number): BRefSeasonData | null {
  const snapshot = asObject(value);
  if (
    snapshot?.schemaVersion !== 1
    || snapshot?.leagueKey !== 'nba'
    || asNumber(snapshot?.sourceSeason) !== expectedYear
  ) return null;

  const summaryBlock = asObject(snapshot.summary);
  const standingsBlock = asObject(snapshot.standings);
  const awardsBlock = asObject(snapshot.awards);
  const summary = asObject(summaryBlock?.data);
  const awardsData = asObject(awardsBlock?.data);
  const finals = asObject(summary?.finals);
  const regularSeason = asObject(summary?.regularSeason);
  const awardRows = asArray(awardsData?.awards);
  const honorTeams = asArray(awardsData?.honorTeams);
  const champion = teamResult(finals?.champion);

  if (summaryBlock?.status !== 'complete' || !champion) return null;

  return {
    year: expectedYear,
    champion,
    runnerUp: teamResult(finals?.runnerUp),
    finalsMvp: personTeamResult(finals?.finalsMvp),
    semifinalsMvps: [],
    mvp: personTeamResult(regularSeason?.mvp)
      ?? awardRecipient(awardRows, 'Most Valuable Player'),
    dpoy: awardRecipient(awardRows, 'Defensive Player of the Year'),
    smoy: awardRecipient(awardRows, 'Sixth Man of the Year'),
    clutch: awardRecipient(awardRows, 'Clutch Player of the Year'),
    mip: awardRecipient(awardRows, 'Most Improved Player'),
    roy: awardRecipient(awardRows, 'Rookie of the Year'),
    coy: awardRecipient(awardRows, 'Coach of the Year'),
    bestRecords: standingsBlock?.status === 'complete'
      ? mapBestRecords(asArray(standingsBlock.data))
      : [],
    teamRecords: standingsBlock?.status === 'complete'
      ? mapTeamRecords(asArray(standingsBlock.data))
      : [],
    allNBA: mapHonorTeams(honorTeams, 'all-league'),
    allDefensive: mapHonorTeams(honorTeams, 'all-defensive'),
    allRookie: mapHonorTeams(honorTeams, 'all-rookie'),
    otherAwards: mapNamedAwards(awardRows),
    allStars: [],
  };
}

const competitionAwards = (value: unknown): JsonObject[] => asArray(value)
  .map(asObject)
  .filter((award): award is JsonObject => Boolean(award) && award?.status === 'awarded');

const competitionAward = (awards: JsonObject[], key: string): BRefAwardEntry | undefined => {
  const award = awards.find(candidate => asString(candidate.awardKey) === key);
  return personTeamResult(asArray(award?.winners)[0]);
};

const competitionHonorTeam = (
  awards: JsonObject[],
  key: string,
  teamName: string,
): BRefAllTeam[] => {
  const award = awards.find(candidate => asString(candidate.awardKey) === key);
  const players = asArray(award?.winners)
    .map(personTeamResult)
    .filter((entry): entry is BRefAwardEntry => Boolean(entry));
  return players.length > 0 ? [{ teamName, players }] : [];
};

function parseCompetitionHistory(value: unknown): Map<number, BRefSeasonData> {
  const root = asObject(value);
  if (root?.schemaVersion !== 1 || root.competitionKey !== 'nba') throw new Error('NBA competition history schema could not be used.');
  const result = new Map<number, BRefSeasonData>();
  for (const value of asArray(root.seasons)) {
    const row = asObject(value);
    const year = asNumber(row?.season);
    if (year == null) continue;
    const awards = competitionAwards(row?.awards);
    const standardKeys = new Set([
      'mvp', 'finals-mvp', 'defensive-player-of-the-year', 'sixth-man-of-the-year',
      'clutch-player-of-the-year', 'most-improved-player', 'rookie-of-the-year', 'coach-of-the-year',
      'all-nba-first-team', 'all-nba-second-team', 'all-nba-third-team',
      'all-defensive-first-team', 'all-defensive-second-team',
      'all-rookie-first-team', 'all-rookie-second-team',
      'eastern-conference-finals-mvp', 'western-conference-finals-mvp',
    ]);
    const otherAwards = awards.flatMap(award => {
      const key = asString(award.awardKey);
      if (standardKeys.has(key)) return [];
      const recipients = asArray(award.winners)
        .map(personTeamResult)
        .filter((entry): entry is BRefAwardEntry => Boolean(entry));
      return recipients.length > 0 ? [{ awardName: asString(award.awardName), recipients }] : [];
    });
    result.set(year, {
      year,
      champion: teamResult(row?.champion),
      runnerUp: teamResult(row?.runnerUp),
      finalsMvp: competitionAward(awards, 'finals-mvp'),
      semifinalsMvps: [
        competitionAward(awards, 'eastern-conference-finals-mvp'),
        competitionAward(awards, 'western-conference-finals-mvp'),
      ].filter((entry): entry is BRefAwardEntry => Boolean(entry)),
      mvp: competitionAward(awards, 'mvp'),
      dpoy: competitionAward(awards, 'defensive-player-of-the-year'),
      smoy: competitionAward(awards, 'sixth-man-of-the-year'),
      clutch: competitionAward(awards, 'clutch-player-of-the-year'),
      mip: competitionAward(awards, 'most-improved-player'),
      roy: competitionAward(awards, 'rookie-of-the-year'),
      coy: competitionAward(awards, 'coach-of-the-year'),
      bestRecords: [],
      allNBA: [
        ...competitionHonorTeam(awards, 'all-nba-first-team', 'First Team'),
        ...competitionHonorTeam(awards, 'all-nba-second-team', 'Second Team'),
        ...competitionHonorTeam(awards, 'all-nba-third-team', 'Third Team'),
      ],
      allDefensive: [
        ...competitionHonorTeam(awards, 'all-defensive-first-team', 'First Team'),
        ...competitionHonorTeam(awards, 'all-defensive-second-team', 'Second Team'),
      ],
      allRookie: [
        ...competitionHonorTeam(awards, 'all-rookie-first-team', 'First Team'),
        ...competitionHonorTeam(awards, 'all-rookie-second-team', 'Second Team'),
      ],
      otherAwards,
      allStars: [],
    });
  }
  return result;
}

async function getCompetitionHistory(): Promise<Map<number, BRefSeasonData>> {
  if (!competitionHistoryPromise) {
    competitionHistoryPromise = fetchJson(BUNDLED_COMPETITION_HISTORY_PATH, 'bundled NBA competition history')
      .then(parseCompetitionHistory)
      .catch(error => {
        competitionHistoryPromise = null;
        console.warn('[REAL_WORLD_HISTORY] Bundled NBA competition history unavailable.', error);
        return new Map();
      });
  }
  return competitionHistoryPromise;
}

export function mergeWorkerNbaSeasonHistory(history: BRefSeasonData | undefined, snapshot: BRefSeasonData | null) {
  if (!history) return snapshot;
  if (!snapshot) return history;
  const namedAwards = [...history.otherAwards, ...snapshot.otherAwards];
  const seen = new Set<string>();
  return {
    ...history,
    ...snapshot,
    champion: snapshot.champion ?? history.champion,
    runnerUp: snapshot.runnerUp ?? history.runnerUp,
    finalsMvp: snapshot.finalsMvp ?? history.finalsMvp,
    semifinalsMvps: history.semifinalsMvps.length ? history.semifinalsMvps : snapshot.semifinalsMvps,
    mvp: snapshot.mvp ?? history.mvp,
    dpoy: snapshot.dpoy ?? history.dpoy,
    smoy: snapshot.smoy ?? history.smoy,
    clutch: snapshot.clutch ?? history.clutch,
    mip: snapshot.mip ?? history.mip,
    roy: snapshot.roy ?? history.roy,
    coy: snapshot.coy ?? history.coy,
    allNBA: history.allNBA.length ? history.allNBA : snapshot.allNBA,
    allDefensive: history.allDefensive.length ? history.allDefensive : snapshot.allDefensive,
    allRookie: history.allRookie.length ? history.allRookie : snapshot.allRookie,
    teamRecords: snapshot.teamRecords?.length ? snapshot.teamRecords : history.teamRecords,
    otherAwards: namedAwards.filter(award => {
      const key = `${award.awardName}|${award.recipients.map(entry => entry.name).join('|')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url);
  return readJsonResponse<unknown>(response, label);
}

async function getManifest(): Promise<ManifestDataset[]> {
  if (!workerBaseUrl) return [];
  if (!manifestPromise) {
    manifestPromise = fetchJson(`${workerBaseUrl}/v1/manifest`, 'basketball data manifest')
      .then(value => {
        const datasets = asArray(asObject(value)?.datasets);
        return datasets.flatMap(datasetValue => {
          const dataset = asObject(datasetValue);
          const leagueKey = asString(dataset?.leagueKey);
          const seasonKey = asString(dataset?.seasonKey);
          const path = asString(dataset?.path);
          return leagueKey && seasonKey && path ? [{ leagueKey, seasonKey, path }] : [];
        });
      })
      .catch(error => {
        console.warn('[REAL_WORLD_HISTORY] Worker manifest unavailable; using bundled history.', error);
        return [];
      });
  }
  return manifestPromise;
}

function endYearToSeasonKey(year: number): string {
  return `${year - 1}-${String(year).slice(-2)}`;
}

function seasonKeyToEndYear(seasonKey: string): number | null {
  const match = seasonKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const suffix = Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(suffix)) return null;
  let endYear = Math.floor(startYear / 100) * 100 + suffix;
  if (endYear <= startYear) endYear += 100;
  return endYear;
}

export async function fetchWorkerNbaSeasonHistory(year: number): Promise<BRefSeasonData | null> {
  const history = (await getCompetitionHistory()).get(year);
  const seasonKey = endYearToSeasonKey(year);
  const manifest = await getManifest();
  const entry = manifest.find(dataset => (
    dataset.leagueKey === 'nba' && dataset.seasonKey === seasonKey
  ));

  if (entry) {
    try {
      const remote = await fetchJson(`${workerBaseUrl}${entry.path}`, `${seasonKey} NBA history`);
      const parsed = parseWorkerNbaSeasonSnapshot(remote, year);
      if (parsed) return mergeWorkerNbaSeasonHistory(history, parsed);
      console.warn(`[REAL_WORLD_HISTORY] Worker snapshot ${seasonKey} failed client validation.`);
    } catch (error) {
      console.warn(`[REAL_WORLD_HISTORY] Worker snapshot ${seasonKey} unavailable; using bundled history.`, error);
    }
  }

  const bundledPath = BUNDLED_SNAPSHOTS[year];
  if (!bundledPath) return history ?? null;
  try {
    const bundled = await fetchJson(bundledPath, `bundled ${seasonKey} NBA history`);
    return mergeWorkerNbaSeasonHistory(history, parseWorkerNbaSeasonSnapshot(bundled, year));
  } catch (error) {
    console.warn(`[REAL_WORLD_HISTORY] Bundled snapshot ${seasonKey} unavailable.`, error);
    return history ?? null;
  }
}

export async function fetchWorkerNbaSeasonHistoriesThrough(maxYear: number): Promise<BRefSeasonData[]> {
  const [manifest, competitionHistory] = await Promise.all([getManifest(), getCompetitionHistory()]);
  const years = new Set<number>(
    Object.keys(BUNDLED_SNAPSHOTS)
      .map(Number)
      .filter(year => Number.isFinite(year) && year <= maxYear),
  );
  for (const dataset of manifest) {
    if (dataset.leagueKey !== 'nba') continue;
    const year = seasonKeyToEndYear(dataset.seasonKey);
    if (year != null && year <= maxYear) years.add(year);
  }
  for (const year of competitionHistory.keys()) {
    if (year <= maxYear) years.add(year);
  }
  const seasons = await Promise.all(
    [...years].sort((left, right) => left - right).map(fetchWorkerNbaSeasonHistory),
  );
  return seasons.filter((season): season is BRefSeasonData => season !== null);
}
