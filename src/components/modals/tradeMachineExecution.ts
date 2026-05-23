import { SettingsManager } from '../../services/SettingsManager';
import { calcPickTV, calcPlayerTV, type TeamMode, type TVContext } from '../../services/trade/tradeValueEngine';
import { evaluateTradeAcceptance, roleToMode } from '../../services/trade/tradeFinderEngine';
import { formatPickLabel } from '../../services/draft/draftClassStrength';
import type { DraftPick, NBAPlayer, NBATeam } from '../../types';
import type { TradeOutlook } from '../../utils/salaryUtils';

export function evaluateTradeMachineExecution(args: {
  teamAId: number;
  teamBId: number;
  teamAPlayers: NBAPlayer[];
  teamBPlayers: NBAPlayer[];
  teamAPicks: DraftPick[];
  teamBPicks: DraftPick[];
  activeTeams: NBATeam[];
  activePlayers: NBAPlayer[];
  currentYear: number;
  powerRanksMap: Map<number, number>;
  teamOutlooks: Map<number, TradeOutlook>;
  tvContext: TVContext;
  classStrengthByYear: Map<number, number>;
  lotterySlotByTid: Map<number, number>;
  state: any;
  teamACashUSD: number;
  teamBCashUSD: number;
}): {
  accepted: boolean;
  gmName: string;
  reason: string;
  suggestion?: string;
  suggestedPlayerIds: Set<string>;
  suggestedPickIds: Set<number>;
} {
  const {
    teamAId,
    teamBId,
    teamAPlayers,
    teamBPlayers,
    teamAPicks,
    teamBPicks,
    activeTeams,
    activePlayers,
    currentYear,
    powerRanksMap,
    teamOutlooks,
    tvContext,
    classStrengthByYear,
    lotterySlotByTid,
    state,
    teamACashUSD,
    teamBCashUSD,
  } = args;

  const otherTeam = activeTeams.find(t => t.id === teamBId);
  const otherGMName = otherTeam ? `${otherTeam.name} GM` : 'Their GM';
  const tradeDifficulty = SettingsManager.getSettings().tradeDifficulty ?? 50;
  const result = evaluateTradeAcceptance({
    fromTid: teamAId,
    toTid: teamBId,
    fromItems: [
      ...teamAPlayers.map(p => ({ type: 'player' as const, player: p })),
      ...teamAPicks.map(pk => ({ type: 'pick' as const, pick: pk })),
    ],
    toItems: [
      ...teamBPlayers.map(p => ({ type: 'player' as const, player: p })),
      ...teamBPicks.map(pk => ({ type: 'pick' as const, pick: pk })),
    ],
    teams: activeTeams,
    currentYear,
    powerRanks: powerRanksMap,
    teamOutlooks,
    tvContext,
    tradeDifficulty,
    classStrengthByYear,
    lotterySlotByTid,
    toTeamRoster: activePlayers.filter(p => p.tid === teamBId),
    maxRoster: state.leagueStats?.maxStandardPlayersPerTeam ?? 15,
    leagueStats: state.leagueStats,
    currentDate: state.date,
    allPlayers: activePlayers,
    fromCashUSD: teamACashUSD,
    toCashUSD: teamBCashUSD,
  });

  const { accepted, reason, shortfall } = result;
  let suggestion: string | undefined;
  const suggestedPlayerIds = new Set<string>();
  const suggestedPickIds = new Set<number>();

  if (!accepted) {
    const fromMode: TeamMode = roleToMode(teamOutlooks.get(teamAId)?.role ?? 'neutral');
    const gap = shortfall + 5;
    const userRoster = activePlayers.filter(p => p.tid === teamAId && !teamAPlayers.some(x => x.internalId === p.internalId));
    const userPicks = (state.draftPicks as DraftPick[]).filter(pk => pk.tid === teamAId && !teamAPicks.some(x => x.dpid === pk.dpid));
    type Candidate = { kind: 'player' | 'pick'; id: string | number; name: string; tv: number };
    const candidates: Candidate[] = [
      ...userRoster.map<Candidate>(p => ({ kind: 'player', id: p.internalId, name: p.name, tv: calcPlayerTV(p, fromMode, currentYear, tvContext) })),
      ...userPicks.map<Candidate>(pk => ({
        kind: 'pick',
        id: pk.dpid,
        name: formatPickLabel(pk, currentYear, lotterySlotByTid, false),
        tv: calcPickTV(
          pk.round,
          powerRanksMap.get(pk.originalTid) ?? Math.ceil(activeTeams.length / 2),
          activeTeams.length,
          Math.max(1, pk.season - currentYear),
          {
            classStrength: classStrengthByYear.get(pk.season) ?? 1.0,
            actualSlot: pk.round === 1 && pk.season === currentYear ? lotterySlotByTid.get(pk.originalTid) : undefined,
          },
        ),
      })),
    ].filter(c => c.tv > 0);

    const picked: Candidate[] = [];
    let remaining = gap;
    for (let i = 0; i < 3 && remaining > 3; i++) {
      const chosen = candidates
        .filter(c => !picked.some(p => p.id === c.id))
        .sort((a, b) => Math.abs(a.tv - remaining) - Math.abs(b.tv - remaining))[0];
      if (!chosen) break;
      picked.push(chosen);
      remaining -= chosen.tv;
    }

    if (picked.length > 0) {
      const names = picked.map(p => p.name);
      const formatted = names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
      suggestion = `We'd work with this if you threw in ${formatted} on top.`;
      for (const c of picked) {
        if (c.kind === 'player') suggestedPlayerIds.add(c.id as string);
        else suggestedPickIds.add(c.id as number);
      }
    }
  }

  return { accepted, gmName: otherGMName, reason, suggestion, suggestedPlayerIds, suggestedPickIds };
}
