import { CheckCircle2, Trophy } from 'lucide-react';

interface HallOfFameEndorsementSubmittedModalProps {
  onDone: () => void;
  playerName: string;
}

interface HallOfFameEndorsementConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
  playerName: string;
}

export function HallOfFameEndorsementConfirmModal({
  onCancel,
  onConfirm,
  playerName,
}: HallOfFameEndorsementConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/85 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-amber-400/40 bg-[#120f07] shadow-2xl shadow-amber-500/10 sm:rounded-3xl">
        <div className="border-b border-amber-400/20 bg-gradient-to-br from-amber-400/20 via-amber-500/5 to-transparent px-6 py-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/15 text-amber-300">
            <Trophy size={30} />
          </div>
          <div className="mt-5 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">
            Hall of Fame
          </div>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
            Endorse {playerName}?
          </h2>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-sm leading-relaxed text-amber-50/75">
            Submit your formal endorsement for this retired player.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={onCancel}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300/50 bg-amber-400 px-4 text-xs font-black uppercase tracking-[0.18em] text-amber-950 transition-colors hover:bg-amber-300"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HallOfFameEndorsementSubmittedModal({
  onDone,
  playerName,
}: HallOfFameEndorsementSubmittedModalProps) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-400/40 bg-[#120f07] shadow-2xl shadow-amber-500/10">
        <div className="border-b border-amber-400/20 bg-gradient-to-br from-amber-400/20 via-amber-500/5 to-transparent px-6 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/50 bg-amber-400/15 text-amber-300">
            <Trophy size={30} />
          </div>
          <div className="mt-5 text-[10px] font-black uppercase tracking-[0.35em] text-amber-300">
            Endorsement Submitted
          </div>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
            Hall of Fame
          </h2>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-sm leading-relaxed text-amber-50/75">
            Your Hall of Fame endorsement for <span className="font-black text-amber-200">{playerName}</span> has been formally submitted.
          </p>
          <button
            onClick={onDone}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/50 bg-amber-400 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-amber-950 transition-colors hover:bg-amber-300"
          >
            <CheckCircle2 size={17} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
