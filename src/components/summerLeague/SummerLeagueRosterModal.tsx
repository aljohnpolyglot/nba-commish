import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Edit2, Plus, Search, X, Zap } from 'lucide-react';
import type { NBAPlayer } from '../../types';
import type { SummerLeagueTournamentState } from '../../services/summerLeague/types';
import { getSummerLeagueExperience } from '../../services/summerLeague/roster';
import { useGame } from '../../store/GameContext';
import { computeAge } from '../../utils/helpers';
import { getPlayerImage } from '../../utils/playerImage';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { isTwoWayContract } from '../../utils/contractTypes';
import {
  getScoutedDisplayOverall,
  getScoutedDisplayPotential,
} from '../../utils/scoutingFuzz';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import {
  getSummerLeaguePortraitCandidates,
  resolveSummerLeaguePlayerTeamIdentity,
} from './utils';

interface SummerLeagueRosterModalProps {
  tournament: SummerLeagueTournamentState;
  players: readonly NBAPlayer[];
  onClose: () => void;
  onDraftChange: (draft: NonNullable<SummerLeagueTournamentState['rosterReviewDraft']>) => void;
  onFinalize: (playerIds: string[]) => void;
  onPlayerSelect: (player: NBAPlayer) => void;
}

const PlayerTeamBadge = ({ identity }: {
  identity: ReturnType<typeof resolveSummerLeaguePlayerTeamIdentity>;
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  return <span
    className={`absolute -bottom-1 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-sm ${identity.isUnaffiliated ? 'bg-slate-200 text-[8px] font-black text-slate-600' : 'bg-white'}`}
    title={identity.isUnaffiliated ? 'Free agent' : identity.abbrev}
  >
    {identity.logoUrl && !imageFailed
      ? <img src={identity.logoUrl} alt="" className="h-5 w-5 object-contain" onError={() => setImageFailed(true)} />
      : identity.abbrev}
  </span>
  ;
};

export default function SummerLeagueRosterModal({
  tournament,
  players,
  onClose,
  onDraftChange,
  onFinalize,
  onPlayerSelect,
}: SummerLeagueRosterModalProps) {
  const { state } = useGame();
  const team = tournament.teams.find(candidate => candidate.sourceTid === tournament.userTeamId);
  const initialIds = useMemo(() => {
    const allowed = new Set(team?.availablePlayerIds ?? []);
    const persisted = tournament.rosterReviewDraft?.selectedPlayerIds;
    return (persisted ?? [...(team?.players ?? []), ...(team?.reserves ?? [])]
      .map(player => player.savePlayerId ?? player.id))
      .filter(id => allowed.has(id));
  }, [team, tournament.rosterReviewDraft?.selectedPlayerIds]);
  const [reviewDraft, setReviewDraft] = useState<NonNullable<SummerLeagueTournamentState['rosterReviewDraft']>>(() => ({
    selectedPlayerIds: initialIds,
    searchQuery: tournament.rosterReviewDraft?.searchQuery ?? '',
    editingPlayerId: tournament.rosterReviewDraft?.editingPlayerId ?? null,
  }));
  const selectedIds = reviewDraft.selectedPlayerIds;
  const editingPlayerId = reviewDraft.editingPlayerId;
  const searchQuery = reviewDraft.searchQuery;

  useEffect(() => {
    onDraftChange(reviewDraft);
  }, [reviewDraft]);

  const eligible = useMemo(() => {
    const allowed = new Set(team?.availablePlayerIds ?? []);
    return players
      .filter(player => allowed.has(player.internalId))
      .sort((left, right) => (
        Number(right.overallRating ?? 0) - Number(left.overallRating ?? 0)
        || left.name.localeCompare(right.name)
      ));
  }, [players, team]);
  const byId = useMemo(() => new Map(eligible.map(player => [player.internalId, player])), [eligible]);
  const selectedPlayers = selectedIds.flatMap(id => {
    const player = byId.get(id);
    return player ? [player] : [];
  });
  const starters = selectedPlayers.slice(0, 5);
  const bench = selectedPlayers.slice(5);
  const visibleAlternatives = eligible.filter(player => (
    !selectedIds.includes(player.internalId)
    && player.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  ));
  const canFinalize = selectedIds.length >= 8 && selectedIds.length <= 15;

  const portrait = (player: NBAPlayer) =>
    getSummerLeaguePortraitCandidates(player.name, getPlayerImage(player, { portraitSeason: tournament.year }));
  const teamIdentity = (player: NBAPlayer) => resolveSummerLeaguePlayerTeamIdentity(
    player,
    state.teams,
    state.nonNBATeams ?? [],
    tournament.year,
  );
  const rating = (player: NBAPlayer) => ({
    ovr: getScoutedDisplayOverall(state, player, tournament.year),
    pot: getScoutedDisplayPotential(state, player, tournament.year, tournament.year),
  });
  const playerStatus = (player: NBAPlayer): string => {
    if (isTwoWayContract(player, state.leagueStats)) return 'Two-Way';
    const experience = getSummerLeagueExperience(player, tournament.year);
    if (experience === 0) return 'Rookie';
    if (experience === 1) return 'Sophomore';
    return player.status || 'Eligible';
  };
  const chooseReplacement = (replacementId: string) => {
    setReviewDraft(current => ({
      selectedPlayerIds: current.editingPlayerId === 'add'
        ? current.selectedPlayerIds.length < 15
          ? [...current.selectedPlayerIds, replacementId]
          : current.selectedPlayerIds
        : current.editingPlayerId
          ? current.selectedPlayerIds.map(id => id === current.editingPlayerId ? replacementId : id)
          : current.selectedPlayerIds,
      editingPlayerId: null,
      searchQuery: '',
    }));
  };

  if (!team) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={event => event.stopPropagation()}
          className="relative my-8 flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-xl"
          style={{ maxHeight: 'calc(100vh - 4rem)' }}
        >
          <div className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white p-6 md:px-10">
            <div className="mb-1 flex w-full items-center justify-between">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-slate-900 md:text-3xl">
                <img
                  src="https://upload.wikimedia.org/wikipedia/en/2/27/NBA_Summer_League_logo.png"
                  alt="NBA Summer League"
                  className="h-8 w-8 object-contain md:h-10 md:w-10"
                />
                Finalize Summer League Roster
              </h2>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100">
                <X className="h-6 w-6" />
              </button>
            </div>
            <p className="text-sm text-slate-500 md:text-base">
              Review your selections before you simulate the Summer League tournament.
            </p>
          </div>

          <div className="flex-1 space-y-10 overflow-y-auto p-4 md:p-10">
            <section>
              <div className="mb-6 flex items-center gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Starting Five</h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600">{starters.length} / 5</span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {starters.map(player => {
                  const display = rating(player);
                  return (
                    <div
                      key={player.internalId}
                      className="group relative flex cursor-pointer flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-lg md:p-6"
                      onClick={() => onPlayerSelect(player)}
                    >
                      <div className="relative mb-4"><PlayerPortrait imgUrl={portrait(player).primary} fallbackImgUrl={portrait(player).fallback} face={player.face} playerName={player.name} playerIdentity={player} portraitSeason={tournament.year} size={72} /><PlayerTeamBadge identity={teamIdentity(player)} /></div>
                      <div className="mb-2 w-full truncate text-center text-sm font-bold leading-tight text-slate-900 md:text-base">{player.name}</div>
                      <div className="mb-2 truncate text-xs text-slate-500">{normalizePositionLabel(player.pos, player.hgt)} | {playerStatus(player)}</div>
                      <div className="mb-4 text-[10px] text-slate-500 md:text-xs">Age {computeAge(player, tournament.year)}</div>
                      <div className="flex w-full items-center justify-between px-2 md:px-4">
                        <div className="flex flex-col items-center">
                          <span className="mb-1 text-[10px] font-bold tracking-wider text-slate-400">OVR</span>
                          <span className="text-lg font-bold text-slate-900 md:text-xl">{display.ovr}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="mb-1 text-[10px] font-bold tracking-wider text-slate-400">POT</span>
                          <span className="text-lg font-bold text-emerald-500 md:text-xl">{display.pot}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setReviewDraft(current => ({ ...current, editingPlayerId: player.internalId }));
                        }}
                        className="absolute right-2 top-2 rounded-lg bg-blue-50 p-2 text-blue-600 opacity-100 transition-opacity hover:bg-blue-100 md:opacity-0 md:group-hover:opacity-100"
                        aria-label={`Replace ${player.name}`}
                      >
                        <Edit2 className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-6 flex items-center gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Bench</h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600">{bench.length} / 10</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {bench.map(player => {
                  const display = rating(player);
                  return (
                    <div
                      key={player.internalId}
                      className="group relative flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-lg"
                      onClick={() => onPlayerSelect(player)}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="relative shrink-0"><PlayerPortrait imgUrl={portrait(player).primary} fallbackImgUrl={portrait(player).fallback} face={player.face} playerName={player.name} playerIdentity={player} portraitSeason={tournament.year} size={52} /><PlayerTeamBadge identity={teamIdentity(player)} /></div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900 md:text-base">{player.name}</div>
                          <div className="truncate text-xs font-medium text-blue-600">{normalizePositionLabel(player.pos, player.hgt)} | {playerStatus(player)}</div>
                          <div className="text-xs text-slate-500">Age {computeAge(player, tournament.year)}</div>
                        </div>
                      </div>
                      <div className="mr-8 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">OVR</span><span className="text-sm font-bold text-slate-900">{display.ovr}</span></div>
                        <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">POT</span><span className="text-sm font-bold text-emerald-500">{display.pot}</span></div>
                      </div>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setReviewDraft(current => ({ ...current, editingPlayerId: player.internalId }));
                        }}
                        className="absolute right-2 top-2 rounded-lg bg-blue-50 p-2 text-blue-600 opacity-100 transition-opacity hover:bg-blue-100 md:opacity-0 md:group-hover:opacity-100"
                        aria-label={`Replace ${player.name}`}
                      >
                        <Edit2 className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                    </div>
                  );
                })}
                {selectedIds.length < 15 && (
                  <button
                    type="button"
                    onClick={() => setReviewDraft(current => ({ ...current, editingPlayerId: 'add' }))}
                    className="flex min-h-[104px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Plus className="h-6 w-6" /></span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Add Player</span>
                  </button>
                )}
              </div>
            </section>
          </div>

          <div className="flex shrink-0 flex-col items-center justify-between gap-4 rounded-b-2xl border-t border-slate-200 bg-white p-4 md:flex-row md:p-6">
            <div className="flex w-full flex-1 items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 md:w-auto md:p-4 md:text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-700">i</span>
              Choose 8 to 15 players before finalizing the roster.
            </div>
            <button
              type="button"
              disabled={!canFinalize}
              onClick={() => onFinalize(selectedIds)}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-auto"
            >
              <Zap className="h-4 w-4" />
              Finalize & Sim Tourney
            </button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {editingPlayerId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onClick={() => setReviewDraft(current => ({ ...current, editingPlayerId: null }))}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={event => event.stopPropagation()}
              className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ maxHeight: '80vh' }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
                <h3 className="font-bold text-slate-800">Select Replacement</h3>
                <button type="button" onClick={() => setReviewDraft(current => ({ ...current, editingPlayerId: null }))} className="p-1 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
              <div className="border-b border-slate-100 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search available players..."
                    value={searchQuery}
                    onChange={event => setReviewDraft(current => ({ ...current, searchQuery: event.target.value }))}
                    className="w-full rounded-xl border-transparent bg-slate-100 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {visibleAlternatives.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">No players found matching your search.</div>
                ) : visibleAlternatives.map(player => {
                  const display = rating(player);
                  return (
                    <button
                      key={player.internalId}
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl p-3 text-left transition-colors hover:bg-slate-50"
                      onClick={() => chooseReplacement(player.internalId)}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0"><PlayerPortrait imgUrl={portrait(player).primary} fallbackImgUrl={portrait(player).fallback} face={player.face} playerName={player.name} playerIdentity={player} portraitSeason={tournament.year} size={40} /><PlayerTeamBadge identity={teamIdentity(player)} /></div>
                        <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{player.name}</div><div className="text-xs text-slate-500">{normalizePositionLabel(player.pos)} · Age {computeAge(player, tournament.year)}</div></div>
                      </div>
                      <div className="flex gap-4 text-right">
                        <div><div className="text-[10px] font-bold text-slate-400">OVR</div><div className="text-sm font-bold text-slate-700">{display.ovr}</div></div>
                        <div><div className="text-[10px] font-bold text-slate-400">POT</div><div className="text-sm font-bold text-emerald-600">{display.pot}</div></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
