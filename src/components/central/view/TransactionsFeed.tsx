import React from 'react';
import { ArrowRightLeft, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { NBAPlayer, NBATeam } from '../../../types';
import { DisplayItem, TYPE_STYLE } from './TransactionsShared';

type TradeSelection = { text: string; date: string; legs?: { text: string; date: string }[] } | null;

export const TransactionsPagination: React.FC<{
  displayCount: number;
  page: number;
  totalPages: number;
  itemsPerPage: number;
  setItemsPerPage: (value: number) => void;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  compact?: boolean;
}> = ({ displayCount, page, totalPages, itemsPerPage, setItemsPerPage, setPage, compact = false }) => {
  if (displayCount <= 0) return null;
  return (
    <div className={`flex items-center justify-between gap-2 ${compact ? 'pt-2 border-t border-slate-800/50' : 'flex-shrink-0 bg-slate-900/50 border-t border-slate-800 p-3 sm:p-4'}`}>
      <div className="flex items-center gap-2">
        {!compact && <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold hidden sm:inline-block">Show</span>}
        <select
          className="bg-slate-800 border border-slate-700 text-white text-[10px] font-bold rounded px-2 py-1 outline-none appearance-none text-center"
          value={itemsPerPage}
          onChange={event => { setItemsPerPage(Number(event.target.value)); setPage(1); }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center flex-1">
        Page {page} <span className="text-slate-600">of</span> {totalPages}
        <span className="hidden sm:inline"> • {displayCount}{compact ? '' : ' Results'}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          className={`text-[10px] font-bold uppercase tracking-widest text-white rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${compact ? 'px-3 py-1 bg-slate-900 border border-slate-800' : 'px-3 sm:px-4 py-1.5 bg-slate-800 border border-slate-700'}`}
          onClick={() => setPage(value => Math.max(1, value - 1))}
          disabled={page === 1}
        >
          Prev
        </button>
        <button
          className={`text-[10px] font-bold uppercase tracking-widest text-white rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${compact ? 'px-3 py-1 bg-slate-900 border border-slate-800' : 'px-3 sm:px-4 py-1.5 bg-slate-800 border border-slate-700'}`}
          onClick={() => setPage(value => Math.min(totalPages, value + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
};

function uniqueTradeTeams(legs: Array<{ text?: string }>, teams: NBATeam[]) {
  const legTeams = legs.flatMap((leg: any) => {
    const logos: { logo: string; name: string }[] = [];
    for (const team of teams) {
      if ((leg.text || '').includes(team.name)) logos.push({ logo: (team as any).logoUrl, name: team.name });
    }
    return logos;
  });
  return legTeams.filter((team, index, arr) => arr.findIndex(entry => entry.name === team.name) === index);
}

type TeamFeedProps = {
  visibleItems: DisplayItem[];
  teams: NBATeam[];
  setSelectedTrade: (value: TradeSelection) => void;
  setViewingPlayer: (value: NBAPlayer | null) => void;
  emptyLabel: string;
};

export const TeamTransactionsFeed: React.FC<TeamFeedProps> = ({ visibleItems, teams, setSelectedTrade, setViewingPlayer, emptyLabel }) => (
  <div className="w-full overflow-x-hidden max-w-4xl mx-auto space-y-3">
    {visibleItems.length > 0 ? visibleItems.map((item, index) => {
      if (item.kind === 'multi') {
        const uniqueTeams = uniqueTradeTeams(item.legs, teams);
        return (
          <div key={`multi-${index}`} className="bg-blue-950/30 border border-blue-700/40 hover:border-blue-600/60 rounded-xl overflow-hidden transition-all">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-blue-800/30 cursor-pointer hover:bg-blue-900/20 transition-colors" onClick={() => { const [first, ...rest] = item.legs; setSelectedTrade({ text: first.text, date: first.date, legs: rest.map(leg => ({ text: leg.text, date: leg.date })) }); }}>
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={13} className="text-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">{item.legs.length + 1}-Team Trade</span>
                <div className="flex items-center gap-1">
                  {uniqueTeams.slice(0, 4).map((team, teamIndex) => (
                    <img key={teamIndex} src={team.logo} alt={team.name} title={team.name} className="w-4 h-4 object-contain opacity-80" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />
                  ))}
                </div>
                <span className="text-[9px] text-blue-400/60 font-medium">View All →</span>
              </div>
              <span className="text-slate-500 text-[10px] flex items-center gap-1"><Calendar size={11} />{item.date}</span>
            </div>
            <div className="divide-y divide-blue-900/30">
              {item.legs.map((leg, legIndex) => (
                <div key={legIndex} className="flex gap-3 px-4 py-2.5 items-start cursor-pointer hover:bg-blue-900/20 transition-colors" onClick={() => setSelectedTrade({ text: leg.text, date: leg.date })}>
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider mt-0.5 w-8 shrink-0">L{legIndex + 1}</span>
                  <p className="flex-1 text-slate-300 text-xs leading-relaxed">{leg.text}</p>
                  {leg.player?.imgURL && <img src={leg.player.imgURL} alt={leg.player.name} className="w-7 h-7 rounded-full object-cover border border-slate-700 cursor-pointer hover:border-indigo-400 shrink-0" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} onClick={event => { event.stopPropagation(); leg.player && setViewingPlayer(leg.player as NBAPlayer); }} />}
                </div>
              ))}
            </div>
          </div>
        );
      }

      const entry = item.entry;
      const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
      const teamColor = (entry.team as any)?.colors?.[0];
      const teamLogo = (entry.team as any)?.logoUrl;
      const playerImg = entry.player?.imgURL;
      const isTrade = entry.kind === 'Trade';

      return (
        <div key={index} className={`group relative bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all ${isTrade ? 'cursor-pointer hover:bg-slate-900/70' : ''}`} onClick={isTrade ? () => setSelectedTrade({ text: entry.text, date: entry.date }) : undefined}>
          {teamColor && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: teamColor }} />}
          <div className="flex gap-3 p-3 sm:p-4 pl-4 sm:pl-5">
            <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${style.bg} ${style.color}`}>{style.icon}</div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black uppercase tracking-wider ${style.color}`}>{style.label}</span>
                  {isTrade && <span className="text-[9px] font-medium text-blue-400/60 opacity-0 group-hover:opacity-100 transition-opacity">View →</span>}
                </div>
                <span className="text-slate-600 text-[10px] flex items-center gap-1 shrink-0"><Calendar size={10} />{entry.date}</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed break-words">{entry.text}</p>
            </div>
            {(playerImg || teamLogo) && (
              <div className="flex items-center gap-1.5 shrink-0 ml-1">
                {playerImg && <img src={playerImg} alt={entry.player?.name} className="w-9 h-9 rounded-full object-cover border border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} onClick={event => { event.stopPropagation(); entry.player && setViewingPlayer(entry.player as NBAPlayer); }} />}
                {teamLogo && <img src={teamLogo} alt="" className="w-7 h-7 object-contain opacity-60 shrink-0" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />}
              </div>
            )}
          </div>
        </div>
      );
    }) : (
      <div className="flex flex-col items-center justify-center py-16 text-slate-600">
        <ArrowRightLeft size={28} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">{emptyLabel}</p>
      </div>
    )}
  </div>
);

type LeagueFeedProps = {
  visibleItems: DisplayItem[];
  teams: NBATeam[];
  ownTid: number | null;
  ownTeam: NBATeam | null;
  setSelectedTrade: (value: TradeSelection) => void;
  setViewingPlayer: (value: NBAPlayer | null) => void;
};

export const LeagueTransactionsFeed: React.FC<LeagueFeedProps> = ({ visibleItems, teams, ownTid, ownTeam, setSelectedTrade, setViewingPlayer }) => (
  <div className="max-w-4xl mx-auto space-y-4">
    {visibleItems.length > 0 ? visibleItems.map((item, index) => {
      if (item.kind === 'multi') {
        const uniqueTeams = uniqueTradeTeams(item.legs, teams);
        const isOwn = !!ownTeam && item.legs.some(leg => (leg.text || '').includes(ownTeam.name) || (leg.text || '').includes(ownTeam.abbrev));
        return (
          <motion.div key={`multi-${index}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.3 }} className={`relative bg-blue-950/30 border hover:border-blue-600/60 rounded-xl overflow-hidden transition-all ${isOwn ? 'border-indigo-500/60 ring-2 ring-indigo-500/40' : 'border-blue-700/40'}`}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-blue-800/30 cursor-pointer hover:bg-blue-900/20 transition-colors" onClick={() => { const [first, ...rest] = item.legs; setSelectedTrade({ text: first.text, date: first.date, legs: rest.map(leg => ({ text: leg.text, date: leg.date })) }); }}>
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={15} className="text-blue-400" />
                <span className="text-[11px] font-black uppercase tracking-widest text-blue-300">{item.legs.length + 1}-Team Trade</span>
                {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                <div className="flex items-center gap-1 ml-1">
                  {uniqueTeams.slice(0, 4).map((team, teamIndex) => (
                    <img key={teamIndex} src={team.logo} alt={team.name} title={team.name} className="w-5 h-5 object-contain opacity-80" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />
                  ))}
                </div>
                <span className="text-[10px] text-blue-400/60 font-medium ml-1">View All →</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                <Calendar size={12} />
                <span>{item.date}</span>
              </div>
            </div>
            <div className="divide-y divide-blue-900/30">
              {item.legs.map((leg, legIndex) => {
                const legTeamLogo = (leg.team as any)?.logoUrl;
                return (
                  <div key={legIndex} className="flex gap-3 px-5 py-3 items-start cursor-pointer hover:bg-blue-900/20 transition-colors" onClick={() => setSelectedTrade({ text: leg.text, date: leg.date })}>
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider mt-0.5 w-10 shrink-0">Leg {legIndex + 1}</span>
                    <p className="flex-1 text-slate-300 text-sm leading-relaxed font-medium">{leg.text}</p>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {leg.player?.imgURL && <img src={leg.player.imgURL} alt={leg.player.name} className="w-9 h-9 rounded-full object-cover border border-slate-700 cursor-pointer hover:border-indigo-400 transition-colors" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} onClick={event => { event.stopPropagation(); leg.player && setViewingPlayer(leg.player as NBAPlayer); }} />}
                      {legTeamLogo && <img src={legTeamLogo} alt="" className="w-7 h-7 object-contain opacity-70" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                      <span className="text-[10px] text-blue-400/60 font-medium whitespace-nowrap">View →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      }

      const entry = item.entry;
      const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
      const teamColor = (entry.team as any)?.colors?.[0];
      const teamLogo = (entry.team as any)?.logoUrl || (entry.team as any)?.imgURL;
      const playerImg = entry.player?.imgURL;
      const isTrade = entry.kind === 'Trade';
      const isSigningWithPlayer = !isTrade && !!entry.player;
      const isClickable = isTrade || isSigningWithPlayer;
      const isOwn = ownTid !== null && ((entry.team as any)?.id === ownTid || (!!ownTeam && (entry.text || '').includes(ownTeam.name)) || (entry.player as any)?.tid === ownTid);

      return (
        <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.3 }} className={`group relative bg-slate-900/40 border hover:border-slate-700 rounded-xl overflow-hidden transition-all hover:bg-slate-900/60 ${isOwn ? 'border-indigo-500/60 ring-2 ring-indigo-500/30 bg-indigo-950/20' : 'border-slate-800'} ${isClickable ? 'cursor-pointer' : ''}`} onClick={isClickable ? () => { if (isTrade) setSelectedTrade({ text: entry.text, date: entry.date }); else if (entry.player) setViewingPlayer(entry.player as NBAPlayer); } : undefined}>
          {teamColor && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: teamColor }} />}
          <div className="flex gap-4 p-5 pl-6">
            <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.color}`}>{style.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>{style.label}</span>
                  {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                  {(entry.text || '').toLowerCase().includes('player option') && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Player Opt.</span>}
                  {(entry.text || '').toLowerCase().includes('team option') && <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">Team Opt.</span>}
                  {isTrade && <span className="text-[9px] font-medium text-blue-400/70 opacity-0 group-hover:opacity-100 transition-opacity">View Details →</span>}
                  {isSigningWithPlayer && <span className="text-[9px] font-medium text-indigo-400/70 opacity-0 group-hover:opacity-100 transition-opacity">View Profile →</span>}
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <Calendar size={12} />
                  <span>{entry.date}</span>
                </div>
              </div>
              <p className="text-slate-200 leading-relaxed font-medium">{entry.text || `${style.label} transaction recorded.`}</p>
            </div>
            {(playerImg || teamLogo) && (
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {playerImg && <img src={playerImg} alt={entry.player?.name} className="w-12 h-12 rounded-full object-cover border-2 border-slate-700 shrink-0 cursor-pointer hover:border-indigo-400 transition-colors" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} title={entry.player?.name ? `View ${entry.player.name}'s profile` : undefined} onClick={event => { event.stopPropagation(); entry.player && setViewingPlayer(entry.player as NBAPlayer); }} />}
                {teamLogo && <img src={teamLogo} alt={entry.team?.name} className="w-10 h-10 object-contain opacity-80 shrink-0" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />}
              </div>
            )}
          </div>
        </motion.div>
      );
    }) : (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
          <ArrowRightLeft size={32} />
        </div>
        <p className="text-lg font-medium">No transactions found matching your filters.</p>
        <p className="text-sm">Try adjusting your search or filter criteria.</p>
      </div>
    )}
  </div>
);
