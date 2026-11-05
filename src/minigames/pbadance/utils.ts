import { DanceStyle, SongMood, Formation, Ending, Routine, Scores, Pose } from './types';

export const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
export const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const STYLES: DanceStyle[] = ['Synchronized', 'Hip-Hop', 'Novelty', 'Awkward', 'Energetic', 'Captain Solo', 'Basketball', 'Viral Dance'];
const MOODS: SongMood[] = ['Hype', 'Chill', 'Intense', 'Goofy', 'Epic'];
export const FORMATIONS: Formation[] = [
  'V-Shape', 'Circle', 'Lines', 'Diamond', 'Scattered',
  'Arrowhead', 'Staggered', 'W-Shape', 'Box-Grid', 'Starburst',
  'Pyramid', 'ZigZag', 'Semicircle'
];

export const getFormationStyles = (formation: Formation, i: number, isCaptain: boolean = false) => {
  let x = 0; let y = 0;
  
  switch (formation) {
    case 'V-Shape': {
      const vCoords = [
        {x: 0, y: 100}, {x: -60, y: 50}, {x: 60, y: 50}, 
        {x: -120, y: 0}, {x: 120, y: 0}, {x: -180, y: -50}, 
        {x: 180, y: -50}, {x: -240, y: -100}, {x: 240, y: -100},
        {x: -300, y: -150}, {x: 300, y: -150}, {x: 0, y: -50}
      ];
      x = vCoords[i%12].x; y = vCoords[i%12].y;
      break;
    }
    case 'Circle': {
      const angle = (i * 360) / 12;
      const rad = angle * Math.PI / 180;
      x = Math.cos(rad) * 170; y = Math.sin(rad) * 120;
      break;
    }
    case 'Lines': {
      const row = Math.floor(i / 6);
      const col = i % 6;
      x = -200 + (col * 80);
      y = row === 0 ? -60 : 60;
      break;
    }
    case 'Diamond': {
      const dCoords = [
        {x: 0, y: 120}, 
        {x: -70, y: 60}, {x: 70, y: 60}, 
        {x: -140, y: 0}, {x: 0, y: 0}, {x: 140, y: 0},
        {x: -210, y: -60}, {x: -70, y: -60}, {x: 70, y: -60}, {x: 210, y: -60},
        {x: -70, y: -120}, {x: 70, y: -120}
      ];
      x = dCoords[i%12].x; y = dCoords[i%12].y;
      break;
    }
    case 'Scattered': {
      const sCoords = [
        {x: 0, y: 100}, {x: -160, y: 70}, {x: 140, y: 90},
        {x: -80, y: 30}, {x: 80, y: 20}, {x: -220, y: 0},
        {x: 180, y: -20}, {x: -120, y: -60}, {x: 110, y: -50},
        {x: 0, y: -70}, {x: -180, y: -110}, {x: 160, y: -100}
      ];
      x = sCoords[i%12].x; y = sCoords[i%12].y;
      break;
    }
    case 'Arrowhead': {
      const aCoords = [
        {x: 0, y: 130}, {x: -50, y: 70}, {x: 50, y: 70},
        {x: -100, y: 10}, {x: 0, y: 20}, {x: 100, y: 10},
        {x: -150, y: -50}, {x: 150, y: -50}, {x: -200, y: -110},
        {x: -80, y: -80}, {x: 80, y: -80}, {x: 200, y: -110}
      ];
      x = aCoords[i%12].x; y = aCoords[i%12].y;
      break;
    }
    case 'Staggered': {
      const col = i % 4;
      const row = Math.floor(i / 4);
      x = -180 + col * 120;
      y = -90 + row * 80 + (col % 2 === 0 ? 30 : -30);
      break;
    }
    case 'W-Shape': {
      const wCoords = [
        {x: -240, y: 80}, {x: -180, y: -20}, {x: -120, y: -100},
        {x: -60, y: -20}, {x: 0, y: 80}, {x: 60, y: -20},
        {x: 120, y: -100}, {x: 180, y: -20}, {x: 240, y: 80},
        {x: -100, y: 30}, {x: 100, y: 30}, {x: 0, y: -40}
      ];
      x = wCoords[i%12].x; y = wCoords[i%12].y;
      break;
    }
    case 'Box-Grid': {
      const row = Math.floor(i / 4);
      const col = i % 4;
      x = -180 + col * 120;
      y = -100 + row * 100;
      break;
    }
    case 'Starburst': {
      const starAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
      const rad = (starAngles[i % 12] * Math.PI) / 180;
      const dist = (i % 2 === 0) ? 200 : 95;
      x = Math.cos(rad) * dist;
      y = Math.sin(rad) * (dist * 0.7);
      break;
    }
    case 'Pyramid': {
      const pCoords = [
        {x: 0, y: 120},
        {x: -60, y: 40}, {x: 60, y: 40},
        {x: -120, y: -40}, {x: 0, y: -40}, {x: 120, y: -40},
        {x: -180, y: -120}, {x: -90, y: -120}, {x: 0, y: -120}, {x: 90, y: -120}, {x: 180, y: -120},
        {x: 0, y: 40}
      ];
      x = pCoords[i%12].x; y = pCoords[i%12].y;
      break;
    }
    case 'ZigZag': {
      const zCoords = [
        {x: -240, y: 100}, {x: -160, y: 20}, {x: -80, y: 100},
        {x: 0, y: 20}, {x: 80, y: 100}, {x: 160, y: 20},
        {x: 240, y: 100}, {x: -200, y: -80}, {x: -100, y: -140},
        {x: 0, y: -80}, {x: 100, y: -140}, {x: 200, y: -80}
      ];
      x = zCoords[i%12].x; y = zCoords[i%12].y;
      break;
    }
    case 'Semicircle': {
      const semiAngle = 180 + (i * 180) / 11;
      const rad = (semiAngle * Math.PI) / 180;
      x = Math.cos(rad) * 220;
      y = Math.sin(rad) * 140;
      break;
    }
    default:
      x = 0; y = 0;
  }
  
  if (isCaptain) {
    y += 25; 
  }
  
  return { x, y };
};

/**
 * Formation Proximity Database Calculator:
 * Selects a sequence of formations where each subsequent shape minimizes
 * total Euclidean displacement distance across all 12 players.
 */
export const getProximityFormationSequence = (count = 4): Formation[] => {
  const available = [...FORMATIONS];
  const first = pickRandom(available);
  const sequence: Formation[] = [first];
  available.splice(available.indexOf(first), 1);

  while (sequence.length < count && available.length > 0) {
    const last = sequence[sequence.length - 1];
    let minSquareDist = Infinity;
    let closestFormation = available[0];

    for (const candidate of available) {
      let sumDist = 0;
      for (let i = 0; i < 12; i++) {
        const posA = getFormationStyles(last, i, false);
        const posB = getFormationStyles(candidate, i, false);
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        sumDist += (dx * dx + dy * dy);
      }
      if (sumDist < minSquareDist) {
        minSquareDist = sumDist;
        closestFormation = candidate;
      }
    }

    sequence.push(closestFormation);
    available.splice(available.indexOf(closestFormation), 1);
  }

  return sequence;
};
const ENDINGS: Ending[] = ['Pose', 'Point to Sky', 'High Five', 'Bow', 'Kneel'];

export const defPose: Pose = {
  rootX: 0, rootY: 0, rootRot: 0, torsoRot: 0, headX: 0, headY: 0, headRot: 0,
  armLRot: 0, lArmLRot: 0, armRRot: 0, lArmRRot: 0,
  legLRot: 0, lLegLRot: 0, legRRot: 0, lLegRRot: 0,
};

const P_NEUTRAL: Pose = { ...defPose };
const P_WIDE: Pose = { ...defPose, legLRot: -30, legRRot: 30, rootY: 10 };
const P_ARMS_UP: Pose = { ...defPose, armLRot: 150, armRRot: -150, rootY: -10, legLRot: -10, legRRot: 10 };
const P_DAB: Pose = { ...defPose, armLRot: -120, lArmLRot: -60, armRRot: -60, lArmRRot: 0, headRot: 30, legLRot: -20, legRRot: 20 };
const P_CROSS: Pose = { ...defPose, armLRot: -45, lArmLRot: -90, armRRot: 45, lArmRRot: 90, legLRot: -10, legRRot: 10 };
const P_SQUAT: Pose = { ...defPose, rootY: 30, legLRot: -45, lLegLRot: 45, legRRot: 45, lLegRRot: -45, armLRot: 20, armRRot: -20 };
const P_JUMP: Pose = { ...defPose, rootY: -30, legLRot: -10, legRRot: 10, armLRot: 120, armRRot: -120 };
const P_STEP_L: Pose = { ...defPose, rootX: -20, legLRot: -20, lLegLRot: 0, legRRot: 20, lLegRRot: 30, armLRot: -45, armRRot: 45 };
const P_STEP_R: Pose = { ...defPose, rootX: 20, legLRot: -20, lLegLRot: -30, legRRot: 20, lLegRRot: 0, armLRot: 45, armRRot: -45 };
const P_TWIST_L: Pose = { ...defPose, torsoRot: -20, armLRot: -60, armRRot: -90, legLRot: 15, legRRot: -15 };
const P_TWIST_R: Pose = { ...defPose, torsoRot: 20, armLRot: 90, armRRot: 60, legLRot: -15, legRRot: 15 };
const P_CHICKEN: Pose = { ...defPose, armLRot: 90, lArmLRot: -90, armRRot: -90, lArmRRot: 90, legLRot: -20, legRRot: 20, rootY: 10 };
const P_POINT: Pose = { ...defPose, armLRot: -135, lArmLRot: 0, armRRot: 45, headRot: -15, legLRot: -10, legRRot: 20 };
const P_SHOOT: Pose = { ...defPose, armLRot: 120, lArmLRot: 45, armRRot: 140, lArmRRot: 45, rootY: -15, legLRot: -10, legRRot: 10 };
const P_KNEEL: Pose = { ...defPose, rootY: 40, legLRot: -90, lLegLRot: 90, legRRot: 0, lLegRRot: 90, torsoRot: 10, headRot: 10 };

// Dynamic Poses
const P_RUN_1: Pose = { ...defPose, rootY: -10, armLRot: -60, lArmLRot: -90, armRRot: 60, lArmRRot: -90, legLRot: -60, lLegLRot: 90, legRRot: 30, lLegRRot: 0 };
const P_RUN_2: Pose = { ...defPose, rootY: -10, armLRot: 60, lArmLRot: -90, armRRot: -60, lArmRRot: -90, legLRot: 30, lLegLRot: 0, legRRot: -60, lLegRRot: 90 };
const P_WAVE: Pose = { ...defPose, armLRot: -160, lArmLRot: -30, armRRot: 20, legLRot: -10, legRRot: 10, headRot: -10 };
const P_WAVE_2: Pose = { ...defPose, armLRot: -140, lArmLRot: 30, armRRot: 20, legLRot: -10, legRRot: 10, headRot: -10 };
const P_TILT_L: Pose = { ...defPose, rootX: -15, rootRot: -15, torsoRot: -10, armLRot: -20, armRRot: -160, legLRot: -20, legRRot: 10 };
const P_TILT_R: Pose = { ...defPose, rootX: 15, rootRot: 15, torsoRot: 10, armLRot: 160, armRRot: 20, legLRot: -10, legRRot: 20 };
const P_LUNGE_L: Pose = { ...defPose, rootX: -20, rootY: 20, legLRot: -60, lLegLRot: 60, legRRot: 30, lLegRRot: 0, armLRot: -90, armRRot: 45 };
const P_LUNGE_R: Pose = { ...defPose, rootX: 20, rootY: 20, legLRot: -30, lLegLRot: 0, legRRot: 60, lLegRRot: -60, armLRot: -45, armRRot: 90 };
const P_GROOVE_1: Pose = { ...defPose, rootY: 10, torsoRot: -15, legLRot: -20, lLegLRot: 20, legRRot: 20, armLRot: -80, lArmLRot: -45, armRRot: 30 };
const P_GROOVE_2: Pose = { ...defPose, rootY: 10, torsoRot: 15, legLRot: -20, legRRot: 20, lLegRRot: 20, armLRot: -30, armRRot: 80, lArmRRot: 45 };

// Basketball & High-Energy Dance Moves
const P_DRIBBLE_L: Pose = { ...defPose, rootY: 20, torsoRot: -15, legLRot: -40, lLegLRot: 30, legRRot: 30, armLRot: -110, lArmLRot: 60, armRRot: 30 };
const P_DRIBBLE_R: Pose = { ...defPose, rootY: 20, torsoRot: 15, legLRot: -30, legRRot: 40, lLegRRot: -30, armLRot: -30, armRRot: 110, lArmRRot: -60 };
const P_CROSSOVER: Pose = { ...defPose, rootY: 25, rootX: 10, torsoRot: -25, legLRot: -50, legRRot: 50, armLRot: -40, armRRot: -120, headRot: 15 };
const P_DUNKING: Pose = { ...defPose, rootY: -45, armLRot: 170, lArmLRot: 20, armRRot: 150, legLRot: -30, legRRot: 40, lLegRRot: 45 };
const P_EUROSTEP: Pose = { ...defPose, rootX: 30, rootY: -15, legLRot: 40, lLegLRot: -40, legRRot: -60, lLegRRot: 20, armLRot: -100, armRRot: 130 };
const P_BLOCK: Pose = { ...defPose, rootY: -20, armLRot: 180, armRRot: -180, legLRot: -15, legRRot: 15, headRot: -10 };
const P_THREE_POINTER: Pose = { ...defPose, rootY: -35, armLRot: 160, lArmLRot: 80, armRRot: 170, lArmRRot: 40, legLRot: -15, legRRot: 15 };

const P_MOONWALK_L: Pose = { ...defPose, rootX: -30, legLRot: 30, lLegLRot: 30, legRRot: -40, armLRot: 45, armRRot: -45, torsoRot: -10 };
const P_MOONWALK_R: Pose = { ...defPose, rootX: 30, legLRot: -40, legRRot: 30, lLegRRot: 30, armLRot: -45, armRRot: 45, torsoRot: 10 };
const P_BREAKDANCE: Pose = { ...defPose, rootY: 45, rootRot: -30, torsoRot: 20, legLRot: -80, lLegLRot: 90, legRRot: 60, lLegRRot: -40, armLRot: -110, armRRot: 90 };
const P_ROBOT_1: Pose = { ...defPose, torsoRot: 0, armLRot: -90, lArmLRot: 90, armRRot: 0, lArmRRot: -90, headRot: 20, legLRot: 0, legRRot: 20 };
const P_ROBOT_2: Pose = { ...defPose, torsoRot: 0, armLRot: 0, lArmLRot: -90, armRRot: 90, lArmRRot: 90, headRot: -20, legLRot: -20, legRRot: 0 };
const P_SHUFFLE_L: Pose = { ...defPose, rootX: -25, rootY: 15, legLRot: -45, lLegLRot: 15, legRRot: 45, lLegRRot: -15, armLRot: -120, armRRot: 60 };
const P_SHUFFLE_R: Pose = { ...defPose, rootX: 25, rootY: 15, legLRot: 45, lLegLRot: -15, legRRot: -45, lLegRRot: 15, armLRot: 60, armRRot: -120 };
const P_BODY_WAVE_1: Pose = { ...defPose, torsoRot: -25, headX: 10, headY: -5, armLRot: -30, armRRot: -150, legLRot: -10, legRRot: 10 };
const P_BODY_WAVE_2: Pose = { ...defPose, torsoRot: 25, headX: -10, headY: 5, armLRot: 150, armRRot: 30, legLRot: -10, legRRot: 10 };
const P_SPIN_1: Pose = { ...defPose, rootRot: -45, torsoRot: -30, armLRot: -120, armRRot: -120, legLRot: -20, legRRot: 20 };
const P_SPIN_2: Pose = { ...defPose, rootRot: 45, torsoRot: 30, armLRot: 120, armRRot: 120, legLRot: 20, legRRot: -20 };

const generatePoseSequence = (): Pose[] => {
  const stepBlocks = [
    [P_STEP_L, P_STEP_R, P_STEP_L, P_STEP_R],
    [P_SQUAT, P_JUMP, P_SQUAT, P_JUMP],
    [P_TWIST_L, P_TWIST_R, P_TWIST_L, P_TWIST_R],
    [P_CHICKEN, P_WIDE, P_CHICKEN, P_WIDE],
    [P_DAB, P_CROSS, P_DAB, P_CROSS],
    [P_ARMS_UP, P_POINT, P_ARMS_UP, P_POINT],
    [P_SHOOT, P_SQUAT, P_SHOOT, P_SQUAT],
    [P_RUN_1, P_RUN_2, P_RUN_1, P_RUN_2],
    [P_WAVE, P_WAVE_2, P_WAVE, P_WAVE_2],
    [P_TILT_L, P_TILT_R, P_TILT_L, P_TILT_R],
    [P_LUNGE_L, P_LUNGE_R, P_LUNGE_L, P_LUNGE_R],
    [P_GROOVE_1, P_GROOVE_2, P_GROOVE_1, P_GROOVE_2],
    [P_DRIBBLE_L, P_DRIBBLE_R, P_CROSSOVER, P_SHOOT],
    [P_DUNKING, P_EUROSTEP, P_BLOCK, P_THREE_POINTER],
    [P_MOONWALK_L, P_MOONWALK_R, P_SHUFFLE_L, P_SHUFFLE_R],
    [P_BREAKDANCE, P_SQUAT, P_JUMP, P_BREAKDANCE],
    [P_ROBOT_1, P_ROBOT_2, P_ROBOT_1, P_ROBOT_2],
    [P_BODY_WAVE_1, P_BODY_WAVE_2, P_BODY_WAVE_1, P_BODY_WAVE_2],
    [P_SPIN_1, P_SPIN_2, P_SPIN_1, P_SPIN_2]
  ];
  
  const endingPoses = [P_DAB, P_ARMS_UP, P_CROSS, P_POINT, P_KNEEL];

  const sequence: Pose[] = [];
  for (let i = 0; i < 12; i++) {
    const block = pickRandom(stepBlocks);
    sequence.push(...block);
  }
  
  // Last 8 beats: an ending pose holding to stabilize at the end
  const endPose = pickRandom(endingPoses);
  sequence.push(endPose, endPose, endPose, endPose, endPose, endPose, endPose, endPose);
  
  return sequence;
};

export const generateRoutine = (): Routine => {
  const style = pickRandom(STYLES);
  const ending = pickRandom(ENDINGS);
  const mood = pickRandom(MOODS);
  
  // Pick 4 distinct formations sorted by spatial proximity to minimize displacement jump
  const formationSequence = getProximityFormationSequence(4);
  const formation = formationSequence[0];
  
  return {
    style,
    mood,
    formation,
    formationSequence,
    ending,
    players: [],
    poseSequence: generatePoseSequence()
  };
};

export const generateScores = (routine: Routine): Scores => {
  let entertainment = randomInt(65, 99);
  let synchronization = randomInt(55, 98);
  let creativity = randomInt(60, 99);
  let crowdAppeal = randomInt(65, 100);
  
  // Apply modifiers
  if (routine.style === 'Novelty' || routine.style === 'Awkward') {
    entertainment += 5;
  }
  if (routine.style === 'Synchronized') {
    synchronization += 7;
  }
  if (routine.style === 'Basketball') {
    creativity += 5;
  }
  if (routine.style === 'Viral Dance' || routine.mood === 'Hype') {
    crowdAppeal += 6;
  }
  
  // Clamp
  entertainment = Math.min(100, entertainment);
  synchronization = Math.min(100, synchronization);
  creativity = Math.min(100, creativity);
  crowdAppeal = Math.min(100, crowdAppeal);
  
  const finalScore = 
    entertainment * 0.35 +
    synchronization * 0.30 +
    creativity * 0.20 +
    crowdAppeal * 0.15;
    
  return {
    entertainment,
    synchronization,
    creativity,
    crowdAppeal,
    finalScore: Number(finalScore.toFixed(1))
  };
};
