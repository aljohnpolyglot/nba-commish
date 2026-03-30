import React, { useState, useMemo, useCallback } from 'react';
import { useGame } from '../../../store/GameContext';
import { formatCurrency, normalizeDate } from '../../../utils/helpers';
import {
  Activity, Clock, Plus, TrendingUp, TrendingDown,
  Trophy, BarChart2, ChevronDown, ChevronUp,
  User, Zap, Target, X
} from 'lucide-react';
import {
  BetTab, PropStat, SlipMode, SlipLeg,
  decimalToAmerican, combinedOdds, round05, getPlayerStats, ensureHalf
} from './sportsbook/sportsbookTypes';
import { OddsButton, TabButton, StatusBadge, EmptyState } from './sportsbook/SportsbookShared';
import { BetSlipPanel } from './sportsbook/BetSlipPanel';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { calcTeamRatings, expectedTeamScore } from '../../../services/simulation/teamratinghelper';

/* ─── Main Component ─────────────────────────────────────────── */
export const SportsbookView = () => {
  const { state, placeBet } = useGame();
  const [activeTab, setActiveTab] = useState<BetTab>('lines');
  const [slipLegs, setSlipLegs] = useState<SlipLeg[]>([]);
  const [slipMode, setSlipMode] = useState<SlipMode>('single');
  // Wager as string to support clearing/decimals. Value is in actual DOLLARS.
  const [wagerStr, setWagerStr] = useState('10');
  const [propStat, setPropStat] = useState<PropStat>('pts');
  const [expandedGames, setExpandedGames] = useState<Set<number>>(new Set());
  // Mobile: slip drawer open
  const [slipDrawerOpen, setSlipDrawerOpen] = useState(false);
  // Boxscore modal for settled bets
  const [selectedBoxScore, setSelectedBoxScore] = useState<any>(null);
  // My Bets pagination
  const [myBetsPage, setMyBetsPage] = useState(0);

  const wager = Math.max(0, parseFloat(wagerStr) || 0);
  // personalWealth is in millions → max wager in dollars
  const maxWagerDollars = state.stats.personalWealth * 1_000_000;

  const toggleExpanded = (gid: number) =>
    setExpandedGames(prev => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      return next;
    });

  /* ─── Today's Games ───────────────────────────────────────── */
  const todaysGames = useMemo(() => {
    const normalizedCurrent = normalizeDate(state.date);
    return state.schedule.filter(
      (g: any) => normalizeDate(g.date) === normalizedCurrent && !g.played
    );
  }, [state.schedule, state.date]);

  const gameCards = useMemo(() => todaysGames.map((game: any) => {
    const home = state.teams.find((t: any) => t.id === game.homeTid);
    const away = state.teams.find((t: any) => t.id === game.awayTid);
    if (!home || !away) return null;

    // Use team ratings from the simulator for realistic projected scores
    const homeRatings = calcTeamRatings(home.id, state.players);
    const awayRatings = calcTeamRatings(away.id, state.players);
    const homeExpected = expectedTeamScore(homeRatings.offRating, awayRatings.defRating, homeRatings.pace);
    const awayExpected = expectedTeamScore(awayRatings.offRating, homeRatings.defRating, awayRatings.pace);

    const HOME_PTS_ADV = 3;
    const projTotal = Math.round(homeExpected + awayExpected);

    // Spread: home expected point margin (positive = home favored)
    const rawSpread = round05(homeExpected - awayExpected + HOME_PTS_ADV);
    const homeSpread = -rawSpread;
    const awaySpread = +rawSpread;
    const spreadOdds = Number((1 / 0.5238).toFixed(3)); // -110

    // ML scaled from spread so heavy favorites aren't cheap
    // scale=0.031: spread=9 → ~-430 favorite, spread=0 → -110 pick-em
    const hProbTrue = Math.min(0.92, Math.max(0.08, 0.5 + rawSpread * 0.031));
    const aProbTrue = 1 - hProbTrue;
    const mlVig = 1.04;
    const homeML = Number((1 / (hProbTrue * mlVig)).toFixed(3));
    const awayML = Number((1 / (aProbTrue * mlVig)).toFixed(3));

    const ouJuice   = 0.053;
    const overOdds  = Number((1 / (0.5 + ouJuice)).toFixed(2));
    const underOdds = Number((1 / (0.5 + ouJuice)).toFixed(2));

    const awayTeamTotal = round05(projTotal * 0.47);
    const homeTeamTotal = round05(projTotal * 0.53);
    const ttOdds = Number((1 / 0.5238).toFixed(3));

    return {
      game, home, away,
      homeML, awayML,
      homeSpread, awaySpread, spreadOdds,
      projTotal, overOdds, underOdds,
      awayTeamTotal, homeTeamTotal, ttOdds,
    };
  }).filter(Boolean), [todaysGames, state.teams, state.players]);

  /* ─── Team Records (for Today's Lines) ──────────────────── */
  const teamRecords = useMemo(() => {
    const records: Record<number, { w: number; l: number }> = {};
    const nonRegularGids = new Set(
      state.schedule.filter((g: any) => g.isPreseason || g.isPlayoff || g.isPlayIn).map((g: any) => g.gid)
    );
    (state.boxScores as any[]).filter(g =>
      !g.isAllStar && !g.isRisingStars && !g.isCelebrityGame && !nonRegularGids.has(g.gameId)
    ).forEach(g => {
      const homeWon = g.homeScore > g.awayScore;
      if (!records[g.homeTeamId]) records[g.homeTeamId] = { w: 0, l: 0 };
      if (!records[g.awayTeamId]) records[g.awayTeamId] = { w: 0, l: 0 };
      homeWon ? records[g.homeTeamId].w++ : records[g.homeTeamId].l++;
      homeWon ? records[g.awayTeamId].l++ : records[g.awayTeamId].w++;
    });
    return records;
  }, [state.boxScores, state.schedule]);

  /* ─── Player Props ────────────────────────────────────────── */
  const playerProps = useMemo(() => {
    const season = state.leagueStats?.year ?? 2026;
    const todayTids = new Set<number>();
    gameCards.forEach((card: any) => {
      if (!card) return;
      todayTids.add(card.home.id);
      todayTids.add(card.away.id);
    });

    const todayPlayers = (state.players ?? []).filter(
      (p: any) => todayTids.has(p.tid) && p.status === 'Active' && !p.injury?.gamesRemaining
    );

    const teamPlayerMap: Record<number, any[]> = {};
    todayPlayers.forEach((p: any) => {
      if (!teamPlayerMap[p.tid]) teamPlayerMap[p.tid] = [];
      teamPlayerMap[p.tid].push(p);
    });
    Object.keys(teamPlayerMap).forEach(tid => {
      teamPlayerMap[+tid] = teamPlayerMap[+tid]
        .sort((a: any, b: any) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
        .slice(0, 4);
    });

    const props: any[] = [];
    gameCards.forEach((card: any) => {
      if (!card) return;
      [card.home, card.away].forEach((team: any) => {
        const opp = card.home.id === team.id ? card.away : card.home;
        (teamPlayerMap[team.id] ?? []).forEach((p: any) => {
          const stats = getPlayerStats(p, season);
          if (!stats || stats.gp < 1) return;
          props.push({
            player: p, team, opponent: opp, stats,
            line: {
              pts: ensureHalf(stats.ppg),
              reb: ensureHalf(stats.rpg),
              ast: ensureHalf(stats.apg),
              pra: ensureHalf(stats.ppg + stats.rpg + stats.apg),
            },
            overOdds:  Number((1 / (0.52 + 0.005)).toFixed(3)),
            underOdds: Number((1 / (0.48 + 0.005)).toFixed(3)),
          });
        });
      });
    });
    return props;
  }, [gameCards, state.players, state.leagueStats?.year]);

  /* ─── Bet Slip Logic ─────────────────────────────────────── */
  const isInSlip = useCallback((legId: string) =>
    slipLegs.some(l => l.id === legId), [slipLegs]);

  const toggleLeg = useCallback((leg: SlipLeg) => {
    setSlipLegs(prev => {
      const exists = prev.find(l => l.id === leg.id);
      if (exists) return prev.filter(l => l.id !== leg.id);
      if (slipMode === 'single') return [leg];
      const filtered = prev.filter(l => {
        if (leg.gameId && l.gameId === leg.gameId) {
          const legIsGameWinner = leg.type === 'moneyline' || leg.type === 'spread';
          const lIsGameWinner   = l.type === 'moneyline'   || l.type === 'spread';
          if (legIsGameWinner && lIsGameWinner) return false;
          const legIsGameTotal = leg.condition === 'over' || leg.condition === 'under';
          const lIsGameTotal   = l.condition === 'over'   || l.condition === 'under';
          if (legIsGameTotal && lIsGameTotal) return false;
        }
        if (leg.playerId && l.playerId === leg.playerId &&
            l.condition.split('_')[0] === leg.condition.split('_')[0]) return false;
        return true;
      });
      return [...filtered, leg];
    });
  }, [slipMode]);

  const removeLeg = (id: string) => setSlipLegs(prev => prev.filter(l => l.id !== id));

  const parlayOdds = combinedOdds(slipLegs);
  const potentialPayout = wager * (slipMode === 'parlay' ? parlayOdds : (slipLegs[0]?.odds ?? 1));

  const handlePlace = () => {
    if (!slipLegs.length || wager <= 0 || wager > maxWagerDollars) return;
    placeBet({
      type: slipMode === 'parlay' ? 'parlay' as any : slipLegs[0].type as any,
      wager,
      potentialPayout,
      legs: slipLegs.map(l => ({
        gameId:      l.gameId,
        playerId:    l.playerId,
        description: l.description,
        odds:        l.odds,
        condition:   l.condition,
      })),
    });
    setSlipLegs([]);
    setWagerStr('10');
    setSlipDrawerOpen(false);
  };

  /* ─── My Bets Stats ─────────────────────────────────────── */
  const betStats = useMemo(() => {
    const bets: any[] = state.bets ?? [];
    const won     = bets.filter(b => b.status === 'won');
    const lost    = bets.filter(b => b.status === 'lost');
    const settled = bets.filter(b => b.status !== 'pending');

    const totalWon  = won.reduce((s, b) => s + (b.potentialPayout - b.wager), 0);
    const totalLost = lost.reduce((s, b) => s + b.wager, 0);
    const profit    = totalWon - totalLost;
    const winRate   = settled.length ? Math.round((won.length / settled.length) * 100) : 0;

    const biggestWin = won.length
      ? Math.max(...won.map((b: any) => b.potentialPayout - b.wager))
      : null;

    const biggestLoss = lost.length
      ? Math.max(...lost.map((b: any) => b.wager))
      : null;

    const bestParlay = won
      .filter((b: any) => b.type === 'parlay' || (b.legs?.length ?? 0) > 1)
      .reduce((best: number | null, b: any) => {
        const dec = b.legs?.reduce((acc: number, l: any) => acc * (l.odds ?? 1), 1) ?? 1;
        return best === null || dec > best ? dec : best;
      }, null as number | null);

    const totalWagered = bets.reduce((s, b) => s + (b.wager ?? 0), 0);

    let longestStreak = 0;
    let currentStreak = 0;
    [...bets]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .filter(b => b.status !== 'pending')
      .forEach(b => {
        if (b.status === 'won') {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      });

    return {
      pending: bets.filter(b => b.status === 'pending').length,
      won: won.length, lost: lost.length, winRate, profit,
      biggestWin, biggestLoss, bestParlay, totalWagered, longestStreak,
    };
  }, [state.bets]);

  const showSlip = activeTab !== 'mybets';

  /* ─── Render ──────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#161a20]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            </div>
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase">Commissioner's Book</h2>
          </div>
          <p className="text-slate-500 text-[10px] sm:text-xs font-medium tracking-wide pl-9 sm:pl-11">Private sportsbook — insider action only</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bankroll</p>
            <p className="text-lg sm:text-2xl font-black text-emerald-400 font-mono">{formatCurrency(state.stats.personalWealth)}</p>
          </div>
          {betStats.profit !== 0 && (
            <div className={`hidden sm:flex px-3 py-1.5 rounded-lg text-xs font-bold items-center gap-1.5
              ${betStats.profit >= 0
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              {betStats.profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {betStats.profit >= 0 ? '+' : ''}{formatCurrency(betStats.profit, false)}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex-shrink-0 flex border-b border-slate-800/60 bg-[#1a1e26] overflow-x-auto">
        <TabButton active={activeTab === 'lines'}  onClick={() => setActiveTab('lines')}  icon={BarChart2} label="Today's Lines" />
        <TabButton active={activeTab === 'props'}  onClick={() => setActiveTab('props')}  icon={Target}    label="Player Props" />
        <TabButton active={activeTab === 'mybets'} onClick={() => setActiveTab('mybets')} icon={Trophy}    label="My Bets" badge={betStats.pending} />
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex relative">

        {/* ── Main Content ── */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4 custom-scrollbar">

          {/* ════ TODAY'S LINES ════ */}
          {activeTab === 'lines' && (
            <>
              {gameCards.length === 0 ? (
                <EmptyState icon={<Clock className="w-8 h-8" />} title="No games today" body="Check back tomorrow for fresh lines." />
              ) : gameCards.map((card: any) => card && (
                <div key={card.game.gid} className="bg-[#1e232c] border border-slate-700/40 rounded-xl overflow-hidden hover:border-slate-600/60 transition-colors">
                  <div className="p-3 sm:p-4">
                    {/* Teams Row */}
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="flex-1 flex items-center gap-2 sm:gap-3">
                        <img src={card.away.logoUrl} alt={card.away.abbrev} className="w-7 h-7 sm:w-9 sm:h-9 object-contain" referrerPolicy="no-referrer" />
                        <div>
                          <p className="font-black text-white text-xs sm:text-sm uppercase">{card.away.abbrev}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500">{card.away.name.split(' ').slice(-1)[0]}</p>
                          {teamRecords[card.away.id] && (
                            <p className="text-[10px] text-slate-600 font-mono">{teamRecords[card.away.id].w}-{teamRecords[card.away.id].l}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">@</span>
                      <div className="flex-1 flex items-center gap-2 sm:gap-3 justify-end">
                        <div className="text-right">
                          <p className="font-black text-white text-xs sm:text-sm uppercase">{card.home.abbrev}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500">{card.home.name.split(' ').slice(-1)[0]}</p>
                          {teamRecords[card.home.id] && (
                            <p className="text-[10px] text-slate-600 font-mono">{teamRecords[card.home.id].w}-{teamRecords[card.home.id].l}</p>
                          )}
                        </div>
                        <img src={card.home.logoUrl} alt={card.home.abbrev} className="w-7 h-7 sm:w-9 sm:h-9 object-contain" referrerPolicy="no-referrer" />
                      </div>
                    </div>

                    {/* 3 Market Columns */}
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      {/* SPREAD */}
                      <div className="bg-slate-900/50 rounded-lg p-2 sm:p-2.5">
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 sm:mb-2 text-center">Spread</p>
                        <div className="flex gap-1 sm:gap-1.5">
                          <button
                            onClick={() => toggleLeg({ id: `sp-${card.game.gid}-away`, gameId: card.game.gid, description: `${card.away.abbrev} ${card.awaySpread > 0 ? '+' : ''}${card.awaySpread}`, subDescription: `vs ${card.home.abbrev}`, odds: card.spreadOdds, condition: 'away_spread', type: 'spread' })}
                            className={`flex-1 flex flex-col items-center justify-center py-1.5 sm:py-2 rounded-lg border text-[10px] sm:text-xs font-bold font-mono transition-all ${isInSlip(`sp-${card.game.gid}-away`) ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-700/80'}`}
                          >
                            <span className={`text-[9px] sm:text-[10px] mb-0.5 font-bold uppercase tracking-wider ${isInSlip(`sp-${card.game.gid}-away`) ? 'text-emerald-100' : 'text-slate-400'}`}>{card.away.abbrev}</span>
                            <span className={isInSlip(`sp-${card.game.gid}-away`) ? 'text-white' : 'text-slate-200'}>{card.awaySpread > 0 ? '+' : ''}{card.awaySpread}</span>
                            <span className={`text-[9px] sm:text-[10px] mt-0.5 ${isInSlip(`sp-${card.game.gid}-away`) ? 'text-emerald-100' : 'text-amber-400'}`}>{decimalToAmerican(card.spreadOdds)}</span>
                          </button>
                          <button
                            onClick={() => toggleLeg({ id: `sp-${card.game.gid}-home`, gameId: card.game.gid, description: `${card.home.abbrev} ${card.homeSpread > 0 ? '+' : ''}${card.homeSpread}`, subDescription: `vs ${card.away.abbrev} (Home)`, odds: card.spreadOdds, condition: 'home_spread', type: 'spread' })}
                            className={`flex-1 flex flex-col items-center justify-center py-1.5 sm:py-2 rounded-lg border text-[10px] sm:text-xs font-bold font-mono transition-all ${isInSlip(`sp-${card.game.gid}-home`) ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-700/80'}`}
                          >
                            <span className={`text-[9px] sm:text-[10px] mb-0.5 font-bold uppercase tracking-wider ${isInSlip(`sp-${card.game.gid}-home`) ? 'text-emerald-100' : 'text-slate-400'}`}>{card.home.abbrev}</span>
                            <span className={isInSlip(`sp-${card.game.gid}-home`) ? 'text-white' : 'text-slate-200'}>{card.homeSpread > 0 ? '+' : ''}{card.homeSpread}</span>
                            <span className={`text-[9px] sm:text-[10px] mt-0.5 ${isInSlip(`sp-${card.game.gid}-home`) ? 'text-emerald-100' : 'text-amber-400'}`}>{decimalToAmerican(card.spreadOdds)}</span>
                          </button>
                        </div>
                      </div>

                      {/* MONEYLINE */}
                      <div className="bg-slate-900/50 rounded-lg p-2 sm:p-2.5">
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 sm:mb-2 text-center">ML</p>
                        <div className="flex gap-1 sm:gap-1.5">
                          <OddsButton size="sm" wide odds={card.awayML} label={card.away.abbrev}
                            selected={isInSlip(`ml-${card.game.gid}-away`)}
                            onClick={() => toggleLeg({ id: `ml-${card.game.gid}-away`, gameId: card.game.gid, description: `${card.away.name} ML`, subDescription: `vs ${card.home.abbrev}`, odds: card.awayML, condition: 'away_win', type: 'moneyline' })}
                          />
                          <OddsButton size="sm" wide odds={card.homeML} label={card.home.abbrev}
                            selected={isInSlip(`ml-${card.game.gid}-home`)}
                            onClick={() => toggleLeg({ id: `ml-${card.game.gid}-home`, gameId: card.game.gid, description: `${card.home.name} ML`, subDescription: `vs ${card.away.abbrev} (Home)`, odds: card.homeML, condition: 'home_win', type: 'moneyline' })}
                          />
                        </div>
                      </div>

                      {/* TOTAL */}
                      <div className="bg-slate-900/50 rounded-lg p-2 sm:p-2.5">
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 sm:mb-2 text-center">O/U {card.projTotal}</p>
                        <div className="flex gap-1 sm:gap-1.5">
                          <OddsButton size="sm" wide odds={card.overOdds} label="Over"
                            selected={isInSlip(`ou-${card.game.gid}-over`)}
                            onClick={() => toggleLeg({ id: `ou-${card.game.gid}-over`, gameId: card.game.gid, description: `Over ${card.projTotal} pts`, subDescription: `${card.away.abbrev} @ ${card.home.abbrev}`, odds: card.overOdds, condition: 'over', type: 'over_under' })}
                          />
                          <OddsButton size="sm" wide odds={card.underOdds} label="Under"
                            selected={isInSlip(`ou-${card.game.gid}-under`)}
                            onClick={() => toggleLeg({ id: `ou-${card.game.gid}-under`, gameId: card.game.gid, description: `Under ${card.projTotal} pts`, subDescription: `${card.away.abbrev} @ ${card.home.abbrev}`, odds: card.underOdds, condition: 'under', type: 'over_under' })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* More Markets Toggle */}
                    <button
                      onClick={() => toggleExpanded(card.game.gid)}
                      className="mt-2 sm:mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest py-1.5 border border-slate-700/40 rounded-lg hover:border-slate-600/60 transition-all"
                    >
                      {expandedGames.has(card.game.gid)
                        ? <><ChevronUp className="w-3 h-3" /> Hide Markets</>
                        : <><ChevronDown className="w-3 h-3" /> More Markets</>}
                    </button>

                    {expandedGames.has(card.game.gid) && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-0.5 mb-1">Team Totals</p>
                        {[
                          { team: card.away, opp: card.home, total: card.awayTeamTotal, side: 'away' },
                          { team: card.home, opp: card.away, total: card.homeTeamTotal, side: 'home' },
                        ].map(({ team, opp, total, side }) => (
                          <div key={side} className="bg-slate-900/40 rounded-lg p-2 sm:p-2.5 flex items-center justify-between gap-2 sm:gap-3">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                              <img src={team.logoUrl} alt={team.abbrev} className="w-4 sm:w-5 h-4 sm:h-5 object-contain flex-shrink-0" referrerPolicy="no-referrer" />
                              <span className="text-xs font-bold text-slate-300 truncate">{team.name} Total</span>
                              <span className="text-[10px] font-bold text-slate-500 font-mono flex-shrink-0">{total}</span>
                            </div>
                            <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
                              <OddsButton size="sm" odds={card.ttOdds} label={`O ${total}`}
                                selected={isInSlip(`tt-${card.game.gid}-${side}-over`)}
                                onClick={() => toggleLeg({ id: `tt-${card.game.gid}-${side}-over`, gameId: card.game.gid, description: `${team.name} Total Over ${total}`, subDescription: `vs ${opp.abbrev}`, odds: card.ttOdds, condition: `${side}_team_total_over`, type: 'over_under' })}
                              />
                              <OddsButton size="sm" odds={card.ttOdds} label={`U ${total}`}
                                selected={isInSlip(`tt-${card.game.gid}-${side}-under`)}
                                onClick={() => toggleLeg({ id: `tt-${card.game.gid}-${side}-under`, gameId: card.game.gid, description: `${team.name} Total Under ${total}`, subDescription: `vs ${opp.abbrev}`, odds: card.ttOdds, condition: `${side}_team_total_under`, type: 'over_under' })}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ════ PLAYER PROPS ════ */}
          {activeTab === 'props' && (
            <>
              <div className="flex gap-1.5 sm:gap-2 sticky top-0 z-10 bg-[#161a20] pb-2">
                {([
                  { key: 'pts', label: 'Points'   },
                  { key: 'reb', label: 'Rebounds'  },
                  { key: 'ast', label: 'Assists'   },
                  { key: 'pra', label: 'PRA'       },
                ] as { key: PropStat; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPropStat(key)}
                    className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-lg border transition-all
                      ${propStat === key
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {propStat === 'pra' && (
                <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
                  <Zap className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <p className="text-[11px] text-indigo-300 font-medium">
                    <span className="font-black">PRA</span> — Points + Rebounds + Assists combined.
                  </p>
                </div>
              )}

              {playerProps.length === 0 ? (
                <EmptyState icon={<User className="w-8 h-8" />} title="No props available" body="Props are generated from players in today's games." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {playerProps.map((prop: any, i: number) => {
                    const line    = prop.line[propStat];
                    const overId  = `prop-${prop.player.internalId}-${propStat}-over`;
                    const underId = `prop-${prop.player.internalId}-${propStat}-under`;
                    const marketLabel = propStat === 'pts' ? 'Points' : propStat === 'reb' ? 'Rebounds' : propStat === 'ast' ? 'Assists' : 'Pts+Reb+Ast';
                    const avg = propStat === 'pts' ? prop.stats.ppg : propStat === 'reb' ? prop.stats.rpg : propStat === 'ast' ? prop.stats.apg : round05(prop.stats.ppg + prop.stats.rpg + prop.stats.apg);

                    return (
                      <div key={i} className="bg-[#1e232c] border border-slate-700/40 rounded-xl p-3 sm:p-4 hover:border-slate-600/60 transition-colors">
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center text-sm font-black text-slate-300 flex-shrink-0 overflow-hidden">
                            {prop.player.imgURL
                              ? <img src={prop.player.imgURL} alt={prop.player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              : <span>{(prop.player.name ?? '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-white text-xs sm:text-sm truncate">{prop.player.name ?? 'Unknown'}</p>
                            <p className="text-[10px] text-slate-500">
                              <span className="text-slate-600 font-bold mr-1.5">{prop.player.pos ?? '—'}</span>
                              <span className="text-slate-400 font-medium">{prop.team.abbrev}</span>
                              <span className="mx-1.5 text-slate-700">vs</span>
                              <span>{prop.opponent.abbrev}</span>
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 hidden sm:block">
                            <p className="text-[10px] font-bold text-slate-500 mb-0.5">Season Avg</p>
                            {propStat === 'pts' && <p className="text-sm font-black text-emerald-300 font-mono">{prop.stats.ppg} PPG</p>}
                            {propStat === 'reb' && <p className="text-sm font-black text-emerald-300 font-mono">{prop.stats.rpg} RPG</p>}
                            {propStat === 'ast' && <p className="text-sm font-black text-emerald-300 font-mono">{prop.stats.apg} APG</p>}
                            {propStat === 'pra' && <p className="text-sm font-black text-indigo-300 font-mono">{round05(prop.stats.ppg + prop.stats.rpg + prop.stats.apg)} PRA</p>}
                          </div>
                        </div>

                        <div className="border-t border-slate-700/40 pt-2 sm:pt-3">
                          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {marketLabel} O/U {line}
                            </p>
                            {propStat === 'pra' && (
                              <span className="text-[10px] font-black text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                avg {avg}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5 sm:gap-2">
                            <OddsButton wide odds={prop.overOdds} label={`Over ${line}`} selected={isInSlip(overId)}
                              onClick={() => toggleLeg({ id: overId, playerId: prop.player.internalId, description: `${prop.player.name ?? 'Player'} Over ${line} ${marketLabel}`, subDescription: `${prop.team.abbrev} vs ${prop.opponent.abbrev}`, odds: prop.overOdds, condition: `${propStat}_over`, type: 'over_under' })}
                            />
                            <OddsButton wide odds={prop.underOdds} label={`Under ${line}`} selected={isInSlip(underId)}
                              onClick={() => toggleLeg({ id: underId, playerId: prop.player.internalId, description: `${prop.player.name ?? 'Player'} Under ${line} ${marketLabel}`, subDescription: `${prop.team.abbrev} vs ${prop.opponent.abbrev}`, odds: prop.underOdds, condition: `${propStat}_under`, type: 'over_under' })}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ════ MY BETS ════ */}
          {activeTab === 'mybets' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: 'Pending',  value: betStats.pending,       color: 'amber'   },
                  { label: 'Won',      value: betStats.won,           color: 'emerald' },
                  { label: 'Lost',     value: betStats.lost,          color: 'rose'    },
                  { label: 'Win Rate', value: `${betStats.winRate}%`, color: 'indigo'  },
                ].map(stat => (
                  <div key={stat.label} className={`bg-[#1e232c] border rounded-xl p-3 text-center border-${stat.color}-500/20`}>
                    <p className={`text-xl sm:text-2xl font-black text-${stat.color}-400 font-mono`}>{stat.value}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {[
                  { label: 'Biggest Win',  value: betStats.biggestWin  !== null ? `+${formatCurrency(betStats.biggestWin, false)}`  : '--', color: 'emerald' },
                  { label: 'Biggest Loss', value: betStats.biggestLoss !== null ? `-${formatCurrency(betStats.biggestLoss, false)}` : '--', color: 'rose'    },
                  { label: 'Best Parlay',  value: betStats.bestParlay  !== null ? decimalToAmerican(betStats.bestParlay) : '--',             color: 'indigo'  },
                  { label: 'Total Wagered',value: formatCurrency(betStats.totalWagered, false),                                             color: 'white'   },
                  { label: 'Best Streak',  value: betStats.longestStreak > 0 ? `${betStats.longestStreak}W` : '--',                         color: 'amber'   },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
                    <p className={`text-base sm:text-lg font-black text-${stat.color}-400 font-mono`}>{stat.value}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {(betStats.won + betStats.lost) > 0 && (
                <div className="bg-[#1e232c] border border-slate-700/40 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total P&L</span>
                    <span className={`text-sm font-black font-mono ${betStats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {betStats.profit >= 0 ? '+' : ''}{formatCurrency(betStats.profit, false)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${betStats.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.min(100, Math.abs(betStats.winRate))}%` }} />
                  </div>
                </div>
              )}

              {(state.bets?.length ?? 0) === 0 ? (
                <EmptyState icon={<Trophy className="w-8 h-8" />} title="No bets yet" body="Place your first bet from the Lines or Props tabs." />
              ) : (() => {
                const BETS_PER_PAGE = 20;
                const allBets = [...(state.bets ?? [])].reverse();
                const totalPages = Math.ceil(allBets.length / BETS_PER_PAGE);
                const pageBets = allBets.slice(myBetsPage * BETS_PER_PAGE, (myBetsPage + 1) * BETS_PER_PAGE);
                return (
                  <div className="space-y-2">
                    {pageBets.map((bet: any) => {
                      const propPlayerId = bet.legs?.length === 1 ? bet.legs[0].playerId : null;
                      const propPlayer = propPlayerId ? (state.players as any[]).find(p => p.internalId === propPlayerId) : null;
                      const hasBoxScore = !!bet.legs?.[0]?.gameId && (state.boxScores as any[]).some(b => b.gameId === bet.legs[0].gameId);
                      return (
                        <div
                          key={bet.id}
                          onClick={() => {
                            const gameId = bet.legs?.[0]?.gameId;
                            if (!gameId) return;
                            const bs = (state.boxScores as any[]).find(b => b.gameId === gameId);
                            if (bs) setSelectedBoxScore(bs);
                          }}
                          className={`bg-[#1e232c] rounded-xl border p-3 sm:p-4 transition-colors
                            ${hasBoxScore ? 'cursor-pointer hover:border-slate-500/60' : ''}
                            ${bet.status === 'won' ? 'border-emerald-500/30' : bet.status === 'lost' ? 'border-rose-500/20' : 'border-slate-700/40'}`}
                        >
                          <div className="flex items-start gap-2 sm:gap-3">
                            {propPlayer && (
                              <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                {propPlayer.imgURL
                                  ? <img src={propPlayer.imgURL} alt={propPlayer.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  : <span className="text-[10px] font-bold text-slate-300">{(propPlayer.name ?? '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>
                                }
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5 flex-wrap">
                                <StatusBadge status={bet.status} />
                                {bet.legs?.length > 1 && (
                                  <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    {bet.legs.length}-Leg Parlay
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-600 font-mono">{new Date(bet.date).toLocaleDateString()}</span>
                                {hasBoxScore && bet.status !== 'pending' && (
                                  <span className="text-[10px] text-slate-600 font-medium">· tap for boxscore</span>
                                )}
                              </div>
                              <div className="space-y-0.5">
                                {bet.legs?.map((leg: any, i: number) => (
                                  <p key={i} className="text-xs sm:text-sm text-slate-300 font-medium">{leg.description}</p>
                                ))}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[10px] text-slate-500 font-mono">Wager</p>
                              <p className="text-xs sm:text-sm font-bold text-white font-mono">{formatCurrency(bet.wager, false)}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-1">To Win</p>
                              <p className={`text-xs sm:text-sm font-bold font-mono
                                ${bet.status === 'won' ? 'text-emerald-400' : bet.status === 'lost' ? 'text-slate-600 line-through' : 'text-amber-400'}`}>
                                {formatCurrency(bet.potentialPayout - bet.wager, false)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <button
                          onClick={() => setMyBetsPage(p => Math.max(0, p - 1))}
                          disabled={myBetsPage === 0}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >← Prev</button>
                        <span className="text-[11px] text-slate-500 font-mono">{myBetsPage + 1} / {totalPages}</span>
                        <button
                          onClick={() => setMyBetsPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={myBetsPage >= totalPages - 1}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >Next →</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* ── Desktop Bet Slip Sidebar (md+) ── */}
        {showSlip && (
          <div className="hidden md:flex w-64 lg:w-72 flex-shrink-0 border-l border-slate-800/60 bg-[#1a1e26] flex-col">
            <BetSlipPanel
              slipLegs={slipLegs}
              slipMode={slipMode}
              wagerStr={wagerStr}
              setWagerStr={setWagerStr}
              setSlipMode={setSlipMode}
              setSlipLegs={setSlipLegs}
              removeLeg={removeLeg}
              handlePlace={handlePlace}
              maxWagerDollars={maxWagerDollars}
            />
          </div>
        )}

        {/* ── Mobile Bet Slip FAB ── */}
        {showSlip && slipLegs.length > 0 && (
          <button
            onClick={() => setSlipDrawerOpen(true)}
            className="md:hidden fixed bottom-4 right-4 z-50 bg-emerald-500 hover:bg-emerald-400 text-white font-black px-4 py-3 rounded-2xl shadow-[0_4px_20px_rgba(16,185,129,0.4)] flex items-center gap-2 text-sm uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" />
            Slip ({slipLegs.length})
          </button>
        )}
      </div>

      {/* ── Boxscore Modal (from My Bets click) ── */}
      {selectedBoxScore && (() => {
        const homeTeam = (state.teams as any[]).find(t => t.id === selectedBoxScore.homeTeamId);
        const awayTeam = (state.teams as any[]).find(t => t.id === selectedBoxScore.awayTeamId);
        if (!homeTeam || !awayTeam) return null;
        return (
          <BoxScoreModal
            game={selectedBoxScore}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            players={state.players as any[]}
            onClose={() => setSelectedBoxScore(null)}
          />
        );
      })()}

      {/* ── Mobile Bet Slip Bottom Drawer ── */}
      {slipDrawerOpen && showSlip && (
        <div className="md:hidden fixed inset-0 z-[200] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSlipDrawerOpen(false)} />
          <div className="relative bg-[#1a1e26] rounded-t-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-4 pt-4 pb-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bet Slip</span>
              <button onClick={() => setSlipDrawerOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col flex-1 overflow-hidden">
              <BetSlipPanel
                slipLegs={slipLegs}
                slipMode={slipMode}
                wagerStr={wagerStr}
                setWagerStr={setWagerStr}
                setSlipMode={setSlipMode}
                setSlipLegs={setSlipLegs}
                removeLeg={removeLeg}
                handlePlace={handlePlace}
                maxWagerDollars={maxWagerDollars}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SportsbookView;
