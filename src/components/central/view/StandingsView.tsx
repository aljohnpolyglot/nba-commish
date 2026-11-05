import React, { useEffect, useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { getOwnTeamId } from '../../../utils/helpers';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { selectCompetitionTeamTids } from '../../../services/competition/competitionScheduler';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { deriveOfficialNbaRecords } from '../../../utils/nbaOfficialRecords';
import { computeClinchStatus, sortByStandings } from '../../../utils/standingsUtils';
import { PBA_COMPETITIONS } from '../../../data/templates/philippines/competitions';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl, getTeamPrimaryColor } from '../../../utils/teamAssets';
import { selectCountedPbaRegularBoxScores } from '../../../services/pba/competitionGames';
import { getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { competitionZoneForSeed, getCompetitionQualificationZones } from '../../../services/competition/competitionStandings';
import { didHomeTeamWin } from '../../../utils/gameOutcome';
import { getLeagueConferenceGroups, resolveLeagueDivisions } from '../../../utils/leagueStructure';
import { DEFAULT_DIVS } from '../../../constants';
import { formatLeagueSeasonLabel } from '../../../services/leagueCalendar';

type StandingsViewType = 'league' | 'conf' | 'div';
const PBA_COMBINED_FILTER = 'combined';

const TeamMark: React.FC<{ team: any; season?: number | string }> = ({ team, season }) => {
  const [failed, setFailed] = useState(false);
  const snapshot = getHistoricalTeamSnapshot(team, season);
  const logoUrl = getResolvedTeamLogoUrl(snapshot, season);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={snapshot?.abbrev ?? snapshot?.name ?? 'Team'}
        className="h-5 w-5 object-contain"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-black text-white"
      style={{ backgroundColor: getTeamPrimaryColor(snapshot) }}
    >
      {snapshot?.abbrev ?? 'PBA'}
    </span>
  );
};

export const StandingsView: React.FC = () => {
  const { state, navigateToTeam } = useGame();
  const wnbaIsolated = isWnbaIsolatedMode(state);
  const ownTid = getOwnTeamId(state);
  const [viewType, setViewType] = useState<StandingsViewType>('conf');
  const leagueYear = state.leagueStats.year;
  const maxVisibleYear = getHistoricalNbaCompletedSeasonCutoff({
    currentYear: leagueYear,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  }) ?? leagueYear;
  const isStandingsYearVisible = (year: number) => year <= maxVisibleYear || year === leagueYear;
  const currentPbaCompetitionId = state.leagueStats?.pbaConference === 'commissioners'
    ? 'pba-commissioners-cup'
    : state.leagueStats?.pbaConference === 'governors'
      ? 'pba-governors-cup'
      : 'pba-philippine-cup';
  const [pbaCompetitionFilter, setPbaCompetitionFilter] = useState(currentPbaCompetitionId);

  useEffect(() => {
    if (state.leagueStats?.uiMode !== 'pba_isolated') return;
    setPbaCompetitionFilter(prev => prev === PBA_COMBINED_FILTER ? prev : currentPbaCompetitionId);
  }, [currentPbaCompetitionId, state.leagueStats?.uiMode]);

  // Available years from box scores + current year
  const availableYears = useMemo(() => {
    const years = new Set<number>([leagueYear]);
    if (maxVisibleYear !== leagueYear) years.add(maxVisibleYear);
    state.boxScores.forEach(g => {
      const savedSeason = Number((g as any).season);
      if (savedSeason > 2000 && isStandingsYearVisible(savedSeason)) {
        years.add(savedSeason);
        return;
      }
      try {
        const d = new Date(g.date);
        const m = d.getMonth() + 1;
        const y = m >= 7 ? d.getFullYear() + 1 : d.getFullYear();
        if (y > 2000 && isStandingsYearVisible(y)) years.add(y);
      } catch {}
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [state.boxScores, maxVisibleYear, leagueYear]);

  const [selectedYear, setSelectedYear] = useState(leagueYear);
  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears.includes(leagueYear) ? leagueYear : availableYears[0] ?? maxVisibleYear);
    }
  }, [availableYears, leagueYear, maxVisibleYear, selectedYear]);
  const currentYear = selectedYear;
  const standingsOnlyFormat = currentYear === leagueYear && state.leagueStats?.playoffsEnabled === false;
  const playoffsEnabled = !standingsOnlyFormat;
  const playInEnabled = playoffsEnabled && state.leagueStats?.playIn === true;
  const standingsChampionTid = standingsOnlyFormat
    ? state.seasonHistory?.find(entry => entry.year === currentYear)?.championTid
    : undefined;

  const pbaCompetitionOptions = useMemo(() => [
    ...PBA_COMPETITIONS.map(spec => ({ id: spec.id, label: spec.displayName.replace(/^PBA\s+/, '') })),
    { id: PBA_COMBINED_FILTER, label: 'Combined' },
  ], []);

  const pbaCompetitionIds = useMemo(() => {
    if (!isPbaIsolatedMode(state)) return new Set<string>();
    return new Set(
      pbaCompetitionFilter === PBA_COMBINED_FILTER
        ? PBA_COMPETITIONS.map(spec => spec.id)
        : [pbaCompetitionFilter],
    );
  }, [pbaCompetitionFilter, state]);

  const isNbaLeague = state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && !wnbaIsolated
    && !isPbaIsolatedMode(state)
    && !isEuroIsolatedMode(state);
  const divisionMetadata = useMemo(() => {
    return resolveLeagueDivisions(
      state.teams,
      state.leagueStats.divs,
      isNbaLeague ? DEFAULT_DIVS : [],
    );
  }, [isNbaLeague, state.leagueStats.divs, state.teams]);
  const hasDivisionMetadata = useMemo(
    () => !wnbaIsolated
      && divisionMetadata.length > 0
      && state.teams.some(team => team.did !== undefined && team.did !== null),
    [divisionMetadata, state.teams, wnbaIsolated],
  );
  const conferenceGroupCount = useMemo(
    () => wnbaIsolated ? 1 : getLeagueConferenceGroups(state.teams, state.leagueStats).length,
    [state.leagueStats, state.teams, wnbaIsolated],
  );

  useEffect(() => {
    if (wnbaIsolated && viewType !== 'league') setViewType('league');
    else if (viewType === 'div' && !hasDivisionMetadata) setViewType('conf');
    if (viewType === 'conf' && conferenceGroupCount <= 1) setViewType('league');
  }, [conferenceGroupCount, hasDivisionMetadata, viewType, wnbaIsolated]);

  const euroRows = useMemo(() => {
    if (!isEuroIsolatedMode(state)) return [];
    const domesticCompetitionId = state.euroPrimaryCompetitionId ?? 'endesa';
    const domesticSpec = state.activeCompetitions?.find(competition => competition.id === domesticCompetitionId);
    const activeTids = new Set(domesticSpec ? selectCompetitionTeamTids(domesticSpec, state) : []);
    const acc = new Map<number, { tid: number; w: number; l: number; pf: number; pa: number }>();
    activeTids.forEach(tid => acc.set(tid, { tid, w: 0, l: 0, pf: 0, pa: 0 }));
    state.boxScores.filter(b => {
      if (b.competitionId !== domesticCompetitionId) return false;
      const savedSeason = Number((b as any).season);
      if (savedSeason > 0) return savedSeason === currentYear;
      try {
        const d = new Date(b.date);
        const y = d.getMonth() + 1 >= 7 ? d.getFullYear() + 1 : d.getFullYear();
        return y === currentYear;
      } catch {
        return false;
      }
    }).forEach(b => {
      const home = acc.get(b.homeTeamId);
      const away = acc.get(b.awayTeamId);
      if (!home || !away) return;
      const homeWon = didHomeTeamWin(b);
      home.w += homeWon ? 1 : 0; home.l += homeWon ? 0 : 1; home.pf += b.homeScore; home.pa += b.awayScore;
      away.w += homeWon ? 0 : 1; away.l += homeWon ? 1 : 0; away.pf += b.awayScore; away.pa += b.homeScore;
    });
    return [...acc.values()].sort((a, b) => (b.w * 2 + b.l) - (a.w * 2 + a.l) || b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
  }, [currentYear, state]);
  const euroCompetitionSpec = state.activeCompetitions?.find(competition => competition.id === state.euroPrimaryCompetitionId);
  const euroQualificationZones = euroCompetitionSpec
    ? getCompetitionQualificationZones(euroCompetitionSpec, currentYear)
    : [];

  const pbaRows = useMemo(() => {
    if (!isPbaIsolatedMode(state)) return [];
    const selectedCompetitionIds = pbaCompetitionIds;
    const selectedSpecs = (state.activeCompetitions ?? []).filter((competition: any) =>
      selectedCompetitionIds.has(String(competition.id)),
    );
    const selectedCompetitionTeams = new Set<number>();
    for (const competition of selectedSpecs) {
      selectCompetitionTeamTids(competition as any, state).forEach(tid => selectedCompetitionTeams.add(tid));
    }
    const pbaTeams = (state.nonNBATeams ?? []).filter((team: any) => {
      const tid = Number(team.tid ?? team.id);
      const isPbaTeam = team.league === 'PBA' || (tid >= 2000 && tid < 2100);
      if (!isPbaTeam) return false;
      return selectedCompetitionTeams.size === 0 || selectedCompetitionTeams.has(tid);
    });
    const acc = new Map<number, { tid: number; w: number; l: number; pf: number; pa: number; games: { won: boolean; date: string }[] }>();
    pbaTeams.forEach((team: any) => {
      const tid = Number(team.tid ?? team.id);
      acc.set(tid, { tid, w: 0, l: 0, pf: 0, pa: 0, games: [] });
    });
    selectedSpecs
      .flatMap((spec: any) => selectCountedPbaRegularBoxScores(state.boxScores, spec, currentYear))
      .forEach(b => {
      const home = acc.get(b.homeTeamId);
      const away = acc.get(b.awayTeamId);
      if (!home || !away) return;
      const homeWon = didHomeTeamWin(b);
      home.w += homeWon ? 1 : 0; home.l += homeWon ? 0 : 1; home.pf += b.homeScore; home.pa += b.awayScore;
      home.games.push({ won: homeWon, date: b.date });
      away.w += homeWon ? 0 : 1; away.l += homeWon ? 1 : 0; away.pf += b.awayScore; away.pa += b.homeScore;
      away.games.push({ won: !homeWon, date: b.date });
    });
    return [...acc.values()]
      .map(row => {
        const gp = row.w + row.l;
        const winPct = gp > 0 ? row.w / gp : 0;
        const avgPtsFor = gp > 0 ? (row.pf / gp).toFixed(1) : '0.0';
        const avgPtsAgainst = gp > 0 ? (row.pa / gp).toFixed(1) : '0.0';
        const diffNum = gp > 0 ? (row.pf - row.pa) / gp : 0;
        const recentGames = [...row.games].sort((a, b) => b.date.localeCompare(a.date));
        const latestResult = recentGames[0]?.won;
        const streakCount = latestResult == null
          ? 0
          : recentGames.findIndex(game => game.won !== latestResult);
        const streakStr = latestResult == null
          ? '-'
          : `${latestResult ? 'Won' : 'Lost'} ${streakCount === -1 ? recentGames.length : streakCount}`;
        const last10 = recentGames.slice(0, 10);
        const l10Wins = last10.filter(game => game.won).length;
        const l10Losses = last10.length - l10Wins;
        return {
          ...row,
          winPct,
          avgPtsFor,
          avgPtsAgainst,
          diffNum,
          diff: diffNum.toFixed(1),
          streakStr,
          l10Record: `${l10Wins}-${l10Losses}`,
        };
      })
      .sort((a, b) => b.winPct - a.winPct || b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
  }, [state, leagueYear, currentYear, pbaCompetitionIds]);

  const standingsData = useMemo(() => {
    // Fast team lookup for conf/div comparisons
    const teamMap = new Map(state.teams.map(t => [t.id, t]));

    // Per-team accumulators derived from box scores
    const acc: Record<number, {
      totalWins: number; totalLosses: number;
      homeWins: number; homeLosses: number;
      confWins: number; confLosses: number;
      divWins: number; divLosses: number;
      ptsFor: number; ptsAgainst: number;
      games: { won: boolean; date: string }[];
    }> = {};

    state.teams.forEach(t => {
      acc[t.id] = {
        totalWins: 0, totalLosses: 0,
        homeWins: 0, homeLosses: 0,
        confWins: 0, confLosses: 0,
        divWins: 0, divLosses: 0,
        ptsFor: 0, ptsAgainst: 0,
        games: [],
      };
    });

    const officialCurrentRows = currentYear === leagueYear && !isEuroIsolatedMode(state) && !isPbaIsolatedMode(state)
      ? deriveOfficialNbaRecords(state.schedule, state.teams, currentYear)
      : null;
    const officialCurrentGames = officialCurrentRows
      ? Array.from(officialCurrentRows.values()).reduce((sum, row) => sum + row.totalWins + row.totalLosses, 0)
      : 0;

    if (officialCurrentRows && officialCurrentGames > 0) {
      for (const [tid, row] of officialCurrentRows.entries()) {
        if (!acc[tid]) continue;
        acc[tid] = { ...row };
      }
    } else {
      // Regular season only. Cup group/QF games count toward the regular season;
      // Cup Final, playoffs, play-in, preseason, and exhibition games do not.
      state.boxScores
        .filter(g => {
          if (g.isAllStar || g.isRisingStars || g.isCelebrityGame) return false;
          const meta = classifyBoxScoreGame(g as any, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, leagueYear, state.leagueStats);
          if (meta.seasonYear !== currentYear) return false;
          return !meta.isPreseason && !meta.isPlayoff && !meta.isPlayIn && !meta.isAllStar && !meta.excludeFromRecord;
        })
        .forEach(g => {
        const homeAcc = acc[g.homeTeamId];
        const awayAcc = acc[g.awayTeamId];
        const homeWon = didHomeTeamWin(g);
        const homeTeam = teamMap.get(g.homeTeamId);
        const awayTeam = teamMap.get(g.awayTeamId);

        if (homeAcc && homeTeam) {
          homeAcc.ptsFor += g.homeScore;
          homeAcc.ptsAgainst += g.awayScore;
          homeWon ? homeAcc.totalWins++ : homeAcc.totalLosses++;
          homeWon ? homeAcc.homeWins++  : homeAcc.homeLosses++;
          homeAcc.games.push({ won: homeWon, date: g.date });

          if (awayTeam) {
            const sameConf = !wnbaIsolated && homeTeam.conference === awayTeam.conference;
            const sameDiv = !wnbaIsolated && homeTeam.did !== undefined && homeTeam.did === awayTeam.did;
            if (sameConf) { homeWon ? homeAcc.confWins++ : homeAcc.confLosses++; }
            if (sameDiv)  { homeWon ? homeAcc.divWins++  : homeAcc.divLosses++;  }
          }
        }

        if (awayAcc && awayTeam) {
          awayAcc.ptsFor += g.awayScore;
          awayAcc.ptsAgainst += g.homeScore;
          !homeWon ? awayAcc.totalWins++ : awayAcc.totalLosses++;
          awayAcc.games.push({ won: !homeWon, date: g.date });

          if (homeTeam) {
            const sameConf = !wnbaIsolated && awayTeam.conference === homeTeam.conference;
            const sameDiv = !wnbaIsolated && awayTeam.did !== undefined && awayTeam.did === homeTeam.did;
            if (sameConf) { !homeWon ? awayAcc.confWins++ : awayAcc.confLosses++; }
            if (sameDiv)  { !homeWon ? awayAcc.divWins++  : awayAcc.divLosses++;  }
          }
        }
      });
    }

    const derivedLeagueGames = Object.values(acc).reduce((sum, row) => sum + row.totalWins + row.totalLosses, 0);

    const teams = state.teams.map(team => {
      const s = acc[team.id] ?? {
        totalWins: 0, totalLosses: 0,
        homeWins: 0, homeLosses: 0,
        confWins: 0, confLosses: 0,
        divWins: 0, divLosses: 0,
        ptsFor: 0, ptsAgainst: 0,
        games: [],
      };

      const derivedGames = s.totalWins + s.totalLosses;
      const teamGames = (team.wins ?? 0) + (team.losses ?? 0);
      const staleHistoricalFullSeasonRecord = currentYear === leagueYear && currentYear > maxVisibleYear && teamGames >= 82;
      const useLiveTeamRecord = currentYear === leagueYear && teamGames > 0 && derivedGames === 0 && derivedLeagueGames === 0 && !staleHistoricalFullSeasonRecord;
      const wins = useLiveTeamRecord ? team.wins : s.totalWins;
      const losses = useLiveTeamRecord ? team.losses : s.totalLosses;
      const totalGames = useLiveTeamRecord ? teamGames : derivedGames;
      const splitWins = useLiveTeamRecord ? wins : derivedGames > 0 ? s.totalWins : wins;
      const splitLosses = useLiveTeamRecord ? losses : derivedGames > 0 ? s.totalLosses : losses;
      const winPct = totalGames > 0 ? wins / totalGames : 0;

      const roadWins = Math.max(0, splitWins - s.homeWins);
      const roadLosses = Math.max(0, splitLosses - s.homeLosses);

      const scoringGames = derivedGames > 0 ? derivedGames : totalGames;
      const avgPtsFor = scoringGames > 0 ? (s.ptsFor / scoringGames).toFixed(1) : '0.0';
      const avgPtsAgainst = scoringGames > 0 ? (s.ptsAgainst / scoringGames).toFixed(1) : '0.0';
      const movNum = scoringGames > 0 ? (s.ptsFor - s.ptsAgainst) / scoringGames : 0;
      const mov = movNum.toFixed(1);

      const recentGames = [...s.games].sort((a, b) => b.date.localeCompare(a.date));
      const latestResult = recentGames[0]?.won;
      const streakCount = latestResult == null
        ? 0
        : recentGames.findIndex(g => g.won !== latestResult);
      const streakStr = latestResult == null
        ? '-'
        : `${latestResult ? 'Won' : 'Lost'} ${streakCount === -1 ? recentGames.length : streakCount}`;

      const last10 = recentGames.slice(0, 10);
      const l10Wins = last10.filter(g => g.won).length;
      const l10Losses = last10.length - l10Wins;

      // Division name from leagueStats.divs (keyed by did)
      const divObj = hasDivisionMetadata ? divisionMetadata.find(d => d.did === team.did) : undefined;
      const division = divObj?.name ?? (hasDivisionMetadata ? team.conference : '');

      return {
        ...team,
        wins,     // override team.wins with regular-season-only count
        losses,   // override team.losses with regular-season-only count
        clinchedPlayoffs: currentYear === leagueYear ? team.clinchedPlayoffs : undefined,
        winPct,
        movNum,
        homeRecord: `${s.homeWins}-${s.homeLosses}`,
        roadRecord: `${roadWins}-${roadLosses}`,
        divRecord: `${s.divWins}-${s.divLosses}`,
        confRecord: `${s.confWins}-${s.confLosses}`,
        avgPtsFor,
        avgPtsAgainst,
        mov,
        streakStr,
        l10Record: `${l10Wins}-${l10Losses}`,
        division,
      };
    });

    const rankedTeams = sortByStandings(
      teams,
      state.leagueStats.tiebreakers,
      Number(state.headToHead?.season) === currentYear ? state.headToHead : undefined,
    );

    const teamsWithClinch = currentYear === leagueYear && !isEuroIsolatedMode(state) && !isPbaIsolatedMode(state)
      ? computeClinchStatus(rankedTeams, state.schedule, currentYear)
      : rankedTeams;

    if (viewType === 'league') {
      return [{ title: 'League Standings', teams: teamsWithClinch }];
    } else if (viewType === 'conf') {
      return getLeagueConferenceGroups(teamsWithClinch, state.leagueStats)
        .map(group => ({ title: group.name, teams: group.teams }));
    } else {
      const divNames = [...new Set(teamsWithClinch.map(t => t.division))].filter(Boolean).sort() as string[];
      return divNames.map(div => ({
        title: div.toLowerCase().endsWith('division') ? div : `${div} Division`,
        teams: teamsWithClinch.filter(t => t.division === div),
      }));
    }
  }, [state.teams, state.boxScores, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, state.leagueStats, viewType, currentYear, leagueYear, maxVisibleYear, divisionMetadata, hasDivisionMetadata, wnbaIsolated]);

  const renderTable = (group: { title: string; teams: any[] }) => {
    const leader = group.teams[0];
    const leaderWins = leader?.wins || 0;
    const leaderLosses = leader?.losses || 0;
    const showDivisionRecord = hasDivisionMetadata && group.teams.some(team => team.did !== undefined && team.did !== null);
    const showConferenceRecord = conferenceGroupCount > 1;

    return (
      <div key={group.title} className="mb-8">
        <h3 className="text-xl font-bold text-white mb-4 px-4">{group.title}</h3>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-y border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-3 py-3 font-medium text-center">W</th>
                <th className="px-3 py-3 font-medium text-center">L</th>
                <th className="px-3 py-3 font-medium text-center">%</th>
                <th className="px-3 py-3 font-medium text-center" title="Games Back">GB</th>
                <th className="px-3 py-3 font-medium text-center">Home</th>
                <th className="px-3 py-3 font-medium text-center">Road</th>
                {showDivisionRecord && <th className="px-3 py-3 font-medium text-center">Div</th>}
                {showConferenceRecord && <th className="px-3 py-3 font-medium text-center">Conf</th>}
                <th className="px-3 py-3 font-medium text-center" title="Points Scored Per Game">PS</th>
                <th className="px-3 py-3 font-medium text-center" title="Points Allowed Per Game">PA</th>
                <th className="px-3 py-3 font-medium text-center" title="Margin of Victory">MOV</th>
                <th className="px-3 py-3 font-medium text-center">Streak</th>
                <th className="px-3 py-3 font-medium text-center">L10</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {group.teams.map((team, index) => {
                const gb = ((leaderWins - team.wins) + (team.losses - leaderLosses)) / 2;
                const gbDisplay = gb === 0 ? '-' : gb.toFixed(1);
                const isOwn = ownTid !== null && team.id === ownTid;
                const teamSnapshot = getHistoricalTeamSnapshot(team, currentYear);
                const clinchMark = playoffsEnabled
                  ? (team.clinchedPlayoffs === 'w' && !playInEnabled ? undefined : team.clinchedPlayoffs)
                  : undefined;

                return (
                  <tr key={team.id} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-4 text-right text-xs">{index + 1}</span>
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-slate-800 rounded p-1">
                          <TeamMark team={teamSnapshot} season={currentYear} />
                        </div>
                        <button
                          onClick={() => navigateToTeam(team.id)}
                          className="font-medium text-slate-200 hover:text-indigo-400 transition-colors text-left flex items-center gap-1.5"
                        >
                          <span className="hidden sm:inline">{getTeamFullName(teamSnapshot)}</span>
                          <span className="sm:hidden">{teamSnapshot.abbrev}</span>
                          {clinchMark && (
                            <span className="text-[10px] text-slate-500 font-bold">{clinchMark}</span>
                          )}
                          {team.id === standingsChampionTid && <Trophy className="h-3.5 w-3.5 text-amber-400" aria-label="League champion" />}
                          {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-white font-medium">{team.wins}</td>
                    <td className="px-3 py-2 text-center text-white">{team.losses}</td>
                    <td className="px-3 py-2 text-center text-slate-300">{team.winPct.toFixed(3).replace(/^0+/, '')}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{gbDisplay}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.homeRecord}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.roadRecord}</td>
                    {showDivisionRecord && <td className="px-3 py-2 text-center text-slate-400">{team.divRecord}</td>}
                    {showConferenceRecord && <td className="px-3 py-2 text-center text-slate-400">{team.confRecord}</td>}
                    <td className="px-3 py-2 text-center text-slate-400">{team.avgPtsFor}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.avgPtsAgainst}</td>
                    <td className={`px-3 py-2 text-center font-medium ${team.movNum > 0 ? 'text-emerald-400' : team.movNum < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {team.movNum > 0 ? '+' : ''}{team.mov}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{team.streakStr}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.l10Record}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPbaTable = () => {
    const leader = pbaRows[0];
    const leaderWins = leader?.w ?? 0;
    const leaderLosses = leader?.l ?? 0;

    return (
      <div className="mb-8">
        <h3 className="text-xl font-bold text-white mb-4 px-4">League Standings</h3>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-y border-slate-800">
              <tr>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="px-3 py-3 font-medium text-center">W</th>
                <th className="px-3 py-3 font-medium text-center">L</th>
                <th className="px-3 py-3 font-medium text-center">%</th>
                <th className="px-3 py-3 font-medium text-center" title="Games Back">GB</th>
                <th className="px-3 py-3 font-medium text-center" title="Points For Per Game">PF</th>
                <th className="px-3 py-3 font-medium text-center" title="Points Allowed Per Game">PA</th>
                <th className="px-3 py-3 font-medium text-center" title="Point Differential Per Game">Diff</th>
                <th className="px-3 py-3 font-medium text-center">Streak</th>
                <th className="px-3 py-3 font-medium text-center">L10</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {pbaRows.map((row, index) => {
                const team = resolveAnyTeam(row.tid, state.teams, state.nonNBATeams ?? []);
                const teamSnapshot = getHistoricalTeamSnapshot(team, currentYear);
                const gb = ((leaderWins - row.w) + (row.l - leaderLosses)) / 2;
                const gbDisplay = gb === 0 ? '-' : gb.toFixed(1);
                const isOwn = ownTid !== null && row.tid === ownTid;

                return (
                  <tr key={row.tid} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-4 text-right text-xs">{index + 1}</span>
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-slate-800 rounded p-1">
                          <TeamMark team={teamSnapshot} season={currentYear} />
                        </div>
                        <button
                          onClick={() => navigateToTeam(row.tid)}
                          className="font-medium text-slate-200 hover:text-indigo-400 transition-colors text-left flex items-center gap-1.5"
                        >
                          <span className="hidden sm:inline">{getTeamFullName(teamSnapshot)}</span>
                          <span className="sm:hidden">{teamSnapshot?.abbrev ?? 'PBA'}</span>
                          {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-white font-medium">{row.w}</td>
                    <td className="px-3 py-2 text-center text-white">{row.l}</td>
                    <td className="px-3 py-2 text-center text-slate-300">{row.winPct.toFixed(3).replace(/^0+/, '')}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{gbDisplay}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{row.avgPtsFor}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{row.avgPtsAgainst}</td>
                    <td className={`px-3 py-2 text-center font-medium ${row.diffNum > 0 ? 'text-emerald-400' : row.diffNum < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {row.diffNum > 0 ? '+' : ''}{row.diff}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400 whitespace-nowrap">{row.streakStr}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{row.l10Record}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (isPbaIsolatedMode(state)) {
    const competitionLabel = pbaCompetitionOptions.find(option => option.id === pbaCompetitionFilter)?.label ?? 'Conference';
    return (
      <div className="h-full flex flex-col bg-slate-950">
        <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">PBA Standings</h1>
              <p className="text-xs text-slate-500 mt-1">{competitionLabel} · Regular Season Win-Loss Record</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pbaCompetitionFilter}
                onChange={event => setPbaCompetitionFilter(event.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-sm font-medium px-3 py-1.5 rounded-md outline-none cursor-pointer"
              >
                {pbaCompetitionOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <select
                value={currentYear}
                onChange={event => setSelectedYear(Number(event.target.value))}
                className="bg-slate-900 border border-slate-700 text-white text-sm font-medium px-3 py-1.5 rounded-md outline-none cursor-pointer"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{formatLeagueSeasonLabel(year, state.leagueStats)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-0 sm:p-4">
          <div className="max-w-7xl mx-auto space-y-2">
            {renderPbaTable()}
          </div>
        </div>
      </div>
    );
  }

  if (isEuroIsolatedMode(state)) {
    const domesticCompetitionName = state.activeCompetitions?.find(competition => competition.id === state.euroPrimaryCompetitionId)?.displayName
      ?? state.leagueStats.leagueName
      ?? 'Domestic League';
    return (
      <div className="h-full overflow-y-auto p-4 md:p-8 bg-slate-950">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tight text-white mb-2">{domesticCompetitionName} Standings</h2>
              <p className="text-sm text-slate-500">Single-table points format: 2 points per win, 1 per loss.</p>
            </div>
            <select
              value={currentYear}
              onChange={event => setSelectedYear(Number(event.target.value))}
              className="bg-slate-900 border border-slate-700 text-white text-sm font-medium px-3 py-1.5 rounded-md outline-none cursor-pointer"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{formatLeagueSeasonLabel(year, state.leagueStats)}</option>
              ))}
            </select>
          </div>
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/70">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/70 text-[10px] uppercase tracking-widest text-slate-500">
                <tr><th className="px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Club</th><th>W</th><th>L</th><th>Pts</th><th>PF</th><th>PA</th><th>Diff</th></tr>
              </thead>
              <tbody>
                {euroRows.map((row, index) => {
                  const team = resolveAnyTeam(row.tid, state.teams, state.nonNBATeams ?? []);
                  const teamSnapshot = getHistoricalTeamSnapshot(team, currentYear);
                  const seed = index + 1;
                  const zone = competitionZoneForSeed(euroQualificationZones, seed);
                  const startsZone = index > 0 && euroQualificationZones.some(item => item.from === seed);
                  return (
                    <tr
                      key={row.tid}
                      className={`${startsZone ? 'border-t-2' : 'border-t'} ${row.tid === ownTid ? 'bg-amber-500/10 text-white' : 'text-slate-200'}`}
                      style={{
                        borderTopColor: startsZone ? zone?.color : row.tid === ownTid ? 'rgba(245,158,11,0.3)' : 'rgb(15 23 42)',
                        boxShadow: zone ? `inset 3px 0 0 ${zone.color}` : undefined,
                      }}
                    >
                      <td className="px-4 py-3 font-black text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3 font-bold">
                        <div className="flex items-center gap-3">
                          <TeamMark team={teamSnapshot} season={currentYear} />
                          <span>{getTeamFullName(teamSnapshot)}</span>
                        </div>
                      </td>
                      <td className="text-center">{row.w}</td>
                      <td className="text-center">{row.l}</td>
                      <td className="text-center font-black">{row.w * 2 + row.l}</td>
                      <td className="text-center">{row.pf}</td>
                      <td className="text-center">{row.pa}</td>
                      <td className="text-center">{row.pf - row.pa}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {euroQualificationZones.length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 px-4 py-3">
                {euroQualificationZones.map(zone => (
                  <div key={`${zone.kind}-${zone.from}-${zone.to}`} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />
                    {zone.label} · {zone.from}{zone.to === zone.from ? '' : `–${zone.to}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Standings</h1>

          <div className="flex items-center gap-3">
            {/* Year indicator */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-md overflow-hidden">
              <button
                className="px-2 py-1.5 hover:bg-slate-800 text-slate-400 transition-colors border-r border-slate-700 disabled:opacity-30"
                disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
                onClick={() => {
                  const idx = availableYears.indexOf(selectedYear);
                  if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                className="px-2 py-1.5 hover:bg-slate-800 text-slate-400 transition-colors border-r border-slate-700 disabled:opacity-30"
                disabled={availableYears.indexOf(selectedYear) <= 0}
                onClick={() => {
                  const idx = availableYears.indexOf(selectedYear);
                  if (idx > 0) setSelectedYear(availableYears[idx - 1]);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="bg-transparent text-white text-sm font-medium px-3 py-1.5 select-none">
                {currentYear}
              </span>
            </div>

            {/* View type selector */}
            <select
              className="bg-slate-900 border border-slate-700 text-white text-sm font-medium px-3 py-1.5 rounded-md outline-none cursor-pointer"
              value={viewType}
              onChange={(e) => setViewType(e.target.value as StandingsViewType)}
            >
              <option value="league">League</option>
              {conferenceGroupCount > 1 && <option value="conf">Conference</option>}
              {hasDivisionMetadata && <option value="div">Division</option>}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0 sm:p-4">
        <div className="max-w-7xl mx-auto space-y-2">
          {standingsData.map(renderTable)}

          {/* Legend */}
          <div className="mt-8 p-4 text-sm text-slate-500 flex flex-col md:flex-row justify-between gap-6 border-t border-slate-800/50">
            <div className="space-y-0.5">
              {standingsOnlyFormat ? (
                <div className="flex items-center gap-2 text-slate-400">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span>The best overall regular-season record wins the league title.</span>
                </div>
              ) : (
                <>
                  <p><span className="font-bold text-slate-400">z</span> — clinched #1 seed</p>
                  <p><span className="font-bold text-slate-400">x</span> — clinched playoffs</p>
                  {playInEnabled && <p><span className="font-bold text-slate-400">w</span> — clinched play-in</p>}
                  <p><span className="font-bold text-slate-400">o</span> — eliminated from contention</p>
                </>
              )}
            </div>
            <div className="max-w-md">
              <p className="font-semibold text-slate-400 mb-2">Tiebreakers — {currentYear} season:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Head-to-head record</li>
                {hasDivisionMetadata && <li>Division winner</li>}
                {hasDivisionMetadata && <li>Division record (same div)</li>}
                {conferenceGroupCount > 1 && <li>Conference record (same conf)</li>}
                <li>Margin of victory</li>
                <li>Coin flip</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
