import React from 'react';
import { motion } from 'motion/react';
import { Loader, Star, Trophy, Users } from 'lucide-react';
import { JerseyRetirementModal } from '../../modals/JerseyRetirementModal';

export const TeamHistoryOverviewPanel: React.FC<{
  accent: string;
  isNBAHub: boolean;
  retiredJerseys: any[];
  retiredJerseyDisplayName: (jersey: any) => string;
  jerseyReasonLabel: (jersey: any) => string | null;
  canRetireForTeam: boolean;
  setShowRetireModal: React.Dispatch<React.SetStateAction<boolean>>;
  topPlayers: Array<{ name: string; imgURL?: string; hof?: boolean }>;
  statePlayers: Array<{ name?: string; hof?: boolean }>;
  findPlayerImg: (name: string) => string;
  onOpenPlayer: (name: string) => void;
}> = ({ accent, isNBAHub, retiredJerseys, retiredJerseyDisplayName, jerseyReasonLabel, canRetireForTeam, setShowRetireModal, topPlayers, statePlayers, findPlayerImg, onOpenPlayer }) => (
  <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
    {retiredJerseys.length > 0 && (
      <section>
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest mb-4" style={{ color: accent }}>
          <Star className="w-4 h-4" fill={accent} /> Retired Numbers
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {retiredJerseys.map((jersey, index) => (
            <motion.div key={index} whileHover={{ y: -3 }} className="relative bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center overflow-hidden group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity" style={{ backgroundColor: accent }} />
              <span className="text-3xl font-black leading-none mb-1" style={{ color: accent }}>{jersey.number}</span>
              <span className="text-[10px] font-bold text-zinc-300 leading-tight">{retiredJerseyDisplayName(jersey)}</span>
              {jersey.seasonRetired && <span className="text-[9px] text-zinc-600 font-mono mt-0.5">{jersey.seasonRetired}</span>}
              {jerseyReasonLabel(jersey) && <span className="text-[8px] text-zinc-500 font-black uppercase tracking-wider mt-1">{jerseyReasonLabel(jersey)}</span>}
            </motion.div>
          ))}
        </div>
      </section>
    )}

    {!isNBAHub && canRetireForTeam && (
      <div className="flex justify-end -mt-4">
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setShowRetireModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest" style={{ backgroundColor: accent, color: '#09090b' }}>
          <Star className="w-3.5 h-3.5" />
          Retire a Number
        </motion.button>
      </div>
    )}

    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest" style={{ color: accent }}>
          <Users className="w-4 h-4" /> {isNBAHub ? 'All-Time Top 100 Players' : 'All-Time Top Players'}
        </h2>
        <span className="text-[10px] text-zinc-600 font-mono uppercase">MVP · Finals MVP · All-NBA · Win Shares</span>
      </div>
      {topPlayers.length === 0 ? (
        <p className="text-zinc-600 text-sm italic">No player stats found for this franchise.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
          {topPlayers.map(({ name, imgURL, hof }, index) => {
            const statePlayer = statePlayers.find(player => player.name?.toLowerCase() === name.toLowerCase());
            return (
              <motion.div key={name} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.015 }} onClick={() => statePlayer && onOpenPlayer(name)} className={`group flex flex-col items-center text-center ${statePlayer ? 'cursor-pointer' : ''}`}>
                <div className="relative mb-2">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-zinc-800 group-hover:border-[var(--ta)] transition-colors">
                    <img src={imgURL || findPlayerImg(name)} alt={name} className="w-full h-full object-cover object-top grayscale group-hover:grayscale-0 transition-all" referrerPolicy="no-referrer" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[8px] font-black" style={{ color: accent }}>{index + 1}</div>
                  {hof && <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-rose-600 flex items-center justify-center"><Star className="w-2.5 h-2.5 text-white" fill="white" /></div>}
                </div>
                <p className="text-[10px] font-bold text-zinc-200 leading-tight line-clamp-2 group-hover:text-[var(--ta)] transition-colors">{name}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  </motion.div>
);

export const TeamHistoryRecordsPanel: React.FC<{
  accent: string;
  isNBAHub: boolean;
  recordType: 'regular' | 'playoff';
  setRecordType: React.Dispatch<React.SetStateAction<'regular' | 'playoff'>>;
  externalLoading: boolean;
  externalError: string | null;
  processedRecords: any[][];
  expandedRecords: Record<string, boolean>;
  setExpandedRecords: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  findPlayerImg: (name: string) => string;
  cleanName: (value: string) => string;
  getStatValue: (record: any, category: string) => string;
}> = ({ accent, isNBAHub, recordType, setRecordType, externalLoading, externalError, processedRecords, expandedRecords, setExpandedRecords, findPlayerImg, cleanName, getStatValue }) => (
  <motion.div key="records" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-black uppercase tracking-widest">{isNBAHub ? 'League Records' : 'Franchise Records'}</h2>
      <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
        {(['regular', 'playoff'] as const).map(type => (
          <button key={type} onClick={() => setRecordType(type)} className="px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all" style={recordType === type ? { backgroundColor: accent, color: '#09090b' } : { color: '#71717a' }}>
            {type === 'regular' ? 'Regular' : 'Playoffs'}
          </button>
        ))}
      </div>
    </div>

    {externalLoading ? <div className="flex items-center gap-2 text-zinc-500 py-8"><Loader className="w-4 h-4 animate-spin" /> Loading records…</div> : externalError ? <p className="text-rose-400 text-sm">Failed to load: {externalError}</p> : processedRecords.length === 0 ? <p className="text-zinc-600 text-sm italic">No records found for this team.</p> : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {processedRecords.map((records, index) => {
          const category = records[0]?.SearchCategory;
          const isExpanded = expandedRecords[category];
          const displayed = isExpanded ? records.slice(0, 5) : [records[0]];
          return (
            <div key={index} onClick={() => setExpandedRecords(prev => ({ ...prev, [category]: !prev[category] }))} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-700 transition-all" style={isExpanded ? { borderColor: `${accent}66` } : {}}>
              <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: accent }}>{category}</div>
              {displayed.map((record: any, recordIndex: number) => (
                <div key={recordIndex} className={`flex items-center gap-3 ${recordIndex > 0 ? 'mt-4 pt-4 border-t border-zinc-800' : ''}`}>
                  <div className="relative w-10 h-10 shrink-0">
                    <img src={findPlayerImg(cleanName(record.NAME))} alt={cleanName(record.NAME)} className="w-full h-full rounded-lg object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                    <div className="absolute -bottom-1 -left-1 px-1 py-px text-[8px] font-black rounded-sm shadow" style={{ backgroundColor: accent, color: '#09090b' }}>#{recordIndex + 1}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-zinc-100 ${recordIndex === 0 ? 'text-2xl' : 'text-base'}`}>{getStatValue(record, category)}</div>
                    <div className={`font-semibold text-zinc-400 truncate ${recordIndex === 0 ? 'text-sm' : 'text-xs'}`}>{cleanName(record.NAME)}</div>
                    {recordIndex === 0 && record.DATE && <div className="text-[10px] text-zinc-600 font-mono">{record.DATE} · vs {record.OPP}</div>}
                  </div>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-zinc-800/50 text-center text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{isExpanded ? 'Collapse' : 'Show Top 5'}</div>
            </div>
          );
        })}
      </div>
    )}
  </motion.div>
);

export const TeamHistoryLeadersPanel: React.FC<{
  accent: string;
  isNBAHub: boolean;
  leaderSubTab: 'totals' | 'averages';
  setLeaderSubTab: React.Dispatch<React.SetStateAction<'totals' | 'averages'>>;
  externalLoading: boolean;
  externalError: string | null;
  mergedCareer: any[];
  mergedAverage: any[];
  expandedLeaders: Record<string, boolean>;
  setExpandedLeaders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  statePlayers: Array<{ name?: string; hof?: boolean }>;
  findPlayerImg: (name: string) => string;
  cleanName: (value: string) => string;
  getStatValue: (leader: any, category: string) => string;
  categoryOrder: string[];
  categoryOrderAvg: string[];
}> = ({ accent, isNBAHub, leaderSubTab, setLeaderSubTab, externalLoading, externalError, mergedCareer, mergedAverage, expandedLeaders, setExpandedLeaders, statePlayers, findPlayerImg, cleanName, getStatValue, categoryOrder, categoryOrderAvg }) => (
  <motion.div key="leaders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-black uppercase tracking-widest">{isNBAHub ? 'All-Time Leaders' : 'Career Leaders'}</h2>
      <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
        {(['totals', 'averages'] as const).map(subTab => (
          <button key={subTab} onClick={() => setLeaderSubTab(subTab)} className="px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all" style={leaderSubTab === subTab ? { backgroundColor: accent, color: '#09090b' } : { color: '#71717a' }}>
            {subTab}
          </button>
        ))}
      </div>
    </div>
    {leaderSubTab === 'averages' && <p className="text-[11px] text-zinc-600 font-mono uppercase -mt-4">Min. 100 games played</p>}

    {externalLoading ? <div className="flex items-center gap-2 text-zinc-500 py-8"><Loader className="w-4 h-4 animate-spin" /> Loading leaders…</div> : externalError ? <p className="text-rose-400 text-sm">Failed to load: {externalError}</p> : (() => {
      const source = leaderSubTab === 'totals' ? mergedCareer : mergedAverage;
      const categoryKey = 'Category';
      const order = leaderSubTab === 'totals' ? categoryOrder : categoryOrderAvg;
      const categories = Array.from(new Set(source.map(leader => leader[categoryKey]))).filter(Boolean) as string[];
      categories.sort((left, right) => {
        const leftIndex = order.indexOf(left);
        const rightIndex = order.indexOf(right);
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      });
      if (categories.length === 0) return <p className="text-zinc-600 text-sm italic">No leaders data found for this team.</p>;
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {categories.map(category => {
            const leaders = source.filter(leader => leader[categoryKey] === category);
            const isExpanded = expandedLeaders[category];
            const displayed = isExpanded ? leaders : leaders.slice(0, 5);
            return (
              <div key={category} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: accent }}>{category}</span>
                  <span className="text-[10px] text-zinc-600 font-mono">TOP {leaders.length}</span>
                </div>
                <div className="space-y-2">
                  {displayed.map((leader: any, index: number) => {
                    const rankField = leaderSubTab === 'totals' ? leader.Franchise_Rank : leader.Rank;
                    const displayName = cleanName(leader.NAME ?? '');
                    const isHof = !!statePlayers.find(player => player.name?.toLowerCase() === displayName.toLowerCase())?.hof;
                    return (
                      <div key={index} className="flex items-center gap-3 p-2.5 bg-zinc-900/40 border border-zinc-800/50 rounded-lg hover:border-zinc-700 transition-all">
                        <div className="relative w-9 h-9 shrink-0">
                          <img src={findPlayerImg(displayName)} alt={displayName} className="w-full h-full rounded-lg object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                          <div className="absolute -bottom-1 -left-1 px-1 py-px text-[7px] font-black rounded-sm shadow" style={{ backgroundColor: accent, color: '#09090b' }}>#{rankField ?? index + 1}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-zinc-100 truncate">{displayName}</span>
                            {isHof && <span className="px-1 py-px bg-rose-500/15 text-rose-400 text-[7px] font-black rounded uppercase shrink-0">HOF</span>}
                          </div>
                          <span className="text-[9px] text-zinc-600 font-mono">{leader.GP} GP</span>
                        </div>
                        <span className="text-sm font-black shrink-0" style={{ color: accent }}>{getStatValue(leader, category)}</span>
                      </div>
                    );
                  })}
                </div>
                {leaders.length > 5 && <button onClick={() => setExpandedLeaders(prev => ({ ...prev, [category]: !prev[category] }))} className="w-full mt-3 pt-3 border-t border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors">{isExpanded ? 'Show Less' : `Show All ${leaders.length}`}</button>}
              </div>
            );
          })}
        </div>
      );
    })()}
  </motion.div>
);

export const TeamHistorySeasonPanel: React.FC<{
  accent: string;
  summaryStats: { totalW: number; totalL: number; winPct: string; playoffApps: number; finalsApps: number; titles: number; best?: any; worst?: any };
  seasonHistory: any[];
  isFictional: boolean;
}> = ({ accent, summaryStats, seasonHistory, isFictional }) => (
  <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {[
        { label: 'Record', value: `${summaryStats.totalW}-${summaryStats.totalL}`, sub: summaryStats.winPct },
        { label: 'Playoff Apps', value: summaryStats.playoffApps, sub: 'appearances' },
        { label: 'Finals Apps', value: summaryStats.finalsApps, sub: 'appearances' },
        { label: 'Championships', value: summaryStats.titles, sub: 'titles' },
        { label: 'Best Season', value: summaryStats.best ? `${summaryStats.best.won}-${summaryStats.best.lost}` : '—', sub: summaryStats.best ? String(summaryStats.best.season) : '' },
        { label: 'Worst Season', value: summaryStats.worst ? `${summaryStats.worst.won}-${summaryStats.worst.lost}` : '—', sub: summaryStats.worst ? String(summaryStats.worst.season) : '' },
      ].map((stat, index) => (
        <div key={index} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">{stat.label}</div>
          <div className="text-xl font-black" style={{ color: accent }}>{stat.value}</div>
          <div className="text-[9px] font-mono text-zinc-600 uppercase mt-0.5">{stat.sub}</div>
        </div>
      ))}
    </div>

    {seasonHistory.length === 0 ? (
      <p className="text-zinc-600 text-sm italic">No season data found for this franchise.</p>
    ) : (
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-left border-collapse">
          <thead className="bg-zinc-900/80 sticky top-0">
            <tr>
              {['Season', 'Record', 'Win%', 'Playoffs'].map(header => <th key={header} className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-800">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {seasonHistory.map((row, index) => (
              <tr key={index} className={`border-b border-zinc-800/40 hover:bg-zinc-900/30 transition-colors ${row.isChamp ? 'bg-amber-950/10' : ''}`}>
                <td className="py-3 px-4 font-mono text-sm" style={{ color: accent }}>{row.season - 1}-{String(row.season).slice(-2)}</td>
                <td className="py-3 px-4 font-bold text-sm">{row.isCurrent ? <span className="text-zinc-600 italic text-xs">In Progress</span> : row.won != null ? `${row.won}-${row.lost}` : <span className="text-zinc-700">—</span>}</td>
                <td className="py-3 px-4 text-zinc-400 font-mono text-xs">{row.isCurrent ? <span className="text-zinc-700">TBC</span> : row.won != null ? (row.won / ((row.won + row.lost) || 1)).toFixed(3) : '—'}</td>
                <td className="py-3 px-4">
                  {row.isCurrent ? <span className="text-xs text-zinc-600 italic">Season ongoing</span> : row.isChamp ? <span className="flex items-center gap-1.5 text-xs font-black" style={{ color: accent }}><Trophy className="w-3 h-3" /> {isFictional ? 'League Champions' : 'NBA Champions'}</span> : row.isRU ? <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1"><Trophy className="w-3 h-3 opacity-40" /> Runner-Up</span> : row.playoffRoundsWon === 3 ? <span className="text-xs text-zinc-400">Conf. Finals</span> : row.playoffRoundsWon === 2 ? <span className="text-xs text-zinc-500">2nd Round</span> : row.playoffRoundsWon === 1 ? <span className="text-xs text-zinc-600">1st Round</span> : row.playoffRoundsWon === 0 ? <span className="text-xs text-zinc-700">Play-In</span> : <span className="text-xs text-zinc-800">Missed Playoffs</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </motion.div>
);

export const TeamHistoryRetireModal: React.FC<{
  selectedTeamId: number | null;
  teamId: number;
  isNBAHub: boolean;
  showRetireModal: boolean;
  setShowRetireModal: React.Dispatch<React.SetStateAction<boolean>>;
  accent: string;
  findPlayerImg: (name: string) => string;
}> = ({ selectedTeamId, teamId, isNBAHub, showRetireModal, setShowRetireModal, accent, findPlayerImg }) => {
  if (selectedTeamId == null || isNBAHub) return null;
  return (
    <JerseyRetirementModal
      teamId={teamId}
      isOpen={showRetireModal}
      onClose={() => setShowRetireModal(false)}
      accent={accent}
      findPlayerImg={findPlayerImg}
    />
  );
};
