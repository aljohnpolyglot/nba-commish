import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Gavel, ShieldAlert } from 'lucide-react';
import type { DisciplineInboxAction, DisciplineSanctionType } from '../../types';
import { FineAmountControl } from '../modals/PersonSelector/FineAmountControl';
import { ActionTextField } from '../shared/actions/ActionTextField';
import { DisciplineTemplateModal } from '../modals/PersonSelector/DisciplineTemplateModal';
import { useGame } from '../../store/GameContext';
import { getEraFineStep } from '../../services/disciplinePolicy';
import type { DisciplineTemplateSelection } from '../../services/disciplinePolicy';

interface Props {
  action: DisciplineInboxAction;
  currencyCode: string;
  onResolve: (
    sanction: DisciplineSanctionType,
    amountUSD: number,
    games: number,
    reason: string,
    disciplineTemplate?: DisciplineTemplateSelection,
  ) => void;
}

export function DisciplineInboxPanel({ action, currencyCode, onResolve }: Props) {
  const { state } = useGame();
  const [sanction, setSanction] = useState<DisciplineSanctionType>(
    action.recommendedSanction === 'fine_and_suspension' ? 'suspension' : action.recommendedSanction,
  );
  const [addFine, setAddFine] = useState(action.recommendedSanction === 'fine_and_suspension');
  const [amount, setAmount] = useState(String(action.recommendedAmountUSD));
  const [games, setGames] = useState(Math.max(1, action.recommendedGames));
  const [reason, setReason] = useState(action.reason);
  const [templateKind, setTemplateKind] = useState<'fine' | 'suspension' | null>(null);
  const [disciplineTemplate, setDisciplineTemplate] = useState<DisciplineTemplateSelection>();
  const fineStep = getEraFineStep(state);
  const includesFine = sanction === 'fine' || (sanction === 'suspension' && addFine);
  const includesSuspension = sanction === 'suspension';

  if (action.status === 'resolved') {
    const resolution = action.resolution;
    return (
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={22} className="text-emerald-300" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Case resolved</p>
            <p className="mt-1 text-sm font-black text-white">
              {resolution?.sanction === 'fine'
                ? `$${(resolution.amountUSD ?? 0).toLocaleString()} fine`
                : resolution?.sanction === 'suspension'
                  ? `${resolution.games ?? 0}-game suspension`
                  : resolution?.sanction === 'fine_and_suspension'
                    ? `$${(resolution.amountUSD ?? 0).toLocaleString()} fine and ${resolution.games ?? 0}-game suspension`
                  : resolution?.sanction === 'drug_test'
                    ? 'Mandatory drug test'
                    : 'Formal warning'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-amber-400/15 p-2 text-amber-300"><ShieldAlert size={20} /></div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Commissioner decision required</p>
          <p className="mt-1 text-sm text-slate-400">
            The recommended ruling is selected first. You can still issue any listed sanction.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['warning', 'Warning'],
          ['fine', 'Fine'],
          ['suspension', 'Suspend'],
          ['drug_test', 'Drug Test'],
        ] as Array<[DisciplineSanctionType, string]>).map(([value, label]) => (
          <button
            key={value}
            onClick={() => {
              setSanction(value);
              if (value !== 'suspension') setAddFine(false);
            }}
            className={`rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-wider ${
              sanction === value
                ? 'border-amber-300 bg-amber-300 text-slate-950'
                : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
            }`}
          >
            {label}{
              value === action.recommendedSanction
              || (value === 'suspension' && action.recommendedSanction === 'fine_and_suspension')
                ? ' · Rec.'
                : ''
            }
          </button>
        ))}
      </div>

      {sanction === 'suspension' && (
        <button
          type="button"
          onClick={() => setAddFine(current => !current)}
          className={`mt-5 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
            addFine
              ? 'border-emerald-400/50 bg-emerald-400/10'
              : 'border-slate-700 bg-slate-950/35'
          }`}
        >
          <span>
            <span className="block text-xs font-black uppercase tracking-wider text-white">Include a fine</span>
            <span className="mt-1 block text-xs text-slate-500">Issue a monetary penalty with the suspension.</span>
          </span>
          <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${addFine ? 'bg-emerald-400' : 'bg-slate-700'}`}>
            <span className={`h-5 w-5 rounded-full bg-white transition ${addFine ? 'translate-x-5' : ''}`} />
          </span>
        </button>
      )}

      {(includesFine || includesSuspension) && (
        <div className="mt-5">
          <ActionTextField
            label="Reason"
            value={reason}
            onChange={value => {
              setReason(value);
              setDisciplineTemplate(undefined);
            }}
            placeholder="Describe the conduct and policy basis..."
            required
            multiline
            minRowsClassName="min-h-28"
            onNotebookClick={() => setTemplateKind(sanction === 'fine' ? 'fine' : 'suspension')}
            notebookLabel={`Open ${sanction === 'fine' ? 'fine' : 'suspension'} templates`}
          />
        </div>
      )}

      {includesFine && (
        <div className="mt-5">
          <FineAmountControl
            amount={amount}
            step={fineStep}
            recommendedAmount={action.recommendedAmountUSD}
            currencyCode={currencyCode}
            onChange={setAmount}
          />
        </div>
      )}

      {includesSuspension && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Suspension length</p>
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Recommended {action.recommendedGames} games</p>
          </div>
          <div className="mt-2 flex h-16 items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4">
            <button onClick={() => setGames(value => Math.max(1, value - 1))} disabled={games <= 1} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ChevronLeft size={18} /></button>
            <div className="text-center">
              <p className="text-2xl font-black text-white">{games}</p>
              <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Games</p>
            </div>
            <button onClick={() => setGames(value => Math.min(Number.MAX_SAFE_INTEGER, value + 1))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><ChevronRight size={18} /></button>
          </div>
        </div>
      )}

      <button
        onClick={() => onResolve(
          sanction === 'suspension' && addFine ? 'fine_and_suspension' : sanction,
          Number(amount) || action.recommendedAmountUSD,
          games,
          reason.trim() || action.reason,
          disciplineTemplate,
        )}
        disabled={(includesFine || includesSuspension) && !reason.trim()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Gavel size={16} /> Issue Ruling
      </button>
      <DisciplineTemplateModal
        open={templateKind !== null}
        kind={templateKind ?? 'fine'}
        onClose={() => setTemplateKind(null)}
        onSelect={selection => {
          setDisciplineTemplate(selection);
          setReason(selection.reason);
          if (selection.amountUSD !== undefined) setAmount(String(selection.amountUSD));
          if (selection.games !== undefined) setGames(selection.games);
        }}
      />
    </div>
  );
}
