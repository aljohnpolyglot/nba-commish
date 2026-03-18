import React, { useState } from 'react';
import { Trophy, Play, FastForward } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { Game, PlayoffSeries, PlayInGame, NBATeam } from '../../types';
import { GameSimulatorScreen } from '../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../modals/WatchGamePreviewModal';
import { normalizeDate, getTeamForGame, getPlayersForExhibitionTeam } from '../../utils/helpers';

// ─── Series status helper ────────────────────────────────────────────────────

function getSeriesStatusText(series: PlayoffSeries, teams: NBATeam[]): string {
  const higher = teams.find(t => t.id === series.higherSeedTid);
  const lower = teams.find(t => t.id === series.lowerSeedTid);

  if (series.status === 'complete' && series.winnerId) {
    const isHigher = series.winnerId === series.higherSeedTid;
    const winner = isHigher ? higher : lower;
    const winW = isHigher ? series.higherSeedWins : series.lowerSeedWins;
    const loseW = isHigher ? series.lowerSeedWins : series.higherSeedWins;
    return `${winner?.abbrev ?? '?'} wins ${winW}-${loseW}`;
  }
  if (series.higherSeedWins === 0 && series.lowerSeedWins === 0) return 'Not started';
  if (series.higherSeedWins > series.lowerSeedWins)
    return `${higher?.abbrev ?? '?'} leads ${series.higherSeedWins}-${series.lowerSeedWins}`;
  if (series.lowerSeedWins > series.higherSeedWins)
    return `${lower?.abbrev ?? '?'} leads ${series.lowerSeedWins}-${series.higherSeedWins}`;
  return `Tied ${series.higherSeedWins}-${series.lowerSeedWins}`;
}

// ─── SeriesCard ──────────────────────────────────────────────────────────────

interface SeriesCardProps {
  series: PlayoffSeries | null;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  onWatch: (game: Game) => void;
  label?: string;
}

const SeriesCard: React.FC<SeriesCardProps> = ({ series, teams, schedule, stateDate, onWatch, label }) => {
  if (!series) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-3 flex items-center justify-center min-h-[88px]">
        <span className="text-slate-700 text-[10px] font-bold">{label || 'TBD'}</span>
      </div>
    );
  }

  const higher = teams.find(t => t.id === series.higherSeedTid);
  const lower = teams.find(t => t.id === series.lowerSeedTid);
  const isComplete = series.status === 'complete';
  const higherWon = isComplete && series.winnerId === series.higherSeedTid;
  const lowerWon = isComplete && series.winnerId === series.lowerSeedTid;
  const nextGame = schedule.find(g => g.playoffSeriesId === series.id && !g.played);
  const isToday = nextGame ? normalizeDate(nextGame.date) === normalizeDate(stateDate) : false;
  const statusText = getSeriesStatusText(series, teams);

  return (
    <div className={`bg-[#111] border ${isComplete ? 'border-white/5' : 'border-white/10'} rounded-xl p-2.5 flex flex-col gap-1`}>
      {/* Higher seed */}
      <div className={`flex items-center gap-1.5 ${lowerWon ? 'opacity-30' : ''}`}>
        <span className="text-[9px] text-slate-600 w-3.5 font-mono shrink-0">{series.higherSeed}</span>
        {higher
          ? <img src={higher.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
          : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
        <span className="text-xs font-bold text-white truncate flex-1">{higher?.abbrev ?? 'TBD'}</span>
        <span className={`text-xs font-black shrink-0 ${higherWon ? 'text-emerald-400' : 'text-white'}`}>
          {series.higherSeedWins}{higherWon ? ' 🏆' : ''}
        </span>
      </div>

      {/* Lower seed */}
      <div className={`flex items-center gap-1.5 ${higherWon ? 'opacity-30' : ''}`}>
        <span className="text-[9px] text-slate-600 w-3.5 font-mono shrink-0">{series.lowerSeed}</span>
        {lower
          ? <img src={lower.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
          : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
        <span className="text-xs font-bold text-white truncate flex-1">{lower?.abbrev ?? 'TBD'}</span>
        <span className={`text-xs font-black shrink-0 ${lowerWon ? 'text-emerald-400' : 'text-white'}`}>
          {series.lowerSeedWins}{lowerWon ? ' 🏆' : ''}
        </span>
      </div>

      {/* Status + watch button */}
      <div className="border-t border-white/5 pt-1.5 mt-0.5">
        <div className={`text-[9px] font-bold truncate ${isComplete ? 'text-emerald-400' : 'text-slate-500'}`}>
          {statusText}
        </div>
        {!isComplete && isToday && nextGame && (
          <button
            onClick={() => onWatch(nextGame)}
            className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 bg-white text-black text-[9px] font-black rounded-md hover:bg-emerald-400 transition-all"
          >
            <Play size={8} fill="currentColor" />
            Watch G{nextGame.playoffGameNumber}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── PlayInBracketCard ───────────────────────────────────────────────────────

interface PlayInBracketCardProps {
  pig: PlayInGame | undefined;
  teams: NBATeam[];
  schedule: Game[];
  stateDate: string;
  onWatch: (game: Game) => void;
  label: string;
}

const PlayInBracketCard: React.FC<PlayInBracketCardProps> = ({ pig, teams, schedule, stateDate, onWatch, label }) => {
  if (!pig) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-2.5 flex items-center justify-center h-[68px]">
        <span className="text-slate-700 text-[10px] font-bold">TBD</span>
      </div>
    );
  }

  const t1 = pig.team1Tid > 0 ? teams.find(t => t.id === pig.team1Tid) : null;
  const t2 = pig.team2Tid > 0 ? teams.find(t => t.id === pig.team2Tid) : null;
  const game = pig.gameId ? schedule.find(g => g.gid === pig.gameId) : null;
  const isToday = game ? normalizeDate(game.date) === normalizeDate(stateDate) : false;
  const winner = pig.played && pig.winnerId ? teams.find(t => t.id === pig.winnerId) : null;
  const teamsReady = pig.team1Tid > 0 && pig.team2Tid > 0;

  return (
    <div className={`bg-[#111] border ${pig.played ? 'border-white/5' : 'border-indigo-500/20'} rounded-xl overflow-hidden`}>
      <div className="px-2.5 pt-1.5 pb-0">
        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="px-2.5 pb-2 pt-1">
        {/* Team 1 */}
        <div className={`flex items-center gap-1.5 mb-1 ${winner && winner.id !== pig.team1Tid ? 'opacity-30' : ''}`}>
          {t1
            ? <img src={t1.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
            : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
          <span className="text-xs font-bold text-white flex-1 truncate">{t1?.abbrev ?? 'TBD'}</span>
          {pig.played && game && (
            <span className={`text-xs font-black shrink-0 ${winner?.id === pig.team1Tid ? 'text-emerald-400' : 'text-slate-600'}`}>
              {game.homeScore}
            </span>
          )}
        </div>
        {/* Team 2 */}
        <div className={`flex items-center gap-1.5 ${winner && winner.id !== pig.team2Tid ? 'opacity-30' : ''}`}>
          {t2
            ? <img src={t2.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
            : <div className="w-5 h-5 bg-slate-800 rounded-full shrink-0" />}
          <span className="text-xs font-bold text-white flex-1 truncate">{t2?.abbrev ?? 'TBD'}</span>
          {pig.played && game && (
            <span className={`text-xs font-black shrink-0 ${winner?.id === pig.team2Tid ? 'text-emerald-400' : 'text-slate-600'}`}>
              {game.awayScore}
            </span>
          )}
        </div>

        {!pig.played && teamsReady && isToday && game ? (
          <button
            onClick={() => onWatch(game)}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 bg-white text-black text-[9px] font-black rounded-md hover:bg-emerald-400 transition-all"
          >
            <Play size={8} fill="currentColor" />
            Watch
          </button>
        ) : !pig.played && teamsReady && game ? (
          <div className="mt-1 text-[9px] text-slate-600 text-center">
            {new Date(game.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}
          </div>
        ) : pig.played && winner ? (
          <div className="mt-1 text-[9px] text-emerald-400 font-bold text-center">{winner.abbrev} wins</div>
        ) : null}
      </div>
    </div>
  );
};

// ─── BracketColumn ────────────────────────────────────────────────────────────

interface BracketColumnProps {
  label: string;
  labelColor?: string;
  justify?: string;
  children: React.ReactNode;
}

const BracketColumn: React.FC<BracketColumnProps> = ({ label, labelColor = 'text-slate-600', justify = 'flex-start', children }) => (
  <div className={`flex flex-col w-40 shrink-0`} style={{ justifyContent: justify }}>
    <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${labelColor}`}>{label}</div>
    <div className="flex flex-col gap-2 flex-1" style={{ justifyContent: justify }}>
      {children}
    </div>
  </div>
);

// ─── Main PlayoffView ────────────────────────────────────────────────────────

export const PlayoffView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const playoffs = state.playoffs;
  const year = state.leagueStats.year;

  const [watchingGame, setWatchingGame] = useState<Game | null>(null);
  const [pendingWatchGame, setPendingWatchGame] = useState<Game | null>(null);
  const [viewMode, setViewMode] = useState<'bracket' | 'watching'>('bracket');
  const [confFilter, setConfFilter] = useState<'East' | 'West'>('East');

  const handleWatchGame = (game: Game) => {
    if (normalizeDate(game.date) === normalizeDate(state.date)) {
      setPendingWatchGame(game);
    }
  };

  const executeWatchGame = async (result: any) => {
    if (!watchingGame) return;
    const gameId = watchingGame.gid;
    setWatchingGame(null);
    setViewMode('bracket');
    await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId, result } });
    await dispatchAction({ type: 'ADVANCE_DAY' });
  };

  const handleSimulateRound = () => {
    if (!playoffs) return;

    if (!playoffs.playInComplete) {
      const pending = playoffs.playInGames.filter(p => !p.played && p.team1Tid > 0 && p.team2Tid > 0 && p.gameId);
      const games = state.schedule.filter(g => pending.some(p => p.gameId === g.gid) && !g.played);
      if (games.length === 0) return;
      const lastDate = games.reduce((d, g) => g.date > d ? g.date : d, games[0].date);
      dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: lastDate } } as any);
      return;
    }

    const activeSeries = playoffs.series.filter(s => s.round === playoffs.currentRound && s.status !== 'complete');
    if (activeSeries.length === 0) return;
    const gameIds = new Set(activeSeries.flatMap(s => s.gameIds));
    const games = state.schedule.filter(g => gameIds.has(g.gid) && !g.played);
    if (games.length === 0) return;
    const lastDate = games.reduce((d, g) => g.date > d ? g.date : d, games[0].date);
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: lastDate } } as any);
  };

  const getSeries = (id: string) => playoffs?.series.find(s => s.id === id) ?? null;

  const roundLabel = ['', 'First Round', 'Second Round', 'Conf. Finals', 'NBA Finals'];

  const eastStandings = [...state.teams].filter(t => t.conference === 'East').sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const westStandings = [...state.teams].filter(t => t.conference === 'West').sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  // Full-screen game watch
  if (viewMode === 'watching' && watchingGame) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <GameSimulatorScreen
          game={watchingGame}
          teams={state.teams}
          players={state.players}
          allStar={state.allStar}
          isProcessing={state.isProcessing}
          onClose={() => { setWatchingGame(null); setViewMode('bracket'); }}
          onComplete={executeWatchGame}
          otherGamesToday={state.schedule.filter(g =>
            normalizeDate(g.date) === normalizeDate(state.date) &&
            !g.played && g.gid !== watchingGame.gid && (g.isPlayoff || g.isPlayIn)
          ).length}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy size={22} className="text-yellow-400" />
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">NBA Playoffs {year}</h2>
            <p className="text-slate-500 text-xs">
              {!playoffs
                ? 'Begins April 14'
                : playoffs.bracketComplete
                ? 'Complete'
                : playoffs.playInComplete
                ? `${roundLabel[playoffs.currentRound] ?? `Round ${playoffs.currentRound}`}`
                : 'Play-In Tournament'}
            </p>
          </div>
        </div>

        {playoffs && !playoffs.bracketComplete && (
          <button
            onClick={handleSimulateRound}
            disabled={state.isProcessing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <FastForward size={14} />
            {playoffs.playInComplete ? `Sim ${roundLabel[playoffs.currentRound] ?? 'Round'}` : 'Sim Play-In'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

        {/* ── Pre-playoff: standings + message ─────────────────────────────── */}
        {!playoffs && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-6 p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center">
              <Trophy size={32} className="text-indigo-400 mx-auto mb-2" />
              <h3 className="text-lg font-black text-white mb-1">Playoffs Begin April 14</h3>
              <p className="text-slate-400 text-sm">
                The top 6 teams per conference plus Play-In participants (seeds 7–10) will compete for the NBA Championship.
              </p>
            </div>

            <div className="flex gap-2 mb-4">
              {(['East', 'West'] as const).map(conf => (
                <button
                  key={conf}
                  onClick={() => setConfFilter(conf)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${confFilter === conf ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}
                >
                  {conf}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {(confFilter === 'East' ? eastStandings : westStandings).map((team, idx) => (
                <div
                  key={team.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    idx < 6
                      ? 'bg-[#111] border-white/5'
                      : idx < 10
                      ? 'bg-[#111] border-indigo-500/20'
                      : 'bg-white/[0.02] border-white/5 opacity-40'
                  }`}
                >
                  <span className="text-xs font-black text-slate-600 w-5">{idx + 1}</span>
                  <img src={team.logoUrl} className="w-8 h-8 object-contain" alt="" referrerPolicy="no-referrer" />
                  <span className="font-bold text-white">{team.name}</span>
                  {idx >= 6 && idx < 10 && (
                    <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">Play-In</span>
                  )}
                  <span className="ml-auto font-mono font-black text-indigo-400">{team.wins}-{team.losses}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Play-In section ───────────────────────────────────────────────── */}
        {playoffs && !playoffs.playInComplete && (
          <div className="mb-8">
            <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 mb-6">Play-In Tournament</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {(['East', 'West'] as const).map(conf => {
                const prefix = conf[0];
                const game7v8 = playoffs.playInGames.find(p => p.id === `${prefix}7v8`);
                const game9v10 = playoffs.playInGames.find(p => p.id === `${prefix}9v10`);
                const loserGame = playoffs.playInGames.find(p => p.id === `${prefix}loser`);

                const seed7Winner = game7v8?.played && game7v8.winnerId
                  ? state.teams.find(t => t.id === game7v8.winnerId) : null;
                const seed8Winner = loserGame?.played && loserGame.winnerId
                  ? state.teams.find(t => t.id === loserGame.winnerId) : null;

                const confLogo = conf === 'East'
                  ? 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png'
                  : 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png';

                return (
                  <div key={conf} className="space-y-3">
                    {/* Conference header */}
                    <div className="flex items-center gap-2">
                      <img src={confLogo} className="w-5 h-5 object-contain" alt={conf} referrerPolicy="no-referrer" />
                      <h4 className="font-black text-white text-sm">{conf}ern Conference</h4>
                    </div>

                    {/* Bracket tree */}
                    <div className="flex gap-0 items-stretch">

                      {/* Col 1: First-round games */}
                      <div className="flex flex-col shrink-0 w-44 gap-0">
                        <div className="flex-1 flex flex-col justify-end pb-1">
                          <PlayInBracketCard
                            pig={game7v8}
                            teams={state.teams}
                            schedule={state.schedule}
                            stateDate={state.date}
                            onWatch={handleWatchGame}
                            label="7 vs 8 Seed"
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-start pt-1">
                          <PlayInBracketCard
                            pig={game9v10}
                            teams={state.teams}
                            schedule={state.schedule}
                            stateDate={state.date}
                            onWatch={handleWatchGame}
                            label="9 vs 10 Seed"
                          />
                        </div>
                      </div>

                      {/* Col 2: H-bracket connector */}
                      <div className="w-7 flex flex-col shrink-0">
                        <div className="flex-1 border-r-2 border-b-2 border-indigo-900/60 rounded-br-xl" />
                        <div className="flex-1 border-r-2 border-t-2 border-indigo-900/60 rounded-tr-xl" />
                      </div>

                      {/* Col 3: Outcomes + Loser Game */}
                      <div className="flex-1 flex flex-col justify-center gap-2">
                        {/* 7th Seed outcome */}
                        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${seed7Winner ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-dashed border-white/10'}`}>
                          {seed7Winner ? (
                            <>
                              <img src={seed7Winner.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
                              <span className="text-xs font-bold text-emerald-400 truncate">{seed7Winner.abbrev}</span>
                            </>
                          ) : (
                            <span className="text-[9px] text-slate-600 font-bold">Win Game 1</span>
                          )}
                          <span className="ml-auto text-[9px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">7th Seed</span>
                        </div>

                        {/* Loser Game */}
                        <PlayInBracketCard
                          pig={loserGame}
                          teams={state.teams}
                          schedule={state.schedule}
                          stateDate={state.date}
                          onWatch={handleWatchGame}
                          label="Loser Game"
                        />

                        {/* 8th Seed outcome */}
                        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border ${seed8Winner ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-dashed border-white/10'}`}>
                          {seed8Winner ? (
                            <>
                              <img src={seed8Winner.logoUrl} className="w-5 h-5 object-contain shrink-0" alt="" referrerPolicy="no-referrer" />
                              <span className="text-xs font-bold text-emerald-400 truncate">{seed8Winner.abbrev}</span>
                            </>
                          ) : (
                            <span className="text-[9px] text-slate-600 font-bold">Win Loser Game</span>
                          )}
                          <span className="ml-auto text-[9px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">8th Seed</span>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Full bracket ─────────────────────────────────────────────────── */}
        {playoffs?.round1Injected && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Bracket</h3>
              {playoffs.champion && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
                  <span className="text-yellow-400">🏆</span>
                  <span className="font-black text-yellow-300 text-sm">
                    {state.teams.find(t => t.id === playoffs.champion)?.name ?? 'Champions'}
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto pb-4">
              <div className="flex items-stretch gap-3 min-w-max">

                {/* West R1 */}
                <BracketColumn label="West · Round 1">
                  <SeriesCard series={getSeries('WR1S1')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                  <SeriesCard series={getSeries('WR1S2')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                  <SeriesCard series={getSeries('WR1S3')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                  <SeriesCard series={getSeries('WR1S4')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                </BracketColumn>

                {/* West R2 */}
                <BracketColumn label="West · Round 2" justify="space-around">
                  <SeriesCard series={getSeries('WR2S1')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="Round 2 TBD" />
                  <SeriesCard series={getSeries('WR2S2')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="Round 2 TBD" />
                </BracketColumn>

                {/* West CF */}
                <BracketColumn label="West Finals" justify="center">
                  <SeriesCard series={getSeries('WR3S1')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="WCF TBD" />
                </BracketColumn>

                {/* Divider + Finals */}
                <div className="flex flex-col w-44 shrink-0">
                  <div className="text-[9px] font-black uppercase tracking-widest mb-2 text-yellow-500">🏆 NBA Finals</div>
                  <div className="flex-1 flex flex-col justify-center">
                    <SeriesCard series={getSeries('Finals')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="Finals TBD" />
                  </div>
                </div>

                {/* East CF */}
                <BracketColumn label="East Finals" justify="center">
                  <SeriesCard series={getSeries('ER3S1')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="ECF TBD" />
                </BracketColumn>

                {/* East R2 */}
                <BracketColumn label="East · Round 2" justify="space-around">
                  <SeriesCard series={getSeries('ER2S1')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="Round 2 TBD" />
                  <SeriesCard series={getSeries('ER2S2')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} label="Round 2 TBD" />
                </BracketColumn>

                {/* East R1 */}
                <BracketColumn label="East · Round 1">
                  <SeriesCard series={getSeries('ER1S1')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                  <SeriesCard series={getSeries('ER1S2')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                  <SeriesCard series={getSeries('ER1S3')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                  <SeriesCard series={getSeries('ER1S4')} teams={state.teams} schedule={state.schedule} stateDate={state.date} onWatch={handleWatchGame} />
                </BracketColumn>

              </div>
            </div>
          </div>
        )}

      </div>

      {/* Watch game preview modal */}
      <AnimatePresence>
        {pendingWatchGame && (
          <WatchGamePreviewModal
            game={pendingWatchGame}
            homeTeam={getTeamForGame(pendingWatchGame.homeTid, state.teams)}
            awayTeam={getTeamForGame(pendingWatchGame.awayTid, state.teams)}
            players={state.players}
            homeStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, true, state.allStar, state.players)}
            awayStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, false, state.allStar, state.players)}
            onClose={() => setPendingWatchGame(null)}
            onConfirm={() => {
              setWatchingGame(pendingWatchGame);
              setViewMode('watching');
              setPendingWatchGame(null);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
};
