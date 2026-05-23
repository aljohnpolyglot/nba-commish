import { ChevronDown } from 'lucide-react';
import type { NBAPlayer } from '../../../../../../types';
import { OUTLOOK_OPTIONS, type OutlookKey, type RotationPreview } from './idealRotationBaseline';

interface IdealRotationReseedModalProps {
  open: boolean;
  benchDepth: number;
  maxPlayerMinutes: number;
  playersById: Map<string, NBAPlayer>;
  reseedDepth: number;
  reseedOutlook: OutlookKey;
  reseedPreview: RotationPreview | null;
  onApply: () => void;
  onClose: () => void;
  onOutlookChange: (value: OutlookKey) => void;
}

export function IdealRotationReseedModal({
  open,
  benchDepth,
  maxPlayerMinutes,
  playersById,
  reseedDepth,
  reseedOutlook,
  reseedPreview,
  onApply,
  onClose,
  onOutlookChange,
}: IdealRotationReseedModalProps) {
  if (!open) return null;

  const detectedLabel =
    OUTLOOK_OPTIONS.find(option => option.depth !== null && option.depth <= benchDepth + 10 && option.depth >= benchDepth - 10)?.label ?? 'DETECTED';
  const bias = OUTLOOK_OPTIONS.find(option => option.key === reseedOutlook)?.bias ?? 1.0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm mx-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Reseed Rotation</div>
            <div className="text-xs text-slate-400 mt-0.5">Pick a team outlook — preview updates live.</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        <div className="relative">
          <select
            value={reseedOutlook}
            onChange={e => onOutlookChange(e.target.value as OutlookKey)}
            className="w-full bg-slate-800 border border-slate-600 text-amber-300 font-black uppercase text-xs rounded-lg px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:border-amber-500"
          >
            {OUTLOOK_OPTIONS.map(option => (
              <option key={option.key} value={option.key}>
                {option.key === 'auto' ? `AUTO (${detectedLabel})` : option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-amber-400 pointer-events-none" />
        </div>

        <div className="bg-slate-800/60 rounded-lg px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Bench Depth</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${reseedDepth}%` }} />
              </div>
              <span className="text-amber-300 font-mono text-xs w-6 text-right">{reseedDepth}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Stars vs Depth</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${bias * 100}%` }} />
              </div>
              <span className="text-sky-300 font-mono text-xs w-8 text-right">{Math.round(bias * 100)}%</span>
            </div>
          </div>
        </div>

        {reseedPreview && (
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 space-y-1 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Rotation Preview</div>
            </div>
            {Object.entries(reseedPreview.minutes)
              .sort(([, a], [, b]) => b - a)
              .map(([id, mins]) => {
                const player = playersById.get(id);
                if (!player || mins === 0) return null;
                const isStarter = reseedPreview.starterIds.includes(id);
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[9px] font-bold w-5 shrink-0 ${isStarter ? 'text-amber-400' : 'text-slate-500'}`}>
                        {isStarter ? 'S' : 'B'}
                      </span>
                      <span className="text-xs text-slate-200 truncate">
                        {(player as any).name ?? `${(player as any).firstName ?? ''} ${(player as any).lastName ?? ''}`.trim()}
                      </span>
                      <span className="text-[9px] text-slate-500 shrink-0">{player.pos}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(mins / maxPlayerMinutes) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-sky-300 w-6 text-right">{mins}m</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        <button
          onClick={onApply}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-xs rounded-lg py-2 transition-colors"
        >
          Apply Rotation
        </button>
      </div>
    </div>
  );
}
