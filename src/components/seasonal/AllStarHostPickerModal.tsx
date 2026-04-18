import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, MapPin, Check, CalendarClock, Trash2, Edit3 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { TeamPickerGrid } from '../shared/TeamPickerGrid';
import { loadArenas, getArenaForTeam } from '../../utils/arenaData';

export type HostDraft = { year: number; city: string; arena: string; teamIds: number[] };

interface AllStarHostPickerModalProps {
  onClose: () => void;
  /** Called with the new host list when commissioner saves. Owner should advance the day. */
  onConfirm: (hosts: HostDraft[]) => void;
}

// ── Shared modal shell — mirrors AllStarReplacementModal ────────────────────
const ModalShell = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <motion.div
      initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
      className={`bg-slate-900 border border-slate-800 rounded-[2rem] w-full shadow-2xl flex flex-col max-h-[90vh] ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}
    >
      {children}
    </motion.div>
  </div>
);

/**
 * Commissioner-only modal to assign All-Star hosts.
 * Two-step flow like AllStarReplacementModal:
 *   Step 1: buckets by year (current + future) — each is a clickable card
 *   Step 2: team grid picker (InvitePerformance style) with city/arena inputs
 *
 * GM mode auto-resolves host assignments elsewhere; this modal is never opened
 * from GM mode so we don't gate inside it.
 */
export const AllStarHostPickerModal: React.FC<AllStarHostPickerModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats?.year ?? 2026;
  const teams = state.teams ?? [];
  const existing = (state.leagueStats?.allStarHosts ?? []) as HostDraft[];

  // Draft buckets — current year + next 5
  const [drafts, setDrafts] = useState<HostDraft[]>(() => {
    const map = new Map<number, HostDraft>();
    existing.forEach(h => map.set(h.year, { ...h, teamIds: [...(h.teamIds ?? [])] }));
    for (let y = currentYear; y <= currentYear + 5; y++) {
      if (!map.has(y)) map.set(y, { year: y, city: '', arena: '', teamIds: [] });
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  });

  const [editYear, setEditYear] = useState<number | null>(null);
  const [arenasLoaded, setArenasLoaded] = useState(false);
  useEffect(() => { loadArenas().then(() => setArenasLoaded(true)); }, []);

  const updateDraft = (year: number, patch: Partial<HostDraft>) => {
    setDrafts(d => d.map(x => x.year === year ? { ...x, ...patch } : x));
  };

  const toggleTeam = (year: number, tid: number) => {
    setDrafts(d => d.map(x => {
      if (x.year !== year) return x;
      const has = x.teamIds.includes(tid);
      return { ...x, teamIds: has ? x.teamIds.filter(t => t !== tid) : [...x.teamIds, tid] };
    }));
  };

  const autofillFromTeam = (year: number, tid: number) => {
    const team = teams.find(t => t.id === tid);
    if (!team) return;
    const current = drafts.find(d => d.year === year);
    const arena = getArenaForTeam(team.name);
    const patch: Partial<HostDraft> = {};
    // Only overwrite empty fields — respect commissioner's manual typing.
    if (!current?.city) {
      patch.city = arena?.arena_location || (team as any).region || team.name;
    }
    if (!current?.arena && arena?.arena_name) {
      patch.arena = arena.arena_name;
    }
    if (Object.keys(patch).length > 0) updateDraft(year, patch);
  };

  const clearYear = (year: number) => {
    updateDraft(year, { city: '', arena: '', teamIds: [] });
  };

  const handleSave = () => {
    const valid = drafts.filter(d => d.city.trim() !== '' || d.teamIds.length > 0);
    onConfirm(valid);
  };

  // ── Derived: current vs future bucket split ────────────────────────────────
  const currentBucket = drafts.filter(d => d.year === currentYear);
  const futureBuckets = drafts.filter(d => d.year > currentYear);

  const editing = editYear != null ? drafts.find(d => d.year === editYear) : null;

  // ─── STEP 2: Team + city editor ──────────────────────────────────────────
  if (editing) {
    const selectedTeams = editing.teamIds
      .map(id => teams.find(t => t.id === id))
      .filter(Boolean) as any[];

    return (
      <ModalShell wide>
        <div className="p-8 pb-4">
          <button
            onClick={() => setEditYear(null)}
            className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5"
          >
            ← Back to years
          </button>
          <div className="flex items-center gap-4 mb-4 p-3 rounded-2xl border bg-sky-500/10 border-sky-500/20">
            <div className="w-11 h-11 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center font-black">
              {editing.year}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5 text-sky-400">
                {editing.year === currentYear ? 'Current Season' : 'Future Season'}
              </p>
              <p className="font-black text-white">All-Star Weekend Host</p>
              <p className="text-xs text-slate-500">Pick city/arena and one or more host teams.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <input
              type="text"
              placeholder="Host City (e.g. Inglewood, CA)"
              value={editing.city}
              onChange={e => updateDraft(editing.year, { city: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <input
              type="text"
              placeholder="Arena (optional)"
              value={editing.arena}
              onChange={e => updateDraft(editing.year, { arena: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
            Host Teams {selectedTeams.length > 0 && <span className="text-emerald-400 normal-case font-bold tracking-normal">· {selectedTeams.length} selected</span>}
          </p>
        </div>

        {/* Team grid — shared component used across modals */}
        <div className="overflow-y-auto custom-scrollbar px-8 pb-6 flex-1">
          <TeamPickerGrid
            teams={teams}
            selectedIds={editing.teamIds}
            onToggle={(tid) => {
              const wasSelected = editing.teamIds.includes(tid);
              toggleTeam(editing.year, tid);
              if (!wasSelected) autofillFromTeam(editing.year, tid);
            }}
            mode="multi"
            accent="emerald"
          />
        </div>

        <div className="p-6 pt-4 border-t border-slate-800 flex justify-between">
          <button
            onClick={() => clearYear(editing.year)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 font-bold uppercase tracking-wider text-xs"
          >
            <Trash2 size={12} /> Clear
          </button>
          <button
            onClick={() => setEditYear(null)}
            className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase tracking-wider text-xs"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  // ─── STEP 1: Year buckets ────────────────────────────────────────────────
  const YearCard = ({ d }: { d: HostDraft }) => {
    const assigned = d.city.trim() !== '' || d.teamIds.length > 0;
    const hostTeams = d.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as any[];

    return (
      <button
        onClick={() => setEditYear(d.year)}
        className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
          assigned
            ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10'
            : 'bg-slate-950/50 border-slate-800 hover:border-sky-500/40 hover:bg-sky-500/5'
        }`}
      >
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${
          d.year === currentYear ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-400'
        }`}>
          {d.year}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white text-sm">
              {assigned ? d.city || 'Unnamed City' : 'No host assigned'}
            </span>
            {d.year === currentYear && (
              <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">CURRENT</span>
            )}
            {assigned && <Check size={12} className="text-emerald-400" />}
          </div>
          {assigned ? (
            <div className="flex items-center gap-2 flex-wrap">
              {d.arena && <span className="text-[11px] text-slate-400">{d.arena}</span>}
              {hostTeams.length > 0 && (
                <div className="flex items-center gap-1">
                  {hostTeams.slice(0, 3).map((t: any, i) => (
                    t.logoUrl
                      ? <img key={i} src={t.logoUrl} className="w-4 h-4 object-contain" alt={t.abbrev} referrerPolicy="no-referrer" />
                      : <span key={i} className="text-[10px] text-slate-500">{t.abbrev}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 italic">Click to assign</span>
          )}
        </div>
        <Edit3 size={14} className="text-slate-500 shrink-0" />
      </button>
    );
  };

  return (
    <ModalShell wide>
      <div className="p-8 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
            <MapPin size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">All-Star Hosts</h3>
            <p className="text-slate-400 text-xs">Assign host cities and teams for current + upcoming All-Star Weekends.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar px-8 pb-4 flex-1 space-y-5">
        {/* Current year bucket */}
        {currentBucket.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <CalendarClock size={10} /> Current Season
            </p>
            <div className="space-y-1.5">
              {currentBucket.map(d => <YearCard key={d.year} d={d} />)}
            </div>
          </div>
        )}

        {/* Future years bucket */}
        {futureBuckets.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Future Seasons</p>
            <div className="space-y-1.5">
              {futureBuckets.map(d => <YearCard key={d.year} d={d} />)}
            </div>
          </div>
        )}
      </div>

      <div className="p-6 pt-4 border-t border-slate-800 flex justify-end gap-2">
        <button onClick={onClose} className="px-6 py-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-xs">
          Cancel
        </button>
        <button onClick={handleSave} className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold uppercase tracking-wider text-xs">
          Save Assignments
        </button>
      </div>
    </ModalShell>
  );
};

export default AllStarHostPickerModal;
