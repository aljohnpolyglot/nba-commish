import React, { useCallback, useMemo, useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { normalizeDate } from '../../../utils/helpers';
import { calcTeamRatings, expectedTeamScore } from '../../../services/simulation/teamratinghelper';
import {
  combinedOdds,
  ensureHalf,
  getPlayerStats,
  round05,
  type BetTab,
  type PropStat,
  type SlipLeg,
  type SlipMode,
} from './sportsbook/sportsbookTypes';
import {
  SportsbookBoxScoreLayer,
  SportsbookDesktopSlip,
  SportsbookHeader,
  SportsbookLinesTab,
  SportsbookMobileSlipDrawer,
  SportsbookMobileSlipFab,
  SportsbookMyBetsTab,
  SportsbookPropsTab,
  SportsbookTabBar,
} from './SportsbookViewSections';

export const SportsbookView = () => {
  const { state, placeBet } = useGame();
  const [activeTab, setActiveTab] = useState<BetTab>('lines');
  const [slipLegs, setSlipLegs] = useState<SlipLeg[]>([]);
  const [slipMode, setSlipMode] = useState<SlipMode>('single');
  const [wagerStr, setWagerStr] = useState('10');
  const [propStat, setPropStat] = useState<PropStat>('pts');
  const [expandedGames, setExpandedGames] = useState<Set<number>>(new Set());
  const [slipDrawerOpen, setSlipDrawerOpen] = useState(false);
  const [selectedBoxScore, setSelectedBoxScore] = useState<any>(null);
  const [myBetsPage, setMyBetsPage] = useState(0);

  const wager = Math.max(0, parseFloat(wagerStr) || 0);
  const maxWagerDollars = state.stats.personalWealth * 1_000_000;
  const showSlip = activeTab !== 'mybets';

  const toggleExpanded = (gid: number) => setExpandedGames(prev => {
    const next = new Set(prev);
    next.has(gid) ? next.delete(gid) : next.add(gid);
    return next;
  });

  const todaysGames = useMemo(() => {
    const normalizedCurrent = normalizeDate(state.date);
    return state.schedule.filter((game: any) => normalizeDate(game.date) === normalizedCurrent && !game.played);
  }, [state.schedule, state.date]);

  const gameCards = useMemo(() => todaysGames.map((game: any) => {
    const home = state.teams.find((team: any) => team.id === game.homeTid);
    const away = state.teams.find((team: any) => team.id === game.awayTid);
    if (!home || !away) return null;

    const homeRatings = calcTeamRatings(home.id, state.players);
    const awayRatings = calcTeamRatings(away.id, state.players);
    const homeExpected = expectedTeamScore(homeRatings.offRating, awayRatings.defRating, homeRatings.pace);
    const awayExpected = expectedTeamScore(awayRatings.offRating, homeRatings.defRating, awayRatings.pace);
    const rawSpread = round05(homeExpected - awayExpected + 3);
    const trueHomeProb = Math.min(0.92, Math.max(0.08, 0.5 + rawSpread * 0.031));
    const total = Math.round(homeExpected + awayExpected);

    return {
      game,
      home,
      away,
      homeML: Number((1 / (trueHomeProb * 1.04)).toFixed(3)),
      awayML: Number((1 / ((1 - trueHomeProb) * 1.04)).toFixed(3)),
      homeSpread: -rawSpread,
      awaySpread: +rawSpread,
      spreadOdds: Number((1 / 0.5238).toFixed(3)),
      projTotal: total,
      overOdds: Number((1 / 0.553).toFixed(2)),
      underOdds: Number((1 / 0.553).toFixed(2)),
      awayTeamTotal: round05(total * 0.47),
      homeTeamTotal: round05(total * 0.53),
      ttOdds: Number((1 / 0.5238).toFixed(3)),
    };
  }).filter(Boolean), [todaysGames, state.teams, state.players]);

  const teamRecords = useMemo(() => {
    const records: Record<number, { w: number; l: number }> = {};
    const nonRegularGids = new Set(state.schedule.filter((game: any) => game.isPreseason || game.isPlayoff || game.isPlayIn || game.excludeFromRecord).map((game: any) => game.gid));
    (state.boxScores as any[])
      .filter(game => !game.isAllStar && !game.isRisingStars && !game.isCelebrityGame && !nonRegularGids.has(game.gameId))
      .forEach(game => {
        const homeWon = game.homeScore > game.awayScore;
        if (!records[game.homeTeamId]) records[game.homeTeamId] = { w: 0, l: 0 };
        if (!records[game.awayTeamId]) records[game.awayTeamId] = { w: 0, l: 0 };
        homeWon ? records[game.homeTeamId].w++ : records[game.homeTeamId].l++;
        homeWon ? records[game.awayTeamId].l++ : records[game.awayTeamId].w++;
      });
    return records;
  }, [state.boxScores, state.schedule]);

  const playerProps = useMemo(() => {
    const season = state.leagueStats?.year ?? new Date().getFullYear();
    const todayTids = new Set<number>();
    gameCards.forEach((card: any) => {
      if (!card) return;
      todayTids.add(card.home.id);
      todayTids.add(card.away.id);
    });

    const todayPlayers = (state.players ?? []).filter((player: any) => todayTids.has(player.tid) && player.status === 'Active' && !player.injury?.gamesRemaining);
    const teamPlayerMap: Record<number, any[]> = {};
    todayPlayers.forEach((player: any) => {
      if (!teamPlayerMap[player.tid]) teamPlayerMap[player.tid] = [];
      teamPlayerMap[player.tid].push(player);
    });
    Object.keys(teamPlayerMap).forEach(tid => {
      teamPlayerMap[+tid] = teamPlayerMap[+tid].sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0)).slice(0, 4);
    });

    const props: any[] = [];
    gameCards.forEach((card: any) => {
      if (!card) return;
      [card.home, card.away].forEach((team: any) => {
        const opponent = card.home.id === team.id ? card.away : card.home;
        (teamPlayerMap[team.id] ?? []).forEach((player: any) => {
          const stats = getPlayerStats(player, season);
          if (!stats || stats.gp < 1) return;
          props.push({
            player,
            team,
            opponent,
            stats,
            line: {
              pts: ensureHalf(stats.ppg),
              reb: ensureHalf(stats.rpg),
              ast: ensureHalf(stats.apg),
              pra: ensureHalf(stats.ppg + stats.rpg + stats.apg),
            },
            overOdds: Number((1 / 0.525).toFixed(3)),
            underOdds: Number((1 / 0.485).toFixed(3)),
          });
        });
      });
    });
    return props;
  }, [gameCards, state.players, state.leagueStats?.year]);

  const isInSlip = useCallback((legId: string) => slipLegs.some(leg => leg.id === legId), [slipLegs]);
  const toggleLeg = useCallback((leg: SlipLeg) => {
    setSlipLegs(prev => {
      const exists = prev.find(item => item.id === leg.id);
      if (exists) return prev.filter(item => item.id !== leg.id);
      if (slipMode === 'single') return [leg];
      const filtered = prev.filter(item => {
        if (leg.gameId && item.gameId === leg.gameId) {
          const legIsWinner = leg.type === 'moneyline' || leg.type === 'spread';
          const itemIsWinner = item.type === 'moneyline' || item.type === 'spread';
          if (legIsWinner && itemIsWinner) return false;
          const legIsTotal = leg.condition === 'over' || leg.condition === 'under';
          const itemIsTotal = item.condition === 'over' || item.condition === 'under';
          if (legIsTotal && itemIsTotal) return false;
        }
        if (leg.playerId && item.playerId === leg.playerId && item.condition.split('_')[0] === leg.condition.split('_')[0]) return false;
        return true;
      });
      return [...filtered, leg];
    });
  }, [slipMode]);

  const removeLeg = (id: string) => setSlipLegs(prev => prev.filter(leg => leg.id !== id));
  const potentialPayout = wager * (slipMode === 'parlay' ? combinedOdds(slipLegs) : (slipLegs[0]?.odds ?? 1));

  const handlePlace = () => {
    if (!slipLegs.length || wager <= 0 || wager > maxWagerDollars) return;
    placeBet({
      type: slipMode === 'parlay' ? 'parlay' as any : slipLegs[0].type as any,
      wager,
      potentialPayout,
      legs: slipLegs.map(leg => ({
        gameId: leg.gameId,
        playerId: leg.playerId,
        description: leg.description,
        odds: leg.odds,
        condition: leg.condition,
      })),
    });
    setSlipLegs([]);
    setWagerStr('10');
    setSlipDrawerOpen(false);
  };

  const betStats = useMemo(() => {
    const bets: any[] = state.bets ?? [];
    const won = bets.filter(bet => bet.status === 'won');
    const lost = bets.filter(bet => bet.status === 'lost');
    const settled = bets.filter(bet => bet.status !== 'pending');
    const totalWon = won.reduce((sum, bet) => sum + (bet.potentialPayout - bet.wager), 0);
    const totalLost = lost.reduce((sum, bet) => sum + bet.wager, 0);

    let longestStreak = 0;
    let currentStreak = 0;
    [...bets]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .filter(bet => bet.status !== 'pending')
      .forEach(bet => {
        if (bet.status === 'won') {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      });

    return {
      pending: bets.filter(bet => bet.status === 'pending').length,
      won: won.length,
      lost: lost.length,
      winRate: settled.length ? Math.round((won.length / settled.length) * 100) : 0,
      profit: totalWon - totalLost,
      biggestWin: won.length ? Math.max(...won.map((bet: any) => bet.potentialPayout - bet.wager)) : null,
      biggestLoss: lost.length ? Math.max(...lost.map((bet: any) => bet.wager)) : null,
      bestParlay: won
        .filter((bet: any) => bet.type === 'parlay' || (bet.legs?.length ?? 0) > 1)
        .reduce((best: number | null, bet: any) => {
          const odds = bet.legs?.reduce((acc: number, leg: any) => acc * (leg.odds ?? 1), 1) ?? 1;
          return best === null || odds > best ? odds : best;
        }, null as number | null),
      totalWagered: bets.reduce((sum, bet) => sum + (bet.wager ?? 0), 0),
      longestStreak,
    };
  }, [state.bets]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#161a20]">
      <SportsbookHeader bankroll={state.stats.personalWealth} profit={betStats.profit} />
      <SportsbookTabBar activeTab={activeTab} pendingCount={betStats.pending} onChange={setActiveTab} />

      <div className="flex-1 overflow-hidden flex relative">
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4 custom-scrollbar">
          {activeTab === 'lines' && (
            <SportsbookLinesTab
              gameCards={gameCards as any[]}
              teamRecords={teamRecords}
              expandedGames={expandedGames}
              isInSlip={isInSlip}
              toggleLeg={toggleLeg}
              toggleExpanded={toggleExpanded}
            />
          )}
          {activeTab === 'props' && (
            <SportsbookPropsTab
              propStat={propStat}
              playerProps={playerProps}
              isInSlip={isInSlip}
              toggleLeg={toggleLeg}
              onPropStatChange={setPropStat}
            />
          )}
          {activeTab === 'mybets' && (
            <SportsbookMyBetsTab
              state={state}
              betStats={betStats}
              myBetsPage={myBetsPage}
              onPageChange={setMyBetsPage}
              onSelectBoxScore={setSelectedBoxScore}
            />
          )}
        </div>

        <SportsbookDesktopSlip
          showSlip={showSlip}
          slipLegs={slipLegs}
          slipMode={slipMode}
          wagerStr={wagerStr}
          setWagerStr={setWagerStr}
          setSlipMode={setSlipMode}
          setSlipLegs={setSlipLegs as React.Dispatch<React.SetStateAction<any[]>>}
          removeLeg={removeLeg}
          handlePlace={handlePlace}
          maxWagerDollars={maxWagerDollars}
        />

        <SportsbookMobileSlipFab showSlip={showSlip} slipLegs={slipLegs} onOpen={() => setSlipDrawerOpen(true)} />
      </div>

      <SportsbookBoxScoreLayer selectedBoxScore={selectedBoxScore} state={state} onClose={() => setSelectedBoxScore(null)} />

      <SportsbookMobileSlipDrawer
        slipDrawerOpen={slipDrawerOpen}
        showSlip={showSlip}
        slipLegs={slipLegs}
        slipMode={slipMode}
        wagerStr={wagerStr}
        setWagerStr={setWagerStr}
        setSlipMode={setSlipMode}
        setSlipLegs={setSlipLegs as React.Dispatch<React.SetStateAction<any[]>>}
        removeLeg={removeLeg}
        handlePlace={handlePlace}
        maxWagerDollars={maxWagerDollars}
        onClose={() => setSlipDrawerOpen(false)}
      />
    </div>
  );
};

export default SportsbookView;
