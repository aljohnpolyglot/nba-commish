import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, NotebookPen, Search, ShieldCheck, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { getLeagueCurrencyCode } from '../../../utils/helpers';
import {
  FINE_TEMPLATE_CATALOG,
  SUSPENSION_TEMPLATE_CATALOG,
  getFineTemplateAmount,
  sampleSuspensionGames,
  type DisciplineTemplateSelection,
  type FineTemplate,
  type SuspensionTemplate,
} from '../../../services/disciplinePolicy';

interface Props {
  open: boolean;
  kind: 'fine' | 'suspension';
  onClose: () => void;
  onSelect: (selection: DisciplineTemplateSelection) => void;
}

const enforcementLabel: Record<FineTemplate['enforcement'], string> = {
  automatic: 'Automatic policy',
  commissioner_discretion: 'Commissioner decision',
  team_discretion: 'Team decision',
};

export function DisciplineTemplateModal({ open, kind, onClose, onSelect }: Props) {
  const { state } = useGame();
  const [search, setSearch] = useState('');
  const fineTemplates = FINE_TEMPLATE_CATALOG.templates;
  const suspensionTemplates = SUSPENSION_TEMPLATE_CATALOG.templates;
  const title = kind === 'fine'
    ? FINE_TEMPLATE_CATALOG.templateModal.title
    : SUSPENSION_TEMPLATE_CATALOG.templateModal.title;
  const description = kind === 'fine'
    ? FINE_TEMPLATE_CATALOG.templateModal.description
    : SUSPENSION_TEMPLATE_CATALOG.templateModal.description;
  const currencyCode = getLeagueCurrencyCode(state.leagueStats);
  const query = search.trim().toLowerCase();
  const filteredFineTemplates = useMemo(() => fineTemplates.filter(template =>
    !query || `${template.name} ${template.reason} ${enforcementLabel[template.enforcement]}`.toLowerCase().includes(query),
  ), [fineTemplates, query]);
  const filteredSuspensionTemplates = useMemo(() => suspensionTemplates.filter(template =>
    !query || `${template.name} ${template.reason}`.toLowerCase().includes(query),
  ), [query, suspensionTemplates]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);

  const chooseFine = (template: FineTemplate) => {
    onSelect({
      templateId: template.id,
      templateName: template.name,
      reason: template.reason,
      amountUSD: getFineTemplateAmount(state, template),
      games: template.minimumSuspensionGames,
    });
    onClose();
  };

  const chooseSuspension = (template: SuspensionTemplate) => {
    onSelect({
      templateId: template.id,
      templateName: template.name,
      reason: template.reason,
      games: sampleSuspensionGames(template),
    });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.65rem] border border-slate-600/60 bg-[linear-gradient(145deg,rgba(13,24,48,0.995),rgba(6,14,33,0.998))] shadow-2xl sm:max-h-[calc(100vh-3rem)]"
      >
        <header className="flex items-start gap-3 border-b border-slate-700/70 px-4 py-5 sm:items-center sm:px-7">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/10 text-violet-300">
            <NotebookPen size={25} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black uppercase tracking-tight text-white sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close templates"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X size={24} />
          </button>
        </header>

        <div className="border-b border-slate-800 px-4 py-4 sm:px-7">
          <label className="relative block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search reasons..."
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/60 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/70"
            />
          </label>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {kind === 'fine'
              ? filteredFineTemplates.map(template => {
                  const amount = getFineTemplateAmount(state, template);
                  return (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => chooseFine(template)}
                      className="flex min-h-40 flex-col rounded-2xl border border-slate-700 bg-slate-950/35 p-4 text-left transition hover:border-violet-400/60 hover:bg-violet-500/[0.06]"
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <span className="font-black text-white">{template.name}</span>
                        <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-cyan-300">
                          {enforcementLabel[template.enforcement]}
                        </span>
                      </div>
                      <span className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">{template.reason}</span>
                      <span className="mt-4 flex items-center gap-2 text-sm font-black text-emerald-300">
                        <Banknote size={16} /> {formatMoney(amount)}
                      </span>
                    </button>
                  );
                })
              : filteredSuspensionTemplates.map(template => (
                  <button
                    type="button"
                    key={template.id}
                    onClick={() => chooseSuspension(template)}
                    className="flex min-h-40 flex-col rounded-2xl border border-slate-700 bg-slate-950/35 p-4 text-left transition hover:border-violet-400/60 hover:bg-violet-500/[0.06]"
                  >
                    <span className="font-black text-white">{template.name}</span>
                    <span className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">{template.reason}</span>
                    <span className="mt-4 flex items-center gap-2 text-sm font-black text-violet-300">
                      <ShieldCheck size={16} /> {template.minGames}–{template.maxGames} games · Typical {template.averageGames}
                    </span>
                  </button>
                ))}
          </div>
          {(kind === 'fine' ? filteredFineTemplates.length : filteredSuspensionTemplates.length) === 0 && (
            <div className="py-16 text-center text-sm text-slate-500">No matching templates.</div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
