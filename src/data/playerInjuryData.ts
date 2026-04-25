/**
 * playerInjuryData.ts
 *
 * Fetches real NBA player career injury history from GitHub at app startup.
 * Same runtime-fetch pattern as statmuseImages.ts / charaniaphotos.ts.
 *
 * Data shape per player:
 *   { player_name, team, career_injury_count, injury_breakdown: { bodyPart: count } }
 *
 * Consumed by InjurySystem.ts for:
 *  1. Injury RATE    — career_injury_count / yearsPro vs league average
 *  2. Body part bias — weighted random from injury_breakdown
 *  3. BMI + 2K speed wear — shifts lower-body weight for heavy explosive players
 *
 * Zion / Embiid: high BMI + high 2K speed → extra lower-body wear
 * Jokic:         high BMI + low  2K speed → wear mostly cancels out (stays durable)
 */

import { getRawTeams } from './NBA2kRatings';
import { fetchWithCache } from '../services/utils/fetchWithCache';

const PLAYER_INJURY_URL =
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbainjuriesdata';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayerInjuryEntry {
  player_name: string;        // raw from gist, e.g. "ANTHONY DAVIS   INJURIES"
  team: string;
  career_injury_count: number;
  injury_breakdown: Record<string, number>; // e.g. { "foot": 55, "ankle": 28, ... }
}

export interface PlayerInjuryProfile {
  careerCount: number;
  /** Canonical body-part → total count map (normalized, duplicates merged) */
  bodyParts: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────

let _raw: PlayerInjuryEntry[] = [];
/** normalizedName → profile */
const _profileMap = new Map<string, PlayerInjuryProfile>();
/** normalizedName → { speed, acceleration } from 2K gist */
let _athleticismMap: Map<string, { speed: number; accel: number }> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/** Strip " INJURIES", accents, punctuation → lowercase for fuzzy name match */
function normName(raw: string): string {
  return raw
    .replace(/\s+INJURIES\s*/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Collapse messy gist body-part keys ("right calf", "sore right shoulder",
 * "bluteus maximus", "strained left groin") into canonical buckets.
 * Returns null for non-physical entries (illness, personal, rest).
 */
export function normalizeBodyPart(raw: string): string | null {
  const s = raw.toLowerCase();
  if (s.includes('achilles') || s.includes('heel'))           return 'achilles';
  if (s.includes('knee') || s.includes('patellar') || s.includes('meniscus')) return 'knee';
  if (s.includes('ankle'))                                     return 'ankle';
  if (s.includes('foot') || s.includes('feet') || s.includes('plantar') || s.includes('toe')) return 'foot';
  if (s.includes('hamstring') || s.includes('thigh'))          return 'hamstring';
  if (s.includes('groin') || s.includes('adductor') || s.includes('abductor')) return 'groin';
  if (s.includes('calf'))                                      return 'calf';
  if (s.includes('shoulder') || s.includes('rotator'))         return 'shoulder';
  if (s.includes('back') || s.includes('lumbar') || s.includes('spine') || s.includes('neck') || s.includes('cervical')) return 'back';
  if (s.includes('hip') || s.includes('pelvis') || s.includes('glute') || s.includes('gluteus')) return 'hip';
  if (s.includes('quad'))                                      return 'quad';
  if (s.includes('finger') || s.includes('thumb'))             return 'finger';
  if (s.includes('hand'))                                      return 'hand';
  if (s.includes('wrist'))                                     return 'wrist';
  if (s.includes('elbow') || s.includes('triceps') || s.includes('bicep')) return 'elbow';
  if (s.includes('eye') || s.includes('orbital') || s.includes('eyelid')) return 'eye';
  if (s.includes('head') || s.includes('concussion') || s.includes('stinger')) return 'head';
  if (s.includes('rib') || s.includes('intercostal') || s.includes('chest')) return 'rib';
  if (s.includes('leg'))                                       return 'knee'; // generic leg → knee bucket
  if (s.includes('abdom') || s.includes('hernia'))             return 'groin';
  // Non-physical entries — skip
  if (s.includes('illness') || s.includes('personal') || s.includes('rest') || s.includes('trade')) return null;
  return null; // truly unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export const fetchPlayerInjuryData = async (): Promise<void> => {
  const data = await fetchWithCache<PlayerInjuryEntry[]>('player-injury-data', PLAYER_INJURY_URL);
  if (data) {
    _raw = data;
    _buildProfileMap();
    console.log(`[PlayerInjuryData] Loaded ${_profileMap.size} player profiles.`);
  }
};

function _buildProfileMap() {
  _profileMap.clear();
  for (const entry of _raw) {
    const key = normName(entry.player_name);
    // Merge canonical body-part counts
    const bodyParts: Record<string, number> = {};
    for (const [raw, count] of Object.entries(entry.injury_breakdown)) {
      const canonical = normalizeBodyPart(raw);
      if (!canonical) continue;
      bodyParts[canonical] = (bodyParts[canonical] ?? 0) + count;
    }
    _profileMap.set(key, {
      careerCount: entry.career_injury_count,
      bodyParts,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

/** Returns injury profile for a player. Tries last-name+first-initial match as fallback. */
export function getPlayerInjuryProfile(playerName: string): PlayerInjuryProfile | null {
  if (_profileMap.size === 0) return null;
  const key = normName(playerName);

  // Exact normalized match
  const exact = _profileMap.get(key);
  if (exact) return exact;

  // Fallback: last-name match (handles shortened/different first names)
  const parts  = key.split(' ');
  const last   = parts[parts.length - 1];
  const first0 = parts[0]?.[0];
  for (const [k, v] of _profileMap) {
    const kParts = k.split(' ');
    const kLast  = kParts[kParts.length - 1];
    if (kLast === last && kParts[0]?.[0] === first0) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATHLETICISM MAP  (speed + acceleration from 2K gist)
// Built lazily on first use — getRawTeams() is already loaded at startup
// ─────────────────────────────────────────────────────────────────────────────

function buildAthleticismMap(): Map<string, { speed: number; accel: number }> {
  const map = new Map<string, { speed: number; accel: number }>();
  for (const team of getRawTeams()) {
    for (const p of (team.roster ?? [])) {
      const athl = p.attributes?.Athleticism ?? {};
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(athl)) {
        clean[(k as string).replace(/^[+-]?\d+\s+/, '').trim()] =
          parseInt(String(v), 10) || 60;
      }
      const key = normName(p.name);
      map.set(key, {
        speed: clean['Speed'] ?? clean['Speed with Ball'] ?? 65,
        accel: clean['Acceleration'] ?? 65,
      });
    }
  }
  return map;
}

/** Speed + acceleration for a player (0-99 each). Falls back to pos-based estimate. */
export function get2KExplosiveness(
  playerName: string,
  pos?: string | null,
): { speed: number; accel: number } {
  if (!_athleticismMap) _athleticismMap = buildAthleticismMap();
  const key  = normName(playerName);
  const hit  = _athleticismMap.get(key);
  if (hit) return hit;
  // Positional fallback
  if (pos === 'PG' || pos === 'SG') return { speed: 78, accel: 78 };
  if (pos === 'SF')                  return { speed: 72, accel: 72 };
  if (pos === 'PF')                  return { speed: 65, accel: 65 };
  return { speed: 60, accel: 60 }; // C
}

// ─────────────────────────────────────────────────────────────────────────────
// BODY PART → INJURY TYPES  (maps canonical buckets to INJURIES[] names)
// ─────────────────────────────────────────────────────────────────────────────

export const BODY_PART_TO_INJURIES: Record<string, string[]> = {
  achilles:  ['Torn Achilles Tendon', 'Achilles Tendinitis'],
  knee:      ['Torn ACL', 'Torn Meniscus', 'Sprained Knee', 'Bone Bruise (Knee)', 'MCL Sprain', 'Patellar Tendinitis', 'Strained Patellar Tendon', 'Patellar Dislocation'],
  ankle:     ['Sprained Ankle', 'High Ankle Sprain', 'Fractured Ankle'],
  foot:      ['Stress Fracture (Foot)', 'Plantar Fasciitis', 'Sprained Foot', 'Jones Fracture', 'Bruised Foot', 'Strained Foot', 'Fractured Foot', 'Turf Toe', 'Sesamoiditis', 'Lisfranc Injury'],
  hamstring: ['Strained Hamstring', 'Hamstring Tendinopathy'],
  groin:     ['Strained Groin', 'Sports Hernia', 'Groin Tear (Grade 3)', 'Adductor Longus Tear', 'Osteitis Pubis'],
  calf:      ['Strained Calf', 'Peroneal Tendinitis'],
  shoulder:  ['Labrum Tear (Shoulder)', 'Strained Shoulder', 'Rotator Cuff Tendinitis', 'Strained Rotator Cuff', 'Sprained Shoulder', 'Bruised Shoulder'],
  back:      ['Back Spasms', 'Herniated Disc', 'Bruised Back', 'Strained Neck', 'Cervical Stinger'],
  hip:       ['Hip Labral Tear', 'Torn Labrum (Hip)', 'Hip Bursitis', 'Strained Hip Flexor', 'Hip Subluxation'],
  quad:      ['Bruised Quadriceps', 'Strained Quadriceps', 'Quadriceps Rupture'],
  finger:    ['Sprained Finger', 'Fractured Finger', 'Fractured Thumb', 'Sprained Thumb'],
  hand:      ['Fractured Hand', "Boxer's Fracture", 'Bruised Hand', 'Scaphoid Fracture'],
  wrist:     ['Sprained Wrist', 'UCL Sprain (Elbow)'],
  elbow:     ['Elbow Tendinitis', 'Sprained Elbow', 'Bruised Elbow', 'Triceps Tendon Rupture'],
  eye:       ['Bruised Eye', 'Lacerated Eyelid', 'Orbital Fracture'],
  head:      ['Concussion', 'Cervical Stinger'],
  rib:       ['Fractured Rib', 'Intercostal Strain', 'Pneumothorax'],
};
