import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface Props {
  title: string;
  body: React.ReactNode;
  /** Optional aria-label for the trigger button. */
  label?: string;
}

/** Small circular (?) icon next to a section title. Click opens a centered
 *  modal with an explanation. Used to surface optional context on FFP, the
 *  ledger formula, sponsorship slots, etc., without auto-popping a tutorial. */
export const HelpIconPopover: React.FC<Props> = ({ title, body, label }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? `Help: ${title}`}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
      >
        <HelpCircle size={12} />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/70 z-[55] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-md w-full p-6 shadow-[0_0_40px_rgba(245,158,11,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-black uppercase tracking-wider text-white">{title}</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X size={16} className="text-slate-500 hover:text-white" /></button>
            </div>
            <div className="text-sm text-slate-300 leading-relaxed space-y-2">{body}</div>
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest py-2 rounded-xl text-xs"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
