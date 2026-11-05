import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, MapPin, Check, CalendarClock, Edit3 } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NBATeam } from '../../types';
import { TeamPickerGrid } from '../shared/TeamPickerGrid';
import { loadArenas, getArenaForTeamAtSeason } from '../../utils/arenaData';
import { fetchAllStarHistory } from '../../data/allStarHistoryFetcher';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { getTeamFullName } from '../../utils/teamNames';
import { isHistoricalNbaWhatIfTimeline, timelineInputFromState } from '../../utils/historicalTimeline';
import {
  buildHistoricalAllStarHostsByYear,
  buildHistoricalAllStarHostYears,
  getAllStarHostDecisionYear,
  historicalAllStarSourceMatchesHost,
  materializeKnownNbaAllStarHosts,
  autoResolveAllStarHosts,
  normalizeAllStarHost,
  type HistoricalAllStarHostSource,
} from '../../services/allStar/hostAutoResolver';
import { getSeasonSimStartDate } from '../../utils/dateUtils';

export type HostDraft = { year: number; city: string; arena: string; teamIds: number[] };

interface AllStarHostPickerModalProps {
  onClose: () => void;
  onConfirm: (hosts: HostDraft[]) => void;
}

const ModalShell = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <motion.div
      initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
      className={`flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-[2rem] border border-slate-800 bg-slate-900 shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}
    >
      {children}
    </motion.div>
  </div>
);

export const AllStarHostPickerModal: React.FC<AllStarHostPickerModalProps> = ({ onClose, onConfirm }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const targetHostYear = getAllStarHostDecisionYear(state.leagueStats);
  const teams = state.teams ?? [];
  const existing = (state.leagueStats?.allStarHosts ?? [])
    .map(normalizeAllStarHost)
    .filter((host): host is NonNullable<ReturnType<typeof normalizeAllStarHost>> => host != null)
    .map((host): HostDraft => ({
      year: host.year,
      city: host.city,
      arena: host.arena ?? '',
      teamIds: host.teamIds,
    }));
  const [historicalHostYears, setHistoricalHostYears] = useState<Map<number, number>>(new Map());
  const [sourceHostsByYear, setSourceHostsByYear] = useState<Map<number, HistoricalAllStarHostSource>>(new Map());

  const [drafts, setDrafts] = useState<HostDraft[]>(() => {
    const map = new Map<number, HostDraft>();
    existing
      .filter(host => host.year <= targetHostYear)
      .forEach(h => map.set(h.year, {
        ...h,
        city: h.city ?? '',
        arena: h.arena ?? '',
        teamIds: [...(h.teamIds ?? [])],
      }));
    for (let y = currentYear; y <= targetHostYear; y++) {
      if (!map.has(y)) map.set(y, { year: y, city: '', arena: '', teamIds: [] });
    }
    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  });

  const [editYear, setEditYear] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const isWnba = state.leagueStats.uiMode === 'wnba_isolated';
    const hasHistoricalHostArchive = !isEuroIsolatedMode(state) && !isPbaIsolatedMode(state);
    const historicalNba = isHistoricalNbaWhatIfTimeline(timelineInputFromState(state));
    const branchCutoff = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear);
    const wnbaStartYear = Number(state.wnbaStartYear ?? currentYear);
    const cutoff = isWnba
      ? Math.max(1998, wnbaStartYear - 1)
      : historicalNba && Number.isFinite(branchCutoff)
        ? branchCutoff
        : currentYear - 1;
    const historyRequest = state.leagueType === 'fictional' || !hasHistoricalHostArchive
      ? Promise.resolve([])
      : fetchAllStarHistory(isWnba ? 'wnba' : 'nba');
    Promise.all([historyRequest, loadArenas()]).then(([history]) => {
      if (!active) return;
      const historicalYears = buildHistoricalAllStarHostYears(history, teams, cutoff);
      const sources = new Map(
        [...buildHistoricalAllStarHostsByYear(history, teams)]
          .filter(([year]) => year <= cutoff),
      );
      setHistoricalHostYears(historicalYears);
      setSourceHostsByYear(sources);
      setDrafts(previous => {
        const byYear = new Map(previous.map(host => [host.year, host]));
        const sourceStartYear = Number(isWnba
          ? state.wnbaStartYear
          : state.nbaStartYear ?? state.leagueStats.historicalEraStartYear);
        const seedSeasonYear = Number.isFinite(sourceStartYear)
          ? sourceStartYear + 1
          : currentYear;
        const knowledgeDate = Number.isFinite(sourceStartYear)
          ? getSeasonSimStartDate(seedSeasonYear, state.leagueStats)
          : new Date(state.date);
        const seededHosts = isWnba
          ? [...byYear.values()]
          : materializeKnownNbaAllStarHosts({
              existing: [...byYear.values()],
              teams,
              seedSeasonYear,
              knowledgeDate,
              history,
            });
        const generated = autoResolveAllStarHosts(
          { ...state.leagueStats, allStarHosts: seededHosts },
          teams,
          {
            horizon: Math.max(0, targetHostYear - currentYear - 1),
            historicalHostYears: historicalYears,
            historicalHostsByYear: sources,
          },
        );
        return generated
          .map(normalizeAllStarHost)
          .filter((host): host is NonNullable<ReturnType<typeof normalizeAllStarHost>> => host != null)
          .filter(host => host.year <= targetHostYear)
          .map((host): HostDraft => ({ ...host, arena: host.arena ?? '' }))
          .sort((left, right) => left.year - right.year);
      });
    });
    return () => {
      active = false;
    };
  }, [
    currentYear,
    state.leagueType,
    state.moddedLeagueBase,
    state.nbaStartYear,
    state.wnbaStartYear,
    state.leagueStats.historicalEraStartYear,
    state.leagueStats,
    teams,
  ]);

  const saveTeam = (year: number, tid: number) => {
    console.info('[ALLSTAR_HOST] team-click', {
      year,
      teamId: tid,
      targetHostYear,
      draftYears: drafts.map(host => host.year),
    });
    const team = teams.find(t => t.id === tid);
    if (!team) {
      console.error('[ALLSTAR_HOST] team-not-found', {
        year,
        teamId: tid,
        availableTeamIds: teams.map(candidate => candidate.id),
      });
      return;
    }
    const arena = getArenaForTeamAtSeason(team, year);
    const selectedHost: HostDraft = {
      year,
      city: arena?.location || team.region || team.name,
      arena: arena?.name ?? '',
      teamIds: [tid],
    };
    const valid = drafts
      .map(host => host.year === year ? selectedHost : host)
      .filter(host => host.year < currentYear ? host.city.trim() !== '' || host.teamIds.length > 0 : host.teamIds.length > 0);
    const hiddenFuture = existing.filter(host => host.year > targetHostYear);
    const hosts = [...valid, ...hiddenFuture].sort((left, right) => left.year - right.year);
    console.info('[ALLSTAR_HOST] confirm-request', {
      selectedHost,
      arenaResolved: arena != null,
      hostYears: hosts.map(host => ({ year: host.year, teamIds: host.teamIds })),
    });
    onConfirm(hosts);
  };

  const currentBucket = drafts.filter(d => d.year === currentYear);
  const futureBuckets = drafts.filter(d => d.year > currentYear);

  const editing = editYear != null ? drafts.find(d => d.year === editYear) : null;

  if (editing) {
    const lastHostedYear = (teamId: number) => {
      let latest = historicalHostYears.get(teamId);
      for (const host of drafts) {
        if (host.year >= editing.year) continue;
        const source = sourceHostsByYear.get(host.year);
        const hosted = host.teamIds.includes(teamId)
          || (host.teamIds.length === 0
            && source != null
            && historicalAllStarSourceMatchesHost(source, host)
            && source.teamIds.includes(teamId));
        if (!hosted) continue;
        latest = Math.max(latest ?? 0, host.year);
      }
      return latest;
    };
    const committedTeamIds = new Set([
      ...drafts
        .filter(host => host.year >= currentYear && host.year !== editing.year)
        .flatMap(host => host.teamIds),
      ...existing
        .filter(host => host.year > targetHostYear)
        .flatMap(host => host.teamIds),
    ]);
    const hostCandidates = teams
      .filter(team => !committedTeamIds.has(team.id) || editing.teamIds.includes(team.id))
      .sort((left, right) => {
      const leftYear = lastHostedYear(left.id);
      const rightYear = lastHostedYear(right.id);
      if (leftYear == null && rightYear != null) return -1;
      if (leftYear != null && rightYear == null) return 1;
      if (leftYear !== rightYear) return (leftYear ?? 0) - (rightYear ?? 0);
      return getTeamFullName(left).localeCompare(getTeamFullName(right));
    });
    const selectedTeams = editing.teamIds
      .map(id => teams.find(t => t.id === id))
      .filter((team): team is NBATeam => team != null);

    return (
      <ModalShell wide>
        <div className="relative p-4 pb-4 sm:p-8">
          <button
            onClick={() => setEditYear(null)}
            className="text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5"
          >
            ← Back to years
          </button>
          <button
            onClick={onClose}
            className="absolute right-8 top-8 rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-4 mb-4 p-3 rounded-2xl border bg-sky-500/10 border-sky-500/20">
            <div className="w-11 h-11 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center font-black">
              {editing.year}
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5 text-sky-400">
                {editing.year === targetHostYear ? 'Next Host Decision' : editing.year === currentYear ? 'Current Season' : 'Future Season'}
              </p>
              <p className="font-black text-white">All-Star Weekend Host</p>
              <p className="text-xs text-slate-500">Pick city/arena and one or more host teams.</p>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Selected venue</p>
            <p className="mt-1 font-black text-white">{editing.arena || 'Choose a host team'}</p>
            <p className="mt-1 text-xs text-slate-400">{editing.city || 'The city and arena are set from that season’s team venue.'}</p>
          </div>

          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
            Host Teams {selectedTeams.length > 0 && <span className="text-emerald-400 normal-case font-bold tracking-normal">· {selectedTeams.length} selected</span>}
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Never-hosted teams are listed first, followed by the teams that have waited longest.
          </p>
        </div>

        {/* Team grid — shared component used across modals */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-6 sm:px-8">
          <TeamPickerGrid
            teams={hostCandidates}
            selectedIds={editing.teamIds}
            onToggle={(tid) => {
              saveTeam(editing.year, tid);
            }}
            mode="single"
            accent="emerald"
            getMeta={team => {
              const year = lastHostedYear(team.id);
              return year == null ? 'Never hosted' : `Last hosted ${year}`;
            }}
          />
        </div>

      </ModalShell>
    );
  }

  const YearCard = ({ d }: { d: HostDraft }) => {
    const assigned = d.teamIds.length > 0;
    const hostTeams = d.teamIds
      .map(id => teams.find(t => t.id === id))
      .filter((team): team is NBATeam => team != null);

    const editable = d.year === targetHostYear;
    return (
      <button
        onClick={() => {
          console.info('[ALLSTAR_HOST] year-click', {
            year: d.year,
            editable,
            targetHostYear,
            teamIds: d.teamIds,
          });
          if (editable) setEditYear(d.year);
        }}
        disabled={!editable}
        className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
          assigned
            ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10'
            : editable
              ? 'bg-slate-950/50 border-slate-800 hover:border-sky-500/40 hover:bg-sky-500/5'
              : 'bg-slate-950/50 border-slate-800'
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
            {d.year === targetHostYear && (
              <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full">NEXT DECISION</span>
            )}
            {assigned && <Check size={12} className="text-emerald-400" />}
          </div>
          {assigned ? (
            <div className="flex items-center gap-2 flex-wrap">
              {d.arena && <span className="text-[11px] text-slate-400">{d.arena}</span>}
              {hostTeams.length > 0 && (
                <div className="flex items-center gap-1">
                  {hostTeams.slice(0, 3).map((t, i) => (
                    t.logoUrl
                      ? <img key={i} src={t.logoUrl} className="w-4 h-4 object-contain" alt={t.abbrev} referrerPolicy="no-referrer" />
                      : <span key={i} className="text-[10px] text-slate-500">{t.abbrev}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 italic">{editable ? 'Click to assign' : 'Awaiting confirmed host data'}</span>
          )}
        </div>
        {editable ? <Edit3 size={14} className="text-slate-500 shrink-0" /> : <Check size={14} className="shrink-0 text-slate-600" />}
      </button>
    );
  };

  return (
    <ModalShell wide>
      <div className="p-4 pb-4 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400">
            <MapPin size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white uppercase tracking-widest">All-Star Hosts</h3>
            <p className="text-slate-400 text-xs">Assign host cities and teams. The next required decision is {targetHostYear}.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-500 hover:text-white transition-all">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto space-y-5 px-4 pb-4 sm:px-8">
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

    </ModalShell>
  );
};

export default AllStarHostPickerModal;
