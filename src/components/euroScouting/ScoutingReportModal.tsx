import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Check, Clock3, Search, UserPlus, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { EuroScoutedProspect, EuroScoutingAssignment } from '../../services/euroScouting/types';
import { getScoutingAssignmentProgress, getVisibleScoutingProspects } from '../../services/euroScouting/engine';
import { getEuroYouthReportRatings } from '../../services/euroScouting/prospectRatings';
import { formatHeight } from '../../utils/helpers';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { RatingBadge } from '../transferMarket/EuroTransferMarketShared';
import { ProspectDetailModal } from './ProspectDetailModal';
import { CountryFlag } from '../shared/CountryFlag';
import { EURO_COUNTRY_BY_ID } from '../../services/euroScouting/countryProfiles';
import { normalizePositionLabel } from '../../utils/positionUtils';

type ReportSortKey = 'overall' | 'potential' | 'age' | 'height';
type ReportSortDirection = 'asc' | 'desc';

export const ScoutingReportModal: React.FC<{
  assignment: EuroScoutingAssignment;
  onClose: () => void;
}> = ({ assignment, onClose }) => {
  const { state, dispatchAction } = useGame();
  const [selected, setSelected] = useState<EuroScoutedProspect | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ReportSortKey>('potential');
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>('desc');
  const visible = getVisibleScoutingProspects(assignment, state.day);
  const progress = getScoutingAssignmentProgress(assignment, state.day);
  const complete = assignment.status === 'ready';
  const finalized = assignment.status === 'finalized';
  const year = state.leagueStats.year;
  const country = EURO_COUNTRY_BY_ID.get(assignment.countryId);
  useEffect(() => {
    if (assignment.status === 'ready' && !assignment.reviewed) {
      void dispatchAction({ type: 'MARK_EURO_SCOUTING_REPORT_REVIEWED', payload: { assignmentId: assignment.id } });
    }
  }, [assignment.id, assignment.reviewed, assignment.status, dispatchAction]);
  const rows = useMemo(() => visible
    .filter(player => player.name.toLowerCase().includes(query.toLowerCase()))
    .map((player, index) => {
      const ratings = getEuroYouthReportRatings(state, player, year, assignment.scoutRating);
      return { player, index, ...ratings };
    })
    .sort((first, second) => {
      const firstValue = sortKey === 'overall' ? first.overall
        : sortKey === 'potential' ? first.potential
          : sortKey === 'height' ? Number(first.player.hgt ?? 0)
            : Number(first.player.age ?? 0);
      const secondValue = sortKey === 'overall' ? second.overall
        : sortKey === 'potential' ? second.potential
          : sortKey === 'height' ? Number(second.player.hgt ?? 0)
            : Number(second.player.age ?? 0);
      const difference = sortDirection === 'asc' ? firstValue - secondValue : secondValue - firstValue;
      return difference || first.index - second.index || first.player.internalId.localeCompare(second.player.internalId);
    }), [query, sortDirection, sortKey, state, visible, year]);

  const changeSort = (nextKey: ReportSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection(direction => direction === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'age' ? 'asc' : 'desc');
  };

  const sortLabel = (key: ReportSortKey, label: string) => (
    <button type="button" onClick={() => changeSort(key)} className={`inline-flex items-center gap-1 text-left hover:text-white ${sortKey === key ? 'text-blue-300' : ''}`}>
      {label}{sortKey === key && <span aria-hidden="true">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
    </button>
  );

  const assign = async (player: EuroScoutedProspect) => {
    await dispatchAction({ type: 'ASSIGN_EURO_PROSPECT_TO_ACADEMY', payload: { assignmentId: assignment.id, playerId: player.internalId } });
  };

  const finish = async () => {
    if (!complete) return onClose();
    const unassigned = assignment.prospects.filter(player => !assignment.assignedProspectIds.includes(player.internalId)).length;
    if (unassigned > 0 && !window.confirm(`Close this report? ${unassigned} unassigned ${unassigned === 1 ? 'player' : 'players'} will leave your shortlist.`)) return;
    await dispatchAction({ type: 'FINALIZE_EURO_SCOUTING_REPORT', payload: { assignmentId: assignment.id } });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/90 backdrop-blur-sm md:items-center md:p-4">
      <div className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl md:h-auto md:max-h-[92vh] md:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-4 md:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">{finalized ? 'Report Archive' : complete ? 'Final Report' : 'Live Report'}</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-black text-white md:text-2xl"><CountryFlag country={assignment.countryName} iso2={country?.iso2} className="inline-flex h-4 w-6 rounded-sm md:h-5 md:w-7" />{assignment.countryName}</h2>
            <p className="mt-1 text-xs text-slate-400">{assignment.scoutName} · {visible.length} players identified</p>
          </div>
          <button onClick={finish} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </div>

        <div className="border-b border-slate-800 px-4 py-3 md:px-6">
          <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>{finalized ? 'Report closed' : complete ? 'Assignment complete' : `${Math.max(0, assignment.durationDays - (state.day - assignment.startedDay))} days remaining`}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-blue-500" style={{ width: `${progress * 100}%` }} /></div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2">
            <Search size={15} className="text-slate-500" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search this report" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
          </label>
          <div className="mt-2 flex items-center gap-2 md:hidden">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
              <ArrowDownUp size={14} />
              <select value={sortKey} onChange={event => changeSort(event.target.value as ReportSortKey)} className="min-w-0 flex-1 bg-transparent outline-none">
                <option className="bg-slate-900" value="overall">Overall</option>
                <option className="bg-slate-900" value="potential">Potential</option>
                <option className="bg-slate-900" value="age">Age</option>
                <option className="bg-slate-900" value="height">Height</option>
              </select>
            </label>
            <button type="button" onClick={() => setSortDirection(direction => direction === 'desc' ? 'asc' : 'desc')} className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-black text-blue-300" aria-label="Reverse sort direction">{sortDirection === 'desc' ? '↓' : '↑'}</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-6">
          {rows.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <Clock3 className="mb-3 text-slate-700" size={38} />
              <h3 className="font-bold text-slate-300">No players available yet</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">Keep the scout in the country. New names can appear before the trip ends.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-slate-800 md:block">
                <div className="grid grid-cols-[minmax(210px,2fr)_70px_70px_80px_90px_120px] gap-3 bg-slate-950/70 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <span>Player</span>{sortLabel('overall', 'OVR')}{sortLabel('potential', 'POT')}{sortLabel('age', 'Age')}{sortLabel('height', 'Height')}<span />
                </div>
                {rows.map(({ player, overall: ovr, potential: pot }) => {
                  const assigned = assignment.assignedProspectIds.includes(player.internalId);
                  return (
                    <button key={player.internalId} onClick={() => setSelected(player)} className="grid w-full grid-cols-[minmax(210px,2fr)_70px_70px_80px_90px_120px] items-center gap-3 border-t border-slate-800 px-4 py-3 text-left hover:bg-slate-800/40">
                      <span className="flex min-w-0 items-center gap-3"><PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={42} /><span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{player.name}</span><span className="text-[10px] text-slate-500">{normalizePositionLabel(player.pos, player.hgt)}</span></span></span>
                      <RatingBadge label="OVR" value={ovr} small /><RatingBadge label="POT" value={pot} small />
                      <span className="text-sm font-bold text-slate-300">{player.age}</span>
                      <span className="text-sm text-slate-400">{player.hgt ? formatHeight(player.hgt) : '—'}</span>
                      <span className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-black ${assigned ? 'bg-emerald-500/10 text-emerald-300' : 'bg-blue-600 text-white'}`}>{assigned ? <Check size={13} /> : <UserPlus size={13} />}{assigned ? 'Assigned' : 'Review'}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3 md:hidden">
                {rows.map(({ player, overall: ovr, potential: pot }) => {
                  const assigned = assignment.assignedProspectIds.includes(player.internalId);
                  return (
                    <button key={player.internalId} onClick={() => setSelected(player)} className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left">
                      <div className="flex items-center gap-3"><PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={52} /><div className="min-w-0 flex-1"><h3 className="truncate font-bold text-white">{player.name}</h3><p className="text-xs text-slate-500">{normalizePositionLabel(player.pos, player.hgt)} · Age {player.age} · {player.hgt ? formatHeight(player.hgt) : '—'}</p><div className="mt-2 flex gap-2"><RatingBadge label="OVR" value={ovr} small /><RatingBadge label="POT" value={pot} small /></div></div><span className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase ${assigned ? 'bg-emerald-500/10 text-emerald-300' : 'bg-blue-500/10 text-blue-300'}`}>{assigned ? 'Academy' : 'Review'}</span></div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-slate-800 bg-slate-900 p-4">
          <button onClick={finish} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-500">{finalized ? 'Close' : complete ? 'Close Final Report' : 'Keep Scouting'}</button>
        </div>
      </div>
      {selected && <ProspectDetailModal state={state} player={selected} classProspects={visible} scoutRating={assignment.scoutRating} assigned={assignment.assignedProspectIds.includes(selected.internalId)} onAssign={() => assign(selected)} onClose={() => setSelected(null)} />}
    </div>
  );
};
