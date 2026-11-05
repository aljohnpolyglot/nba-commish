import type {
  CupCompetitionFormat,
  CupFormatValidation,
  CupGroupAssignment,
  CupGroupAssignmentResult,
  CupQualifier,
  CupTeamSeed,
} from './types';

const sortedTeams = (teams: CupTeamSeed[]): CupTeamSeed[] => [...new Map(teams.map(team => [team.tid, team])).values()]
  .sort((left, right) => (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER) || left.tid - right.tid);

export function validateCupFormat(format: CupCompetitionFormat): CupFormatValidation {
  const errors: string[] = [];
  if (!format.leagueId.trim()) errors.push('leagueId is required');
  if (!format.competitionId.trim()) errors.push('competitionId is required');
  if (!Number.isInteger(format.teamCount) || format.teamCount < 2) errors.push('teamCount must be an integer of at least 2');
  if (format.groups.length === 0) errors.push('at least one group is required');
  if (new Set(format.groups.map(group => group.id)).size !== format.groups.length) errors.push('group ids must be unique');
  if (format.groups.some(group => !Number.isInteger(group.size) || group.size < 2)) errors.push('every group must contain at least 2 teams');
  if (format.groups.reduce((total, group) => total + group.size, 0) !== format.teamCount) errors.push('group sizes must equal teamCount');
  const smallestGroup = Math.min(...format.groups.map(group => group.size));
  if (!Number.isInteger(format.groupStage.gamesPerTeam) || format.groupStage.gamesPerTeam < 1) errors.push('gamesPerTeam must be a positive integer');
  if (format.groups.some(group => {
    const gamesPerTeam = group.gamesPerTeam ?? format.groupStage.gamesPerTeam;
    return !Number.isInteger(gamesPerTeam) || gamesPerTeam < 1 || gamesPerTeam > group.size - 1;
  })) errors.push('group gamesPerTeam must fit each group round robin');
  if (format.groupStage.tiebreakers.length === 0) errors.push('group tiebreakers are required');
  if (!Number.isInteger(format.qualification.directPerGroup) || format.qualification.directPerGroup < 0) errors.push('directPerGroup must be a non-negative integer');
  if (format.qualification.directPerGroup > smallestGroup) errors.push('directPerGroup cannot exceed the smallest group');
  if (format.qualification.wildcards.some(rule => !Number.isInteger(rule.count) || rule.count < 0)) errors.push('wildcard counts must be non-negative integers');
  const directCount = format.groups.length * format.qualification.directPerGroup;
  const wildcardCount = format.qualification.wildcards.reduce((total, rule) => total + rule.count, 0);
  const qualifierCount = directCount + wildcardCount;
  const firstRound = format.knockoutRounds[0];
  if (!firstRound) errors.push('at least one knockout round is required');
  if (firstRound && firstRound.participants !== qualifierCount) errors.push('first knockout round participants must equal all qualifiers');
  format.knockoutRounds.forEach((round, index) => {
    if (!Number.isInteger(round.participants) || round.participants < 2 || round.participants % 2 !== 0) errors.push(`${round.id} participants must be an even integer`);
    if (!Number.isInteger(round.bestOf) || round.bestOf < 1 || round.bestOf % 2 === 0) errors.push(`${round.id} bestOf must be a positive odd integer`);
    const next = format.knockoutRounds[index + 1];
    if (next && next.participants !== round.participants / 2) errors.push(`${next.id} participants must be half of ${round.id}`);
  });
  if (format.knockoutRounds.at(-1)?.participants !== 2) errors.push('last knockout round must be a two-team final');
  const prizeValues = Object.entries(format.prizePool).filter(([, value]) => typeof value === 'number');
  if (prizeValues.some(([, value]) => !Number.isFinite(value) || Number(value) < 0)) errors.push('prize pool values must be finite and non-negative');
  if (new Set(format.awards.map(award => award.id)).size !== format.awards.length) errors.push('award ids must be unique');
  return { valid: errors.length === 0, errors };
}

function snakeGroupIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  const cycle = count * 2;
  const position = index % cycle;
  return position < count ? position : cycle - position - 1;
}

export function assignCupGroups(format: CupCompetitionFormat, teams: CupTeamSeed[]): CupGroupAssignmentResult {
  const ordered = sortedTeams(teams);
  const groups: CupGroupAssignment[] = format.groups.map(group => ({ groupId: group.id, poolId: group.poolId, tids: [] }));
  const capacity = new Map(format.groups.map(group => [group.id, group.size]));
  const assigned = new Set<number>();
  for (const team of ordered) {
    if (!team.groupHint) continue;
    const group = groups.find(candidate => candidate.groupId === team.groupHint && candidate.tids.length < (capacity.get(candidate.groupId) ?? 0));
    if (!group || (team.poolId && group.poolId && team.poolId !== group.poolId)) continue;
    group.tids.push(team.tid);
    assigned.add(team.tid);
  }
  const pools = [...new Set(format.groups.map(group => group.poolId ?? '__all__'))];
  for (const poolId of pools) {
    const poolGroups = groups.filter(group => (group.poolId ?? '__all__') === poolId);
    const candidates = ordered.filter(team => !assigned.has(team.tid) && (!team.poolId || team.poolId === poolId || poolId === '__all__'));
    let cursor = 0;
    for (const team of candidates) {
      let selected: CupGroupAssignment | undefined;
      for (let offset = 0; offset < poolGroups.length * 2; offset++) {
        const group = poolGroups[snakeGroupIndex(cursor + offset, poolGroups.length)];
        if (group.tids.length < (capacity.get(group.groupId) ?? 0)) {
          selected = group;
          cursor += offset + 1;
          break;
        }
      }
      if (!selected) continue;
      selected.tids.push(team.tid);
      assigned.add(team.tid);
    }
  }
  return {
    groups,
    unassignedTids: ordered.filter(team => !assigned.has(team.tid)).map(team => team.tid),
  };
}

export function buildCupOpeningRound(format: CupCompetitionFormat, qualifiers: CupQualifier[]) {
  const round = format.knockoutRounds[0];
  if (!round) return [];
  const seeded = [...qualifiers].sort((left, right) => left.seed - right.seed).slice(0, round.participants);
  return Array.from({ length: Math.floor(seeded.length / 2) }, (_, index) => {
    const home = seeded[index];
    const away = seeded[seeded.length - 1 - index];
    return {
      roundId: round.id,
      slot: index + 1,
      homeSeed: home.seed,
      awaySeed: away.seed,
      homeTid: home.tid,
      awayTid: away.tid,
    };
  });
}
