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
import { resolvePool, fullSeasonRefFor } from './pool';
import type { HistoricalAward, GameState } from '../../types';

// ─── Settings defaults ──────────────────────────────────────────────────────

function getUIMode(state: GameStateView): UIMode {
  const m = (state.leagueStats as any)?.uiMode ?? 'nba';
  return (m === 'euro_isolated' || m === 'fictional') ? m : 'nba';
}

/** Build default AwardSettings for a save based on its uiMode. */
export function defaultAwardSettings(uiMode: UIMode): AwardSettings {
  const enabled: Record<string, boolean> = {};
  for (const a of AWARD_REGISTRY) {
    enabled[a.id] = a.defaultActiveIn.includes(uiMode);
  }
  return { enabled };
}

/** Read live settings, filling holes from defaults. */
function effectiveSettings(state: GameStateView): AwardSettings {
  const uiMode = getUIMode(state);
  const stored: AwardSettings | undefined = (state.leagueStats as any)?.awardSettings;
  if (!stored) return defaultAwardSettings(uiMode);
  // Fill any new award ids with mode defaults
  const enabled: Record<string, boolean> = { ...stored.enabled };
  for (const a of AWARD_REGISTRY) {
    if (!(a.id in enabled)) enabled[a.id] = a.defaultActiveIn.includes(uiMode);
  }
  return { ...stored, enabled };
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
  });

  const ctx: CalculatorContext = {
    players: state.players,
    teams: state.teams,
    nonNBATeams: state.nonNBATeams ?? [],
    season: (state.leagueStats as any)?.year ?? new Date().getFullYear(),
    staff: state.staff,
    poolTids,
    minGames: resolved.effectiveMinGames,
    args: def.calculatorArgs,
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
};

export function announce(state: GameState, awardId: string): Partial<GameState> {
  const def = getAwardDefinition(awardId);
  if (!def) return {};
  const uiMode = getUIMode(state as unknown as GameStateView);
  const settings = effectiveSettings(state as unknown as GameStateView);
  const resolved = resolveAward(def, settings, uiMode);
  if (!resolved.enabled) return {};

  const season = state.leagueStats.year;
  const storedType = def.storedType ?? resolved.effectiveName;

  // Idempotency — already awarded this season?
  if ((state.historicalAwards ?? []).some(a => a.season === season && a.type === storedType)) return {};

  // All-Team awards: write multiple rows
  if (def.category === 'all-team') {
    return announceAllTeam(state, def, resolved, storedType);
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

  if (def.scope === 'coach' && winner.coachName) {
    newAwards.push({
      season,
      type: storedType,
      name: winner.coachName,
      tid: winner.team?.id,
    });
  } else if (winner.player) {
    newAwards.push({
      season,
      type: storedType,
      name: winner.player.name,
      pid: winner.player.internalId,
      tid: winner.team?.id,
    });
    const playerAwardType = PLAYER_AWARD_TYPE_MAP[storedType] ?? resolved.effectiveName;
    updatedPlayers = updatedPlayers.map(p =>
      p.internalId === winner.player!.internalId
        ? { ...p, awards: [...(p.awards ?? []), { season, type: playerAwardType }] }
        : p
    );
  }

  return {
    players: updatedPlayers,
    historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
  };
}

function announceAllTeam(
  state: GameState,
  def: AwardDefinition,
  resolved: ResolvedAward,
  _storedType: string,
): Partial<GameState> {
  const season = state.leagueStats.year;
  const candidates = computeRaces(state as unknown as GameStateView, def.id);
  if (candidates.length === 0) return {};

  // Bucket by teamIndex (0 = 1st team, 1 = 2nd team, 2 = 3rd team)
  const teamNames: Record<string, string[]> = {
    'all-league':     ['All-NBA First Team', 'All-NBA Second Team', 'All-NBA Third Team'],
    'all-defensive':  ['All-Defensive First Team', 'All-Defensive Second Team'],
    'all-rookie':     ['All-Rookie First Team', 'All-Rookie Second Team'],
    'all-euroleague': ['All-EuroLeague First Team', 'All-EuroLeague Second Team'],
  };
  const labels = teamNames[def.id] ?? [resolved.effectiveName];

  // For Euro mode, rebrand the "All-NBA"-prefixed labels via brand mapping
  const uiMode = getUIMode(state as unknown as GameStateView);
  const finalLabels = uiMode === 'euro_isolated' && def.id === 'all-league'
    ? labels.map(l => l.replace('All-NBA', 'All-League'))
    : labels;

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
