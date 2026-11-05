import React, { useMemo, useState, useEffect } from 'react';
import { useGame } from '../../../store/GameContext';
import { Trophy, ChevronRight } from 'lucide-react';
import { LeagueHistoryDetailView } from './LeagueHistoryDetailView';
import { useBRefSeasonsBatch, getAllCachedSeasons, matchTeamByWikiName, generateAbbrev } from '../../../data/brefFetcher';
import { fetchCoachData, getCoachPhoto } from '../../../data/photos/coaches';
import { getHistoricalCoachPhoto } from '../../../services/staff/historicalNbaCoaches';
import { usePlayerQuickActions } from '../../../hooks/usePlayerQuickActions';
import { consumePendingLeagueHistorySeason, LEAGUE_HISTORY_SEASON_DETAIL_EVENT, peekPendingLeagueHistorySeason } from './LeagueHistoryNav';
import type { Tab } from '../../../types';
import {
  getHistoricalNbaBranchSeasonCutoff,
  getHistoricalNbaCompletedSeasonCutoff,
  isHistoricalNbaWhatIfSave,
} from '../../../services/playerDevelopment/hofHistoryWindow';
import { getEffectiveUiMode } from '../../../utils/useEffectiveUiMode';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { AwardCell, resolveLeagueHistoryPortraitUrl } from './leagueHistoryShared';
import { PbaLeagueHistoryView } from './PbaLeagueHistoryView';
import { isAwardVisibleInTimeline, isValidAwardSeason } from '../../../utils/awardHistory';
import { ensurePortraitLookupsLoaded } from '../../../data/realPlayerDataFetcher';
import { getTeamFullName } from '../../../utils/teamNames';
import { EuropeanLeagueHistoryView } from './EuropeanLeagueHistoryView';
import { normalizePlayerAwardType } from '../../../utils/playerAwardNormalizer';
import { resolveTeamHistoryRecord } from './historySeasonSource';
import { getBackgroundLeagueIds } from '../../../services/backgroundUniverse/backgroundUniverseSelectors';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { BackgroundLeagueHistoryView } from './BackgroundLeagueHistoryView';
import { getLeagueHistoryTeamPool } from './historyLeagueScope';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getPrimaryLeagueIdentityNamespace, resolveCanonicalTeamIdentityId } from '../../../services/teamIdentity';
import { findHistoryPlayerMatch } from './leagueHistoryDetailData';
import { resolveSavedHistoryPlayer } from '../../../services/navigation/historyPlayerNavigation';
import { getSaveVisiblePeople } from '../../../services/playerUniverse/canonicalHistoricalPeople';
interface LeagueHistoryViewProps {
  onViewChange?: (view: Tab) => void;
  initialHistoryLeagueId?: string;
}
export const LeagueHistoryView: React.FC<LeagueHistoryViewProps> = ({ initialHistoryLeagueId }) => {
  const { state, dispatchAction, navigateToRoute, navigateToPlayer } = useGame();
  const historyPeople = useMemo(
    () => getSaveVisiblePeople(state),
    [state.backgroundUniverse, state.historicalPeople, state.players],
  );
  const labels = useLeagueLabels();
  const isFictional = state.leagueType === 'fictional';
  const euroIsolated = getEffectiveUiMode(state as any) === 'euro_isolated';
  const pbaIsolated = getEffectiveUiMode(state as any) === 'pba_isolated';
  const wnbaIsolated = getEffectiveUiMode(state as any) === 'wnba_isolated';
  const historyTeams = useMemo(
    () => getLeagueHistoryTeamPool(state.teams, state.teamArchive, wnbaIsolated ? 'wnba' : 'nba'),
    [state.teamArchive, state.teams, wnbaIsolated],
  );
  const isHistoricalNbaSave = isHistoricalNbaWhatIfSave({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const completedSeasonCutoff = getHistoricalNbaCompletedSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const disableNbaHistoricalData = isFictional || euroIsolated || pbaIsolated || wnbaIsolated;
  const [selectedSeason, setSelectedSeason] = useState<number | null>(() => peekPendingLeagueHistorySeason());
  const [selectedHistoryLeagueId, setSelectedHistoryLeagueId] = useState(initialHistoryLeagueId || '__active__');
  const [coachPhotosReady, setCoachPhotosReady] = useState(false);
  useEffect(() => { fetchCoachData().then(() => setCoachPhotosReady(true)); }, []);
  useEffect(() => {
    consumePendingLeagueHistorySeason();
    const handleSeasonRequest = (event: Event) => {
      const requestedSeason = Number((event as CustomEvent<{ season?: number }>).detail?.season);
      if (Number.isFinite(requestedSeason)) {
        consumePendingLeagueHistorySeason();
        setSelectedSeason(requestedSeason);
      }
    };
    window.addEventListener(LEAGUE_HISTORY_SEASON_DETAIL_EVENT, handleSeasonRequest);
    return () => window.removeEventListener(LEAGUE_HISTORY_SEASON_DETAIL_EVENT, handleSeasonRequest);
  }, []);
  const quick = usePlayerQuickActions();
  const backgroundLeagueOptions = useMemo(
    () => getBackgroundLeagueIds(state),
    [state.backgroundUniverse],
  );
  useEffect(() => {
    if (!disableNbaHistoricalData) ensurePortraitLookupsLoaded().catch(() => {});
  }, [disableNbaHistoricalData]);

  const gotoTeamHistory = (tid: number) => {
    const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
    if (!team || !state.saveId) return;
    const namespace = 'league' in team && team.league
      ? String(team.league)
      : getPrimaryLeagueIdentityNamespace(state);
    navigateToRoute({
      kind: 'team',
      saveId: state.saveId,
      teamIdentityId: resolveCanonicalTeamIdentityId(team, namespace),
    });
  };

  const currentSeason = state.leagueStats.year;
  const currentSeasonComplete =
    (state.playoffs?.bracketComplete === true && state.playoffs?.champion != null)
    || (((state as any).seasonHistory ?? []) as any[]).some(entry =>
      Number(entry?.year) === Number(currentSeason) && (entry?.championTid != null || entry?.champion),
    )
    || (state.historicalAwards ?? []).some((award: any) =>
      Number(award?.season) === Number(currentSeason) && award?.type === 'Champion',
    );
  const basePopulatedSeasonCutoff = completedSeasonCutoff ?? currentSeason;
  const populatedSeasonCutoff = currentSeasonComplete
    ? Math.max(basePopulatedSeasonCutoff, currentSeason)
    : basePopulatedSeasonCutoff;
  const externalSeasonCutoff = getHistoricalNbaBranchSeasonCutoff({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? basePopulatedSeasonCutoff;
  const maxVisibleSeason = currentSeason;

  useEffect(() => {
    if (disableNbaHistoricalData) return;
    if (!state.historicalAwards || state.historicalAwards.length === 0) {
      import('../../../services/rosterService').then(service => {
        service.getHistoricalAwards().then(data => {
          const filteredData = data.filter((award: any) => isAwardVisibleInTimeline(award, externalSeasonCutoff));
          if (filteredData && filteredData.length > 0) {
            dispatchAction({ type: 'UPDATE_STATE' as any, payload: { historicalAwards: filteredData } });
          }
        });
      });
    }
  }, [state.historicalAwards, disableNbaHistoricalData, dispatchAction, externalSeasonCutoff]);
  const awardsToUse = useMemo(
    () => (state.historicalAwards || []).filter((award: any) =>
      isAwardVisibleInTimeline(award, populatedSeasonCutoff),
    ),
    [populatedSeasonCutoff, state.historicalAwards],
  );

  const historicalYears = useMemo(() => {
    const seasonsSet = new Set<number>();
    historyTeams.forEach(t => t.seasons?.forEach((s: any) => {
      const season = Number(s.season);
      if (season < currentSeason && season <= externalSeasonCutoff) seasonsSet.add(season);
    }));
    historyPeople.forEach(p => p.awards?.forEach((a: any) => {
      const season = Number(a.season);
      if (isAwardVisibleInTimeline(a, externalSeasonCutoff) && season < currentSeason) seasonsSet.add(season);
    }));
    awardsToUse.forEach((a: any) => {
      if (isValidAwardSeason(a.season) && a.season < currentSeason && Number(a.season) <= externalSeasonCutoff) {
        seasonsSet.add(Number(a.season));
      }
    });
    return Array.from(seasonsSet).sort((a, b) => b - a);
  }, [awardsToUse, currentSeason, externalSeasonCutoff, historyPeople, historyTeams]);

  const brefMap = useBRefSeasonsBatch(disableNbaHistoricalData ? [] : historicalYears);

  const historyData = useMemo(() => {
    const seasonsSet = new Set<number>([currentSeason]);
    historyTeams.forEach(t => t.seasons?.forEach((s: any) => {
      const season = Number(s.season);
      if (season <= populatedSeasonCutoff) seasonsSet.add(season);
    }));
    historyPeople.forEach(p => p.awards?.forEach((a: any) => {
      const season = Number(a.season);
      if (isAwardVisibleInTimeline(a, populatedSeasonCutoff)) seasonsSet.add(season);
    }));
    awardsToUse.forEach((a: any) => { if (isValidAwardSeason(a.season)) seasonsSet.add(a.season); });
    const seasons = Array.from(seasonsSet)
      .filter(season => isValidAwardSeason(season) && season <= maxVisibleSeason)
      .sort((a, b) => b - a);

    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normalizeName = (value: unknown) => stripAccents(String(value ?? '').toLowerCase()).replace(/\s+/g, ' ').trim();
    const namesMatch = (left: unknown, right: unknown) => normalizeName(left) === normalizeName(right);
    const getSeasonStatTeam = (player: any, season: number) => {
      const stats = (player?.stats ?? [])
        .filter((stat: any) => Number(stat?.season) === Number(season) && !stat?.playoffs && Number(stat?.tid) >= 0);
      if (!stats.length) return null;
      const byTid = new Map<number, number>();
      for (const stat of stats) {
        const tid = Number(stat.tid);
        byTid.set(tid, (byTid.get(tid) ?? 0) + Number(stat.gp ?? 0));
      }
      let bestTid: number | null = null;
      let bestGp = -1;
      for (const [tid, gp] of byTid.entries()) {
        if (gp > bestGp) {
          bestTid = tid;
          bestGp = gp;
        }
      }
      return bestTid == null ? null : historyTeams.find(team => team.id === bestTid) ?? null;
    };

    const resolveAwardTeam = (a: any, player: any, season: number, fallbackTeamName?: string) =>
      getSeasonStatTeam(player, season)
      ?? (a?.tid != null ? historyTeams.find(t => t.id === Number(a.tid)) : null)
      ?? (fallbackTeamName ? matchTeamByWikiName(fallbackTeamName, historyTeams as any[]) as any : null)
      ?? null;

    const makeAwardObj = (a: any, season: number) => {
      if (!a) return null;
      const playerMatch = findHistoryPlayerMatch(historyPeople, a);
      const player = playerMatch?.player;
      const team = resolveAwardTeam(a, player, season);
      return {
        name: a.name,
        team: team?.abbrev ?? 'FA',
        id: player?.internalId ?? a.name,
        imgURL: a.imgURL ?? resolveLeagueHistoryPortraitUrl(player, a.name, !isFictional),
        face: (player as any)?.face ?? a.face ?? a.staff?.face,
        teamLogoUrl: getHistoricalTeamSnapshot(team, season).logoUrl,
        player,
        playerIdentityMatch: playerMatch?.kind,
      };
    };

    const makeBrefAwardObj = (a: { name: string; team: string } | undefined, season: number) => {
      if (!a?.name) return null;
      const nl = a.name.toLowerCase();
      const player = historyPeople.find(p => p.name?.toLowerCase() === nl);
      const team = resolveAwardTeam(undefined, player, season, a.team);
      return {
        name: a.name,
        team: team?.abbrev ?? (a.team ? generateAbbrev(a.team) : ''),
        id: player?.internalId ?? a.name,
        imgURL: resolveLeagueHistoryPortraitUrl(player, a.name, !isFictional),
        face: (player as any)?.face,
        teamLogoUrl: getHistoricalTeamSnapshot(team, season).logoUrl,
        player,
        playerIdentityMatch: player ? 'name' as const : undefined,
      };
    };

    const champYearsByTeamId = new Map<number, Set<number>>();
    for (const a of awardsToUse) {
      if (a.type !== 'Champion' || a.tid == null) continue;
      const tid = Number(a.tid);
      if (!champYearsByTeamId.has(tid)) champYearsByTeamId.set(tid, new Set());
      champYearsByTeamId.get(tid)!.add(Number(a.season));
    }
    if (!isFictional) {
      for (const [yr, brefData] of getAllCachedSeasons().entries()) {
        if (yr > externalSeasonCutoff) continue;
        if (!brefData.champion?.name) continue;
        const matched = matchTeamByWikiName(brefData.champion.name, historyTeams as any[]) as any;
        if (!matched) continue;
        if (!champYearsByTeamId.has(matched.id)) champYearsByTeamId.set(matched.id, new Set());
        champYearsByTeamId.get(matched.id)!.add(yr);
      }
    }

    const ruYearsByTeamId = new Map<number, Set<number>>();
    for (const a of awardsToUse) {
      if (a.type !== 'Runner Up' || a.tid == null) continue;
      const tid = Number(a.tid);
      if (!ruYearsByTeamId.has(tid)) ruYearsByTeamId.set(tid, new Set());
      ruYearsByTeamId.get(tid)!.add(Number(a.season));
    }
    if (!isFictional) {
      for (const [yr, brefData] of getAllCachedSeasons().entries()) {
        if (yr > externalSeasonCutoff) continue;
        if (!brefData.runnerUp?.name) continue;
        const matched = matchTeamByWikiName(brefData.runnerUp.name, historyTeams as any[]) as any;
        if (!matched) continue;
        if (!ruYearsByTeamId.has(matched.id)) ruYearsByTeamId.set(matched.id, new Set());
        ruYearsByTeamId.get(matched.id)!.add(yr);
      }
    }

    const countForPlayer = (name: string | undefined, flatType: string, bbgmKey: string, upTo: number): number => {
      if (!name) return 1;
      const seasons = new Set<number>();
      for (const a of awardsToUse) {
        const awardSeason = Number(a.season);
        if (!isValidAwardSeason(awardSeason) || awardSeason > upTo) continue;
        if (a.type) {
          if (normalizePlayerAwardType(a.type) === normalizePlayerAwardType(flatType) && namesMatch(a.name, name)) seasons.add(awardSeason);
          continue;
        }
        if (namesMatch(a[bbgmKey]?.name, name)) seasons.add(awardSeason);
      }
      if (!isFictional) {
        for (const [year, brefData] of getAllCachedSeasons().entries()) {
          if (!isValidAwardSeason(year) || year > upTo) continue;
          if (namesMatch((brefData as any)?.[bbgmKey]?.name, name)) seasons.add(year);
        }
      }
      return Math.max(seasons.size, 1);
    };

    const countChamp = (teamId: number | undefined, upTo: number): number => {
      if (teamId == null) return 1;
      const years = champYearsByTeamId.get(teamId);
      if (!years) return 1;
      const cnt = [...years].filter(y => y <= upTo).length;
      return Math.max(cnt, 1);
    };

    const countRunnerUp = (teamId: number | undefined, upTo: number): number => {
      if (teamId == null) return 1;
      const years = ruYearsByTeamId.get(teamId);
      if (!years) return 1;
      const cnt = [...years].filter(y => y <= upTo).length;
      return Math.max(cnt, 1);
    };

    return seasons.map(season => {
      const isCurrent = season === currentSeason && !currentSeasonComplete;
      const bref = brefMap.get(season);
      const canUseCompletedSeasonArtifacts = !isHistoricalNbaSave || season <= populatedSeasonCutoff;
      const canUseExternalSeasonArtifacts = !isHistoricalNbaSave || season <= externalSeasonCutoff;
      const findTeamSeason = (team: any) =>
        canUseCompletedSeasonArtifacts
          ? team?.seasons?.find((s: any) => Number(s.season) === Number(season))
          : undefined;
      const wikiSeason = isFictional || !canUseExternalSeasonArtifacts ? undefined : (getAllCachedSeasons().get(season) ?? bref);
      const recordForTeam = (team: any) => {
        const native = findTeamSeason(team);
        const source = wikiSeason?.teamRecords?.find(record =>
          Boolean(matchTeamByWikiName(record.name, [team] as any[])),
        );
        const resolved = resolveTeamHistoryRecord(native, source);
        return resolved.won != null && resolved.lost != null && resolved.won + resolved.lost > 0
          ? `${resolved.won}-${resolved.lost}`
          : '';
      };

      const bbgmRecord = awardsToUse.find(
        (a: any) => Number(a.season) === Number(season) && !a.type
      );
      const flatAwards = awardsToUse.filter(
        (a: any) => Number(a.season) === Number(season) && !!a.type
      );
      const flat = (type: string) => flatAwards.find((a: any) => normalizePlayerAwardType(a.type) === normalizePlayerAwardType(type));

      const getAwardEntry = (bbgmKey: string, flatType: string) =>
        flat(flatType) ?? bbgmRecord?.[bbgmKey] ?? null;

      let champ: any = null;
      let runnerUp: any = null;

      const champEntry  = flat('Champion');
      const runnerEntry = flat('Runner Up');
      if (champEntry) {
        const team = (champEntry.tid != null ? historyTeams.find(t => t.id === champEntry.tid) : null)
          ?? (matchTeamByWikiName(champEntry.team ?? champEntry.name, historyTeams as any[]) as any);
        if (team) {
          champ = { ...getHistoricalTeamSnapshot(team, season), record: recordForTeam(team) };
        }
      }
      if (runnerEntry) {
        const team = (runnerEntry.tid != null ? historyTeams.find(t => t.id === runnerEntry.tid) : null)
          ?? (matchTeamByWikiName(runnerEntry.team ?? runnerEntry.name, historyTeams as any[]) as any);
        if (team) {
          runnerUp = { ...getHistoricalTeamSnapshot(team, season), record: recordForTeam(team) };
        }
      }

      if (canUseCompletedSeasonArtifacts && (!champ || !runnerUp)) {
        let maxRounds = -1;
        historyTeams.forEach(t => {
          const ts = findTeamSeason(t);
          if (ts?.playoffRoundsWon !== undefined && ts.playoffRoundsWon > maxRounds)
            maxRounds = ts.playoffRoundsWon;
        });
        if (maxRounds > 0) {
          historyTeams.forEach(t => {
            const ts = findTeamSeason(t);
            if (!ts) return;
            if (!champ && ts.playoffRoundsWon === maxRounds)
              champ = { ...getHistoricalTeamSnapshot(t, season), record: recordForTeam(t) };
            else if (!runnerUp && ts.playoffRoundsWon === maxRounds - 1)
              runnerUp = { ...getHistoricalTeamSnapshot(t, season), record: recordForTeam(t) };
          });
        }
      }

      if (!champ) {
        const fmvpEntry = flat('Finals MVP') ?? bbgmRecord?.finalsMvp;
        if (fmvpEntry) {
          const team = historyTeams.find(t => t.id === fmvpEntry.tid);
          if (team) {
            champ = { ...getHistoricalTeamSnapshot(team, season), record: recordForTeam(team) };
          }
        }
      }

      if (!champ && wikiSeason?.champion) {
        const matched = matchTeamByWikiName(wikiSeason.champion.name, historyTeams as any[]) as any;
        if (matched) {
          champ = { ...getHistoricalTeamSnapshot(matched, season), record: recordForTeam(matched) };
        }
      }
      if (!runnerUp && wikiSeason?.runnerUp) {
        const matched = matchTeamByWikiName(wikiSeason.runnerUp.name, historyTeams as any[]) as any;
        if (matched) {
          runnerUp = { ...getHistoricalTeamSnapshot(matched, season), record: recordForTeam(matched) };
        }
      }

      const awards: Record<string, any> = {
        finalsMvp: makeAwardObj(getAwardEntry('finalsMvp', 'Finals MVP'), season),
        mvp:       makeAwardObj(getAwardEntry('mvp',       'MVP'), season),
        dpoy:      makeAwardObj(getAwardEntry('dpoy',      'DPOY'), season),
        smoy:      makeAwardObj(getAwardEntry('smoy',      'SMOY'), season),
        clutch:    makeAwardObj(getAwardEntry('clutch',    'Clutch Player of the Year'), season),
        mip:       makeAwardObj(getAwardEntry('mip',       'MIP'), season),
        roy:       makeAwardObj(getAwardEntry('roy',       'ROY'), season),
        coy:       makeAwardObj(getAwardEntry('coy',       'COY'), season),
      };

      const wiki = wikiSeason;
      if (wiki) {
        if (!awards.mvp)       awards.mvp       = makeBrefAwardObj(wiki.mvp, season);
        if (!awards.dpoy)      awards.dpoy      = makeBrefAwardObj(wiki.dpoy, season);
        if (!awards.smoy)      awards.smoy      = makeBrefAwardObj(wiki.smoy, season);
        if (!awards.clutch)    awards.clutch    = makeBrefAwardObj(wiki.clutch, season);
        if (!awards.mip)       awards.mip       = makeBrefAwardObj(wiki.mip, season);
        if (!awards.roy)       awards.roy       = makeBrefAwardObj(wiki.roy, season);
        if (!awards.coy)       awards.coy       = makeBrefAwardObj(wiki.coy, season);
        if (!awards.finalsMvp) awards.finalsMvp = makeBrefAwardObj(wiki.finalsMvp, season);
      }

      if (awards.coy) {
        if (!isFictional) {
          const photo = isHistoricalNbaSave
            ? getHistoricalCoachPhoto(awards.coy.name) ?? getCoachPhoto(awards.coy.name)
            : coachPhotosReady
              ? getCoachPhoto(awards.coy.name)
              : undefined;
          awards.coy.imgURL = photo ?? undefined;
          awards.coy.face = undefined;
        }
        awards.coy.disableNameFallback = true;
      }

      if (awards.mvp)       awards.mvp.count       = countForPlayer(awards.mvp.name,       'MVP',       'mvp',       season);
      if (awards.dpoy)      awards.dpoy.count      = countForPlayer(awards.dpoy.name,      'DPOY',      'dpoy',      season);
      if (awards.smoy)      awards.smoy.count      = countForPlayer(awards.smoy.name,      'SMOY',      'smoy',      season);
      if (awards.clutch)    awards.clutch.count    = countForPlayer(awards.clutch.name,    'Clutch Player of the Year', 'clutch', season);
      if (awards.mip)       awards.mip.count       = countForPlayer(awards.mip.name,       'MIP',       'mip',       season);
      if (awards.roy)       awards.roy.count       = countForPlayer(awards.roy.name,       'ROY',       'roy',       season);
      if (awards.coy)       awards.coy.count       = countForPlayer(awards.coy.name,       'COY',       'coy',       season);
      if (awards.finalsMvp) awards.finalsMvp.count = countForPlayer(awards.finalsMvp.name, 'Finals MVP','finalsMvp', season);
      if (champ)    champ    = { ...champ,    champCount: countChamp(champ.id, season) };
      if (runnerUp) runnerUp = { ...runnerUp, ruCount:    countRunnerUp(runnerUp.id, season) };

      return { season, isCurrent, champ, runnerUp, awards };
    });
  }, [awardsToUse, brefMap, coachPhotosReady, currentSeason, currentSeasonComplete, externalSeasonCutoff, historyPeople, historyTeams, isFictional, isHistoricalNbaSave, populatedSeasonCutoff]);

  const openAward = (award: any) => {
    const player = resolveSavedHistoryPlayer(historyPeople, {
      playerRef: award?.player,
      playerIdentityMatch: award?.playerIdentityMatch,
    });
    if (player) navigateToPlayer(player);
  };

  const canOpenAward = (award: any) => Boolean(resolveSavedHistoryPlayer(historyPeople, {
    playerRef: award?.player,
    playerIdentityMatch: award?.playerIdentityMatch,
  }));

  const changeHistoryLeague = (leagueId: string) => {
    setSelectedSeason(null);
    setSelectedHistoryLeagueId(leagueId);
  };

  const historyLeaguePicker = backgroundLeagueOptions.length > 0 ? (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 sm:min-w-64">
      League
      <select
        value={selectedHistoryLeagueId}
        onChange={event => changeHistoryLeague(event.target.value)}
        className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-sky-500"
      >
        <option value="__active__">{labels.leagueName}</option>
        {backgroundLeagueOptions.map(leagueId => <option key={leagueId} value={leagueId}>{leagueId}</option>)}
      </select>
    </label>
  ) : null;

  if (quick.fullPageView) return quick.fullPageView;

  if (selectedHistoryLeagueId !== '__active__') {
    return (
      <BackgroundLeagueHistoryView
        state={state}
        leagueId={selectedHistoryLeagueId}
        leagueOptions={backgroundLeagueOptions}
        activeLeagueLabel={labels.leagueName}
        onLeagueChange={changeHistoryLeague}
        onSelectTeam={gotoTeamHistory}
        onSelectPlayer={quick.openFor}
      />
    );
  }

  if (selectedSeason !== null) {
    return <LeagueHistoryDetailView season={selectedSeason} onBack={() => setSelectedSeason(null)} />;
  }

  if (euroIsolated) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {historyLeaguePicker && <div className="shrink-0 px-4 pt-4 md:px-8">{historyLeaguePicker}</div>}
        <div className="min-h-0 flex-1">
          <EuropeanLeagueHistoryView
            state={state}
            currentSeason={currentSeason}
            onSelectSeason={setSelectedSeason}
            onSelectTeam={gotoTeamHistory}
          />
        </div>
      </div>
    );
  }

  if (pbaIsolated) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {historyLeaguePicker && <div className="shrink-0 px-4 pt-4 md:px-8">{historyLeaguePicker}</div>}
        <div className="min-h-0 flex-1">
          <PbaLeagueHistoryView
            currentSeason={currentSeason}
            historicalAwards={state.historicalAwards ?? []}
            leagueStats={state.leagueStats}
            players={state.players}
            teams={state.teams}
            nonNBATeams={state.nonNBATeams ?? []}
            coachPhotosReady={coachPhotosReady}
            onSelectSeason={setSelectedSeason}
            onSelectTeam={gotoTeamHistory}
            onSelectPlayer={openAward}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col">

        <div className="mb-6 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <Trophy className="text-amber-400" size={32} />
              League History
            </h2>
            <p className="text-slate-400 font-medium mt-1">
              {isHistoricalNbaSave ? 'This historical save only shows seasons that exist in your timeline, so future seeded years stay out of League History.' : 'Click any season to see the full recap.'}
            </p>
          </div>
          {historyLeaguePicker}
        </div>

        <div className="flex-1 overflow-hidden bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <tr>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Season</th>
                  <th className="p-3 font-bold text-amber-400 border-b border-slate-800 whitespace-nowrap">Champion</th>
                  <th className="p-3 font-bold text-slate-400 border-b border-slate-800 whitespace-nowrap">Runner Up</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Finals MVP">Finals MVP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Most Valuable Player">MVP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Defensive Player of the Year">DPOY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Coach of the Year">COY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Sixth Man of the Year">SMOY</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Most Improved Player">MIP</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap" title="Rookie of the Year">ROY</th>
                  <th className="p-3 border-b border-slate-800 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {historyData.map(row => (
                  <tr
                    key={row.season}
                    className={`transition-colors group ${
                      row.isCurrent
                        ? 'bg-blue-950/20 hover:bg-blue-900/20'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <td
                      className="p-3 whitespace-nowrap cursor-pointer"
                      onClick={() => setSelectedSeason(row.season)}
                    >
                      <div className="flex items-center gap-2 hover:text-sky-300 transition-colors">
                        <span className="font-black text-white text-sm group-hover:text-sky-300">
                          {formatLeagueSeasonLabel(row.season, state.leagueStats)}
                        </span>
                        {row.isCurrent && (
                          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                            NOW
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {row.champ ? (
                        <div
                          onClick={() => gotoTeamHistory(row.champ.id)}
                          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {row.champ.logoUrl && (
                            <img src={row.champ.logoUrl} alt={row.champ.abbrev} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                          )}
                          <span className="font-bold text-amber-400 text-sm">{getTeamFullName(row.champ)}</span>
                          {(row.champ.champCount ?? 0) > 0 && (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-px rounded-full">
                              {row.champ.champCount}×
                            </span>
                          )}
                          {row.champ.record && <span className="text-xs text-slate-500">({row.champ.record})</span>}
                        </div>
                      ) : (
                        <span className={`italic text-xs ${row.isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
                          {row.isCurrent ? 'TBA' : '—'}
                        </span>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {row.runnerUp ? (
                        <div
                          onClick={() => gotoTeamHistory(row.runnerUp.id)}
                          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {row.runnerUp.logoUrl && (
                            <img src={row.runnerUp.logoUrl} alt={row.runnerUp.abbrev} className="w-4 h-4 object-contain opacity-70" referrerPolicy="no-referrer" />
                          )}
                          <span className="font-medium text-slate-300 text-xs">{getTeamFullName(row.runnerUp)}</span>
                          {(row.runnerUp.ruCount ?? 0) > 0 && (
                            <span className="text-[9px] font-black text-slate-400 bg-slate-700/50 px-1 py-px rounded-full">
                              {row.runnerUp.ruCount}×
                            </span>
                          )}
                          {row.runnerUp.record && <span className="text-xs text-slate-600">({row.runnerUp.record})</span>}
                        </div>
                      ) : (
                        <span className={`italic text-xs ${row.isCurrent ? 'text-slate-500' : 'text-slate-700'}`}>
                          {row.isCurrent ? 'TBA' : '—'}
                        </span>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.finalsMvp} isCurrent={row.isCurrent} onClick={canOpenAward(row.awards.finalsMvp) ? () => openAward(row.awards.finalsMvp) : undefined} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.mvp}       isCurrent={row.isCurrent} onClick={canOpenAward(row.awards.mvp)       ? () => openAward(row.awards.mvp)       : undefined} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.dpoy}      isCurrent={row.isCurrent} onClick={canOpenAward(row.awards.dpoy)      ? () => openAward(row.awards.dpoy)      : undefined} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.coy}       isCurrent={row.isCurrent} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.smoy}      isCurrent={row.isCurrent} onClick={canOpenAward(row.awards.smoy)      ? () => openAward(row.awards.smoy)      : undefined} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.mip}       isCurrent={row.isCurrent} onClick={canOpenAward(row.awards.mip)       ? () => openAward(row.awards.mip)       : undefined} /></td>
                    <td className="p-3 whitespace-nowrap"><AwardCell award={row.awards.roy}       isCurrent={row.isCurrent} onClick={canOpenAward(row.awards.roy)       ? () => openAward(row.awards.roy)       : undefined} /></td>
                    <td
                      className="p-3 cursor-pointer"
                      onClick={() => setSelectedSeason(row.season)}
                    >
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {quick.portals}
    </div>
  );
};
