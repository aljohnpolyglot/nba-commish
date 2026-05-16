/**
 * euroAwardAnnouncer — staggered Euro award announcements (mirrors NBA's
 * autoResolvers.ts pattern). Each award fires on its own date, idempotent
 * via state.historicalAwards type check.
 *
 * Liga ACB MVP        — Jun 5
 * EuroLeague MVP      — Apr 25
 * EL Top Scorer       — Apr 30
 * EL Defender         — May 5
 * EL Rising Star      — May 8
 * EL COY              — May 12
 * All-EuroLeague      — May 18
 * Endesa Best Coach   — Jun 8
 * Endesa Young Player — Jun 10
 * Endesa Stat Leaders — Jun 12 (Top Scorer / Reb / Ast / PIR all on the same day)
 */
import type { GameState, HistoricalAward } from '../../types';
import { EuroAwardService } from './EuroAwardService';

type EuroAwardKey =
  | 'EUROLEAGUE_MVP' | 'EUROLEAGUE_DEFENDER' | 'EUROLEAGUE_RISING_STAR'
  | 'EUROLEAGUE_TOP_SCORER' | 'EUROLEAGUE_COY' | 'ALL_EUROLEAGUE'
  | 'ENDESA_MVP' | 'ENDESA_YOUNG_PLAYER' | 'ENDESA_TOP_SCORER'
  | 'ENDESA_TOP_REBOUNDER' | 'ENDESA_TOP_ASSISTER' | 'ENDESA_PIR_LEADER'
  | 'ENDESA_BEST_COACH';

const STORED_TYPE: Record<EuroAwardKey, string> = {
  EUROLEAGUE_MVP:         'Euroleague MVP',
  EUROLEAGUE_DEFENDER:    'Euroleague Best Defender',
  EUROLEAGUE_RISING_STAR: 'Euroleague Rising Star',
  EUROLEAGUE_TOP_SCORER:  'Alphonso Ford Top Scorer',
  EUROLEAGUE_COY:         'Alexander Gomelskiy COY',
  ALL_EUROLEAGUE:         'All-EuroLeague First Team',
  ENDESA_MVP:             'Liga ACB MVP',
  ENDESA_YOUNG_PLAYER:    'Liga ACB Best Young Player',
  ENDESA_TOP_SCORER:      'Liga ACB Top Scorer',
  ENDESA_TOP_REBOUNDER:   'Liga ACB Rebound Leader',
  ENDESA_TOP_ASSISTER:    'Liga ACB Assist Leader',
  ENDESA_PIR_LEADER:      'Liga ACB PIR Leader',
  ENDESA_BEST_COACH:      'Liga ACB Best Coach',
};

function awardPlayer(state: GameState, key: EuroAwardKey, players: any[]): Partial<GameState> {
  const season = state.leagueStats.year;
  const existing = (state.historicalAwards ?? []).filter(a => a.season === season);
  if (existing.some(a => a.type === STORED_TYPE[key])) return {};

  // Determine which races to compute
  const nonNba = (state.nonNBATeams ?? []) as any;
  const isEuroleague = key.startsWith('EUROLEAGUE_');
  const races = isEuroleague
    ? EuroAwardService.calculateEuroleagueRaces(state.players, state.teams, nonNba, season, state.staff)
    : EuroAwardService.calculateEndesaRaces(state.players, state.teams, nonNba, season, state.staff);

  let winner: { player?: any; team?: any; coachName?: string } | undefined;
  switch (key) {
    case 'EUROLEAGUE_MVP':         winner = (races as any).mvp?.[0]; break;
    case 'EUROLEAGUE_DEFENDER':    winner = (races as any).defender?.[0]; break;
    case 'EUROLEAGUE_RISING_STAR': winner = (races as any).risingStar?.[0]; break;
    case 'EUROLEAGUE_TOP_SCORER':  winner = (races as any).topScorer?.[0]; break;
    case 'EUROLEAGUE_COY':         winner = (races as any).coy?.[0]; break;
    case 'ENDESA_MVP':             winner = (races as any).mvp?.[0]; break;
    case 'ENDESA_YOUNG_PLAYER':    winner = (races as any).bestYoungPlayer?.[0]; break;
    case 'ENDESA_TOP_SCORER':      winner = (races as any).topScorer?.[0]; break;
    case 'ENDESA_TOP_REBOUNDER':   winner = (races as any).topRebounder?.[0]; break;
    case 'ENDESA_TOP_ASSISTER':    winner = (races as any).topAssister?.[0]; break;
    case 'ENDESA_PIR_LEADER':      winner = (races as any).pirLeader?.[0]; break;
    case 'ENDESA_BEST_COACH':      winner = (races as any).bestCoach?.[0]; break;
  }
  if (!winner) return {};

  const newAwards: HistoricalAward[] = [];
  let updatedPlayers = state.players;

  if (winner.coachName) {
    // Coach award
    newAwards.push({
      season,
      type: STORED_TYPE[key],
      name: winner.coachName,
      tid: winner.team?.id,
    });
  } else if (winner.player) {
    newAwards.push({
      season,
      type: STORED_TYPE[key],
      name: winner.player.name,
      pid: winner.player.internalId,
      tid: winner.team?.id,
    });
    updatedPlayers = updatedPlayers.map(p =>
      p.internalId === winner!.player.internalId
        ? { ...p, awards: [...(p.awards ?? []), { season, type: STORED_TYPE[key] }] }
        : p
    );
  }

  return {
    players: updatedPlayers,
    historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
  };
}

function awardAllEuroLeague(state: GameState): Partial<GameState> {
  const season = state.leagueStats.year;
  const existing = (state.historicalAwards ?? []).filter(a => a.season === season);
  if (existing.some(a => a.type === STORED_TYPE.ALL_EUROLEAGUE)) return {};

  const nonNba = (state.nonNBATeams ?? []) as any;
  const races = EuroAwardService.calculateEuroleagueRaces(state.players, state.teams, nonNba, season, state.staff);
  const [first, second] = races.allEuroLeague;

  const newAwards: HistoricalAward[] = [];
  let updatedPlayers = state.players;

  const slot = (label: string, spots: typeof first) => {
    for (const sp of spots) {
      newAwards.push({
        season,
        type: label,
        name: sp.player.name,
        pid: sp.player.internalId,
        tid: sp.team?.id,
      });
      updatedPlayers = updatedPlayers.map(p =>
        p.internalId === sp.player.internalId
          ? { ...p, awards: [...(p.awards ?? []), { season, type: label }] }
          : p
      );
    }
  };

  slot('All-EuroLeague First Team', first);
  slot('All-EuroLeague Second Team', second);

  return {
    players: updatedPlayers,
    historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
  };
}

// ─── Public resolvers (mirrors autoAnnounce* pattern) ───────────────────────

export const autoAnnounceEuroleagueMVP        = (s: GameState) => awardPlayer(s, 'EUROLEAGUE_MVP', s.players);
export const autoAnnounceEuroleagueDefender   = (s: GameState) => awardPlayer(s, 'EUROLEAGUE_DEFENDER', s.players);
export const autoAnnounceEuroleagueRisingStar = (s: GameState) => awardPlayer(s, 'EUROLEAGUE_RISING_STAR', s.players);
export const autoAnnounceEuroleagueTopScorer  = (s: GameState) => awardPlayer(s, 'EUROLEAGUE_TOP_SCORER', s.players);
export const autoAnnounceEuroleagueCOY        = (s: GameState) => awardPlayer(s, 'EUROLEAGUE_COY', s.players);
export const autoAnnounceAllEuroLeague        = (s: GameState) => awardAllEuroLeague(s);

export const autoAnnounceEndesaMVP            = (s: GameState) => awardPlayer(s, 'ENDESA_MVP', s.players);
export const autoAnnounceEndesaYoungPlayer    = (s: GameState) => awardPlayer(s, 'ENDESA_YOUNG_PLAYER', s.players);
export const autoAnnounceEndesaTopScorer      = (s: GameState) => awardPlayer(s, 'ENDESA_TOP_SCORER', s.players);
export const autoAnnounceEndesaTopRebounder   = (s: GameState) => awardPlayer(s, 'ENDESA_TOP_REBOUNDER', s.players);
export const autoAnnounceEndesaTopAssister    = (s: GameState) => awardPlayer(s, 'ENDESA_TOP_ASSISTER', s.players);
export const autoAnnounceEndesaPIRLeader      = (s: GameState) => awardPlayer(s, 'ENDESA_PIR_LEADER', s.players);
export const autoAnnounceEndesaBestCoach      = (s: GameState) => awardPlayer(s, 'ENDESA_BEST_COACH', s.players);
