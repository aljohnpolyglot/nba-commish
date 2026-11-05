import type { ExpansionTeamSpec, GameState } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

type ExpansionSchedule = NonNullable<GameState['expansionSchedule']>;
type ExpansionDecision = NonNullable<GameState['expansionBidDecisions']>[number];

interface Props {
  schedule: ExpansionSchedule;
  decision: ExpansionDecision;
  busy: boolean;
  onClose: () => void;
  onConfirm: (acceptedTeams: ExpansionTeamSpec[], rejectedTeams: ExpansionTeamSpec[]) => void;
}

export function ExpansionBidAcknowledgement({
  schedule,
  decision,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const isPba = schedule.league === 'pba';
  const acceptedTeams = schedule.teams.filter(team => decision.teamAbbrevs.includes(team.abbrev));
  const rejectedTeams = schedule.teams.filter(team => !decision.teamAbbrevs.includes(team.abbrev));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">
          {isPba ? 'PBA Board' : 'Expansion Committee'}
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">Thank You</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The league has recorded your expansion decision.
        </p>
        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Accepted</p>
            <p className="mt-2 text-sm font-bold text-white">
              {acceptedTeams.length > 0
                ? acceptedTeams.map(team => getTeamFullName(team)).join(', ')
                : 'No applications'}
            </p>
          </div>
          {rejectedTeams.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Declined</p>
              <p className="mt-2 text-sm font-bold text-slate-300">
                {rejectedTeams.map(team => getTeamFullName(team)).join(', ')}
              </p>
            </div>
          )}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-white/[0.05]"
          >
            Review Later
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(acceptedTeams, rejectedTeams)}
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? 'Saving…' : acceptedTeams.length > 0 ? 'Continue to Expansion Draft' : 'Close Bidding'}
          </button>
        </div>
      </div>
    </div>
  );
}
