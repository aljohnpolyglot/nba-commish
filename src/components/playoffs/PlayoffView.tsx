import React, { useState } from 'react';
import { Trophy, FastForward, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { HistoricalPlayoffBracket } from './HistoricalPlayoffBracket';
import { Game } from '../../types';
import { GameSimulatorScreen } from '../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../modals/WatchGamePreviewModal';
import { normalizeDate, getTeamForGame, getPlayersForExhibitionTeam } from '../../utils/helpers';
import { BracketLayout } from './bracket/BracketLayout';
import { SeriesDetailPanel } from './detail/SeriesDetailPanel';

export const PlayoffView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const playoffs = state.playoffs;
  const year = state.leagueStats.year;

  // ─── State ────────────────────────────────────────────────────────────────
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedGameIdx, setSelectedGameIdx] = useState<number>(0);
  const [watchingGame, setWatchingGame] = useState<Game | null>(null);
  const [pendingWatchGame, setPendingWatchGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedResult, setPrecomputedResult] = useState<any | null>(null);
  const [confFilter, setConfFilter] = useState<'East' | 'West'>('East');
  const [viewYear, setViewYear]     = useState<number>(year);

  const isHistorical = viewYear !== year;
  const navYear = (dir: 1 | -1) => setViewYear(y => Math.max(1984, Math.min(year, y + dir)));

  // ─── Derived ──────────────────────────────────────────────────────────────
  const roundLabel = ['', 'First Round', 'Second Round', 'Conf. Finals', 'NBA Finals'];
  const eastStandings = [...state.teams].filter(t => t.conference === 'East').sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  const westStandings = [...state.teams].filter(t => t.conference === 'West').sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSeriesClick = (id: string) => {
    setSelectedSeriesId(id);
    const series = playoffs?.series.find(s => s.id === id);
    if (series) {
      const playedGames = state.schedule.filter(g => g.playoffSeriesId === id && g.played);
      setSelectedGameIdx(Math.max(0, playedGames.length - 1));
    } else {
      setSelectedGameIdx(0);
    }
  };

  const handleWatchGame = (game: Game) => {
    if (normalizeDate(game.date) === normalizeDate(state.date)) {
      setSelectedSeriesId(null);
      setPendingWatchGame(game);
    }
  };

  const executeWatchGame = async (result: any) => {
    if (!watchingGame) return;
    const gameId = watchingGame.gid;
    const currentRig = riggedForTid;
    setWatchingGame(null);
    setRiggedForTid(undefined);
    setPrecomputedResult(null);

    await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId, result } });
    await dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        ...(currentRig !== undefined ? { riggedForTid: currentRig } : {}),
        watchedGameResult: result,
      },
    } as any);
  };

  const handleSimDay = () => {
    dispatchAction({ type: 'ADVANCE_DAY' } as any);
  };

  const handleSimulateRound = () => {
    if (!playoffs) return;

    if (!playoffs.playInComplete) {
      // Can't filter by known teams — loser game teams are TBD until 7v8/9v10 resolve.
      // Sim to fixed end date so all three play-in games complete and Round 1 injects.
      const PLAYIN_END = `${year}-04-20`;
      dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: PLAYIN_END } } as any);
      return;
    }

    const activeSeries = playoffs.series.filter(
      s => s.round === playoffs.currentRound && s.status !== 'complete'
    );
    if (activeSeries.length === 0) return;
    const gameIds = new Set(activeSeries.flatMap(s => s.gameIds));
    const games = state.schedule.filter(g => gameIds.has(g.gid) && !g.played);
    if (games.length === 0) return;
    const lastDate = games.reduce((d, g) => g.date > d ? g.date : d, games[0].date);
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: lastDate } } as any);
  };

  const handleSimGame = () => {
    if (!selectedSeriesId || !playoffs) return;

    // Find next unplayed game for this series/play-in
    const series = playoffs.series.find(s => s.id === selectedSeriesId);
    const playIn = !series ? playoffs.playInGames.find(p => p.id === selectedSeriesId) : null;

    if (series) {
      const nextGame = state.schedule.find(
        g => g.playoffSeriesId === selectedSeriesId && !g.played
      );
      if (!nextGame) return;
      dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: nextGame.date } } as any);
    } else if (playIn?.gameId) {
      const game = state.schedule.find(g => g.gid === playIn.gameId && !g.played);
      if (!game) return;
      dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: game.date } } as any);
    }
  };

  const handleSimPlayoffs = () => {
    dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: `${year}-06-30` } } as any);
  };

  // ─── Full-screen game simulator ──────────────────────────────────────────
  if (watchingGame) {
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <GameSimulatorScreen
          game={watchingGame}
          teams={state.teams}
          players={state.players}
          allStar={state.allStar}
          isProcessing={state.isProcessing}
          onClose={async () => {
              // precomputedResult is always set before GameSimulatorScreen opens (see onConfirm).
              const result = precomputedResult!;
              const gameId = watchingGame!.gid;
              setWatchingGame(null); setRiggedForTid(undefined); setPrecomputedResult(null);
              await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId, result } });
              await dispatchAction({ type: 'ADVANCE_DAY', payload: { watchedGameResult: result } } as any);
          }}
          onComplete={executeWatchGame}
          otherGamesToday={state.schedule.filter(g =>
            normalizeDate(g.date) === normalizeDate(state.date) &&
            !g.played && g.gid !== watchingGame.gid && (g.isPlayoff || g.isPlayIn)
          ).length}
          riggedForTid={riggedForTid}
          precomputedResult={precomputedResult ?? undefined}
        />
      </div>
    );
  }

  // ─── Main view ────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy size={22} className="text-yellow-400" />
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">
              NBA Playoffs {viewYear - 1}–{String(viewYear).slice(-2)}
            </h2>
            <p className="text-slate-500 text-xs">
              {isHistorical ? 'Historical Season' :
                !playoffs ? 'Begins April 14'
                : playoffs.bracketComplete ? 'Complete'
                : playoffs.playInComplete ? (roundLabel[playoffs.currentRound] ?? `Round ${playoffs.currentRound}`)
                : 'Play-In Tournament'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Year chevron — always visible */}
          <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => navYear(-1)}
              disabled={viewYear <= 1984}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-black text-white px-2 min-w-[52px] text-center">
              {viewYear - 1}–{String(viewYear).slice(-2)}
            </span>
            <button
              onClick={() => navYear(1)}
              disabled={viewYear >= year}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* East / West chevron — only for current year pre-bracket */}
          {!isHistorical && !playoffs && (
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
              <button
                onClick={() => setConfFilter(confFilter === 'East' ? 'West' : 'East')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-black text-white px-2 min-w-[48px] text-center">{confFilter}</span>
              <button
                onClick={() => setConfFilter(confFilter === 'East' ? 'West' : 'East')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Sim buttons — only for current season */}
          {!isHistorical && (
            <>
              <button
                onClick={handleSimDay}
                disabled={state.isProcessing}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Play size={14} />
                Sim Day
              </button>
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
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* ── Historical bracket ───────────────────────────────────────────── */}
        {isHistorical && (
          <HistoricalPlayoffBracket viewYear={viewYear} />
        )}

        {/* ── Current season content ───────────────────────────────────────── */}
        {!isHistorical && (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

        {/* ── Pre-playoff standings ────────────────────────────────────────── */}
        {!playoffs && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-6 p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center">
              <Trophy size={32} className="text-indigo-400 mx-auto mb-2" />
              <h3 className="text-lg font-black text-white mb-1">Playoffs Begin April 14</h3>
              <p className="text-slate-400 text-sm">
                The top 6 teams per conference plus Play-In participants (seeds 7–10) will compete for the NBA Championship.
              </p>
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

        {/* ── Bracket + Play-In layout ─────────────────────────────────────── */}
        {playoffs && (
          <div>
            {playoffs.champion && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl mb-4 w-fit">
                <span className="text-yellow-400">🏆</span>
                <span className="font-black text-yellow-300 text-sm">
                  {state.teams.find(t => t.id === playoffs.champion)?.name ?? 'Champions'}
                </span>
              </div>
            )}

            <BracketLayout
              playoffs={playoffs}
              teams={state.teams}
              schedule={state.schedule}
              stateDate={state.date}
              onSeriesClick={handleSeriesClick}
              selectedSeriesId={selectedSeriesId}
            />
          </div>
        )}

        </div>
        )}{/* end !isHistorical */}

      </div>{/* end content container */}

      {/* ── Series detail panel ───────────────────────────────────────────── */}
      {selectedSeriesId && playoffs && (
        <SeriesDetailPanel
          seriesId={selectedSeriesId}
          playoffs={playoffs}
          teams={state.teams}
          schedule={state.schedule}
          players={state.players}
          boxScores={state.boxScores ?? []}
          stateDate={state.date}
          selectedGameIdx={selectedGameIdx}
          onGameIdxChange={setSelectedGameIdx}
          onWatch={handleWatchGame}
          onSimGame={handleSimGame}
          onSimRound={handleSimulateRound}
          onSimPlayoffs={handleSimPlayoffs}
          onClose={() => setSelectedSeriesId(null)}
          isProcessing={state.isProcessing}
        />
      )}

      {/* ── Watch game preview modal ──────────────────────────────────────── */}
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
            onConfirm={async (rig?: number, watchLive?: boolean) => {
              if (watchLive === false) {
                setPendingWatchGame(null);
                await dispatchAction({
                  type: 'ADVANCE_DAY' as any,
                  payload: { ...(rig !== undefined ? { riggedForTid: rig } : {}) },
                });
              } else {
                setRiggedForTid(rig);
                // Always pre-compute before opening the live game screen so onClose and onComplete
                // both use the same result — prevents score discrepancies on early exit.
                if (pendingWatchGame) {
                  const { GameSimulator } = await import('../../services/simulation/GameSimulator');
                  const homeTeam = state.teams.find(t => t.id === pendingWatchGame.homeTid)!;
                  const awayTeam = state.teams.find(t => t.id === pendingWatchGame.awayTid)!;
                  const preResult = GameSimulator.simulateGame(
                    homeTeam, awayTeam, state.players,
                    pendingWatchGame.gid, pendingWatchGame.date,
                    state.stats.playerApproval,
                    undefined, undefined, undefined, undefined, rig
                  );
                  setPrecomputedResult(preResult);
                }
                setWatchingGame(pendingWatchGame);
                setPendingWatchGame(null);
              }
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
};
