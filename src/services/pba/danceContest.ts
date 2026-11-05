import type { AllStarPlayer } from '../../types';

export type PbaDanceStyle =
  | 'Synchronized'
  | 'Hip-Hop'
  | 'Novelty'
  | 'Awkward'
  | 'Energetic'
  | 'Captain Solo'
  | 'Basketball'
  | 'Viral Dance';

export type PbaDanceMood = 'Hype' | 'Chill' | 'Intense' | 'Goofy' | 'Epic';

export type PbaDanceFormation =
  | 'V-Shape'
  | 'Circle'
  | 'Lines'
  | 'Diamond'
  | 'Scattered'
  | 'Arrowhead'
  | 'Staggered'
  | 'W-Shape'
  | 'Box-Grid'
  | 'Starburst'
  | 'Pyramid'
  | 'ZigZag'
  | 'Semicircle';

export type PbaDanceEnding = 'Pose' | 'Point to Sky' | 'High Five' | 'Bow' | 'Kneel';

export interface PbaDanceRoutine {
  style: PbaDanceStyle;
  mood: PbaDanceMood;
  formationSequence: PbaDanceFormation[];
  ending: PbaDanceEnding;
}

export interface PbaDanceContestTeam {
  teamId: string;
  label: string;
  captainId: string;
  captainName: string;
  players: AllStarPlayer[];
}

export interface PbaDanceContestTeamResult {
  teamId: string;
  label: string;
  captainId: string;
  captainName: string;
  playerIds: string[];
  playerNames: string[];
  routine: PbaDanceRoutine;
  entertainment: number;
  synchronization: number;
  creativity: number;
  crowdAppeal: number;
  finalScore: number;
}

export interface PbaDanceContestResult {
  teams: PbaDanceContestTeamResult[];
  winnerTeamId: string;
  winnerLabel: string;
  complete: true;
}

const STYLES: PbaDanceStyle[] = [
  'Synchronized',
  'Hip-Hop',
  'Novelty',
  'Awkward',
  'Energetic',
  'Captain Solo',
  'Basketball',
  'Viral Dance',
];
const MOODS: PbaDanceMood[] = ['Hype', 'Chill', 'Intense', 'Goofy', 'Epic'];
const FORMATIONS: PbaDanceFormation[] = [
  'V-Shape',
  'Circle',
  'Lines',
  'Diamond',
  'Scattered',
  'Arrowhead',
  'Staggered',
  'W-Shape',
  'Box-Grid',
  'Starburst',
  'Pyramid',
  'ZigZag',
  'Semicircle',
];
const ENDINGS: PbaDanceEnding[] = ['Pose', 'Point to Sky', 'High Five', 'Bow', 'Kneel'];

const randomInt = (random: () => number, min: number, max: number): number =>
  Math.floor(random() * (max - min + 1)) + min;

const pickRandom = <T,>(random: () => number, values: readonly T[]): T =>
  values[Math.floor(random() * values.length)];

const captainTeamLabel = (captainName: string): string => {
  const surname = captainName.trim().split(/\s+/).at(-1);
  return `Team ${surname || captainName.trim()}`;
};

const danceTeamBucket = (conference: string): string => {
  if (conference === 'USA1' || conference === 'USA2') return 'USA';
  if (conference === 'WORLD' || conference === 'WORLD1' || conference === 'WORLD2') return 'WORLD';
  return conference;
};

export function getPbaDanceFormationPosition(
  formation: PbaDanceFormation,
  index: number,
  isCaptain = false,
): { x: number; y: number } {
  const i = index % 12;
  let x = 0;
  let y = 0;

  if (formation === 'V-Shape') {
    const coords = [
      [0, 100], [-60, 50], [60, 50], [-120, 0], [120, 0], [-180, -50],
      [180, -50], [-240, -100], [240, -100], [-300, -150], [300, -150], [0, -50],
    ];
    [x, y] = coords[i];
  } else if (formation === 'Circle') {
    const radians = (i * 360 / 12) * Math.PI / 180;
    x = Math.cos(radians) * 170;
    y = Math.sin(radians) * 120;
  } else if (formation === 'Lines') {
    x = -200 + (i % 6) * 80;
    y = Math.floor(i / 6) === 0 ? -60 : 60;
  } else if (formation === 'Diamond') {
    const coords = [
      [0, 120], [-70, 60], [70, 60], [-140, 0], [0, 0], [140, 0],
      [-210, -60], [-70, -60], [70, -60], [210, -60], [-70, -120], [70, -120],
    ];
    [x, y] = coords[i];
  } else if (formation === 'Scattered') {
    const coords = [
      [0, 100], [-160, 70], [140, 90], [-80, 30], [80, 20], [-220, 0],
      [180, -20], [-120, -60], [110, -50], [0, -70], [-180, -110], [160, -100],
    ];
    [x, y] = coords[i];
  } else if (formation === 'Arrowhead') {
    const coords = [
      [0, 130], [-50, 70], [50, 70], [-100, 10], [0, 20], [100, 10],
      [-150, -50], [150, -50], [-200, -110], [-80, -80], [80, -80], [200, -110],
    ];
    [x, y] = coords[i];
  } else if (formation === 'Staggered') {
    const column = i % 4;
    x = -180 + column * 120;
    y = -90 + Math.floor(i / 4) * 80 + (column % 2 === 0 ? 30 : -30);
  } else if (formation === 'W-Shape') {
    const coords = [
      [-240, 80], [-180, -20], [-120, -100], [-60, -20], [0, 80], [60, -20],
      [120, -100], [180, -20], [240, 80], [-100, 30], [100, 30], [0, -40],
    ];
    [x, y] = coords[i];
  } else if (formation === 'Box-Grid') {
    x = -180 + (i % 4) * 120;
    y = -100 + Math.floor(i / 4) * 100;
  } else if (formation === 'Starburst') {
    const radians = (i * 30) * Math.PI / 180;
    const distance = i % 2 === 0 ? 200 : 95;
    x = Math.cos(radians) * distance;
    y = Math.sin(radians) * distance * 0.7;
  } else if (formation === 'Pyramid') {
    const coords = [
      [0, 120], [-60, 40], [60, 40], [-120, -40], [0, -40], [120, -40],
      [-180, -120], [-90, -120], [0, -120], [90, -120], [180, -120], [0, 40],
    ];
    [x, y] = coords[i];
  } else if (formation === 'ZigZag') {
    const coords = [
      [-240, 100], [-160, 20], [-80, 100], [0, 20], [80, 100], [160, 20],
      [240, 100], [-200, -80], [-100, -140], [0, -80], [100, -140], [200, -80],
    ];
    [x, y] = coords[i];
  } else if (formation === 'Semicircle') {
    const radians = (180 + i * 180 / 11) * Math.PI / 180;
    x = Math.cos(radians) * 220;
    y = Math.sin(radians) * 140;
  }

  return { x, y: isCaptain ? y + 25 : y };
}

function generateFormationSequence(random: () => number): PbaDanceFormation[] {
  const available = [...FORMATIONS];
  const first = pickRandom(random, available);
  const sequence = [first];
  available.splice(available.indexOf(first), 1);

  while (sequence.length < 4) {
    const previous = sequence.at(-1)!;
    let closest = available[0];
    let shortestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of available) {
      let distance = 0;
      for (let index = 0; index < 12; index += 1) {
        const from = getPbaDanceFormationPosition(previous, index);
        const to = getPbaDanceFormationPosition(candidate, index);
        distance += (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
      }
      if (distance < shortestDistance) {
        shortestDistance = distance;
        closest = candidate;
      }
    }
    sequence.push(closest);
    available.splice(available.indexOf(closest), 1);
  }

  return sequence;
}

export function buildPbaDanceContestTeams(
  roster: readonly AllStarPlayer[],
): PbaDanceContestTeam[] {
  const groups = new Map<string, AllStarPlayer[]>();
  const activeIds = new Set<string>();
  for (const player of roster) {
    if (player.isInjuredDNP || activeIds.has(player.playerId)) continue;
    const bucket = danceTeamBucket(String(player.conference ?? '').trim());
    if (!bucket) continue;
    activeIds.add(player.playerId);
    groups.set(bucket, [...(groups.get(bucket) ?? []), player]);
  }

  return [...groups.entries()]
    .filter(([, players]) => players.length > 0)
    .slice(0, 2)
    .map(([teamId, players]) => {
      const activePlayers = players.slice(0, 12);
      const captain = activePlayers.find(player => player.isCaptain) ?? activePlayers[0];
      return {
        teamId,
        label: captainTeamLabel(captain.playerName),
        captainId: captain.playerId,
        captainName: captain.playerName,
        players: activePlayers,
      };
    });
}

function generateRoutine(random: () => number): PbaDanceRoutine {
  return {
    style: pickRandom(random, STYLES),
    mood: pickRandom(random, MOODS),
    formationSequence: generateFormationSequence(random),
    ending: pickRandom(random, ENDINGS),
  };
}

function scoreRoutine(
  routine: PbaDanceRoutine,
  random: () => number,
): Pick<
  PbaDanceContestTeamResult,
  'entertainment' | 'synchronization' | 'creativity' | 'crowdAppeal' | 'finalScore'
> {
  let entertainment = randomInt(random, 65, 99);
  let synchronization = randomInt(random, 55, 98);
  let creativity = randomInt(random, 60, 99);
  let crowdAppeal = randomInt(random, 65, 100);

  if (routine.style === 'Novelty' || routine.style === 'Awkward') entertainment += 5;
  if (routine.style === 'Synchronized') synchronization += 7;
  if (routine.style === 'Basketball') creativity += 5;
  if (routine.style === 'Viral Dance' || routine.mood === 'Hype') crowdAppeal += 6;

  entertainment = Math.min(100, entertainment);
  synchronization = Math.min(100, synchronization);
  creativity = Math.min(100, creativity);
  crowdAppeal = Math.min(100, crowdAppeal);

  return {
    entertainment,
    synchronization,
    creativity,
    crowdAppeal,
    finalScore: Number((
      entertainment * 0.35
      + synchronization * 0.3
      + creativity * 0.2
      + crowdAppeal * 0.15
    ).toFixed(1)),
  };
}

export function simulatePbaDanceContest(
  roster: readonly AllStarPlayer[],
  random: () => number = Math.random,
): PbaDanceContestResult | undefined {
  const contestTeams = buildPbaDanceContestTeams(roster);
  if (contestTeams.length !== 2) return undefined;

  const teams = contestTeams.map(team => {
    const routine = generateRoutine(random);
    return {
      teamId: team.teamId,
      label: team.label,
      captainId: team.captainId,
      captainName: team.captainName,
      playerIds: team.players.map(player => player.playerId),
      playerNames: team.players.map(player => player.playerName),
      routine,
      ...scoreRoutine(routine, random),
    };
  });

  let winner = teams[0];
  if (teams[1].finalScore > teams[0].finalScore) winner = teams[1];
  if (teams[1].finalScore === teams[0].finalScore && random() >= 0.5) winner = teams[1];

  return {
    teams,
    winnerTeamId: winner.teamId,
    winnerLabel: winner.label,
    complete: true,
  };
}

export type DanceContestResult = PbaDanceContestResult;
export type DanceContestTeamResult = PbaDanceContestTeamResult;
export const buildDanceContestTeams = buildPbaDanceContestTeams;
export const simulateDanceContest = simulatePbaDanceContest;

export function getDanceContestWinners(result?: PbaDanceContestResult): Array<{ playerId?: string; playerName?: string }> {
  const winner = result?.teams.find(team => team.teamId === result.winnerTeamId);
  return (winner?.playerIds ?? []).map((playerId, index) => ({
    playerId,
    playerName: winner?.playerNames[index],
  }));
}
