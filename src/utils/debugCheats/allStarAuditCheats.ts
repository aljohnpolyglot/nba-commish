import type { GameState } from '../../types';
import {
  ensureBiosLoaded,
  ensureFullRosterPlayerDataLoaded,
  getBioBySlug,
  getBioByName,
  getFullRosterAwardsForIdentity,
  getFullRosterPlayerDataCount,
  getFullRosterPlayerDataDiagnostics,
  getFullRosterPlayerForIdentity,
} from '../../data/realPlayerDataFetcher';
import {
  mergeNormalizedPlayerAwards,
  normalizePlayerAwardRows,
  normalizePlayerAwardType,
} from '../playerAwardNormalizer';
import { filterAwardsToVisibleTimeline } from '../awardHistory';
import { getTeamFullName } from '../teamNames';
import {
  getAllStarHostDecisionYear,
  normalizeAllStarHost,
} from '../../services/allStar/hostAutoResolver';
import { copyTextToClipboard, type CheatResult } from './shared';

type AllStarAuditRow = {
  player: string;
  slug: string;
  tid: number | string;
  status: string;
  saveAllStar: number;
  sourceAllStar: number;
  visibleAllStar: number;
  missingSeasons: string;
  extraSaveSeasons: string;
  statStarFields: string;
  sourceAwardRows: number;
  sourceAwardSample: string;
  compactBioAwardRows: number;
  compactBioAllStar: number;
  fullRosterAwardRows: number;
  fullRosterAllStar: number;
  sourcePath: string;
  bioSlug: string;
  bioName: string;
  fullRosterName: string;
  fullRosterSlug: string;
  compactBioAwardRowsAnySeason: number;
  compactBioAllStarAnySeason: number;
  fullRosterAwardRowsAnySeason: number;
  fullRosterAllStarAnySeason: number;
};

const FOCUS_NAMES = [
  'Kareem Abdul-Jabbar',
  'Lew Alcindor',
  'Bill Russell',
  'Wilt Chamberlain',
  'Bob Cousy',
  'Oscar Robertson',
  'Jerry West',
  'Elgin Baylor',
  'Kobe Bryant',
  'Tim Duncan',
  'Kevin Garnett',
  'Chris Bosh',
  'Paul Pierce',
];

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`-]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function playerSlug(player: any): string {
  return String(player?.slug ?? player?.srID ?? '').trim();
}

function savedAllStarSeasons(player: any, maxSeason: number): number[] {
  return filterAwardsToVisibleTimeline(player?.awards ?? [], maxSeason)
    .filter((award: any) => normalizePlayerAwardType(award?.type) === 'All-Star')
    .map((award: any) => Number(award.season))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function allStarSeasons(awards: Array<{ season: number; type: string }>): number[] {
  return awards
    .filter((award) => award.type === 'All-Star')
    .map((award) => Number(award.season))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function sourceAwardBreakdown(player: any, maxSeason: number) {
  const slug = playerSlug(player);
  const bio = slug ? getBioBySlug(slug) : getBioByName(String(player?.name ?? ''));
  const identity = {
    srID: slug || player?.srID,
    slug: slug || player?.slug,
    name: bio?.name ?? player?.name,
  };
  const fullRosterPlayer = getFullRosterPlayerForIdentity(identity);
  const sourceSlug = String(fullRosterPlayer?.srID ?? fullRosterPlayer?.slug ?? slug ?? '').trim();
  const compactBioAwardsAnySeason = normalizePlayerAwardRows(bio?.awards);
  const fullRosterAwardsAnySeason = getFullRosterAwardsForIdentity(identity);
  const compactBioAwards = filterAwardsToVisibleTimeline(compactBioAwardsAnySeason, maxSeason);
  const fullRosterAwards = filterAwardsToVisibleTimeline(fullRosterAwardsAnySeason, maxSeason);
  const mergedAwards = filterAwardsToVisibleTimeline(
    mergeNormalizedPlayerAwards(compactBioAwards, fullRosterAwards),
    maxSeason,
  );
  const compactBioAllStar = allStarSeasons(compactBioAwards);
  const fullRosterAllStar = allStarSeasons(fullRosterAwards);
  const mergedAllStar = allStarSeasons(mergedAwards);
  const sourcePath = fullRosterAllStar.length > 0
    ? 'full-roster'
    : compactBioAllStar.length > 0
      ? 'compact-bio'
      : fullRosterAwards.length > 0
        ? 'full-roster-awards-no-allstar'
        : compactBioAwards.length > 0
          ? 'compact-bio-awards-no-allstar'
          : fullRosterPlayer
            ? 'full-roster-raw-no-awards'
            : bio
              ? 'compact-bio-raw-no-awards'
              : 'no-source-match';
  return {
    compactBioAwards,
    fullRosterAwards,
    mergedAwards,
    compactBioAllStar,
    fullRosterAllStar,
    mergedAllStar,
    sourcePath,
    sourceSlug,
    bioSlug: String((bio as any)?.slug ?? slug ?? '').trim(),
    bioName: String(bio?.name ?? '').trim(),
    fullRosterName: String(fullRosterPlayer?.name ?? '').trim(),
    fullRosterSlug: String(fullRosterPlayer?.srID ?? fullRosterPlayer?.slug ?? '').trim(),
    compactBioAwardRowsAnySeason: compactBioAwardsAnySeason.length,
    compactBioAllStarAnySeason: allStarSeasons(compactBioAwardsAnySeason).length,
    fullRosterAwardRowsAnySeason: fullRosterAwardsAnySeason.length,
    fullRosterAllStarAnySeason: allStarSeasons(fullRosterAwardsAnySeason).length,
  };
}

function sourceAllStarSeasons(player: any, maxSeason: number): number[] {
  return sourceAwardBreakdown(player, maxSeason).mergedAllStar;
}

function sourceAwardSummary(player: any, maxSeason: number) {
  const source = sourceAwardBreakdown(player, maxSeason);
  const awards = source.mergedAwards;
  return {
    rows: awards.length,
    sample: awards.slice(0, 8).map((award) => `${award.season}:${award.type}`).join(' | '),
    compactBioAwardRows: source.compactBioAwards.length,
    compactBioAllStar: source.compactBioAllStar.length,
    fullRosterAwardRows: source.fullRosterAwards.length,
    fullRosterAllStar: source.fullRosterAllStar.length,
    sourcePath: source.sourcePath,
    sourceSlug: source.sourceSlug,
    bioSlug: source.bioSlug,
    bioName: source.bioName,
    fullRosterName: source.fullRosterName,
    fullRosterSlug: source.fullRosterSlug,
    compactBioAwardRowsAnySeason: source.compactBioAwardRowsAnySeason,
    compactBioAllStarAnySeason: source.compactBioAllStarAnySeason,
    fullRosterAwardRowsAnySeason: source.fullRosterAwardRowsAnySeason,
    fullRosterAllStarAnySeason: source.fullRosterAllStarAnySeason,
  };
}

function statStarFields(player: any): string {
  const fields = new Set<string>();
  for (const stat of player?.stats ?? []) {
    for (const key of Object.keys(stat ?? {})) {
      if (key.toLowerCase().includes('star') && (stat as any)[key]) fields.add(key);
    }
  }
  return [...fields].sort().join(', ');
}

function diff(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  return left.filter((season) => !rightSet.has(season));
}

function compactSeasons(seasons: number[]): string {
  return seasons.length ? seasons.join(', ') : '';
}

function findPlayer(state: GameState, name: string): any {
  const key = normalizeName(name);
  return (state.players ?? []).find((player: any) => normalizeName(player?.name) === key);
}

function allStarRosterCounts(state: GameState): Record<string, number> {
  const roster = Array.isArray((state.allStar as any)?.roster) ? (state.allStar as any).roster : [];
  return roster.reduce((acc: Record<string, number>, entry: any) => {
    const conf = String(entry?.conference ?? 'Unknown');
    acc[conf] = (acc[conf] ?? 0) + 1;
    return acc;
  }, {});
}

export async function runAllStarAudit(state: GameState): Promise<CheatResult> {
  await Promise.all([ensureBiosLoaded(), ensureFullRosterPlayerDataLoaded()]);

  const currentYear = Number(state.leagueStats?.year ?? new Date().getFullYear());
  const maxSeason = Number.isFinite(currentYear) ? currentYear : Infinity;
  const players = state.players ?? [];
  const rows: AllStarAuditRow[] = players
    .map((player: any): AllStarAuditRow => {
      const saveSeasons = savedAllStarSeasons(player, maxSeason);
      const source = sourceAwardBreakdown(player, maxSeason);
      const sourceSeasons = source.mergedAllStar;
      const sourceSummary = sourceAwardSummary(player, maxSeason);
      const visibleSeasons = filterAwardsToVisibleTimeline(player?.awards ?? [], maxSeason)
        .filter((award: any) => normalizePlayerAwardType(award?.type) === 'All-Star')
        .map((award: any) => Number(award.season))
        .filter(Number.isFinite);
      return {
        player: String(player?.name ?? ''),
        slug: playerSlug(player),
        tid: Number.isFinite(Number(player?.tid)) ? Number(player.tid) : '',
        status: String(player?.status ?? ''),
        saveAllStar: saveSeasons.length,
        sourceAllStar: sourceSeasons.length,
        visibleAllStar: visibleSeasons.length,
        missingSeasons: compactSeasons(diff(sourceSeasons, saveSeasons)),
        extraSaveSeasons: compactSeasons(diff(saveSeasons, sourceSeasons)),
        statStarFields: statStarFields(player),
        sourceAwardRows: sourceSummary.rows,
        sourceAwardSample: sourceSummary.sample,
        compactBioAwardRows: sourceSummary.compactBioAwardRows,
        compactBioAllStar: sourceSummary.compactBioAllStar,
        fullRosterAwardRows: sourceSummary.fullRosterAwardRows,
        fullRosterAllStar: sourceSummary.fullRosterAllStar,
        sourcePath: sourceSummary.sourcePath,
        bioSlug: sourceSummary.bioSlug,
        bioName: sourceSummary.bioName,
        fullRosterName: sourceSummary.fullRosterName,
        fullRosterSlug: sourceSummary.fullRosterSlug,
        compactBioAwardRowsAnySeason: sourceSummary.compactBioAwardRowsAnySeason,
        compactBioAllStarAnySeason: sourceSummary.compactBioAllStarAnySeason,
        fullRosterAwardRowsAnySeason: sourceSummary.fullRosterAwardRowsAnySeason,
        fullRosterAllStarAnySeason: sourceSummary.fullRosterAllStarAnySeason,
      };
    })
    .filter((row) => row.saveAllStar > 0 || row.sourceAllStar > 0 || row.statStarFields);

  const missing = rows
    .filter((row) => row.sourceAllStar > row.saveAllStar || row.missingSeasons)
    .sort((left, right) => right.sourceAllStar - left.sourceAllStar || left.player.localeCompare(right.player));
  const focus = FOCUS_NAMES
    .map((name) => {
      const row = rows.find((candidate) => normalizeName(candidate.player) === normalizeName(name));
      if (row) return row;
      const player = findPlayer(state, name);
      const sourceSummary = sourceAwardSummary(player ?? { name }, maxSeason);
      return {
        player: name,
        slug: playerSlug(player) || sourceSummary.sourceSlug,
        tid: player ? player.tid : '',
        status: player ? String(player.status ?? '') : 'not in save',
        saveAllStar: 0,
        sourceAllStar: sourceAllStarSeasons(player ?? { name }, maxSeason).length,
        visibleAllStar: 0,
        missingSeasons: compactSeasons(sourceAllStarSeasons(player ?? { name }, maxSeason)),
        extraSaveSeasons: '',
        statStarFields: '',
        sourceAwardRows: sourceSummary.rows,
        sourceAwardSample: sourceSummary.sample,
        compactBioAwardRows: sourceSummary.compactBioAwardRows,
        compactBioAllStar: sourceSummary.compactBioAllStar,
        fullRosterAwardRows: sourceSummary.fullRosterAwardRows,
        fullRosterAllStar: sourceSummary.fullRosterAllStar,
        sourcePath: sourceSummary.sourcePath,
        bioSlug: sourceSummary.bioSlug,
        bioName: sourceSummary.bioName,
        fullRosterName: sourceSummary.fullRosterName,
        fullRosterSlug: sourceSummary.fullRosterSlug,
        compactBioAwardRowsAnySeason: sourceSummary.compactBioAwardRowsAnySeason,
        compactBioAllStarAnySeason: sourceSummary.compactBioAllStarAnySeason,
        fullRosterAwardRowsAnySeason: sourceSummary.fullRosterAwardRowsAnySeason,
        fullRosterAllStarAnySeason: sourceSummary.fullRosterAllStarAnySeason,
      } as AllStarAuditRow;
    });

  const focusOnlyRows = focus.filter((row) => !rows.some((candidate) => normalizeName(candidate.player) === normalizeName(row.player)));
  const debugRows = [
    ...rows,
    ...focusOnlyRows.filter((row) => row.sourceAllStar > 0 || row.sourceAwardRows > 0 || row.sourcePath !== 'no-source-match'),
  ];
  const currentRoster = allStarRosterCounts(state);
  const sourceTotal = rows.reduce((sum, row) => sum + row.sourceAllStar, 0);
  const saveTotal = rows.reduce((sum, row) => sum + row.saveAllStar, 0);
  const focusSourceTotal = focus.reduce((sum, row) => sum + row.sourceAllStar, 0);
  const sourcePathCounts = debugRows.reduce((acc: Record<string, number>, row) => {
    acc[row.sourcePath] = (acc[row.sourcePath] ?? 0) + 1;
    return acc;
  }, {});
  const fullRosterDiagnostics = getFullRosterPlayerDataDiagnostics();
  const summary = {
    date: state.date,
    currentYear,
    playerRowsWithAnyAllStarSignal: rows.length,
    debugRowsWithSourceOnlyFocus: debugRows.length,
    sourceAllStarAwards: sourceTotal,
    focusSourceAllStarAwards: focusSourceTotal,
    savedAllStarAwards: saveTotal,
    missingPlayerRows: missing.length,
    sourcePathCounts,
    fullRosterPlayersLoaded: getFullRosterPlayerDataCount(),
    fullRosterLoadState: fullRosterDiagnostics.state,
    fullRosterSelectedUrl: fullRosterDiagnostics.selectedUrl ?? '',
    fullRosterAttempts: fullRosterDiagnostics.attempts.map((attempt) => ({
      url: attempt.url,
      ok: attempt.ok,
      status: attempt.status ?? '',
      players: attempt.players ?? '',
      error: attempt.error ?? '',
    })),
    currentAllStarRosterCounts: currentRoster,
    allStarStateKeys: state.allStar ? Object.keys(state.allStar as any).sort().join(', ') : 'none',
  };

  console.group('%cALLSTARAUDIT', 'color:#f59e0b;font-weight:bold');
  console.log(summary);
  console.log('Focus players');
  console.table(focus);
  console.log('Players where source All-Star seasons are missing from save player.awards');
  console.table(missing.slice(0, 80));
  console.log('All rows with any All-Star/source signal, including source-only focus players');
  console.table(debugRows.slice(0, 160));
  console.groupEnd();

  const text = [
    `ALLSTARAUDIT currentYear=${currentYear} sourceAllStarAwards=${sourceTotal} focusSourceAllStarAwards=${focusSourceTotal} savedAllStarAwards=${saveTotal}`,
    'player\tslug\ttid\tstatus\tsaveAllStar\tsourceAllStar\tvisibleAllStar\tmissingSeasons\textraSaveSeasons\tstatStarFields\tsourceAwardRows\tsourceAwardSample\tcompactBioAwardRows\tcompactBioAllStar\tfullRosterAwardRows\tfullRosterAllStar\tsourcePath\tbioSlug\tbioName\tfullRosterName\tfullRosterSlug\tcompactBioAwardRowsAnySeason\tcompactBioAllStarAnySeason\tfullRosterAwardRowsAnySeason\tfullRosterAllStarAnySeason',
    ...debugRows.map((row) => [
      row.player,
      row.slug,
      row.tid,
      row.status,
      row.saveAllStar,
      row.sourceAllStar,
      row.visibleAllStar,
      row.missingSeasons,
      row.extraSaveSeasons,
      row.statStarFields,
      row.sourceAwardRows,
      row.sourceAwardSample,
      row.compactBioAwardRows,
      row.compactBioAllStar,
      row.fullRosterAwardRows,
      row.fullRosterAllStar,
      row.sourcePath,
      row.bioSlug,
      row.bioName,
      row.fullRosterName,
      row.fullRosterSlug,
      row.compactBioAwardRowsAnySeason,
      row.compactBioAllStarAnySeason,
      row.fullRosterAwardRowsAnySeason,
      row.fullRosterAllStarAnySeason,
    ].join('\t')),
  ].join('\n');
  await copyTextToClipboard(text);
  const debugTarget = globalThis as any;
  debugTarget.__lastAllStarAuditSummary = summary;
  debugTarget.__lastAllStarAuditRows = rows;
  debugTarget.__lastAllStarAuditMissingRows = missing;
  debugTarget.__lastAllStarAuditFocusRows = focus;
  debugTarget.__lastAllStarAuditDebugRows = debugRows;

  return {
    title: 'ALLSTARAUDIT',
    body: `${missing.length} player row(s) have source All-Star seasons missing from save awards. Console tables + clipboard TSV ready.`,
    ok: missing.length === 0,
  };
}

export function runAllStarHostAudit(state: GameState): CheatResult {
  const seasonYear = Number(state.leagueStats?.year);
  const targetHostYear = getAllStarHostDecisionYear(state.leagueStats);
  const rawHosts = Array.isArray(state.leagueStats?.allStarHosts)
    ? state.leagueStats.allStarHosts
    : [];
  const rows = rawHosts.map((rawHost, index) => {
    const host = normalizeAllStarHost(rawHost);
    const hostTeams = (host?.teamIds ?? [])
      .map(teamId => state.teams.find(team => team.id === teamId))
      .filter(team => team != null)
      .map(getTeamFullName);
    return {
      index,
      year: host?.year ?? Number(rawHost?.year),
      target: host?.year === targetHostYear,
      city: host?.city ?? '',
      arena: host?.arena ?? '',
      teamIds: (host?.teamIds ?? []).join(', '),
      teams: hostTeams.join(' | '),
      valid: host != null,
      complete: (host?.teamIds.length ?? 0) > 0,
    };
  });
  const taskRecords = Object.values(state.commissionerTasks?.records ?? {})
    .filter(record => record.taskId === 'all_star_host');
  const target = rows.find(row => row.year === targetHostYear);
  const summary = {
    date: state.date,
    seasonYear,
    targetHostYear,
    rawHostCount: rawHosts.length,
    targetAssigned: target?.complete ?? false,
    target,
    taskRecords,
  };

  console.group('%c[ALLSTAR_HOST] save snapshot', 'color:#38bdf8;font-weight:bold');
  console.log(summary);
  console.table(rows);
  console.groupEnd();

  const debugTarget = globalThis as typeof globalThis & {
    __lastAllStarHostAudit?: typeof summary;
    __lastAllStarHostRows?: typeof rows;
  };
  debugTarget.__lastAllStarHostAudit = summary;
  debugTarget.__lastAllStarHostRows = rows;

  return {
    title: 'ALLSTARHOST',
    body: target?.complete
      ? `${targetHostYear} host is assigned. Snapshot printed to DevTools.`
      : `${targetHostYear} host is not assigned. Snapshot printed to DevTools.`,
    ok: target?.complete ?? false,
  };
}
