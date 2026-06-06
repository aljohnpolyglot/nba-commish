import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../../../../store/GameContext';
import { PlayerSelectorItem } from '../../../../shared/PlayerSelectorGrid';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import { computeContractOffer, getCapThresholds, getMLEAvailability } from '../../../../../utils/salaryUtils';
import { getTradingBlock, saveTradingBlock } from '../../../../../store/tradingBlockStore';
import { usePlayerQuickActions } from '../../../../../hooks/usePlayerQuickActions';
import { isPlausibleActiveMarket } from '../../../../../services/freeAgencyBidding';
import { formatGameDateShort, getCurrentOffseasonFAMoratoriumEnd, isInMoratorium, parseGameDate } from '../../../../../utils/dateUtils';
import { getOffseasonState } from '../../../../../services/offseason/offseasonState';
import type { NBAPlayer } from '../../../../../types';
import { resolveAnyTeam } from '../../../../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../../../../utils/uiMode';
import { TeamIntelFreeAgencyBidTracker } from './TeamIntelFreeAgencyBidTracker';
import {
  AutoBidSummaryModal,
  MoratoriumHeadsUpModal,
  ShortlistEditorModal,
  Stat,
} from './TeamIntelFreeAgencyOverlays';
import { TeamIntelFreeAgencyShortlistPanel } from './TeamIntelFreeAgencyShortlistPanel';
import {
  type AutoBidSummary,
  type FreeAgencyMarket,
  type SortConfig,
  type TierFilter,
  SHORTLIST_CAP,
  filterTopFreeAgents,
  fmtUSD,
  getK2Ovr,
  sortTopFreeAgents,
} from './TeamIntelFreeAgencyShared';
import { TeamIntelFreeAgencyTopDrawer } from './TeamIntelFreeAgencyTopDrawer';

interface Props {
  teamId: number;
  onPlayerClick?: (player: NBAPlayer) => void;
}

export function TeamIntelFreeAgency({ teamId, onPlayerClick }: Props) {
  const { state, dispatchAction } = useGame();
  const team = resolveAnyTeam(teamId, state.teams, state.nonNBATeams ?? []);
  const euroIsolated = isEuroIsolatedMode(state);
  const birdRightsEnabled = state.leagueStats?.birdRightsEnabled !== false;
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
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
  const isMoratoriumActive = state.date ? isInMoratorium(state.date, currentYear, state.leagueStats as any, state.schedule as any) : false;
  const moratoriumEndLabel = state.date
    ? formatGameDateShort(getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any))
    : 'the moratorium ends';
  const faHeadsUpKey = `team-intel-fa-moratorium-headsup-${state.saveId ?? 'default'}-${currentYear}`;
  const [showFaHeadsUp, setShowFaHeadsUp] = useState(false);
  const [autoBidSummary, setAutoBidSummary] = useState<AutoBidSummary | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ col: 'k2', dir: 'desc' });
  const [faPage, setFaPage] = useState(1);
  const [faPerPage, setFaPerPage] = useState(25);
  const [editing, setEditing] = useState(false);
  const fmtMoney = (value: number) =>
    euroIsolated ? formatCurrencyWithCode(value, state.leagueStats?.currency ?? 'EUR', false) : fmtUSD(value);

  useEffect(() => {
    if (!isOwnTeam || !isMoratoriumActive) return;
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

  const initial = useMemo(() => {
    const saved = getTradingBlock(teamId);
    return new Set(saved?.faShortlistIds ?? []);
  }, [teamId]);
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(initial);

  useEffect(() => {
    if (!isOwnTeam) return;
    const existing = getTradingBlock(teamId);
    saveTradingBlock(teamId, {
      untouchableIds: existing?.untouchableIds ?? [],
      blockIds: existing?.blockIds ?? [],
      targetIds: existing?.targetIds ?? [],
      blockPickIds: existing?.blockPickIds ?? [],
      faShortlistIds: Array.from(shortlistIds),
    });
  }, [shortlistIds, isOwnTeam, teamId]);

  const allFAs = useMemo(
    () => state.players.filter(player => player.tid === -1 && player.status === 'Free Agent' && !((player as any).draft?.year >= currentYear)),
    [state.players, currentYear],
  );
  const faIdSet = useMemo(() => new Set(allFAs.map(player => player.internalId)), [allFAs]);

  useEffect(() => {
    setShortlistIds(prev => {
      const next = new Set([...prev].filter(id => faIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [faIdSet]);

  const shortlistedPlayers = useMemo(
    () => allFAs.filter(player => shortlistIds.has(player.internalId)),
    [allFAs, shortlistIds],
  );

  const thresholds = useMemo(() => getCapThresholds(state.leagueStats as any), [state.leagueStats]);
  const teamPayrollUSD = useMemo(
    () => state.players.filter(player => player.tid === teamId && !(player as any).twoWay).reduce((sum, player) => sum + ((player.contract?.amount ?? 0) * 1_000), 0),
    [state.players, teamId],
  );
  const offseasonPhase = state.date ? getOffseasonState(state.date, state.leagueStats as any, state.schedule as any).phase : 'inSeason';
  const isPreFA = offseasonPhase === 'preDraft' || offseasonPhase === 'draftDay' || offseasonPhase === 'postDraft' || offseasonPhase === 'moratorium';
  const isOffseasonView = offseasonPhase !== 'inSeason';
  const expiringSalaryUSD = useMemo(
    () =>
      isPreFA
        ? state.players
            .filter(
              player =>
                player.tid === teamId &&
                (player.contract?.exp ?? 0) === currentYear &&
                !(player as any).twoWay &&
                (player.contract as any)?.type !== 'TWO_WAY',
            )
            .reduce((sum, player) => sum + ((player.contract?.amount ?? 0) * 1_000), 0)
        : 0,
    [isPreFA, state.players, teamId, currentYear],
  );
  const projectedPayrollUSD = Math.max(0, teamPayrollUSD - expiringSalaryUSD);
  const capSpaceUSD = thresholds.salaryCap - projectedPayrollUSD;
  const mleAvail = useMemo(
    () => getMLEAvailability(teamId, projectedPayrollUSD, 0, thresholds, state.leagueStats as any),
    [teamId, projectedPayrollUSD, thresholds, state.leagueStats],
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
  const shortlistCommitUSD = useMemo(
    () => shortlistedPlayers.reduce((sum, player) => sum + computeContractOffer(player, state.leagueStats as any).salaryUSD, 0),
    [shortlistedPlayers, state.leagueStats],
  );
  const positiveCap = Math.max(0, capSpaceUSD);
  const mleRoom = mleAvailableNetUSD;
  const availableRoomUSD = positiveCap + mleRoom;
  const projectedRoomAfterShortlist = availableRoomUSD - shortlistCommitUSD;

  const allMarkets = (state.faBidding?.markets ?? []) as FreeAgencyMarket[];
  const trackedMarkets = useMemo(
    () =>
      allMarkets
        .filter(market => {
          const player = state.players.find(entry => entry.internalId === market.playerId);
          return isPlausibleActiveMarket(market as any, state, player);
        })
        .filter(market => shortlistIds.has(market.playerId) || market.bids.some(bid => bid.teamId === teamId))
        .map(market => {
          const player = state.players.find(entry => entry.internalId === market.playerId);
          const activeBids = market.bids.filter(bid => bid.status === 'active');
          const top = [...activeBids].sort((a, b) => b.salaryUSD - a.salaryUSD)[0];
          const userBid = activeBids.find(bid => bid.teamId === teamId);
          const rawDaysToDecide = Math.max(0, market.decidesOnDay - state.day);
          const daysToDecide = (() => {
            if (!isMoratoriumActive || !state.date) return rawDaysToDecide;
            const today = parseGameDate(state.date);
            const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(state.date, state.leagueStats as any, state.schedule as any);
            const moratoriumDays = Math.max(0, Math.ceil((moratoriumEnd.getTime() - today.getTime()) / 86_400_000));
            return Math.max(rawDaysToDecide, moratoriumDays);
          })();
          const decisionLabel = isMoratoriumActive && daysToDecide > 0
            ? `After moratorium (${moratoriumEndLabel})`
            : daysToDecide === 0
              ? 'Resolves today'
              : `Resolves in ${daysToDecide}d`;
          return { market, player, top, userBid, daysToDecide, decisionLabel };
        }),
    [allMarkets, shortlistIds, teamId, state.players, state.day, state.date, state.leagueStats, state.schedule, isMoratoriumActive, moratoriumEndLabel, state],
  );

  const topFAsForDrawer = useMemo(
    () => sortTopFreeAgents(filterTopFreeAgents(allFAs, tierFilter, currentYear), sortConfig, currentYear, state.leagueStats),
    [allFAs, currentYear, tierFilter, sortConfig, state.leagueStats],
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

  const toggleShortlist = (id: string) => {
    setShortlistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= SHORTLIST_CAP) return prev;
      next.add(id);
      return next;
    });
  };

  const submitAutoBid = (player: NBAPlayer): { ok: boolean; reason?: string } => {
    if (!isOwnTeam || !team) return { ok: false, reason: 'GM mode + own team only' };
    if (euroIsolated) {
      quick.handle(player, 'sign_player');
      return { ok: true };
    }

    const offer = computeContractOffer(player, state.leagueStats as any);
    const market = allMarkets.find(entry => entry.playerId === player.internalId && !entry.resolved);
    const topActive = market?.bids.filter(bid => bid.status === 'active' && !bid.isUserBid).sort((a, b) => b.salaryUSD - a.salaryUSD)[0];
    let salaryUSD = offer.salaryUSD;
    if (topActive && topActive.salaryUSD * 1.05 > salaryUSD) {
      salaryUSD = Math.round(topActive.salaryUSD * 1.05);
    }
    const room = capSpaceUSD + (mleAvail.blocked ? 0 : mleAvail.available);
    if (salaryUSD > room && room > 0) salaryUSD = room;
    if (salaryUSD <= 0) return { ok: false, reason: 'No cap room' };

    const wantsOption: 'NONE' | 'PLAYER' | 'TEAM' = getK2Ovr(player) >= 88 && offer.years >= 3 ? 'PLAYER' : 'NONE';
    dispatchAction({
      type: 'SUBMIT_FA_BID',
      payload: {
        playerId: player.internalId,
        playerName: player.name,
        teamId,
        teamName: team.name,
        teamLogoUrl: (team as any).logoUrl,
        salaryUSD,
        years: offer.years,
        option: wantsOption,
      },
    } as any);
    return { ok: true };
  };

  const submitAutoBidsAll = () => {
    if (!isOwnTeam) return;
    let submitted = 0;
    let skipped = 0;
    for (const player of shortlistedPlayers) {
      const result = submitAutoBid(player);
      if (result.ok) submitted++;
      else skipped++;
    }
    if (submitted > 0 || skipped > 0) {
      setAutoBidSummary({ submitted, skipped });
    }
  };

  const shortlistItems: PlayerSelectorItem[] = useMemo(
    () =>
      allFAs.map(player => ({
        player,
        score: getK2Ovr(player),
        subtitle: `${getK2Ovr(player)} K2`,
      })),
    [allFAs],
  );

  const openPlayer = (player: NBAPlayer) => {
    if (onPlayerClick) onPlayerClick(player);
    else quick.openFor(player);
  };

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
      <AutoBidSummaryModal summary={autoBidSummary} onClose={() => setAutoBidSummary(null)} />
      <MoratoriumHeadsUpModal open={showFaHeadsUp} moratoriumEndLabel={moratoriumEndLabel} onClose={dismissFaHeadsUp} />
      <div className="h-full flex flex-col gap-3">
        {!euroIsolated && (
          <div className={`rounded-lg border border-[#30363d] bg-black/40 p-4 grid gap-4 ${isOffseasonView ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
            <Stat label={isPreFA ? 'Projected cap (post-rollover)' : 'Cap Space'} value={fmtUSD(capSpaceUSD)} tone={capSpaceUSD < 0 ? 'red' : 'emerald'} />
            <Stat label="MLE Available" value={mleAvail.blocked ? '—' : fmtUSD(mleAvailableNetUSD)} />
            {isOffseasonView && (
              <>
                <Stat label="Shortlist Commit" value={fmtUSD(shortlistCommitUSD)} tone={shortlistCommitUSD > availableRoomUSD ? 'amber' : undefined} />
                <Stat
                  label="Room After Shortlist"
                  value={fmtUSD(projectedRoomAfterShortlist)}
                  tone={projectedRoomAfterShortlist < 0 ? 'red' : projectedRoomAfterShortlist === 0 ? 'amber' : 'emerald'}
                />
              </>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
          <TeamIntelFreeAgencyShortlistPanel
            isOffseasonView={isOffseasonView}
            isOwnTeam={isOwnTeam}
            euroIsolated={euroIsolated}
            shortlistedPlayers={shortlistedPlayers}
            shortlistSize={shortlistIds.size}
            shortlistCap={SHORTLIST_CAP}
            team={team}
            currentYear={currentYear}
            leagueStats={state.leagueStats}
            allMarkets={allMarkets}
            teamId={teamId}
            fmtMoney={fmtMoney}
            onEdit={() => setEditing(true)}
            onToggleShortlist={toggleShortlist}
            onSubmitAutoBidsAll={submitAutoBidsAll}
            onSubmitAutoBid={player => {
              if (euroIsolated) quick.handle(player, 'sign_player');
              else submitAutoBid(player);
            }}
            onOpenPlayer={openPlayer}
          />
          <TeamIntelFreeAgencyBidTracker
            euroIsolated={euroIsolated}
            isOwnTeam={isOwnTeam}
            team={team}
            teamId={teamId}
            teams={state.teams}
            trackedMarkets={trackedMarkets}
            shortlistSize={shortlistIds.size}
            fmtUSD={fmtUSD}
            onOpenPlayer={player => player && quick.openFor(player)}
          />
        </div>

        <TeamIntelFreeAgencyTopDrawer
          tierFilter={tierFilter}
          sortConfig={sortConfig}
          birdRightsEnabled={birdRightsEnabled}
          euroIsolated={euroIsolated}
          isOwnTeam={isOwnTeam}
          shortlistIds={shortlistIds}
          teamId={teamId}
          teams={state.teams}
          allMarkets={allMarkets}
          leagueStats={state.leagueStats}
          currentYear={currentYear}
          visibleTopFAs={visibleTopFAs}
          totalTopFAs={topFAsForDrawer.length}
          faPage={faPage}
          faPerPage={faPerPage}
          faTotalPages={faTotalPages}
          fmtMoney={fmtMoney}
          onSetTierFilter={setTierFilter}
          onHandleSort={handleSort}
          onOpenPlayer={player => quick.openFor(player)}
          onToggleShortlist={toggleShortlist}
          onSetFaPerPage={value => {
            setFaPerPage(value);
            setFaPage(1);
          }}
          onPrevPage={() => setFaPage(page => Math.max(1, page - 1))}
          onNextPage={() => setFaPage(page => Math.min(faTotalPages, page + 1))}
        />

        <ShortlistEditorModal
          editing={editing}
          onClose={() => setEditing(false)}
          shortlistSize={shortlistIds.size}
          shortlistCap={SHORTLIST_CAP}
          items={shortlistItems}
          teams={allTeams}
          selectedIds={shortlistIds}
          onToggle={toggleShortlist}
        />
      </div>
      {createPortal(quick.portals, document.body)}
    </>
  );
}
