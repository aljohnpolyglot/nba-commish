import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../../../../store/GameContext';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { getCapThresholds, getMLEAvailability } from '../../../../../utils/salaryUtils';
import { formatExternalSalary } from '../../../../../constants';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import { isPlausibleActiveMarket } from '../../../../../services/freeAgencyBidding';
import { formatGameDateShort, getCurrentOffseasonEffectiveFAStart, getCurrentOffseasonFAMoratoriumEnd, isInMoratorium, parseGameDate } from '../../../../../utils/dateUtils';
import type { NBAPlayer } from '../../../../../types';
import { resolveAnyTeam } from '../../../../../utils/teamLookup';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../../../../utils/uiMode';
import { isPbaRosterLocal } from '../../../../../services/pba/importManager';
import { preparePbaLocalFreeAgency } from '../../../../../services/pba/localFreeAgency';
import { isRfaMatchingEnabled } from '../../../../../utils/ruleFlags';
import { isFutureDraftClassPlayer, isUnavailableInternationalTournamentPlayer } from '../../../../../utils/prospectUtils';
import { TeamIntelFreeAgencyBidTracker } from './TeamIntelFreeAgencyBidTracker';
import {
  MoratoriumHeadsUpModal,
  Stat,
} from './TeamIntelFreeAgencyOverlays';
import {
  type FreeAgencyMarket,
  type SortConfig,
  type TierFilter,
  filterTopFreeAgents,
  fmtUSD,
  sortTopFreeAgents,
} from './TeamIntelFreeAgencyShared';
import { TeamIntelFreeAgencyTopDrawer } from './TeamIntelFreeAgencyTopDrawer';
import { getTeamFreeAgencyCapSummary } from '../../../../../services/freeAgency/capProjection';

interface Props {
  teamId: number;
  onPlayerClick?: (player: NBAPlayer) => void;
}

const isOpenFreeAgent = (player: NBAPlayer): boolean =>
  player.tid === -1 && player.status === 'Free Agent' && !isUnavailableInternationalTournamentPlayer(player);

export function TeamIntelFreeAgency({ teamId }: Props) {
  const { state, dispatchAction } = useGame();
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);
  const directSigningMode = euroIsolated || pbaIsolated;
  const birdRightsEnabled = !directSigningMode && state.leagueStats?.birdRightsEnabled !== false;
  const rfaEnabled = !directSigningMode && isRfaMatchingEnabled(state.leagueStats);
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const marketEligibilityYear = state.date ? parseGameDate(state.date).getUTCFullYear() : currentYear;
  const quick = usePlayerQuickActions();
  const allTeams = useMemo(
    () => [
      ...(state.teams ?? []),
      ...((state.nonNBATeams ?? [])
        .map(nonNBA => resolveAnyTeam(nonNBA.tid, state.teams, state.nonNBATeams ?? []))
        .filter((resolved): resolved is NonNullable<typeof team> => resolved !== null)),
    ],
    [state.nonNBATeams, state.teams, team],
  );
  const isMoratoriumActive = !directSigningMode && state.date
    ? isInMoratorium(state.date, currentYear, state.leagueStats as any, state.schedule as any)
    : false;
  const freeAgencyStartLabel = state.date
    ? formatGameDateShort(getCurrentOffseasonEffectiveFAStart(state.date, state.leagueStats as any, state.schedule as any))
    : 'the saved opening date';
  const moratoriumEndLabel = state.date
    ? formatGameDateShort(getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any))
    : 'the moratorium ends';
  const faHeadsUpKey = `team-intel-fa-moratorium-headsup-${state.saveId ?? 'default'}-${currentYear}`;
  const [showFaHeadsUp, setShowFaHeadsUp] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ col: 'k2', dir: 'desc' });
  const [faPage, setFaPage] = useState(1);
  const [faPerPage, setFaPerPage] = useState(25);
  const fmtMoney = (value: number) =>
    pbaIsolated
      ? formatExternalSalary(value, 'PBA')
      : directSigningMode
        ? formatCurrencyWithCode(value, state.leagueStats?.currency ?? 'EUR', false)
        : fmtUSD(value);

  useEffect(() => {
    if (!pbaIsolated) return;
    const patch = preparePbaLocalFreeAgency(state);
    if (Object.keys(patch).length === 0) return;
    dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
  }, [pbaIsolated, state, dispatchAction]);

  useEffect(() => {
    if (!isOwnTeam || !isMoratoriumActive) {
      setShowFaHeadsUp(false);
      return;
    }
    try {
      if (window.localStorage.getItem(faHeadsUpKey)) return;
    } catch {}
    setShowFaHeadsUp(true);
  }, [faHeadsUpKey, isMoratoriumActive, isOwnTeam]);

  const dismissFaHeadsUp = () => {
    try {
      window.localStorage.setItem(faHeadsUpKey, '1');
    } catch {}
    setShowFaHeadsUp(false);
  };

  const allFAs = useMemo(
    () => state.players.filter(player => {
      const draftYear = Number((player as any).draft?.year ?? 0);
      if (pbaIsolated) {
        if (player.tid === -2 || player.status === 'Prospect' || player.status === 'Draft Prospect') return false;
        if (Number.isFinite(draftYear) && draftYear > currentYear) return false;
        if (!isOpenFreeAgent(player)) return false;
        return isPbaRosterLocal(player, state.leagueStats as any);
      }
      if (!isOpenFreeAgent(player)) return false;
      if (isFutureDraftClassPlayer(player, marketEligibilityYear)) return false;
      return player.tid === -1 && player.status === 'Free Agent';
    }),
    [state.players, currentYear, marketEligibilityYear, pbaIsolated, state.leagueStats],
  );
  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);
  const capSummary = useMemo(
    () => getTeamFreeAgencyCapSummary(state, teamId),
    [state, teamId],
  );
  const capSpaceUSD = capSummary.capSpaceUSD;
  const mleAvail = useMemo(
    () => getMLEAvailability(teamId, capSummary.payrollUSD, 0, thresholds, state.leagueStats as any),
    [teamId, capSummary.payrollUSD, thresholds, state.leagueStats],
  );
  const reservedMleUSD = useMemo(() => {
    if (mleAvail.blocked || mleAvail.type == null) return 0;
    const markets = (state.faBidding?.markets ?? []) as FreeAgencyMarket[];
    return markets
      .filter(market => !market.resolved)
      .reduce((sum, market) => {
        const myTopActive = market.bids
          .filter(bid => bid.teamId === teamId && bid.status === 'active')
          .sort((a, b) => b.salaryUSD - a.salaryUSD)[0];
        return sum + (myTopActive?.salaryUSD ?? 0);
      }, 0);
  }, [mleAvail.blocked, mleAvail.type, state.faBidding?.markets, teamId]);
  const mleAvailableNetUSD = Math.max(0, (mleAvail.blocked ? 0 : mleAvail.available) - reservedMleUSD);
  const allMarkets = useMemo<FreeAgencyMarket[]>(() => {
    if (!pbaIsolated) return (state.faBidding?.markets ?? []) as FreeAgencyMarket[];
    return (state.pbaLocalFreeAgency?.markets ?? []).map(market => {
      const activeDecisionDays = market.bids
        .filter(bid => bid.status === 'active')
        .map(bid => bid.resolvesOnDay);
      return {
        ...market,
        decidesOnDay: activeDecisionDays.length > 0
          ? Math.min(...activeDecisionDays)
          : state.day,
      };
    });
  }, [pbaIsolated, state.faBidding?.markets, state.pbaLocalFreeAgency?.markets, state.day]);
  const trackedMarkets = useMemo(
    () =>
      allMarkets
        .filter(market => {
          const player = state.players.find(entry => entry.internalId === market.playerId);
          return pbaIsolated
            ? !market.resolved && !!player && isOpenFreeAgent(player)
            : isPlausibleActiveMarket(market as any, state, player);
        })
        .filter(market => market.bids.some(bid => bid.teamId === teamId))
        .map(market => {
          const player = state.players.find(entry => entry.internalId === market.playerId);
          const userBid = [...market.bids].reverse().find(bid =>
            bid.isUserBid || bid.teamId === state.userTeamId
          );
          return { market, player, userBid };
        }),
    [allMarkets, teamId, state.players, state.userTeamId, pbaIsolated],
  );

  const topFAsForDrawer = useMemo(
    () => sortTopFreeAgents(filterTopFreeAgents(allFAs, tierFilter, currentYear, state), sortConfig, state.leagueStats),
    [allFAs, currentYear, tierFilter, sortConfig, state, state.leagueStats],
  );
  const faTotalPages = Math.max(1, Math.ceil(topFAsForDrawer.length / faPerPage));
  const visibleTopFAs = topFAsForDrawer.slice((faPage - 1) * faPerPage, faPage * faPerPage);

  useEffect(() => {
    setFaPage(1);
  }, [tierFilter, sortConfig.col, sortConfig.dir, faPerPage]);

  const handleSort = (col: string) => {
    setSortConfig(prev => ({
      col,
      dir: prev.col === col && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
      <MoratoriumHeadsUpModal open={showFaHeadsUp} freeAgencyStartLabel={freeAgencyStartLabel} moratoriumEndLabel={moratoriumEndLabel} onClose={dismissFaHeadsUp} />
      <div className="h-full flex flex-col gap-3">
        {!directSigningMode && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-[#30363d] bg-black/40 p-4">
            <Stat label={capSummary.isProjectedAfterSeasonEnd ? 'Projected Cap Space' : 'Cap Space'} value={fmtUSD(capSpaceUSD)} tone={capSpaceUSD < 0 ? 'red' : 'emerald'} />
            <Stat label="MLE Available" value={mleAvail.blocked ? '—' : fmtUSD(mleAvailableNetUSD)} />
          </div>
        )}

        <div className="min-h-0 flex-1">
          <TeamIntelFreeAgencyBidTracker
            euroIsolated={euroIsolated}
            isOwnTeam={isOwnTeam}
            team={team}
            teams={allTeams as any}
            state={state}
            currentYear={currentYear}
            trackedMarkets={trackedMarkets}
            fmtUSD={fmtMoney}
            onOpenPlayer={player => player && quick.openFor(player)}
          />
        </div>

        <TeamIntelFreeAgencyTopDrawer
          tierFilter={tierFilter}
          sortConfig={sortConfig}
          birdRightsEnabled={birdRightsEnabled}
          rfaEnabled={rfaEnabled}
          euroIsolated={euroIsolated}
          teamId={teamId}
          teams={allTeams as any}
          allMarkets={allMarkets}
          leagueStats={state.leagueStats}
          visibleTopFAs={visibleTopFAs}
          totalTopFAs={topFAsForDrawer.length}
          faPage={faPage}
          faPerPage={faPerPage}
          faTotalPages={faTotalPages}
          fmtMoney={fmtMoney}
          onSetTierFilter={setTierFilter}
          onHandleSort={handleSort}
          onOpenPlayer={player => quick.openFor(player)}
          onSetFaPerPage={value => {
            setFaPerPage(value);
            setFaPage(1);
          }}
          onPrevPage={() => setFaPage(page => Math.max(1, page - 1))}
          onNextPage={() => setFaPage(page => Math.min(faTotalPages, page + 1))}
        />

      </div>
      {createPortal(quick.portals, document.body)}
    </>
  );
}
