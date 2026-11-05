/**
 * AwardEngine — runtime layer over AwardRegistry.
 *
 * Two public entry points:
 *   - resolveAwardsForState(state)  → list of enabled, brand-mapped awards
 *   - computeRaces(state, awardId)  → top-N candidates for a race
 *   - announce(state, awardId)      → Partial<GameState> writing the winner
 */
import type {
  AwardDefinition, ResolvedAward, AwardSettings, AwardCandidate,
  CalculatorContext, GameStateView, UIMode, TrophyDef,
} from './types';
import { AWARD_REGISTRY, getAwardDefinition } from './AwardRegistry';
import { CALCULATORS } from './calculators';
import { resolvePool } from './pool';
import type { HistoricalAward, GameState } from '../../types';
import { resolveHeadCoachMember } from '../staff/coachNameResolver';
import { recordCoachAchievement, recordExecutiveAchievement } from '../staff/coachAchievements';
import { resolveGeneralManagerForTeam } from '../staff/gmAttributes';
import { normalizePlayerAwardType } from '../../utils/playerAwardNormalizer';

// ─── Settings defaults ──────────────────────────────────────────────────────

function getUIMode(state: GameStateView): UIMode {
  const m = (state.leagueStats as any)?.uiMode ?? 'nba';
  return (m === 'euro_isolated' || m === 'pba_isolated' || m === 'wnba_isolated' || m === 'fictional') ? m : 'nba';
}

/** Build default AwardSettings for a save based on its uiMode. */
export function isAwardDefaultActive(def: AwardDefinition, uiMode: UIMode, season?: number): boolean {
  if (!def.defaultActiveIn.includes(uiMode)) return false;
  if (def.introducedSeason !== undefined && (season === undefined || season < def.introducedSeason)) return false;
  if (def.retiredAfterSeason !== undefined && (season === undefined || season > def.retiredAfterSeason)) return false;
  return true;
}

export function defaultAwardSettings(uiMode: UIMode, season?: number): AwardSettings {
  const enabled: Record<string, boolean> = {};
  for (const a of AWARD_REGISTRY) {
    enabled[a.id] = isAwardDefaultActive(a, uiMode, season);
  }
  enabled.ironman = false;
  enabled.sidekick = false;
  if (uiMode !== 'wnba_isolated') return { enabled };
  return {
    enabled,
    announceDates: {
      coy: { month: 9, day: 25 },
      smoy: { month: 9, day: 26 },
      mip: { month: 9, day: 27 },
      dpoy: { month: 9, day: 28 },
      roy: { month: 9, day: 29 },
      'all-defensive': { month: 9, day: 30 },
      'all-rookie': { month: 10, day: 1 },
      'all-league': { month: 10, day: 2 },
      mvp: { month: 10, day: 3 },
      'wnba-executive-of-year': { month: 10, day: 4 },
    },
  };
}

/** Read live settings, filling holes from defaults. */
function effectiveSettings(state: GameStateView): AwardSettings {
  const uiMode = getUIMode(state);
  const season = Number((state.leagueStats as any)?.year);
  const defaults = defaultAwardSettings(uiMode, season);
  const eraAwardIds = (state.leagueStats as any)?.eraRulesProfile?.enabledAwards as string[] | undefined;
  if (uiMode === 'fictional' && Array.isArray(eraAwardIds)) {
    for (const award of AWARD_REGISTRY) defaults.enabled[award.id] = eraAwardIds.includes(award.id);
  }
  if (uiMode === 'wnba_isolated') {
    const minGames = Math.max(1, Number((state.leagueStats as any)?.minGamesRequirement ?? 26));
    defaults.minGames = Object.fromEntries(
      AWARD_REGISTRY
        .filter(award => award.eligibility.includes('min-games') && award.defaultActiveIn.includes('wnba_isolated'))
        .map(award => [award.id, minGames]),
    );
  }
  const stored: AwardSettings | undefined = (state.leagueStats as any)?.awardSettings;
  if (!stored) return defaults;
  // Fill any new award ids with mode defaults
  const enabled: Record<string, boolean> = { ...stored.enabled };
  for (const a of AWARD_REGISTRY) {
    if (!(a.id in enabled)) enabled[a.id] = isAwardDefaultActive(a, uiMode, season);
  }
  return {
    ...defaults,
    ...stored,
    enabled,
    announceDates: { ...defaults.announceDates, ...stored.announceDates },
    minGames: { ...defaults.minGames, ...stored.minGames },
  };
}

// ─── Award resolution (merge settings overrides) ────────────────────────────

export function resolveAward(def: AwardDefinition, settings: AwardSettings, uiMode: UIMode): ResolvedAward {
  const brand = def.brandedAs?.[uiMode];
  const effectiveName = settings.customNames?.[def.id] ?? brand?.name ?? def.name;
  const effectiveShortName = brand?.shortName ?? def.shortName;
  const effectiveTrophy: TrophyDef = brand?.trophy ?? def.trophy;
  const effectiveAnnounceDate = settings.announceDates?.[def.id] ?? def.defaultAnnounceMD;
  const effectiveMinGames = settings.minGames?.[def.id] ?? def.minGamesDefault;
  return {
    ...def,
    effectiveName,
    effectiveShortName,
    effectiveTrophy,
    effectiveAnnounceDate,
    effectiveMinGames,
    enabled: settings.enabled[def.id] ?? def.defaultActiveIn.includes(uiMode),
  };
}

export function resolveAwardsForState(state: GameStateView): ResolvedAward[] {
  const uiMode = getUIMode(state);
  const settings = effectiveSettings(state);
  return AWARD_REGISTRY.map(d => resolveAward(d, settings, uiMode));
}

export function getEnabledAwards(state: GameStateView): ResolvedAward[] {
  return resolveAwardsForState(state).filter(a => a.enabled);
}

// ─── Compute (race projection) ──────────────────────────────────────────────

export function computeRaces(state: GameStateView, awardId: string): AwardCandidate[] {
  const def = getAwardDefinition(awardId);
  if (!def) return [];
  const uiMode = getUIMode(state);
  const settings = effectiveSettings(state);
  const resolved = resolveAward(def, settings, uiMode);
  if (def.calculatorId === 'postseason') return []; // not race-computable

  const calc = CALCULATORS[def.calculatorId];
  if (!calc) return [];

  const poolTids = resolvePool(def.poolId, {
    teams: state.teams,
    nonNBATeams: (state.nonNBATeams ?? []) as any,
    uiMode,
  });

  const ctx: CalculatorContext = {
    players: state.players,
    teams: state.teams,
    nonNBATeams: state.nonNBATeams ?? [],
    season: (state.leagueStats as any)?.year ?? new Date().getFullYear(),
    uiMode,
    staff: state.staff,
    gameMode: state.gameMode,
    userTeamId: state.userTeamId,
    commissionerName: state.commissionerName,
    poolTids,
    minGames: resolved.effectiveMinGames,
    boxScores: state.boxScores ?? [],
    args: uiMode === 'wnba_isolated' && def.id === 'all-league'
      ? { ...def.calculatorArgs, numTeams: 2 }
      : uiMode === 'wnba_isolated' && def.id === 'all-rookie'
        ? { ...def.calculatorArgs, numTeams: 1 }
        : def.calculatorArgs,
  };
  return calc(ctx);
}

/** All races for an enabled set — useful for the AwardRacesView grid. */
export function computeAllRaces(state: GameStateView): Record<string, AwardCandidate[]> {
  const out: Record<string, AwardCandidate[]> = {};
  for (const a of getEnabledAwards(state)) {
    out[a.id] = computeRaces(state, a.id);
  }
  return out;
}

// ─── Announce (commit winner to historicalAwards + player.awards) ───────────

const PLAYER_AWARD_TYPE_MAP: Record<string, string> = {
  MVP: 'Most Valuable Player',
  DPOY: 'Defensive Player of the Year',
  ROY: 'Rookie of the Year',
  SMOY: 'Sixth Man of the Year',
  MIP: 'Most Improved Player',
  'Clutch Player of the Year': 'Clutch Player of the Year',
};

const ALL_TEAM_AWARD_TYPES: Record<string, string[]> = {
  'all-league': ['All-NBA First Team', 'All-NBA Second Team', 'All-NBA Third Team'],
  'all-defensive': ['All-Defensive First Team', 'All-Defensive Second Team'],
  'all-rookie': ['All-Rookie First Team', 'All-Rookie Second Team'],
  'all-euroleague': ['All-EuroLeague First Team', 'All-EuroLeague Second Team'],
};

const WNBA_ALL_TEAM_AWARD_TYPES: Record<string, string[]> = {
  'all-league': ['All-WNBA First Team', 'All-WNBA Second Team'],
  'all-defensive': ['All-Defensive First Team', 'All-Defensive Second Team'],
  'all-rookie': ['All-Rookie Team'],
};

function getAllTeamAwardTypes(def: AwardDefinition, resolved: ResolvedAward, uiMode: UIMode): string[] {
  if (uiMode === 'wnba_isolated') {
    return WNBA_ALL_TEAM_AWARD_TYPES[def.id] ?? [resolved.effectiveName];
  }
  const labels = ALL_TEAM_AWARD_TYPES[def.id] ?? [resolved.effectiveName];
  return (uiMode === 'euro_isolated' || uiMode === 'fictional') && def.id === 'all-league'
    ? labels.map(label => label.replace('All-NBA', 'All-League'))
    : labels;
}

export function hasAwardResolutionEvidence(state: GameState, awardId: string, season = state.leagueStats.year): boolean {
  const definition = getAwardDefinition(awardId);
  if (!definition) return false;
  const uiMode = getUIMode(state as unknown as GameStateView);
  const resolved = resolveAward(definition, effectiveSettings(state as unknown as GameStateView), uiMode);
  const types = definition.category === 'all-team'
    ? getAllTeamAwardTypes(definition, resolved, uiMode)
    : [uiMode === 'fictional' && definition.id === 'all-league'
        ? 'All-League First Team'
        : definition.storedType ?? resolved.effectiveName];
  return (state.historicalAwards ?? []).some(row => Number(row.season) === Number(season) && types.includes(row.type));
}

function hydrateHistoricalPlayerAwards(
  state: GameState,
  rows: HistoricalAward[],
  resolveType: (row: HistoricalAward) => string,
): Partial<GameState> {
  const rowsByPlayerId = new Map<string, HistoricalAward[]>();
  for (const row of rows) {
    const playerId = String(row.pid ?? '').trim();
    if (!playerId) continue;
    rowsByPlayerId.set(playerId, [...(rowsByPlayerId.get(playerId) ?? []), row]);
  }
  if (rowsByPlayerId.size === 0) return {};

  let changed = false;
  const players = state.players.map(player => {
    const playerRows = rowsByPlayerId.get(String(player.internalId));
    if (!playerRows) return player;
    const awards = [...(player.awards ?? [])];
    for (const row of playerRows) {
      const type = resolveType(row);
      if (!type) continue;
      const competitionId = String(row.competitionId ?? '');
      const alreadyPresent = awards.some(award =>
        Number(award.season) === Number(row.season)
        && normalizePlayerAwardType(award.type) === normalizePlayerAwardType(type)
        && String(award.competitionId ?? '') === competitionId,
      );
      if (alreadyPresent) continue;
      awards.push({
        season: row.season,
        type,
        ...(row.competitionId ? { competitionId: row.competitionId } : {}),
        ...(row.uiMode ? { uiMode: row.uiMode } : {}),
        ...(row.source ? { source: row.source } : {}),
        ...(row.introducedSeason != null ? { introducedSeason: row.introducedSeason } : {}),
        ...(row.conference ? { conference: row.conference } : {}),
      });
      changed = true;
    }
    return awards.length === (player.awards ?? []).length ? player : { ...player, awards };
  });
  return changed ? { players } : {};
}

export function announce(state: GameState, awardId: string): Partial<GameState> {
  const def = getAwardDefinition(awardId);
  if (!def) return {};
  const uiMode = getUIMode(state as unknown as GameStateView);
  const settings = effectiveSettings(state as unknown as GameStateView);
  const resolved = resolveAward(def, settings, uiMode);
  if (!resolved.enabled) return {};

  const season = state.leagueStats.year;
  const storedType = uiMode === 'fictional' && def.id === 'all-league'
    ? 'All-League First Team'
    : def.storedType ?? resolved.effectiveName;

  if (def.category === 'all-team') {
    const allTeamTypes = getAllTeamAwardTypes(def, resolved, uiMode);
    const existingRows = (state.historicalAwards ?? []).filter(award =>
      award.season === season && allTeamTypes.includes(award.type),
    );
    return existingRows.length > 0
      ? hydrateHistoricalPlayerAwards(state, existingRows, row => row.type)
      : announceAllTeam(state, def, resolved);
  }

  const existingAward = (state.historicalAwards ?? []).find(a => a.season === season && a.type === storedType);
  if (existingAward) {
    if (existingAward.tid != null && def.scope === 'executive') {
      return recordExecutiveAchievement(state, {
        teamId: existingAward.tid,
        season,
        type: storedType,
        label: `${season} ${resolved.effectiveName}`,
        league: uiMode,
        executiveName: existingAward.executiveName ?? existingAward.name,
        executiveId: existingAward.executiveId,
      });
    }
    if (existingAward.tid != null && def.scope === 'coach') {
      return recordCoachAchievement(state, {
        teamId: existingAward.tid,
        season,
        type: storedType,
        label: `${season} ${resolved.effectiveName}`,
        league: uiMode,
        coachName: existingAward.coachName ?? existingAward.name,
        coachId: existingAward.coachId,
      });
    }
    if (def.scope === 'player') {
      const playerAwardType = PLAYER_AWARD_TYPE_MAP[storedType] ?? resolved.effectiveName;
      return hydrateHistoricalPlayerAwards(state, [existingAward], () => playerAwardType);
    }
    return {};
  }

  if (def.calculatorId === 'postseason') {
    // Postseason awards are written by the playoff resolver, not here.
    return {};
  }

  const candidates = computeRaces(state as unknown as GameStateView, awardId);
  const winner = candidates[0];
  if (!winner) return {};

  const newAwards: HistoricalAward[] = [];
  let updatedPlayers = state.players;
  let coachAchievementPatch: Partial<GameState> = {};

  if (def.scope === 'executive' && winner.executiveName) {
    const executive = winner.team ? resolveGeneralManagerForTeam(winner.team, state.staff) : null;
    newAwards.push({
      season,
      type: storedType,
      name: winner.executiveName,
      tid: winner.team?.id,
      uiMode,
      role: 'executive',
      executiveName: winner.executiveName,
      executiveId: winner.executiveId ?? executive?.executiveId ?? executive?.id ?? executive?.sourcePlayerId,
    });
    if (winner.team?.id != null) {
      coachAchievementPatch = recordExecutiveAchievement(state, {
        teamId: winner.team.id,
        season,
        type: storedType,
        label: `${season} ${resolved.effectiveName}`,
        league: uiMode,
        executiveName: winner.executiveName,
        executiveId: winner.executiveId ?? executive?.executiveId ?? executive?.id ?? executive?.sourcePlayerId,
      });
    }
  } else if (def.scope === 'coach' && winner.coachName) {
    const coach = winner.team ? resolveHeadCoachMember(winner.team, state.staff) : undefined;
    newAwards.push({
      season,
      type: storedType,
      name: winner.coachName,
      tid: winner.team?.id,
      uiMode,
      role: 'coach',
      coachName: winner.coachName,
      coachId: coach?.id ?? coach?.sourcePlayerId,
    });
    if (winner.team?.id != null) {
      coachAchievementPatch = recordCoachAchievement(state, {
        teamId: winner.team.id,
        season,
        type: storedType,
        label: `${season} ${resolved.effectiveName}`,
        league: uiMode,
        coachName: winner.coachName,
        coachId: coach?.id ?? coach?.sourcePlayerId,
      });
    }
  } else if (winner.player) {
    newAwards.push({
      season,
      type: storedType,
      name: winner.player.name,
      pid: winner.player.internalId,
      tid: winner.team?.id,
      uiMode,
      ...(winner.game ? {
        statLine: `${winner.game.stats.pts} PTS, ${winner.game.stats.reb} REB, ${winner.game.stats.ast} AST · ${winner.game.stats.gameScore.toFixed(1)} Game Score · ${winner.game.date}`,
        source: `game:${winner.game.gameId}`,
      } : {}),
    });
    const playerAwardType = PLAYER_AWARD_TYPE_MAP[storedType] ?? resolved.effectiveName;
    updatedPlayers = updatedPlayers.map(p =>
      p.internalId === winner.player!.internalId
        ? { ...p, awards: [...(p.awards ?? []), { season, type: playerAwardType }] }
        : p
    );
  }

  return {
    ...coachAchievementPatch,
    players: updatedPlayers,
    historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
  };
}

export function finalizeEnabledStaffAwards(state: GameState): GameState {
  let finalized = state;
  const staffAwardIds = getEnabledAwards(finalized as unknown as GameStateView)
    .filter(award => award.calculatorId !== 'postseason' && (award.scope === 'coach' || award.scope === 'executive'))
    .map(award => award.id);
  for (const awardId of staffAwardIds) {
    const patch = announce(finalized, awardId);
    if (Object.keys(patch).length > 0) finalized = { ...finalized, ...patch } as GameState;
  }
  return finalized;
}

function announceAllTeam(
  state: GameState,
  def: AwardDefinition,
  resolved: ResolvedAward,
): Partial<GameState> {
  const season = state.leagueStats.year;
  const candidates = computeRaces(state as unknown as GameStateView, def.id);
  if (candidates.length === 0) return {};

  const uiMode = getUIMode(state as unknown as GameStateView);
  const finalLabels = getAllTeamAwardTypes(def, resolved, uiMode);

  const newAwards: HistoricalAward[] = [];
  let updatedPlayers = state.players;
  for (const c of candidates) {
    if (!c.player || c.teamIndex === undefined) continue;
    const label = finalLabels[c.teamIndex] ?? finalLabels[finalLabels.length - 1];
    newAwards.push({
      season,
      type: label,
      name: c.player.name,
      pid: c.player.internalId,
      tid: c.team?.id,
      uiMode,
      competitionId: def.poolId === 'euroleague' ? 'euroleague' : undefined,
    });
    updatedPlayers = updatedPlayers.map(p =>
      p.internalId === c.player!.internalId
        ? { ...p, awards: [...(p.awards ?? []), { season, type: label }] }
        : p
    );
  }
  return {
    players: updatedPlayers,
    historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
  };
}

// ─── Schedule lookup — for lazySimRunner ────────────────────────────────────

/** Get all announce events for a season — enabled awards only, no postseason. */
export function getAnnouncementEvents(
  state: GameStateView,
  seasonYear: number,
): Array<{ date: string; awardId: string; phase: string }> {
  return getEnabledAwards(state)
    .filter(a => a.calculatorId !== 'postseason')
    .map(a => {
      const mm = String(a.effectiveAnnounceDate.month).padStart(2, '0');
      const dd = String(a.effectiveAnnounceDate.day).padStart(2, '0');
      return {
        date: `${seasonYear}-${mm}-${dd}`,
        awardId: a.id,
        phase: `Announcing ${a.effectiveName}...`,
      };
    });
}
