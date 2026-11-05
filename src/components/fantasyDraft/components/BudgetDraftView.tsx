import React, { useState, useMemo } from 'react';
import { Search, Filter, ShoppingCart, DollarSign, AlertCircle, Trophy, UserCheck } from 'lucide-react';
import { BudgetPlayer, isPurchaseFeasible } from '../lib/budgetDraft';
import { TeamLogo, NBA_TEAMS_BRANDING } from '../lib/nbaBranding';
import { getEligiblePositions, getResolvedOvr, OrdinaryDraftType, Player } from '../types';

interface BudgetDraftViewProps {
  players: (Player | BudgetPlayer)[];
  remainingBudget?: number;
  rosterCount: number;
  onBuyPlayer: (player: Player) => void;
  isOrdinaryDraft?: boolean;
  ordinaryDraftType?: OrdinaryDraftType | null;
  currentRound?: number;
  currentPickNumber?: number;
  pickInRound?: number;
  rosterSize: number;
  teamCount: number;
}

export function BudgetDraftView({ 
  players, 
  remainingBudget = 85, 
  rosterCount, 
  onBuyPlayer,
  isOrdinaryDraft = false,
  ordinaryDraftType,
  currentRound = 0,
  currentPickNumber = 1,
  pickInRound = 1,
  rosterSize,
  teamCount,
}: BudgetDraftViewProps) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'OVR' | 'PRICE'>('OVR');

  const filteredPlayers = useMemo(() => {
    return players
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
        
        const matchesPos = (() => {
          if (posFilter === 'ALL') return true;
          const n = p.position.toUpperCase().replace(/[\s\/-]/g, '');
          const orig = p.position.toUpperCase().trim();
          
          if (posFilter === 'G') {
            const guards = ['PG', 'SG', 'G', 'GF', 'FG', 'PGSG', 'SGPG', 'SGSF', 'SFSG'];
            return guards.includes(n) || orig === 'G' || orig === 'PG' || orig === 'SG' || orig.includes('GUARD');
          }
          if (posFilter === 'F') {
            const forwards = ['SF', 'PF', 'F', 'GF', 'FG', 'FC', 'CF', 'SFPF', 'PFSF'];
            return forwards.includes(n) || orig === 'F' || orig === 'SF' || orig === 'PF' || orig.includes('FORWARD');
          }
          if (posFilter === 'C') {
            const centers = ['C', 'FC', 'CF', 'PFC', 'CPF'];
            return centers.includes(n) || orig === 'C' || orig.includes('CENTER');
          }
          return false;
        })();

        const matchesTeam = teamFilter === 'ALL' || p.teamAbbrev === teamFilter;
        return matchesSearch && matchesPos && matchesTeam;
      })
      .sort((a, b) => {
        const ovrA = getResolvedOvr(a);
        const ovrB = getResolvedOvr(b);
        if (!isOrdinaryDraft && sortBy === 'PRICE') {
          const priceA = (a as BudgetPlayer).fantasyPrice || 0;
          const priceB = (b as BudgetPlayer).fantasyPrice || 0;
          if (priceB !== priceA) return priceB - priceA;
          return ovrB - ovrA;
        }
        if (ovrB !== ovrA) return ovrB - ovrA;
        const priceA = (a as BudgetPlayer).fantasyPrice || 0;
        const priceB = (b as BudgetPlayer).fantasyPrice || 0;
        return priceB - priceA;
      });
  }, [players, search, posFilter, teamFilter, sortBy, isOrdinaryDraft]);

  const teams = useMemo(() => {
    const set = new Set(players.map(p => p.teamAbbrev));
    return Array.from(set).sort();
  }, [players]);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header Info */}
      {isOrdinaryDraft ? (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <Trophy className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-amber-400 uppercase tracking-tight">
                ORDINARY DRAFT — {ordinaryDraftType}
              </div>
              <div className="text-xs font-mono font-bold text-slate-300 mt-1 uppercase tracking-widest">
                ROUND {currentRound + 1} / {rosterSize}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center sm:text-right">
              <div className="text-2xl font-black text-white font-mono uppercase leading-none">
                YOUR PICK
              </div>
              <div className="text-xs font-mono font-bold text-amber-400 mt-1 uppercase tracking-widest">
                PICK #{currentPickNumber} • {pickInRound} / {teamCount}
              </div>
            </div>
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-2xl">
              <UserCheck className="w-8 h-8 text-amber-400" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <DollarSign className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <div className="text-4xl font-black text-white font-mono leading-none">${remainingBudget}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">REMAINING BUDGET</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-4xl font-black text-white font-mono leading-none">{rosterCount} / {rosterSize}</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">ROSTER SLOTS</div>
            </div>
            <div className="p-3 bg-slate-800 border border-slate-700 rounded-2xl">
              <ShoppingCart className="w-8 h-8 text-slate-400" />
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-amber-500 appearance-none transition-colors"
        >
          <option value="ALL">All Positions</option>
          <option value="G">Guards</option>
          <option value="F">Forwards</option>
          <option value="C">Centers</option>
        </select>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-amber-500 appearance-none transition-colors"
        >
          <option value="ALL">All Teams</option>
          {teams.map(t => {
            const teamInfo = NBA_TEAMS_BRANDING[t];
            return (
              <option key={t} value={t}>
                {teamInfo ? teamInfo.name : t}
              </option>
            );
          })}
        </select>

        {!isOrdinaryDraft ? (
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setSortBy('OVR')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${sortBy === 'OVR' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Sort by OVR
            </button>
            <button
              onClick={() => setSortBy('PRICE')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${sortBy === 'PRICE' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Sort by Price
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs font-bold text-amber-400 uppercase tracking-wider">
            SORTED BY OVR
          </div>
        )}
      </div>

      {/* Player List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredPlayers.map(player => {
          const budgetPlayer = player as BudgetPlayer;
          const isAffordable = isOrdinaryDraft ? true : (budgetPlayer.fantasyPrice <= remainingBudget);
          const isFeasible = isOrdinaryDraft ? true : isPurchaseFeasible(remainingBudget, budgetPlayer.fantasyPrice, rosterCount, rosterSize);
          const canBuy = isOrdinaryDraft ? true : (isAffordable && isFeasible);
          
          let disableReason = '';
          if (!isOrdinaryDraft) {
            if (!isAffordable) disableReason = 'NOT ENOUGH BUDGET';
            else if (!isFeasible) {
              const requiredReserve = rosterSize - (rosterCount + 1);
              disableReason = `MUST RESERVE $${requiredReserve} FOR ${requiredReserve} REMAINING SLOTS`;
            }
          }

          return (
            <div 
              key={player.id}
              className={`group flex items-center gap-4 p-4 rounded-2xl bg-slate-900 border transition-all ${canBuy ? 'border-slate-800 hover:border-amber-500/50' : 'border-slate-800 opacity-60'}`}
            >
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden border border-slate-700">
                  <img
                    src={player.headshotUrl || `https://via.placeholder.com/56?text=${player.lastName}`}
                    alt={player.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <TeamLogo abbrev={player.teamAbbrev} sizeClass="w-6 h-6 border-2 border-slate-900 rounded-full" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-white uppercase truncate tracking-tight">{player.name}</h4>
                  <span className="text-xs font-mono font-bold text-amber-400 shrink-0">{getResolvedOvr(player)} OVR</span>
                </div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {player.displayPos || player.position} • {player.teamAbbrev}
                </div>
                
                <div className="mt-3 flex items-center justify-between">
                  {!isOrdinaryDraft ? (
                    <div className="text-xl font-black text-white font-mono leading-none">${budgetPlayer.fantasyPrice}</div>
                  ) : (
                    <div className="text-xs font-mono font-bold text-slate-400 uppercase">AVAILABLE</div>
                  )}
                  
                  {canBuy ? (
                    <button
                      onClick={() => onBuyPlayer(player)}
                      className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black uppercase transition-all active:scale-95 cursor-pointer"
                    >
                      {isOrdinaryDraft ? 'DRAFT' : 'ADD'}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[8px] font-black text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 uppercase tracking-tighter">
                      <AlertCircle className="w-3 h-3" /> {disableReason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
