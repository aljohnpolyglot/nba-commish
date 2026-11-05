import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Trophy } from 'lucide-react';
import type { GameState } from '../../../types';
import {
  competitionSeasonEndYear,
  cleanChampionName,
  fetchCompetitionHistory,
  hasCompetitionHistorySource,
  type CompetitionGistId,
  type CompetitionSeason,
} from '../../../data/euroleagueHistoryFetcher';
import { CompetitionHistoryView } from '../../competition/CompetitionHistoryView';
import { ensurePortraitLookupsLoaded, getPhotoByName } from '../../../data/realPlayerDataFetcher';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';
import { getCompetitionSeasonAwards } from '../../../services/competition/competitionAwardHistory';
import { getEuroHistoryCompetitions } from '../../../utils/euroLeagueDefaults';
import { AwardCell, resolveLeagueHistoryPortraitUrl } from './leagueHistoryShared';

type Props = {
  state: GameState;
  currentSeason: number;
  onSelectSeason: (season: number) => void;
  onSelectTeam: (tid: number) => void;
};

type ChampionEntry = {
  name: string;
  tid?: number;
  logoUrl?: string;
};

type CompetitionColumn = {
  id: string;
  label: string;
  hasHistory: boolean;
};

type IndividualAwardEntry = {
  competitionId: string;
  competition: string;
  type: string;
  name: string;
  team?: string;
  role?: 'player' | 'coach' | 'executive';
};

const normalizeName = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, ' ')
  .trim()
  .toLowerCase();

const seasonLabel = (endYear: number) => {
  const suffix = endYear % 100 === 0 ? String(endYear) : String(endYear).slice(-2).padStart(2, '0');
  return `${endYear - 1}–${suffix}`;
};

const ChampionCell: React.FC<{
  champion?: ChampionEntry;
  pending: boolean;
  onSelectTeam: (tid: number) => void;
}> = ({ champion, pending, onSelectTeam }) => {
  if (!champion) return <span className={`text-xs italic ${pending ? 'text-slate-500' : 'text-slate-700'}`}>{pending ? 'TBA' : '—'}</span>;
  return (
    <button
      type="button"
      disabled={champion.tid == null}
      onClick={() => champion.tid != null && onSelectTeam(champion.tid)}
      className="flex items-center gap-2 text-left disabled:cursor-default enabled:hover:opacity-80"
    >
      {champion.logoUrl ? (
        <img src={champion.logoUrl} alt="" className="h-6 w-6 shrink-0 object-contain" referrerPolicy="no-referrer" />
      ) : (
        <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
      )}
      <span className="text-xs font-bold leading-tight text-white">{champion.name}</span>
    </button>
  );
};

export const EuropeanLeagueHistoryView: React.FC<Props> = ({
  state,
  currentSeason,
  onSelectSeason,
  onSelectTeam,
}) => {
  const branchSeason = Number(state.euroStartSeason ?? currentSeason);
  const [archives, setArchives] = useState<Record<string, CompetitionSeason[]>>({});
  const [selectedHistory, setSelectedHistory] = useState<{ id: string; season?: number } | null>(null);
  const [, setPortraitsReady] = useState(false);

  useEffect(() => {
    ensurePortraitLookupsLoaded().then(() => setPortraitsReady(true)).catch(() => {});
  }, []);

  const columns = useMemo<CompetitionColumn[]>(() => {
    return getEuroHistoryCompetitions(state)
      .map(competition => ({
        id: competition.id,
        label: competition.shortName || competition.displayName,
        hasHistory: hasCompetitionHistorySource(competition.id),
      }));
  }, [state.activeCompetitions, state.clubAliasMap, state.euroCompetitionTeamTids, state.euroPrimaryCompetitionId, state.nonNBATeams, state.schedule]);
  const primaryCompetitionId = state.euroPrimaryCompetitionId ?? columns[0]?.id ?? 'endesa';

  useEffect(() => {
    let mounted = true;
    const sourcedColumns = columns.filter(column => column.hasHistory);
    setArchives({});
    Promise.all(sourcedColumns.map(async column => ({
      id: column.id,
      rows: (await fetchCompetitionHistory(column.id as CompetitionGistId))
        .filter(row => (competitionSeasonEndYear(row) ?? Infinity) < branchSeason),
    })).map(request => request.catch(() => ({ id: '', rows: [] as CompetitionSeason[] }))))
      .then(entries => {
        if (mounted) setArchives(Object.fromEntries(entries.filter(entry => entry.id).map(entry => [entry.id, entry.rows])));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [branchSeason, columns]);

  const rows = useMemo(() => {
    const results = new Map<string, ChampionEntry>();
    const seasons = new Set<number>([currentSeason]);
    const allTeams = [...state.teams, ...(state.nonNBATeams ?? [])];
    const competitionLabels = new Map(columns.map(column => [column.id, column.label]));
    const awardsBySeason = new Map<number, IndividualAwardEntry[]>();
    const seenAwards = new Set<string>();
    const addAward = (awardSeason: number, award: IndividualAwardEntry) => {
      const key = `${awardSeason}:${award.competitionId}:${award.type}:${award.name}`;
      if (seenAwards.has(key)) return;
      seenAwards.add(key);
      awardsBySeason.set(awardSeason, [...(awardsBySeason.get(awardSeason) ?? []), award]);
    };
    for (const award of state.historicalAwards ?? []) {
      const awardSeason = Number(award.season);
      const competitionId = String(award.competitionId ?? '');
      const competition = competitionLabels.get(competitionId);
      if (!competition || !Number.isFinite(awardSeason) || awardSeason > currentSeason) continue;
      if (['Champion', 'Runner Up'].includes(String(award.type))) continue;
      addAward(awardSeason, {
        competitionId,
        competition,
        type: String(award.type),
        name: String(award.name),
        role: award.role,
      });
    }
    const teamFromName = (name: string) => {
      const target = normalizeName(name);
      return allTeams.find(team => {
        const full = normalizeName(getTeamFullName(team));
        const short = normalizeName(team.name);
        return full === target || short === target || (target.length > 5 && (full.includes(target) || target.includes(full)));
      });
    };
    for (const column of columns) {
      for (const season of archives[column.id] ?? []) {
        const endYear = competitionSeasonEndYear(season);
        const championName = cleanChampionName(season.Champions ?? season.Season_champions);
        if (!endYear) continue;
        seasons.add(endYear);
        if (championName) {
          const team = teamFromName(championName);
          const snapshot = team ? getHistoricalTeamSnapshot(team, endYear) : null;
          results.set(`${column.id}:${endYear}`, {
            name: team ? getTeamFullName({ ...team, ...snapshot } as any) : championName,
            tid: team ? Number('id' in team ? team.id : team.tid) : undefined,
            logoUrl: snapshot?.logoUrl,
          });
        }
        for (const award of getCompetitionSeasonAwards(column.id, season)) {
          addAward(endYear, {
            competitionId: column.id,
            competition: column.label,
            type: award.type,
            name: award.name,
            team: award.team,
            role: award.role,
          });
        }
      }
    }
    for (const column of columns) {
      for (const entry of (state.competitionHistory?.[column.id] ?? []) as any[]) {
        const season = Number(entry?.season);
        if (!Number.isFinite(season) || season > currentSeason || entry?.championTid == null) continue;
        seasons.add(season);
        const team = resolveAnyTeam(Number(entry.championTid), state.teams, state.nonNBATeams ?? []);
        const snapshot = team ? getHistoricalTeamSnapshot(team, season) : null;
        results.set(`${column.id}:${season}`, {
          name: team ? getTeamFullName({ ...team, ...snapshot } as any) : String(entry.championName ?? 'Unknown champion'),
          tid: team ? Number(team.id) : undefined,
          logoUrl: snapshot?.logoUrl ?? entry.championLogoUrl,
        });
      }
    }
    return [...seasons]
      .filter(season => Number.isFinite(season) && season <= currentSeason)
      .sort((left, right) => right - left)
      .map(season => ({
        season,
        champions: Object.fromEntries(columns.map(column => [column.id, results.get(`${column.id}:${season}`)])),
        individualAwards: (awardsBySeason.get(season) ?? [])
          .filter(award => award.competitionId === primaryCompetitionId),
      }));
  }, [archives, columns, currentSeason, primaryCompetitionId, state.competitionHistory, state.historicalAwards, state.nonNBATeams, state.teams]);

  const awardTypes = useMemo(() => {
    const types: string[] = [];
    for (const row of rows) {
      for (const award of row.individualAwards) {
        if (/^all[- ]|first team|second team|third team|best five|ideal starting five/i.test(award.type)) continue;
        if (!types.includes(award.type)) types.push(award.type);
      }
    }
    return types;
  }, [rows]);

  const playerByName = useMemo(() => new Map((state.players ?? []).map(player => [normalizeName(player.name), player])), [state.players]);
  const awardView = (award: IndividualAwardEntry | undefined) => award ? {
    ...award,
    imgURL: resolveLeagueHistoryPortraitUrl(playerByName.get(normalizeName(award.name)), award.name, true)
      ?? getPhotoByName(award.name),
    disableNameFallback: award.role !== 'player',
  } : null;

  if (selectedHistory) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={() => setSelectedHistory(null)}
          className="m-3 mb-0 inline-flex w-fit items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> All competitions
        </button>
        <div className="min-h-0 flex-1"><CompetitionHistoryView specId={selectedHistory.id} initialSeason={selectedHistory.season} /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 md:p-8">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col">
        <div className="mb-4 shrink-0">
          <h2 className="flex items-center gap-3 text-3xl font-black uppercase tracking-tight text-white">
            <Trophy className="text-amber-400" size={32} />
            Competition History
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-400">One season per row, with every league and cup winner kept in its own column.</p>
        </div>

        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-3 md:hidden">
          <div className="space-y-3">
            {rows.map(row => (
              <section key={row.season} className={row.season === currentSeason ? 'rounded-xl border border-blue-500/20 bg-blue-950/20 p-3' : 'rounded-xl border border-slate-800 bg-slate-950/60 p-3'}>
                <button type="button" onClick={() => onSelectSeason(row.season)} className="mb-3 text-sm font-black text-white hover:text-sky-300">
                  {seasonLabel(row.season)} {row.season === currentSeason ? '· NOW' : ''}
                </button>
                <div className="space-y-3">
                  {columns.map(column => (
                    <div key={column.id} className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3">
                      <button type="button" onClick={() => setSelectedHistory({ id: column.id })} className="text-left text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-amber-300">{column.label}</button>
                      <ChampionCell champion={row.champions[column.id]} pending={row.season === currentSeason} onSelectTeam={onSelectTeam} />
                    </div>
                  ))}
                  {awardTypes.map(type => (
                    <div key={type} className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">{type}</span>
                      <AwardCell award={awardView(row.individualAwards.find(award => award.type === type))} isCurrent={row.season === currentSeason} onClick={() => setSelectedHistory({ id: primaryCompetitionId, season: row.season })} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="hidden flex-1 overflow-auto rounded-2xl border border-slate-800 bg-slate-900/50 md:block">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-sm">
              <tr>
                <th className="border-b border-slate-800 p-3 font-bold text-slate-300">Season</th>
                {columns.map(column => (
                  <th key={column.id} className="min-w-[180px] border-b border-slate-800 p-3 font-bold text-amber-300">
                    <button type="button" onClick={() => setSelectedHistory({ id: column.id })} className="hover:text-amber-100">{column.label}</button>
                  </th>
                ))}
                {awardTypes.map(type => <th key={type} className="min-w-[180px] border-b border-slate-800 p-3 text-xs font-bold text-sky-300">{type}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.map(row => (
                <tr key={row.season} className={row.season === currentSeason ? 'bg-blue-950/15' : 'hover:bg-slate-800/30'}>
                  <td className="p-3 align-top">
                    <button type="button" onClick={() => onSelectSeason(row.season)} className="whitespace-nowrap text-sm font-black text-white hover:text-sky-300">
                      {seasonLabel(row.season)} {row.season === currentSeason ? '· NOW' : ''}
                    </button>
                  </td>
                  {columns.map(column => (
                    <td key={column.id} className="p-3 align-top">
                      <ChampionCell champion={row.champions[column.id]} pending={row.season === currentSeason} onSelectTeam={onSelectTeam} />
                    </td>
                  ))}
                  {awardTypes.map(type => (
                    <td key={type} className="p-3 align-middle">
                      <AwardCell award={awardView(row.individualAwards.find(award => award.type === type))} isCurrent={row.season === currentSeason} onClick={() => setSelectedHistory({ id: primaryCompetitionId, season: row.season })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
