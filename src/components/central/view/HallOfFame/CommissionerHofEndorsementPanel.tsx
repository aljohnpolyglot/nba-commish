import { useEffect, useMemo, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';
import {
  getCommissionerTaskViews,
} from '../../../../services/commissionerTasks/taskRegistry';
import {
  getCommissionerHofCandidates,
  resolveCommissionerTask,
} from '../../../../services/commissionerTasks/taskResolution';
import { PlayerPortrait } from '../../../shared/PlayerPortrait';
import { getPlayerImage } from '../../../../utils/playerImage';
import { getResolvedTeamLogoUrl } from '../../../../utils/teamAssets';

export function CommissionerHofEndorsementPanel() {
  const { state, dispatchAction } = useGame();
  const task = getCommissionerTaskViews(state)
    .find(candidate => candidate.taskId === 'hof_endorsement' && candidate.status === 'in_progress');
  const candidates = useMemo(() => getCommissionerHofCandidates(state), [state.leagueStats.year, state.players]);
  const inductionYear = state.leagueStats.year - 1;
  const [selected, setSelected] = useState<Set<string>>(() => {
    const scheduled = candidates
      .filter(candidate => candidate.player.scheduledHofInductionYear === inductionYear)
      .map(candidate => candidate.player.internalId);
    return new Set(scheduled.length > 0
      ? scheduled
      : candidates.slice(0, 5).map(candidate => candidate.player.internalId));
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    const scheduled = candidates
      .filter(candidate => candidate.player.scheduledHofInductionYear === inductionYear)
      .map(candidate => candidate.player.internalId);
    setSelected(new Set(scheduled.length > 0
      ? scheduled
      : candidates.slice(0, 5).map(candidate => candidate.player.internalId)));
  }, [task?.key]);

  if (!task) return null;

  const toggle = (playerId: string) => {
    setSelected(current => {
      const next = new Set(current);
      next.has(playerId) ? next.delete(playerId) : next.add(playerId);
      return next;
    });
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const candidateIds = new Set(candidates.map(candidate => candidate.player.internalId));
      const players = state.players.map(player => {
        if (selected.has(player.internalId)) {
          return { ...player, scheduledHofInductionYear: inductionYear };
        }
        if (candidateIds.has(player.internalId) && player.scheduledHofInductionYear === inductionYear) {
          return { ...player, scheduledHofInductionYear: undefined };
        }
        return player;
      });
      const endorsedPlayers = [...new Set([...(state.endorsedPlayers ?? []), ...selected])];
      const nextState = { ...state, players, endorsedPlayers };
      const patch = await resolveCommissionerTask(nextState, 'hof_endorsement', {
        mode: 'manual',
        resolution: {
          endorsedPlayerIds: [...selected],
          inductionYear,
        },
      });
      await dispatchAction({
        type: 'UPDATE_STATE',
        payload: { players, endorsedPlayers, ...patch },
      } as any);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto mt-5 w-[calc(100%-2rem)] max-w-7xl rounded-2xl border border-regal-gold/35 bg-zinc-950/95 p-4 shadow-2xl sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-regal-gold">Commissioner Task</p>
          <h2 className="mt-1 font-display text-2xl font-black text-regal-paper">Endorse the Class of {inductionYear}</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Review every eligible retired player. Your selections are scheduled for this year&apos;s ceremony.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="rounded-xl bg-regal-gold px-5 py-3 text-xs font-black uppercase tracking-widest text-regal-black disabled:opacity-40"
        >
          {busy ? 'Recording…' : selected.size > 0 ? `Endorse ${selected.size}` : 'Record Empty Ballot'}
        </button>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-center text-sm text-zinc-400">
          No retired player is eligible for the Class of {inductionYear}.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map(candidate => {
            const chosen = selected.has(candidate.player.internalId);
            const team = state.teams.find(entry => entry.id === candidate.player.tid);
            return (
              <button
                type="button"
                key={candidate.player.internalId}
                onClick={() => toggle(candidate.player.internalId)}
                className={`relative flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                  chosen
                    ? 'border-regal-gold bg-regal-gold/10'
                    : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                }`}
              >
                <PlayerPortrait
                  imgUrl={getPlayerImage(candidate.player)}
                  face={candidate.player.face}
                  playerName={candidate.player.name}
                  teamLogoUrl={team ? getResolvedTeamLogoUrl(team, state.leagueStats.year) : undefined}
                  overallRating={candidate.player.overallRating}
                  size={58}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-regal-paper">{candidate.player.name}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {candidate.tierLabel} · Eligible {candidate.eligibleYear}
                  </p>
                  <p className="mt-1 text-xs text-regal-gold">{candidate.careerWS.toFixed(1)} career win shares</p>
                </div>
                {chosen && (
                  <span className="absolute right-2 top-2 rounded-full bg-regal-gold p-1 text-regal-black">
                    <Check size={11} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
        <Trophy size={14} className="text-regal-gold" />
        Induction year is fixed to the current ceremony class.
      </div>
    </section>
  );
}
