import type {
  BracketByeNode,
  BracketSeriesNode,
  BracketSource,
  PlayoffBracket,
  PlayoffSeries,
} from '../../types';

export interface BracketSeed {
  teamId: number;
  seed: number;
}

export interface BracketGraph {
  policy: 'fixed' | 'reseeded';
  nodes: BracketSeriesNode[];
  byes: BracketByeNode[];
}

type Slot = { source: BracketSource; bye?: BracketByeNode } | null;

const nextPowerOfTwo = (value: number): number => {
  let capacity = 1;
  while (capacity < Math.max(2, value)) capacity *= 2;
  return capacity;
};

const seedOrder = (capacity: number): number[] => {
  let order = [1, 2];
  while (order.length < capacity) {
    const size = order.length * 2;
    order = order.flatMap(seed => [seed, size + 1 - seed]);
  }
  return order;
};

const nodePrefix = (conference: 'East' | 'West' | 'League') => conference === 'League' ? 'L' : conference[0];

/**
 * Builds every fixed-bracket node before the first game. A bye is an edge, not
 * a completed same-team series. Future slots retain winnerOf(seriesId).
 */
export function buildFixedBracketSide(
  seeds: BracketSeed[],
  conference: 'East' | 'West' | 'League',
  _totalRounds = Math.ceil(Math.log2(Math.max(2, seeds.length))),
): BracketGraph {
  // The participant count owns the visible round count. A generic best-of
  // array must not fabricate unused columns or repeated byes in a small field.
  const capacity = nextPowerOfTwo(seeds.length);
  const bySeed = new Map(seeds.map(entry => [entry.seed, entry] as const));
  let slots: Slot[] = seedOrder(capacity).map(seed => {
    const entry = bySeed.get(seed);
    return entry ? { source: { kind: 'team', teamId: entry.teamId, seed: entry.seed } } : null;
  });
  const nodes: BracketSeriesNode[] = [];
  const byes: BracketByeNode[] = [];
  const prefix = nodePrefix(conference);
  let roundIndex = 1;

  while (slots.length > 1) {
    const next: Slot[] = [];
    for (let index = 0; index < slots.length; index += 2) {
      const left = slots[index];
      const right = slots[index + 1];
      const slotIndex = index / 2;
      if (!left && !right) {
        next.push(null);
        continue;
      }
      if (!left || !right) {
        const advancing = left ?? right!;
        const source = advancing.source;
        if (source.kind === 'team') {
          const bye: BracketByeNode = {
            id: `${prefix}R${roundIndex}B${byes.length + 1}`,
            roundIndex,
            slotIndex,
            conference,
            teamId: source.teamId,
            seed: source.seed,
            destinationRoundIndex: roundIndex + 1,
            advancement: 'bye',
          };
          byes.push(bye);
          next.push({ source, bye });
        } else {
          next.push(advancing);
        }
        continue;
      }

      const isFinal = slots.length === 2;
      const id = conference === 'League' && isFinal
        ? 'Finals'
        : `${prefix}R${roundIndex}S${slotIndex + 1}`;
      const sourceA = left.source;
      const sourceB = right.source;
      const resolvedA = sourceA.kind === 'team' ? sourceA : undefined;
      const resolvedB = sourceB.kind === 'team' ? sourceB : undefined;
      const node: BracketSeriesNode = {
        id,
        roundIndex,
        slotIndex,
        conference: conference === 'League' && isFinal ? 'Finals' : conference,
        sourceA,
        sourceB,
        resolvedTeamA: resolvedA?.teamId,
        resolvedTeamB: resolvedB?.teamId,
        resolvedSeedA: resolvedA?.seed,
        resolvedSeedB: resolvedB?.seed,
        status: resolvedA && resolvedB ? 'active' : 'waiting',
      };
      nodes.push(node);
      for (const feeder of [left, right]) {
        if (feeder.bye) feeder.bye.destinationSeriesId = id;
      }
      next.push({ source: { kind: 'winnerOf', seriesId: id } });
    }
    slots = next;
    roundIndex += 1;
  }

  return { policy: 'fixed', nodes, byes };
}

/**
 * Persist every future node/ID now, while leaving future sources unresolved
 * until the saved reseeding rule can see the complete preceding round.
 */
export function buildReseededBracketSide(
  seeds: BracketSeed[],
  conference: 'East' | 'West' | 'League',
  totalRounds = Math.ceil(Math.log2(Math.max(2, seeds.length))),
): BracketGraph {
  const fixed = buildFixedBracketSide(seeds, conference, totalRounds);
  return {
    policy: 'reseeded',
    byes: fixed.byes.map(bye => ({ ...bye, destinationSeriesId: undefined })),
    nodes: fixed.nodes.map(node => node.roundIndex === 1
      ? node
      : {
          ...node,
          sourceA: { kind: 'tbd' as const },
          sourceB: { kind: 'tbd' as const },
          resolvedTeamA: undefined,
          resolvedTeamB: undefined,
          resolvedSeedA: undefined,
          resolvedSeedB: undefined,
          status: 'waiting' as const,
        }),
  };
}

const resolveSource = (
  source: BracketSource,
  nodes: Map<string, BracketSeriesNode>,
): { teamId: number; seed: number } | undefined => {
  if (source.kind === 'team') return source;
  if (source.kind === 'tbd') return undefined;
  const feeder = nodes.get(source.seriesId);
  if (!feeder || feeder.status !== 'complete' || feeder.winnerId == null) return undefined;
  const winnerIsA = feeder.winnerId === feeder.resolvedTeamA;
  return {
    teamId: feeder.winnerId,
    seed: winnerIsA ? feeder.resolvedSeedA ?? 99 : feeder.resolvedSeedB ?? 99,
  };
};

/** Resolves existing slots in place; it never creates or renames a round. */
export function resolveBracketGraph(nodesInput: BracketSeriesNode[]): BracketSeriesNode[] {
  const nodes = nodesInput.map(node => ({ ...node, sourceA: { ...node.sourceA }, sourceB: { ...node.sourceB } }));
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const a = resolveSource(node.sourceA, byId);
      const b = resolveSource(node.sourceB, byId);
      if (a && node.resolvedTeamA !== a.teamId) {
        node.resolvedTeamA = a.teamId;
        node.resolvedSeedA = a.seed;
        changed = true;
      }
      if (b && node.resolvedTeamB !== b.teamId) {
        node.resolvedTeamB = b.teamId;
        node.resolvedSeedB = b.seed;
        changed = true;
      }
      if (node.status === 'waiting' && node.resolvedTeamA != null && node.resolvedTeamB != null) {
        node.status = 'active';
        changed = true;
      }
    }
  }
  return nodes;
}

type ReseedCandidate = {
  teamId: number;
  seed: number;
  source: BracketSource;
};

const winnerCandidate = (node: BracketSeriesNode): ReseedCandidate | null => {
  if (node.status !== 'complete' || node.winnerId == null) return null;
  const isA = node.winnerId === node.resolvedTeamA;
  const seed = isA ? node.resolvedSeedA : node.resolvedSeedB;
  return seed == null
    ? null
    : { teamId: node.winnerId, seed, source: { kind: 'winnerOf', seriesId: node.id } };
};

/** Fill saved reseeded slots exactly once without consulting standings. */
export function resolveReseededBracketGraph(
  nodesInput: BracketSeriesNode[],
  byes: BracketByeNode[],
  leagueWide: boolean,
): BracketSeriesNode[] {
  const nodes = nodesInput.map(node => ({ ...node, sourceA: { ...node.sourceA }, sourceB: { ...node.sourceB } }));
  const groups: Array<'East' | 'West' | 'League'> = leagueWide
    ? ['League']
    : (['East', 'West'] as const).filter(conference => nodes.some(node => node.conference === conference));

  for (const group of groups) {
    const belongs = (node: BracketSeriesNode) => leagueWide
      ? node.conference === 'League' || node.conference === 'Finals'
      : node.conference === group;
    const groupNodes = nodes.filter(belongs);
    const maxRound = Math.max(0, ...groupNodes.map(node => node.roundIndex));
    for (let roundIndex = 2; roundIndex <= maxRound; roundIndex += 1) {
      const targets = groupNodes
        .filter(node => node.roundIndex === roundIndex)
        .sort((left, right) => left.slotIndex - right.slotIndex);
      if (targets.length === 0 || targets.every(node => node.sourceA.kind !== 'tbd' && node.sourceB.kind !== 'tbd')) continue;

      const prior = groupNodes.filter(node => node.roundIndex === roundIndex - 1);
      if (prior.some(node => node.status !== 'complete')) continue;
      const candidates: ReseedCandidate[] = prior
        .map(winnerCandidate)
        .filter((candidate): candidate is ReseedCandidate => candidate != null);
      for (const bye of byes.filter(row =>
        row.destinationRoundIndex === roundIndex
        && (leagueWide ? row.conference === 'League' : row.conference === group)
      )) {
        candidates.push({
          teamId: bye.teamId,
          seed: bye.seed,
          source: { kind: 'team', teamId: bye.teamId, seed: bye.seed },
        });
      }
      candidates.sort((left, right) => left.seed - right.seed || left.teamId - right.teamId);
      if (candidates.length !== targets.length * 2) continue;

      targets.forEach((target, index) => {
        const high = candidates[index];
        const low = candidates[candidates.length - 1 - index];
        target.sourceA = high.source;
        target.sourceB = low.source;
        target.resolvedTeamA = high.teamId;
        target.resolvedTeamB = low.teamId;
        target.resolvedSeedA = high.seed;
        target.resolvedSeedB = low.seed;
        target.status = 'active';
      });
    }
  }
  return resolveBracketGraph(nodes);
}

type LegacyFeed = {
  source: BracketSource;
  bestSeed: number;
  resolvedTeamId?: number;
  resolvedSeed?: number;
};

const isLegacyByeSeries = (series: PlayoffSeries): boolean =>
  series.gameIds.length === 0
  && series.higherSeedTid === series.lowerSeedTid
  && (series.id.includes('B') || series.higherSeed === series.lowerSeed);

/**
 * Converts the former same-team BYE rows into graph edges at the canonical
 * simulation/transition boundary. It reads saved series evidence only; it does
 * not consult standings, alter a played game, or replace a real series result.
 */
export function upgradeLegacyBracketGraph(
  bracket: PlayoffBracket,
  gamesPerRound: number[],
): PlayoffBracket {
  if (bracket.graphVersion === 1 && bracket.nodes?.length) return bracket;
  const savedSeries = bracket.series.map(series => ({ ...series, gameIds: [...series.gameIds] }));
  const byeSeries = savedSeries.filter(isLegacyByeSeries);
  const realSeries = savedSeries.filter(series => !isLegacyByeSeries(series));
  if (realSeries.length === 0) return bracket;

  const byes: BracketByeNode[] = byeSeries.map((series, index) => ({
    id: series.id,
    roundIndex: series.round,
    slotIndex: index,
    conference: series.conference === 'Finals' ? 'League' : series.conference,
    teamId: series.higherSeedTid,
    seed: series.higherSeed,
    destinationRoundIndex: series.round + 1,
    advancement: 'bye',
  }));
  const nodes: BracketSeriesNode[] = [];
  const usedSeriesIds = new Set<string>();

  const buildSide = (conference: 'East' | 'West' | 'League'): LegacyFeed | null => {
    const sideSeries = realSeries.filter(series => series.conference === conference);
    const sideByes = byes.filter(bye => bye.conference === conference);
    const openingRound = Math.min(
      ...sideSeries.map(series => series.round),
      ...sideByes.map(bye => bye.roundIndex),
    );
    if (!Number.isFinite(openingRound)) return null;
    const openingSeries = sideSeries
      .filter(series => series.round === openingRound)
      .sort((left, right) => left.higherSeed - right.higherSeed || left.id.localeCompare(right.id));
    const feeds: LegacyFeed[] = [
      ...sideByes.filter(bye => bye.roundIndex === openingRound).map(bye => ({
        source: { kind: 'team' as const, teamId: bye.teamId, seed: bye.seed },
        bestSeed: bye.seed,
        resolvedTeamId: bye.teamId,
        resolvedSeed: bye.seed,
      })),
      ...openingSeries.map(series => {
        usedSeriesIds.add(series.id);
        nodes.push({
          id: series.id,
          roundIndex: series.round,
          slotIndex: 0,
          conference,
          sourceA: { kind: 'team', teamId: series.higherSeedTid, seed: series.higherSeed },
          sourceB: { kind: 'team', teamId: series.lowerSeedTid, seed: series.lowerSeed },
          resolvedTeamA: series.higherSeedTid,
          resolvedTeamB: series.lowerSeedTid,
          resolvedSeedA: series.higherSeed,
          resolvedSeedB: series.lowerSeed,
          status: series.status === 'pending' ? 'waiting' : series.status,
          winnerId: series.winnerId,
        });
        const winnerSeed = series.winnerId === series.higherSeedTid ? series.higherSeed : series.lowerSeed;
        return {
          source: { kind: 'winnerOf' as const, seriesId: series.id },
          bestSeed: Math.min(series.higherSeed, series.lowerSeed),
          resolvedTeamId: series.status === 'complete' ? series.winnerId : undefined,
          resolvedSeed: series.status === 'complete' ? winnerSeed : undefined,
        };
      }),
    ].sort((left, right) => left.bestSeed - right.bestSeed);

    feeds.forEach((feed, slotIndex) => {
      const source = feed.source;
      if (source.kind === 'team') {
        const bye = sideByes.find(row => row.teamId === source.teamId && row.seed === source.seed);
        if (bye) bye.slotIndex = slotIndex;
      } else if (source.kind === 'winnerOf' || source.kind === 'loserOf') {
        const node = nodes.find(row => row.id === source.seriesId);
        if (node) node.slotIndex = slotIndex;
      }
    });

    let current = feeds;
    let roundIndex = openingRound + 1;
    while (current.length > 1) {
      const ordered = [...current].sort((left, right) => left.bestSeed - right.bestSeed);
      const next: LegacyFeed[] = [];
      const existingRound = sideSeries
        .filter(series => series.round === roundIndex && !usedSeriesIds.has(series.id))
        .sort((left, right) => left.id.localeCompare(right.id));
      for (let slotIndex = 0; slotIndex < Math.floor(ordered.length / 2); slotIndex += 1) {
        const high = ordered[slotIndex];
        const low = ordered[ordered.length - 1 - slotIndex];
        const knownTeamIds = [high.resolvedTeamId, low.resolvedTeamId].filter((value): value is number => value != null);
        const exactExisting = knownTeamIds.length === 2
          ? existingRound.find(series => new Set([series.higherSeedTid, series.lowerSeedTid]).size === 2
              && knownTeamIds.every(teamId => teamId === series.higherSeedTid || teamId === series.lowerSeedTid))
          : undefined;
        const existing = exactExisting ?? existingRound.find(series => !usedSeriesIds.has(series.id));
        const prefix = conference === 'League' ? 'L' : conference[0];
        const id = existing?.id ?? `${prefix}R${roundIndex}S${slotIndex + 1}`;
        if (existing) usedSeriesIds.add(existing.id);
        const resolvedA = high.resolvedTeamId;
        const resolvedB = low.resolvedTeamId;
        const node: BracketSeriesNode = {
          id,
          roundIndex,
          slotIndex,
          conference,
          sourceA: high.source,
          sourceB: low.source,
          resolvedTeamA: resolvedA,
          resolvedTeamB: resolvedB,
          resolvedSeedA: high.resolvedSeed,
          resolvedSeedB: low.resolvedSeed,
          status: existing
            ? existing.status === 'pending' ? 'waiting' : existing.status
            : resolvedA != null && resolvedB != null ? 'active' : 'waiting',
          winnerId: existing?.winnerId,
        };
        nodes.push(node);
        for (const bye of sideByes) {
          if (bye.destinationSeriesId == null
            && [node.sourceA, node.sourceB].some(source => source.kind === 'team' && source.teamId === bye.teamId)) {
            bye.destinationSeriesId = node.id;
          }
        }
        const winnerSeed = existing
          ? existing.winnerId === existing.higherSeedTid ? existing.higherSeed : existing.lowerSeed
          : undefined;
        next.push({
          source: { kind: 'winnerOf', seriesId: id },
          bestSeed: Math.min(high.bestSeed, low.bestSeed),
          resolvedTeamId: existing?.status === 'complete' ? existing.winnerId : undefined,
          resolvedSeed: existing?.status === 'complete' ? winnerSeed : undefined,
        });
      }
      current = next;
      roundIndex += 1;
    }
    return current[0] ?? null;
  };

  const hasConferences = realSeries.some(series => series.conference === 'East' || series.conference === 'West');
  if (hasConferences) {
    const east = buildSide('East');
    const west = buildSide('West');
    if (east && west) {
      const existing = realSeries.find(series => series.conference === 'Finals');
      const roundIndex = Math.max(0, ...nodes.map(node => node.roundIndex)) + 1;
      const finals: BracketSeriesNode = {
        id: existing?.id ?? 'Finals',
        roundIndex: existing?.round ?? roundIndex,
        slotIndex: 0,
        conference: 'Finals',
        sourceA: east.source,
        sourceB: west.source,
        resolvedTeamA: east.resolvedTeamId,
        resolvedTeamB: west.resolvedTeamId,
        resolvedSeedA: east.resolvedSeed,
        resolvedSeedB: west.resolvedSeed,
        status: existing
          ? existing.status === 'pending' ? 'waiting' : existing.status
          : east.resolvedTeamId != null && west.resolvedTeamId != null ? 'active' : 'waiting',
        winnerId: existing?.winnerId,
      };
      nodes.push(finals);
      if (existing) usedSeriesIds.add(existing.id);
    }
  } else {
    buildSide('League');
  }

  const existingById = new Map(realSeries.map(series => [series.id, series] as const));
  const series = bracketNodesToSeries(nodes, gamesPerRound).map(generated => {
    const existing = existingById.get(generated.id);
    return existing
      ? { ...existing, slotIndex: generated.slotIndex, sourceA: generated.sourceA, sourceB: generated.sourceB }
      : generated;
  });
  return {
    ...bracket,
    graphVersion: 1,
    bracketPolicy: 'fixed',
    nodes: resolveBracketGraph(nodes),
    byes,
    series,
  };
}

export function bracketNodesToSeries(
  nodes: BracketSeriesNode[],
  gamesPerRound: number[],
): PlayoffSeries[] {
  return nodes
    .filter(node => (
      node.resolvedTeamA != null
      && node.resolvedTeamB != null
      && node.resolvedSeedA != null
      && node.resolvedSeedB != null
      && node.status !== 'waiting'
    ))
    .map(node => {
    const aSeed = node.resolvedSeedA!;
    const bSeed = node.resolvedSeedB!;
    const aFirst = aSeed <= bSeed;
    return {
      id: node.id,
      round: node.roundIndex,
      slotIndex: node.slotIndex,
      conference: node.conference,
      higherSeedTid: aFirst ? node.resolvedTeamA! : node.resolvedTeamB!,
      lowerSeedTid: aFirst ? node.resolvedTeamB! : node.resolvedTeamA!,
      higherSeed: aFirst ? aSeed : bSeed,
      lowerSeed: aFirst ? bSeed : aSeed,
      higherSeedWins: 0,
      lowerSeedWins: 0,
      gamesNeeded: gamesPerRound[Math.min(node.roundIndex - 1, gamesPerRound.length - 1)] ?? 7,
      gameIds: [],
      status: node.status === 'waiting' ? 'pending' : node.status === 'ready' ? 'active' : node.status,
      winnerId: node.winnerId,
      sourceA: node.sourceA,
      sourceB: node.sourceB,
    };
  });
}
