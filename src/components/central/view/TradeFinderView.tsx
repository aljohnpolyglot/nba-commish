import React, { useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import {
  calcOvr2K, calcPot2K, calcPlayerTV, calcPickTV,
  computeLeagueAvg, computeLeaguePerAvg, getPotColor, isSalaryLegal, isUntouchable,
  type TeamMode, type TVContext,
} from '../../../services/trade/tradeValueEngine';
import { getTradeOutlook, effectiveRecord, getCapThresholds, getTeamPayrollUSD, getTeamCapProfileFromState, sumPlayerCurrentSalariesUSD, topNAvgK2, resolveManualOutlook, type TradeOutlook } from '../../../utils/salaryUtils';
import type { NBAPlayer, DraftPick, NBATeam } from '../../../types';
import { generateCounterOffers, teamPowerRanks } from '../../../services/trade/tradeFinderEngine';
import { SettingsManager } from '../../../services/SettingsManager';
import { getMinTradableSeason, getMaxTradableSeason, getTradablePicks, DEFAULT_TRADABLE_PICK_SEASONS } from '../../../services/draft/DraftPickGenerator';
import { buildClassStrengthMap, buildFullDraftSlotMap, comparePicks, formatPickLabel } from '../../../services/draft/draftClassStrength';
import { tradeRoleToTeamMode, resolveTeamStrategyProfile } from '../../../utils/teamStrategy';
import { wouldStepienViolateForTid } from '../../../services/trade/stepienRule';
import { validateCBATradeRules } from '../../../utils/cbaTradeRules';
import { getGameDateParts, isInPostDeadlinePreFAWindow } from '../../../utils/dateUtils';
import { isFranchiseLifer } from '../../../utils/playerTenure';
import { AwardService } from '../../../services/logic/AwardService';
import { isPbaIsolatedMode } from '../../../utils/uiMode';
import { getActiveLeagueTeams, isOnRoster } from '../../../utils/teamLookup';
import { TradeFinderHeader } from './TradeFinderHeader';
import { AssetSelectorPanel, TradeFinderResultsPanel } from './TradeFinderPanels';
import { OfferCard } from './TradeFinderItemComponents';
import { TradeFinderModalStack } from './TradeFinderModalStack';
import { type FoundOffer, type ManageTradeState, type TradeItem } from './TradeFinderTypes';
import { isPbaImportTradeLocked } from './TradeFinderGuards';

// ── Main component ────────────────────────────────────────────────────────────

export { OfferCard };
export type { FoundOffer, TradeItem };

export const TradeFinderView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const { players: allPlayers, teams: nbaTeams, draftPicks } = state;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const pbaMode = isPbaIsolatedMode(state);
  const teams = useMemo(() => {
    if (!pbaMode) return nbaTeams;
    return getActiveLeagueTeams({
      teams: nbaTeams,
      nonNBATeams: state.nonNBATeams ?? [],
      userTeamId: state.userTeamId,
    });
  }, [pbaMode, nbaTeams, state.nonNBATeams, state.userTeamId]);
  const activeTeamIds = useMemo(() => new Set(teams.map(t => t.id)), [teams]);
  const players = useMemo(() => {
    if (!pbaMode) return allPlayers;
    return allPlayers.filter(p => activeTeamIds.has(p.tid) && isOnRoster(p));
  }, [pbaMode, allPlayers, activeTeamIds]);

  const isGM = state.gameMode === 'gm';
  const [selectedTid, setSelectedTid] = useState<number>(isGM && state.userTeamId != null ? state.userTeamId : (teams[0]?.id ?? 0));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'roster' | 'picks'>('roster');
  const [mobilePanel, setMobilePanel] = useState<'assets' | 'offers'>('assets');
  const [basket, setBasket] = useState<TradeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [foundOffers, setFoundOffers] = useState<FoundOffer[] | null>(null);
  const [manageTrade, setManageTrade] = useState<ManageTradeState | null>(null);

  const powerRanks = useMemo(() => teamPowerRanks(teams, currentYear), [teams, currentYear]);
  const classStrengthByYear = useMemo(
    () => buildClassStrengthMap(players, currentYear, currentYear, getMaxTradableSeason(state)),
    [players, currentYear, state.leagueStats?.tradableDraftPickSeasons],
  );
  const lotterySlotByTid = useMemo(
    () => buildFullDraftSlotMap((state as any).draftLotteryResult, teams),
    [(state as any).draftLotteryResult, teams],
  );
  const leagueAvg = useMemo(() => computeLeagueAvg(players, teams), [players, teams]);
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);

  const mvpRank = useMemo(() => {
    const top30 = AwardService.calculateMVPRankings(players, teams, currentYear, 30);
    const map = new Map<string, number>();
    top30.forEach((c, i) => map.set(c.player.internalId, i + 1));
    return map;
  }, [players, teams, currentYear]);
  const tvContext: TVContext = useMemo(() => {
    const month = state.date ? getGameDateParts(state.date).month : 0;
    const isRegularSeason = (month >= 10 && month <= 12) || (month >= 1 && month <= 4);
    return {
      leaguePerAvg: isRegularSeason ? computeLeaguePerAvg(players, currentYear) : 15,
      isRegularSeason,
      mvpRank,
    };
  }, [players, currentYear, state.date, mvpRank]);

  const capSpaces = useMemo(() => {
    if (state.leagueStats?.salaryCapEnabled === false) return new Map<number, number>();
    const map = new Map<number, number>();
    teams.forEach(t => {
      const profile = getTeamCapProfileFromState(state, t.id, thresholds);
      map.set(t.id, profile.capSpaceUSD / 1000); // cap profile is USD; basket salary is thousands
    });
    return map;
  }, [teams, thresholds, state]);

  const confStandings = useMemo(() => {
    const map = new Map<number, { confRank: number; gbFromLeader: number }>();
    const groups = Array.from(new Set(teams.map(t => (t.conference ?? '').trim()).filter(Boolean)));
    const confs = groups.length > 0 ? groups : [''];
    for (const conf of confs) {
      const confTeams = teams.filter(t => ((t.conference ?? '').trim() || '') === conf).map(t => ({
        t, rec: effectiveRecord(t, currentYear),
      })).sort((a, b) => (b.rec.wins - b.rec.losses) - (a.rec.wins - a.rec.losses));
      const leader = confTeams[0];
      const lw = leader?.rec.wins ?? 0;
      const ll = leader?.rec.losses ?? 0;
      confTeams.forEach(({ t, rec }, i) => {
        const gb = Math.max(0, ((lw - rec.wins) + (rec.losses - ll)) / 2);
        map.set(t.id, { confRank: i + 1, gbFromLeader: gb });
      });
    }
    return map;
  }, [teams, currentYear]);

  const teamOutlooks = useMemo(() => {
    const map = new Map<number, TradeOutlook>();
    teams.forEach(t => {
      const manual = resolveManualOutlook(t, state.gameMode, state.userTeamId);
      if (manual) { map.set(t.id, manual); return; }
      const payroll = getTeamPayrollUSD(players, t.id, t, currentYear);
      const standings = confStandings.get(t.id);
      const expiring = players.filter(p => p.tid === t.id && (p.contract?.exp ?? 0) <= currentYear).length;
      const rec = effectiveRecord(t, currentYear);
      const starAvg = topNAvgK2(players, t.id, 3);
      map.set(t.id, getTradeOutlook(
        payroll,
        rec.wins,
        rec.losses,
        expiring,
        thresholds,
        standings?.confRank,
        standings?.gbFromLeader,
        starAvg,
      ));
    });
    return map;
  }, [teams, players, thresholds, confStandings, currentYear, state.gameMode, state.userTeamId]);

  const teamStrategies = useMemo(() => {
    const map = new Map<number, string>();
    teams.forEach(t => {
      const profile = resolveTeamStrategyProfile({
        team: t,
        players,
        teams,
        leagueStats: state.leagueStats,
        currentYear,
        gameMode: state.gameMode,
        userTeamId: state.userTeamId,
      });
      map.set(t.id, profile.label);
    });
    return map;
  }, [teams, players, state.leagueStats, currentYear, state.gameMode, state.userTeamId]);

  const roleToMode = (role: string): TeamMode => {
    return tradeRoleToTeamMode(role);
  };

  const selectedTeam = teams.find(t => t.id === selectedTid);
  const teamsWithRecord = useMemo(() =>
    teams.map(t => ({ ...t, wins: (t as any).wins ?? 0, losses: (t as any).losses ?? 0 })),
  [teams]);

  const teamRoster = useMemo(() =>
    players.filter(p =>
      p.tid === selectedTid &&
      isOnRoster(p) &&
      p.tid !== -2 && p.status !== 'Draft Prospect'
    ).sort((a, b) => b.overallRating - a.overallRating),
  [players, selectedTid]);
  const tradePartnerCount = Math.max(0, teams.length - 1);

  const filteredRoster = useMemo(() =>
    teamRoster.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
  [teamRoster, search]);

  const minTradableSeason = getMinTradableSeason(state);
  const tradablePicks = useMemo(() => getTradablePicks(state), [draftPicks, state.leagueStats?.year, state.leagueStats?.tradableDraftPickSeasons, (state as any).draftComplete]);
  const teamPicksList = useMemo(() =>
    tradablePicks.filter(pk => pk.tid === selectedTid).sort((a, b) => comparePicks(a, b, currentYear, lotterySlotByTid)),
  [tradablePicks, selectedTid, currentYear, lotterySlotByTid]);

  const filteredPicks = useMemo(() =>
    teamPicksList.filter(pk => {
      const orig = teams.find(t => t.id === pk.originalTid);
      return !search || (orig?.name ?? '').toLowerCase().includes(search.toLowerCase()) || String(pk.season).includes(search);
    }),
  [teamPicksList, search, teams]);

  const basketIds = useMemo(() => new Set(basket.map(i => i.id)), [basket]);

  React.useEffect(() => {
    if (!pbaMode) return;
    const hasLockedImport = basket.some(item => item.type === 'player' && item.player && isPbaImportTradeLocked(item.player, true));
    if (!hasLockedImport) return;
    setBasket(current => {
      const filtered = current.filter(item => item.type !== 'player' || !item.player || !isPbaImportTradeLocked(item.player, true));
      return filtered.length === current.length ? current : filtered;
    });
    setFoundOffers(null);
  }, [pbaMode, basket]);

  const mySalary = useMemo(() =>
    basket.filter(i => i.type === 'player').reduce((s, i) => s + (i.player?.contract?.amount ?? 0), 0),
  [basket]);
  const myDisplaySalaryUSD = useMemo(
    () => sumPlayerCurrentSalariesUSD(
      basket.filter(i => i.type === 'player').map(i => i.player!).filter(Boolean) as any[],
      currentYear,
    ),
    [basket, currentYear],
  );

  const myMode = roleToMode(teamOutlooks.get(selectedTid)?.role ?? 'neutral');
  const isReverseMode = isGM && state.userTeamId != null && selectedTid !== state.userTeamId;

  const addPlayer = (player: NBAPlayer) => {
    if (isPbaImportTradeLocked(player, pbaMode)) return;
    if (basketIds.has(player.internalId)) return removeItem(player.internalId);
    let val = calcPlayerTV(player, myMode, currentYear, tvContext);
    if (isReverseMode && isUntouchable(player, myMode, currentYear, tvContext.mvpRank)) {
      const tier = val >= 200 ? 0.60
                 : val >= 150 ? 0.30
                 : val >= 100 ? 0.15
                 :               0.10;
      val = Math.round(val * (1 + tier));
    }
    setBasket(b => [...b, {
      id: player.internalId,
      type: 'player',
      label: player.name,
      val,
      player,
      ovr: calcOvr2K(player),
      pot: calcPot2K(player, currentYear),
    }]);
    setFoundOffers(null);
  };

  const addPick = (pick: DraftPick) => {
    const key = String(pick.dpid);
    if (basketIds.has(key)) return removeItem(key);
    const rank = powerRanks.get(pick.originalTid) ?? Math.ceil(teams.length / 2);
    const classStrength = classStrengthByYear.get(pick.season) ?? 1.0;
    const actualSlot = pick.round === 1 && pick.season === currentYear
      ? lotterySlotByTid.get(pick.originalTid)
      : undefined;
    setBasket(b => [...b, {
      id: key,
      type: 'pick',
      label: formatPickLabel(pick, currentYear, lotterySlotByTid, false),
      val: calcPickTV(pick.round, rank, teams.length, Math.max(1, pick.season - currentYear), { classStrength, actualSlot }),
      pick,
    }]);
    setFoundOffers(null);
  };

  const removeItem = (id: string) => { setBasket(b => b.filter(i => i.id !== id)); setFoundOffers(null); };
  const clearBasket = () => { setBasket([]); setFoundOffers(null); };

  React.useEffect(() => {
    const pre = (state as any).tradeFinderPreselect as { tid: number; playerId: string } | undefined;
    if (!pre) return;
    const player = players.find(p => p.internalId === pre.playerId && p.tid === pre.tid);
    if (player && !isPbaImportTradeLocked(player, pbaMode)) {
      setSelectedTid(pre.tid);
      setBasket([{
        id: player.internalId,
        type: 'player',
        label: player.name,
        val: calcPlayerTV(player, roleToMode(teamOutlooks.get(pre.tid)?.role ?? 'neutral'), currentYear, tvContext),
        player,
        ovr: calcOvr2K(player),
        pot: calcPot2K(player, currentYear),
      }]);
      setFoundOffers(null);
    }
    dispatchAction({ type: 'UPDATE_STATE', payload: { tradeFinderPreselect: undefined } } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(state as any).tradeFinderPreselect]);

  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [ownerWarningOpen, setOwnerWarningOpen] = useState(false);
  const [ownerWarningLifer, setOwnerWarningLifer] = useState<string | null>(null);
  const [ownerWarningMode, setOwnerWarningMode] = useState<'reverse' | 'own'>('reverse');

  const findOffers = (allowLifers = false) => {
    if (basket.length === 0) return;

    if (!allowLifers) {
      const lifer = basket.find(item => {
        if (item.type !== 'player' || !item.player) return false;
        return isFranchiseLifer(item.player);
      });
      if (lifer && (isReverseMode || isGM)) {
        setOwnerWarningLifer(lifer.label);
        setOwnerWarningMode(isReverseMode ? 'reverse' : 'own');
        setOwnerWarningOpen(true);
        return;
      }
    }

    setIsSearching(true);
    setFoundOffers(null);

    setTimeout(() => {
      const myVal = basket.reduce((s, i) => s + i.val, 0);

      const engineOffers = generateCounterOffers({
        fromTid: selectedTid,
        offerValue: myVal,
        usedIds: new Set(basket.map(i => i.id)),
        players,
        teams,
        draftPicks: tradablePicks,
        currentYear,
        minTradableSeason,
        powerRanks,
        teamOutlooks: teamOutlooks as any,
        tvContext,
        capSpaces,
        classStrengthByYear,
        lotterySlotByTid,
        targetTids: isReverseMode ? [state.userTeamId!] : undefined,
        tradeDifficulty: isGM ? (SettingsManager.getSettings().tradeDifficulty ?? 50) : undefined,
        bypassUntouchablesForTid: isReverseMode && myVal >= 140 ? state.userTeamId! : undefined,
        allowLifers,
        stepienEnabled: state.leagueStats?.stepienRuleEnabled !== false,
        tradablePickWindow: state.leagueStats?.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS,
        isPostDeadlinePreFA: !pbaMode && isInPostDeadlinePreFAWindow(state.date, currentYear, state.leagueStats as any),
        recentlySignedLockMs: {
          currentDate: state.date ?? '',
          leagueStats: state.leagueStats as any,
        },
        allowPbaRoster: pbaMode,
      });

      const offers: FoundOffer[] = engineOffers.map(o => {
        const offerPlayers = o.items.filter(i => i.type === 'player' && i.player).map(i => i.player!);
        const offerPicks = o.items.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!);
        const basketPlayers = basket.filter(i => i.type === 'player' && i.player).map(i => i.player!);
        const basketPicks = basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!);
        const cba = validateCBATradeRules({
          teamAId: selectedTid,
          teamBId: o.tid,
          teamAPlayers: basketPlayers,
          teamBPlayers: offerPlayers,
          teamAPicks: basketPicks,
          teamBPicks: offerPicks,
          teams,
          players,
          leagueStats: state.leagueStats as any,
          currentDate: state.date ?? '',
          currentYear,
        });
        return {
          tid: o.tid,
          items: o.items as TradeItem[],
          outlook: teamOutlooks.get(o.tid) ?? { role: 'neutral', label: 'Neutral', color: 'text-slate-400', bgColor: 'bg-slate-700/40', dot: '#94a3b8', reason: '' },
          strategyLabel: teamStrategies.get(o.tid),
          variant: o.variant,
          cbaValid: cba.ok,
          cbaReason: cba.reason,
          cbaOffendingSide: cba.offendingSide,
        };
      });

      setFoundOffers(offers);
      setIsSearching(false);

      if (isReverseMode && offers.length === 0) {
        setRejectionOpen(true);
      }
    }, 80);
  };

  const handleManageTrade = (offer: FoundOffer) => {
    if (isReverseMode) {
      setManageTrade({
        teamAId: offer.tid,       // user's team (engine's target in reverse)
        teamBId: selectedTid,     // shopped team
        teamAPlayerIds: offer.items.filter(i => i.type === 'player').map(i => i.id),
        teamBPlayerIds: basket.filter(i => i.type === 'player').map(i => i.id),
        teamAPickDpids: offer.items.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
        teamBPickDpids: basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
        preAccepted: offer.variant === 'absorb',
      });
      return;
    }
    setManageTrade({
      teamAId: selectedTid,
      teamBId: offer.tid,
      teamAPlayerIds: basket.filter(i => i.type === 'player').map(i => i.id),
      teamBPlayerIds: offer.items.filter(i => i.type === 'player').map(i => i.id),
      teamAPickDpids: basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
      teamBPickDpids: offer.items.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!.dpid),
      preAccepted: offer.variant === 'absorb',
    });
  };

  const handleExecuteTrade = (payload: any) => {
    dispatchAction({ type: 'EXECUTIVE_TRADE', payload } as any);
    setManageTrade(null);
    clearBasket();
  };

  return (
    <div className="h-full flex flex-col bg-[#0f172a] text-slate-200 overflow-hidden">
      <TradeFinderHeader
        tradePartnerCount={tradePartnerCount}
        mobilePanel={mobilePanel}
        setMobilePanel={setMobilePanel}
        basketCount={basket.length}
        offerCount={foundOffers?.length ?? 0}
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <AssetSelectorPanel
          mobilePanel={mobilePanel}
          dropdownOpen={dropdownOpen}
          setDropdownOpen={setDropdownOpen}
          isGM={isGM}
          selectedTid={selectedTid}
          setSelectedTid={setSelectedTid}
          userTeamId={state.userTeamId}
          clearBasket={clearBasket}
          teamsWithRecord={teamsWithRecord}
          search={search}
          setSearch={setSearch}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          teamRoster={teamRoster}
          teamPicksList={teamPicksList}
          filteredRoster={filteredRoster}
          filteredPicks={filteredPicks}
          basketIds={basketIds}
          addPlayer={addPlayer}
          addPick={addPick}
          selectedTeam={selectedTeam}
          stateDate={state.date ?? ''}
          currentYear={currentYear}
          stateLeagueStats={state.leagueStats}
          teams={teams}
          powerRanks={powerRanks}
          lotterySlotByTid={lotterySlotByTid}
          draftPicks={draftPicks}
          stateTradableDraftPickSeasons={state.leagueStats?.tradableDraftPickSeasons}
          basket={basket}
          wouldStepienViolateForTid={wouldStepienViolateForTid}
        />

        <TradeFinderResultsPanel
          mobilePanel={mobilePanel}
          basket={basket}
          myDisplaySalaryUSD={myDisplaySalaryUSD}
          removeItem={removeItem}
          clearBasket={clearBasket}
          setMobilePanel={setMobilePanel}
          findOffers={findOffers}
          isSearching={isSearching}
          foundOffers={foundOffers}
          teams={teams}
          capSpaces={capSpaces}
          currentYear={currentYear}
          stateDate={state.date ?? ''}
          currencyCode={state.leagueStats?.currency ?? 'USD'}
          nonNBATeams={state.nonNBATeams ?? []}
          handleManageTrade={handleManageTrade}
        />
      </div>

      <TradeFinderModalStack
        manageTrade={manageTrade}
        onCloseManageTrade={() => setManageTrade(null)}
        onConfirmTrade={handleExecuteTrade}
        ownerWarningOpen={ownerWarningOpen}
        selectedTeam={selectedTeam}
        ownerWarningLifer={ownerWarningLifer}
        ownerWarningMode={ownerWarningMode}
        onCloseOwnerWarning={() => {
          setOwnerWarningOpen(false);
          setOwnerWarningLifer(null);
        }}
        onIgnoreOwnerWarning={() => {
          setOwnerWarningOpen(false);
          setOwnerWarningLifer(null);
          findOffers(true);
        }}
        rejectionOpen={rejectionOpen}
        basket={basket}
        onCloseRejection={() => setRejectionOpen(false)}
      />
    </div>
  );
};
