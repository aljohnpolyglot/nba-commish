import type { HistoricalAward, NBAPlayer } from '../../types';
import { isAwardVisibleInTimeline } from '../../utils/awardHistory';
import { normalizePlayerAwardType } from '../../utils/playerAwardNormalizer';

export type TeamHistoryAwardLeagueBucket = 'nba' | 'wnba' | null;

export interface TeamHistoryAwardLeader {
  personId: string;
  playerId?: string;
  name: string;
  count: number;
  firstSeason: number;
  lastSeason: number;
  player?: NBAPlayer;
}

export interface TeamHistoryAwardCategory {
  key: string;
  label: string;
  leaders: TeamHistoryAwardLeader[];
}

export interface TeamHistoryAwardRankings {
  categories: TeamHistoryAwardCategory[];
  eventCount: number;
}

interface TeamScope {
  teamId: number;
  acceptedTeamAbbrevs: ReadonlySet<string>;
  seasons?: ReadonlySet<number>;
}

interface BuildOptions {
  players: readonly NBAPlayer[];
  historicalAwards?: readonly HistoricalAward[];
  maxSeason: number;
  leagueBucket?: TeamHistoryAwardLeagueBucket;
  competitionIds?: ReadonlySet<string>;
  teamScope?: TeamScope;
}

interface AwardEvent {
  personId: string;
  playerId?: string;
  name: string;
  season: number;
  type: string;
  competitionId?: string;
  player?: NBAPlayer;
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();
const abbrev = (value: unknown) => String(value ?? '').trim().toUpperCase();
const slug = (value: string) => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function stablePersonId(player: NBAPlayer): string {
  return String(player.personId ?? `player:${player.internalId}`);
}

function playerIdentityValues(player: NBAPlayer): Set<string> {
  const values = new Set([String(player.internalId), String(player.personId ?? '')].filter(Boolean));
  for (const value of Object.values(player.sourceIds ?? {})) {
    for (const id of Array.isArray(value) ? value : [value]) if (id) values.add(String(id));
  }
  for (const value of [(player as any).srID, (player as any).slug]) if (value) values.add(String(value));
  return values;
}

function explicitLeague(row: any): 'nba' | 'wnba' | 'external' | null {
  const text = [row?.competitionId, row?.league, row?.leagueKey, row?.uiMode]
    .map(norm)
    .filter(Boolean)
    .join(' ');
  if (!text) return null;
  if (text.includes('wnba')) return 'wnba';
  if (text === 'nba' || text.includes(' nba')) return 'nba';
  return 'external';
}

function inLeagueScope(
  row: any,
  player: NBAPlayer | undefined,
  bucket: TeamHistoryAwardLeagueBucket,
  competitionIds?: ReadonlySet<string>,
): boolean {
  const competitionId = norm(row?.competitionId);
  if (competitionIds?.size && (!competitionId || !competitionIds.has(competitionId))) return false;
  if (!bucket) return true;
  const explicit = explicitLeague(row);
  if (explicit) return explicit === bucket;
  if (!player) return false;
  const season = Number(row?.season);
  return (player.stats ?? []).some(stat => {
    if (Number(stat.season) !== season) return false;
    const statLeague = explicitLeague(stat);
    if (statLeague) return statLeague === bucket;
    const tid = Number(stat.tid);
    return bucket === 'nba' ? Number.isFinite(tid) && tid >= 0 && tid < 100 : false;
  });
}

function attributedToTeam(row: any, player: NBAPlayer | undefined, scope?: TeamScope): boolean {
  if (!scope) return true;
  const season = Number(row?.season);
  if (scope.seasons && !scope.seasons.has(season)) return false;
  const accepted = new Set([...scope.acceptedTeamAbbrevs].map(abbrev));
  const explicitTid = Number(row?.tid);
  const explicitAbbrev = abbrev(row?.teamAbbrev ?? row?.team ?? row?.abbrev);
  if (Number.isFinite(explicitTid) && explicitTid === scope.teamId) return true;
  // Historical source TIDs are not stable across roster files and eras. A
  // dated franchise abbreviation is the authoritative fallback when present.
  if (explicitAbbrev) return accepted.has(explicitAbbrev);
  if (Number.isFinite(explicitTid)) return false;
  if (!player) return false;

  const identities = new Set<string>();
  for (const stat of player.stats ?? []) {
    if (Number(stat.season) !== season) continue;
    const tid = Number(stat.tid);
    const statAbbrev = abbrev(stat.abbrev ?? (stat as any).teamAbbrev);
    if (Number.isFinite(tid) && tid >= 0) identities.add(`tid:${tid}`);
    else if (statAbbrev) identities.add(`abbr:${statAbbrev}`);
  }
  if (identities.size !== 1) return false;
  return identities.has(`tid:${scope.teamId}`) || [...accepted].some(value => identities.has(`abbr:${value}`));
}

function eventKey(event: AwardEvent): string {
  return `${event.personId}:${event.season}:${event.type}:${norm(event.competitionId)}`;
}

function leaderRows(events: readonly AwardEvent[]): TeamHistoryAwardLeader[] {
  const leaders = new Map<string, TeamHistoryAwardLeader>();
  for (const event of events) {
    const current = leaders.get(event.personId);
    if (!current) {
      leaders.set(event.personId, {
        personId: event.personId,
        playerId: event.playerId,
        name: event.name,
        count: 1,
        firstSeason: event.season,
        lastSeason: event.season,
        player: event.player,
      });
      continue;
    }
    current.count += 1;
    current.firstSeason = Math.min(current.firstSeason, event.season);
    current.lastSeason = Math.max(current.lastSeason, event.season);
  }
  return [...leaders.values()].sort((left, right) => (
    right.count - left.count
    || left.firstSeason - right.firstSeason
    || left.name.localeCompare(right.name)
    || left.personId.localeCompare(right.personId)
  ));
}

const priority = (type: string): number => {
  if (type === 'Most Valuable Player') return 0;
  if (type === 'All-Star') return 1;
  if (type === 'Champion') return 2;
  return 10;
};

export function buildTeamHistoryAwardRankings(options: BuildOptions): TeamHistoryAwardRankings {
  const playersBySourceId = new Map<string, NBAPlayer>();
  const uniquePlayers = new Map<string, NBAPlayer>();
  for (const player of options.players) {
    const personId = stablePersonId(player);
    if (!uniquePlayers.has(personId)) uniquePlayers.set(personId, player);
    for (const id of playerIdentityValues(player)) if (!playersBySourceId.has(id)) playersBySourceId.set(id, player);
  }

  const events = new Map<string, AwardEvent>();
  for (const player of uniquePlayers.values()) {
    for (const award of player.awards ?? []) {
      const type = normalizePlayerAwardType(award.type);
      const season = Number(award.season);
      if (!type || !isAwardVisibleInTimeline(award, options.maxSeason)) continue;
      if (!inLeagueScope(award, player, options.leagueBucket ?? null, options.competitionIds)) continue;
      if (!attributedToTeam(award, player, options.teamScope)) continue;
      const event: AwardEvent = {
        personId: stablePersonId(player),
        playerId: player.internalId,
        name: player.name,
        season,
        type,
        competitionId: award.competitionId,
        player,
      };
      events.set(eventKey(event), event);
    }
  }

  for (const award of options.historicalAwards ?? []) {
    const structuredId = award.role === 'coach'
      ? award.coachId
      : award.role === 'executive'
        ? award.executiveId
        : award.pid;
    const player = structuredId == null ? undefined : playersBySourceId.get(String(structuredId));
    if (!player && structuredId == null) continue;
    const personId = player
      ? stablePersonId(player)
      : `${award.role ?? 'person'}:${structuredId}`;
    const name = player?.name
      ?? (award.role === 'coach' ? award.coachName : award.role === 'executive' ? award.executiveName : award.name);
    if (!name) continue;
    const type = normalizePlayerAwardType(award.type);
    const season = Number(award.season);
    if (!type || !isAwardVisibleInTimeline(award, options.maxSeason)) continue;
    if (!inLeagueScope(award, player, options.leagueBucket ?? null, options.competitionIds)) continue;
    if (!attributedToTeam(award, player, options.teamScope)) continue;
    const event: AwardEvent = {
      personId,
      playerId: player?.internalId,
      name,
      season,
      type,
      competitionId: award.competitionId,
      player,
    };
    events.set(eventKey(event), event);
  }

  const allEvents = [...events.values()];
  if (!allEvents.length) return { categories: [], eventCount: 0 };
  const types = [...new Set(allEvents.map(event => event.type))].sort((left, right) => (
    priority(left) - priority(right) || left.localeCompare(right)
  ));
  return {
    eventCount: allEvents.length,
    categories: [
      { key: 'all-awards', label: 'Most Awards', leaders: leaderRows(allEvents) },
      ...types.map(type => ({
        key: slug(type),
        label: type,
        leaders: leaderRows(allEvents.filter(event => event.type === type)),
      })),
    ],
  };
}
