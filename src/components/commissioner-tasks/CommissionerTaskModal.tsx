import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, MapPin, Sparkles, X } from 'lucide-react';
import type { CommissionerTaskView, GameState, NBAPlayer, Tab } from '../../types';
import { useGame } from '../../store/GameContext';
import {
  getLeaguePassProjection,
  getRecommendedLeaguePassPrice,
  resolveCommissionerTask,
} from '../../services/commissionerTasks/taskResolution';
import { MediaRightsTaskPanel } from './MediaRightsTaskPanel';
import { ChristmasGamesModal } from '../modals/ChristmasGamesModal';
import { GlobalGamesModal } from '../modals/GlobalGamesModal';
import { PreseasonInternationalModal } from '../modals/PreseasonInternationalModal';
import { InvitePerformanceModal } from '../modals/InvitePerformanceModal';
import { CelebrityRosterModal } from '../modals/CelebrityRosterModal';
import { DunkContestModal } from '../seasonal/modals/DunkContestModal';
import { ThreePointContestModal } from '../seasonal/modals/ThreePointContestModal';
import { getTeamFullName } from '../../utils/teamNames';
import { OtherEventParticipantsModal, type OtherEventId } from './OtherEventParticipantsModal';
import { GovernorsBoardTaskPanel } from './GovernorsBoardTaskPanel';
import { HistoricalCelebrityRosterModal } from './HistoricalCelebrityRosterModal';
import { ExpansionBidCards } from './ExpansionBidCards';
import { getArenaForTeamAtSeason, loadArenas } from '../../utils/arenaData';
import GovernorsBoardMeetingView from '../offseason/views/GovernorsBoardMeetingView';
import RetiredPlayersReviewModal from '../offseason/views/RetiredPlayersReviewView';
import StaffRetirementsReviewModal from '../offseason/views/StaffRetirementsReviewView';
import RefereeRetirementsReviewView from '../offseason/views/RefereeRetirementsReviewView';
import HOFCeremonyModal from '../offseason/views/HOFCeremonyView';
import { AllStarHostTaskFlow } from './AllStarHostTaskFlow';
import { AllStarReplacementModal } from '../seasonal/modals/AllStarReplacementModal';
import { getOutstandingAllStarInjuries } from '../../services/allStar/allStarInjuryReplacements';
import { CommissionerExpansionDraftFlow } from './CommissionerExpansionDraftFlow';
import { ExpansionBidAcknowledgement } from './ExpansionBidAcknowledgement';
import { getCommissionerTaskDisplayTitle } from '../../services/franchises/franchiseEventNaming';
import { buildPerformanceBookingPatch } from '../../services/events/performanceBooking';
import {
  applyPbaOpeningNight,
  getPbaOpeningNightDate,
  getPbaOpeningNightTeams,
} from '../../services/pba/openingNight';

interface Props {
  task: CommissionerTaskView;
  onClose: () => void;
  onNavigate: (view: Tab) => void;
}

const merge = (state: GameState, patch: Partial<GameState>): GameState => ({ ...state, ...patch });

export function CommissionerTaskModal({ task, onClose, onNavigate }: Props) {
  const { state, dispatchAction } = useGame();
  const [busy, setBusy] = useState(false);
  const [leaguePassPrice, setLeaguePassPrice] = useState(() => getRecommendedLeaguePassPrice(state));
  const leaguePassProjection = getLeaguePassProjection(state, leaguePassPrice);
  const [cupHostTid, setCupHostTid] = useState(
    state.leagueStats.nbaCupHosts?.find(host => host.year === state.leagueStats.year)?.teamId
      ?? [...state.teams].sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0))[0]?.id
      ?? -1,
  );
  const [acceptedExpansionAbbrevs, setAcceptedExpansionAbbrevs] = useState<Set<string>>(
    new Set(state.expansionSchedule?.teams.map(team => team.abbrev) ?? []),
  );
  const [arenaDataReady, setArenaDataReady] = useState(false);

  useEffect(() => {
    if (task.taskId !== 'nba_cup_host' && task.taskId !== 'expansion_bidding') return;
    if (task.taskId === 'expansion_bidding' && state.expansionSchedule?.league === 'pba') {
      setArenaDataReady(true);
      return;
    }
    let active = true;
    loadArenas().finally(() => {
      if (active) setArenaDataReady(true);
    });
    return () => {
      active = false;
    };
  }, [state.expansionSchedule?.league, task.taskId]);
  const commit = async (
    base: GameState,
    mode: 'manual' | 'auto',
    resolution?: Record<string, unknown>,
    extra?: { broadcastOffer?: Parameters<typeof resolveCommissionerTask>[2]['broadcastOffer']; leaguePassPrice?: number },
    closeOnSuccess = true,
  ) => {
    const debugAllStarHost = task.taskId === 'all_star_host';
    const inputPatch = Object.fromEntries(
      Object.entries(base).filter(([key, value]) => value !== state[key as keyof GameState]),
    ) as Partial<GameState>;
    if (debugAllStarHost) {
      console.info('[ALLSTAR_HOST] commit-start', {
        mode,
        seasonYear: base.leagueStats.year,
        targetHosts: base.leagueStats.allStarHosts,
        inputPatchKeys: Object.keys(inputPatch),
        resolution,
      });
    }
    setBusy(true);
    try {
      const resolvedPatch = await resolveCommissionerTask(base, task.taskId, {
        mode,
        resolution,
        broadcastOffer: extra?.broadcastOffer,
        leaguePassPrice: extra?.leaguePassPrice,
      });
      const patch = { ...inputPatch, ...resolvedPatch };
      if (debugAllStarHost) {
        console.info('[ALLSTAR_HOST] task-resolved', {
          resolvedHosts: patch.leagueStats?.allStarHosts,
          commissionerTasks: patch.commissionerTasks,
        });
      }
      await dispatchAction({ type: 'UPDATE_STATE', payload: patch } as any);
      if (debugAllStarHost) {
        console.info('[ALLSTAR_HOST] state-dispatched', {
          resolvedHosts: patch.leagueStats?.allStarHosts,
        });
      }
      if (closeOnSuccess) onClose();
    } catch (error) {
      if (debugAllStarHost) {
        console.error('[ALLSTAR_HOST] commit-failed', {
          error,
          targetHosts: base.leagueStats.allStarHosts,
        });
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const completeManual = (patch: Partial<GameState> = {}, resolution?: Record<string, unknown>, closeOnSuccess = true) =>
    commit(merge(state, patch), 'manual', resolution, undefined, closeOnSuccess);
  const expansionSchedule = task.taskId === 'expansion_bidding' ? state.expansionSchedule : undefined;
  const pendingExpansionDecision = expansionSchedule
    ? state.expansionBidDecisions?.[expansionSchedule.year]
    : undefined;

  if (task.taskId === 'expansion_bidding' && expansionSchedule && pendingExpansionDecision && !pendingExpansionDecision.acknowledgedAt) {
    return (
      <ExpansionBidAcknowledgement
        schedule={expansionSchedule}
        decision={pendingExpansionDecision}
        busy={busy}
        onClose={onClose}
        onConfirm={(acceptedTeams, rejectedTeams) => {
          const rejectedAll = acceptedTeams.length === 0;
          const isPbaExpansion = expansionSchedule.league === 'pba';
          const historicalExpansionSkippedSeasons = rejectedAll && !isPbaExpansion
            ? [...new Set([...(state.leagueStats.historicalExpansionSkippedSeasons ?? []), expansionSchedule.year])]
            : state.leagueStats.historicalExpansionSkippedSeasons;
          void completeManual({
            expansionSchedule: rejectedAll
              ? undefined
              : { ...expansionSchedule, teams: acceptedTeams },
            expansionBidDecisions: {
              ...(state.expansionBidDecisions ?? {}),
              [expansionSchedule.year]: {
                ...pendingExpansionDecision,
                acknowledgedAt: state.date,
                league: expansionSchedule.league ?? 'nba',
              },
            },
            leagueStats: {
              ...state.leagueStats,
              historicalExpansionSkippedSeasons,
              auto2029ExpansionSeeded: state.leagueStats.auto2029ExpansionSeeded
                || (!isPbaExpansion && rejectedAll && expansionSchedule.year === 2029),
            },
          }, {
            decision: pendingExpansionDecision.status,
            scheduleYear: expansionSchedule.year,
            acceptedTeamAbbrevs: acceptedTeams.map(team => team.abbrev),
            rejectedTeamAbbrevs: rejectedTeams.map(team => team.abbrev),
          });
        }}
      />
    );
  }

  if (task.taskId === 'media_rights_renewal') {
    return (
      <MediaRightsTaskPanel
        state={state}
        onClose={onClose}
        onConfirm={offer => commit(state, 'manual', undefined, { broadcastOffer: offer })}
      />
    );
  }
  if (task.taskId === 'retired_players') {
    return <RetiredPlayersReviewModal isOpen onClose={onClose} onDone={() => completeManual()} />;
  }
  if (task.taskId === 'staff_retirements') {
    return <StaffRetirementsReviewModal isOpen onClose={onClose} onDone={() => completeManual()} />;
  }
  if (task.taskId === 'referee_retirements') {
    return <RefereeRetirementsReviewView isOpen onClose={onClose} onDone={() => completeManual()} />;
  }
  if (task.taskId === 'hof_ceremony') {
    return <HOFCeremonyModal isOpen onClose={onClose} onDone={() => completeManual()} />;
  }
  if (task.taskId === 'expansion_draft') {
    return <CommissionerExpansionDraftFlow onClose={onClose} />;
  }

  if (task.taskId === 'governors_proposal') {
    return (
      <GovernorsBoardTaskPanel
        state={state}
        busy={busy}
        onClose={onClose}
        onConfirm={paper => {
          const datedPaper = { ...paper, reviewBaseline: state.leagueStats };
          completeManual({ commissionerBoardPaper: datedPaper }, {
            acceptedRuleKeys: datedPaper.proposals.filter(proposal => proposal.accepted).map(proposal => proposal.key),
            vetoedRuleKeys: datedPaper.proposals.filter(proposal => !proposal.accepted).map(proposal => proposal.key),
          });
        }}
      />
    );
  }
  if (task.taskId === 'governors_final') {
    return (
      <GovernorsBoardMeetingView
        isOpen
        onClose={onClose}
        onDone={() => completeManual()}
        actionLabel="Sign & Enact"
      />
    );
  }

  if (task.taskId === 'christmas_games') {
    return <ChristmasGamesModal teams={state.teams} initialGames={state.christmasGames} onClose={onClose} onConfirm={games => completeManual({ christmasGames: games }, { games })} />;
  }
  if (task.taskId === 'global_games') {
    const isPba = state.leagueStats.uiMode === 'pba_isolated';
    const openingNightTeams = isPba ? getPbaOpeningNightTeams(state) : state.teams;
    return (
      <GlobalGamesModal
        teams={openingNightTeams}
        players={state.players}
        seasonYear={state.leagueStats.year}
        leagueStats={state.leagueStats}
        variant={isPba ? 'pba-opening-night' : 'global'}
        fixedDate={isPba ? getPbaOpeningNightDate(state) : undefined}
        initialGames={state.globalGames}
        onClose={onClose}
        onConfirm={games => {
          if (isPba && games[0]) {
            completeManual(applyPbaOpeningNight(state, games[0]), {
              matchup: [games[0].awayTid, games[0].homeTid],
              venue: games[0].venue,
              city: games[0].city,
              date: games[0].date,
            });
            return;
          }
          completeManual({
            globalGames: games,
            leagueStats: {
              ...state.leagueStats,
              hasScheduledGlobalGames: true,
              globalGamesScheduledYear: state.leagueStats.year,
            },
          }, { games });
        }}
      />
    );
  }
  if (task.taskId === 'international_preseason') {
    return (
      <PreseasonInternationalModal
        teams={state.teams}
        nonNBATeams={state.nonNBATeams}
        players={state.players}
        seasonYear={state.leagueStats.year}
        leagueStats={state.leagueStats}
        onClose={onClose}
        onConfirm={games => {
          const nextGid = Math.max(0, ...state.schedule.map(game => game.gid)) + 1;
          const scheduled = games.map((game, index) => ({
            gid: nextGid + index,
            homeTid: game.teamId,
            awayTid: game.opponentId,
            homeScore: 0,
            awayScore: 0,
            played: false,
            date: new Date(game.date).toISOString(),
            isPreseason: true,
            internationalShowcaseName: game.opponentName,
            internationalShowcasePlayerIds: game.showcasePlayerIds,
            city: game.city,
            country: game.country,
          }));
          completeManual({ schedule: [...state.schedule, ...scheduled].sort((left, right) => left.date.localeCompare(right.date)) }, { games });
        }}
      />
    );
  }
  if (task.taskId === 'invite_performance') {
    return (
      <InvitePerformanceModal
        onClose={onClose}
        onConfirm={bookings => {
          const bookingResult = buildPerformanceBookingPatch(state, bookings);
          completeManual(bookingResult.patch, { bookings: bookingResult.scheduledBookings });
        }}
      />
    );
  }
  if (
    task.taskId === 'celebrity_roster'
    && state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && state.leagueStats.year <= 2026
  ) {
    return (
      <HistoricalCelebrityRosterModal
        year={state.leagueStats.year}
        onClose={onClose}
        onConfirm={({ selection, autoSelected }) => {
          const roster = selection?.roster ?? [];
          completeManual({
            allStar: {
              ...(state.allStar as any),
              celebrityRoster: roster,
              celebrityTeams: selection?.teamNames ?? [],
              celebrityTeamDetails: selection?.teamDetails,
              celebrityGameDetails: selection?.gameDetails,
              celebrityAnnounced: false,
            },
            leagueStats: {
              ...state.leagueStats,
              celebrityRoster: roster,
              hasSetCelebrityRoster: true,
              celebrityRosterAutoSelected: autoSelected,
            },
          }, {
            readOnlyHistoricalRoster: autoSelected,
            roster,
            teamNames: selection?.teamNames ?? [],
            customRosterOverride: !autoSelected,
          });
        }}
      />
    );
  }
  if (task.taskId === 'celebrity_roster') {
    return (
      <CelebrityRosterModal
        onClose={onClose}
        confirmLabel="Done"
        onConfirm={roster => {
          const names = roster.map(person => person.name);
          const celebrityRosterProfiles = roster.flatMap(person => person.profile ? [person.profile] : []);
          const celebrityTeams = state.leagueType === 'fictional'
            ? ['Team Spotlight', 'Team Prime']
            : state.allStar?.celebrityTeams;
          completeManual({
            allStar: {
              ...(state.allStar as any),
              celebrityRoster: names,
              celebrityRosterProfiles,
              celebrityTeams,
              celebrityAnnounced: false,
            },
            leagueStats: { ...state.leagueStats, celebrityRoster: names, hasSetCelebrityRoster: true, celebrityRosterAutoSelected: false },
          }, { roster: names });
        }}
      />
    );
  }
  if (task.taskId === 'dunk_participants') {
    return <DunkContestModal onClose={onClose} onConfirm={(contestants: NBAPlayer[]) => completeManual({ allStar: { ...(state.allStar as any), dunkContestContestants: contestants, dunkContestAnnounced: false } }, { playerIds: contestants.map(player => player.internalId) })} />;
  }
  if (task.taskId === 'three_point_participants') {
    return <ThreePointContestModal onClose={onClose} onConfirm={(contestants: NBAPlayer[]) => completeManual({ allStar: { ...(state.allStar as any), threePointContestants: contestants, threePointAnnounced: false } }, { playerIds: contestants.map(player => player.internalId) })} />;
  }
  if (task.taskId === 'all_star_replacements') {
    return (
      <AllStarReplacementModal
        onClose={onClose}
        onConfirm={async (injuredId, injuredName, replacementId, replacementName, conference) => {
          await dispatchAction({
            type: 'ADD_ALL_STAR_REPLACEMENT',
            payload: { injuredId, replacementId, conference },
          } as any);
          if (getOutstandingAllStarInjuries(state).length <= 1) onClose();
        }}
      />
    );
  }
  if (task.taskId === 'all_star_host') {
    return (
      <AllStarHostTaskFlow
        state={state}
        onClose={onClose}
        onCommit={async hosts => {
          console.info('[ALLSTAR_HOST] modal-confirm', {
            seasonYear: state.leagueStats.year,
            hosts,
          });
          await completeManual(
            { leagueStats: { ...state.leagueStats, allStarHosts: hosts } },
            { hosts },
            false,
          );
        }}
      />
    );
  }
  if (['shooting_stars_participants', 'skills_participants', 'horse_participants'].includes(task.taskId)) {
    const event: OtherEventId = task.taskId === 'shooting_stars_participants'
      ? 'shooting'
      : task.taskId === 'skills_participants'
        ? 'skills'
        : 'horse';
    return (
      <OtherEventParticipantsModal
        state={state}
        event={event}
        onClose={onClose}
        onConfirm={contestants => {
          const eventPatch = event === 'shooting'
            ? { shootingStarsContestants: contestants, shootingStarsAnnounced: false }
            : event === 'skills'
              ? { skillsChallengeContestants: contestants, skillsChallengeAnnounced: false }
              : { horseContestants: contestants, horseAnnounced: false };
          completeManual(
            { allStar: { ...(state.allStar as any), ...eventPatch } },
            { playerIds: contestants.map(player => player.internalId) },
          );
        }}
      />
    );
  }

  const workspace = task.definition.workspace as Tab | undefined;
  const isLeaguePass = task.taskId === 'league_pass_price';
  const isExpansion = task.taskId === 'expansion_bidding';
  const isCupHost = task.taskId === 'nba_cup_host';
  const requiresRealWorkflow = task.taskId === 'draft_lottery'
    || task.taskId === 'nba_draft'
    || task.taskId === 'franchise_event_sponsorships';

  const manualComplete = () => {
    if (isLeaguePass) {
      commit(state, 'manual', { monthlyPrice: leaguePassPrice }, { leaguePassPrice });
      return;
    }
    if (isCupHost) {
      const host = state.teams.find(team => team.id === cupHostTid);
      const arena = host ? getArenaForTeamAtSeason(host, state.leagueStats.year) : null;
      const hosts = host ? [
        ...(state.leagueStats.nbaCupHosts ?? []).filter(entry => entry.year !== state.leagueStats.year),
        {
          year: state.leagueStats.year,
          city: arena?.location || host.region || getTeamFullName(host),
          arena: arena?.name,
          teamId: host.id,
        },
      ] : state.leagueStats.nbaCupHosts;
      completeManual(
        { leagueStats: { ...state.leagueStats, nbaCupHosts: hosts } },
        {
          hostTeamId: host?.id,
          hostCity: arena?.location || host?.region,
          hostArena: arena?.name,
          hostTeam: host ? getTeamFullName(host) : undefined,
        },
      );
      return;
    }
    if (isExpansion) {
      const schedule = state.expansionSchedule;
      if (!schedule) {
        completeManual({}, { decision: 'no-active-window' });
        return;
      }
      const acceptedTeams = schedule.teams.filter(team => acceptedExpansionAbbrevs.has(team.abbrev));
      const status = acceptedTeams.length > 0 ? 'accepted' as const : 'rejected' as const;
      setBusy(true);
      void dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
        expansionBidDecisions: {
          ...(state.expansionBidDecisions ?? {}),
          [schedule.year]: {
            status,
            teamAbbrevs: acceptedTeams.map(team => team.abbrev),
            decidedAt: state.date,
            league: schedule.league ?? 'nba',
          },
        },
        },
      } as any).finally(() => setBusy(false));
      return;
    }
    completeManual();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">{task.phase}</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-white">{getCommissionerTaskDisplayTitle(state, task.taskId, task.definition.title)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{task.definition.description}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20} /></button>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          {isLeaguePass && (
            <div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/10 p-5 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">League recommendation</p>
              <div className="mt-4 flex items-center justify-center gap-5">
                <button onClick={() => setLeaguePassPrice(value => Math.max(0, Math.round((value - 0.5) * 100) / 100))} className="rounded-xl border border-white/10 bg-black/20 p-3 text-white hover:bg-white/10"><ChevronLeft /></button>
                <span className="min-w-28 text-3xl font-black tabular-nums text-white">${leaguePassPrice.toFixed(2)}</span>
                <button onClick={() => setLeaguePassPrice(value => Math.min(Number.MAX_SAFE_INTEGER, Math.round((value + 0.5) * 100) / 100))} className="rounded-xl border border-white/10 bg-black/20 p-3 text-white hover:bg-white/10"><ChevronRight /></button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Monthly price</p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Projected subscribers</p>
                  <p className="mt-1 text-lg font-black text-white">{leaguePassProjection.subscribers.toFixed(1)}M</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Projected annual revenue</p>
                  <p className="mt-1 text-lg font-black text-emerald-300">${(leaguePassProjection.annualRevenue * 1_000).toFixed(0)}M</p>
                </div>
              </div>
            </div>
          )}

          {isExpansion && (
            <ExpansionBidCards
              state={state}
              selected={acceptedExpansionAbbrevs}
              onToggle={abbrev => setAcceptedExpansionAbbrevs(current => {
                const next = new Set(current);
                next.has(abbrev) ? next.delete(abbrev) : next.add(abbrev);
                return next;
              })}
              arenaDataReady={arenaDataReady}
            />
          )}

          {isCupHost && (
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500">
              Host team and arena
              <select value={cupHostTid} onChange={event => setCupHostTid(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-sm normal-case text-white">
                {[...state.teams]
                  .sort((left, right) => getTeamFullName(left).localeCompare(getTeamFullName(right)))
                  .map(team => {
                    const arena = arenaDataReady
                      ? getArenaForTeamAtSeason(team, state.leagueStats.year)
                      : null;
                    return (
                      <option key={team.id} value={team.id}>
                        {getTeamFullName(team)} · {arena?.name ?? team.region} · {arena?.location ?? team.region}
                      </option>
                    );
                  })}
              </select>
              <span className="mt-2 block text-[10px] font-medium normal-case text-slate-500">
                The venue is matched to this season automatically.
              </span>
            </label>
          )}

          {workspace && (
            <button onClick={() => { onClose(); onNavigate(workspace); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10">
              <Sparkles size={16} /> Open {task.definition.workspace}
            </button>
          )}

          <div className="grid grid-cols-1 gap-3">
            {!requiresRealWorkflow && (
              <button disabled={busy} onClick={manualComplete} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-emerald-400 disabled:opacity-40">
                {task.taskId === 'nba_cup_host' ? <MapPin size={16} /> : <Check size={16} />}
                {task.taskId === 'expansion_bidding'
                      ? 'Confirm Expansion Decisions'
                    : task.taskId === 'league_pass_price'
                      ? 'Confirm Price'
                      : 'Mark Done'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
