import React, { useEffect, useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getOwnTeamId } from '../../../utils/helpers';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../../utils/uiMode';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { selectCompetitionTeamTids } from '../../../services/competition/competitionScheduler';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { deriveOfficialNbaRecords } from '../../../utils/nbaOfficialRecords';
import { computeClinchStatus } from '../../../utils/standingsUtils';
import { PBA_COMPETITIONS } from '../../../data/templates/philippines/competitions';
import { getResolvedTeamLogoUrl, getTeamPrimaryColor } from '../../../utils/teamAssets';

type StandingsViewType = 'league' | 'conf' | 'div';
const PBA_COMBINED_FILTER = 'combined';

const TeamMark: React.FC<{ team: any }> = ({ team }) => {
  const [failed, setFailed] = useState(false);
  const logoUrl = getResolvedTeamLogoUrl(team);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt={team?.abbrev ?? team?.name ?? 'Team'}
        className="h-7 w-7 object-contain"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-black text-white"
      style={{ backgroundColor: getTeamPrimaryColor(team) }}
    >
      {team?.abbrev ?? 'PBA'}
    </span>
  );
};

export const StandingsView: React.FC = () => {
  const { state, navigateToTeam } = useGame();
  const ownTid = getOwnTeamId(state);
  const [viewType, setViewType] = useState<StandingsViewType>('conf');
  const leagueYear = state.leagueStats.year;
  const currentPbaCompetitionId = state.leagueStats?.pbaConference === 'commissioners'
    ? 'pba-commissioners-cup'
    : state.leagueStats?.pbaConference === 'governors'
      ? 'pba-governors-cup'
      : 'pba-philippine-cup';
  const [pbaCompetitionFilter, setPbaCompetitionFilter] = useState(currentPbaCompetitionId);

  useEffect(() => {
    if (!isPbaIsolatedMode(state) || pbaCompetitionFilter === PBA_COMBINED_FILTER) return;
    setPbaCompetitionFilter(currentPbaCompetitionId);
  }, [currentPbaCompetitionId, pbaCompetitionFilter, state]);

  // Available years from box scores + current year
  const availableYears = useMemo(() => {
    const years = new Set<number>([leagueYear]);
    state.boxScores.forEach(g => {
      const savedSeason = Number((g as any).season);
      if (savedSeason > 2000) {
        years.add(savedSeason);
        return;
      }
      try {
        const d = new Date(g.date);
        const m = d.getMonth() + 1;
        const y = m >= 7 ? d.getFullYear() + 1 : d.getFullYear();
        if (y > 2000) years.add(y);
      } catch {}
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [state.boxScores, leagueYear]);

  const [selectedYear, setSelectedYear] = useState(leagueYear);
  const currentYear = selectedYear;

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

  const euroRows = useMemo(() => {
    if (!isEuroIsolatedMode(state)) return [];
    const endesaSpec = state.activeCompetitions?.find(c => c.id === 'endesa');
    const activeTids = new Set(endesaSpec ? selectCompetitionTeamTids(endesaSpec, state) : []);
    const acc = new Map<number, { tid: number; w: number; l: number; pf: number; pa: number }>();
    activeTids.forEach(tid => acc.set(tid, { tid, w: 0, l: 0, pf: 0, pa: 0 }));
    state.boxScores.filter(b => b.competitionId === 'endesa').forEach(b => {
      const home = acc.get(b.homeTeamId);
      const away = acc.get(b.awayTeamId);
      if (!home || !away) return;
      const homeWon = b.homeScore > b.awayScore;
      home.w += homeWon ? 1 : 0; home.l += homeWon ? 0 : 1; home.pf += b.homeScore; home.pa += b.awayScore;
      away.w += homeWon ? 0 : 1; away.l += homeWon ? 1 : 0; away.pf += b.awayScore; away.pa += b.homeScore;
    });
    return [...acc.values()].sort((a, b) => (b.w * 2 + b.l) - (a.w * 2 + a.l) || b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
  }, [state]);

  const pbaRows = useMemo(() => {
    if (!isPbaIsolatedMode(state)) return [];
    const selectedCompetitionIds = pbaCompetitionIds;
    const selectedCompetitionTeams = new Set<number>();
    for (const competition of state.activeCompetitions ?? []) {
      if (selectedCompetitionIds.has(String((competition as any).id))) {
        selectCompetitionTeamTids(competition as any, state).forEach(tid => selectedCompetitionTeams.add(tid));
      }
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
    state.boxScores
      .filter((box: any) => {
        if (!selectedCompetitionIds.has(String(box.competitionId ?? ''))) return false;
        const meta = classifyBoxScoreGame(box, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, leagueYear, state.leagueStats);
        const boxSeason = Number(box.season ?? meta.seasonYear);
        if (boxSeason !== currentYear) return false;
        return !meta.isPreseason && !meta.isPlayoff && !meta.isPlayIn && !meta.excludeFromRecord;
      })
      .forEach(b => {
      const home = acc.get(b.homeTeamId);
      const away = acc.get(b.awayTeamId);
      if (!home || !away) return;
      const homeWon = b.homeScore > b.awayScore;
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

    if (officialCurrentRows) {
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
        const homeWon = g.homeScore > g.awayScore;
        const homeTeam = teamMap.get(g.homeTeamId);
        const awayTeam = teamMap.get(g.awayTeamId);

        if (homeAcc && homeTeam) {
          homeAcc.ptsFor += g.homeScore;
          homeAcc.ptsAgainst += g.awayScore;
          homeWon ? homeAcc.totalWins++ : homeAcc.totalLosses++;
          homeWon ? homeAcc.homeWins++  : homeAcc.homeLosses++;
          homeAcc.games.push({ won: homeWon, date: g.date });

          if (awayTeam) {
            const sameConf = homeTeam.conference === awayTeam.conference;
            const sameDiv = homeTeam.did !== undefined && homeTeam.did === awayTeam.did;
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
            const sameConf = awayTeam.conference === homeTeam.conference;
            const sameDiv = awayTeam.did !== undefined && awayTeam.did === homeTeam.did;
            if (sameConf) { !homeWon ? awayAcc.confWins++ : awayAcc.confLosses++; }
            if (sameDiv)  { !homeWon ? awayAcc.divWins++  : awayAcc.divLosses++;  }
          }
        }
      });
    }

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
      const useLiveTeamRecord = currentYear === leagueYear && teamGames > 0 && derivedGames === 0;
      const wins = useLiveTeamRecord ? team.wins : s.totalWins;
      const losses = useLiveTeamRecord ? team.losses : s.totalLosses;
      const totalGames = useLiveTeamRecord ? teamGames : derivedGames;
      const splitWins = derivedGames > 0 ? s.totalWins : wins;
      const splitLosses = derivedGames > 0 ? s.totalLosses : losses;
      const winPct = totalGames > 0 ? wins / totalGames : 0;

      const roadWins = Math.max(0, splitWins - s.homeWins);
      const roadLosses = Math.max(0, splitLosses - s.homeLosses);

      const avgPtsFor = totalGames > 0 ? (s.ptsFor / totalGames).toFixed(1) : '0.0';
      const avgPtsAgainst = totalGames > 0 ? (s.ptsAgainst / totalGames).toFixed(1) : '0.0';
      const movNum = totalGames > 0 ? (s.ptsFor - s.ptsAgainst) / totalGames : 0;
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
      const divObj = state.leagueStats.divs?.find(d => d.did === team.did);
      const division = divObj?.name ?? team.conference;

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

    // Sort by win pct, then wins as tiebreaker
    teams.sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

    const teamsWithClinch = currentYear === leagueYear && !isEuroIsolatedMode(state) && !isPbaIsolatedMode(state)
      ? computeClinchStatus(teams, state.schedule, currentYear)
      : teams;

    if (viewType === 'league') {
      return [{ title: 'League Standings', teams: teamsWithClinch }];
    } else if (viewType === 'conf') {
      return [
        { title: 'Eastern Conference', teams: teamsWithClinch.filter(t => t.conference === 'East') },
        { title: 'Western Conference', teams: teamsWithClinch.filter(t => t.conference === 'West') },
      ];
    } else {
      const divNames = [...new Set(teamsWithClinch.map(t => t.division))].filter(Boolean).sort() as string[];
      return divNames.map(div => ({
        title: div.toLowerCase().endsWith('division') ? div : `${div} Division`,
        teams: teamsWithClinch.filter(t => t.division === div),
      }));
    }
  }, [state.teams, state.boxScores, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, state.leagueStats, state.leagueStats.divs, viewType, currentYear, leagueYear]);

  const renderTable = (group: { title: string; teams: any[] }) => {
    const leader = group.teams[0];
    const leaderWins = leader?.wins || 0;
    const leaderLosses = leader?.losses || 0;

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
                <th className="px-3 py-3 font-medium text-center">Div</th>
                <th className="px-3 py-3 font-medium text-center">Conf</th>
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

                return (
                  <tr key={team.id} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-4 text-right text-xs">{index + 1}</span>
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-slate-800 rounded p-1">
                          <img
                            src={team.logoUrl}
                            alt={team.abbrev}
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <button
                          onClick={() => navigateToTeam(team.id)}
                          className="font-medium text-slate-200 hover:text-indigo-400 transition-colors text-left flex items-center gap-1.5"
                        >
                          <span className="hidden sm:inline">{team.name}</span>
                          <span className="sm:hidden">{team.abbrev}</span>
                          {team.clinchedPlayoffs && (
                            <span className="text-[10px] text-slate-500 font-bold">{team.clinchedPlayoffs}</span>
                          )}
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
                    <td className="px-3 py-2 text-center text-slate-400">{team.divRecord}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{team.confRecord}</td>
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
                const gb = ((leaderWins - row.w) + (row.l - leaderLosses)) / 2;
                const gbDisplay = gb === 0 ? '-' : gb.toFixed(1);
                const isOwn = ownTid !== null && row.tid === ownTid;

                return (
                  <tr key={row.tid} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-800/30'}`}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-4 text-right text-xs">{index + 1}</span>
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-slate-800 rounded p-1">
                          <TeamMark team={team} />
                        </div>
                        <button
                          onClick={() => navigateToTeam(row.tid)}
                          className="font-medium text-slate-200 hover:text-indigo-400 transition-colors text-left flex items-center gap-1.5"
                        >
                          <span className="hidden sm:inline">{getTeamFullName(team)}</span>
                          <span className="sm:hidden">{team?.abbrev ?? 'PBA'}</span>
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
                  <option key={year} value={year}>{year - 1}–{String(year).slice(2)}</option>
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
    return (
      <div className="h-full overflow-y-auto p-4 md:p-8 bg-slate-950">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-black uppercase tracking-tight text-white mb-2">Liga Endesa Standings</h2>
          <p className="text-sm text-slate-500 mb-6">Single-table points format: 2 points per win, 1 per loss.</p>
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/70">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/70 text-[10px] uppercase tracking-widest text-slate-500">
                <tr><th className="px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Club</th><th>W</th><th>L</th><th>Pts</th><th>PF</th><th>PA</th><th>Diff</th></tr>
              </thead>
              <tbody>
                {euroRows.map((row, index) => {
                  const team = resolveAnyTeam(row.tid, state.teams, state.nonNBATeams ?? []);
                  return (
                    <tr key={row.tid} className={row.tid === ownTid ? 'border-t border-amber-500/30 bg-amber-500/10 text-white' : 'border-t border-slate-900 text-slate-200'}>
                      <td className="px-4 py-3 font-black text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3 font-bold">{getTeamFullName(team)}</td>
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
              <option value="conf">Conference</option>
              <option value="div">Division</option>
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
              <p><span className="font-bold text-slate-400">z</span> — clinched #1 seed</p>
              <p><span className="font-bold text-slate-400">x</span> — clinched playoffs</p>
              <p><span className="font-bold text-slate-400">w</span> — clinched play-in</p>
              <p><span className="font-bold text-slate-400">o</span> — eliminated from contention</p>
            </div>
            <div className="max-w-md">
              <p className="font-semibold text-slate-400 mb-2">Tiebreakers — {currentYear} season:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Head-to-head record</li>
                <li>Division winner</li>
                <li>Division record (same div)</li>
                <li>Conference record (same conf)</li>
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
