import React, { useMemo } from 'react';
import { Hash, Shirt, Shield } from 'lucide-react';
import type { NBAPlayer, NBAGMStat } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { getTeamFullName } from '../../../utils/teamNames';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl, getTeamPrimaryColor } from '../../../utils/teamAssets';
import { filterCurrentPbaImportedStats, isCurrentPbaImportedStat, isPbaCareerPlayer } from './playerBioStatsFilters';
import {
  ensureFullRosterPlayerDataLoaded,
  ensureNativeHistoricalStatsLoaded,
  getNativeHistoricalStatsForIdentity,
} from '../../../data/realPlayerDataFetcher';
import { isInternationalCompetitionId } from '../../../services/fiba/competitionIdentity';
import { getPreloadedExternalTeams } from '../../../services/playerBioPreload';
import { getHistoricalNbaBranchSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { getPlayerBioStatCompetitionKey } from './playerBioCrossLeagueHistory';
import { CountryFlag } from '../../shared/CountryFlag';
import { normalizeHistoricalNbaTeamAbbrev } from '../../../utils/historicalNbaTeamAbbrev';

interface JerseyRun {
  key: string;
  identityKey: string;
  tid: number;
  number: string;
  start: number;
  end: number;
  gp: number;
  competitions: Set<string>;
  teamAbbrev?: string;
  league: 'NBA' | 'PBA' | 'External' | 'International';
  countryName?: string;
}

function collapseSingleNumberClubRuns(runs: JerseyRun[]): JerseyRun[] {
  const groups = new Map<string, JerseyRun[]>();
  for (const run of runs) {
    const key = `${run.league}|${run.identityKey}|${run.countryName ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const collapsed: JerseyRun[] = [];
  for (const clubRuns of groups.values()) {
    const knownNumbers = [...new Set(clubRuns.map(run => run.number).filter(number => number !== '-'))];
    if (clubRuns.length === 1 || knownNumbers.length > 1) {
      collapsed.push(...clubRuns);
      continue;
    }
    const ordered = [...clubRuns].sort((left, right) => left.start - right.start);
    const first = ordered[0];
    collapsed.push({
      ...first,
      key: `${first.teamAbbrev ?? first.tid}|${knownNumbers[0] ?? '-'}|${ordered[0].start}|${ordered.at(-1)?.end ?? ordered[0].end}`,
      number: knownNumbers[0] ?? '-',
      start: ordered[0].start,
      end: Math.max(...ordered.map(run => run.end)),
      gp: ordered.reduce((sum, run) => sum + run.gp, 0),
      competitions: new Set(ordered.flatMap(run => [...run.competitions])),
    });
  }
  return collapsed.sort((left, right) => right.end - left.end || right.start - left.start);
}

const cleanNumber = (value: unknown): string => {
  const text = String(value ?? '').trim();
  return text ? text : '-';
};

const seasonRange = (start: number, end: number): string =>
  start === end ? `${start}` : `${start}-${String(end).slice(-2)}`;

const formatCompetitionLabel = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/^pba-/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized === 'fiba' || normalized === 'fiba national team' || normalized === 'international') return 'FIBA';
  if (normalized === 'endesa' || normalized === 'liga endesa' || normalized === 'esp 1') return 'Endesa';
  if (normalized === 'europe' || normalized === 'euroleague') return 'EuroLeague';
  if (normalized === 'eurocup') return 'EuroCup';
  if (normalized === 'nba') return 'NBA';
  if (normalized === 'nba summer league') return 'NBA Summer League';
  if (normalized === 'pba') return 'PBA';
  return normalized.replace(/\b\w/g, letter => letter.toUpperCase());
};

export function getJerseyCompetitionLabels(primaryLeague: string, competitions: Iterable<string>, international: boolean): string[] {
  const labels = international ? ['FIBA'] : [formatCompetitionLabel(primaryLeague)];
  for (const competition of competitions) labels.push(formatCompetitionLabel(competition));
  return labels.filter((label, index) => label && labels.indexOf(label) === index);
}

const resolveTeam = (tid: number, teamAbbrev: string | undefined, teams: any[], nonNBATeams: any[], preferLeague?: string): any | null => {
  const abbrev = String(teamAbbrev ?? '').trim().toUpperCase();
  if (abbrev) {
    if (preferLeague === 'PBA') {
      const pbaMatch = nonNBATeams.find(team => team?.league === 'PBA' && String(team.abbrev ?? '').trim().toUpperCase() === abbrev);
      if (pbaMatch) return pbaMatch;
    } else if (preferLeague === 'External') {
      const externalMatch = nonNBATeams.find(team => String(team.abbrev ?? '').trim().toUpperCase() === abbrev);
      if (externalMatch) return externalMatch;
    } else {
      const nbaMatch = teams.find(team => String(team.abbrev ?? '').trim().toUpperCase() === abbrev);
      if (nbaMatch) return nbaMatch;
    }
  }
  if (preferLeague === 'PBA') {
    const pbaTeams = nonNBATeams.filter(team => team?.league === 'PBA');
    const directPba = pbaTeams.find(team => team.tid === tid);
    if (directPba) return directPba;
    if (tid >= 0 && tid < 1000) {
      const offsetPba = pbaTeams.find(team => team.tid === tid + 2000);
      if (offsetPba) return offsetPba;
    }
  }
  if (tid >= 0 && tid < 100) return teams.find(team => team.id === tid) ?? null;
  const direct = nonNBATeams.find(team => team.tid === tid);
  if (direct) return direct;
  const offset = Math.floor(tid / 1000) * 1000;
  return offset > 0 ? nonNBATeams.find(team => team.tid === tid - offset) ?? null : null;
};

export function resolveJerseyStatTid(
  raw: NBAGMStat & { abbrev?: string; teamAbbrev?: string },
  teams: any[],
  externalTeams: any[],
  nonNBATeams: any[],
): number {
  const currentTid = Number(raw.tid);
  const abbrev = String(raw.abbrev ?? raw.teamAbbrev ?? '').trim().toUpperCase();
  if (getPlayerBioStatCompetitionKey(raw) === 'nba' && currentTid >= 0 && currentTid < 100) {
    const canonicalAbbrev = normalizeHistoricalNbaTeamAbbrev(abbrev);
    if (canonicalAbbrev) {
      const nbaTeam = [...teams, ...externalTeams].find(team =>
        Number(team?.id) >= 0
        && Number(team?.id) < 100
        && normalizeHistoricalNbaTeamAbbrev(team?.abbrev) === canonicalAbbrev,
      );
      if (nbaTeam) return Number(nbaTeam.id);
    }
    return currentTid;
  }
  if (abbrev) {
    const externalTeam = nonNBATeams.find(team => String(team.abbrev ?? '').trim().toUpperCase() === abbrev);
    if (externalTeam) return Number(externalTeam.tid);
    const referenceTeam = externalTeams.find(team => String(team.abbrev ?? '').trim().toUpperCase() === abbrev);
    if (referenceTeam) return Number(referenceTeam.id ?? referenceTeam.tid ?? currentTid);
  }
  return currentTid;
}

const isPbaJerseyStat = (player: NBAPlayer, row: NBAGMStat, season: number): boolean => {
  const raw = row as any;
  const tid = Number(row.tid ?? player.tid);
  const source = String(raw._source ?? '').trim().toLowerCase();
  const archiveCompetitionId = String(raw._archiveCompetitionId ?? '').trim().toLowerCase();
  const competitionId = String(raw.competitionId ?? '').trim().toLowerCase();
  return isCurrentPbaImportedStat(player, row, season) ||
    source === 'pba-stats-archive' ||
    archiveCompetitionId.startsWith('pba-') ||
    competitionId.startsWith('pba-') ||
    (tid >= 2000 && tid < 3000);
};

export function buildPlayerJerseyRuns(player: NBAPlayer, season: number, sourceRows: NBAGMStat[] = (player.stats ?? []) as NBAGMStat[]): JerseyRun[] {
  const rows = filterCurrentPbaImportedStats(player, sourceRows, season)
    .filter(row => {
      const abbrev = String((row as any).abbrev ?? (row as any).teamAbbrev ?? '').trim();
      return !row.playoffs
        && Number(row.season) > 0
        && (Number(row.tid) >= 0 || !!abbrev);
    })
    .sort((a, b) => Number(a.season) - Number(b.season));
  const leagueForRow = (row: NBAGMStat): JerseyRun['league'] => {
    const international = isInternationalCompetitionId((row as any).competitionId)
      || String((row as any)._source ?? '').toLowerCase() === 'fiba-history';
    if (international) return 'International';
    if (isPbaJerseyStat(player, row, season)) return 'PBA';
    return getPlayerBioStatCompetitionKey(row) === 'nba' ? 'NBA' : 'External';
  };
  const normalizedAbbrevForRow = (row: NBAGMStat): string => {
    const raw = String((row as any).abbrev ?? (row as any).teamAbbrev ?? '').trim().toUpperCase();
    return leagueForRow(row) === 'NBA' ? normalizeHistoricalNbaTeamAbbrev(raw) : raw;
  };
  const abbrevsByLeagueTid = new Map<string, Set<string>>();
  for (const row of rows) {
    const abbrev = normalizedAbbrevForRow(row);
    if (!abbrev) continue;
    const key = `${leagueForRow(row)}|${Number(row.tid)}`;
    const values = abbrevsByLeagueTid.get(key) ?? new Set<string>();
    values.add(abbrev);
    abbrevsByLeagueTid.set(key, values);
  }
  const teamKey = (row: NBAGMStat) => {
    const league = leagueForRow(row);
    const tid = Number(row.tid);
    const observed = abbrevsByLeagueTid.get(`${league}|${tid}`) ?? new Set<string>();
    // A single observed abbreviation bridges sparse branch rows and richer
    // source rows even when their raw tids differ. Multiple abbreviations on
    // one tid mean a real franchise identity change, so the stable tid keeps
    // that continuous roster tenure together.
    const abbrev = observed.size > 1
      ? ''
      : normalizedAbbrevForRow(row) || [...observed][0] || '';
    return `${league}|${abbrev ? `ABBR:${abbrev}` : `TID:${tid}`}`;
  };
  const knownNumbers = new Map<string, Array<{ season: number; number: string }>>();
  for (const row of rows) {
    const number = cleanNumber(row.jerseyNumber ?? (Number(row.tid) === player.tid ? player.jerseyNumber : undefined));
    if (number === '-') continue;
    const list = knownNumbers.get(teamKey(row)) ?? [];
    list.push({ season: Number(row.season), number });
    knownNumbers.set(teamKey(row), list);
  }
  const numberForRow = (row: NBAGMStat) => {
    const direct = cleanNumber(row.jerseyNumber ?? (Number(row.tid) === player.tid ? player.jerseyNumber : undefined));
    if (direct !== '-') return direct;
    const known = knownNumbers.get(teamKey(row)) ?? [];
    if (known.length === 0) return '-';
    const distinct = [...new Set(known.map(entry => entry.number))];
    if (distinct.length === 1) return distinct[0];
    return [...known].sort((left, right) => Math.abs(left.season - Number(row.season)) - Math.abs(right.season - Number(row.season)))[0].number;
  };
  const bestRowsByKey = new Map<string, NBAGMStat>();
  rows.forEach(row => {
    const number = numberForRow(row);
    const key = `${Number(row.season)}|${teamKey(row)}|${number}|${getPlayerBioStatCompetitionKey(row)}`;
    const previous = bestRowsByKey.get(key);
    if (!previous || Number(row.gp ?? 0) > Number(previous.gp ?? 0)) bestRowsByKey.set(key, row);
  });
  const uniqueRows = [...bestRowsByKey.values()].sort((a, b) => Number(a.season) - Number(b.season));

  if (uniqueRows.length === 0 && player.tid >= 0) {
    return [{
      key: `${player.tid}|${cleanNumber(player.jerseyNumber)}|${season}`,
      identityKey: `TID:${player.tid}`,
      tid: player.tid,
      number: cleanNumber(player.jerseyNumber),
      start: season,
      end: season,
      gp: 0,
      competitions: new Set(),
      teamAbbrev: undefined,
      league: player.tid >= 2000 && player.tid < 3000 ? 'PBA' : player.tid >= 1000 ? 'External' : 'NBA',
    }];
  }

  const runs: JerseyRun[] = [];
  for (const row of uniqueRows) {
    const tid = Number(row.tid);
    const year = Number(row.season);
    const number = numberForRow(row);
    const competition = getPlayerBioStatCompetitionKey(row);
    const league = leagueForRow(row);
    const international = league === 'International';
    const identityKey = teamKey(row);
    const observedAbbrevs = abbrevsByLeagueTid.get(`${league}|${tid}`) ?? new Set<string>();
    const teamAbbrev = normalizedAbbrevForRow(row) || (observedAbbrevs.size === 1 ? [...observedAbbrevs][0] : '') || undefined;
    const last = runs[runs.length - 1];
    if (last && last.identityKey === identityKey && last.number === number && last.league === league && year <= last.end + 1) {
      last.end = Math.max(last.end, year);
      last.gp += Number(row.gp ?? 0);
      if (competition !== 'nba') last.competitions.add(competition);
      if (!last.teamAbbrev && teamAbbrev) last.teamAbbrev = teamAbbrev;
      continue;
    }
    runs.push({
      key: `${tid}|${number}|${year}|${runs.length}`,
      identityKey,
      tid,
      number,
      start: year,
      end: year,
      gp: Number(row.gp ?? 0),
      competitions: new Set(competition !== 'nba' ? [competition] : []),
      teamAbbrev,
      league,
      countryName: international
        ? String((row as any).teamName ?? (row as any).country ?? '').trim() || undefined
        : undefined,
    });
  }

  return collapseSingleNumberClubRuns(runs);
}

export const PlayerBioJerseyHistoryTab: React.FC<{ player: NBAPlayer }> = ({ player }) => {
  const { state } = useGame();
  const currentSeason = state.leagueStats?.year ?? new Date().getFullYear();
  const pbaMode = state.leagueStats?.uiMode === 'pba_isolated';
  const isFictional = state.leagueType === 'fictional';
  const externalTeams = getPreloadedExternalTeams(state.saveId);
  const [historicalNbaStats, setHistoricalNbaStats] = React.useState<NBAGMStat[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    if (isFictional) return () => { cancelled = true; };
    Promise.all([ensureFullRosterPlayerDataLoaded(), ensureNativeHistoricalStatsLoaded()])
      .then(() => {
        if (!cancelled) setHistoricalNbaStats(getNativeHistoricalStatsForIdentity(player));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isFictional, player.internalId, player.name, player.slug, player.srID]);
  const runs = useMemo(() => {
    if (isFictional) return buildPlayerJerseyRuns(player, currentSeason);
    const sourceCutoff = state.leagueStats?.uiMode === 'euro_isolated'
      ? Math.max(0, Number(state.euroStartSeason ?? currentSeason) - 1)
      : getHistoricalNbaBranchSeasonCutoff({
          currentYear: state.leagueStats?.year,
          leagueType: state.leagueType,
          moddedLeagueBase: state.moddedLeagueBase,
          nbaStartYear: state.nbaStartYear,
        }) ?? currentSeason;
    const rowsByKey = new Map<string, NBAGMStat>();
    const resolveSourceTid = (raw: NBAGMStat & { abbrev?: string; teamAbbrev?: string }) =>
      resolveJerseyStatTid(raw, state.teams, externalTeams, state.nonNBATeams ?? []);
    for (const raw of (player.stats ?? []) as Array<NBAGMStat & { abbrev?: string }>) {
      const row = { ...raw, tid: resolveSourceTid(raw) } as NBAGMStat;
      rowsByKey.set(`${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${getPlayerBioStatCompetitionKey(row)}`, row);
    }
    for (const raw of historicalNbaStats as Array<NBAGMStat & { abbrev?: string }>) {
      if (Number(raw.season ?? 0) > sourceCutoff) continue;
      const sourceTid = resolveSourceTid(raw);
      if (sourceTid === undefined || sourceTid < 0) continue;
      const row = { ...raw, tid: sourceTid } as NBAGMStat;
      const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}|${getPlayerBioStatCompetitionKey(row)}`;
      const existing = rowsByKey.get(key);
      if (!existing) {
        rowsByKey.set(key, row);
        continue;
      }
      const preferred = Number(existing.gp ?? 0) >= Number(row.gp ?? 0) ? existing : row;
      const fallback = preferred === existing ? row : existing;
      rowsByKey.set(key, { ...fallback, ...preferred, jerseyNumber: preferred.jerseyNumber ?? fallback.jerseyNumber });
    }
    return buildPlayerJerseyRuns(player, currentSeason, [...rowsByKey.values()]);
  }, [currentSeason, externalTeams, historicalNbaStats, isFictional, pbaMode, player, state.leagueStats, state.leagueType, state.moddedLeagueBase, state.nbaStartYear, state.nonNBATeams, state.teams]);

  return (
    <div className="p-6 md:p-10 bg-[#080808]">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[3px]">Jersey History</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Shirt size={15} />
          <span>{runs.length} {runs.length === 1 ? 'run' : 'runs'}</span>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-500">
          No jersey history on file.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runs.map(run => {
            const international = run.league === 'International';
            const preferLeague = run.league === 'PBA' ? 'PBA' : run.league === 'External' ? 'External' : undefined;
            const team = international ? null : resolveTeam(run.tid, run.teamAbbrev, [...state.teams, ...externalTeams], state.nonNBATeams ?? [], preferLeague);
            const snapshot = team ? getHistoricalTeamSnapshot(team, run.start) : null;
            const primary = snapshot ? getTeamPrimaryColor(snapshot) : '#334155';
            const secondary = snapshot?.colors?.[1] ?? '#0f172a';
            const logo = snapshot ? getResolvedTeamLogoUrl(snapshot, run.start) : '';
            const teamName = international
              ? run.countryName || 'National Team'
              : snapshot
              ? getTeamFullName(snapshot)
              : run.teamAbbrev
                ? `${run.teamAbbrev} (${preferLeague ?? 'NBA'})`
                : 'Unknown Team';
            const competitions = Array.from(run.competitions).filter(Boolean);
            const competitionLabels = getJerseyCompetitionLabels(team?.league ?? run.league, competitions, international);

            return (
              <div key={run.key} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                <div className="relative h-32 p-4" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
                  <div className="absolute inset-0 bg-black/20" />
                  {logo && (
                    <img
                      src={logo}
                      alt=""
                      className="absolute right-3 top-3 h-16 w-16 object-contain opacity-25"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {!logo && international && (
                    <div className="absolute right-3 top-3 opacity-40">
                      <CountryFlag country={run.countryName} className="inline-flex h-12 w-16 rounded-md" />
                    </div>
                  )}
                  <div className="relative z-10 flex h-full items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[3px] text-white/70">{seasonRange(run.start, run.end)}</div>
                      <div className="mt-1 text-lg font-black text-white leading-tight">{international ? run.countryName ?? 'National Team' : snapshot?.abbrev ?? run.teamAbbrev ?? 'TEAM'}</div>
                    </div>
                    <div className="flex h-20 min-w-20 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-4">
                      <span className="text-4xl font-black text-white tabular-nums">#{run.number}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Shield size={15} className="text-slate-500" />
                    <span className="truncate">{teamName}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-400">
                    <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1">{run.gp} GP</span>
                    {competitionLabels.slice(0, 3).map(label => (
                      <span key={label} className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1">{label}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash size={13} className="text-slate-600" />
                    <div className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: primary }} />
                    <div className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: secondary }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
