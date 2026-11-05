import { useState } from 'react';
import {
  CircleDollarSign,
  Landmark,
  Megaphone,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type { PersonSelectorActionType } from '../personSelectorModalShared';
import type { usePersonSelectorModalModel } from '../usePersonSelectorModalModel';
import { ActionInfoPanel } from '../../shared/actions/ActionInfoPanel';
import { ActionTextField } from '../../shared/actions/ActionTextField';
import { FineAmountControl } from './FineAmountControl';
import { SabotageControls } from './SabotageControls';
import { DisciplineTemplateModal } from './DisciplineTemplateModal';

interface PersonActionDetailsProps {
  actionType: PersonSelectorActionType;
  model: ReturnType<typeof usePersonSelectorModalModel>;
  fundSource?: 'personal' | 'league';
  onFundSourceChange?: (source: 'personal' | 'league') => void;
  disbursementExceedsFunds: boolean;
}

export function PersonActionDetails({
  actionType,
  model,
  fundSource,
  onFundSourceChange,
  disbursementExceedsFunds,
}: PersonActionDetailsProps) {
  const [templateKind, setTemplateKind] = useState<'fine' | 'suspension' | null>(null);

  return (
    <div className="space-y-6">
      {actionType === 'fine' && (
        <>
          <ActionTextField
            label="Reason"
            value={model.reason}
            onChange={value => {
              model.setReason(value);
              model.setDisciplineTemplate(undefined);
            }}
            placeholder="Technical foul, conduct detrimental, late arrival..."
            required
            readOnly={model.isDisciplineReasonLocked}
            readOnlyBadge="From open case"
            onNotebookClick={() => setTemplateKind('fine')}
            notebookLabel="Open fine templates"
          />
          <FineAmountControl
            amount={model.amount}
            step={model.fineAmountStep}
            recommendedAmount={model.recommendedFineAmount}
            currencyCode={model.fineCurrencyCode}
            onChange={model.setAmount}
          />
          <ActionInfoPanel icon={<ShieldCheck size={25} />} title="Impact Summary" accent="violet">
            League fine · Immediate team response · Player morale impact depends on context.
          </ActionInfoPanel>
        </>
      )}

      {actionType === 'drug_test' && (
        <>
          <ActionTextField
            label="Reason / Suspicion"
            value={model.reason}
            onChange={model.setReason}
            placeholder="Erratic behavior, anonymous tip, abnormal recovery pattern..."
            required
            readOnly={model.isDisciplineReasonLocked}
            readOnlyBadge="From open case"
            multiline
            minRowsClassName="min-h-36"
          />
          <ActionInfoPanel icon={<ShieldCheck size={26} />} title="League Notice" accent="violet">
            The player will be notified privately, and all test results will be handled under league confidentiality rules.
          </ActionInfoPanel>
        </>
      )}

      {actionType === 'suspension' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.8fr)_minmax(12rem,1fr)]">
            <ActionTextField
              label="Reason"
              value={model.reason}
              onChange={value => {
                model.setReason(value);
                model.setDisciplineTemplate(undefined);
              }}
              placeholder="Violation of league policy, unsportsmanlike conduct..."
              required
              readOnly={model.isDisciplineReasonLocked}
              readOnlyBadge="From open case"
              onNotebookClick={() => setTemplateKind('suspension')}
              notebookLabel="Open suspension templates"
            />
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                Duration <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={model.duration}
                onChange={event => model.setDuration(event.target.value)}
                placeholder="e.g. 5 games"
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/70"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => model.setIncludeFine(current => !current)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
              model.includeFine
                ? 'border-emerald-400/50 bg-emerald-400/10'
                : 'border-slate-700 bg-slate-950/35'
            }`}
          >
            <span>
              <span className="block text-xs font-black uppercase tracking-wider text-white">Include a fine</span>
              <span className="mt-1 block text-xs text-slate-500">Add a monetary penalty to this suspension.</span>
            </span>
            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${model.includeFine ? 'bg-emerald-400' : 'bg-slate-700'}`}>
              <span className={`h-5 w-5 rounded-full bg-white transition ${model.includeFine ? 'translate-x-5' : ''}`} />
            </span>
          </button>
          {model.includeFine && (
            <FineAmountControl
              amount={model.amount}
              step={model.fineAmountStep}
              recommendedAmount={model.recommendedFineAmount}
              currencyCode={model.fineCurrencyCode}
              onChange={model.setAmount}
            />
          )}
          <ActionInfoPanel icon={<ShieldCheck size={26} />} title="Disciplinary Action" accent="violet">
            <div className="space-y-3">
              <p className="flex items-center gap-2"><Users size={17} className="text-cyan-300" /> The player will be suspended for the selected duration.</p>
              {model.includeFine && (
                <p className="flex items-center gap-2 border-t border-slate-700/70 pt-3"><CircleDollarSign size={17} className="text-emerald-300" /> The selected fine will be issued with the suspension.</p>
              )}
              <p className="flex items-center gap-2 border-t border-slate-700/70 pt-3"><Megaphone size={17} className="text-cyan-300" /> The league office will announce the decision to the player and team.</p>
            </div>
          </ActionInfoPanel>
        </>
      )}

      {actionType === 'sabotage' && (
        <SabotageControls
          injuries={model.sortedInjuries}
          selectedInjuryName={model.selectedInjuryName}
          reason={model.reason}
          duration={model.duration}
          onInjurySelect={model.handleInjurySelect}
          onDurationChange={model.setDuration}
        />
      )}

      {actionType === 'give_money' && (
        <>
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Funding Source</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['league', 'League Funds', 'Use the league treasury.', Landmark],
                ['personal', 'Personal Wealth', 'Use your own funds.', Wallet],
              ] as const).map(([source, label, copy, SourceIcon]) => (
                <button
                  type="button"
                  key={source}
                  onClick={() => onFundSourceChange?.(source)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                    fundSource === source
                      ? 'border-emerald-400/70 bg-emerald-500/[0.07]'
                      : 'border-slate-700 bg-slate-950/25 hover:border-slate-500'
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300"><SourceIcon size={22} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">{label}</span>
                    <span className="block text-xs text-slate-500">{copy}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <ActionTextField
            label="Reason"
            value={model.reason}
            onChange={model.setReason}
            placeholder="Community support, hardship assistance, recognition..."
            required
          />
          <FineAmountControl
            amount={model.amount}
            step={model.fineAmountStep}
            recommendedAmount={model.recommendedFineAmount}
            currencyCode={model.fineCurrencyCode}
            label="Disbursement Amount"
            valueLabel="Funds"
            onChange={model.setAmount}
          />
          {disbursementExceedsFunds && (
            <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">
              The selected source does not have enough available funds for this amount.
            </p>
          )}
          <ActionInfoPanel icon={<CircleDollarSign size={25} />} title="Funds Notice" accent="emerald">
            The selected funding source will be charged when this action is confirmed.
          </ActionInfoPanel>
        </>
      )}

      {actionType === 'hypnotize' && (
        <ActionTextField
          label="Command / Suggestion"
          value={model.reason}
          onChange={model.setReason}
          placeholder="Enter the command..."
          required
          multiline
        />
      )}
      {actionType === 'retire_now' && (
        <ActionInfoPanel icon={<Megaphone size={25} />} title="Retirement Confirmation" accent="amber">
          The coach will leave the team immediately. The position remains open until the club appoints a replacement.
        </ActionInfoPanel>
      )}
      <DisciplineTemplateModal
        open={templateKind !== null}
        kind={templateKind ?? 'fine'}
        onClose={() => setTemplateKind(null)}
        onSelect={selection => {
          model.setDisciplineTemplate(selection);
          model.setReason(selection.reason);
          if (selection.amountUSD !== undefined) model.setAmount(String(selection.amountUSD));
          if (selection.games !== undefined) model.setDuration(String(selection.games));
        }}
      />
    </div>
  );
}
