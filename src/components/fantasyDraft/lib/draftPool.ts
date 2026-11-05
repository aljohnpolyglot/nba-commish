import { Player, CardOption, MysteryCardClues, ClueItem, ClueType, getResolvedOvr } from '../types';

type QualityGroup = 'P0_20' | 'P20_50' | 'P50_70' | 'P70_93' | 'P93_100';

export interface LeaguePercentileThresholds {
  p20: number;
  p50: number;
  p70: number;
  p93: number;
}

export function computeLeaguePercentiles(allPlayers: Player[]): LeaguePercentileThresholds {
  if (!allPlayers || allPlayers.length === 0) {
    return { p20: 43, p50: 47, p70: 50, p93: 58 };
  }
  const sortedOvrs = allPlayers.map((p) => getResolvedOvr(p)).sort((a, b) => a - b);
  const len = sortedOvrs.length;
  return {
    p20: sortedOvrs[Math.floor(len * 0.20)] ?? 43,
    p50: sortedOvrs[Math.floor(len * 0.50)] ?? 47,
    p70: sortedOvrs[Math.floor(len * 0.70)] ?? 50,
    p93: sortedOvrs[Math.floor(len * 0.9333)] ?? 58,
  };
}

export function getPlayerGroup(
  player: Player,
  thresholds: LeaguePercentileThresholds
): QualityGroup {
  const pOvr = getResolvedOvr(player);
  if (pOvr >= thresholds.p93) return 'P93_100';
  if (pOvr >= thresholds.p70) return 'P70_93';
  if (pOvr >= thresholds.p50) return 'P50_70';
  if (pOvr >= thresholds.p20) return 'P20_50';
  return 'P0_20';
}

export function getRoundWeights(roundIndex: number): Record<QualityGroup, number> {
  // roundIndex: 0 = Round 1 (Pick 1), ..., 14 = Round 15 (Pick 15)
  if (roundIndex === 0) {
    // Round 1 — Franchise Pack: ALL THREE candidates strictly from 93.33rd–100th percentile
    return {
      P93_100: 100,
      P70_93: 0,
      P50_70: 0,
      P20_50: 0,
      P0_20: 0,
    };
  } else if (roundIndex >= 1 && roundIndex <= 4) {
    // Picks 2–5 — Build the Core:
    // 2% -> 0–20, 8% -> 20–50, 20% -> 50–70, 45% -> 70–93.33, 25% -> 93.33–100
    return {
      P0_20: 2,
      P20_50: 8,
      P50_70: 20,
      P70_93: 45,
      P93_100: 25,
    };
  } else if (roundIndex >= 5 && roundIndex <= 9) {
    // Picks 6–10 — Rotation:
    // 5% -> 0–20, 20% -> 20–50, 35% -> 50–70, 35% -> 70–93.33, 5% -> 93.33–100
    return {
      P0_20: 5,
      P20_50: 20,
      P50_70: 35,
      P70_93: 35,
      P93_100: 5,
    };
  } else {
    // Picks 11–15 — Deep Bench:
    // 50% -> 0–20, 30% -> 20–50, 15% -> 50–70, 4% -> 70–93.33, 1% -> 93.33–100
    return {
      P0_20: 50,
      P20_50: 30,
      P50_70: 15,
      P70_93: 4,
      P93_100: 1,
    };
  }
}

export function sampleCandidate(
  availablePool: Player[],
  thresholds: LeaguePercentileThresholds,
  weights: Record<QualityGroup, number>
): Player | null {
  if (availablePool.length === 0) return null;

  const buckets: Record<QualityGroup, Player[]> = {
    P93_100: [],
    P70_93: [],
    P50_70: [],
    P20_50: [],
    P0_20: [],
  };

  for (const player of availablePool) {
    const grp = getPlayerGroup(player, thresholds);
    buckets[grp].push(player);
  }

  const activeWeights: { group: QualityGroup; weight: number }[] = [];
  let totalWeight = 0;

  (Object.keys(weights) as QualityGroup[]).forEach((grp) => {
    if (buckets[grp].length > 0 && weights[grp] > 0) {
      activeWeights.push({ group: grp, weight: weights[grp] });
      totalWeight += weights[grp];
    }
  });

  if (activeWeights.length === 0 || totalWeight === 0) {
    const randIdx = Math.floor(Math.random() * availablePool.length);
    return availablePool[randIdx];
  }

  let rand = Math.random() * totalWeight;
  let chosenGroup: QualityGroup = activeWeights[0].group;

  for (const item of activeWeights) {
    if (rand < item.weight) {
      chosenGroup = item.group;
      break;
    }
    rand -= item.weight;
  }

  const candidateBucket = buckets[chosenGroup];
  const randPlayerIdx = Math.floor(Math.random() * candidateBucket.length);
  return candidateBucket[randPlayerIdx];
}

function generateClues(player: Player): MysteryCardClues {
  const candidateClues: ClueItem[] = [];

  // 1. POSITION clue
  if (player.displayPos || player.position) {
    candidateClues.push({
      type: 'POSITION',
      label: 'POSITION',
      value: player.displayPos || player.position,
    });
  }

  // 2. AGE clue
  candidateClues.push({
    type: 'AGE',
    label: 'AGE',
    value: `${player.age} yrs`,
  });

  // 3. HEIGHT clue
  let heightStr = `6'5"–6'7"`;
  if (player.heightInches >= 82) heightStr = `6'10"+`;
  else if (player.heightInches >= 79) heightStr = `6'7"–6'9"`;
  else if (player.heightInches >= 76) heightStr = `6'4"–6'6"`;
  else if (player.heightInches >= 73) heightStr = `6'1"–6'3"`;
  else heightStr = `Under 6'1"`;

  candidateClues.push({
    type: 'HEIGHT',
    label: 'HEIGHT',
    value: heightStr,
  });

  // 4. WEIGHT clue (if available)
  if (player.weight && player.weight > 150) {
    const minW = Math.floor(player.weight / 15) * 15;
    candidateClues.push({
      type: 'WEIGHT',
      label: 'WEIGHT',
      value: `${minW}–${minW + 15} lbs`,
    });
  }

  // 5. NATIONALITY / ORIGIN clue
  if (player.nationality) {
    candidateClues.push({
      type: 'NATIONALITY',
      label: 'ORIGIN',
      value: player.nationality,
    });
  }

  // 6. COLLEGE / PRE-NBA clue
  if (player.college && player.college.toLowerCase() !== 'none') {
    candidateClues.push({
      type: 'COLLEGE',
      label: 'COLLEGE',
      value: player.college,
    });
  }

  // 7. DRAFT PICK clue
  if (player.draftPick) {
    candidateClues.push({
      type: 'DRAFT_PICK',
      label: 'DRAFT PICK',
      value: player.draftPick,
    });
  }

  // 8. DRAFT YEAR clue (if available)
  if (player.draftYear && player.draftYear > 2000) {
    candidateClues.push({
      type: 'DRAFT_YEAR',
      label: 'DRAFT YEAR',
      value: `${player.draftYear}`,
    });
  }

  // 9. JERSEY NUMBER clue
  if (player.jerseyNumber) {
    candidateClues.push({
      type: 'JERSEY_NUMBER',
      label: 'JERSEY #',
      value: `#${player.jerseyNumber}`,
    });
  }

  // 10. DRAFT TEAM clue (if available)
  if (player.draftTeamAbbrev) {
    candidateClues.push({
      type: 'DRAFT_TEAM',
      label: 'DRAFT TEAM',
      value: player.draftTeamAbbrev,
    });
  }

  // CURRENT TEAM CLUES
  // 10. CONFERENCE clue
  candidateClues.push({
    type: 'CONFERENCE',
    label: 'CONF',
    value: `${player.conference} Conf.`,
  });

  // 11. DIVISION clue (if available)
  if (player.division) {
    candidateClues.push({
      type: 'DIVISION',
      label: 'DIV',
      value: `${player.division} Div.`,
    });
  }

  // 12. TEAM clue
  candidateClues.push({
    type: 'TEAM',
    label: 'TEAM',
    value: player.teamName,
  });

  // FORMER TEAM CLUE
  // 13. FORMER TEAM clue (if available)
  if (player.formerTeams && player.formerTeams.length > 0) {
    candidateClues.push({
      type: 'FORMER_TEAM',
      label: 'FORMER TEAM',
      value: player.formerTeams.slice(0, 3).join(', '),
    });
  }

  // Selection process: 2 or 3 clues randomly chosen
  const clueCount = Math.random() < 0.5 ? 2 : 3;
  const selectedClues: ClueItem[] = [];
  let pool = [...candidateClues];

  // Types that conflict with FORMER_TEAM (current team & draft team clues)
  const currentOrDraftTeamTypes: ClueItem['type'][] = ['TEAM', 'CONFERENCE', 'DIVISION', 'DRAFT_TEAM'];

  while (selectedClues.length < clueCount && pool.length > 0) {
    const randIdx = Math.floor(Math.random() * pool.length);
    const chosen = pool[randIdx];
    selectedClues.push(chosen);

    // Remove chosen clue from remaining pool
    pool.splice(randIdx, 1);

    // MUTUAL EXCLUSIVITY RULE:
    // "former team : never to be shown at same time with current team or draft team"
    if (chosen.type === 'FORMER_TEAM') {
      pool = pool.filter((item) => !currentOrDraftTeamTypes.includes(item.type));
    } else if (currentOrDraftTeamTypes.includes(chosen.type)) {
      pool = pool.filter((item) => item.type !== 'FORMER_TEAM');
    }
  }

  return { exposedClues: selectedClues };
}

export function generateCardOptions(
  allPlayers: Player[],
  alreadyDraftedIds: Set<string>,
  roundIndex: number
): CardOption[] {
  const thresholds = computeLeaguePercentiles(allPlayers);
  const weights = getRoundWeights(roundIndex);

  const undrafted = allPlayers.filter((p) => !alreadyDraftedIds.has(p.id));

  // Sample 3 candidates independently
  const selected: Player[] = [];

  for (let i = 0; i < 3; i++) {
    const candidatePool = undrafted.filter((p) => !selected.some((s) => s.id === p.id));
    if (candidatePool.length === 0) break;

    const sampled = sampleCandidate(candidatePool, thresholds, weights);
    if (sampled) {
      selected.push(sampled);
    }
  }

  // Backfill if needed
  if (selected.length < 3) {
    for (const p of undrafted) {
      if (!selected.some((s) => s.id === p.id)) {
        selected.push(p);
      }
      if (selected.length === 3) break;
    }
  }

  return selected.map((player) => ({
    id: `card-${player.id}-${Math.random().toString(36).slice(2, 7)}`,
    player,
    clues: generateClues(player),
  }));
}
