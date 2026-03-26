import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import StandingsTable from '../StandingsTable';
import ContactModal from '../../ContactModal';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import { PlayerActionsModal } from './PlayerActionsModal';
import { PlayerBioView } from './PlayerBioView';
import type { NBAPlayer, Contact, Game } from '../../../types';
import { TeamDetailView } from './TeamDetailView';
import { normalizeDate } from '../../../utils/helpers';
import { GameSimulator } from '../../../services/simulation/GameSimulator';
import { GameResult } from '../../../services/simulation/StatGenerator';
import { PlayerService } from '../../../services/data/PlayerService';
import { TeamService } from '../../../services/data/TeamService';
import { DailyGamesBar } from './DailyGamesBar';
import { ConfirmationModal } from '../../modals/ConfirmationModal';
import { NBACentralHeader } from './NBACentralHeader';
import { GameSimulatorScreen } from '../../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../../modals/WatchGamePreviewModal';
import { BoxScoreModal } from '../../modals/BoxScoreModal';

export const NBACentral: React.FC = () => {
  const { state, dispatchAction, selectedTeamId, setSelectedTeamId } = useGame();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals State
  const [selectedPlayerForActions, setSelectedPlayerForActions] = useState<NBAPlayer | null>(null);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [selectedPlayerContact, setSelectedPlayerContact] = useState<Contact | null>(null);
  
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'bribe' | 'movie' | 'leak_scandal' | 'give_money' | 'sabotage'>('general');
  const personSelectorTitle = '';

  // Game Watch State
  const [gameToWatch, setGameToWatch] = useState<Game | null>(null);
  const [pendingGameToWatch, setPendingGameToWatch] = useState<Game | null>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedResult, setPrecomputedResult] = useState<GameResult | null>(null);

  const playerService = useMemo(() => new PlayerService(state.players), [state.players]);
  const teamService = useMemo(() => new TeamService(state.teams), [state.teams]);

  const filteredTeams = useMemo(() => {
    const teams = searchTerm ? teamService.searchTeams(searchTerm) : teamService.getAllTeams();
    return teams.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.name.localeCompare(b.name);
    });
  }, [teamService, searchTerm]);

  const eastTeams = filteredTeams.filter(t => t.conference === 'East');
  const westTeams = filteredTeams.filter(t => t.conference === 'West');

  const selectedTeam = selectedTeamId !== null ? teamService.getTeamById(selectedTeamId) : undefined;
  
  const isScheduleRevealed = useMemo(() => {
    const date = new Date(state.date);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    // Season opener is Oct 24. Revealed 3 days before (Oct 21).
    if (month === 10) return day >= 21;
    if (month > 10 || month < 7) return true;
    return false;
  }, [state.date]);

  const todayGames = useMemo(() => {
    if (!isScheduleRevealed) return [];
    const normalizedCurrent = normalizeDate(state.date);
    return state.schedule.filter(g => normalizeDate(g.date) === normalizedCurrent && !g.played);
  }, [state.schedule, state.date, isScheduleRevealed]);

  const handleWatchGame = (game: Game) => {
      if (game.played) {
          setSelectedBoxScoreGame(game);
      } else {
          const isToday = normalizeDate(game.date) === normalizeDate(state.date);
          if (isToday) {
              setPendingGameToWatch(game);
          } else {
              // Ignore clicks on future games
              console.log("Cannot watch future games.");
          }
      }
  };

  const executeWatchGame = async (result: GameResult) => {
      if (!gameToWatch) return;
      const gameId = gameToWatch.gid;
      const currentRig = riggedForTid;
      setGameToWatch(null);
      setRiggedForTid(undefined);
      setPrecomputedResult(null);

      // Save the live game result immediately (no LLM, marks game as played)
      await dispatchAction({
          type: 'RECORD_WATCHED_GAME' as any,
          payload: { gameId, result }
      });

      // Advance the day (LLM generates story; watched game is already marked played so won't re-simulate)
      await dispatchAction({
          type: 'ADVANCE_DAY',
          payload: {
              ...(currentRig !== undefined ? { riggedForTid: currentRig } : {}),
              watchedGameResult: result
          }
      } as any);
  };

  const getContactFromPlayer = (player: NBAPlayer): Contact => {
    const isNBA = !['WNBA', 'Euroleague', 'PBA'].includes(player.status || '');
    const playerTeam = isNBA ? state.teams.find(t => t.id === player.tid) : null;
    const nonNBATeam = !isNBA ? state.nonNBATeams.find(t => t.tid === player.tid && t.league === player.status) : null;
    
    let org = 'Free Agent';
    if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
      org = 'Draft Prospect';
    } else if (playerTeam) {
      org = playerTeam.name;
    } else if (nonNBATeam) {
      org = nonNBATeam.name;
    } else if (player.status === 'WNBA') {
      org = 'WNBA';
    } else if (player.status === 'Euroleague') {
      org = 'Euroleague';
    } else if (player.status === 'PBA') {
      org = 'PBA';
    }

    return {
      id: player.internalId,
      name: player.name,
      title: 'Star Player',
      organization: org,
      type: 'player',
      playerPortraitUrl: player.imgURL
    };
  };

  const handleActionSelect = (actionType: 'view_bio' | 'contact' | 'bribe' | 'fine' | 'dinner' | 'movie' | 'suspension' | 'sabotage') => {
    if (!selectedPlayerForActions) return;
    
    if (actionType === 'view_bio') {
      setViewingBioPlayer(selectedPlayerForActions);
      setSelectedPlayerForActions(null);
      return;
    }

    const contact = getContactFromPlayer(selectedPlayerForActions);
    setSelectedPlayerForActions(null); // Close actions modal

    if (actionType === 'contact') {
      setSelectedPlayerContact(contact);
    } else {
      setPersonSelectorType(actionType);
      setSelectedPlayerContact(contact); // Temporarily store to pass as preSelected
      setPersonSelectorOpen(true);
    }
  };

  const handleSendMessage = async (params: { message: string }) => {
    if (selectedPlayerContact) {
      const chat = state.chats.find(c => c.participants.includes(selectedPlayerContact.id));
      await dispatchAction({
        type: 'SEND_CHAT_MESSAGE',
        payload: {
          chatId: chat?.id,
          text: params.message,
          targetId: selectedPlayerContact.id,
          targetName: selectedPlayerContact.name,
          targetRole: selectedPlayerContact.title,
          targetOrg: (selectedPlayerContact as any).teamId || 'Unknown',
          avatarUrl: selectedPlayerContact.playerPortraitUrl
        }
      });
      setSelectedPlayerContact(null);
    }
  };

  const handlePersonSelected = async (contacts: Contact[], reason?: string, amount?: number, location?: string, duration?: string) => {
      setPersonSelectorOpen(false);
      setSelectedPlayerContact(null);
      
      let actionType = '';
      if (personSelectorType === 'suspension') actionType = 'SUSPEND_PLAYER';
      if (personSelectorType === 'drug_test') actionType = 'DRUG_TEST_PERSON';
      if (personSelectorType === 'dinner') actionType = 'INVITE_DINNER';
      if (personSelectorType === 'movie') actionType = 'INVITE_DINNER'; // Reuse INVITE_DINNER for now
      if (personSelectorType === 'fine') actionType = 'FINE_PERSON';
      if (personSelectorType === 'bribe') actionType = 'BRIBE_PERSON';
      if (personSelectorType === 'leak_scandal') actionType = 'LEAK_SCANDAL';
      if (personSelectorType === 'give_money') actionType = 'GIVE_MONEY';
      if (personSelectorType === 'sabotage') actionType = 'SABOTAGE_PLAYER';

      const targetNames = contacts.map(c => c.name).join(', ');
      const targetRoles = contacts.map(c => c.title).join(', ');
      const targetIds = contacts.map(c => c.id).join(',');

      let finalReason = reason || (personSelectorType === 'movie' ? "Movie Night" : "No reason provided.");
      if (location) {
          finalReason += ` at ${location}`;
      }

      await dispatchAction({
          type: actionType as any,
          payload: {
              targetName: targetNames,
              targetRole: targetRoles,
              targetId: targetIds,
              reason: finalReason,
              amount: amount,
              duration: duration,
              count: contacts.length,
              subType: personSelectorType,
              location: location,
              contacts: contacts
          }
      });
  };

  return (
    <>
      {viewingBioPlayer ? (
        <PlayerBioView
          player={viewingBioPlayer}
          onBack={() => setViewingBioPlayer(null)}
          onGameClick={handleWatchGame}
          onTeamClick={(teamId) => { setViewingBioPlayer(null); setSelectedTeamId(teamId); }}
        />
      ) : selectedTeam ? (
        <TeamDetailView 
          team={selectedTeam}
          players={state.players}
          allTeams={state.teams}
          schedule={state.schedule}
          currentDate={state.date}
          onBack={() => setSelectedTeamId(null)}
          onContact={setSelectedPlayerForActions}
          onViewBio={setViewingBioPlayer}
          onGameClick={handleWatchGame}
          onTeamClick={setSelectedTeamId}
          onVisit={async (team) => {
            // Find game on current date
            const normalizedCurrent = normalizeDate(state.date);
            const gameToday = state.schedule.find(g =>
                (g.homeTid === team.id || g.awayTid === team.id) &&
                !g.played &&
                normalizeDate(g.date) === normalizedCurrent
            );

            if (gameToday) {
              handleWatchGame(gameToday);
              return;
            }

            const getCityFromTeamName = (name: string) => {
                const multiWordCities = ['New York', 'Los Angeles', 'San Antonio', 'Golden State', 'Oklahoma City', 'New Orleans'];
                for (const city of multiWordCities) {
                    if (name.startsWith(city)) return city;
                }
                return name.split(' ')[0];
            };

            await dispatchAction({
              type: 'TRAVEL',
              payload: {
                city: getCityFromTeamName(team.name),
                reason: 'organizational review',
                invitees: [],
                inviteeRoles: [],
                gameId: undefined
              }
            });
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-300 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl animate-in fade-in duration-500">
          <NBACentralHeader 
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />

          <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
            {!state.isDataLoaded ? (
              <div className="flex flex-col items-center justify-center h-full gap-8">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-xl font-black text-white uppercase tracking-tight">Syncing League Data</p>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-2">Establishing Secure Connection...</p>
                </div>
              </div>
            ) : (
              <>
                {!isScheduleRevealed && (
                  <div className="mb-8 p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between animate-in slide-in-from-top duration-500">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Calendar size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">Schedule Reveal Pending</h4>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">The 2025-26 Season Schedule will be revealed on Oct 21.</p>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <span className="text-[10px] font-black text-indigo-400/50 uppercase tracking-[0.2em]">Official League Announcement</span>
                    </div>
                  </div>
                )}
          <DailyGamesBar 
              games={todayGames} 
              teams={state.teams} 
              onWatch={handleWatchGame} 
              onTeamClick={setSelectedTeamId}
          />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <StandingsTable 
                    teams={eastTeams} 
                    conference="East" 
                    onSelectTeam={setSelectedTeamId}
                    selectedTeamId={selectedTeamId}
                  />
                  <StandingsTable 
                    teams={westTeams} 
                    conference="West" 
                    onSelectTeam={setSelectedTeamId}
                    selectedTeamId={selectedTeamId}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedPlayerForActions && (
        <PlayerActionsModal
          player={selectedPlayerForActions}
          onClose={() => setSelectedPlayerForActions(null)}
          onActionSelect={handleActionSelect}
        />
      )}

      {selectedPlayerContact && !personSelectorOpen && (
        <ContactModal 
          contact={selectedPlayerContact}
          onClose={() => {
            setSelectedPlayerContact(null);
          }}
          onSend={handleSendMessage}
          isLoading={state.isProcessing}
        />
      )}

      {personSelectorOpen && (
        <PersonSelectorModal
          title={personSelectorTitle}
          actionType={personSelectorType}
          onClose={() => {
            setPersonSelectorOpen(false);
            setSelectedPlayerContact(null);
          }}
          onSelect={handlePersonSelected}
          preSelectedContact={selectedPlayerContact || undefined}
          skipPersonSelection={!!selectedPlayerContact}
        />
      )}

      <AnimatePresence>
        {gameToWatch && (() => {
          const norm = normalizeDate(state.date);
          const otherGamesToday = state.schedule.filter(g =>
            normalizeDate(g.date) === norm && !g.played && g.gid !== gameToWatch.gid
          ).length;
          return (
            <GameSimulatorScreen
                game={gameToWatch}
                teams={state.teams}
                players={state.players}
                allStar={state.allStar}
                isProcessing={state.isProcessing}
                onClose={async () => {
                    const result = precomputedResult;
                    setGameToWatch(null); setRiggedForTid(undefined); setPrecomputedResult(null);
                    await dispatchAction({ type: 'ADVANCE_DAY', payload: result ? { watchedGameResult: result } : undefined } as any);
                }}
                onComplete={executeWatchGame}
                otherGamesToday={otherGamesToday}
                riggedForTid={riggedForTid}
                precomputedResult={precomputedResult ?? undefined}
            />
          );
        })()}
      </AnimatePresence>

      {pendingGameToWatch && (
          <WatchGamePreviewModal
              game={pendingGameToWatch}
              homeTeam={state.teams.find(t => t.id === pendingGameToWatch.homeTid)!}
              awayTeam={state.teams.find(t => t.id === pendingGameToWatch.awayTid)!}
              players={state.players}
              onConfirm={async (rig, watchLive) => {
                  const gameId = pendingGameToWatch.gid;
                  setRiggedForTid(rig);
                  if (watchLive === false) {
                      // Just simulate — dispatch ADVANCE_DAY with riggedForTid
                      setPendingGameToWatch(null);
                      await dispatchAction({
                          type: 'ADVANCE_DAY' as any,
                          payload: { riggedForTid: rig }
                      });
                  } else {
                      // Watch live — pre-compute rigged result if rigged
                      if (rig !== undefined) {
                          const homeTeam = state.teams.find(t => t.id === pendingGameToWatch.homeTid)!;
                          const awayTeam = state.teams.find(t => t.id === pendingGameToWatch.awayTid)!;
                          const preResult = GameSimulator.simulateGame(
                              homeTeam, awayTeam, state.players,
                              pendingGameToWatch.gid, pendingGameToWatch.date,
                              state.stats.playerApproval,
                              undefined, undefined, undefined, undefined, rig
                          );
                          setPrecomputedResult(preResult);
                      } else {
                          setPrecomputedResult(null);
                      }
                      setGameToWatch(pendingGameToWatch);
                      setPendingGameToWatch(null);
                  }
              }}
              onClose={() => setPendingGameToWatch(null)}
          />
      )}

      {selectedBoxScoreGame && (
          <BoxScoreModal
              game={selectedBoxScoreGame}
              result={state.boxScores.find(b => b.gameId === selectedBoxScoreGame.gid)}
              homeTeam={state.teams.find(t => t.id === selectedBoxScoreGame.homeTid)!}
              awayTeam={state.teams.find(t => t.id === selectedBoxScoreGame.awayTid)!}
              players={state.players}
              onClose={() => setSelectedBoxScoreGame(null)}
              onPlayerClick={(player) => {
                setViewingBioPlayer(player);
                setSelectedBoxScoreGame(null);
              }}
              onTeamClick={(teamId) => {
                setSelectedTeamId(teamId);
                setSelectedBoxScoreGame(null);
              }}
          />
      )}
    </>
  );
};
