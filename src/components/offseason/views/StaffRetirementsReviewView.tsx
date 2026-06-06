import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import type { StaffRetirementRecord } from '../../../services/staff/staffRetirement';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function recordYear(record: StaffRetirementRecord): number {
  const fromDate = Number(String(record.retiredDate ?? '').slice(0, 4));
  return Number.isFinite(fromDate) && fromDate > 0 ? fromDate : record.season;
}

function teamLabel(record: StaffRetirementRecord): string {
  return record.teamAbbrev || record.teamName || 'League';
}

function isRecordInMode(record: StaffRetirementRecord, uiMode?: string): boolean {
  const teamId = Number(record.teamId);
  const leagueId = String(record.leagueId ?? '').toLowerCase();
  if (uiMode === 'pba_isolated') {
    return (teamId >= 2000 && teamId < 2100) || leagueId === 'pba';
  }
  if (uiMode === 'euro_isolated') {
    return (teamId >= 1000 && teamId < 1100) || (teamId >= 5000 && teamId < 5100) || leagueId === 'euroleague' || leagueId === 'endesa';
  }
  return !Number.isFinite(teamId) || (teamId >= 0 && teamId < 100);
}

function staffLeagueLabel(uiMode?: string): string {
  if (uiMode === 'pba_isolated') return 'PBA Staff';
  if (uiMode === 'euro_isolated') return 'European Staff';
  return 'Association Staff';
}

export default function StaffRetirementsReviewModal({ isOpen, onClose }: Props) {
  const { state, dispatchAction } = useGame();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const uiMode = state.leagueStats?.uiMode;
  const classYear = state.date
    ? new Date(state.date).getUTCFullYear()
    : state.leagueStats?.year ?? new Date().getFullYear();

  const rows = useMemo(() => {
    if (!isOpen) return [] as StaffRetirementRecord[];
    return (state.staffRetirementAnnouncements ?? [])
      .filter(record =>
        recordYear(record) === classYear ||
        record.season === classYear ||
        recordYear(record) === classYear - 1 ||
        record.season === classYear - 1,
      )
      .filter(record => isRecordInMode(record, uiMode))
      .sort((a, b) => b.yearsExperience - a.yearsExperience || b.age - a.age || a.name.localeCompare(b.name));
  }, [isOpen, state.staffRetirementAnnouncements, classYear, uiMode]);

  const selected = useMemo(() => {
    if (rows.length === 0) return null;
    return rows.find(row => row.id === selectedId) ?? rows[0];
  }, [rows, selectedId]);

  const handleDone = () => {
    dispatchAction({ type: 'OFFSEASON_COMPLETE_PHASE', payload: { row: 'staffRetirements' } } as any);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-0 sm:p-2 md:p-6">
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
            className="relative flex h-[100dvh] sm:h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-[20px] border-0 sm:border border-sky-500/40 bg-[#0f0f0f] shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b-2 border-sky-500/80 bg-gradient-to-r from-zinc-950 to-zinc-900 px-4 sm:px-6 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400/80">{staffLeagueLabel(uiMode)}</div>
                <h2 className="font-display text-xl font-black tracking-wider text-slate-100">STAFF RETIREMENTS</h2>
              </div>
              <button onClick={onClose} className="text-slate-500 transition-colors hover:text-white" title="Close">
                <X size={18} />
              </button>
            </div>

            {selected ? (
              <StaffDetailHeader record={selected} />
            ) : (
              <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50 px-4 sm:px-6 py-10 text-center text-sm italic text-zinc-500">
                No staff members retired after the {classYear} season.
              </div>
            )}

            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              <div className="hidden md:grid sticky top-0 z-10 grid-cols-[72px_1fr_190px_80px_110px_100px] gap-3 border-b border-zinc-800 bg-zinc-950 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <span>Portrait</span>
                <span>Name</span>
                <span>Role</span>
                <span className="text-right">Age</span>
                <span className="text-right">Experience</span>
                <span className="text-right">Team</span>
              </div>
              <div className="md:hidden divide-y divide-zinc-900">
                {rows.map(row => (
                  <StaffMobileRow
                    key={row.id}
                    row={row}
                    selected={row.id === selected?.id}
                    onSelect={() => setSelectedId(row.id)}
                  />
                ))}
              </div>
              <div className="hidden md:block">
                {rows.map(row => (
                  <StaffTableRow
                    key={row.id}
                    row={row}
                    selected={row.id === selected?.id}
                    onSelect={() => setSelectedId(row.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 border-t border-zinc-800 bg-zinc-950 px-4 sm:px-6 py-3">
              <span className="text-xs text-zinc-500 text-center sm:text-left">
                Review the staff exits before opening staff hires.
              </span>
              <button
                onClick={handleDone}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-400"
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

function StaffDetailHeader({ record }: { record: StaffRetirementRecord }) {
  return (
    <div className="grid shrink-0 grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-6 border-b border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 px-4 sm:px-6 py-4">
      <div className="mx-auto sm:mx-0">
        <PlayerPortrait
          imgUrl={record.portraitUrl}
          playerName={record.name}
          face={record.face}
          size={84}
        />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">
          {record.role} · Retired {record.season}
        </div>
        <div className="break-words font-display text-2xl sm:text-3xl font-black uppercase tracking-wide text-slate-100">
          {record.name}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center sm:text-right">
        <BioCell label="Age" value={String(record.age)} />
        <BioCell label="Experience" value={record.experienceLabel} />
        <BioCell label="Team" value={teamLabel(record)} />
      </div>
    </div>
  );
}

function StaffTableRow({ row, selected, onSelect }: { row: StaffRetirementRecord; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className={`grid cursor-pointer grid-cols-[72px_1fr_190px_80px_110px_100px] items-center gap-3 border-b border-zinc-900 px-6 py-2.5 transition-colors ${
        selected ? 'bg-gradient-to-r from-sky-500/25 to-transparent ring-1 ring-sky-400/40' : 'hover:bg-zinc-900/50'
      }`}
    >
      <PlayerPortrait imgUrl={row.portraitUrl} playerName={row.name} face={row.face} size={46} />
      <div className="truncate text-sm font-semibold text-slate-100">{row.name}</div>
      <div className="truncate text-sm text-zinc-300">{row.role}</div>
      <div className="text-right text-sm tabular-nums text-zinc-300">{row.age}</div>
      <div className="text-right text-sm tabular-nums text-zinc-300">{row.experienceLabel}</div>
      <TeamCell row={row} />
    </div>
  );
}

function StaffMobileRow({ row, selected, onSelect }: { row: StaffRetirementRecord; selected: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer px-4 py-3 transition-colors ${selected ? 'bg-gradient-to-r from-sky-500/25 to-transparent ring-1 ring-sky-400/40' : 'hover:bg-zinc-900/50'}`}
    >
      <div className="flex items-center gap-3">
        <PlayerPortrait imgUrl={row.portraitUrl} playerName={row.name} face={row.face} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{row.name}</div>
          <div className="truncate text-xs text-zinc-400">{row.role}</div>
        </div>
        <TeamBadge row={row} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
        <span>Age {row.age}</span>
        <span>{row.experienceLabel}</span>
      </div>
    </div>
  );
}

function TeamCell({ row }: { row: StaffRetirementRecord }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {row.teamLogoUrl && <img src={row.teamLogoUrl} alt="" loading="lazy" className="h-5 w-5 object-contain" />}
      <span className="truncate text-right text-sm font-bold text-zinc-300">{teamLabel(row)}</span>
    </div>
  );
}

function TeamBadge({ row }: { row: StaffRetirementRecord }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded bg-zinc-900 px-2 py-1">
      {row.teamLogoUrl && <img src={row.teamLogoUrl} alt="" loading="lazy" className="h-4 w-4 object-contain" />}
      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">{teamLabel(row)}</span>
    </div>
  );
}

function BioCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}
