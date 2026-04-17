import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

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

const teamNameToAbbrev: Record<string, string> = {
  'Atlanta': 'ATL', 'Boston': 'BOS', 'Brooklyn': 'BKN', 'Charlotte': 'CHA',
  'Chicago': 'CHI', 'Cleveland': 'CLE', 'Dallas': 'DAL', 'Denver': 'DEN',
  'Detroit': 'DET', 'Golden State': 'GSW', 'Houston': 'HOU', 'Indiana': 'IND',
  'LA Clippers': 'LAC', 'L.A. Clippers': 'LAC', 'Clippers': 'LAC',
  'LA Lakers': 'LAL', 'L.A. Lakers': 'LAL', 'Lakers': 'LAL',
  'Memphis': 'MEM', 'Miami': 'MIA', 'Milwaukee': 'MIL', 'Minnesota': 'MIN',
  'New Orleans': 'NOP', 'New York': 'NYK', 'Oklahoma City': 'OKC',
  'Orlando': 'ORL', 'Philadelphia': 'PHI', 'Phoenix': 'PHX', 'Portland': 'POR',
  'Sacramento': 'SAC', 'San Antonio': 'SAS', 'Toronto': 'TOR', 'Utah': 'UTA',
  'Washington': 'WAS',
};

const getTeamAbbrev = (name: string): string => {
  const clean = name.replace('*', '').trim();
  if (teamNameToAbbrev[clean]) return teamNameToAbbrev[clean];
  const match = Object.entries(teamNameToAbbrev).find(([k]) => clean.includes(k));
  return match ? match[1] : clean.slice(0, 3).toUpperCase();
};

// Module-level cache so data is only fetched once per session
let _cachedData: HistoricalSeason[] | null = null;
let _fetchPromise: Promise<HistoricalSeason[] | null> | null = null;

function fetchHistoricalData(): Promise<HistoricalSeason[] | null> {
  if (_cachedData) return Promise.resolve(_cachedData);
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/wikipedianbahistory')
    .then(r => r.json())
    .then((data: HistoricalSeason[]) => { _cachedData = data; return data; })
    .catch(() => { _fetchPromise = null; return null; }); // null = fetch error (distinct from empty)
  return _fetchPromise;
}

/** Try multiple season key formats for a given end-year (e.g. viewYear=2026 → "2025-26", "2025-2026") */
function findSeasonData(data: HistoricalSeason[], viewYear: number): HistoricalSeason | undefined {
  const y1 = viewYear - 1;
  const y2short = String(viewYear).slice(-2);
  const candidates = [
    `${y1}-${y2short}`,           // "2025-26"  ← NBA standard
    `${y1}-${viewYear}`,          // "2025-2026"
    `${y1}-${y2short} NBA Playoffs`, // rare extended form
    String(viewYear),             // "2026"
    String(y1),                   // "2025"
  ];
  for (const key of candidates) {
    const found = data.find(d => d.season === key);
    if (found) return found;
  }
  // Fuzzy: season string contains both years
  return data.find(d => d.season.includes(String(y1)) && d.season.includes(y2short));
}

const TeamRow = ({ team, isTop, isWinner, isLoser }: { team?: any; isTop?: boolean; isWinner?: boolean; isLoser?: boolean }) => {
  if (!team) return <div className={`h-10 bg-[#131823] ${isTop ? 'border-b border-slate-800' : ''}`} />;
  const name = (team.team || team.name || 'TBD').replace('*', '');
  const score = team.score;
  const seed = team.seed;
  const teamId = getTeamId(name);
  return (
    <div className={`flex items-center justify-between p-2.5 bg-[#131823] ${isTop ? 'border-b border-slate-800' : ''} ${isLoser ? 'opacity-35' : ''}`}>
      <div className="flex items-center gap-3">
        {teamId ? (
          <img src={`https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`} className="w-7 h-7 drop-shadow-md" alt={name} />
        ) : (
          <div className="w-7 h-7 flex items-center justify-center bg-slate-800/50 rounded-full border border-slate-700/50">
            <span className="text-slate-500 text-[10px] font-bold">?</span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          {seed && <span className="text-[10px] font-bold text-slate-500 w-3 text-right">{seed}</span>}
          <span className={`text-xs font-semibold tracking-wide ${isWinner ? 'text-white font-bold' : 'text-slate-300'}`}>
            {getTeamAbbrev(name)}
          </span>
        </div>
      </div>
      {score !== undefined && (
        <span className={`text-xs font-black pr-1 ${isWinner ? 'text-emerald-400' : 'text-slate-400'}`}>{score}</span>
      )}
    </div>
  );
};

const Matchup = ({ top, bottom, winner, delay = 0 }: { top?: any; bottom?: any; winner?: 'top' | 'bottom'; delay?: number }) => {
  const winTeam = winner === 'top' ? top : winner === 'bottom' ? bottom : null;
  const loseTeam = winner === 'top' ? bottom : winner === 'bottom' ? top : null;
  const winName = winTeam ? getTeamAbbrev((winTeam.team || winTeam.name || '').replace('*', '').trim()) : null;
  const resultText = winName && loseTeam != null
    ? `${winName} WINS ${winTeam.score}-${loseTeam.score}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay }}
      className="flex flex-col rounded-lg overflow-hidden border border-slate-700/60 shadow-md bg-[#0f131c] hover:border-slate-500 hover:shadow-xl transition-all duration-300 w-48 shrink-0"
    >
      <TeamRow team={top} isTop isWinner={winner === 'top'} isLoser={winner === 'bottom'} />
      <TeamRow team={bottom} isWinner={winner === 'bottom'} isLoser={winner === 'top'} />
      <div className="text-center py-1 border-t border-slate-700/60 bg-slate-800/90">
        <span className="text-[9px] font-black tracking-wider uppercase text-slate-300">
          {resultText ?? 'TBD'}
        </span>
      </div>
    </motion.div>
  );
};

interface Props {
  viewYear: number;
}

export const HistoricalPlayoffBracket: React.FC<Props> = ({ viewYear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<HistoricalSeason[]>(_cachedData ?? []);
  const [loading, setLoading] = useState(!_cachedData);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (_cachedData) { setData(_cachedData); setLoading(false); return; }
    setLoading(true);
    fetchHistoricalData().then(d => {
      if (d === null) { setFetchError(true); setLoading(false); return; }
      setData(d);
      setLoading(false);
    });
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    scrollRef.current.scrollTo({ left: scrollLeft + (dir === 'left' ? -clientWidth / 2 : clientWidth / 2), behavior: 'smooth' });
  };

  const seasonData = findSeasonData(data, viewYear);
  const seasonKey = `${viewYear - 1}-${String(viewYear).slice(-2)}`; // for display only

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
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-red-400 mb-1">EAST R1</h3>
          <div className="flex flex-col justify-around gap-4 flex-1">
            <Matchup top={m[0]}  bottom={m[1]}  winner={win(0,1)}   delay={0.05} />
            <Matchup top={m[4]}  bottom={m[5]}  winner={win(4,5)}   delay={0.10} />
            <Matchup top={m[8]}  bottom={m[9]}  winner={win(8,9)}   delay={0.15} />
            <Matchup top={m[12]} bottom={m[13]} winner={win(12,13)} delay={0.20} />
          </div>
        </div>
        {/* East Semis */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-red-400 mb-1">EAST SEMIS</h3>
          <div className="flex flex-col justify-around gap-8 flex-1">
            <Matchup top={m[2]}  bottom={m[3]}  winner={win(2,3)}   delay={0.15} />
            <Matchup top={m[10]} bottom={m[11]} winner={win(10,11)} delay={0.20} />
          </div>
        </div>
        {/* East Finals */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-red-400 mb-1">EAST FINALS</h3>
          <div className="flex flex-col justify-center flex-1">
            <Matchup top={m[6]} bottom={m[7]} winner={win(6,7)} delay={0.25} />
          </div>
        </div>
        {/* NBA Finals */}
        <div className="flex flex-col gap-2 px-2">
          <div className="flex flex-col items-center gap-0.5 mb-1">
            <motion.div
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.8, type: 'spring' }}
            >
              <Trophy className="w-6 h-6 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]" />
            </motion.div>
            <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-amber-400/80">NBA FINALS</h3>
          </div>
          <div className="flex flex-col justify-center flex-1">
            <Matchup top={m[14]} bottom={m[15]} winner={win(14,15)} delay={0.35} />
          </div>
        </div>
        {/* West Finals */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-blue-400 mb-1">WEST FINALS</h3>
          <div className="flex flex-col justify-center flex-1">
            <Matchup top={m[22]} bottom={m[23]} winner={win(22,23)} delay={0.25} />
          </div>
        </div>
        {/* West Semis */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-blue-400 mb-1">WEST SEMIS</h3>
          <div className="flex flex-col justify-around gap-8 flex-1">
            <Matchup top={m[18]} bottom={m[19]} winner={win(18,19)} delay={0.15} />
            <Matchup top={m[26]} bottom={m[27]} winner={win(26,27)} delay={0.20} />
          </div>
        </div>
        {/* West R1 */}
        <div className="flex flex-col gap-2">
          <h3 className="text-center text-[9px] font-black tracking-[0.2em] text-blue-400 mb-1">WEST R1</h3>
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
        <p className="text-slate-500 text-xs font-bold tracking-widest uppercase">Loading Playoffs...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-red-400 font-bold">Could not load historical bracket data.</p>
        <p className="text-slate-500 text-xs">Check your connection and try again.</p>
      </div>
    );
  }

  if (!seasonData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8">
        <p className="text-slate-400 text-sm font-semibold">No bracket data for {seasonKey}.</p>
        {data.length > 0 && (
          <p className="text-slate-600 text-xs">Available seasons: {data[0]?.season} – {data[data.length - 1]?.season}</p>
        )}
      </div>
    );
  }

  // Derive champion from NBA Finals (indices 14 vs 15)
  const m = seasonData.playoffBracketMap;
  const finalsTop = m[14];
  const finalsBot = m[15];
  const champion = finalsTop && finalsBot
    ? (finalsTop.score > finalsBot.score ? finalsTop : finalsBot)
    : (finalsTop || finalsBot);
  const championName = champion ? (champion as any).team || (champion as any).name || '' : '';
  const championId = championName ? getTeamId(championName) : undefined;

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative">
      {/* Champion pill — same style as current-season champion in PlayoffView */}
      {championName && (
        <div className="flex-shrink-0 px-6 pt-4">
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl mb-4 w-fit"
          >
            <span className="text-yellow-400">🏆</span>
            {championId && (
              <img src={`https://cdn.nba.com/logos/nba/${championId}/global/L/logo.svg`} className="w-5 h-5 drop-shadow" alt="" />
            )}
            <span className="font-black text-yellow-300 text-sm">
              {championName.replace('*', '')}
            </span>
          </motion.div>
        </div>
      )}

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
    </div>
  );
};
