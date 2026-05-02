export const TRAINING_SYSTEM_MAPPING: Record<string, string[]> = {
  offense: ['ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'drb', 'pss', 'drivingDunk', 'standingDunk'],
  defense: ['diq', 'reb'],
  conditioning: ['endu', 'stre', 'spd', 'jmp'],
  recovery: []
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  hgt: 'Physicals',
  stre: 'Strength',
  spd: 'Speed & Agility',
  jmp: 'Verticality',
  endu: 'Conditioning',
  ins: 'Inside Scoring',
  dnk: 'Contact Finishing',
  ft: 'Free Throw',
  fg: 'Mid-Range',
  tp: 'Three-Point',
  oiq: 'Offensive IQ',
  diq: 'Defensive IQ',
  drb: 'Ball Handling',
  pss: 'Passing',
  reb: 'Rebounding',
  drivingDunk: 'Driving Dunk',
  standingDunk: 'Standing Dunk'
};

export const getK2SubAttributes = (bbgmAttr: string, archetype: string = ''): string[] => {
  const isBig = archetype.includes('Post') || archetype.includes('Big') || archetype.includes('Center') || archetype.includes('Anchor') || archetype.includes('Bruiser') || archetype.includes('Interior') || archetype.includes('Glass');
  const isPlaymaker = archetype.includes('Playmaker') || archetype.includes('Guard') || archetype.includes('Point') || archetype.includes('Hub') || archetype.includes('General') || archetype.includes('Creator') || archetype.includes('Maestro') || archetype.includes('Professor');

  switch (bbgmAttr) {
    case 'hgt': return [];
    case 'stre': return ['Strength'];
    case 'spd': return ['Speed', 'Acceleration'];
    case 'jmp': return ['Vertical'];
    case 'endu': return ['Stamina', 'Hustle'];
    case 'ins': 
      if (isBig) return ['Close Shot', 'Post Hook', 'Post Fade', 'Post Control'];
      return ['Close Shot', 'Driving Layup'];
    case 'dnk': return ['Driving Dunk', 'Standing Dunk'];
    case 'ft': return ['Free Throw', 'Draw Foul'];
    case 'fg': return ['Mid-Range Shot', 'Shot IQ'];
    case 'tp': return ['Three-Point Shot', 'Offensive Consistency'];
    case 'oiq': 
      if (isPlaymaker) return ['Offensive Consistency', 'Pass Vision'];
      return ['Offensive Awareness'];
    case 'diq': 
      if (isBig) return ['Interior Defense', 'Block', 'Help Defense IQ'];
      return ['Perimeter Defense', 'Lateral Quickness', 'Pass Perception'];
    case 'drb': return ['Ball Handle', 'Speed with Ball'];
    case 'pss': return ['Pass Accuracy', 'Pass IQ'];
    case 'reb': return ['Offensive Rebound', 'Defensive Rebound'];
    case 'drivingDunk': return ['Driving Dunk'];
    case 'standingDunk': return ['Standing Dunk'];
    default: return [bbgmAttr];
  }
};
