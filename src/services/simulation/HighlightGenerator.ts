/**
 * HighlightGenerator.ts — Phase 1
 *
 * Derives notable plays from box-score stats + NBA 2K attribute/badge data.
 * Called at the end of every _simulateGameOnce() in engine.ts.
 * Returns GameHighlight[] stored on GameResult.highlights.
 *
 * Phase 1: generate + store on GameResult only.
 * Phase 2 (future): social templates + live commentary consume highlights[].
 *
 * ── Dunk sub-types (driving / standing separated by 2K attribute) ─────────
 *  driving_dunk  → explosive attacking dunk ("Driving Dunk" attr ≥70)
 *                  can branch into: alley_oop (Aerial Wizard badge)
 *                                   fastbreak_dunk (team had steals)
 *                  can also spawn:  posterizer sub-event (Posterizer badge + victim stored)
 *  standing_dunk → post-catch / power dunk near basket ("Standing Dunk" attr ≥70)
 *                  NO posterize — Gobert dunking is not Zion dunking
 *
 * ── Layup / Fancy finish ─────────────────────────────────────────────────
 *  layup_mixmaster → rim FGM that wasn't a dunk (Layup Mixmaster badge)
 *                    euro step, reverse, scoop — no victim needed
 *
 * ── Passing highlights ───────────────────────────────────────────────────
 *  break_starter      → outlet pass off steal (Break Starter badge)
 *                       assisterId = finisher (receiver of the pass)
 *  versatile_visionary→ creative / cross-court assist (Versatile Visionary badge)
 *                       assisterId = recipient (top scorer on team)
 *
 * ── Scoring extras ───────────────────────────────────────────────────────
 *  ankle_breaker → mid / post make (Ankle Assassin badge) + perimeter victim
 *  limitless_3   → deep 3 made (Limitless Range badge)
 *
 * ── Cosmetics (stored, not yet surfaced in UI) ───────────────────────────
 *  tech_foul, timeout, coach_challenge
 */

import { PlayerGameStats, GameHighlight } from './types';
import { NBAPlayer as Player } from '../../types';
import { getBadgeProb } from '../../data/NBA2kBadges';
import { getRawTeams } from '../../data/NBA2kRatings';

// ─────────────────────────────────────────────────────────────────────────────
// DUNK RATING MAP  (built once per session from the 2K gist cache)
// ─────────────────────────────────────────────────────────────────────────────

interface DunkRatings {
  drivingDunk: number;
  standingDunk: number;
}

interface CachedBadgeProbs {
  aerialWizard: number;
  posterizer: number;
  layupMixmaster: number;
  limitlessRange: number;
  ankleAssassin: number;
  breakStarter: number;
  versatileVisionary: number;
}

let _dunkMapCache: Map<string, DunkRatings> | null = null;

function buildDunkMap(): Map<string, DunkRatings> {
  if (_dunkMapCache) return _dunkMapCache;
  const map = new Map<string, DunkRatings>();
  const teams = getRawTeams();
  for (const team of teams) {
    for (const p of (team.roster ?? [])) {
      const inside = p.attributes?.['Inside Scoring'] ?? {};
      const clean = (obj: Record<string, unknown>) => {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(obj)) {
          out[(k as string).replace(/^[+-]?\d+\s+/, '').trim()] = parseInt(String(v), 10) || 50;
        }
        return out;
      };
      const ci = clean(inside);
      map.set(norm(p.name), {
        drivingDunk:  ci['Driving Dunk']  ?? 50,
        standingDunk: ci['Standing Dunk'] ?? 50,
      });
    }
  }
  _dunkMapCache = map;
  return map;
}

/** Same normalization as DunkContestModal — strips non-alpha chars */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function getDunks(name: string, map: Map<string, DunkRatings>): DunkRatings {
  return map.get(norm(name)) ?? { drivingDunk: 50, standingDunk: 50 };
}

/** Probability a rim FGM was a DRIVING (explosive, attacking) dunk */
function drivingP(r: number) {
  if (r >= 90) return 0.55;
  if (r >= 85) return 0.38;
  if (r >= 80) return 0.22;
  if (r >= 70) return 0.10;
  return 0.04;
}

/** Probability a rim FGM was a STANDING (power / post-catch) dunk */
function standingP(r: number) {
  if (r >= 90) return 0.40;
  if (r >= 85) return 0.28;
  if (r >= 75) return 0.15;
  return 0.04;
}

function buildBadgeProbCache(stats: PlayerGameStats[]): Map<string, CachedBadgeProbs> {
  const cache = new Map<string, CachedBadgeProbs>();
  for (const player of stats) {
    cache.set(player.playerId, {
      aerialWizard: getBadgeProb(player.name, 'Aerial Wizard', 0.15),
      posterizer: getBadgeProb(player.name, 'Posterizer', 0.15),
      layupMixmaster: getBadgeProb(player.name, 'Layup Mixmaster', 0.15),
      limitlessRange: getBadgeProb(player.name, 'Limitless Range', 0.15),
      ankleAssassin: getBadgeProb(player.name, 'Ankle Assassin', 0.12),
      breakStarter: getBadgeProb(player.name, 'Break Starter', 0.20),
      versatileVisionary: getBadgeProb(player.name, 'Versatile Visionary', 0.12),
    });
  }
  return cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// VICTIM / CONNECTOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Rim-defending big (C/PF) from the opposing team — posterizer victim */
function pickRimDefender(oppStats: PlayerGameStats[], playerMap: Map<string, Player>) {
  const bigs = oppStats.filter(s => {
    const p = playerMap.get(s.playerId);
    return p && (p.pos === 'C' || p.pos === 'PF');
  });
  const pool = bigs.length > 0 ? bigs : oppStats;
  if (pool.length === 0) return null;
  const v = pool[Math.floor(Math.random() * pool.length)];
  return { playerId: v.playerId, playerName: v.name };
}

/** Perimeter player (G/wing) from the opposing team — ankle breaker victim */
function pickPerimeterDefender(oppStats: PlayerGameStats[], playerMap: Map<string, Player>) {
  const guards = oppStats.filter(s => {
    const p = playerMap.get(s.playerId);
    return p && (p.pos === 'PG' || p.pos === 'SG' || p.pos === 'SF' || p.pos === 'G');
  });
  const pool = guards.length > 0 ? guards : oppStats;
  if (pool.length === 0) return null;
  const v = pool[Math.floor(Math.random() * pool.length)];
  return { playerId: v.playerId, playerName: v.name };
}

/** Best assister on the same team (throws the lob) */
function buildTopLookup(
  stats: PlayerGameStats[],
  value: (stat: PlayerGameStats) => number,
): Map<string, PlayerGameStats | null> {
  const ranked = [...stats]
    .filter(stat => value(stat) > 0)
    .sort((a, b) => value(b) - value(a));
  const lookup = new Map<string, PlayerGameStats | null>();
  for (const stat of stats) {
    lookup.set(stat.playerId, ranked.find(candidate => candidate.playerId !== stat.playerId) ?? null);
  }
  return lookup;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

export class HighlightGenerator {
  static processGame(
    homeStats:  PlayerGameStats[],
    awayStats:  PlayerGameStats[],
    homeTeamId: number,
    awayTeamId: number,
    allPlayers: Player[],
  ): GameHighlight[] {
    const highlights: GameHighlight[] = [];
    const dunkMap = buildDunkMap();
    const playerMap = new Map(allPlayers.map(player => [player.internalId, player] as const));

    const sides = [
      { stats: homeStats, teamId: homeTeamId, oppStats: awayStats },
      { stats: awayStats, teamId: awayTeamId, oppStats: homeStats },
    ];

    for (const { stats, teamId, oppStats } of sides) {
      const teamStls = stats.reduce((sum, s) => sum + (s.stl ?? 0), 0);
      const totalPf  = stats.reduce((sum, s) => sum + (s.pf  ?? 0), 0);
      const badgeProbCache = buildBadgeProbCache(stats);
      const topAssisterByPlayer = buildTopLookup(stats, stat => stat.ast ?? 0);
      const breakStarterByPlayer = buildTopLookup(stats, stat => stat.stl ?? 0);
      const breakFinisherByPlayer = buildTopLookup(stats, stat => stat.fgAtRim ?? 0);
      const topScorerByPlayer = buildTopLookup(stats, stat => stat.pts ?? 0);

      for (const p of stats) {
        const rimFgm     = p.fgAtRim    ?? 0;
        const lowPostFgm = p.fgLowPost  ?? 0;
        const midFgm     = p.fgMidRange ?? 0;
        const threePm    = p.threePm    ?? 0;
        const badgeProbs = badgeProbCache.get(p.playerId);

        // ── RIM FINISHES (dunks, layups) ─────────────────────────────────
        if (rimFgm > 0) {
          const { drivingDunk, standingDunk } = getDunks(p.name, dunkMap);
          const dp = drivingP(drivingDunk);
          const sp = standingP(standingDunk);

          for (let i = 0; i < rimFgm; i++) {
            const roll = Math.random();

            if (roll < dp) {
              // ── DRIVING DUNK zone ─────────────────────────────────────
              // Priority: alley_oop > fastbreak_dunk > driving_dunk (regular)

              const aerialProb  = badgeProbs?.aerialWizard ?? 0;
              const isFastBreak = teamStls >= 3 && Math.random() < 0.12;
              const isAlleyOop  = aerialProb > 0 && Math.random() < aerialProb;

              if (isAlleyOop) {
                // ── Alley-oop: lob catch off teammate assist ───────────
                const passer = topAssisterByPlayer.get(p.playerId) ?? null;
                highlights.push({
                  type:         'alley_oop',
                  playerId:     p.playerId,
                  playerName:   p.name,
                  teamId,
                  assisterId:   passer?.playerId,
                  assisterName: passer?.name,
                });
                p.dunks = (p.dunks ?? 0) + 1;
                // Alley-oops CAN posterize (Vince Carter vs France)
                const posterProb = (badgeProbs?.posterizer ?? 0) * 0.55;
                if (posterProb > 0 && Math.random() < posterProb) {
                  const victim = pickRimDefender(oppStats, playerMap);
                  highlights.push({
                    type:        'posterizer',
                    playerId:    p.playerId,
                    playerName:  p.name,
                    teamId,
                    victimId:    victim?.playerId,
                    victimName:  victim?.playerName,
                  });
                }

              } else if (isFastBreak) {
                // ── Fast break dunk: transition finish ─────────────────
                // 35% chance the steal-er and finisher are the same player
                const selfFinish = (p.stl ?? 0) > 0 && Math.random() < 0.35;
                const starter    = selfFinish ? null : (breakStarterByPlayer.get(p.playerId) ?? null);
                highlights.push({
                  type:         'fastbreak_dunk',
                  playerId:     p.playerId,
                  playerName:   p.name,
                  teamId,
                  assisterId:   selfFinish ? p.playerId  : starter?.playerId,
                  assisterName: selfFinish ? p.name      : starter?.name,
                });
                p.dunks = (p.dunks ?? 0) + 1;

              } else {
                // ── Regular driving dunk ───────────────────────────────
                highlights.push({
                  type:       'driving_dunk',
                  playerId:   p.playerId,
                  playerName: p.name,
                  teamId,
                });
                p.dunks = (p.dunks ?? 0) + 1;
                // Posterizer sub-event: driving dunks only (not alley / fastbreak)
                const posterProb = badgeProbs?.posterizer ?? 0;
                if (posterProb > 0 && Math.random() < posterProb) {
                  const victim = pickRimDefender(oppStats, playerMap);
                  highlights.push({
                    type:        'posterizer',
                    playerId:    p.playerId,
                    playerName:  p.name,
                    teamId,
                    victimId:    victim?.playerId,
                    victimName:  victim?.playerName,
                  });
                }
              }

            } else if (roll < dp + sp) {
              // ── STANDING DUNK (power / post-catch) ───────────────────
              // No posterize, no alley-oop — just a power flush near the basket
              highlights.push({
                type:       'standing_dunk',
                playerId:   p.playerId,
                playerName: p.name,
                teamId,
              });
              p.dunks = (p.dunks ?? 0) + 1;

            } else {
              // ── LAYUP zone — Layup Mixmaster (euro step, reverse, scoop) ─
              const layupProb = badgeProbs?.layupMixmaster ?? 0;
              if (layupProb > 0 && Math.random() < layupProb) {
                highlights.push({
                  type:       'layup_mixmaster',
                  playerId:   p.playerId,
                  playerName: p.name,
                  teamId,
                });
              }
            }
          }
        }

        // ── LIMITLESS RANGE 3s ──────────────────────────────────────────
        if (threePm > 0) {
          const baseProb = badgeProbs?.limitlessRange ?? 0;
          if (baseProb > 0) {
            for (let i = 0; i < threePm; i++) {
              if (Math.random() < baseProb) {
                highlights.push({
                  type:       'limitless_3',
                  playerId:   p.playerId,
                  playerName: p.name,
                  teamId,
                  pts: 3,
                });
              }
            }
          }
        }

        // ── ANKLE BREAKERS (mid / post makes — dribble crossover breakdown) ─
        const nonRimMakes = midFgm + lowPostFgm;
        if (nonRimMakes > 0) {
          const baseProb = badgeProbs?.ankleAssassin ?? 0;
          if (baseProb > 0) {
            for (let i = 0; i < nonRimMakes; i++) {
              if (Math.random() < baseProb) {
                const victim = pickPerimeterDefender(oppStats, playerMap);
                highlights.push({
                  type:       'ankle_breaker',
                  playerId:   p.playerId,
                  playerName: p.name,
                  teamId,
                  victimId:   victim?.playerId,
                  victimName: victim?.playerName,
                });
              }
            }
          }
        }

        // ── BREAK STARTER (outlet pass off steal → transition) ──────────
        // Fires per steal; stores the break finisher (rim threat on team)
        if ((p.stl ?? 0) > 0) {
          const breakProb = badgeProbs?.breakStarter ?? 0;
          if (breakProb > 0) {
            for (let i = 0; i < (p.stl ?? 0); i++) {
              if (Math.random() < breakProb) {
                const finisher = breakFinisherByPlayer.get(p.playerId) ?? null;
                highlights.push({
                  type:         'break_starter',
                  playerId:     p.playerId,
                  playerName:   p.name,
                  teamId,
                  assisterId:   finisher?.playerId,
                  assisterName: finisher?.name,
                });
              }
            }
          }
        }

        // ── VERSATILE VISIONARY (creative / cross-court pass) ───────────
        if ((p.ast ?? 0) > 0) {
          const versatileProb = badgeProbs?.versatileVisionary ?? 0;
          if (versatileProb > 0) {
            for (let i = 0; i < (p.ast ?? 0); i++) {
              if (Math.random() < versatileProb) {
                const recipient = topScorerByPlayer.get(p.playerId) ?? null;
                highlights.push({
                  type:         'versatile_visionary',
                  playerId:     p.playerId,
                  playerName:   p.name,
                  teamId,
                  assisterId:   recipient?.playerId,
                  assisterName: recipient?.name,
                });
              }
            }
          }
        }
      } // end per-player loop

      // ── TECHNICAL FOULS (cosmetic) ──────────────────────────────────────
      // ~5% chance per team in a high-foul game (≥20 team PF)
      if (totalPf >= 20 && Math.random() < 0.05) {
        const mostFouls = [...stats].sort((a, b) => (b.pf ?? 0) - (a.pf ?? 0))[0];
        if (mostFouls) {
          highlights.push({
            type:       'tech_foul',
            playerId:   mostFouls.playerId,
            playerName: mostFouls.name,
            teamId,
          });
          mostFouls.techs = (mostFouls.techs ?? 0) + 1;
        }
      }

      // ── TIMEOUTS (cosmetic) ─────────────────────────────────────────────
      const timeoutsUsed = 4 + Math.floor(Math.random() * 4); // 4-7
      highlights.push({
        type:        'timeout',
        playerId:    '',
        playerName:  'Team',
        teamId,
        description: `${timeoutsUsed} timeout${timeoutsUsed !== 1 ? 's' : ''} used`,
      });
    } // end per-side loop

    // ── COACH CHALLENGE (cosmetic) — ~15% per game ────────────────────────
    if (Math.random() < 0.15) {
      const side    = sides[Math.floor(Math.random() * 2)];
      const outcome = Math.random() < 0.40 ? 'overturned' : 'upheld';
      highlights.push({
        type:        'coach_challenge',
        playerId:    '',
        playerName:  'Coach',
        teamId:      side.teamId,
        description: `Coach challenge — call ${outcome}`,
      });
    }

    return highlights;
  }
}
