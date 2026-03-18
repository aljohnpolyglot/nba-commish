const CELEBRITIES_GIST_URL = 
  'https://gist.githubusercontent.com/aljohnpolyglot/76b81ccb530160eb06d1e61949902c06/raw/4ae135d31e45d47cb8afb6e5f1b2a38ffb111241/celebrities_nba';

export interface RatedCelebrity {
  name: string;
  type: string;
  hgt: number;
  stre: number;
  spd: number;
  jmp: number;
  endu: number;
  ins: number;
  dnk: number;
  ft: number;
  fg: number;
  tp: number;
  diq: number;
  oiq: number;
  drb: number;
  pss: number;
  reb: number;
}

let cachedCelebrities: RatedCelebrity[] | null = null;

export const fetchRatedCelebrities = 
  async (): Promise<RatedCelebrity[]> => {
  if (cachedCelebrities) return cachedCelebrities;
  
  try {
    const response = await fetch(CELEBRITIES_GIST_URL);
    const data = await response.json();
    cachedCelebrities = data;
    return data;
  } catch (e) {
    console.error('Failed to fetch celebrity ratings:', e);
    return [];
  }
};

// Sync version for components that need
// the names only (modal priority list)
export const getRatedCelebrityNames = () => 
  cachedCelebrities ?? [];
