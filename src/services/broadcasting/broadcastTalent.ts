import type { GameState, NBAPlayer } from '../../types';
import type { RetireeRecord } from '../playerDevelopment/retirementChecker';

interface SourceSpan {
  from: number;
  to?: number;
}

interface SourceTalent {
  id: string;
  name: string;
  aliases?: string[];
  role: string;
  outlet: string;
  activeSpans: SourceSpan[];
}

interface SourcePayload {
  version: string;
  sourceCutoffYear: number;
  talent: SourceTalent[];
}

export interface BroadcastTalentRecord {
  id: string;
  playerId?: string;
  playerName: string;
  role: string;
  outlet: string;
  joinedYear: number;
  leftYear?: number;
  active: boolean;
  portraitUrl?: string;
  source: 'historical' | 'simulation';
  sourceVersion?: string;
}

let sourcePromise: Promise<SourcePayload> | null = null;
let sourceCache: SourcePayload | null = null;

const normalizeName = (value: string): string => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

function loadSource(): Promise<SourcePayload> {
  if (!sourcePromise) {
    sourcePromise = fetch('/data/broadcasting/nba-former-player-broadcasters.json')
      .then(response => {
        if (!response.ok) throw new Error(`Broadcast talent source returned ${response.status}`);
        return response.json() as Promise<SourcePayload>;
      })
      .then(payload => {
        sourceCache = payload;
        return payload;
      });
  }
  return sourcePromise;
}

function stableNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function findPlayer(source: SourceTalent, players: NBAPlayer[]): NBAPlayer | undefined {
  const names = new Set([source.name, ...(source.aliases ?? [])].map(normalizeName));
  return players.find(player => names.has(normalizeName(player.name)));
}

function projectedOpenSpanEnd(source: SourceTalent, cutoffYear: number): number {
  return cutoffYear + 4 + Math.floor(stableNumber(`broadcast-exit-${source.id}`) * 11);
}

function materializeHistoricalRecord(
  source: SourceTalent,
  span: SourceSpan,
  payload: SourcePayload,
  player: NBAPlayer | undefined,
  year: number,
): BroadcastTalentRecord {
  const leftYear = span.to ?? (year > payload.sourceCutoffYear
    ? projectedOpenSpanEnd(source, payload.sourceCutoffYear)
    : undefined);
  return {
    id: `broadcast-talent-${source.id}-${span.from}`,
    playerId: player?.internalId,
    playerName: player?.name ?? source.name,
    role: source.role,
    outlet: source.outlet,
    joinedYear: span.from,
    leftYear,
    active: span.from <= year && (leftYear === undefined || leftYear >= year),
    portraitUrl: player?.imgURL,
    source: 'historical',
    sourceVersion: payload.version,
  };
}

function withPlayerBroadcastFlags(players: NBAPlayer[], records: BroadcastTalentRecord[]): NBAPlayer[] {
  const activeByPlayerId = new Map(
    records.filter(record => record.active && record.playerId).map(record => [record.playerId!, record]),
  );
  if (activeByPlayerId.size === 0) return players;
  return players.map(player => {
    const record = activeByPlayerId.get(player.internalId);
    if (!record) return player;
    return {
      ...player,
      postCareerStaffJoined: true,
      postCareerStaffRole: record.role,
      postCareerStaffYear: record.joinedYear,
    };
  });
}

function buildSimulatedArchive(players: NBAPlayer[], year: number): BroadcastTalentRecord[] {
  return players
    .filter(player => player.status === 'Retired' && Number(player.retiredYear ?? 0) > 0)
    .filter(player => {
      const probability = Math.min(0.45, 0.06 + allStarCount(player) * 0.035);
      return stableNumber(`broadcast-archive-${player.internalId}`) < probability;
    })
    .map(player => {
      const joinedYear = Number(player.retiredYear);
      const leftYear = joinedYear + 8 + Math.floor(stableNumber(`broadcast-tenure-${player.internalId}`) * 18);
      return {
        id: `broadcast-talent-${player.internalId}-${joinedYear}`,
        playerId: player.internalId,
        playerName: player.name,
        role: simulationRole(player),
        outlet: 'League broadcast desk',
        joinedYear,
        leftYear,
        active: joinedYear <= year && leftYear >= year,
        portraitUrl: player.imgURL,
        source: 'simulation' as const,
      };
    });
}

export async function buildInitialBroadcastTalent(
  state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'nbaStartYear'>,
  players: NBAPlayer[],
): Promise<{ players: NBAPlayer[]; records: BroadcastTalentRecord[] }> {
  const isRealNba = state.leagueType === 'modded' && (state.moddedLeagueBase ?? 'nba') === 'nba';
  const year = Number(state.leagueStats?.year ?? new Date().getFullYear());
  if (!isRealNba) {
    const records = buildSimulatedArchive(players, year);
    return { players: withPlayerBroadcastFlags(players, records), records };
  }
  const payload = await loadSource();
  const branchStartYear = Number(state.nbaStartYear ?? state.leagueStats?.historicalEraStartYear ?? year);
  const knowledgeYear = Math.min(branchStartYear, payload.sourceCutoffYear);
  const records = payload.talent.flatMap(source => {
    const player = findPlayer(source, players);
    return source.activeSpans
      .filter(span => span.from <= knowledgeYear)
      .map(span => materializeHistoricalRecord(source, span, payload, player, year));
  });
  return { players: withPlayerBroadcastFlags(players, records), records };
}

function allStarCount(player: NBAPlayer): number {
  return (player.awards ?? []).filter(award => /all.star/i.test(award.type)).length;
}

function simulationRole(player: NBAPlayer): string {
  const assists = (player.stats ?? []).reduce((sum, row) => sum + Number(row.ast ?? 0), 0);
  if (assists >= 5000) return 'Game Analyst';
  if (allStarCount(player) >= 5) return 'Studio Analyst';
  return 'Color Analyst';
}

export function runBroadcastTalentRollover(args: {
  state: GameState;
  players: NBAPlayer[];
  newRetirees: RetireeRecord[];
  currentYear: number;
  leagueStartYear: number;
}): { players: NBAPlayer[]; records: BroadcastTalentRecord[] } {
  const { state, players, newRetirees, currentYear, leagueStartYear } = args;
  const isRealNba = state.leagueType === 'modded' && (state.moddedLeagueBase ?? 'nba') === 'nba';
  const payload = isRealNba ? sourceCache : null;
  const sourceByName = new Map<string, SourceTalent>();
  for (const entry of payload?.talent ?? []) {
    for (const name of [entry.name, ...(entry.aliases ?? [])]) sourceByName.set(normalizeName(name), entry);
  }
  const knowledgeYear = payload ? Math.min(leagueStartYear, payload.sourceCutoffYear) : -Infinity;
  const existing = (state.broadcastTalent ?? []).map(record => ({
    ...record,
    active: record.active && (record.leftYear === undefined || record.leftYear >= currentYear),
  }));
  const existingPlayerIds = new Set(existing.map(record => record.playerId).filter(Boolean));
  const playersById = new Map(players.map(player => [player.internalId, player]));
  const additions: BroadcastTalentRecord[] = [];

  for (const retiree of newRetirees) {
    if (existingPlayerIds.has(retiree.playerId)) continue;
    const player = playersById.get(retiree.playerId);
    if (!player) continue;
    const source = sourceByName.get(normalizeName(player.name));
    const knownSpan = source?.activeSpans.find(span => span.from <= knowledgeYear);
    const probability = Math.min(0.45, 0.06 + allStarCount(player) * 0.035);
    if (!knownSpan && stableNumber(`broadcast-join-${player.internalId}-${currentYear}`) >= probability) continue;
    additions.push({
      id: `broadcast-talent-${player.internalId}-${currentYear}`,
      playerId: player.internalId,
      playerName: player.name,
      role: source?.role ?? simulationRole(player),
      outlet: source?.outlet ?? 'League broadcast desk',
      joinedYear: currentYear,
      active: true,
      portraitUrl: player.imgURL,
      source: knownSpan ? 'historical' : 'simulation',
      sourceVersion: knownSpan ? payload?.version : undefined,
    });
  }

  const records = [...existing, ...additions];
  return { players: withPlayerBroadcastFlags(players, records), records };
}
