import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpDown, Briefcase, ChevronDown, Globe, Hourglass, PlayCircle, Search, Trophy, User, UserX, Users } from 'lucide-react';
import { formatCurrencyWithCode } from '../../../utils/helpers';
import { FreeAgentCard } from './FreeAgentCard';

const poolIcons = { Globe, Briefcase, Trophy };

export const FreeAgentsOverlays: React.FC<{
  offseasonBlockOpen: boolean;
  setOffseasonBlockOpen: (open: boolean) => void;
  showFaHeadsUp: boolean;
  dismissFaHeadsUp: () => void;
  moratoriumEndLabel: string;
}> = ({ offseasonBlockOpen, setOffseasonBlockOpen, showFaHeadsUp, dismissFaHeadsUp, moratoriumEndLabel }) => (
  <AnimatePresence>
    {offseasonBlockOpen && (
      <div className="fixed inset-0 z-[121] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOffseasonBlockOpen(false)} />
        <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]"><h2 className="text-lg font-black uppercase tracking-tight text-white">Free Agency Flow</h2></div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">Calendar sim is paused during offseason free agency so bid markets, RFA decisions, and phase changes resolve in order.</p>
            <p className="text-sm text-slate-500 leading-relaxed">Use the <span className="font-black text-amber-300">Free Agency Day bar</span> at the bottom to advance the market.</p>
            <button onClick={() => setOffseasonBlockOpen(false)} className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors">Got it</button>
          </div>
        </motion.div>
      </div>
    )}
    {showFaHeadsUp && (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={dismissFaHeadsUp} />
        <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} className="relative w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 bg-amber-500/[0.06]"><h2 className="text-lg font-black uppercase tracking-tight text-white">Free Agency Has Opened</h2></div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">July 1 is when teams can start talking money with the players who are already free agents. Those players are in <span className="font-black text-white">Available</span>.</p>
            <p className="text-sm text-slate-300 leading-relaxed"><span className="font-black text-white">Upcoming</span> is a watchlist. Those players are still attached to a team, so they are not on the open market yet. They may re-sign, pick up an option, have a team option decided, or become free agents later.</p>
            <p className="text-sm text-slate-300 leading-relaxed">During the first few days, deals are mostly being negotiated. Use the top PlayButton dropdown and click <span className="font-black text-amber-300">Through moratorium</span> to jump to {moratoriumEndLabel}, when signings and market decisions start landing.</p>
            <button onClick={dismissFaHeadsUp} className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs py-3 transition-colors">Got it</button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const FreeAgentsRosterBadges: React.FC<{ userRosterSlots: any; currencyCode: string }> = ({ userRosterSlots, currencyCode }) => (
  <>
    {userRosterSlots.isTrainingCamp && <div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${userRosterSlots.totalCount >= userRosterSlots.maxStandard ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-sky-500/10 border-sky-500/30 text-sky-300'}`}>Camp {userRosterSlots.totalCount}/{userRosterSlots.maxStandard}</span></div>}
    <div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${userRosterSlots.guaranteedCount >= userRosterSlots.maxGuaranteed ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>Guaranteed {userRosterSlots.guaranteedCount}/{userRosterSlots.maxGuaranteed}</span></div>
    <div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${userRosterSlots.twoWayLeft === 0 ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-violet-500/10 border-violet-500/30 text-violet-300'}`}>Two-Way {userRosterSlots.twoWayCount}/{userRosterSlots.maxTwoWay}</span></div>
    {userRosterSlots.ngCount > 0 && <div className="flex items-center gap-2"><span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border bg-amber-500/10 border-amber-500/30 text-amber-300">{userRosterSlots.ngCount} Non-Guaranteed</span></div>}
    <div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${userRosterSlots.capSpaceUSD >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-700/30 border-slate-600/40 text-slate-400'}`}>{userRosterSlots.capSpaceUSD >= 0 ? `Cap Space ${formatCurrencyWithCode(userRosterSlots.capSpaceUSD, currencyCode, false)}` : `Over Cap ${formatCurrencyWithCode(-Math.abs(userRosterSlots.capSpaceUSD), currencyCode, false)}`}</span></div>
    <div className="flex items-center gap-2"><span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${userRosterSlots.mleAvailable > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-slate-700/30 border-slate-600/40 text-slate-500'}`}>MLE {userRosterSlots.mleAvailable > 0 ? formatCurrencyWithCode(userRosterSlots.mleAvailable, currencyCode, false) : 'N/A'}</span></div>
  </>
);

export const FreeAgentsHeader: React.FC<any> = ({ nonNbaIsolated, viewMode, setViewMode, isFreeAgencySeason, handleSimDayClick, isProcessing, isFictional, nbaFreeAgents, internationalPlayers, freeAgentsCount, userRosterSlots, currencyCode }) => (
  <div className="space-y-3 sm:space-y-4">
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="w-10 h-10 sm:w-16 sm:h-16 bg-rose-600/20 rounded-xl sm:rounded-2xl flex items-center justify-center border border-rose-500/30 flex-shrink-0"><UserX size={20} className="text-rose-400 sm:hidden" /><UserX size={32} className="text-rose-400 hidden sm:block" /></div>
      <div className="flex-1 min-w-0">
        <h1 className="text-lg sm:text-3xl font-black text-white uppercase tracking-tight leading-tight">{nonNbaIsolated ? 'Free Agents' : viewMode === 'upcoming' ? 'Upcoming Free Agents' : 'Free Agent Market'}</h1>
        <p className="hidden sm:block text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1 font-medium">{nonNbaIsolated ? 'Browse unattached players available to sign.' : viewMode === 'upcoming' ? 'Players on the last year of their deal — re-sign before they hit the market.' : 'Browse and interact with available players.'}</p>
      </div>
      {!nonNbaIsolated && <div className="hidden sm:flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          <button onClick={() => setViewMode('available')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'available' ? 'bg-rose-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><Users size={12} />Available</button>
          <button onClick={() => setViewMode('upcoming')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'upcoming' ? 'bg-amber-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}><Hourglass size={12} />Upcoming</button>
        </div>
        {isFreeAgencySeason && <button onClick={handleSimDayClick} disabled={isProcessing} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-50 text-white transition-all shadow-lg"><PlayCircle size={14} />Sim Day</button>}
      </div>}
    </div>
    {!nonNbaIsolated && <div className="sm:hidden flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
      <button onClick={() => setViewMode('available')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'available' ? 'bg-rose-600 text-white shadow' : 'text-slate-500'}`}><Users size={12} />Available</button>
      <button onClick={() => setViewMode('upcoming')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'upcoming' ? 'bg-amber-600 text-white shadow' : 'text-slate-500'}`}><Hourglass size={12} />Upcoming</button>
    </div>}
    {!nonNbaIsolated && isFreeAgencySeason && <button onClick={handleSimDayClick} disabled={isProcessing} className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-widest bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-50 text-white transition-all shadow-lg"><PlayCircle size={16} />Simulate Day</button>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-6 text-[11px] sm:text-sm">
      {!nonNbaIsolated && <><div className="flex items-center gap-2"><div className="w-2 h-2 bg-indigo-500 rounded-full" /><span className="text-slate-400 font-medium">{nbaFreeAgents} {isFictional ? 'Free Agents' : 'NBA Free Agents'}</span></div><div className="flex items-center gap-2"><div className="w-2 h-2 bg-amber-500 rounded-full" /><span className="text-slate-400 font-medium">{internationalPlayers} International</span></div></>}
      <div className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full" /><span className="text-slate-400 font-medium">{freeAgentsCount} Total Available</span></div>
      {!nonNbaIsolated && userRosterSlots && <FreeAgentsRosterBadges userRosterSlots={userRosterSlots} currencyCode={currencyCode} />}
    </div>
  </div>
);

export const FreeAgentsFilters: React.FC<any> = (props) => {
  const userTid = props.isGM ? props.userTeamId ?? null : null;
  const userTeam = userTid != null ? props.teams.find((team: any) => team.id === userTid) : null;
  const sortedTeams = [...props.teams].sort((left: any, right: any) => left.name.localeCompare(right.name));
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
        <input type="text" placeholder="Search free agents by name..." value={props.searchTerm} onChange={(e) => props.setSearchTerm(e.target.value)} onKeyDown={props.onSearchEnter} className="w-full bg-slate-900 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all font-medium" />
      </div>
      <div className="space-y-3">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"><div className="flex items-center gap-2 min-w-max">{props.marketPools.map((pool: any) => { const Icon = poolIcons[pool.icon as keyof typeof poolIcons]; return <button key={pool.id} onClick={() => { props.setSelectedPool(pool.id); props.setSelectedTeamId(null); props.setSelectedCountry('All'); }} className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-tight transition-all border whitespace-nowrap ${props.selectedPool === pool.id ? (props.viewMode === 'upcoming' ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-500/20' : 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-500/20') : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'}`}><Icon size={14} />{pool.label}</button>; })}</div></div>
        <div className="flex flex-wrap items-center gap-2">
          {(['ovr', 'pot', 'age', 'name'] as const).map((sort) => <button key={sort} onClick={() => { if (props.sortBy === sort) props.setSortOrder((current: 'asc' | 'desc') => current === 'asc' ? 'desc' : 'asc'); else { props.setSortBy(sort); props.setSortOrder(sort === 'name' ? 'asc' : 'desc'); } }} className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-tight transition-all whitespace-nowrap ${props.sortBy === sort ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-900'}`}>{sort === 'ovr' ? 'Overall' : sort === 'pot' ? 'Potential' : sort === 'age' ? 'Age' : 'A-Z'}{props.sortBy === sort && <ArrowUpDown size={12} />}</button>)}
          <div className="w-px h-5 bg-slate-700 mx-0.5" />
          <select value={props.selectedPosition} onChange={(e) => props.setSelectedPosition(e.target.value)} className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight">{props.positions.map((pos: string) => <option key={pos} value={pos}>{pos === 'All' ? 'All Positions' : pos}</option>)}</select>
          <div className="relative">
            <button onClick={() => props.setIsCountryDropdownOpen(!props.isCountryDropdownOpen)} className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight min-w-[130px] justify-between"><span className="truncate">{props.selectedCountry === 'All' ? 'All Countries' : props.selectedCountry}</span><ChevronDown size={12} className={`transition-transform flex-shrink-0 ${props.isCountryDropdownOpen ? 'rotate-180' : ''}`} /></button>
            <AnimatePresence>{props.isCountryDropdownOpen && <><div className="fixed inset-0 z-40" onClick={() => props.setIsCountryDropdownOpen(false)} /><motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute z-50 mt-2 left-0 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"><button onClick={() => { props.setSelectedCountry('All'); props.setIsCountryDropdownOpen(false); }} className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors ${props.selectedCountry === 'All' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-300'}`}>All Countries</button>{props.allCountries.map((country: string) => <button key={country} onClick={() => { props.setSelectedCountry(country); props.setIsCountryDropdownOpen(false); }} className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors ${props.selectedCountry === country ? 'bg-rose-500/10 text-rose-400' : 'text-slate-300'}`}>{country}</button>)}</motion.div></>}</AnimatePresence>
          </div>
          {props.viewMode === 'upcoming' && (props.selectedPool === 'all' || props.selectedPool === 'nba') && <select value={props.upcomingTeamFilter === 'all' ? 'all' : String(props.upcomingTeamFilter)} onChange={(e) => props.setUpcomingTeamFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-amber-500 transition-colors font-bold uppercase tracking-tight max-w-[220px]">{userTeam && <option value={String(userTeam.id)}>Your Team — {userTeam.name}</option>}<option value="all">All Players</option>{sortedTeams.filter((team: any) => team.id !== userTid).map((team: any) => <option key={team.id} value={String(team.id)}>{team.name}</option>)}</select>}
          {props.leagueTeams.length > 0 && <select value={props.selectedTeamId ?? ''} onChange={(e) => props.setSelectedTeamId(e.target.value ? parseInt(e.target.value) : null)} className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight max-w-[200px]"><option value="">All Teams</option>{props.leagueTeams.map((team: any) => { const fullName = team.region ? `${team.region} ${team.name}`.trim() : team.name; return <option key={team.tid} value={team.tid}>{fullName}</option>; })}</select>}
        </div>
      </div>
    </div>
  );
};

export const FreeAgentsResults: React.FC<any> = ({ filteredPlayers, visiblePlayers, nonNBATeams, onClick, onViewOffers, itemsPerPage, setItemsPerPage, page, setPage, totalPages }) => (
  filteredPlayers.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-20 text-slate-600 bg-slate-900/10 rounded-[3rem] border border-dashed border-slate-800"><User size={64} className="mb-6 opacity-10" /><p className="font-black uppercase tracking-[0.3em] text-sm">No Free Agents Found</p><p className="text-xs font-medium mt-3 text-slate-500 max-w-xs text-center leading-relaxed">Try adjusting your search or filters</p></div>
  ) : (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">{visiblePlayers.map((player: any) => <FreeAgentCard key={player.internalId} player={player} nonNBATeams={nonNBATeams} onClick={onClick} onViewOffers={onViewOffers} />)}</div>
      <div className="flex items-center justify-between gap-2 sm:gap-4 pt-4 mt-2 border-t border-slate-800">
        <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold hidden sm:inline-block">Show</span><select className="bg-slate-900 border border-slate-800 text-white text-xs font-bold rounded-md px-2 py-1 outline-none appearance-none text-center" value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center flex-1">Page {page} <span className="text-slate-600">of</span> {totalPages}<span className="hidden sm:inline"> • {filteredPlayers.length} Players</span></div>
        <div className="flex items-center gap-2"><button className="px-3 sm:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 border border-slate-800 text-white rounded-full hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" onClick={() => setPage((current: number) => Math.max(1, current - 1))} disabled={page === 1}>Prev</button><button className="px-3 sm:px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-slate-900 border border-slate-800 text-white rounded-full hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" onClick={() => setPage((current: number) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</button></div>
      </div>
    </>
  )
);
