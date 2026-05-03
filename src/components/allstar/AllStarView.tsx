import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../store/GameContext';
import { Star, Zap, Target, Trophy, Users, Crown } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { getOwnTeamId } from '../../utils/helpers';

import { getAllStarWeekendDates } from '../../services/allStar/AllStarWeekendOrchestrator';
import { ALL_STAR_ASSETS } from '../../services/allStar/AllStarSelectionService';
import { AllStarOverview } from './AllStarOverview';
import { AllStarVotes } from './AllStarVotes';
import { AllStarRoster } from './AllStarRoster';
import { RisingStarsView } from './RisingStarsView';
import { CelebrityGameView } from './CelebrityGameView';
import { DunkContestView } from './DunkContestView';
import { ThreePointView } from './ThreePointView';
import { ThroneContestView } from './ThroneContestView';
import { AllStarGameView } from './AllStarGameView';
import { GameSimulatorScreen } from '../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../modals/WatchGamePreviewModal';
import { BoxScoreModal } from '../modals/BoxScoreModal';
import { DunkContest, ThreePointContest, mapPlayerToContestant } from './allstarevents';
import { getTeamForGame, getPlayersForExhibitionTeam, normalizeDate } from '../../utils/helpers';
import { AllStarHistoryView } from './AllStarHistoryView';
import { PlayerBioView } from '../central/view/PlayerBioView';
import { History } from 'lucide-react';
import { fetchAllStarHistory, getCachedAllStarHistory } from '../../data/allStarHistoryFetcher';
import { parseGameDate } from '../../utils/dateUtils';

type AllStarTab = 'overview' | 'votes' | 'roster' | 'rising-stars' | 'celebrity' | 'dunk' | 'three-point' | 'throne';

export const AllStarView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const ownTid = getOwnTeamId(state);
  const allStar = state.allStar;
  const [activeTab, setActiveTab] = useState<AllStarTab>('overview');
  const [watchingGame, setWatchingGame] = useState<any | null>(null);
  const [pendingWatchGame, setPendingWatchGame] = useState<any | null>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<any | null>(null);
  
  const [watchingDunkContest, setWatchingDunkContest] = useState(false);
  const [watchingThreePoint, setWatchingThreePoint] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [viewingPlayer, setViewingPlayer] = useState<any | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => { fetchAllStarHistory().then(() => setHistoryVersion(v => v + 1)); }, []);
  
  const dates = getAllStarWeekendDates(state.leagueStats.year);
  const dateStr = dates.allStarGame.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleWatchGame = (game: any) => {
    const isToday = normalizeDate(game.date) === normalizeDate(state.date);
    if (isToday) {
      setPendingWatchGame(game);
    }
  };

  const executeWatchGame = async () => {
    // Don't dispatch TRAVEL — it would advance the day past other All-Star events.
    // Box scores are recorded by the normal advanceDay lazy simulation.
    setWatchingGame(null);
  };

  const otherGamesToday = useMemo(() => {
    if (!watchingGame) return 0;
    const norm = normalizeDate(state.date);
    return state.schedule.filter(g =>
      normalizeDate(g.date) === norm &&
      !g.played &&
      g.gid !== watchingGame.gid &&
      (g.isAllStar || g.isRisingStars || (g as any).isCelebrity || (g as any).isCelebrityGame)
    ).length;
  }, [watchingGame, state.schedule, state.date]);

  // Determine current phase
  let phase: 'upcoming' | 'voting' | 'starters' | 'roster' | 'complete' = 'upcoming';
  const currentDate = parseGameDate(state.date);

  if (allStar) {
    if (allStar.weekendComplete) phase = 'complete';
    else if (allStar.reservesAnnounced) phase = 'roster';
    else if (allStar.startersAnnounced) phase = 'starters';
    else phase = 'voting';
  } else {
    if (currentDate >= dates.votingStart && currentDate <= dates.votingEnd) {
      phase = 'voting';
    } else if (currentDate > dates.votingEnd && currentDate < dates.startersAnnounced) {
      phase = 'voting';
    } else if (currentDate >= dates.startersAnnounced) {
      phase = 'starters';
    }
  }

  const tabs: { 
    id: AllStarTab; 
    label: string; 
    icon: any;
    locked?: boolean;
    hidden?: boolean;
  }[] = [
    { id: 'overview', label: 'Overview', icon: Star },
    { 
      id: 'votes', 
      label: 'Voting', 
      icon: Target,
      locked: phase === 'upcoming'
    },
    { 
      id: 'roster', 
      label: 'Roster', 
      icon: Star,
      locked: phase === 'upcoming' || phase === 'voting'
    },
    { 
      id: 'rising-stars', 
      label: 'Rising Stars', 
      icon: Zap,
      locked: !allStar?.risingStarsAnnounced && currentDate < dates.risingStars
    },
    { 
      id: 'celebrity', 
      label: 'Celebrity Game', 
      icon: Users,
      locked: !allStar?.celebrityRoster,
      hidden: !state.leagueStats.celebrityGameEnabled
    },
    { 
      id: 'dunk', 
      label: 'Dunk Contest', 
      icon: Zap,
      locked: !allStar?.dunkContestAnnounced && currentDate < dates.saturday
    },
    {
      id: 'three-point',
      label: '3-Point Contest',
      icon: Target,
      locked: !allStar?.threePointAnnounced && currentDate < dates.saturday
    },
    {
      id: 'throne',
      label: 'The Throne',
      icon: Crown,
      hidden: !state.leagueStats.allStarThroneEnabled,
      locked: currentDate < (dates as any).throneSignupOpens,
    },
  ];

  const handleDunkComplete = (simResult: any) => {
    if (!simResult || !allStar) return;
    const dunkContestants = (allStar?.dunkContestContestants ?? []);

    // Build name→internalId map (only needed for winnerId)
    const nameToId = new Map<string, string>();
    dunkContestants.forEach((c: any) => {
      const player = state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c;
      if (player?.name) nameToId.set(player.name, c.internalId || c.playerId);
    });

    const winnerId = nameToId.get(simResult.winnerName) ?? simResult.winnerId;

    // Keep round1/round2 AS-IS (name-keyed) — DunkContestView matches by playerName
    const result = {
      contestants: dunkContestants.map((c: any) => {
        const pid = c.internalId || c.playerId;
        const player = state.players.find((p: any) => p.internalId === pid);
        const playerName = player?.name || c.name || '';
        const r1 = simResult.round1?.find((r: any) => r.playerName === playerName);
        const r2 = simResult.round2?.find((r: any) => r.playerName === playerName);
        return {
          playerId: pid,
          playerName,
          round1Score: r1?.totalScore ?? 0,
          round2Score: r2?.totalScore ?? null,
          isWinner: winnerId === pid,
          dunkTypes: [...(r1?.dunks?.map((d: any) => d.move) ?? []), ...(r2?.dunks?.map((d: any) => d.move) ?? [])],
        };
      }),
      winnerId,
      winnerName: simResult.winnerName,
      mvpDunk: simResult.mvpDunk,
      round1: simResult.round1,
      round2: simResult.round2,
      log: simResult.log,
      complete: true,
    };
    dispatchAction({ type: 'SAVE_CONTEST_RESULT', payload: { contest: 'dunk', result } });
  };

  const handleThreeComplete = (simResult: any) => {
    const threeContestants = (allStar?.threePointContestants ?? []);
    const winnerPlayer = state.players.find((p: any) => p.internalId === simResult.winnerId);
    const winnerName = winnerPlayer?.name || simResult.winnerName || '';
    const result = {
      contestants: threeContestants.map((c: any) => {
        const pid = c.internalId || c.playerId;
        const player = state.players.find((p: any) => p.internalId === pid);
        const r1 = simResult.round1?.find((r: any) => r.playerId === pid);
        const fin = simResult.finals?.find((r: any) => r.playerId === pid);
        return {
          playerId: pid,
          playerName: player?.name || c.name || '',
          round1Score: r1?.totalScore ?? 0,
          finalScore: fin?.totalScore ?? null,
          isWinner: simResult.winnerId === pid,
        };
      }),
      winnerId: simResult.winnerId,
      winnerName,
      log: simResult.log,
      complete: true,
    };
    dispatchAction({ type: 'SAVE_CONTEST_RESULT', payload: { contest: 'three', result } });
  };

  if (showingHistory) {
    return (
      <div className="h-full flex flex-col bg-slate-950 text-slate-200">
        <AllStarHistoryView onClose={() => setShowingHistory(false)} />
      </div>
    );
  }

  if (viewingPlayer) {
    return (
      <div className="h-full flex flex-col bg-slate-950 text-slate-200">
        <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />
      </div>
    );
  }

  // Host for current season — prefer leagueStats.allStarHosts, fall back to the
  // history gist (covers real seasons that haven't been seeded into leagueStats).
  const currentHost = (state.leagueStats?.allStarHosts ?? []).find((h: any) => h.year === state.leagueStats.year);
  const gistHistory = getCachedAllStarHistory();
  const gistEntry = gistHistory?.find(h => h.year === state.leagueStats.year);
  void historyVersion; // re-read gist after fetch
  const hostCity = currentHost?.city ?? gistEntry?.host_city ?? 'TBD';

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">

      {/* Header */}
      <div className="p-6 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <img
                src="https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748"
                className="w-6 h-6 object-contain"
                alt="East"
              />
              <img
                src="https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726"
                className="w-6 h-6 object-contain"
                alt="West"
              />
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">
              All-Star Weekend
            </h2>
            {phase === 'voting' && (
              <span className="text-xs font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                VOTING LIVE
              </span>
            )}
            {phase === 'complete' && (
              <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                COMPLETE
              </span>
            )}
          </div>
          <button
            onClick={() => setShowingHistory(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <History size={14} />
            History
          </button>
        </div>
        <p className="text-slate-400 text-sm">
          {dateStr} · {hostCity}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-slate-800 shrink-0 overflow-x-auto">
        {tabs.filter(t => !t.hidden).map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.locked && setActiveTab(tab.id)}
            disabled={tab.locked}
            className={`
              px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5
              ${activeTab === tab.id 
                ? 'bg-indigo-600 text-white' 
                : tab.locked 
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }
            `}
          >
            <tab.icon size={11} />
            {tab.label}
            {tab.locked && (
              <span className="text-slate-700">
                🔒
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && (
          <AllStarOverview 
            phase={phase} 
            allStar={allStar}
            onNavigate={(tab) => setActiveTab(tab as any)}
            onWatchDunkContest={() => setWatchingDunkContest(true)}
            year={state.leagueStats.year}
          />
        )}
        {activeTab === 'votes' && (
          <AllStarVotes allStar={allStar} ownTid={ownTid} />
        )}
        {activeTab === 'roster' && (
          <AllStarRoster
            allStar={allStar}
            state={state}
            ownTid={ownTid}
            onWatchGame={handleWatchGame}
            onViewBoxScore={setSelectedBoxScoreGame}
            onPlayerClick={setViewingPlayer}
          />
        )}
        {activeTab === 'rising-stars' && (
          <RisingStarsView
            allStar={allStar}
            ownTid={ownTid}
            onWatchGame={handleWatchGame}
            onViewBoxScore={setSelectedBoxScoreGame}
          />
        )}
        {activeTab === 'celebrity' && (
          <CelebrityGameView
            allStar={allStar}
            state={state}
            ownTid={ownTid}
            onWatchGame={handleWatchGame}
            onViewBoxScore={setSelectedBoxScoreGame}
          />
        )}
        {activeTab === 'dunk' && (
          <DunkContestView
            allStar={allStar}
            players={state.players}
            ownTid={ownTid}
          />
        )}
        {activeTab === 'three-point' && (
          <ThreePointView allStar={allStar} players={state.players} ownTid={ownTid} />
        )}
        {activeTab === 'throne' && (
          <ThroneContestView allStar={allStar} players={state.players} ownTid={ownTid} />
        )}
      </div>

      <AnimatePresence>
        {pendingWatchGame && (
          <WatchGamePreviewModal
            game={pendingWatchGame}
            homeTeam={getTeamForGame(pendingWatchGame.homeTid)}
            awayTeam={getTeamForGame(pendingWatchGame.awayTid)}
            players={state.players}
            homeStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, true, state.allStar, state.players)}
            awayStartersOverride={getPlayersForExhibitionTeam(pendingWatchGame, false, state.allStar, state.players)}
            onClose={() => setPendingWatchGame(null)}
            onConfirm={() => {
              setWatchingGame(pendingWatchGame);
              setPendingWatchGame(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedBoxScoreGame && (
          <BoxScoreModal
            game={selectedBoxScoreGame}
            result={state.boxScores.find((b: any) => b.gameId === selectedBoxScoreGame.gid || (b.homeTeamId === selectedBoxScoreGame.homeTid && b.awayTeamId === selectedBoxScoreGame.awayTid))}
            homeTeam={(() => {
              const baseTeam = getTeamForGame(selectedBoxScoreGame.homeTid) || state.teams.find(t => t.id === selectedBoxScoreGame.homeTid)!;
              const result = state.boxScores.find((b: any) => b.gameId === selectedBoxScoreGame.gid || (b.homeTeamId === selectedBoxScoreGame.homeTid && b.awayTeamId === selectedBoxScoreGame.awayTid));
              
              // Handle All-Star Game Logos
              let logoUrl = baseTeam?.logoUrl;
              if (selectedBoxScoreGame.homeTid === -1) logoUrl = ALL_STAR_ASSETS.eastLogo;
              if (selectedBoxScoreGame.homeTid === -2) logoUrl = ALL_STAR_ASSETS.westLogo;
              if (selectedBoxScoreGame.homeTid === -3 || selectedBoxScoreGame.homeTid === -4) logoUrl = ALL_STAR_ASSETS.risingStarsLogo;
              if (selectedBoxScoreGame.homeTid === -5 || selectedBoxScoreGame.homeTid === -6) logoUrl = ALL_STAR_ASSETS.celebrityLogo;

              if (result?.homeTeamName) {
                return { ...baseTeam, name: result.homeTeamName, abbrev: result.homeTeamName.split(' ').pop()?.substring(0, 3).toUpperCase() || baseTeam.abbrev, logoUrl };
              }
              return { ...baseTeam, logoUrl };
            })()}
            awayTeam={(() => {
              const baseTeam = getTeamForGame(selectedBoxScoreGame.awayTid) || state.teams.find(t => t.id === selectedBoxScoreGame.awayTid)!;
              const result = state.boxScores.find((b: any) => b.gameId === selectedBoxScoreGame.gid || (b.homeTeamId === selectedBoxScoreGame.homeTid && b.awayTeamId === selectedBoxScoreGame.awayTid));
              
              // Handle All-Star Game Logos
              let logoUrl = baseTeam?.logoUrl;
              if (selectedBoxScoreGame.awayTid === -1) logoUrl = ALL_STAR_ASSETS.eastLogo;
              if (selectedBoxScoreGame.awayTid === -2) logoUrl = ALL_STAR_ASSETS.westLogo;
              if (selectedBoxScoreGame.awayTid === -3 || selectedBoxScoreGame.awayTid === -4) logoUrl = ALL_STAR_ASSETS.risingStarsLogo;
              if (selectedBoxScoreGame.awayTid === -5 || selectedBoxScoreGame.awayTid === -6) logoUrl = ALL_STAR_ASSETS.celebrityLogo;

              if (result?.awayTeamName) {
                return { ...baseTeam, name: result.awayTeamName, abbrev: result.awayTeamName.split(' ').pop()?.substring(0, 3).toUpperCase() || baseTeam.abbrev, logoUrl };
              }
              return { ...baseTeam, logoUrl };
            })()}
            players={state.players}
            onClose={() => setSelectedBoxScoreGame(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {watchingDunkContest && !allStar?.dunkContest?.complete && (() => {
          const dunkPlayers = (allStar?.dunkContestContestants ?? [])
            .map((c: any) => state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c)
            .filter(Boolean);
          return (
            <div className="fixed inset-0 z-[100] bg-black">
              <DunkContest
                contestants={dunkPlayers}
                onClose={() => setWatchingDunkContest(false)}
                onComplete={handleDunkComplete}
              />
            </div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {watchingThreePoint && !allStar?.threePointContest?.complete && (() => {
          const threeContestants = (allStar?.threePointContestants ?? []).map((c: any) => {
            const player = state.players.find((p: any) => p.internalId === (c.internalId || c.playerId)) || c;
            const team = state.teams.find((t: any) => t.id === player.tid);
            return mapPlayerToContestant(player, team?.abbrev ?? 'NBA');
          });
          return (
            <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
              <ThreePointContest
                contestants={threeContestants}
                onClose={() => setWatchingThreePoint(false)}
                onComplete={handleThreeComplete}
              />
            </div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {watchingGame && (
          <div className="fixed inset-0 z-[100] bg-black">
            <GameSimulatorScreen
              game={watchingGame}
              teams={state.teams}
              players={state.players}
              allStar={state.allStar}
              isProcessing={state.isProcessing}
              onClose={() => setWatchingGame(null)}
              onComplete={executeWatchGame}
              otherGamesToday={otherGamesToday}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
