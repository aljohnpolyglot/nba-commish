import React, { useState, useMemo } from 'react';
import { Trophy, FastForward, Play, ChevronLeft, ChevronRight, Target, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { HistoricalPlayoffBracket } from './HistoricalPlayoffBracket';
import { Game } from '../../types';
import { GameSimulatorScreen } from '../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../modals/WatchGamePreviewModal';
import { normalizeDate, getTeamForGame, getPlayersForExhibitionTeam } from '../../utils/helpers';
import { BracketLayout } from './bracket/BracketLayout';
import { SeriesDetailPanel } from './detail/SeriesDetailPanel';
import { useRosterComplianceGate } from '../../hooks/useRosterComplianceGate';

export const PlayoffView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const rosterGate = useRosterComplianceGate();
  const playoffs = state.playoffs;
  const year = state.leagueStats.year;

  // ─── State ────────────────────────────────────────────────────────────────
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedGameIdx, setSelectedGameIdx] = useState<number>(0);
  const [watchingGame, setWatchingGame] = useState<Game | null>(null);
  const [pendingWatchGame, setPendingWatchGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedResult, setPrecomputedResult] = useState<any | null>(null);
  const [viewYear, setViewYear]     = useState<number>(year);

  const isHistorical = viewYear !== year;
  const navYear = (dir: 1 | -1) => setViewYear(y => Math.max(1984, Math.min(year, y + dir)));

  // ─── Derived ──────────────────────────────────────────────────────────────
  const roundLabel = ['', 'First Round', 'Second Round', 'Conf. Finals', 'NBA Finals'];

  const isGMMode = state.gameMode === 'gm';
  const userTeamId = (state as any).userTeamId as number | undefined;
  const userTeam = userTeamId != null ? state.teams.find(t => t.id === userTeamId) : undefined;
  const userNickname = userTeam?.abbrev ?? '';

  const myNextPlayoffGame = useMemo(() => {
    if (!isGMMode || !userTeamId) return null;
    const candidates = state.schedule.filter(
      g => (g.homeTid === userTeamId || g.awayTid === userTeamId) && !g.played && (g.isPlayoff || g.isPlayIn)
    );
    if (!candidates.length) return null;
    return candidates.reduce((a, b) => a.date <= b.date ? a : b);
  }, [isGMMode, userTeamId, state.schedule]);

  // ─── Draft lottery warning ─────────────────────────────────────────────────
  const lotteryDate = `${year}-05-14`;
  const [showLotteryWarning, setShowLotteryWarning] = useState(false);
  const [pendingSimFn, setPendingSimFn] = useState<(() => void) | null>(null);

  const addDays = (dateStr: string, n = 1): string => {
    const d = new Date(`${normalizeDate(dateStr)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const needsLotteryWarning = (targetDate: string): boolean => {
    if ((state as any).draftLotteryResult) return false;
    const current = normalizeDate(state.date);
    return current < lotteryDate && targetDate >= lotteryDate;
  };

  const withLotteryGuard = (targetDate: string, fn: () => void) => {
    if (needsLotteryWarning(targetDate)) {
      setPendingSimFn(() => fn);
      setShowLotteryWarning(true);
    } else {
      fn();
    }
  };

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
    rosterGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        ...(currentRig !== undefined ? { riggedForTid: currentRig } : {}),
        watchedGameResult: result,
      },
    } as any));
  };

  const handleSimDay = () => {
    const tomorrow = addDays(state.date);
    withLotteryGuard(tomorrow, () => rosterGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY' } as any)));
  };

  const handleSimulateRound = () => {
    if (!playoffs) return;

    if (!playoffs.playInComplete) {
      const PLAYIN_END = `${year}-04-20`;
      withLotteryGuard(PLAYIN_END, () =>
        rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: PLAYIN_END } } as any))
      );
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
    withLotteryGuard(lastDate, () =>
      rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: lastDate } } as any))
    );
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
      withLotteryGuard(nextGame.date, () =>
        rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: nextGame.date } } as any))
      );
    } else if (playIn?.gameId) {
      const game = state.schedule.find(g => g.gid === playIn.gameId && !g.played);
      if (!game) return;
      withLotteryGuard(game.date, () =>
        rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: game.date } } as any))
      );
    }
  };

  const handleSimPlayoffs = () => {
    withLotteryGuard(`${year}-06-30`, () =>
      rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: `${year}-06-30` } } as any))
    );
  };

  const handleSimToMyNextGame = () => {
    if (!myNextPlayoffGame) return;
    withLotteryGuard(myNextPlayoffGame.date, () =>
      rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: myNextPlayoffGame.date, stopBefore: true } } as any))
    );
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
              rosterGate.attempt(() => dispatchAction({ type: 'ADVANCE_DAY', payload: { watchedGameResult: result } } as any));
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

          {/* Sim buttons — only for current season */}
          {!isHistorical && (
            <>
              {isGMMode && myNextPlayoffGame && (
                <button
                  onClick={handleSimToMyNextGame}
                  disabled={state.isProcessing}
                  className="px-4 py-2 bg-emerald-600/25 hover:bg-emerald-600/45 border border-emerald-500/40 text-emerald-300 text-xs font-black rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Target size={14} />
                  Sim Next {userNickname} Game
                </button>
              )}
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
        {isHistorical && (() => {
          // Check for sim-generated playoff data for THIS EXACT year
          const simPlayoffs = (state as any).historicalPlayoffs?.[viewYear];
          if (simPlayoffs?.series) {
            const champTeam = simPlayoffs.champion ? state.teams.find((t: any) => t.id === simPlayoffs.champion) : null;
            return (
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {champTeam && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl mb-4 w-fit">
                    <span className="text-yellow-400">🏆</span>
                    <span className="font-black text-yellow-300 text-sm">{champTeam.name} — {viewYear - 1}-{String(viewYear).slice(-2)} Champions</span>
                  </div>
                )}
                <BracketLayout
                  playoffs={simPlayoffs}
                  teams={state.teams}
                  schedule={[]}
                  stateDate={state.date}
                  onSeriesClick={() => {}}
                  selectedSeriesId={null}
                />
              </div>
            );
          }
          // Fall back to gist-based historical bracket (real NBA data)
          return <HistoricalPlayoffBracket viewYear={viewYear} />;
        })()}

        {/* ── Current season content ───────────────────────────────────────── */}
        {!isHistorical && (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

        {/* ── No active playoffs: show empty bracket (TBD slots) ────────── */}
        {!playoffs && (
          <BracketLayout
            playoffs={{ series: [], playInGames: [], currentRound: 1 as any, bracketComplete: false, playInComplete: false, season: viewYear } as any}
            teams={state.teams}
            schedule={[]}
            stateDate={state.date}
            onSeriesClick={() => {}}
            selectedSeriesId={null}
          />
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
          currentSeason={year}
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

      {/* ── Draft Lottery Warning ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showLotteryWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[#0a0a0a] border border-amber-500/40 shadow-2xl rounded flex flex-col items-center text-center overflow-hidden"
            >
              <div className="w-full bg-gradient-to-b from-amber-600/20 to-transparent p-8">
                <div className="flex justify-center mb-3">
                  <AlertTriangle size={32} className="text-amber-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300 mb-2">Heads Up</p>
                <h2 className="text-2xl font-black italic uppercase tracking-wider text-amber-400">
                  Draft Lottery Ahead
                </h2>
              </div>
              <div className="px-8 pb-8 w-full flex flex-col items-center">
                <p className="text-white/80 italic mb-4 leading-relaxed text-sm">
                  This simulation will pass through the NBA Draft Lottery (May 14). It will run automatically in the background — you won't get a chance to trade picks before positions are locked in.
                </p>
                <p className="text-[10px] text-white/40 mb-6 leading-relaxed">
                  Stop before the lottery if you want to review pick values and make moves first. Otherwise, the results will auto-resolve and show up in the Draft tab.
                </p>
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={() => {
                      setShowLotteryWarning(false);
                      setPendingSimFn(null);
                      rosterGate.attempt(() => dispatchAction({ type: 'SIMULATE_TO_DATE', payload: { targetDate: lotteryDate, stopBefore: true } } as any));
                    }}
                    className="w-full py-4 bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/40 text-amber-300 font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                  >
                    Stop Before Lottery
                  </button>
                  <button
                    onClick={() => {
                      setShowLotteryWarning(false);
                      const fn = pendingSimFn;
                      setPendingSimFn(null);
                      fn?.();
                    }}
                    className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-colors rounded-sm"
                  >
                    Continue Simulation
                  </button>
                  <button
                    onClick={() => { setShowLotteryWarning(false); setPendingSimFn(null); }}
                    className="w-full py-3 bg-transparent border border-white/5 hover:bg-white/5 text-white/40 font-black uppercase tracking-widest text-[10px] transition-colors rounded-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                rosterGate.attempt(() => dispatchAction({
                  type: 'ADVANCE_DAY' as any,
                  payload: { ...(rig !== undefined ? { riggedForTid: rig } : {}) },
                }));
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

      {rosterGate.modal}
    </div>
  );
};
