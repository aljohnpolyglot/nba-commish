import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { NBATeam, Game, GameResult, PlayerGameStats, NBAPlayer } from '../../types';

interface BoxScoreModalProps {
  game: Game;
  result?: GameResult;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  players: NBAPlayer[];
  onClose: () => void;
  onPlayerClick?: (player: NBAPlayer) => void;
  onTeamClick?: (teamId: number) => void;
}

type SortKey = keyof PlayerGameStats | 'fgp' | 'tpp' | 'ftp';

export const BoxScoreModal: React.FC<BoxScoreModalProps> = ({
  game, result, homeTeam, awayTeam, players, onClose, onPlayerClick, onTeamClick
}) => {
  const isIntraSquad = game.homeTid === game.awayTid;
  const awayDisplayName = isIntraSquad ? `${awayTeam.name} B` : awayTeam.name;
  const homeDisplayName = isIntraSquad ? `${homeTeam.name} A` : homeTeam.name;
  const [activeTab, setActiveTab] = React.useState<'away' | 'home' | 'comparison'>('away');
  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'pts',
    direction: 'desc'
  });

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getPlayerPos = (playerId: string) => {
    const p = players.find(p => p.internalId === playerId);
    return p?.pos || 'N/A';
  };

  const calculateTeamStats = (stats: PlayerGameStats[], oppStats: PlayerGameStats[]) => {
    let fgm = 0, fga = 0, threePm = 0, threePa = 0, ftm = 0, fta = 0, orb = 0, drb = 0, ast = 0, stl = 0, blk = 0, tov = 0, pf = 0;
    stats.forEach(s => {
      fgm += s.fgm; fga += s.fga;
      threePm += s.threePm; threePa += s.threePa;
      ftm += s.ftm; fta += s.fta;
      orb += s.orb; drb += s.drb;
      ast += s.ast; stl += s.stl;
      blk += s.blk; tov += s.tov; pf += s.pf;
    });

    let oppDrb = 0;
    oppStats.forEach(s => {
      oppDrb += s.drb;
    });

    const eFG = fga > 0 ? ((fgm + 0.5 * threePm) / fga) * 100 : 0;
    const tovPct = (fga + 0.44 * fta + tov) > 0 ? (tov / (fga + 0.44 * fta + tov)) * 100 : 0;
    const orbPct = (orb + oppDrb) > 0 ? (orb / (orb + oppDrb)) * 100 : 0;
    const ftFga = fga > 0 ? fta / fga : 0;

    return { 
      eFG, tovPct, orbPct, ftFga,
      fgm, fga, threePm, threePa, ftm, fta, orb, drb, ast, stl, blk, tov, pf
    };
  };

  const renderQuarterlyScores = () => {
    if (!result || !result.quarterScores) return null;
    
    const { home, away } = result.quarterScores;
    const otCount = result.isOT ? result.otCount : 0;
    
    return (
      <div className="w-full max-w-2xl mx-auto mt-6 px-4 overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs text-center">
          <thead className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/10">
            <tr>
              <th className="py-2 text-left">Team</th>
              <th className="py-2">Q1</th>
              <th className="py-2">Q2</th>
              <th className="py-2">Q3</th>
              <th className="py-2">Q4</th>
              {Array.from({ length: otCount }).map((_, i) => (
                <th key={`ot-${i}`} className="py-2">OT{i + 1}</th>
              ))}
              <th className="py-2 font-bold text-white">T</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr>
              <td className="py-2 text-left font-bold text-slate-300">{isIntraSquad ? `${awayTeam.abbrev} B` : awayTeam.abbrev}</td>
              {away.map((q, i) => <td key={`away-q-${i}`} className="py-2 font-mono text-slate-400">{q}</td>)}
              <td className="py-2 font-mono font-bold text-white">{game.awayScore}</td>
            </tr>
            <tr>
              <td className="py-2 text-left font-bold text-slate-300">{isIntraSquad ? `${homeTeam.abbrev} A` : homeTeam.abbrev}</td>
              {home.map((q, i) => <td key={`home-q-${i}`} className="py-2 font-mono text-slate-400">{q}</td>)}
              <td className="py-2 font-mono font-bold text-white">{game.homeScore}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderAdvancedStats = () => {
    if (!result) return null;
    const awayStats = calculateTeamStats(result.awayStats, result.homeStats);
    const homeStats = calculateTeamStats(result.homeStats, result.awayStats);

    const StatRow = ({ label, awayVal, homeVal }: { label: string, awayVal: string | number, homeVal: string | number }) => (
      <div className="flex justify-between items-center py-2 border-b border-white/5">
        <div className="w-1/3 text-left font-mono text-slate-300">{awayVal}</div>
        <div className="w-1/3 text-center text-[10px] text-slate-500 uppercase tracking-widest">{label}</div>
        <div className="w-1/3 text-right font-mono text-slate-300">{homeVal}</div>
      </div>
    );

    return (
      <div className="flex flex-col w-full max-w-2xl mx-auto mt-6 mb-6 px-4">
        <table className="w-full text-xs text-center mb-8">
          <thead className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/10">
            <tr>
              <th className="py-2 text-left">Team</th>
              <th className="py-2">eFG%</th>
              <th className="py-2">TOV%</th>
              <th className="py-2">ORB%</th>
              <th className="py-2">FTA/FGA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr>
              <td className="py-2 text-left">
                <button
                  onClick={() => onTeamClick && onTeamClick(awayTeam.id)}
                  className="font-bold text-white hover:text-indigo-400 transition-colors"
                >
                  {isIntraSquad ? `${awayTeam.abbrev} B` : awayTeam.abbrev}
                </button>
              </td>
              <td className="py-2 font-mono text-slate-300">{awayStats.eFG.toFixed(1)}</td>
              <td className="py-2 font-mono text-slate-300">{awayStats.tovPct.toFixed(1)}</td>
              <td className="py-2 font-mono text-slate-300">{awayStats.orbPct.toFixed(1)}</td>
              <td className="py-2 font-mono text-slate-300">{awayStats.ftFga.toFixed(3)}</td>
            </tr>
            <tr>
              <td className="py-2 text-left">
                <button
                  onClick={() => onTeamClick && onTeamClick(homeTeam.id)}
                  className="font-bold text-white hover:text-indigo-400 transition-colors"
                >
                  {isIntraSquad ? `${homeTeam.abbrev} A` : homeTeam.abbrev}
                </button>
              </td>
              <td className="py-2 font-mono text-slate-300">{homeStats.eFG.toFixed(1)}</td>
              <td className="py-2 font-mono text-slate-300">{homeStats.tovPct.toFixed(1)}</td>
              <td className="py-2 font-mono text-slate-300">{homeStats.orbPct.toFixed(1)}</td>
              <td className="py-2 font-mono text-slate-300">{homeStats.ftFga.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between text-xs font-bold tracking-widest text-slate-500 mb-2">
          <span className="text-white">{isIntraSquad ? `${awayTeam.abbrev} B` : awayTeam.abbrev}</span>
          <span>TEAM STATS</span>
          <span className="text-indigo-400">{isIntraSquad ? `${homeTeam.abbrev} A` : homeTeam.abbrev}</span>
        </div>
        
        <div className="flex flex-col">
          <StatRow label="Field Goals"
            awayVal={`${awayStats.fgm}-${awayStats.fga} (${awayStats.fga > 0 ? ((awayStats.fgm/awayStats.fga)*100).toFixed(1) : '0.0'}%)`}
            homeVal={`${homeStats.fgm}-${homeStats.fga} (${homeStats.fga > 0 ? ((homeStats.fgm/homeStats.fga)*100).toFixed(1) : '0.0'}%)`}
          />
          <StatRow label="3PT FG"
            awayVal={`${awayStats.threePm}-${awayStats.threePa} (${awayStats.threePa > 0 ? ((awayStats.threePm/awayStats.threePa)*100).toFixed(1) : '0.0'}%)`}
            homeVal={`${homeStats.threePm}-${homeStats.threePa} (${homeStats.threePa > 0 ? ((homeStats.threePm/homeStats.threePa)*100).toFixed(1) : '0.0'}%)`}
          />
          <StatRow label="Free Throws"
            awayVal={`${awayStats.ftm}-${awayStats.fta} (${awayStats.fta > 0 ? ((awayStats.ftm/awayStats.fta)*100).toFixed(1) : '0.0'}%)`}
            homeVal={`${homeStats.ftm}-${homeStats.fta} (${homeStats.fta > 0 ? ((homeStats.ftm/homeStats.fta)*100).toFixed(1) : '0.0'}%)`}
          />
          <StatRow label="Rebounds" awayVal={awayStats.orb + awayStats.drb} homeVal={homeStats.orb + homeStats.drb} />
          <StatRow label="Assists" awayVal={awayStats.ast} homeVal={homeStats.ast} />
          <StatRow label="Steals" awayVal={awayStats.stl} homeVal={homeStats.stl} />
          <StatRow label="Blocks" awayVal={awayStats.blk} homeVal={homeStats.blk} />
          <StatRow label="Turnovers" awayVal={awayStats.tov} homeVal={homeStats.tov} />
          <StatRow label="Fouls" awayVal={awayStats.pf} homeVal={homeStats.pf} />
        </div>
      </div>
    );
  };

  const renderStatsTable = (stats: PlayerGameStats[], teamId: number) => {
    const sortedStats = [...stats].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA: any = a[key as keyof PlayerGameStats];
      let valB: any = b[key as keyof PlayerGameStats];

      if (key === 'fgp') {
        valA = a.fga > 0 ? a.fgm / a.fga : 0;
        valB = b.fga > 0 ? b.fgm / b.fga : 0;
      } else if (key === 'tpp') {
        valA = a.threePa > 0 ? a.threePm / a.threePa : 0;
        valB = b.threePa > 0 ? b.threePm / b.threePa : 0;
      } else if (key === 'ftp') {
        valA = a.fta > 0 ? a.ftm / a.fta : 0;
        valB = b.fta > 0 ? b.ftm / b.fta : 0;
      }

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    const SortHeader = ({ label, sortKey, align = 'right' }: { label: string, sortKey: SortKey, align?: 'left' | 'right' | 'center' }) => (
      <th 
        className={`px-2 py-3 font-black tracking-widest cursor-pointer hover:text-white transition-colors text-${align} ${sortConfig.key === sortKey ? 'text-indigo-400' : ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          {label}
          {sortConfig.key === sortKey && (
            <span className="text-[8px]">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
          )}
        </div>
      </th>
    );

    return (
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs text-left min-w-[800px]">
          <thead className="text-[10px] text-slate-500 uppercase bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-black tracking-widest">Name</th>
              <th className="px-2 py-3 font-black tracking-widest">Pos</th>
              <SortHeader label="MIN" sortKey="min" />
              <SortHeader label="FGM-A" sortKey="fgm" />
              <SortHeader label="3PM-A" sortKey="threePm" />
              <SortHeader label="FTM-A" sortKey="ftm" />
              <SortHeader label="ORB" sortKey="orb" />
              <SortHeader label="DRB" sortKey="drb" />
              <SortHeader label="REB" sortKey="reb" />
              <SortHeader label="AST" sortKey="ast" />
              <SortHeader label="STL" sortKey="stl" />
              <SortHeader label="BLK" sortKey="blk" />
              <SortHeader label="TOV" sortKey="tov" />
              <SortHeader label="PF" sortKey="pf" />
              <SortHeader label="PTS" sortKey="pts" />
              <SortHeader label="+/-" sortKey="pm" />
              <SortHeader label="GmSc" sortKey="gameScore" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sortedStats.map((s) => (
              <tr key={s.playerId} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  <button 
                    onClick={() => {
                      const p = players.find(player => player.internalId === s.playerId);
                      if (p && onPlayerClick) onPlayerClick(p);
                    }}
                    className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors text-left"
                  >
                    {s.name}
                  </button>
                </td>
                <td className="px-2 py-3 font-mono text-slate-400">{getPlayerPos(s.playerId)}</td>
                <td className="px-2 py-3 text-right font-mono">{Math.floor(s.min)}:{Math.floor((s.min % 1) * 60).toString().padStart(2, '0')}</td>
                <td className="px-2 py-3 text-right font-mono">{s.fgm}-{s.fga}</td>
                <td className="px-2 py-3 text-right font-mono">{s.threePm}-{s.threePa}</td>
                <td className="px-2 py-3 text-right font-mono">{s.ftm}-{s.fta}</td>
                <td className="px-2 py-3 text-right font-mono">{s.orb}</td>
                <td className="px-2 py-3 text-right font-mono">{s.drb}</td>
                <td className="px-2 py-3 text-right font-mono">{s.reb}</td>
                <td className="px-2 py-3 text-right font-mono">{s.ast}</td>
                <td className="px-2 py-3 text-right font-mono">{s.stl}</td>
                <td className="px-2 py-3 text-right font-mono">{s.blk}</td>
                <td className="px-2 py-3 text-right font-mono">{s.tov}</td>
                <td className="px-2 py-3 text-right font-mono">{s.pf || 0}</td>
                <td className="px-2 py-3 text-right font-mono font-bold text-white">{s.pts}</td>
                <td className={`px-2 py-3 text-right font-mono ${(s.pm || 0) > 0 ? 'text-green-400' : (s.pm || 0) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {(s.pm || 0) > 0 ? '+' : ''}{s.pm || 0}
                </td>
                <td className="px-2 py-3 text-right font-mono">{s.gameScore?.toFixed(1) || '0.0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      {(() => {
        const dnpPlayers = players.filter(p =>
          p.tid === teamId &&
          p.status === 'Active' &&
          !stats.some(s => s.playerId === p.internalId)
        );
        if (dnpPlayers.length === 0) return null;
        return (
          <table className="w-full text-xs text-left min-w-[800px] border-t border-slate-800/50 mt-px">
            <tbody>
              {dnpPlayers.map(p => (
                <tr key={p.internalId} className="opacity-50 hover:opacity-75 transition-opacity">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => onPlayerClick && onPlayerClick(p)}
                      className="font-bold text-slate-400 hover:text-slate-300 transition-colors text-left"
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-500">{p.pos || 'N/A'}</td>
                  <td colSpan={15} className="px-2 py-2 text-slate-500 italic font-mono text-[11px] uppercase tracking-widest">
                    {(p.injury?.gamesRemaining ?? 0) > 0
                      ? `DNP — Injury (${p.injury!.type})`
                      : "DNP — Coach's Decision"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
    </div>
  );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-[#0a0a0a] border border-white/10 rounded-[24px] md:rounded-[32px] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#111]">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">{isIntraSquad ? 'Scrimmage' : 'Box Score'}</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-b from-[#111] to-[#0a0a0a]">
          <div className="flex items-center justify-center gap-2 md:gap-16 w-full">
            <div className="flex flex-col items-center gap-2 md:gap-4 w-1/3">
              <button 
                onClick={() => onTeamClick && onTeamClick(awayTeam.id)}
                className="group flex flex-col items-center gap-2 md:gap-4"
              >
                <img src={awayTeam.logoUrl} alt={awayTeam.name} className="w-12 h-12 md:w-24 md:h-24 object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                <div className="text-center">
                  <div className="font-black text-xs md:text-2xl text-white tracking-tight group-hover:text-indigo-400 transition-colors">{awayDisplayName}</div>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 md:gap-8">
              <span className={`text-3xl md:text-6xl font-black font-mono tracking-tighter ${(game.awayScore || 0) > (game.homeScore || 0) ? 'text-white' : 'text-slate-500'}`}>{game.awayScore || 0}</span>
              <span className="text-slate-800 font-black text-xl md:text-3xl">-</span>
              <span className={`text-3xl md:text-6xl font-black font-mono tracking-tighter ${(game.homeScore || 0) > (game.awayScore || 0) ? 'text-white' : 'text-slate-500'}`}>{game.homeScore || 0}</span>
            </div>

            <div className="flex flex-col items-center gap-2 md:gap-4 w-1/3">
              <button
                onClick={() => onTeamClick && onTeamClick(homeTeam.id)}
                className="group flex flex-col items-center gap-2 md:gap-4"
              >
                <img src={homeTeam.logoUrl} alt={homeDisplayName} className="w-12 h-12 md:w-24 md:h-24 object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                <div className="text-center">
                  <div className="font-black text-xs md:text-2xl text-white tracking-tight group-hover:text-indigo-400 transition-colors">{homeDisplayName}</div>
                </div>
              </button>
            </div>
          </div>
          
          {renderQuarterlyScores()}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-[#111]">
          <button
            onClick={() => setActiveTab('away')}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'away' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            {awayDisplayName}
          </button>
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'home' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            {homeDisplayName}
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'comparison' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            Team Comparison
          </button>
        </div>

        {/* Stats Table */}
        <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
          {result ? (
            activeTab === 'away' ? renderStatsTable(result.awayStats, awayTeam.id) :
            activeTab === 'home' ? renderStatsTable(result.homeStats, homeTeam.id) :
            renderAdvancedStats()
          ) : (
            <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest">
              Detailed box score not available for this game.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
