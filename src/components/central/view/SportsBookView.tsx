import React, { useState, useMemo, useCallback } from 'react';
import { useGame } from '../../../store/GameContext';
import { formatCurrency, normalizeDate } from '../../../utils/helpers';
import {
  Activity, CheckCircle, XCircle, Clock,
  Plus, Trash2, TrendingUp, TrendingDown, Target,
  Trophy, BarChart2, ChevronDown, ChevronUp,
  Layers, User, AlertCircle, Zap
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */
type BetTab = 'lines' | 'props' | 'mybets';
// CHANGED: added 'pra' to PropStat
type PropStat = 'pts' | 'reb' | 'ast' | 'pra';
type SlipMode = 'single' | 'parlay';

interface SlipLeg {
  id: string;
  gameId?: number;
  playerId?: string;
  description: string;
  subDescription?: string;
  odds: number;
  condition: string;
  type: 'moneyline' | 'over_under' | 'spread';
}

/* ─── Helpers ────────────────────────────────────────────────── */
const decimalToAmerican = (d: number): string => {
  if (d >= 2) return `+${Math.round((d - 1) * 100)}`;
  return `${Math.round(-100 / (d - 1))}`;
};

const decimalToAmericanNum = (d: number): number => {
  if (d >= 2) return Math.round((d - 1) * 100);
  return Math.round(-100 / (d - 1));
};

const combinedOdds = (legs: SlipLeg[]): number =>
  legs.reduce((acc, l) => acc * l.odds, 1);

const round05 = (n: number) => Math.round(n * 2) / 2;

// Mirrors AwardService.getBestStat exactly
const getBestStat = (stats: any[] | undefined, season: number) => {
  if (!stats?.length) return null;
  const seasonStats = stats.filter((s: any) => s.season === season && !s.playoffs);
  if (!seasonStats.length) return null;
  return seasonStats.reduce((prev: any, cur: any) => (prev.gp >= cur.gp ? prev : cur));
};

const getTrb = (s: any): number =>
  s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0));

const getPlayerStats = (player: any, season: number) => {
  // Try current season first, fall back to most recent previous season
  const s = getBestStat(player?.stats, season) ?? getBestStat(player?.stats, season - 1);
  if (!s) return null;
  const gp = Math.max(s.gp || 1, 1);
  return {
    ppg: parseFloat((s.pts / gp).toFixed(1)),
    rpg: parseFloat((getTrb(s) / gp).toFixed(1)),
    apg: parseFloat((s.ast / gp).toFixed(1)),
    spg: parseFloat((s.stl / gp).toFixed(1)),
    bpg: parseFloat((s.blk / gp).toFixed(1)),
    gp,
  };
};

/* ─── Sub-components ─────────────────────────────────────────── */

const OddsButton = ({
  odds, label, selected, onClick, size = 'md', wide = false
}: {
  odds: number; label?: string; selected: boolean;
  onClick: () => void; size?: 'sm' | 'md'; wide?: boolean;
}) => {
  const american = decimalToAmerican(odds);
  const isPos = decimalToAmericanNum(odds) > 0;
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center transition-all duration-200 rounded-lg border font-mono font-bold select-none
        ${size === 'sm' ? 'px-2 py-2 text-xs' : 'px-4 py-2.5 text-sm'}
        ${wide ? 'flex-1' : 'min-w-[60px]'}
        ${selected
          ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]'
          : 'bg-slate-800/70 border-slate-700/60 text-amber-400 hover:bg-slate-700/80 hover:border-slate-600'
        }`}
    >
      {label && (
        <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${selected ? 'text-emerald-100' : 'text-slate-400'}`}>
          {label}
        </span>
      )}
      <span className={selected ? 'text-white' : isPos ? 'text-amber-400' : 'text-slate-300'}>
        {american}
      </span>
    </button>
  );
};

const TabButton = ({ active, onClick, icon: Icon, label, badge }: {
  active: boolean; onClick: () => void;
  icon: any; label: string; badge?: number;
}) => (
  <button
    onClick={onClick}
    className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-bold uppercase tracking-widest transition-all duration-200 border-b-2 whitespace-nowrap
      ${active
        ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5'
        : 'text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-600'
      }`}
  >
    <Icon className="w-4 h-4" />
    {label}
    {badge !== undefined && badge > 0 && (
      <span className="bg-emerald-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
        {badge}
      </span>
    )}
  </button>
);

/* ─── Main Component ─────────────────────────────────────────── */
export const SportsbookView = () => {
  const { state, placeBet } = useGame();
  const [activeTab, setActiveTab] = useState<BetTab>('lines');
  const [slipLegs, setSlipLegs] = useState<SlipLeg[]>([]);
  const [slipMode, setSlipMode] = useState<SlipMode>('single');
  const [wager, setWager] = useState(100);
  const [propStat, setPropStat] = useState<PropStat>('pts');
  // CHANGED: Set<number> so each game card can be independently expanded
  const [expandedGames, setExpandedGames] = useState<Set<number>>(new Set());

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

    // ── Moneyline ──
    const juice = 0.05;
    const hAdv = 5;
    const hStr = home.strength + hAdv;
    const aStr = away.strength;
    const total = hStr + aStr;
    const hProb = hStr / total;
    const aProb = aStr / total;
    const homeML = Number((1 / (hProb + juice)).toFixed(2));
    const awayML = Number((1 / (aProb + juice)).toFixed(2));

    // ── Spread ──
    const rawSpread = round05((home.strength + hAdv - away.strength) / 2);
    const homeSpread = -rawSpread;
    const awaySpread = +rawSpread;
    const spreadOdds = Number((1 / 0.5238).toFixed(3)); // -110 both sides

    // ── Game Total ──
    const projTotal = Math.round(210 + (home.strength + away.strength) / 2 * 0.3);
    const ouJuice   = 0.053;
    const overOdds  = Number((1 / (0.5 + ouJuice)).toFixed(2));
    const underOdds = Number((1 / (0.5 + ouJuice)).toFixed(2));

    // ── Team Totals ──
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
  }).filter(Boolean), [todaysGames, state.teams]);

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
            player: p,
            team,
            opponent: opp,
            stats,
            line: {
              pts: round05(stats.ppg),
              reb: round05(stats.rpg),
              ast: round05(stats.apg),
              pra: round05(stats.ppg + stats.rpg + stats.apg),
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

  const parlayOdds    = combinedOdds(slipLegs);
  const potentialPayout = wager * (slipMode === 'parlay' ? parlayOdds : (slipLegs[0]?.odds ?? 1));

  const handlePlace = () => {
    if (!slipLegs.length || wager <= 0 || wager > state.stats.personalWealth) return;
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
    setWager(100);
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
      biggestWin, bestParlay, totalWagered, longestStreak,
    };
  }, [state.bets]);

  /* ─── Render ──────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#161a20]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Commissioner's Book</h2>
          </div>
          <p className="text-slate-500 text-xs font-medium tracking-wide pl-11">Private sportsbook — insider action only</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bankroll</p>
            <p className="text-2xl font-black text-emerald-400 font-mono">{formatCurrency(state.stats.personalWealth)}</p>
          </div>
          {betStats.profit !== 0 && (
            <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5
              ${betStats.profit >= 0
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              {betStats.profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {betStats.profit >= 0 ? '+' : ''}{formatCurrency(betStats.profit)}
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
      <div className="flex-1 overflow-hidden flex">

        {/* ── Main Content ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">

          {/* ════ TODAY'S LINES ════ */}
          {activeTab === 'lines' && (
            <>
              {gameCards.length === 0 ? (
                <EmptyState icon={<Clock className="w-8 h-8" />} title="No games today" body="Check back tomorrow for fresh lines." />
              ) : gameCards.map((card: any) => card && (
                <div key={card.game.gid} className="bg-[#1e232c] border border-slate-700/40 rounded-xl overflow-hidden hover:border-slate-600/60 transition-colors">
                  <div className="p-4">

                    {/* Teams Row */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 flex items-center gap-3">
                        <img src={card.away.logoUrl} alt={card.away.abbrev} className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
                        <div>
                          <p className="font-black text-white text-sm uppercase">{card.away.abbrev}</p>
                          <p className="text-xs text-slate-500">{card.away.name.split(' ').slice(-1)[0]}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-center px-2">
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">@</span>
                      </div>
                      <div className="flex-1 flex items-center gap-3 justify-end">
                        <div className="text-right">
                          <p className="font-black text-white text-sm uppercase">{card.home.abbrev}</p>
                          <p className="text-xs text-slate-500">{card.home.name.split(' ').slice(-1)[0]}</p>
                        </div>
                        <img src={card.home.logoUrl} alt={card.home.abbrev} className="w-9 h-9 object-contain" referrerPolicy="no-referrer" />
                      </div>
                    </div>

                    {/* ── 3 Market Columns: Spread | Moneyline | Total ── */}
                    <div className="grid grid-cols-3 gap-2">

                      {/* SPREAD */}
                      <div className="bg-slate-900/50 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">Spread</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => toggleLeg({
                              id: `sp-${card.game.gid}-away`, gameId: card.game.gid,
                              description: `${card.away.abbrev} ${card.awaySpread > 0 ? '+' : ''}${card.awaySpread}`,
                              subDescription: `vs ${card.home.abbrev}`,
                              odds: card.spreadOdds, condition: 'away_spread', type: 'spread',
                            })}
                            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-bold font-mono transition-all
                              ${isInSlip(`sp-${card.game.gid}-away`)
                                ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-700/80'}`}
                          >
                            <span className={`text-[10px] mb-0.5 font-bold uppercase tracking-wider ${isInSlip(`sp-${card.game.gid}-away`) ? 'text-emerald-100' : 'text-slate-400'}`}>{card.away.abbrev}</span>
                            <span className={isInSlip(`sp-${card.game.gid}-away`) ? 'text-white' : 'text-slate-200'}>{card.awaySpread > 0 ? '+' : ''}{card.awaySpread}</span>
                            <span className={`text-[10px] mt-0.5 ${isInSlip(`sp-${card.game.gid}-away`) ? 'text-emerald-100' : 'text-amber-400'}`}>{decimalToAmerican(card.spreadOdds)}</span>
                          </button>
                          <button
                            onClick={() => toggleLeg({
                              id: `sp-${card.game.gid}-home`, gameId: card.game.gid,
                              description: `${card.home.abbrev} ${card.homeSpread > 0 ? '+' : ''}${card.homeSpread}`,
                              subDescription: `vs ${card.away.abbrev} (Home)`,
                              odds: card.spreadOdds, condition: 'home_spread', type: 'spread',
                            })}
                            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-bold font-mono transition-all
                              ${isInSlip(`sp-${card.game.gid}-home`)
                                ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                : 'bg-slate-800/70 border-slate-700/60 hover:bg-slate-700/80'}`}
                          >
                            <span className={`text-[10px] mb-0.5 font-bold uppercase tracking-wider ${isInSlip(`sp-${card.game.gid}-home`) ? 'text-emerald-100' : 'text-slate-400'}`}>{card.home.abbrev}</span>
                            <span className={isInSlip(`sp-${card.game.gid}-home`) ? 'text-white' : 'text-slate-200'}>{card.homeSpread > 0 ? '+' : ''}{card.homeSpread}</span>
                            <span className={`text-[10px] mt-0.5 ${isInSlip(`sp-${card.game.gid}-home`) ? 'text-emerald-100' : 'text-amber-400'}`}>{decimalToAmerican(card.spreadOdds)}</span>
                          </button>
                        </div>
                      </div>

                      {/* MONEYLINE */}
                      <div className="bg-slate-900/50 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">Moneyline</p>
                        <div className="flex gap-1.5">
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
                      <div className="bg-slate-900/50 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">Total {card.projTotal}</p>
                        <div className="flex gap-1.5">
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

                    {/* ── More Markets Toggle ── */}
                    <button
                      onClick={() => toggleExpanded(card.game.gid)}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest py-1.5 border border-slate-700/40 rounded-lg hover:border-slate-600/60 transition-all"
                    >
                      {expandedGames.has(card.game.gid)
                        ? <><ChevronUp className="w-3 h-3" /> Hide Markets</>
                        : <><ChevronDown className="w-3 h-3" /> More Markets</>}
                    </button>

                    {/* Team Totals — shown when expanded */}
                    {expandedGames.has(card.game.gid) && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-0.5 mb-1">Team Totals</p>

                        <div className="bg-slate-900/40 rounded-lg p-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <img src={card.away.logoUrl} alt={card.away.abbrev} className="w-5 h-5 object-contain flex-shrink-0" referrerPolicy="no-referrer" />
                            <span className="text-xs font-bold text-slate-300 truncate">{card.away.name} Total</span>
                            <span className="text-[10px] font-bold text-slate-500 font-mono flex-shrink-0">{card.awayTeamTotal}</span>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <OddsButton size="sm" odds={card.ttOdds} label={`O ${card.awayTeamTotal}`}
                              selected={isInSlip(`tt-${card.game.gid}-away-over`)}
                              onClick={() => toggleLeg({ id: `tt-${card.game.gid}-away-over`, gameId: card.game.gid, description: `${card.away.name} Team Total Over ${card.awayTeamTotal}`, subDescription: `@ ${card.home.abbrev}`, odds: card.ttOdds, condition: 'away_team_total_over', type: 'over_under' })}
                            />
                            <OddsButton size="sm" odds={card.ttOdds} label={`U ${card.awayTeamTotal}`}
                              selected={isInSlip(`tt-${card.game.gid}-away-under`)}
                              onClick={() => toggleLeg({ id: `tt-${card.game.gid}-away-under`, gameId: card.game.gid, description: `${card.away.name} Team Total Under ${card.awayTeamTotal}`, subDescription: `@ ${card.home.abbrev}`, odds: card.ttOdds, condition: 'away_team_total_under', type: 'over_under' })}
                            />
                          </div>
                        </div>

                        <div className="bg-slate-900/40 rounded-lg p-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <img src={card.home.logoUrl} alt={card.home.abbrev} className="w-5 h-5 object-contain flex-shrink-0" referrerPolicy="no-referrer" />
                            <span className="text-xs font-bold text-slate-300 truncate">{card.home.name} Total</span>
                            <span className="text-[10px] font-bold text-slate-500 font-mono flex-shrink-0">{card.homeTeamTotal}</span>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <OddsButton size="sm" odds={card.ttOdds} label={`O ${card.homeTeamTotal}`}
                              selected={isInSlip(`tt-${card.game.gid}-home-over`)}
                              onClick={() => toggleLeg({ id: `tt-${card.game.gid}-home-over`, gameId: card.game.gid, description: `${card.home.name} Team Total Over ${card.homeTeamTotal}`, subDescription: `vs ${card.away.abbrev} (Home)`, odds: card.ttOdds, condition: 'home_team_total_over', type: 'over_under' })}
                            />
                            <OddsButton size="sm" odds={card.ttOdds} label={`U ${card.homeTeamTotal}`}
                              selected={isInSlip(`tt-${card.game.gid}-home-under`)}
                              onClick={() => toggleLeg({ id: `tt-${card.game.gid}-home-under`, gameId: card.game.gid, description: `${card.home.name} Team Total Under ${card.homeTeamTotal}`, subDescription: `vs ${card.away.abbrev} (Home)`, odds: card.ttOdds, condition: 'home_team_total_under', type: 'over_under' })}
                            />
                          </div>
                        </div>
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
              <div className="flex gap-2 sticky top-0 z-10 bg-[#161a20] pb-2">
                {([
                  { key: 'pts', label: 'Points'  },
                  { key: 'reb', label: 'Rebounds' },
                  { key: 'ast', label: 'Assists'  },
                  { key: 'pra', label: 'PRA'      },
                ] as { key: PropStat; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPropStat(key)}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg border transition-all
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
                    <span className="font-black">PRA</span> — Points + Rebounds + Assists combined. Most popular combo prop in NBA betting.
                  </p>
                </div>
              )}

              {playerProps.length === 0 ? (
                <EmptyState icon={<User className="w-8 h-8" />} title="No props available" body="Props are generated from players in today's games." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {playerProps.map((prop: any, i: number) => {
                    const line    = prop.line[propStat];
                    const overId  = `prop-${prop.player.internalId}-${propStat}-over`;
                    const underId = `prop-${prop.player.internalId}-${propStat}-under`;

                    const marketLabel = propStat === 'pts' ? 'Points'
                      : propStat === 'reb' ? 'Rebounds'
                      : propStat === 'ast' ? 'Assists'
                      : 'Pts+Reb+Ast';
                    const avg = propStat === 'pts' ? prop.stats.ppg
                      : propStat === 'reb' ? prop.stats.rpg
                      : propStat === 'ast' ? prop.stats.apg
                      : round05(prop.stats.ppg + prop.stats.rpg + prop.stats.apg);

                    return (
                      <div key={i} className="bg-[#1e232c] border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center text-sm font-black text-slate-300 flex-shrink-0 overflow-hidden">
                            {prop.player.imgURL
                              ? <img src={prop.player.imgURL} alt={prop.player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              : <span>{(prop.player.name ?? '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-white text-sm truncate">{prop.player.name ?? 'Unknown'}</p>
                            <p className="text-xs text-slate-500">
                              <span className="text-slate-600 font-bold mr-1.5">{prop.player.pos ?? '—'}</span>
                              <span className="text-slate-400 font-medium">{prop.team.abbrev}</span>
                              <span className="mx-1.5 text-slate-700">vs</span>
                              <span>{prop.opponent.abbrev}</span>
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] font-bold text-slate-500 mb-0.5">Season Avg</p>
                            <p className="text-[10px] text-slate-400 font-mono leading-tight">{prop.stats.ppg} PPG</p>
                            <p className="text-[10px] text-slate-400 font-mono leading-tight">{prop.stats.rpg} RPG</p>
                            <p className="text-[10px] text-slate-400 font-mono leading-tight">{prop.stats.apg} APG</p>
                          </div>
                        </div>

                        <div className="border-t border-slate-700/40 pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {marketLabel} O/U {line}
                            </p>
                            {propStat === 'pra' && (
                              <span className="text-[10px] font-black text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                avg {avg}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
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
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Pending',  value: betStats.pending,       color: 'amber'   },
                  { label: 'Won',      value: betStats.won,           color: 'emerald' },
                  { label: 'Lost',     value: betStats.lost,          color: 'rose'    },
                  { label: 'Win Rate', value: `${betStats.winRate}%`, color: 'indigo'  },
                ].map(stat => (
                  <div key={stat.label} className={`bg-[#1e232c] border rounded-xl p-3 text-center border-${stat.color}-500/20`}>
                    <p className={`text-2xl font-black text-${stat.color}-400 font-mono`}>{stat.value}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-emerald-400 font-mono">
                    {betStats.biggestWin !== null ? `+${formatCurrency(betStats.biggestWin)}` : '--'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Biggest Win</p>
                </div>
                <div className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-indigo-400 font-mono">
                    {betStats.bestParlay !== null ? decimalToAmerican(betStats.bestParlay) : '--'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Best Parlay</p>
                </div>
                <div className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-white font-mono">{formatCurrency(betStats.totalWagered)}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Total Wagered</p>
                </div>
                <div className="bg-[#1e232c] border border-slate-700/30 rounded-xl p-3 text-center">
                  <p className="text-lg font-black text-amber-400 font-mono">
                    {betStats.longestStreak > 0 ? `${betStats.longestStreak}W` : '--'}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Best Streak</p>
                </div>
              </div>

              {(betStats.won + betStats.lost) > 0 && (
                <div className="bg-[#1e232c] border border-slate-700/40 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total P&L</span>
                    <span className={`text-sm font-black font-mono ${betStats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {betStats.profit >= 0 ? '+' : ''}{formatCurrency(betStats.profit)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${betStats.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${Math.min(100, Math.abs(betStats.winRate))}%` }}
                    />
                  </div>
                </div>
              )}

              {(state.bets?.length ?? 0) === 0 ? (
                <EmptyState icon={<Trophy className="w-8 h-8" />} title="No bets yet" body="Place your first bet from the Lines or Props tabs." />
              ) : (
                <div className="space-y-2">
                  {[...state.bets].reverse().map((bet: any) => (
                    <div key={bet.id} className={`bg-[#1e232c] rounded-xl border p-4 transition-colors
                      ${bet.status === 'won' ? 'border-emerald-500/30' : bet.status === 'lost' ? 'border-rose-500/20' : 'border-slate-700/40'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <StatusBadge status={bet.status} />
                            {bet.legs?.length > 1 && (
                              <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {bet.legs.length}-Leg Parlay
                              </span>
                            )}
                            <span className="text-[10px] text-slate-600 font-mono">{new Date(bet.date).toLocaleDateString()}</span>
                          </div>
                          <div className="space-y-0.5">
                            {bet.legs?.map((leg: any, i: number) => (
                              <p key={i} className="text-sm text-slate-300 font-medium">{leg.description}</p>
                            ))}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-slate-500 font-mono">Wager</p>
                          <p className="text-sm font-bold text-white font-mono">{formatCurrency(bet.wager)}</p>
                          <p className="text-xs text-slate-500 font-mono mt-1">To Win</p>
                          <p className={`text-sm font-bold font-mono
                            ${bet.status === 'won' ? 'text-emerald-400' : bet.status === 'lost' ? 'text-slate-600 line-through' : 'text-amber-400'}`}>
                            {formatCurrency(bet.potentialPayout - bet.wager)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Bet Slip Sidebar ── */}
        {activeTab !== 'mybets' && (
          <div className="w-72 flex-shrink-0 border-l border-slate-800/60 bg-[#1a1e26] flex flex-col">
            <div className="p-4 border-b border-slate-800/60">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Bet Slip
                  {slipLegs.length > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                      {slipLegs.length}
                    </span>
                  )}
                </h3>
                {slipLegs.length > 0 && (
                  <button onClick={() => setSlipLegs([])} className="text-slate-600 hover:text-rose-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex bg-slate-900/60 rounded-lg p-0.5">
                {(['single', 'parlay'] as SlipMode[]).map(m => (
                  <button key={m}
                    onClick={() => { setSlipMode(m); if (m === 'single' && slipLegs.length > 1) setSlipLegs([slipLegs[slipLegs.length - 1]]); }}
                    className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${slipMode === m ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {m === 'single' ? 'Single' : `Parlay${slipLegs.length > 1 ? ` (${slipLegs.length})` : ''}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {slipLegs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
                  <div className="w-12 h-12 rounded-full bg-slate-800/60 flex items-center justify-center mb-3">
                    <Plus className="w-5 h-5 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-xs font-medium">Click any odds button<br />to add a selection</p>
                </div>
              ) : slipLegs.map(leg => (
                <div key={leg.id} className="bg-slate-900/60 rounded-lg p-3 border border-emerald-500/20 relative group">
                  <button onClick={() => removeLeg(leg.id)} className="absolute top-2 right-2 text-slate-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-xs font-bold text-white pr-5 leading-snug">{leg.description}</p>
                  {leg.subDescription && <p className="text-[10px] text-slate-500 mt-0.5">{leg.subDescription}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {leg.type === 'moneyline' ? 'Moneyline' : leg.type === 'spread' ? 'Spread' : 'O/U'}
                    </span>
                    <span className="text-sm font-black text-amber-400 font-mono">{decimalToAmerican(leg.odds)}</span>
                  </div>
                </div>
              ))}

              {slipMode === 'parlay' && slipLegs.length > 1 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5">Combined Odds</p>
                  <p className="text-xl font-black text-emerald-400 font-mono">{decimalToAmerican(parlayOdds)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{parlayOdds.toFixed(2)}x</p>
                </div>
              )}
            </div>

            {slipLegs.length > 0 && (
              <div className="p-4 border-t border-slate-800/60 space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Wager</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">$</span>
                    <input type="number" min="1" max={state.stats.personalWealth} value={wager}
                      onChange={e => setWager(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-slate-900 border border-slate-700/60 rounded-lg py-2 pl-7 pr-3 text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500/60 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-1.5">
                    {[100, 500, 1000, 5000].map(amt => (
                      <button key={amt} onClick={() => setWager(amt)}
                        className="bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-white text-[10px] font-bold py-1 rounded transition-colors border border-slate-700/40">
                        ${amt >= 1000 ? `${amt / 1000}k` : amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Wager</span>
                    <span className="text-white font-mono font-bold">{formatCurrency(wager)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Odds</span>
                    <span className="text-amber-400 font-mono font-bold">
                      {decimalToAmerican(slipMode === 'parlay' ? parlayOdds : slipLegs[0]?.odds ?? 1)}
                    </span>
                  </div>
                  <div className="border-t border-slate-700/40 pt-1.5 flex justify-between">
                    <span className="text-xs font-bold text-slate-400">To Win</span>
                    <span className="text-base font-black text-emerald-400 font-mono">{formatCurrency(potentialPayout - wager)}</span>
                  </div>
                </div>

                <button onClick={handlePlace} disabled={wager <= 0 || wager > state.stats.personalWealth}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm uppercase tracking-widest shadow-[0_4px_20px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_28px_rgba(16,185,129,0.4)] disabled:shadow-none"
                >
                  <CheckCircle className="w-4 h-4" />
                  Place {slipMode === 'parlay' ? 'Parlay' : 'Bet'}
                </button>
                {wager > state.stats.personalWealth && (
                  <p className="text-rose-400 text-[10px] font-bold text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Insufficient funds
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SportsbookView;

/* ─── Shared tiny components ──────────────────────────────────── */

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { cls: string; label: string; Icon: any }> = {
    pending: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',      label: 'Pending', Icon: Clock       },
    won:     { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Won',     Icon: CheckCircle },
    lost:    { cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20',          label: 'Lost',    Icon: XCircle     },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${cfg.cls}`}>
      <cfg.Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
};

const EmptyState = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-600 mb-4">
      {icon}
    </div>
    <p className="text-slate-300 font-bold text-lg mb-1">{title}</p>
    <p className="text-slate-500 text-sm max-w-xs">{body}</p>
  </div>
);
