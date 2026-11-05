import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, Scale, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import type { RefereeRetirementRecord } from '../../../services/referees/refereeRoster';
import { getRetirementClassYear } from '../aufgabenShared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}

function isRecordVisible(record: RefereeRetirementRecord, uiMode?: string, leagueType?: string): boolean {
  if (uiMode === 'pba_isolated') return record.league === 'PBA';
  if (leagueType === 'fictional') return record.league === 'fictional';
  return record.league !== 'PBA';
}

function modeLabel(uiMode?: string, leagueType?: string): string {
  if (uiMode === 'pba_isolated') return 'PBA Officiating';
  if (leagueType === 'fictional') return 'League Officiating';
  return 'Association Officiating';
}

export default function RefereeRetirementsReviewView({ isOpen, onClose, onDone }: Props) {
  const { state } = useGame();
  const classYear = getRetirementClassYear(state);
  const rows = useMemo(() => (state.refereeRetirementAnnouncements ?? [])
    .filter(record => record.season === classYear || record.season === classYear - 1)
    .filter(record => isRecordVisible(record, state.leagueStats?.uiMode, state.leagueType))
    .sort((left, right) => right.yearsExperience - left.yearsExperience || left.name.localeCompare(right.name)),
  [
    classYear,
    state.leagueStats?.uiMode,
    state.leagueType,
    state.refereeRetirementAnnouncements,
  ]);

  const handleDone = () => {
    onDone();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-0 sm:p-3 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            className="relative flex h-[100dvh] w-full max-w-4xl flex-col overflow-hidden border-0 bg-[#0f0f0f] shadow-2xl sm:h-[86vh] sm:rounded-[20px] sm:border sm:border-indigo-500/40"
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-indigo-500/70 bg-gradient-to-r from-zinc-950 to-zinc-900 px-4 py-3 sm:px-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-300/80">
                  {modeLabel(state.leagueStats?.uiMode, state.leagueType)}
                </div>
                <h2 className="font-display text-xl font-black tracking-wider text-slate-100">REFEREE RETIREMENTS</h2>
              </div>
              <button onClick={onClose} className="text-slate-500 transition-colors hover:text-white" title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50 px-4 py-5 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                  <Scale size={22} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-100">{rows.length} officials in the retirement class</p>
                  <p className="mt-1 text-xs text-zinc-500">The active assignment pool has already been updated.</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ scrollbarWidth: 'thin' }}>
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-14 text-center text-sm italic text-zinc-500">
                  No officials retired with this class.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rows.map(record => (
                    <div key={record.id} className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
                        {record.portraitUrl ? (
                          <img src={record.portraitUrl} alt={record.name} loading="lazy" className="h-full w-full object-cover object-top" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg font-black text-zinc-500">
                            {record.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-100">{record.name}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                          {record.officialNumber != null ? `Official #${record.officialNumber}` : 'League Official'}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {record.yearsExperience} seasons · Debut {record.debutYear}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="text-center text-xs text-zinc-500 sm:text-left">Review the class before continuing league business.</span>
              <button
                onClick={handleDone}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-400"
              >
                Done
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
