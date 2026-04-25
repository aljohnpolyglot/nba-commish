import { fetchWithCache } from '../services/utils/fetchWithCache';

const GIST_URL =
  'https://gist.githubusercontent.com/aljohnpolyglot/10016f0800ee9b57420c4c74ad9060e3/raw/f6f4fbb0024f37e08f823379577ca2d0ae77abe4/NBA2k26_Ratings';

let teamsCache: any[] | null = null;

export async function loadRatings(): Promise<void> {
  if (teamsCache) return;
  const data = await fetchWithCache<any[]>('nba2k-ratings', GIST_URL);
  teamsCache = data ?? [];
  if (data) console.log('[NBA2kRatings] ✅ Ratings loaded successfully!');
  else console.warn('[NBA2kRatings] ❌ Failed to load ratings — using empty cache');
}

/** Returns the raw teams array (each team has a .roster array with .name and .attributes). */
export function getRawTeams(): any[] {
  return teamsCache ?? [];
}

// Maps 2K gist attribute names (after stripping modifiers) to K2 (category, subIndex)
const GIST_TO_K2: Record<string, { cat: string; idx: number }> = {
  // Outside Scoring
  'Close Shot':              { cat: 'OS', idx: 0 },
  'Mid-Range Shot':          { cat: 'OS', idx: 1 },
  'Three-Point Shot':        { cat: 'OS', idx: 2 },
  'Free Throw':              { cat: 'OS', idx: 3 },
  'Shot IQ':                 { cat: 'OS', idx: 4 },
  'Offensive Consistency':   { cat: 'OS', idx: 5 },
  // Athleticism
  'Speed':                   { cat: 'AT', idx: 0 },
  'Agility':                 { cat: 'AT', idx: 1 },
  'Strength':                { cat: 'AT', idx: 2 },
  'Vertical':                { cat: 'AT', idx: 3 },
  'Stamina':                 { cat: 'AT', idx: 4 },
  'Hustle':                  { cat: 'AT', idx: 5 },
  'Durability':              { cat: 'AT', idx: 6 },
  // Inside Scoring
  'Layup':                   { cat: 'IS', idx: 0 },
  'Standing Dunk':           { cat: 'IS', idx: 1 },
  'Driving Dunk':            { cat: 'IS', idx: 2 },
  'Post Hook':               { cat: 'IS', idx: 3 },
  'Post Fade':               { cat: 'IS', idx: 4 },
  'Post Control':            { cat: 'IS', idx: 5 },
  'Draw Foul':               { cat: 'IS', idx: 6 },
  'Hands':                   { cat: 'IS', idx: 7 },
  // Playmaking
  'Pass Accuracy':           { cat: 'PL', idx: 0 },
  'Ball Handle':             { cat: 'PL', idx: 1 },
  'Speed With Ball':         { cat: 'PL', idx: 2 },
  'Pass IQ':                 { cat: 'PL', idx: 3 },
  'Pass Vision':             { cat: 'PL', idx: 4 },
  // Defense
  'Interior Defense':        { cat: 'DF', idx: 0 },
  'Perimeter Defense':       { cat: 'DF', idx: 1 },
  'Steal':                   { cat: 'DF', idx: 2 },
  'Block':                   { cat: 'DF', idx: 3 },
  'Help Defense IQ':         { cat: 'DF', idx: 4 },
  'Pass Perception':         { cat: 'DF', idx: 5 },
  'Defensive Consistency':   { cat: 'DF', idx: 6 },
  // Rebounding
  'Offensive Rebound':       { cat: 'RB', idx: 0 },
  'Defensive Rebound':       { cat: 'RB', idx: 1 },
};

/**
 * Returns a map of K2 category → sub-attribute array (25-99) for a given player,
 * pulled from the real 2K gist data. Returns null if player not found or data not loaded.
 * Only entries where the gist has a real value are populated; missing slots are null.
 */
export function getPlayerRealK2(playerName: string): Record<string, (number | null)[]> | null {
  const teams = teamsCache;
  if (!teams || teams.length === 0) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const normTarget = norm(playerName);

  for (const team of teams) {
    if (!team.roster) continue;
    for (const p of team.roster) {
      if (norm(p.name) !== normTarget) continue;

      // Player found — map their attributes
      const result: Record<string, (number | null)[]> = {
        OS: Array(6).fill(null),
        AT: Array(7).fill(null),
        IS: Array(8).fill(null),
        PL: Array(5).fill(null),
        DF: Array(7).fill(null),
        RB: Array(2).fill(null),
      };

      for (const attrs of Object.values(p.attributes || {})) {
        for (const [rawKey, val] of Object.entries(attrs as Record<string, any>)) {
          const cleanKey = rawKey.replace(/^[+-]\d+\s+/, '').trim();
          const mapping = GIST_TO_K2[cleanKey];
          if (mapping) {
            const num = parseInt(val as string, 10);
            if (!isNaN(num)) result[mapping.cat][mapping.idx] = num;
          }
        }
      }

      return result;
    }
  }
  return null;
}
