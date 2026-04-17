//note this already exist in main game delete it now cuz this is just duplicate but make sure and double check/

const GIST_URL =
  'https://gist.githubusercontent.com/aljohnpolyglot/10016f0800ee9b57420c4c74ad9060e3/raw/f6f4fbb0024f37e08f823379577ca2d0ae77abe4/NBA2k26_Ratings';

export interface PlayerAttributes {
  OS: number; // Outside Scoring
  IS: number; // Inside Scoring
  PL: number; // Playmaking
  DF: number; // Defense
  AT: number; // Athleticism
  RB: number; // Rebounding
  // Specific attributes for advanced formulas
  tp: number;
  oiq: number;
  hgt: number;
  stre: number;
  diq: number;
  jmp: number;
  spd: number;
  reb: number;
  pass: number;
  drb: number;
  ins: number;
  dnk: number;
  fg: number;
}

export interface Player {
  name: string;
  overall: number;
  position: string;
  age: number;
  contract: { amount: number; years: number };
  attributes: PlayerAttributes;
  stars: number;
  imgURL?: string;
  nbaId?: string;
}

export interface Team {
  name: string;
  roster: Player[];
}

let teamsCache: Team[] | null = null;

const GIST_TO_K2: Record<string, string> = {
  'Close Shot': 'IS', 'Mid-Range Shot': 'OS', 'Three-Point Shot': 'OS', 'Free Throw': 'OS', 'Shot IQ': 'OS', 'Offensive Consistency': 'OS',
  'Speed': 'AT', 'Agility': 'AT', 'Strength': 'AT', 'Vertical': 'AT', 'Stamina': 'AT', 'Hustle': 'AT', 'Durability': 'AT',
  'Layup': 'IS', 'Standing Dunk': 'IS', 'Driving Dunk': 'IS', 'Post Hook': 'IS', 'Post Fade': 'IS', 'Post Control': 'IS', 'Draw Foul': 'IS', 'Hands': 'IS',
  'Pass Accuracy': 'PL', 'Ball Handle': 'PL', 'Speed With Ball': 'PL', 'Pass IQ': 'PL', 'Pass Vision': 'PL',
  'Interior Defense': 'DF', 'Perimeter Defense': 'DF', 'Steal': 'DF', 'Block': 'DF', 'Help Defense IQ': 'DF', 'Pass Perception': 'DF', 'Defensive Consistency': 'DF',
  'Offensive Rebound': 'RB', 'Defensive Rebound': 'RB',
};

function parseAttributes(rawAttrs: any, overall: number, position: string): PlayerAttributes {
  const cats: Record<string, number[]> = { OS: [], IS: [], PL: [], DF: [], AT: [], RB: [] };
  const specific: Record<string, number> = {};
  
  if (rawAttrs) {
    for (const attrs of Object.values(rawAttrs)) {
      if (typeof attrs === 'object' && attrs !== null) {
        for (const [rawKey, val] of Object.entries(attrs)) {
          const cleanKey = rawKey.replace(/^[+-]\d+\s+/, '').trim();
          const cat = GIST_TO_K2[cleanKey];
          const num = parseInt(val as string, 10);
          if (!isNaN(num)) {
            if (cat) cats[cat].push(num);
            
            // Map specific attributes
            if (cleanKey === 'Three-Point Shot') specific.tp = num;
            if (cleanKey === 'Shot IQ' || cleanKey === 'Offensive Consistency') specific.oiq = num;
            if (cleanKey === 'Strength') specific.stre = num;
            if (cleanKey === 'Help Defense IQ') specific.diq = num;
            if (cleanKey === 'Vertical') specific.jmp = num;
            if (cleanKey === 'Speed') specific.spd = num;
            if (cleanKey === 'Defensive Rebound') specific.reb = num;
            if (cleanKey === 'Pass Accuracy') specific.pass = num;
            if (cleanKey === 'Ball Handle') specific.drb = num;
            if (cleanKey === 'Close Shot') specific.ins = num;
            if (cleanKey === 'Driving Dunk') specific.dnk = num;
            if (cleanKey === 'Mid-Range Shot') specific.fg = num;
          }
        }
      }
    }
  }

  const result: any = {};
  for (const [cat, vals] of Object.entries(cats)) {
    if (vals.length > 0) {
      result[cat] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    } else {
      // Fallback based on overall
      result[cat] = Math.max(40, overall - Math.floor(Math.random() * 15));
    }
  }

  // Mock height based on position
  const hgtMap: Record<string, number> = { 'PG': 40, 'SG': 50, 'SF': 60, 'PF': 70, 'C': 80 };
  const hgt = hgtMap[position] || 50;

  return {
    ...result,
    tp: specific.tp || overall,
    oiq: specific.oiq || overall,
    hgt,
    stre: specific.stre || overall,
    diq: specific.diq || overall,
    jmp: specific.jmp || overall,
    spd: specific.spd || overall,
    reb: specific.reb || overall,
    pass: specific.pass || overall,
    drb: specific.drb || overall,
    ins: specific.ins || overall,
    dnk: specific.dnk || overall,
    fg: specific.fg || overall,
  } as PlayerAttributes;
}

const ROSTER_URL = 'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2024-25.NBA.Roster.json';

export async function loadRatings(): Promise<Team[]> {
  if (teamsCache) return teamsCache;
  try {
    const [res, rosterRes] = await Promise.all([
      fetch(GIST_URL),
      fetch(ROSTER_URL).catch(() => null)
    ]);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    let bbgmPlayers = new Map<string, any>();
    if (rosterRes && rosterRes.ok) {
      const rosterData = await rosterRes.json();
      if (rosterData && rosterData.players) {
        rosterData.players.forEach((p: any) => {
          const name = p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
          if (name) {
            bbgmPlayers.set(name.toLowerCase(), p);
          }
        });
      }
    }
    
    teamsCache = data.map((team: any) => ({
      name: team.team || team.name || 'Unknown Team',
      roster: (team.roster || []).map((p: any) => {
        let overall = parseInt(p.overall || p.ovr || p.rating || '75', 10);
        if (isNaN(overall)) overall = 75;
        let stars = 1;
        if (overall >= 90) stars = 5;
        else if (overall >= 85) stars = 4;
        else if (overall >= 80) stars = 3;
        else if (overall >= 75) stars = 2;

        const bbgmPlayer = bbgmPlayers.get((p.name || '').toLowerCase());

        const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
        const position = bbgmPlayer?.pos || p.position || positions[Math.floor(Math.random() * positions.length)];
        
        const currentYear = new Date().getFullYear();
        const age = bbgmPlayer?.born?.year ? currentYear - bbgmPlayer.born.year : (p.age || Math.floor(Math.random() * 15) + 20);
        
        const contract = bbgmPlayer?.contract ? {
          amount: (bbgmPlayer.contract.amount || 0) * 1000,
          years: Math.max(1, (bbgmPlayer.contract.exp || currentYear + 1) - currentYear)
        } : (p.contract || {
          amount: Math.floor(Math.random() * 30000000) + 2000000,
          years: Math.floor(Math.random() * 4) + 1
        });

        let imgURL = bbgmPlayer?.imgURL;
        let nbaId;
        if (imgURL) {
          const match = imgURL.match(/\/(\d+)\.png/);
          if (match) {
            nbaId = match[1];
          }
        }

        const attributes = parseAttributes(p.attributes, overall, position);

        return {
          name: p.name,
          overall,
          stars,
          position,
          age,
          contract,
          attributes,
          imgURL,
          nbaId
        };
      })
    }));
    
    console.log('[NBA2kRatings] ✅ Ratings loaded successfully!');
    return teamsCache!;
  } catch (e) {
    console.error('[NBA2kRatings] ❌ Failed to load ratings:', e);
    return [];
  }
}

export function getTeams(): Team[] {
  return teamsCache || [];
}

