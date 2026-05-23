import React from 'react';
import { Activity, BarChart2, ChevronDown, ChevronUp, Clock, Plus, Target, TrendingDown, TrendingUp, Trophy, User, X, Zap } from 'lucide-react';
import { formatCurrency } from '../../../utils/helpers';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { BetSlipPanel } from './sportsbook/BetSlipPanel';
import { EmptyState, OddsButton, StatusBadge, TabButton } from './sportsbook/SportsbookShared';
import { decimalToAmerican, round05, type BetTab, type PropStat } from './sportsbook/sportsbookTypes';
export { SportsbookMyBetsTab } from './SportsbookMyBetsTab';

export const SportsbookHeader: React.FC<{
  bankroll: number;
  profit: number;
}> = ({ bankroll, profit }) => (
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
        <p className="text-lg sm:text-2xl font-black text-emerald-400 font-mono">{formatCurrency(bankroll)}</p>
      </div>
      {profit !== 0 && (
        <div className={`hidden sm:flex px-3 py-1.5 rounded-lg text-xs font-bold items-center gap-1.5 ${
          profit >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        }`}>
          {profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {profit >= 0 ? '+' : ''}{formatCurrency(profit, false)}
        </div>
      )}
    </div>
  </div>
);

export const SportsbookTabBar: React.FC<{
  activeTab: BetTab;
  pendingCount: number;
  onChange: (tab: BetTab) => void;
}> = ({ activeTab, pendingCount, onChange }) => (
  <div className="flex-shrink-0 flex border-b border-slate-800/60 bg-[#1a1e26] overflow-x-auto">
    <TabButton active={activeTab === 'lines'} onClick={() => onChange('lines')} icon={BarChart2} label="Today's Lines" />
    <TabButton active={activeTab === 'props'} onClick={() => onChange('props')} icon={Target} label="Player Props" />
    <TabButton active={activeTab === 'mybets'} onClick={() => onChange('mybets')} icon={Trophy} label="My Bets" badge={pendingCount} />
  </div>
);

export const SportsbookLinesTab: React.FC<{
  gameCards: any[];
  teamRecords: Record<number, { w: number; l: number }>;
  expandedGames: Set<number>;
  isInSlip: (legId: string) => boolean;
  toggleLeg: (leg: any) => void;
  toggleExpanded: (gid: number) => void;
}> = ({ gameCards, teamRecords, expandedGames, isInSlip, toggleLeg, toggleExpanded }) => {
  if (gameCards.length === 0) {
    return <EmptyState icon={<Clock className="w-8 h-8" />} title="No games today" body="Check back tomorrow for fresh lines." />;
  }

  return (
    <>
      {gameCards.map((card: any) => card && (
        <div key={card.game.gid} className="bg-[#1e232c] border border-slate-700/40 rounded-xl overflow-hidden hover:border-slate-600/60 transition-colors">
          <div className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="flex-1 flex items-center gap-2 sm:gap-3">
                <img src={card.away.logoUrl} alt={card.away.abbrev} className="w-7 h-7 sm:w-9 sm:h-9 object-contain" referrerPolicy="no-referrer" />
                <div>
                  <p className="font-black text-white text-xs sm:text-sm uppercase">{card.away.abbrev}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500">{card.away.name.split(' ').slice(-1)[0]}</p>
                  {teamRecords[card.away.id] && <p className="text-[10px] text-slate-600 font-mono">{teamRecords[card.away.id].w}-{teamRecords[card.away.id].l}</p>}
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">@</span>
              <div className="flex-1 flex items-center gap-2 sm:gap-3 justify-end">
                <div className="text-right">
                  <p className="font-black text-white text-xs sm:text-sm uppercase">{card.home.abbrev}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500">{card.home.name.split(' ').slice(-1)[0]}</p>
                  {teamRecords[card.home.id] && <p className="text-[10px] text-slate-600 font-mono">{teamRecords[card.home.id].w}-{teamRecords[card.home.id].l}</p>}
                </div>
                <img src={card.home.logoUrl} alt={card.home.abbrev} className="w-7 h-7 sm:w-9 sm:h-9 object-contain" referrerPolicy="no-referrer" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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

              <div className="bg-slate-900/50 rounded-lg p-2 sm:p-2.5">
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 sm:mb-2 text-center">ML</p>
                <div className="flex gap-1 sm:gap-1.5">
                  <OddsButton size="sm" wide odds={card.awayML} label={card.away.abbrev} selected={isInSlip(`ml-${card.game.gid}-away`)} onClick={() => toggleLeg({ id: `ml-${card.game.gid}-away`, gameId: card.game.gid, description: `${card.away.name} ML`, subDescription: `vs ${card.home.abbrev}`, odds: card.awayML, condition: 'away_win', type: 'moneyline' })} />
                  <OddsButton size="sm" wide odds={card.homeML} label={card.home.abbrev} selected={isInSlip(`ml-${card.game.gid}-home`)} onClick={() => toggleLeg({ id: `ml-${card.game.gid}-home`, gameId: card.game.gid, description: `${card.home.name} ML`, subDescription: `vs ${card.away.abbrev} (Home)`, odds: card.homeML, condition: 'home_win', type: 'moneyline' })} />
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-2 sm:p-2.5">
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 sm:mb-2 text-center">O/U {card.projTotal}</p>
                <div className="flex gap-1 sm:gap-1.5">
                  <OddsButton size="sm" wide odds={card.overOdds} label="Over" selected={isInSlip(`ou-${card.game.gid}-over`)} onClick={() => toggleLeg({ id: `ou-${card.game.gid}-over`, gameId: card.game.gid, description: `Over ${card.projTotal} pts`, subDescription: `${card.away.abbrev} @ ${card.home.abbrev}`, odds: card.overOdds, condition: 'over', type: 'over_under' })} />
                  <OddsButton size="sm" wide odds={card.underOdds} label="Under" selected={isInSlip(`ou-${card.game.gid}-under`)} onClick={() => toggleLeg({ id: `ou-${card.game.gid}-under`, gameId: card.game.gid, description: `Under ${card.projTotal} pts`, subDescription: `${card.away.abbrev} @ ${card.home.abbrev}`, odds: card.underOdds, condition: 'under', type: 'over_under' })} />
                </div>
              </div>
            </div>

            <button onClick={() => toggleExpanded(card.game.gid)} className="mt-2 sm:mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest py-1.5 border border-slate-700/40 rounded-lg hover:border-slate-600/60 transition-all">
              {expandedGames.has(card.game.gid) ? <><ChevronUp className="w-3 h-3" /> Hide Markets</> : <><ChevronDown className="w-3 h-3" /> More Markets</>}
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
                      <OddsButton size="sm" odds={card.ttOdds} label={`O ${total}`} selected={isInSlip(`tt-${card.game.gid}-${side}-over`)} onClick={() => toggleLeg({ id: `tt-${card.game.gid}-${side}-over`, gameId: card.game.gid, description: `${team.name} Total Over ${total}`, subDescription: `vs ${opp.abbrev}`, odds: card.ttOdds, condition: `${side}_team_total_over`, type: 'over_under' })} />
                      <OddsButton size="sm" odds={card.ttOdds} label={`U ${total}`} selected={isInSlip(`tt-${card.game.gid}-${side}-under`)} onClick={() => toggleLeg({ id: `tt-${card.game.gid}-${side}-under`, gameId: card.game.gid, description: `${team.name} Total Under ${total}`, subDescription: `vs ${opp.abbrev}`, odds: card.ttOdds, condition: `${side}_team_total_under`, type: 'over_under' })} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
};

export const SportsbookPropsTab: React.FC<{
  propStat: PropStat;
  playerProps: any[];
  isInSlip: (legId: string) => boolean;
  toggleLeg: (leg: any) => void;
  onPropStatChange: (stat: PropStat) => void;
}> = ({ propStat, playerProps, isInSlip, toggleLeg, onPropStatChange }) => (
  <>
    <div className="flex gap-1.5 sm:gap-2 sticky top-0 z-10 bg-[#161a20] pb-2">
      {([
        { key: 'pts', label: 'Points' },
        { key: 'reb', label: 'Rebounds' },
        { key: 'ast', label: 'Assists' },
        { key: 'pra', label: 'PRA' },
      ] as { key: PropStat; label: string }[]).map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onPropStatChange(key)}
          className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-lg border transition-all ${propStat === key ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300'}`}
        >
          {label}
        </button>
      ))}
    </div>

    {propStat === 'pra' && (
      <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2">
        <Zap className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
        <p className="text-[11px] text-indigo-300 font-medium"><span className="font-black">PRA</span> — Points + Rebounds + Assists combined.</p>
      </div>
    )}

    {playerProps.length === 0 ? (
      <EmptyState icon={<User className="w-8 h-8" />} title="No props available" body="Props are generated from players in today's games." />
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {playerProps.map((prop: any, i: number) => {
          const line = prop.line[propStat];
          const overId = `prop-${prop.player.internalId}-${propStat}-over`;
          const underId = `prop-${prop.player.internalId}-${propStat}-under`;
          const marketLabel = propStat === 'pts' ? 'Points' : propStat === 'reb' ? 'Rebounds' : propStat === 'ast' ? 'Assists' : 'Pts+Reb+Ast';
          const avg = propStat === 'pts' ? prop.stats.ppg : propStat === 'reb' ? prop.stats.rpg : propStat === 'ast' ? prop.stats.apg : round05(prop.stats.ppg + prop.stats.rpg + prop.stats.apg);

          return (
            <div key={i} className="bg-[#1e232c] border border-slate-700/40 rounded-xl p-3 sm:p-4 hover:border-slate-600/60 transition-colors">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center text-sm font-black text-slate-300 flex-shrink-0 overflow-hidden">
                  {prop.player.imgURL ? <img src={prop.player.imgURL} alt={prop.player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <span>{(prop.player.name ?? '??').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>}
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
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] font-bold text-slate-500 mb-0.5">Season Avg</p>
                  {propStat === 'pts' && <p className="text-sm font-black text-emerald-300 font-mono">{prop.stats.ppg} PPG</p>}
                  {propStat === 'reb' && <p className="text-sm font-black text-emerald-300 font-mono">{prop.stats.rpg} RPG</p>}
                  {propStat === 'ast' && <p className="text-sm font-black text-emerald-300 font-mono">{prop.stats.apg} APG</p>}
                  {propStat === 'pra' && <p className="text-sm font-black text-indigo-300 font-mono">{round05(prop.stats.ppg + prop.stats.rpg + prop.stats.apg)} PRA</p>}
                </div>
              </div>

              <div className="border-t border-slate-700/40 pt-2 sm:pt-3">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{marketLabel} O/U {line}</p>
                  {propStat === 'pra' && <span className="text-[10px] font-black text-indigo-400 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">avg {avg}</span>}
                </div>
                <div className="flex gap-1.5 sm:gap-2">
                  <OddsButton wide odds={prop.overOdds} label={`Over ${line}`} selected={isInSlip(overId)} onClick={() => toggleLeg({ id: overId, playerId: prop.player.internalId, description: `${prop.player.name ?? 'Player'} Over ${line} ${marketLabel}`, subDescription: `${prop.team.abbrev} vs ${prop.opponent.abbrev}`, odds: prop.overOdds, condition: `${propStat}_over`, type: 'over_under' })} />
                  <OddsButton wide odds={prop.underOdds} label={`Under ${line}`} selected={isInSlip(underId)} onClick={() => toggleLeg({ id: underId, playerId: prop.player.internalId, description: `${prop.player.name ?? 'Player'} Under ${line} ${marketLabel}`, subDescription: `${prop.team.abbrev} vs ${prop.opponent.abbrev}`, odds: prop.underOdds, condition: `${propStat}_under`, type: 'over_under' })} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </>
);

export const SportsbookDesktopSlip: React.FC<{
  showSlip: boolean;
  slipLegs: any[];
  slipMode: any;
  wagerStr: string;
  setWagerStr: (value: string) => void;
  setSlipMode: (mode: any) => void;
  setSlipLegs: React.Dispatch<React.SetStateAction<any[]>>;
  removeLeg: (id: string) => void;
  handlePlace: () => void;
  maxWagerDollars: number;
}> = ({ showSlip, slipLegs, slipMode, wagerStr, setWagerStr, setSlipMode, setSlipLegs, removeLeg, handlePlace, maxWagerDollars }) => {
  if (!showSlip) return null;
  return (
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
  );
};

export const SportsbookMobileSlipFab: React.FC<{
  showSlip: boolean;
  slipLegs: any[];
  onOpen: () => void;
}> = ({ showSlip, slipLegs, onOpen }) => {
  if (!showSlip || slipLegs.length === 0) return null;
  return (
    <button onClick={onOpen} className="md:hidden fixed bottom-4 right-4 z-50 bg-emerald-500 hover:bg-emerald-400 text-white font-black px-4 py-3 rounded-2xl shadow-[0_4px_20px_rgba(16,185,129,0.4)] flex items-center gap-2 text-sm uppercase tracking-widest">
      <Plus className="w-4 h-4" />
      Slip ({slipLegs.length})
    </button>
  );
};

export const SportsbookBoxScoreLayer: React.FC<{
  selectedBoxScore: any;
  state: any;
  onClose: () => void;
}> = ({ selectedBoxScore, state, onClose }) => {
  if (!selectedBoxScore) return null;
  const homeTeam = (state.teams as any[]).find((t: any) => t.id === selectedBoxScore.homeTeamId);
  const awayTeam = (state.teams as any[]).find((t: any) => t.id === selectedBoxScore.awayTeamId);
  if (!homeTeam || !awayTeam) return null;
  return <BoxScoreModal game={selectedBoxScore} homeTeam={homeTeam} awayTeam={awayTeam} players={state.players as any[]} onClose={onClose} />;
};

export const SportsbookMobileSlipDrawer: React.FC<{
  slipDrawerOpen: boolean;
  showSlip: boolean;
  slipLegs: any[];
  slipMode: any;
  wagerStr: string;
  setWagerStr: (value: string) => void;
  setSlipMode: (mode: any) => void;
  setSlipLegs: React.Dispatch<React.SetStateAction<any[]>>;
  removeLeg: (id: string) => void;
  handlePlace: () => void;
  maxWagerDollars: number;
  onClose: () => void;
}> = ({ slipDrawerOpen, showSlip, slipLegs, slipMode, wagerStr, setWagerStr, setSlipMode, setSlipLegs, removeLeg, handlePlace, maxWagerDollars, onClose }) => {
  if (!slipDrawerOpen || !showSlip) return null;
  return (
    <div className="md:hidden fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#1a1e26] rounded-t-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 pt-4 pb-0">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bet Slip</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
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
  );
};
