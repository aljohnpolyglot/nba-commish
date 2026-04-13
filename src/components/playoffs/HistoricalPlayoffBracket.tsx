import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

type HistoricalSeason = {
  season: string;
  playoffBracketMap: { team: string; score: number }[];
};

const teamNameToId: Record<string, string> = {
  'Cleveland': '1610612739', 'Detroit': '1610612765', 'Atlanta': '1610612737',
  'Boston': '1610612738', 'Toronto': '1610612761', 'Miami': '1610612748',
  'Charlotte': '1610612766', 'Indiana': '1610612754', 'Golden State': '1610612744',
  'Houston': '1610612745', 'Portland': '1610612757', 'LA Clippers': '1610612746',
  'L.A. Clippers': '1610612746', 'Oklahoma City': '1610612760', 'Dallas': '1610612742',
  'San Antonio': '1610612759', 'Memphis': '1610612763', 'Milwaukee': '1610612749',
  'Philadelphia': '1610612755', 'Chicago': '1610612741', 'Washington': '1610612764',
  'Brooklyn': '1610612751', 'Orlando': '1610612753', 'New York': '1610612752',
  'Utah': '1610612762', 'Phoenix': '1610612756', 'Denver': '1610612743',
  'Minnesota': '1610612750', 'New Orleans': '1610612740', 'Sacramento': '1610612758',
  'L.A. Lakers': '1610612747', 'Lakers': '1610612747', 'Clippers': '1610612746',
  'Thunder': '1610612760', 'Nuggets': '1610612743', 'Timberwolves': '1610612750',
  'Rockets': '1610612745', 'Spurs': '1610612759', 'Pistons': '1610612765',
  'Cavaliers': '1610612739', 'Raptors': '1610612761', 'Knicks': '1610612752',
  'Hawks': '1610612737', 'Celtics': '1610612738', 'Magic': '1610612753',
  '76ers': '1610612755', 'Heat': '1610612748', 'Hornets': '1610612766',
  'Warriors': '1610612744', 'Trail Blazers': '1610612757',
};

const getTeamId = (name: string) => {
  const clean = name.replace('*', '').trim();
  return teamNameToId[clean] || Object.entries(teamNameToId).find(([k]) => clean.includes(k))?.[1];
};

// Module-level cache so data is only fetched once per session
let _cachedData: HistoricalSeason[] | null = null;
let _fetchPromise: Promise<HistoricalSeason[]> | null = null;

function fetchHistoricalData(): Promise<HistoricalSeason[]> {
  if (_cachedData) return Promise.resolve(_cachedData);
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/wikipedianbahistory')
    .then(r => r.json())
    .then(data => { _cachedData = data; return data; })
    .catch(() => { _fetchPromise = null; return []; });
  return _fetchPromise;
}

const TeamRow = ({ team, isTop, isWinner }: { team?: any; isTop?: boolean; isWinner?: boolean }) => {
  if (!team) return <div className={`h-10 bg-[#131823] ${isTop ? 'border-b border-slate-800' : ''}`} />;
  const name = (team.team || team.name || 'TBD').replace('*', '');
  const score = team.score;
  const teamId = getTeamId(name);
  return (
    <div className={`flex items-center justify-between px-2.5 py-2 bg-[#131823] ${isTop ? 'border-b border-slate-800' : ''}`}>
      <div className="flex items-center gap-2">
        {teamId ? (
          <img src={`https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`} className="w-6 h-6 drop-shadow-md" alt={name} />
        ) : (
          <div className="w-6 h-6 flex items-center justify-center bg-slate-800/50 rounded-full border border-slate-700/50">
            <span className="text-slate-500 text-[9px] font-bold">?</span>
          </div>
        )}
        <span className={`text-[11px] font-semibold tracking-wide truncate max-w-[90px] ${isWinner ? 'text-white font-bold' : 'text-slate-400'}`}>
          {name}
        </span>
      </div>
      {score !== undefined && (
        <span className={`text-xs font-black ml-2 ${isWinner ? 'text-indigo-400' : 'text-slate-600'}`}>{score}</span>
      )}
    </div>
  );
};

const Matchup = ({ top, bottom, winner, delay = 0 }: { top?: any; bottom?: any; winner?: 'top' | 'bottom'; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, delay }}
    className="flex flex-col rounded-lg overflow-hidden border border-slate-700/60 shadow-md bg-[#0f131c] hover:border-slate-500 hover:shadow-xl transition-all duration-300 w-44 shrink-0"
  >
    <TeamRow team={top} isTop isWinner={winner === 'top'} />
    <TeamRow team={bottom} isWinner={winner === 'bottom'} />
  </motion.div>
);

interface Props {
  viewYear: number;
}

export const HistoricalPlayoffBracket: React.FC<Props> = ({ viewYear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<HistoricalSeason[]>(_cachedData ?? []);
  const [loading, setLoading] = useState(!_cachedData);

  useEffect(() => {
    if (_cachedData) { setData(_cachedData); setLoading(false); return; }
    setLoading(true);
    fetchHistoricalData().then(d => { setData(d); setLoading(false); });
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    scrollRef.current.scrollTo({ left: scrollLeft + (dir === 'left' ? -clientWidth / 2 : clientWidth / 2), behavior: 'smooth' });
  };

  const seasonKey = `${viewYear - 1}-${String(viewYear).slice(-2)}`;
  const seasonData = data.find(d => d.season === seasonKey);

  const renderBracket = () => {
    if (!seasonData) return null;
    const m = seasonData.playoffBracketMap;
    const win = (i1: number, i2: number): 'top' | 'bottom' | undefined => {
      if (!m[i1] || !m[i2]) return undefined;
      return m[i1].score > m[i2].score ? 'top' : 'bottom';
    };
    return (
      <div className="min-w-max mx-auto flex items-stretch gap-10 py-6 px-4">
        {/* East R1 */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-slate-500 mb-1">EAST R1</h3>
          <div className="flex flex-col justify-around gap-4 flex-1">
            <Matchup top={m[0]}  bottom={m[1]}  winner={win(0,1)}   delay={0.05} />
            <Matchup top={m[4]}  bottom={m[5]}  winner={win(4,5)}   delay={0.10} />
            <Matchup top={m[8]}  bottom={m[9]}  winner={win(8,9)}   delay={0.15} />
            <Matchup top={m[12]} bottom={m[13]} winner={win(12,13)} delay={0.20} />
          </div>
        </div>
        {/* East Semis */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-slate-500 mb-1">EAST SEMIS</h3>
          <div className="flex flex-col justify-around gap-8 flex-1">
            <Matchup top={m[2]}  bottom={m[3]}  winner={win(2,3)}   delay={0.15} />
            <Matchup top={m[10]} bottom={m[11]} winner={win(10,11)} delay={0.20} />
          </div>
        </div>
        {/* East Finals */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-slate-500 mb-1">EAST FINALS</h3>
          <div className="flex flex-col justify-center flex-1">
            <Matchup top={m[6]} bottom={m[7]} winner={win(6,7)} delay={0.25} />
          </div>
        </div>
        {/* NBA Finals */}
        <div className="flex flex-col gap-2 px-2 relative">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-amber-400/80 mb-1">NBA FINALS</h3>
          <div className="flex flex-col justify-center flex-1">
            <Matchup top={m[14]} bottom={m[15]} winner={win(14,15)} delay={0.35} />
          </div>
          <motion.div
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8, type: 'spring' }}
            className="absolute -top-10 left-1/2 -translate-x-1/2"
          >
            <Trophy className="w-8 h-8 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]" />
          </motion.div>
        </div>
        {/* West Finals */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-slate-500 mb-1">WEST FINALS</h3>
          <div className="flex flex-col justify-center flex-1">
            <Matchup top={m[22]} bottom={m[23]} winner={win(22,23)} delay={0.25} />
          </div>
        </div>
        {/* West Semis */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-slate-500 mb-1">WEST SEMIS</h3>
          <div className="flex flex-col justify-around gap-8 flex-1">
            <Matchup top={m[18]} bottom={m[19]} winner={win(18,19)} delay={0.15} />
            <Matchup top={m[26]} bottom={m[27]} winner={win(26,27)} delay={0.20} />
          </div>
        </div>
        {/* West R1 */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-slate-500 mb-1">WEST R1</h3>
          <div className="flex flex-col justify-around gap-4 flex-1">
            <Matchup top={m[16]} bottom={m[17]} winner={win(16,17)} delay={0.05} />
            <Matchup top={m[20]} bottom={m[21]} winner={win(20,21)} delay={0.10} />
            <Matchup top={m[24]} bottom={m[25]} winner={win(24,25)} delay={0.15} />
            <Matchup top={m[28]} bottom={m[29]} winner={win(28,29)} delay={0.20} />
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-xs font-bold tracking-widest uppercase">Loading Historical Data...</p>
      </div>
    );
  }

  if (!seasonData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">No historical data available for the {seasonKey} season.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden relative">
      <button onClick={() => scroll('left')}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur-sm border border-slate-600 shadow-lg hidden md:block">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={() => scroll('right')}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded-full backdrop-blur-sm border border-slate-600 shadow-lg hidden md:block">
        <ChevronRight className="w-5 h-5" />
      </button>
      <div className="w-full h-full overflow-auto custom-scrollbar px-4 md:px-12" ref={scrollRef}>
        <AnimatePresence mode="wait">
          <motion.div key={seasonKey}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
          >
            {renderBracket()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
