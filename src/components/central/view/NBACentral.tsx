import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import StandingsTable from '../StandingsTable';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import { PlayerActionsModal } from './PlayerActionsModal';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import type { NBAPlayer, Contact, Game, ResolvedGamePresentation } from '../../../types';
import { TeamDetailView } from './TeamDetailView';
import { normalizeDate, getSeasonPhase } from '../../../utils/helpers';
import { GameSimulator } from '../../../services/simulation/GameSimulator';
import { PlayerService } from '../../../services/data/PlayerService';
import { TeamService } from '../../../services/data/TeamService';
import { DailyGamesBar } from './DailyGamesBar';
import { ConfirmationModal } from '../../modals/ConfirmationModal';
import { NBACentralHeader } from './NBACentralHeader';
import { useRosterComplianceGate } from '../../../hooks/useRosterComplianceGate';
import { useDraftEventGate } from '../../../hooks/useDraftEventGate';
import { GameSimulatorScreen } from '../../shared/GameSimulatorScreen';
import { WatchGamePreviewModal } from '../../modals/WatchGamePreviewModal';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { PBA_COMPETITIONS } from '../../../data/templates/philippines/competitions';
import { isExternalLeaguePlayer } from '../../../utils/playerLeagueScope';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { selectCountedPbaRegularBoxScores } from '../../../services/pba/competitionGames';
import { didHomeTeamWin } from '../../../utils/gameOutcome';
import { findBoxScoreForScheduledGame } from '../../../utils/boxScoreLookup';
import { syncNbaTeamRecordsFromSchedule } from '../../../utils/nbaOfficialRecords';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { getLeagueConferenceGroups } from '../../../utils/leagueStructure';
import { formatGameDateShort, parseGameDate } from '../../../utils/dateUtils';
import { formatLeagueSeasonLabel, getLeagueScheduleReleaseDate } from '../../../services/leagueCalendar';

export const NBACentral: React.FC = () => {
  const { state, dispatchAction, selectedTeamId, setSelectedTeamId, healPlayer, navigateToPlayer } = useGame();
  const labels = useLeagueLabels();
  const rosterGate = useRosterComplianceGate();
  const draftGate = useDraftEventGate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayerForActions, setSelectedPlayerForActions] = useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [selectedPlayerContact, setSelectedPlayerContact] = useState<Contact | null>(null);
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'movie' | 'give_money' | 'sabotage' | 'waive' | 'club' | 'endorse_hof' | 'fire'>('general');
  const personSelectorTitle = '';

  const quick = usePlayerQuickActions();

  const [gameToWatch, setGameToWatch] = useState<Game | null>(null);
  const [pendingGameToWatch, setPendingGameToWatch] = useState<Game | null>(null);
  const [selectedBoxScoreGame, setSelectedBoxScoreGame] = useState<Game | null>(null);
  const [riggedForTid, setRiggedForTid] = useState<number | undefined>(undefined);
  const [precomputedResult, setPrecomputedResult] = useState<any | null>(null);
  const [watchPresentation, setWatchPresentation] = useState<ResolvedGamePresentation | null>(null);
  const pbaMode = state.leagueStats?.uiMode === 'pba_isolated';

  const pbaSpec = useMemo(() => {
    const current = (state.leagueStats as any)?.pbaConference;
    if (current === 'commissioners') return PBA_COMPETITIONS[1];
    if (current === 'governors') return PBA_COMPETITIONS[2];
    return PBA_COMPETITIONS[0];
  }, [state.leagueStats]);

  const pbaRecords = useMemo(() => {
    if (!pbaMode) return new Map<number, { wins: number; losses: number }>();
    const records = new Map<number, { wins: number; losses: number }>();
    for (const team of state.nonNBATeams ?? []) {
      if ((team as any).league === 'PBA') {
        records.set((team as any).tid, { wins: 0, losses: 0 });
      }
    }
    const season = (state.leagueStats as any)?.year ?? new Date().getFullYear();
    for (const box of selectCountedPbaRegularBoxScores(state.boxScores ?? [], pbaSpec, Number(season))) {
      const homeTid = (box as any).homeTeamId;
      const awayTid = (box as any).awayTeamId;
      const home = records.get(homeTid) ?? { wins: 0, losses: 0 };
      const away = records.get(awayTid) ?? { wins: 0, losses: 0 };
      const homeWon = didHomeTeamWin(box as any);
      home.wins += homeWon ? 1 : 0;
      home.losses += homeWon ? 0 : 1;
      away.wins += homeWon ? 0 : 1;
      away.losses += homeWon ? 1 : 0;
      records.set(homeTid, home);
      records.set(awayTid, away);
    }
    return records;
  }, [pbaMode, state.nonNBATeams, state.boxScores, state.leagueStats, pbaSpec.id]);

  const centralTeams = useMemo(() => {
    if (!pbaMode) {
      if (state.leagueStats?.uiMode === 'euro_isolated') return state.teams;
      return syncNbaTeamRecordsFromSchedule(
        state.teams,
        state.schedule,
        state.leagueStats?.year ?? new Date().getFullYear(),
        state.leagueStats?.gamesPerSeason ?? 82,
      );
    }
    return (state.nonNBATeams ?? [])
      .filter((team: any) => team.league === 'PBA')
      .map((team: any) => {
        const wrapped = resolveAnyTeam(team.tid, state.teams, state.nonNBATeams ?? []);
        const record = pbaRecords.get(team.tid) ?? { wins: Number(team.wins ?? team.won ?? 0), losses: Number(team.losses ?? team.lost ?? 0) };
        return {
          ...(wrapped ?? {}),
          id: team.tid,
          name: team.name,
          region: team.region,
          abbrev: team.abbrev || String(team.name ?? 'PBA').slice(0, 3).toUpperCase(),
          logoUrl: getResolvedTeamLogoUrl({ ...team, logoUrl: wrapped?.logoUrl }),
          wins: record.wins,
          losses: record.losses,
          conference: 'PBA',
          strength: (wrapped as any)?.strength ?? 50,
          colors: team.colors ?? (wrapped as any)?.colors,
          tycoon: team.tycoon ?? (wrapped as any)?.tycoon,
        };
      }) as any;
  }, [pbaMode, state.teams, state.nonNBATeams, state.schedule, state.leagueStats?.gamesPerSeason, state.leagueStats?.uiMode, state.leagueStats?.year, pbaRecords]);

  const centralPlayers = useMemo(() => {
    if (!pbaMode) return state.leagueType === 'fictional'
      ? state.players.filter(player => !isExternalLeaguePlayer(player))
      : state.players;
    return state.players.filter(player => player.tid >= 2000 && player.tid < 2100);
  }, [pbaMode, state.leagueType, state.players]);

  const playerService = useMemo(() => new PlayerService(centralPlayers), [centralPlayers]);
  const teamService = useMemo(() => new TeamService(centralTeams), [centralTeams]);

  const filteredTeams = useMemo(() => {
    const teams = searchTerm ? teamService.searchTeams(searchTerm) : teamService.getAllTeams();
    return teams.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.name.localeCompare(b.name);
    });
  }, [teamService, searchTerm]);

  const conferenceGroups = useMemo(
    () => getLeagueConferenceGroups(filteredTeams, state.leagueStats),
    [filteredTeams, state.leagueStats],
  );

  const selectedTeam = selectedTeamId !== null
    ? resolveAnyTeam(selectedTeamId, state.teams, state.nonNBATeams ?? []) ?? undefined
    : undefined;
  const seasonPhase = useMemo(() => getSeasonPhase(state), [state.schedule, state.date, state.teams, state.leagueStats]);
  const centralPhase = useMemo(() => {
    if (!pbaMode) return seasonPhase;
    const phase = (state.leagueStats as any)?.pbaConferencePhase;
    if (phase === 'playoffs') return 'playoffs';
    if (phase === 'offseason' || phase === 'complete') return 'offseason';
    return 'regular';
  }, [pbaMode, seasonPhase, state.leagueStats]);
  const scheduleSeason = state.leagueStats?.year ?? new Date().getFullYear();
  const scheduleReleaseDate = useMemo(
    () => getLeagueScheduleReleaseDate(scheduleSeason, state.leagueStats),
    [scheduleSeason, state.leagueStats],
  );
  const scheduleReleaseLabel = formatGameDateShort(scheduleReleaseDate);
  const scheduleSeasonLabel = formatLeagueSeasonLabel(scheduleSeason, state.leagueStats);
  const isScheduleRevealed = pbaMode || parseGameDate(state.date).getTime() >= scheduleReleaseDate.getTime();

  const todayGames = useMemo(() => {
    if (!isScheduleRevealed) return [];
    const normalizedCurrent = normalizeDate(state.date);
    if (!pbaMode) return state.schedule.filter(g =>
      normalizeDate(g.date) === normalizedCurrent
      && !g.played
      && !g.isExhibition
    );
    const teamIds = new Set(centralTeams.map(team => team.id));
    return state.schedule.filter(g =>
      normalizeDate(g.date) === normalizedCurrent &&
      !g.played &&
      (g.competitionId === pbaSpec.id || (teamIds.has(g.homeTid) && teamIds.has(g.awayTid)))
    );
  }, [state.schedule, state.date, isScheduleRevealed, pbaMode, centralTeams, pbaSpec.id]);

  const resolveCentralTeam = (tid: number) => {
    return centralTeams.find(team => team.id === tid)
      ?? resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? [])
      ?? undefined;
  };

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

  const getContactFromPlayer = (player: NBAPlayer): Contact => {
    const playerTeam = player.tid >= 0
      ? resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? [])
      : null;
    
    let org = 'Free Agent';
    if (player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect') {
      org = 'Draft Prospect';
    } else if (playerTeam) {
      org = playerTeam.name;
    } else if (['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) {
      org = player.status!;
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

  const handleActionSelect = (actionType: string) => {
    if (!selectedPlayerForActions) return;

    if (actionType === 'view_bio') {
      navigateToPlayer(selectedPlayerForActions);
      setSelectedPlayerForActions(null);
      return;
    }

    if (actionType === 'view_ratings') {
      setViewingRatingsPlayer(selectedPlayerForActions);
      setSelectedPlayerForActions(null);
      return;
    }
    if (quick.handle(selectedPlayerForActions, actionType)) {
      setSelectedPlayerForActions(null);
      return;
    }

    const contact = getContactFromPlayer(selectedPlayerForActions);
    setSelectedPlayerForActions(null);
    setPersonSelectorType(actionType as typeof personSelectorType);
    setSelectedPlayerContact(contact);
    setPersonSelectorOpen(true);
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
      if (personSelectorType === 'give_money') actionType = 'GIVE_MONEY';
      if (personSelectorType === 'sabotage') actionType = 'SABOTAGE_PLAYER';
      if (personSelectorType === 'waive') actionType = 'WAIVE_PLAYER';

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
      {quick.fullPageView ? (
        quick.fullPageView
      ) : selectedTeam ? (
        <TeamDetailView
          team={selectedTeam}
          players={state.players}
          allTeams={pbaMode ? centralTeams : [
            ...state.teams,
                ...(state.nonNBATeams ?? []).map((t: any) => ({
              id: t.tid, name: t.name, abbrev: t.abbrev,
              logoUrl: getResolvedTeamLogoUrl(t), wins: 0, losses: 0, conference: t.league,
            } as any)),
          ]}
          schedule={state.schedule}
          currentDate={state.date}
          onBack={() => setSelectedTeamId(null)}
          onContact={quick.openFor}
          onViewBio={navigateToPlayer}
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
        <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-300 overflow-hidden rounded-xl sm:rounded-[2.5rem] border border-slate-800 shadow-2xl animate-in fade-in duration-500">
          <NBACentralHeader 
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            title={labels.central}
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
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">The {scheduleSeasonLabel} season schedule will be revealed on {scheduleReleaseLabel}.</p>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <span className="text-[10px] font-black text-indigo-400/50 uppercase tracking-[0.2em]">Official League Announcement</span>
                    </div>
                  </div>
                )}
          <DailyGamesBar
              games={todayGames}
              teams={pbaMode ? centralTeams : [
                ...state.teams,
                ...(state.nonNBATeams ?? []).map((t: any) => ({
                  id: t.tid, name: t.name, abbrev: t.abbrev,
                  logoUrl: getResolvedTeamLogoUrl(t), wins: 0, losses: 0, conference: t.league,
                } as any)),
              ]}
              onWatch={handleWatchGame}
              onTeamClick={setSelectedTeamId}
          />
                {pbaMode ? (
                  <div className="grid grid-cols-1 gap-4 md:gap-10">
                    <StandingsTable
                      teams={filteredTeams}
                      conference={pbaSpec.shortName || 'PBA'}
                      onSelectTeam={setSelectedTeamId}
                      selectedTeamId={selectedTeamId}
                      phase={centralPhase}
                    />
                  </div>
                ) : (
                  <div className={`grid grid-cols-1 gap-4 md:gap-10 ${conferenceGroups.length > 1 ? 'lg:grid-cols-2' : ''}`}>
                    {conferenceGroups.map(group => (
                      <StandingsTable
                        key={group.key}
                        teams={group.teams}
                        conference={group.name}
                        onSelectTeam={setSelectedTeamId}
                        selectedTeamId={selectedTeamId}
                        phase={centralPhase}
                      />
                    ))}
                  </div>
                )}
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
          onHeal={() => healPlayer(selectedPlayerForActions.internalId)}
        />
      )}

      {quick.portals}

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
          showInviteMorePrompt={personSelectorType === 'dinner' || personSelectorType === 'movie'}
        />
      )}

      <AnimatePresence>
        {gameToWatch && watchPresentation && (() => {
          const norm = normalizeDate(state.date);
          const otherGamesToday = state.schedule.filter(g =>
            normalizeDate(g.date) === norm && !g.played && g.gid !== gameToWatch.gid
          ).length;
          return (
            <GameSimulatorScreen
                game={gameToWatch}
                presentation={watchPresentation}
                players={state.players}
                isProcessing={state.isProcessing}
                onClose={() => {
                    // Day already advanced in onConfirm before this screen opened — just close.
                    setGameToWatch(null); setRiggedForTid(undefined); setPrecomputedResult(null); setWatchPresentation(null);
                }}
                onComplete={() => {
                    setGameToWatch(null); setRiggedForTid(undefined); setPrecomputedResult(null); setWatchPresentation(null);
                }}
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
              homeTeam={resolveCentralTeam(pendingGameToWatch.homeTid)!}
              awayTeam={resolveCentralTeam(pendingGameToWatch.awayTid)!}
              players={state.players}
              onConfirm={async (rig, watchLive) => {
                  if (watchLive === false) {
                      // Just simulate — dispatch ADVANCE_DAY with riggedForTid
                      setPendingGameToWatch(null);
                      rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
                          type: 'ADVANCE_DAY' as any,
                          payload: { riggedForTid: rig }
                      })));
                  } else {
                      // Mirror ScheduleView: pre-sim + RECORD + ADVANCE_DAY before opening viewer.
                      // "Leave Game" is then a pure close — no re-simulation on exit.
                      const game = pendingGameToWatch;
                      const prepared = GameSimulator.prepareDayGames(
                          state.teams,
                          state.players,
                          [game],
                          game.date,
                          state.stats.playerApproval,
                          state.allStar,
                          undefined,
                          undefined,
                          rig,
                          state.leagueStats,
                      );
                      const preResult = GameSimulator.simulatePreparedDayGames(prepared)[0];
                      const presentation = prepared[0]?.presentation;
                      if (!preResult || !presentation) throw new Error(`Unable to prepare watched game ${game.gid}`);
                      await dispatchAction({ type: 'RECORD_WATCHED_GAME' as any, payload: { gameId: game.gid, result: preResult } });
                      rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
                          type: 'ADVANCE_DAY' as any,
                          payload: { watchedGameResult: preResult, isWatchingGame: true, ...(rig !== undefined ? { riggedForTid: rig } : {}) }
                      })));
                      setPrecomputedResult(preResult);
                      setWatchPresentation(presentation);
                      setRiggedForTid(rig);
                      setGameToWatch(game);
                      setPendingGameToWatch(null);
                  }
              }}
              onClose={() => setPendingGameToWatch(null)}
          />
      )}

      {selectedBoxScoreGame && (() => {
          // For intl preseason games the away/home team may be a nonNBA team (tid >= 100).
          // Fall back to a minimal team stub so BoxScoreModal never crashes on .name.
          const resolveTeam = (tid: number) => {
              if (tid < 0) {
                const exhibNames: Record<number, { name: string; abbrev: string; logoUrl: string }> = {
                  [-1]: { name: 'Eastern All-Stars', abbrev: 'EST', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Eastern_Conference_%28NBA%29_logo.svg/200px-Eastern_Conference_%28NBA%29_logo.svg.png' },
                  [-2]: { name: 'Western All-Stars', abbrev: 'WST', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Western_Conference_%28NBA%29_logo.svg/200px-Western_Conference_%28NBA%29_logo.svg.png' },
                  [-3]: { name: state.allStar?.risingStarsTeams?.[0] ?? 'Rising Stars', abbrev: 'RS1', logoUrl: '' },
                  [-4]: { name: state.allStar?.risingStarsTeams?.[1] ?? 'Rising Stars', abbrev: 'RS2', logoUrl: '' },
                  [-5]: { name: state.allStar?.celebrityTeams?.[0] ?? 'Team Spotlight', abbrev: 'CEL', logoUrl: '' },
                  [-6]: { name: state.allStar?.celebrityTeams?.[1] ?? 'Team Prime', abbrev: 'CEL', logoUrl: '' },
                };
                const info = exhibNames[tid] ?? { name: 'Exhibition', abbrev: 'EXH', logoUrl: '' };
                return { id: tid, name: info.name, abbrev: info.abbrev, logoUrl: info.logoUrl, conference: 'All-Star', wins: 0, losses: 0 } as any;
              }
              const nba = state.teams.find(t => t.id === tid);
              if (nba) return nba;
              const nonNBA = (state.nonNBATeams ?? []).find((t: any) => t.tid === tid);
              if (nonNBA) return {
                id: tid,
                name: nonNBA.name ?? nonNBA.league ?? 'International',
                region: nonNBA.region,
                abbrev: nonNBA.abbrev ?? (nonNBA.name ?? 'INT').slice(0, 3).toUpperCase(),
                logoUrl: getResolvedTeamLogoUrl(nonNBA),
                conference: nonNBA.league ?? 'International',
                colors: nonNBA.colors,
              } as any;
              return { id: tid, name: 'Unknown', abbrev: 'UNK', logoUrl: '', conference: 'East' } as any;
          };
          const bsHome = resolveTeam(selectedBoxScoreGame.homeTid);
          const bsAway = resolveTeam(selectedBoxScoreGame.awayTid);
          return (
          <BoxScoreModal
              game={selectedBoxScoreGame}
              result={findBoxScoreForScheduledGame(state.boxScores, selectedBoxScoreGame)}
              homeTeam={bsHome}
              awayTeam={bsAway}
              players={state.players}
              onClose={() => setSelectedBoxScoreGame(null)}
              onPlayerClick={(player) => {
                setSelectedBoxScoreGame(null);
                navigateToPlayer(player);
              }}
              onTeamClick={(teamId) => {
                setSelectedTeamId(teamId);
                setSelectedBoxScoreGame(null);
              }}
              playoffs={state.playoffs}
              schedule={state.schedule}
          />
          );
      })()}

      {viewingRatingsPlayer && (
        <PlayerRatingsModal
          player={viewingRatingsPlayer}
          season={state.leagueStats?.year ?? new Date().getFullYear()}
          onClose={() => setViewingRatingsPlayer(null)}
        />
      )}
      {rosterGate.modal}
      {draftGate.modal}
    </>
  );
};
