import type {
  GameState,
  HistoricalNationalityPeriod,
  HistoricalNationalityTransitionRecord,
  NBAPlayer,
} from '../../types';
import { parsePlayerCountryValue } from '../../utils/playerNationality';

export interface HistoricalNationalityProfile {
  displayCountry: string;
  successorCountry: string;
  timeline: HistoricalNationalityPeriod[];
}

interface ProfileOptions {
  allowAmbiguousHistoricalSplit?: boolean;
  successorCountry?: string;
}

const SOVIET_SUCCESSORS = new Set([
  'Armenia', 'Azerbaijan', 'Belarus', 'Estonia', 'Georgia', 'Kazakhstan', 'Kyrgyzstan',
  'Latvia', 'Lithuania', 'Moldova', 'Russia', 'Tajikistan', 'Turkmenistan', 'Ukraine', 'Uzbekistan',
]);
const YUGOSLAV_SUCCESSORS = new Set([
  'Bosnia and Herzegovina', 'Croatia', 'Kosovo', 'Montenegro', 'North Macedonia', 'Serbia', 'Slovenia',
]);
const CZECHOSLOVAK_SUCCESSORS = new Set(['Czech Republic', 'Slovakia']);

function canonicalCountry(value: string): string {
  const parsed = parsePlayerCountryValue(value)[0] ?? String(value ?? '').trim();
  if (parsed === 'American') return 'United States';
  if (parsed === 'Czechia') return 'Czech Republic';
  if (parsed === 'Macedonia') return 'North Macedonia';
  return parsed || 'Unknown';
}

function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function activeCountry(timeline: HistoricalNationalityPeriod[], year: number, successor: string): string {
  const period = timeline.find(row => (
    (row.fromYear == null || year >= row.fromYear)
    && (row.toYear == null || year <= row.toYear)
  ));
  return period?.country ?? successor;
}

export function resolveHistoricalNationalityProfile(
  country: string,
  year: number,
  identitySeed = country,
  options: ProfileOptions = {},
): HistoricalNationalityProfile {
  const canonical = canonicalCountry(country);
  const successor = canonicalCountry(options.successorCountry ?? canonical);
  let timeline: HistoricalNationalityPeriod[] = [];

  if (SOVIET_SUCCESSORS.has(successor)) {
    timeline = [{ country: 'Soviet Union', fromYear: 1922, toYear: 1991, successorCountry: successor, source: 'historical-era' }];
  } else if (YUGOSLAV_SUCCESSORS.has(successor)) {
    timeline = [
      { country: 'Yugoslavia', fromYear: 1918, toYear: 1940, successorCountry: successor, source: 'historical-era' },
      { country: 'Yugoslavia', fromYear: 1945, toYear: 1991, successorCountry: successor, source: 'historical-era' },
    ];
  } else if (CZECHOSLOVAK_SUCCESSORS.has(successor)) {
    timeline = [
      { country: 'Czechoslovakia', fromYear: 1918, toYear: 1938, successorCountry: successor, source: 'historical-era' },
      { country: 'Czechoslovakia', fromYear: 1945, toYear: 1992, successorCountry: successor, source: 'historical-era' },
    ];
  } else if (canonical === 'East Germany' || canonical === 'West Germany') {
    timeline = [{ country: canonical, fromYear: 1949, toYear: 1990, successorCountry: 'Germany', source: 'source' }];
    return { displayCountry: activeCountry(timeline, year, 'Germany'), successorCountry: 'Germany', timeline };
  } else if (canonical === 'Germany' && options.allowAmbiguousHistoricalSplit && year >= 1949 && year <= 1990) {
    const historicalCountry = seededUnit(identitySeed) < 0.2 ? 'East Germany' : 'West Germany';
    timeline = [{ country: historicalCountry, fromYear: 1949, toYear: 1990, successorCountry: 'Germany', source: 'historical-era' }];
  } else if (canonical === 'Soviet Union' || canonical === 'Yugoslavia' || canonical === 'Czechoslovakia') {
    return { displayCountry: canonical, successorCountry: options.successorCountry ? successor : canonical, timeline: [] };
  }

  return {
    displayCountry: activeCountry(timeline, year, successor),
    successorCountry: successor,
    timeline,
  };
}

export function applyHistoricalNationalityProfiles(
  players: NBAPlayer[],
  year: number,
  options: { generated?: boolean } = {},
): NBAPlayer[] {
  return players.map(player => {
    if (player.nationalityTimeline?.length) return player;
    const explicitCountries = parsePlayerCountryValue(player.nationality);
    const sourceCountry = explicitCountries[0] ?? parsePlayerCountryValue(player.born?.loc, true)[0];
    if (!sourceCountry) return player;
    const secondaryCountries = explicitCountries.slice(1);
    const bornCountry = parsePlayerCountryValue(player.born?.loc, true)[0];
    const canonicalSource = canonicalCountry(sourceCountry);
    const compatibleSuccessor = canonicalSource === 'Soviet Union' && SOVIET_SUCCESSORS.has(canonicalCountry(bornCountry))
      ? canonicalCountry(bornCountry)
      : canonicalSource === 'Yugoslavia' && YUGOSLAV_SUCCESSORS.has(canonicalCountry(bornCountry))
        ? canonicalCountry(bornCountry)
        : canonicalSource === 'Czechoslovakia' && CZECHOSLOVAK_SUCCESSORS.has(canonicalCountry(bornCountry))
          ? canonicalCountry(bornCountry)
          : undefined;
    const profile = resolveHistoricalNationalityProfile(
      sourceCountry,
      year,
      player.personId ?? player.internalId,
      {
        allowAmbiguousHistoricalSplit: options.generated && !player.srID && !player.slug,
        successorCountry: compatibleSuccessor,
      },
    );
    const displayCountry = [...new Set([profile.displayCountry, ...secondaryCountries])].join(' / ');
    const successorCountry = [...new Set([profile.successorCountry, ...secondaryCountries])].join(' / ');
    if (!profile.timeline.length && displayCountry === player.nationality) return player;
    return {
      ...player,
      nationality: displayCountry,
      nationalityTimeline: profile.timeline,
      nationalitySuccessorCountry: successorCountry,
    };
  });
}

function targetCountry(player: NBAPlayer, year: number): string | null {
  const timeline = player.nationalityTimeline ?? [];
  if (!timeline.length) return null;
  const successor = player.nationalitySuccessorCountry
    ?? timeline.find(period => period.successorCountry)?.successorCountry
    ?? player.nationality
    ?? 'Unknown';
  const target = activeCountry(timeline, year, successor);
  const currentPrimary = parsePlayerCountryValue(player.nationality)[0] ?? player.nationality;
  const targetPrimary = parsePlayerCountryValue(target)[0] ?? target;
  if (currentPrimary === targetPrimary) return null;
  const priorCountry = timeline
    .filter(period => period.toYear != null && period.toYear < year)
    .sort((left, right) => Number(right.toYear) - Number(left.toYear))[0]?.country;
  return !priorCountry || currentPrimary === priorCountry ? target : null;
}

function transitionYear(player: NBAPlayer, year: number, target: string): number {
  const currentPrimary = parsePlayerCountryValue(player.nationality)[0] ?? player.nationality;
  const targetPrimary = parsePlayerCountryValue(target)[0] ?? target;
  const starting = (player.nationalityTimeline ?? [])
    .filter(period => period.country === targetPrimary && period.fromYear != null && period.fromYear <= year)
    .sort((left, right) => Number(right.fromYear) - Number(left.fromYear))[0]?.fromYear;
  if (starting != null) return starting;
  const ending = (player.nationalityTimeline ?? [])
    .filter(period => period.country === currentPrimary && period.toYear != null && period.toYear < year)
    .sort((left, right) => Number(right.toYear) - Number(left.toYear))[0]?.toYear;
  return ending != null ? ending + 1 : year;
}

export function applyHistoricalNationalityTransitionPass(state: GameState, year: number): GameState {
  const existing = state.historicalNationalityTransitions ?? [];
  const existingIds = new Set(existing.map(record => record.id));
  const additions: HistoricalNationalityTransitionRecord[] = [];
  const changedById = new Map<string, NBAPlayer>();
  let changed = false;

  const transitionPlayer = (player: NBAPlayer): NBAPlayer => {
    const target = targetCountry(player, year);
    if (!target || target === player.nationality) return player;
    const effectiveYear = transitionYear(player, year, target);
    const id = `nationality:${player.personId ?? player.internalId}:${effectiveYear}:${player.nationality}:${target}`;
    if (existingIds.has(id)) {
      changed = true;
      return { ...player, nationality: target };
    }
    const updated = { ...player, nationality: target };
    changed = true;
    additions.push({
      id,
      playerId: player.internalId,
      personId: player.personId,
      fromCountry: player.nationality ?? 'Unknown',
      toCountry: target,
      year: effectiveYear,
    });
    changedById.set(player.personId ?? player.internalId, updated);
    existingIds.add(id);
    return updated;
  };

  const players = state.players.map(transitionPlayer);
  const historicalPeople = state.historicalPeople?.map(player => {
    const match = changedById.get(player.personId ?? player.internalId);
    if (match) {
      changed = true;
      return { ...player, nationality: match.nationality };
    }
    return transitionPlayer(player);
  });

  if (!changed) return state;
  if (!additions.length) return { ...state, players, historicalPeople };
  const groups = new Map<string, HistoricalNationalityTransitionRecord[]>();
  for (const record of additions) {
    const key = `${record.year}:${record.fromCountry}:${record.toCountry}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const date = `${year}-01-01`;
  const inbox = [...state.inbox];
  const history = [...state.history];
  const eventPeople = [...players, ...(historicalPeople ?? [])];
  for (const records of groups.values()) {
    const first = records[0];
    const names = records
      .map(record => eventPeople.find(player => player.internalId === record.playerId)?.name)
      .filter(Boolean) as string[];
    const subject = `Nationality update: ${first.fromCountry} to ${first.toCountry}`;
    const body = `${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''} now ${names.length === 1 ? 'lists' : 'list'} ${first.toCountry} following the geopolitical transition.`;
    inbox.push({
      id: `nationality-transition-${first.year}-${first.fromCountry}-${first.toCountry}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      sender: 'League Office',
      senderRole: 'Player Records',
      organization: 'League Office',
      subject,
      body,
      read: false,
      replied: false,
      date,
    });
    history.push({
      text: `${first.fromCountry} nationality records transitioned to ${first.toCountry} for ${records.length} player${records.length === 1 ? '' : 's'}.`,
      date,
      type: 'League',
      eventType: 'nationality-transition',
      playerIds: records.map(record => record.playerId),
      season: first.year,
    });
  }

  return {
    ...state,
    players,
    historicalPeople,
    inbox,
    history,
    historicalNationalityTransitions: [...existing, ...additions],
  };
}
