import type { GameState } from '../../../types';
import { LOTTERY_PRESETS, computeTopKOdds } from '../../../lib/lotteryPresets';
import { UNDRAFTED_OVR_CAP } from '../../../constants';
import { isDraftBlockedByUnresolvedPlayoffs } from '../../../utils/dateUtils';
import { normalizeTeamJerseyNumbers, pickJerseyNumber } from '../../../utils/jerseyUtils';
import { getLsYear } from '../../../utils/leagueYear';
import { computeRookieSalaryUSD } from '../../../utils/rookieContractUtils';
import { buildDraftOrderFromState } from '../../draft/draftOrder';
import { returnUndraftedToHomeLeague } from '../../externalLeagueSustainer';
import { logPlanEvent } from '../../offseason/offseasonPlan';
import { isNoDraftLeague } from '../../offseason/offseasonState';
import { buildPbaDraftOrderTeams, getPbaDraftPool } from '../../pba/draftRules';

function runWeightedLottery<T extends { originalSeed: number }>(
  teams: T[],
  chances: number[],
  numToPick: number
): { pick: number; team: T; change: number }[] {
  const results: { pick: number; team: T; change: number }[] = [];
  const drawnSeeds = new Set<number>();
  const actual = Math.min(numToPick, teams.length);

  for (let i = 1; i <= actual; i++) {
    const avail = teams.filter(t => !drawnSeeds.has(t.originalSeed));
    const totalW = avail.reduce((s, t) => s + (chances[t.originalSeed - 1] ?? 0), 0);
    if (!totalW) break;
    let rnd = Math.random() * totalW;
    let winner = avail[0];
    for (const t of avail) {
      rnd -= chances[t.originalSeed - 1] ?? 0;
      if (rnd <= 0) { winner = t; break; }
    }
    drawnSeeds.add(winner.originalSeed);
    results.push({ pick: i, team: winner, change: winner.originalSeed - i });
  }

  teams
    .filter(t => !drawnSeeds.has(t.originalSeed))
    .sort((a, b) => a.originalSeed - b.originalSeed)
    .forEach((t, idx) => results.push({ pick: idx + actual + 1, team: t, change: t.originalSeed - (idx + actual + 1) }));

  return results;
}

export const autoRunLottery = (state: GameState): Partial<GameState> => {
  logPlanEvent('autoResolvers.autoRunLottery', 'fire', `date=${state.date}`);
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  if (isNoDraftLeague(state.leagueStats)) return {};
  if ((state as any).draftLotteryResult) return {};

  const preset = LOTTERY_PRESETS[state.leagueStats?.draftType ?? 'nba2019'] ?? LOTTERY_PRESETS.nba2019;
  const sorted = [...state.teams]
    .filter(t => t.id >= 0 && t.id < 100)
    .sort((a, b) => (a.wins / Math.max(1, a.wins + a.losses)) - (b.wins / Math.max(1, b.wins + b.losses)))
    .slice(0, Math.min(14, preset.chances.length));

  const lotteryTeams = sorted.map((t, i) => {
    const chance = preset.chances[i] ?? 0;
    const gp = t.wins + t.losses;
    const winPct = gp > 0 ? (t.wins / gp).toFixed(3) : '.000';
    return {
      id: t.id,
      tid: t.id,
      name: t.name,
      city: (t as any).region ?? t.name,
      logoUrl: (t as any).logoUrl ?? '',
      record: `${t.wins}-${t.losses}`,
      winPct,
      odds1st: parseFloat(((chance / preset.total) * 100).toFixed(1)),
      oddsTopN: parseFloat((computeTopKOdds(preset.chances, i, preset.numToPick) * 100).toFixed(1)),
      oddsTop4: parseFloat((computeTopKOdds(preset.chances, i, preset.numToPick) * 100).toFixed(1)),
      color: (t as any).colors?.[0] ?? '#333333',
      originalSeed: i + 1,
    };
  });

  return { draftLotteryResult: runWeightedLottery(lotteryTeams, preset.chances, preset.numToPick) } as any;
};

export const autoRunDraft = (state: GameState): Partial<GameState> => {
  logPlanEvent('autoResolvers.autoRunDraft', 'fire', `date=${state.date}`);
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  if (isNoDraftLeague(state.leagueStats)) return {};
  if ((state as any).draftComplete) return {};
  if (isDraftBlockedByUnresolvedPlayoffs(state)) return { _deferred: true } as any;

  const season = getLsYear(state);
  const guaranteedYrs = state.leagueStats?.rookieContractLength ?? 2;
  const teamOptEnabled: boolean = (state.leagueStats as any)?.rookieTeamOptionsEnabled ?? true;
  const teamOptYears: number = (state.leagueStats as any)?.rookieTeamOptionYears ?? 2;
  const restrictedFA: boolean = (state.leagueStats as any)?.rookieRestrictedFreeAgentEligibility ?? true;
  const EXTERNAL_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);

  const pbaDraftPool = pbaIsolated ? getPbaDraftPool(state.players) : [];
  const pbaDraftPoolIds = new Set(pbaDraftPool.map(player => player.internalId));
  const draftOrder = (((state as any).activeDraftOrder?.length ?? 0) > 0
    ? (state as any).activeDraftOrder
    : pbaIsolated
      ? buildPbaDraftOrderTeams((state as any).nonNBATeams ?? [], state.boxScores ?? [], season, pbaDraftPool.length)
      : buildDraftOrderFromState(state)) as any[];
  const prospects = (pbaIsolated ? pbaDraftPool : state.players.filter(p => {
    const isProspect = p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect';
    if (!isProspect) return false;
    if (EXTERNAL_STATUSES.has(p.status ?? '')) return false;
    const draftYear = (p as any).draft?.year;
    if (draftYear != null && Number(draftYear) !== season) return false;
    return true;
  }))
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
    .slice(0, 100);

  const assignedIds = new Set<string>();
  const pickMap = new Map<number, { player: typeof state.players[0]; team: any }>();
  const activeDraftPicks: Record<number, any> = (state as any).activeDraftPicks ?? {};
  const passedSlots = new Set(Object.keys((state as any).activeDraftPassedPicks ?? {}).map(Number));
  for (const [slotKey, savedPlayer] of Object.entries(activeDraftPicks)) {
    const slot = Number(slotKey);
    const team = draftOrder[slot - 1];
    if (!team || !savedPlayer?.internalId) continue;
    const live = state.players.find(p => p.internalId === savedPlayer.internalId) ?? savedPlayer;
    pickMap.set(slot, { player: live, team });
    assignedIds.add(savedPlayer.internalId);
  }
  for (let slot = 1; slot <= draftOrder.length; slot++) {
    if (pickMap.has(slot) || passedSlots.has(slot)) continue;
    const team = draftOrder[slot - 1];
    const best = prospects.find(p => !assignedIds.has(p.internalId));
    if (!best) break;
    assignedIds.add(best.internalId);
    pickMap.set(slot, { player: best, team });
  }

  const teamRetiredNums = new Map<number, Set<string>>();
  const teamTakenNums = new Map<number, Set<string>>();
  for (const t of state.teams) {
    teamRetiredNums.set(t.id, new Set<string>(((t as any).retiredJerseyNumbers ?? []).map((j: any) => String(j.number))));
  }
  for (const p of state.players) {
    if (p.tid >= 0 && p.jerseyNumber) {
      if (!teamTakenNums.has(p.tid)) teamTakenNums.set(p.tid, new Set());
      teamTakenNums.get(p.tid)!.add(String(p.jerseyNumber));
    }
  }
  const draftJerseyAssignments = new Map<string, string>();
  for (const [, { player, team }] of pickMap.entries()) {
    const retired = teamRetiredNums.get(team.id) ?? new Set<string>();
    const taken = teamTakenNums.get(team.id) ?? new Set<string>();
    const excluded = new Set([...retired, ...taken]);
    let num = player.jerseyNumber ? String(player.jerseyNumber) : '';
    if (!num || retired.has(num)) num = pickJerseyNumber(excluded);
    draftJerseyAssignments.set(player.internalId, num);
    if (!teamTakenNums.has(team.id)) teamTakenNums.set(team.id, new Set());
    teamTakenNums.get(team.id)!.add(num);
  }

  const undrafted: Array<{ name: string; id: string }> = [];
  const updatedPlayers = state.players.map(p => {
    for (const [slot, { player, team }] of pickMap.entries()) {
      if (player.internalId !== p.internalId) continue;
      const roundSize = pbaIsolated ? (Number((team as any)._roundSize) || 12) : 30;
      const round = pbaIsolated ? (Number((team as any)._round) || ((team as any)._r2 ? 2 : 1)) : (slot <= 30 ? 1 : 2);
      const pickInRound = slot - ((round - 1) * roundSize);
      const salaryAmount = computeRookieSalaryUSD(slot, state.leagueStats, roundSize);
      const baseYrs = round === 1 ? guaranteedYrs : 2;
      const optionYrs = (round === 1 && teamOptEnabled) ? teamOptYears : 0;
      const totalYrs = baseYrs + optionYrs;
      const r2NonGuaranteed = round >= 2 && ((state.leagueStats as any)?.r2ContractsNonGuaranteed ?? true);
      const contractYears = Array.from({ length: totalYrs }, (_, i) => {
        const yr = season + i;
        return {
          season: `${yr}-${String(yr + 1).slice(-2)}`,
          guaranteed: Math.round(salaryAmount * Math.pow(1.05, i)),
          option: i >= baseYrs ? 'Team' : '',
        };
      });
      return {
        ...p,
        tid: team.id,
        status: pbaIsolated ? 'PBA' as const : 'Active' as const,
        jerseyNumber: draftJerseyAssignments.get(p.internalId) ?? p.jerseyNumber,
        ...(r2NonGuaranteed && { nonGuaranteed: true }),
        transactions: [
          ...((p as any).transactions ?? []),
          { season, tid: team.id, type: 'draft', phase: 0, pickNum: slot },
        ],
        draft: { round, pick: pickInRound, year: season, tid: team.id, originalTid: team.id },
        signedDate: state.date,
        contract: {
          amount: salaryAmount / 1_000,
          exp: season + totalYrs,
          salaryDetails: [{ season, amount: salaryAmount }],
          ...(optionYrs > 0 && {
            hasTeamOption: true,
            teamOptionExp: season + baseYrs + 1,
          }),
          ...(round === 1 && restrictedFA && { restrictedFA: true }),
          rookie: true,
        },
        contractYears,
      };
    }
    const draftYear = (p as any).draft?.year;
    const isCurrentClass = !draftYear || Number(draftYear) === season;
    if (
      isCurrentClass &&
      (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') &&
      (!pbaIsolated || pbaDraftPoolIds.has(p.internalId)) &&
      !assignedIds.has(p.internalId)
    ) {
      undrafted.push({ name: p.name, id: p.internalId });
      return {
        ...p,
        overallRating: Math.min(p.overallRating ?? 99, UNDRAFTED_OVR_CAP),
        tid: -1 as const,
        status: 'Free Agent' as const,
        transactions: [
          ...((p as any).transactions ?? []),
          { season, tid: -1, type: 'draft', phase: 0, pickNum: 0 },
        ],
        draft: { round: 0, pick: 0, year: season, tid: -1, originalTid: -1 },
      };
    }
    return p;
  });

  const ordinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const draftHistoryEntries: Array<{ text: string; date: string; type: string; playerIds: string[] }> = [];
  for (const [slot, { player, team }] of pickMap.entries()) {
    draftHistoryEntries.push({
      text: `The ${team.name} select ${player.name} as the ${ordinal(slot)} overall pick of the ${season} ${pbaIsolated ? 'PBA' : 'NBA'} Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [player.internalId],
    });
  }
  for (const u of undrafted) {
    draftHistoryEntries.push({
      text: `${u.name} went undrafted in the ${season} ${pbaIsolated ? 'PBA' : 'NBA'} Draft.`,
      date: state.date,
      type: 'Draft',
      playerIds: [u.id],
    });
  }

  const TWO_WAY_SALARY_THOUSANDS = 625;
  const maxTwoWay = state.leagueStats?.maxTwoWayPlayersPerTeam ?? 2;
  const twoWayEnabled = state.leagueStats?.twoWayContractsEnabled ?? true;
  const gmUserTeamId = state.gameMode === 'gm' ? (state as any).userTeamId : -999;
  const hasValidGmUserTeamId = state.gameMode !== 'gm' || (Number.isInteger(gmUserTeamId) && gmUserTeamId >= 0);
  let warnedUserTeamFillSkip = false;
  const shouldSkipUserTeamFill = (teamId: number): boolean => {
    if (state.gameMode !== 'gm') return false;
    if (hasValidGmUserTeamId && teamId !== gmUserTeamId) return false;
    if (!warnedUserTeamFillSkip) {
      console.warn('[autoRunDraft] SKIPPING user team fill');
      warnedUserTeamFillSkip = true;
    }
    return true;
  };

  const draftedTeamIds = new Set(Array.from(pickMap.values()).map(({ team }) => team.id));
  let twoWayPlayers = normalizeTeamJerseyNumbers(updatedPlayers, state.teams, season, {
    history: state.history,
    targetTeamIds: draftedTeamIds,
  });
  if (!pbaIsolated && twoWayEnabled && maxTwoWay > 0) {
    const TWO_WAY_OVR_CAP = 45;
    const twoWayPool = twoWayPlayers
      .filter(p => p.tid === -1 && p.status === 'Free Agent' && (p.overallRating ?? 99) <= TWO_WAY_OVR_CAP)
      .filter(p => {
        const age = p.born?.year ? season - p.born.year : (p.age ?? 99);
        if (age >= 30) return false;
        if (age <= 24) return true;
        const yosFromStats = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
        const draftYr = (p as any).draft?.year;
        const yosFromDraft = (draftYr && season > draftYr) ? season - draftYr : 0;
        return Math.max(yosFromStats, yosFromDraft) <= 2;
      })
      .sort((a, b) => (a.overallRating ?? 0) - (b.overallRating ?? 0));

    const twoWayAssignments = new Map<string, number>();
    const twoWayCountByTeam = new Map<number, number>();
    for (const team of state.teams.filter(t => t.id >= 0 && t.id < 100)) {
      if (shouldSkipUserTeamFill(team.id)) continue;
      const standardCount = twoWayPlayers.filter(p => p.tid === team.id && !(p as any).twoWay).length;
      if (standardCount < 1) continue;

      let given = twoWayCountByTeam.get(team.id) ?? 0;
      for (const candidate of twoWayPool) {
        if (given >= maxTwoWay) break;
        if (twoWayAssignments.has(candidate.internalId)) continue;
        twoWayAssignments.set(candidate.internalId, team.id);
        given++;
        twoWayCountByTeam.set(team.id, given);
      }
    }

    const twoWayHistoryEntries: Array<{ text: string; date: string; type: string; playerIds: string[] }> = [];
    if (twoWayAssignments.size > 0) {
      twoWayPlayers = twoWayPlayers.map(p => {
        const teamId = twoWayAssignments.get(p.internalId);
        if (teamId === undefined) return p;
        const team = state.teams.find(t => t.id === teamId);
        const teamName = team?.name ?? `Team ${teamId}`;
        twoWayHistoryEntries.push({
          text: `${p.name} signed a two-way contract with the ${teamName}.`,
          date: state.date ?? `Jul 1, ${season}`,
          type: 'Signing',
          playerIds: [p.internalId],
        });
        return {
          ...p,
          tid: teamId,
          status: 'Active' as const,
          twoWay: true,
          contract: { amount: TWO_WAY_SALARY_THOUSANDS, exp: season },
        };
      });
    }
    if (twoWayHistoryEntries.length > 0) {
      const existingHistory: any[] = (state.history as any[]) ?? [];
      return {
        players: normalizeTeamJerseyNumbers(twoWayPlayers, state.teams, season, {
          history: state.history,
          targetTeamIds: draftedTeamIds,
        }),
        draftComplete: true,
        draftPicks: (state.draftPicks ?? []).filter(p => p.season !== season),
        activeDraftPicks: undefined,
        activeDraftPassedPicks: undefined,
        activeDraftOrder: undefined,
        history: [...existingHistory, ...draftHistoryEntries, ...twoWayHistoryEntries],
      } as any;
    }
  }

  const { players: playersAfterReturn, historyEntries: returnHistory } = pbaIsolated
    ? { players: twoWayPlayers, historyEntries: [] }
    : returnUndraftedToHomeLeague(twoWayPlayers, season, state as any);
  const existingHistory: any[] = (state.history as any[]) ?? [];
  return {
    players: normalizeTeamJerseyNumbers(playersAfterReturn, state.teams, season, {
      history: state.history,
      targetTeamIds: draftedTeamIds,
    }),
    draftComplete: true,
    draftPicks: (state.draftPicks ?? []).filter(p => p.season !== season),
    activeDraftPicks: undefined,
    activeDraftPassedPicks: undefined,
    activeDraftOrder: undefined,
    history: [...existingHistory, ...draftHistoryEntries, ...returnHistory],
  } as any;
};
