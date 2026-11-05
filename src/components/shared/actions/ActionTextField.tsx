import { NotebookPen, ShieldCheck } from 'lucide-react';

interface ActionTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  optional?: boolean;
  readOnly?: boolean;
  readOnlyBadge?: string;
  multiline?: boolean;
  minRowsClassName?: string;
  onNotebookClick?: () => void;
  notebookLabel?: string;
}

export function ActionTextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  optional,
  readOnly,
  readOnlyBadge,
  multiline,
  minRowsClassName = 'min-h-32',
  onNotebookClick,
  notebookLabel = 'Open templates',
}: ActionTextFieldProps) {
  const sharedClass = `w-full rounded-2xl border px-5 py-4 pr-12 text-sm leading-relaxed outline-none ${
    readOnly
      ? 'cursor-default border-slate-700 bg-slate-900/45 text-slate-300'
      : 'border-slate-700 bg-slate-950/55 text-white placeholder:text-slate-600 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/15'
  }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          {label}
          {required && <span className="ml-1 text-rose-400">*</span>}
          {optional && <span className="ml-1 text-slate-600">(Optional)</span>}
        </label>
        {readOnly && readOnlyBadge && (
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-300">
            {readOnlyBadge}
          </span>
        )}
      </div>
      <div className="relative">
        {multiline ? (
          <textarea
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`${minRowsClassName} resize-none ${sharedClass}`}
          />
        ) : (
          <input
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            className={sharedClass}
          />
        )}
        {readOnly ? (
          <ShieldCheck className="absolute right-4 top-4 text-cyan-400" size={20} />
        ) : onNotebookClick ? (
          <button
            type="button"
            onClick={onNotebookClick}
            aria-label={notebookLabel}
            title={notebookLabel}
            className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-lg text-violet-300 transition hover:bg-violet-500/15 hover:text-violet-200"
          >
            <NotebookPen size={20} />
          </button>
        ) : (
          <NotebookPen className="absolute right-4 top-4 text-slate-500" size={20} />
        )}
      </div>
    </div>
  );
}
