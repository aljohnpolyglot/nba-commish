import type { GameState, NBAPlayer, PlayerNaturalizationRecord } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import { parsePlayerCountryValue } from '../../utils/playerNationality';
import { normalizeFibaPersonName } from '../fiba/countryIdentity';

interface KnownNaturalization {
  names: string[];
  originalCountry: string;
  country: string;
  date: string;
  source: string;
}

const KNOWN_NATURALIZATIONS: KnownNaturalization[] = [
  {
    names: ['Marcus Douthit', 'Marcus Eugene Douthit'],
    originalCountry: 'United States',
    country: 'Philippines',
    date: '2011-03-12',
    source: 'Republic Act No. 10148',
  },
  {
    names: ['Andray Blatche', 'Andray Maurice Blatche'],
    originalCountry: 'United States',
    country: 'Philippines',
    date: '2014-06-11',
    source: 'Republic Act No. 10636',
  },
];

const profileByName = new Map(KNOWN_NATURALIZATIONS.flatMap(profile =>
  profile.names.map(name => [normalizeFibaPersonName(name), profile] as const),
));

const recordFor = (profile: KnownNaturalization): PlayerNaturalizationRecord => ({
  id: `naturalization:${normalizeFibaPersonName(profile.names[0])}:${profile.date}:${profile.country}`,
  country: profile.country,
  date: profile.date,
  originalCountry: profile.originalCountry,
  source: profile.source,
});

function withCountry(nationality: string | undefined, country: string, originalCountry: string): string {
  const countries = parsePlayerCountryValue(nationality);
  return [...new Set([...(countries.length ? countries : [originalCountry]), country])].join(' / ');
}

export function hydrateCompletedKnownNaturalizations(
  players: readonly NBAPlayer[],
  throughDate: string,
): NBAPlayer[] {
  const cutoff = normalizeDate(throughDate);
  let changed = false;
  const hydrated = players.map(player => {
    const profile = profileByName.get(normalizeFibaPersonName(player.name));
    if (!profile || normalizeDate(profile.date) > cutoff) return player;
    const record = recordFor(profile);
    if (player.naturalizations?.some(existing => existing.id === record.id)) return player;
    changed = true;
    return {
      ...player,
      nationality: withCountry(player.nationality, profile.country, profile.originalCountry),
      naturalizations: [...(player.naturalizations ?? []), record],
    };
  });
  return changed ? hydrated : players as NBAPlayer[];
}

export function applyKnownNaturalizationPass(state: GameState): GameState {
  const beforeIds = new Set(state.players.flatMap(player => player.naturalizations?.map(record => record.id) ?? []));
  const players = hydrateCompletedKnownNaturalizations(state.players, state.date);
  const completed = new Map<string, { player: NBAPlayer; record: PlayerNaturalizationRecord }>();
  for (const player of players) {
    for (const record of player.naturalizations ?? []) {
      if (!beforeIds.has(record.id)) completed.set(record.id, { player, record });
    }
  }
  if (completed.size === 0) return players === state.players ? state : { ...state, players };
  const history = [...state.history];
  for (const { player, record } of completed.values()) {
    history.push({
      text: `${player.name} obtained ${record.country === 'Philippines' ? 'Filipino' : record.country} citizenship and is now eligible to represent ${record.country} in international tournaments.`,
      date: record.date,
      type: 'Citizenship',
      eventType: 'naturalization',
      playerIds: [player.internalId],
      personId: player.personId,
      season: Number(record.date.slice(0, 4)),
    });
  }
  return { ...state, players, history };
}

export function getNaturalizationForCountry(
  player: NBAPlayer,
  country: string,
  year: number,
): PlayerNaturalizationRecord | undefined {
  return player.naturalizations?.find(record =>
    record.country === country && Number(record.date.slice(0, 4)) <= year,
  );
}
