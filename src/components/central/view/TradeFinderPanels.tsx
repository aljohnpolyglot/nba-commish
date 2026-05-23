import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeftRight, Loader2, Search, X } from 'lucide-react';
import { TeamDropdown } from '../../shared/TeamDropdown';
import { type DraftPick, type NBAPlayer, type NBATeam } from '../../../types';
import { DEFAULT_TRADABLE_PICK_SEASONS } from '../../../services/draft/DraftPickGenerator';
import { isInPostDeadlinePreFAWindow } from '../../../utils/dateUtils';
import { isRecentlySignedLocked, isWalkingExpiring } from '../../../services/trade/tradeValueEngine';
import { type FoundOffer, type TradeItem } from './TradeFinderTypes';
import { OfferCard, PickRow, PlayerRow } from './TradeFinderItemComponents';

const formatSalaryM = (n: number) => `$${(n / 1000).toFixed(1)}M`;

export const AssetSelectorPanel: React.FC<{
  mobilePanel: 'assets' | 'offers';
  dropdownOpen: boolean;
  setDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isGM: boolean;
  selectedTid: number;
  setSelectedTid: React.Dispatch<React.SetStateAction<number>>;
  userTeamId: number | null | undefined;
  clearBasket: () => void;
  teamsWithRecord: any[];
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  activeTab: 'roster' | 'picks';
  setActiveTab: React.Dispatch<React.SetStateAction<'roster' | 'picks'>>;
  teamRoster: NBAPlayer[];
  teamPicksList: DraftPick[];
  filteredRoster: NBAPlayer[];
  filteredPicks: DraftPick[];
  basketIds: Set<string>;
  addPlayer: (player: NBAPlayer) => void;
  addPick: (pick: DraftPick) => void;
  selectedTeam?: NBATeam;
  stateDate: string;
  currentYear: number;
  stateLeagueStats: any;
  teams: NBATeam[];
  powerRanks: Map<number, number>;
  lotterySlotByTid: Map<number, number>;
  draftPicks: DraftPick[];
  stateTradableDraftPickSeasons: number | undefined;
  basket: TradeItem[];
  wouldStepienViolateForTid: (draftPicks: DraftPick[], currentYear: number, tradableDraftPickSeasons: number, tid: number, outgoingPicks: DraftPick[]) => boolean;
}> = props => {
  const {
    mobilePanel, dropdownOpen, setDropdownOpen, isGM, selectedTid, userTeamId, clearBasket, teamsWithRecord, search, setSearch,
    activeTab, setActiveTab, teamRoster, teamPicksList, filteredRoster, filteredPicks, basketIds, addPlayer, addPick,
    selectedTeam, stateDate, currentYear, stateLeagueStats, teams, powerRanks, lotterySlotByTid, draftPicks, stateTradableDraftPickSeasons,
  } = props;
  return (
    <div className={`flex-1 lg:flex-none lg:w-[380px] lg:flex-shrink-0 flex flex-col border-r border-slate-800 min-h-0 ${mobilePanel === 'assets' ? 'flex' : 'hidden'} lg:flex`}>
      <div className="flex-shrink-0 p-3 border-b border-slate-800 space-y-2">
        <TeamDropdown label={isGM && selectedTid !== userTeamId ? 'Shopping (Reverse)' : 'Team'} selectedTeamId={selectedTid} onSelect={id => { props.setSelectedTid(id); clearBasket(); }} teams={teamsWithRecord} isOpen={dropdownOpen} onToggle={() => setDropdownOpen(v => !v)} />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players or picks..." className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 transition-all" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('roster')} className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'roster' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>Roster ({teamRoster.length})</button>
          <button onClick={() => setActiveTab('picks')} className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'picks' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>Picks ({teamPicksList.length})</button>
        </div>
        {activeTab === 'roster' && <div className="flex items-center gap-2 px-1"><div className="w-9 flex-shrink-0" /><div className="flex-1" /><div className="w-9 text-center"><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">OVR</span></div><div className="w-9 text-center"><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">POT</span></div><div className="w-[68px] text-right"><span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Salary</span></div><div className="w-3" /></div>}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {activeTab === 'roster'
          ? (() => {
              const postDeadlinePreFA = isInPostDeadlinePreFAWindow(stateDate, currentYear, stateLeagueStats);
              return filteredRoster.map(player => {
                const locked = isRecentlySignedLocked(player, stateDate, stateLeagueStats);
                return <PlayerRow key={player.internalId} player={player} selected={basketIds.has(player.internalId)} onToggle={() => addPlayer(player)} team={selectedTeam} dateStr={stateDate} currentYear={currentYear} walkingExpiring={isWalkingExpiring(player, currentYear, postDeadlinePreFA)} recentlySigned={locked} tradeEligibleDate={player.tradeEligibleDate} />;
              });
            })()
          : filteredPicks.map(pick => {
              const orig = teams.find(team => team.id === pick.originalTid);
              const rank = powerRanks.get(pick.originalTid) ?? Math.ceil(teams.length / 2);
              const isSelected = basketIds.has(String(pick.dpid));
              const stepienOn = stateLeagueStats?.stepienRuleEnabled !== false;
              const basketPicks = props.basket.filter(i => i.type === 'pick' && i.pick).map(i => i.pick!);
              const stepienBlocked = !isSelected && stepienOn && props.wouldStepienViolateForTid(draftPicks ?? [], currentYear, stateTradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS, selectedTid, [...basketPicks, pick]);
              return <PickRow key={pick.dpid} pick={pick} selected={isSelected} onToggle={() => addPick(pick)} originalTeam={orig} powerRank={rank} totalTeams={teams.length} currentYear={currentYear} lotterySlotByTid={lotterySlotByTid} stepienBlocked={stepienBlocked} />;
            })}
      </div>
    </div>
  );
};

export const TradeFinderResultsPanel: React.FC<{
  mobilePanel: 'assets' | 'offers';
  basket: TradeItem[];
  myDisplaySalaryUSD: number;
  removeItem: (id: string) => void;
  clearBasket: () => void;
  setMobilePanel: React.Dispatch<React.SetStateAction<'assets' | 'offers'>>;
  findOffers: () => void;
  isSearching: boolean;
  foundOffers: FoundOffer[] | null;
  teams: NBATeam[];
  capSpaces: Map<number, number>;
  currentYear: number;
  stateDate: string;
  nonNBATeams: any[];
  handleManageTrade: (offer: FoundOffer) => void;
}> = ({ mobilePanel, basket, myDisplaySalaryUSD, removeItem, clearBasket, setMobilePanel, findOffers, isSearching, foundOffers, teams, capSpaces, currentYear, stateDate, nonNBATeams, handleManageTrade }) => (
  <div className={`flex-1 flex flex-col min-h-0 ${mobilePanel === 'offers' ? 'flex' : 'hidden'} lg:flex`}>
    <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap"><span className="text-[10px] font-black uppercase tracking-widest text-rose-300 bg-rose-500/15 border border-rose-500/25 rounded px-2 py-0.5">↗ Outgoing · {basket.length} asset{basket.length !== 1 ? 's' : ''}{basket.length > 0 ? ` · ${formatSalaryM(myDisplaySalaryUSD / 1000)}` : ''}</span></div>
        {basket.length > 0 && <button onClick={clearBasket} className="text-[10px] text-slate-500 hover:text-white transition-colors uppercase tracking-wider font-bold">Clear</button>}
      </div>
      {basket.length > 0 ? <div className="flex flex-wrap gap-1.5 mb-2">{basket.map(item => <div key={item.id} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-2 py-1 text-xs font-bold text-white"><span className="truncate max-w-[110px] text-[11px]">{item.label}</span><button onClick={() => removeItem(item.id)} className="w-3.5 h-3.5 bg-slate-600 hover:bg-rose-500 rounded-full flex items-center justify-center transition-colors flex-shrink-0"><X size={7} className="text-white" /></button></div>)}</div> : <div className="text-xs text-slate-600 italic py-1">Select players or picks from the roster to offer in a trade.</div>}
      <button onClick={() => { findOffers(); setMobilePanel('offers'); }} disabled={basket.length === 0 || isSearching} className="hidden lg:flex w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-all items-center justify-center gap-2">{isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}{isSearching ? 'Scanning League…' : 'Find Offers'}</button>
    </div>
    <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-4">
      {foundOffers === null ? <div className="flex flex-col items-center justify-center h-full text-slate-600"><ArrowLeftRight size={28} className="mb-3 opacity-30" /><p className="text-sm font-medium">Select assets and tap Find Offers</p></div> : foundOffers.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-slate-600"><p className="text-sm font-medium">No valid offers found.</p><p className="text-xs mt-1 text-slate-700">Try adding more value or different asset types.</p></div> : <><div className="flex items-center gap-2 mb-3"><span className="text-xs font-black text-white uppercase tracking-widest">{foundOffers.length} Offer{foundOffers.length !== 1 ? 's' : ''}</span><span className="text-[10px] text-slate-500">sorted by return value</span></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{foundOffers.map(offer => <OfferCard key={`${offer.tid}-${offer.variant ?? 'match'}`} offer={offer} capSpaceK={capSpaces.get(offer.tid)} myItems={basket} team={teams.find(team => team.id === offer.tid)} teams={teams} currentYear={currentYear} dateStr={stateDate} nonNBATeams={nonNBATeams} onManage={() => handleManageTrade(offer)} />)}</div></>}
    </div>
    <AnimatePresence>{basket.length > 0 && mobilePanel === 'assets' && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50"><button onClick={() => { findOffers(); setMobilePanel('offers'); }} disabled={isSearching} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-black uppercase tracking-wider shadow-xl shadow-indigo-900/50 transition-all">{isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}{isSearching ? 'Scanning…' : `Find Offers (${basket.length})`}</button></motion.div>}</AnimatePresence>
  </div>
);
