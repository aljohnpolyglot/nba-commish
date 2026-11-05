import type { NBAGMStat, NBAPlayer } from '../../types';
import { normalizePlayerName } from '../../data/realPlayerDataFetcher';
import { getTeamFullName } from '../../utils/teamNames';
import { loadFibaHistoricalRoster } from './fibaRosterLoader';
import { getSourcedInternationalTournamentMetadata } from './tournamentWindows';
import type { FibaSourceAward, FibaSourcePlayer } from './types';

function sourceName(value: string): string {
  return normalizePlayerName(value.replace(/\s+\d{4}\s*[–-]\s*\d{4}\s*$/u, ''));
}

function competitionId(season: number, awards: FibaSourceAward[], events: string[]): string {
  const types = awards.filter(award => award.season === season).map(award => award.type.toLowerCase());
  const normalizedEvents = events.map(event => event.trim().toLowerCase());
  if (types.some(type => type.includes('olympic')) || normalizedEvents.includes('olympic games')) {
    const metadata = [season, season - 1]
      .map(year => getSourcedInternationalTournamentMetadata('olympics-men', year))
      .find(row => row?.playedYear === season);
    return `olympics-men-${metadata?.tournamentYear ?? season}`;
  }
  if (types.some(type => type.includes('eurobasket'))) return `fiba-eurobasket-${season}`;
  if (types.some(type => type.includes('world cup')) || normalizedEvents.includes('fiba world cup')) return `fiba-world-cup-${season}`;
  if (normalizedEvents.includes('eurobasket')) return `fiba-eurobasket-${season}`;
  return 'fiba-national-team';
}

function seasonLabel(season: number, id: string, events: string[]): string {
  const kind = id.startsWith('olympics-men')
    ? 'olympics-men'
    : id.startsWith('fiba-world-cup')
      ? 'world-cup'
      : id.startsWith('fiba-eurobasket')
        ? 'eurobasket'
        : null;
  if (!kind) {
    if (events.length === 1) return `${season} ${events[0]}`;
    return events.length > 1 ? `${season} International ×${events.length}` : `${season} International`;
  }
  const tournamentYear = Number(id.match(/(\d{4})$/)?.[1] ?? season);
  const metadata = getSourcedInternationalTournamentMetadata(kind, tournamentYear);
  const host = metadata?.hostCity || metadata?.hosts.join(' / ');
  const tag = kind === 'olympics-men' ? 'OLY' : kind === 'world-cup' ? 'WC' : 'EURO';
  return `${[season, host, tag].filter(Boolean).join(' ')}${events.length > 1 ? ` +${events.length - 1}` : ''}`;
}

function matchPlayer(players: FibaSourcePlayer[], player: Pick<NBAPlayer, 'name' | 'born'>): FibaSourcePlayer | null {
  const name = normalizePlayerName(player.name);
  const candidates = players.filter(candidate => sourceName(candidate.name) === name);
  if (candidates.length === 0) return null;
  const bornYear = Number(player.born?.year);
  if (Number.isInteger(bornYear) && bornYear > 0) {
    return candidates.find(candidate => Number(candidate.born?.year) === bornYear) ?? null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export async function loadFibaHistoricalStatsForPlayer(
  player: Pick<NBAPlayer, 'name' | 'born'>,
  maxSeason: number,
): Promise<NBAGMStat[]> {
  const { roster } = await loadFibaHistoricalRoster();
  const source = matchPlayer(roster.players, player);
  if (!source) return [];
  const sourceTeam = roster.teams.find(candidate => candidate.tid === source.tid);
  return source.stats
    .filter(stat => Number.isFinite(Number(stat.season)) && Number(stat.season) <= maxSeason && Number(stat.gp ?? 0) > 0)
    .map(stat => {
      const season = Number(stat.season);
      const events = Array.isArray(stat._events)
        ? stat._events.map(value => String(value).trim()).filter(Boolean)
        : [String(stat._event ?? '').trim()].filter(Boolean);
      const id = competitionId(season, source.awards, events);
      const team = roster.teams.find(candidate => candidate.tid === Number(stat.tid)) ?? sourceTeam;
      return {
        ...stat,
        season,
        tid: -1,
        abbrev: team?.abbrev,
        teamAbbrev: team?.abbrev,
        teamName: getTeamFullName(team),
        competitionId: id,
        _seasonLabel: seasonLabel(season, id, events),
        _source: 'fiba-history',
        _sourceAge: Number(source.born?.year) > 0 ? season - Number(source.born?.year) : undefined,
      } as unknown as NBAGMStat;
    });
}
