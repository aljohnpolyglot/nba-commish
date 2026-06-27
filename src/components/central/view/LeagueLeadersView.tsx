import React, { useEffect, useState, useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { useHubScope } from '../../../hooks/useHubScope';
import { NBAPlayer, NBATeam } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StatCategory, getStatValue } from '../../../utils/statUtils';
import { getOwnTeamId } from '../../../utils/helpers';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { PlayerNameWithHover } from '../../shared/PlayerNameWithHover';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { PBA_COMPETITIONS } from '../../../data/templates/philippines/competitions';
import { getConferenceSpec, type PbaConference } from '../../../services/pba/conferenceTransition';
import { buildBoxScoreStatsByPlayer } from './playerStatsBoxScoreMaps';
import { aggregateStats } from './PlayerStatsShared';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { loadPbaStatsForPlayers, type PbaStatsByPlayer } from '../../../services/pba/statsArchive';
import { loadEuroStatsForPlayers, type EuroStatsByPlayer } from '../../../services/euro/statsArchive';

const PBA_COMBINED_FILTER = 'combined';
type LeaderPhase = 'regular' | 'playoffs' | 'combined';

const PLAYER_LEADER_SORT_FIELDS: Record<string, string> = {
  PTS: 'pts',
  FGM: 'fg',
  FGA: 'fga',
  'FG%': 'fgPct',
  '3PM': 'tp',
  '3PA': 'tpa',
  '3P%': 'tpPct',
  FTM: 'ft',
  FTA: 'fta',
  'FT%': 'ftPct',
  REB: 'trb',
  ORB: 'orb',
  DRB: 'drb',
  AST: 'ast',
  STL: 'stl',
  BLK: 'blk',
  TOV: 'tov',
  PF: 'pf',
  MIN: 'min',
  PM: 'pm',
  PER: 'per',
  'TS%': 'tsPct',
  'eFG%': 'efgPctA',
  'USG%': 'usgPct',
  ORtg: 'ortg',
  DRtg: 'drtg',
  BPM: 'bpm',
  WS: 'ws',
  'WS/48': 'ws48',
  VORP: 'vorp',
};

export const LeagueLeadersView: React.FC = () => {
  const { state, navigateToTeam, setCurrentView, setPendingStatSort } = useGame();
  const ownTid = getOwnTeamId(state);
  const { players: scopedPlayers, teams: scopedTeams, euroIsolated, pbaIsolated } = useHubScope();
  const [activeTab, setActiveTab] = useState<'Player' | 'Team'>('Player');
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [pbaCompetitionFilter, setPbaCompetitionFilter] = useState(() =>
    getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id,
  );
  const currentPbaCompetitionId = getConferenceSpec(((state.leagueStats as any)?.pbaConference ?? 'philippine') as PbaConference).id;
  const [leaderPhase, setLeaderPhase] = useState<LeaderPhase>('regular');
  const [pbaArchiveStats, setPbaArchiveStats] = useState<PbaStatsByPlayer>(new Map());
  const [euroArchiveStats, setEuroArchiveStats] = useState<EuroStatsByPlayer>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (pbaIsolated) {
      loadPbaStatsForPlayers(scopedPlayers).then(rows => {
        if (!cancelled) setPbaArchiveStats(rows);
      });
    } else {
      setPbaArchiveStats(new Map());
    }
    if (euroIsolated) {
      loadEuroStatsForPlayers(scopedPlayers).then(rows => {
        if (!cancelled) setEuroArchiveStats(rows);
      });
    } else {
      setEuroArchiveStats(new Map());
    }
    return () => { cancelled = true; };
  }, [euroIsolated, pbaIsolated, scopedPlayers]);

  useEffect(() => {
    if (!pbaIsolated) return;
    const valid = new Set([PBA_COMBINED_FILTER, ...PBA_COMPETITIONS.map(spec => spec.id)]);
    if (!valid.has(pbaCompetitionFilter)) setPbaCompetitionFilter(currentPbaCompetitionId);
  }, [currentPbaCompetitionId, pbaCompetitionFilter, pbaIsolated]);

  const pbaCompetitionOptions = useMemo(() => [
    ...PBA_COMPETITIONS.map(spec => ({ id: spec.id, label: spec.displayName.replace(/^PBA\s+/, '') })),
    { id: PBA_COMBINED_FILTER, label: 'Combined' },
  ], []);

  const pbaCompetitionIds = useMemo(() => {
    if (!pbaIsolated) return undefined;
    return new Set(
      pbaCompetitionFilter === PBA_COMBINED_FILTER
        ? PBA_COMPETITIONS.map(spec => spec.id)
        : [pbaCompetitionFilter],
    );
  }, [pbaIsolated, pbaCompetitionFilter]);

  const filteredPbaArchiveStats = useMemo(() => {
    if (!pbaIsolated) return new Map();
    if (pbaCompetitionFilter === PBA_COMBINED_FILTER) return pbaArchiveStats;
    const filtered = new Map<string, NBAPlayer extends never ? never : any>();
    for (const [playerId, rows] of pbaArchiveStats.entries()) {
      const nextRows = rows.filter(row => (row as any)._archiveCompetitionId === pbaCompetitionFilter);
      if (nextRows.length > 0) filtered.set(playerId, nextRows);
    }
    return filtered as PbaStatsByPlayer;
  }, [pbaArchiveStats, pbaCompetitionFilter, pbaIsolated]);

  // Available seasons from player stats
  const availableSeasons = useMemo(() => {
    if (pbaIsolated) {
      const pbaIds = new Set(PBA_COMPETITIONS.map(spec => spec.id));
      const years = new Set<number>();
      for (const box of state.boxScores as any[]) {
        if (!pbaIds.has(String(box.competitionId ?? ''))) continue;
        const seasonYear = Number(box.season) || state.leagueStats.year;
        if (seasonYear > 0) years.add(seasonYear);
      }
      for (const rows of pbaArchiveStats.values()) {
        rows.forEach(row => {
          if (row.gp > 0) years.add(row.season);
        });
      }
      return Array.from(years).sort((a, b) => b - a);
    }
    if (euroIsolated) {
      const years = new Set<number>();
      for (const p of scopedPlayers) {
        if (!p.stats) continue;
        for (const s of p.stats) {
          if (!s.playoffs && s.gp > 0) years.add(s.season);
        }
      }
      for (const rows of euroArchiveStats.values()) {
        rows.forEach(row => {
          if (row.gp > 0) years.add(row.season);
        });
      }
      return Array.from(years).sort((a, b) => b - a);
    }
    const years = new Set<number>();
    for (const p of scopedPlayers) {
      if (!p.stats) continue;
      for (const s of p.stats) {
        if (!s.playoffs && s.gp > 0) years.add(s.season);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [euroArchiveStats, euroIsolated, pbaArchiveStats, pbaIsolated, state.boxScores, state.leagueStats.year, scopedPlayers]);

  const defaultSeason = availableSeasons[0] || state.leagueStats.year;
  const [selectedSeason, setSelectedSeason] = useState(defaultSeason);
  const season = selectedSeason;

  useEffect(() => {
    if (!pbaIsolated && !euroIsolated) return;
    if (availableSeasons.length > 0 && !availableSeasons.includes(selectedSeason)) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [availableSeasons, euroIsolated, pbaIsolated, selectedSeason]);

  const handleCompleteLeaders = (type: 'player' | 'team', field: string, order: 'asc' | 'desc' = 'desc') => {
    setPendingStatSort({
      type,
      field: type === 'player' ? (PLAYER_LEADER_SORT_FIELDS[field] ?? field) : field,
      order,
      ...(pbaIsolated ? { phase: leaderPhase, competitionId: pbaCompetitionFilter } : {}),
    });
    setCurrentView(type === 'player' ? 'Player Stats' : 'Team Stats');
  };

  const pbaStatsByPlayer = useMemo(
    () => pbaCompetitionIds
      ? buildBoxScoreStatsByPlayer(state, { competitionIds: pbaCompetitionIds, phase: leaderPhase })
      : null,
    [pbaCompetitionIds, leaderPhase, state.boxScores, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, state.leagueStats],
  );

  const externalArchiveStats = pbaIsolated ? filteredPbaArchiveStats : euroIsolated ? euroArchiveStats : new Map();

  // Player Leaders
  const playerLeaders = useMemo(() => {
    const playersWithStats = scopedPlayers.map(player => {
      const boxRows = pbaStatsByPlayer?.get(player.internalId)?.filter(stat => stat.season === season) ?? [];
      const archiveRows = leaderPhase === 'playoffs'
        ? []
        : externalArchiveStats.get(player.internalId)?.filter(stat => stat.season === season && !boxRows.some(boxRow => boxRow.season === stat.season)) ?? [];
      const pbaRows = [...archiveRows, ...boxRows];
      const stat = pbaStatsByPlayer || externalArchiveStats.size > 0
        ? (pbaRows.length ? aggregateStats(pbaRows) : undefined)
        : player.stats?.find(s => s.season === season && !s.playoffs);
      return { player, stat };
    }).filter(p => p.stat && p.stat.gp > 0);

    // NBA-style qualifying minimums — only kick in after 10 games have been played
    const maxGP = Math.max(...playersWithStats.map(p => p.stat?.gp || 0), 1);
    const seasonsStarted = maxGP >= 10;
    const minGP = Math.max(1, Math.floor(maxGP * 0.3)); // 30% of max games played, no hard floor early season

    const getTop5 = (cat: StatCategory, asc = false, qualifier?: (s: any) => boolean) => {
      const pool = (seasonsStarted && qualifier)
        ? playersWithStats.filter(p => p.stat && qualifier(p.stat))
        : playersWithStats;
      return [...pool].sort((a, b) => {
        const valA = getStatValue(a.stat, cat);
        const valB = getStatValue(b.stat, cat);
        return asc ? valA - valB : valB - valA;
      }).slice(0, 5).map(p => ({
        ...p,
        value: getStatValue(p.stat, cat)
      }));
    };

    // Qualifier helpers (ignored entirely before 10 games played)
    const qVolume   = (s: any) => s.gp >= minGP;                                          // per-game counting stats
    const qFGPct    = (s: any) => s.gp >= minGP && s.fga / s.gp >= 3.0;                  // FG%: ≥3 FGA/game
    const q3PPct    = (s: any) => s.gp >= minGP  && s.tpa / s.gp >= 1.0;                  // 3P%: ≥1 3PA/game
    const qFTPct    = (s: any) => s.gp >= minGP  && s.fta / s.gp >= 2.0;                  // FT%: ≥2 FTA/game
    const qAdvanced = (s: any) => s.gp >= minGP && s.min / s.gp >= 10;                   // advanced: ≥10 MPG
    const qRating   = (s: any) => s.gp >= minGP && s.min / s.gp >= 15;                   // ORtg/DRtg: ≥15 MPG

    return {
      PTS: getTop5('PTS', false, qVolume),
      FGM: getTop5('FGM', false, qVolume),
      FGA: getTop5('FGA', false, qVolume),
      'FG%': getTop5('FG%', false, qFGPct),
      '3PM': getTop5('3PM', false, qVolume),
      '3PA': getTop5('3PA', false, qVolume),
      '3P%': getTop5('3P%', false, q3PPct),
      FTM: getTop5('FTM', false, qVolume),
      FTA: getTop5('FTA', false, qVolume),
      'FT%': getTop5('FT%', false, qFTPct),

      REB: getTop5('REB', false, qVolume),
      ORB: getTop5('ORB', false, qVolume),
      DRB: getTop5('DRB', false, qVolume),
      AST: getTop5('AST', false, qVolume),
      STL: getTop5('STL', false, qVolume),
      BLK: getTop5('BLK', false, qVolume),
      TOV: getTop5('TOV', false, qVolume),
      PF:  getTop5('PF',  false, qVolume),
      MIN: getTop5('MIN', false, qVolume),
      PM:  getTop5('PM',  false, qVolume),

      PER:    getTop5('PER',    false, qAdvanced),
      'TS%':  getTop5('TS%',   false, qFGPct),
      'eFG%': getTop5('eFG%',  false, qFGPct),
      'USG%': getTop5('USG%',  false, qAdvanced),
      ORtg:   getTop5('ORtg',  false, qRating),
      DRtg:   getTop5('DRtg',  true,  qRating),
      BPM:    getTop5('BPM',   false, qAdvanced),
      WS:     getTop5('WS',    false, qVolume),
      'WS/48':getTop5('WS/48', false, qAdvanced),
      VORP:   getTop5('VORP',  false, qAdvanced),
    };
  }, [externalArchiveStats, leaderPhase, scopedPlayers, season, pbaStatsByPlayer]);

  // Team Leaders
  const teamLeaders = useMemo(() => {
    const teamStats: Record<number, { gp: number, pts: number, oppPts: number, fgm: number, fga: number, tpm: number, tpa: number, reb: number, blk: number }> = {};
    
    scopedTeams.forEach(t => {
      teamStats[t.id] = { gp: 0, pts: 0, oppPts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, blk: 0 };
    });

    state.boxScores.forEach(game => {
      if (game.isAllStar || game.isRisingStars) return;
      const meta = classifyBoxScoreGame(game as any, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, state.leagueStats.year, state.leagueStats);
      const gameSeason = Number((game as any).season ?? meta.seasonYear);
      if (gameSeason !== season) return;
      if (pbaCompetitionIds) {
        if (!pbaCompetitionIds.has(String((game as any).competitionId ?? ''))) return;
        if (meta.isPreseason || meta.isPlayIn || meta.excludeFromRecord) return;
        if (leaderPhase === 'regular' && meta.isPlayoff) return;
        if (leaderPhase === 'playoffs' && !meta.isPlayoff) return;
      } else if (meta.isPreseason || meta.isPlayoff || meta.isPlayIn || meta.excludeFromRecord) {
        return;
      }
      
      const home = teamStats[game.homeTeamId];
      const away = teamStats[game.awayTeamId];
      
      if (home) {
        home.gp++;
        home.pts += game.homeScore;
        home.oppPts += game.awayScore;
        game.homeStats?.forEach(s => {
          home.fgm += s.fgm || 0;
          home.fga += s.fga || 0;
          home.tpm += s.threePm || 0;
          home.tpa += s.threePa || 0;
          home.reb += s.reb || (s.orb || 0) + (s.drb || 0);
          home.blk += s.blk || 0;
        });
      }
      
      if (away) {
        away.gp++;
        away.pts += game.awayScore;
        away.oppPts += game.homeScore;
        game.awayStats?.forEach(s => {
          away.fgm += s.fgm || 0;
          away.fga += s.fga || 0;
          away.tpm += s.threePm || 0;
          away.tpa += s.threePa || 0;
          away.reb += s.reb || (s.orb || 0) + (s.drb || 0);
          away.blk += s.blk || 0;
        });
      }
    });

    const teamsWithStats = scopedTeams.map(team => {
      const stats = teamStats[team.id];
      return { team, stats };
    }).filter(t => t.stats && t.stats.gp > 0);

    const getVal = (s: any, cat: string) => {
      const gp = s.gp || 1;
      switch (cat) {
        case 'PTS': return s.pts / gp;
        case 'OPP PTS': return s.oppPts / gp;
        case 'FG%': return s.fga > 0 ? (s.fgm / s.fga) * 100 : 0;
        case '3P%': return s.tpa > 0 ? (s.tpm / s.tpa) * 100 : 0;
        case 'REB': return s.reb / gp;
        case 'BLK': return s.blk / gp;
        default: return 0;
      }
    };

    const getTop5 = (cat: string, asc = false) => {
      return [...teamsWithStats].sort((a, b) => {
        const valA = getVal(a.stats, cat);
        const valB = getVal(b.stats, cat);
        return asc ? valA - valB : valB - valA;
      }).slice(0, 5).map(t => ({
        ...t,
        value: getVal(t.stats, cat)
      }));
    };

    return {
      PTS: getTop5('PTS'),
      'FG%': getTop5('FG%'),
      '3P%': getTop5('3P%'),
      'OPP PTS': getTop5('OPP PTS', true),
      REB: getTop5('REB'),
      BLK: getTop5('BLK'),
    };
  }, [scopedTeams, state.boxScores, state.schedule, state.playoffs, state.nbaCup, state.nbaCupHistory, state.leagueStats, season, pbaCompetitionIds, leaderPhase]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  const renderPlayerTable = (title: string, data: any[], statKey: string, format: 'number' | 'percent' | 'decimal3' = 'number', order: 'desc' | 'asc' = 'desc') => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-white mb-3 border-b border-slate-800 pb-2">{title}</h3>
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-semibold w-12">#</th>
              <th className="px-4 py-3 font-semibold">Player</th>
              <th className="px-4 py-3 font-semibold text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {data.map((item, index) => {
              const team = resolveAnyTeam(item.stat.tid, state.teams, state.nonNBATeams ?? []);
              const isOwn = ownTid !== null && item.player.tid === ownTid;
              return (
                <tr key={item.player.internalId} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/50'}`}>
                  <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PlayerPortrait
                        imgUrl={item.player.imgURL}
                        face={(item.player as any).face}
                        playerName={item.player.name}
                        size={32}
                      />
                      <div className="flex items-baseline gap-2">
                        <PlayerNameWithHover
                          player={item.player}
                          className="font-medium text-indigo-400 cursor-pointer hover:text-indigo-300 hover:underline"
                          onClick={() => setViewingPlayer(item.player)}
                        >
                          {item.player.name}
                        </PlayerNameWithHover>
                        <span className="text-xs text-slate-500">{team?.abbrev || item.player.status || 'FA'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-white">
                    {format === 'percent' ? `${item.value.toFixed(1)}%` : format === 'decimal3' ? item.value.toFixed(3).replace(/^0+/, '') : item.value.toFixed(1)}
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">No data available</td>
              </tr>
            )}
          </tbody>
        </table>
        <button 
          onClick={() => handleCompleteLeaders('player', statKey, order)}
          className="w-full py-3 px-4 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/50 transition-colors border-t border-slate-800 flex items-center justify-center gap-1"
        >
          Complete Leaders <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  const renderTeamTable = (title: string, data: any[], statKey: string, order: 'asc' | 'desc' = 'desc', format: 'number' | 'percent' = 'number') => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-white mb-3 border-b border-slate-800 pb-2">{title}</h3>
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-semibold w-12">#</th>
              <th className="px-4 py-3 font-semibold">Team</th>
              <th className="px-4 py-3 font-semibold text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {data.map((item, index) => {
              const isOwn = ownTid !== null && item.team.id === ownTid;
              return (
              <tr key={item.team.id} className={`transition-colors ${isOwn ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'hover:bg-slate-800/50'}`}>
                <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {item.team.logoUrl ? (
                      <img src={item.team.logoUrl} alt={item.team.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-xs">
                        {item.team.abbrev}
                      </div>
                    )}
                    <span
                      className="font-medium text-indigo-400 cursor-pointer hover:text-indigo-300 hover:underline"
                      onClick={() => navigateToTeam(item.team.id)}
                    >
                      {item.team.name}
                    </span>
                    {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">You</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-white">
                  {format === 'percent' ? `${item.value.toFixed(1)}%` : item.value.toFixed(1)}
                </td>
              </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">No data available</td>
              </tr>
            )}
          </tbody>
        </table>
        <button
          onClick={() => handleCompleteLeaders('team', statKey, order)}
          className="w-full py-3 px-4 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/50 transition-colors border-t border-slate-800 flex items-center justify-center gap-1"
        >
          Complete Leaders <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">
            {pbaIsolated ? 'PBA' : euroIsolated ? 'EuroLeague' : 'NBA'} Stat Leaders {season - 1}-{String(season).slice(2)}
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
          {pbaIsolated && (
            <>
              <select
                value={pbaCompetitionFilter}
                onChange={e => setPbaCompetitionFilter(e.target.value)}
                className="h-8 bg-slate-900 border border-slate-700 text-white text-xs px-2 rounded focus:outline-none focus:border-indigo-500 appearance-none"
              >
                {pbaCompetitionOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <select
                value={leaderPhase}
                onChange={e => setLeaderPhase(e.target.value as LeaderPhase)}
                className="h-8 bg-slate-900 border border-slate-700 text-white text-xs px-2 rounded focus:outline-none focus:border-indigo-500 appearance-none"
              >
                <option value="regular">Regular Season</option>
                <option value="playoffs">Playoffs</option>
                <option value="combined">Combined</option>
              </select>
            </>
          )}
          {availableSeasons.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-md p-0.5">
              <button
                onClick={() => { const idx = availableSeasons.indexOf(selectedSeason); if (idx < availableSeasons.length - 1) setSelectedSeason(availableSeasons[idx + 1]); }}
                disabled={availableSeasons.indexOf(selectedSeason) >= availableSeasons.length - 1}
                className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              ><ChevronLeft size={14} /></button>
              <span className="text-sm font-black text-white px-2">{season}</span>
              <button
                onClick={() => { const idx = availableSeasons.indexOf(selectedSeason); if (idx > 0) setSelectedSeason(availableSeasons[idx - 1]); }}
                disabled={availableSeasons.indexOf(selectedSeason) <= 0}
                className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              ><ChevronRight size={14} /></button>
            </div>
          )}
          </div>
        </div>
        
        <div className="flex gap-6 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('Player')}
            className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors relative ${
              activeTab === 'Player' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Player
            {activeTab === 'Player' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('Team')}
            className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors relative ${
              activeTab === 'Team' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Team
            {activeTab === 'Team' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full" />
            )}
          </button>
        </div>
      </div>

    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'Player' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
              {/* Main Box Score Stats */}
              {renderPlayerTable('Points (PTS)', playerLeaders.PTS, 'PTS')}
              {renderPlayerTable('Total Rebounds (REB)', playerLeaders.REB, 'REB')}
              {renderPlayerTable('Assists (AST)', playerLeaders.AST, 'AST')}
              
              {renderPlayerTable('Steals (STL)', playerLeaders.STL, 'STL')}
              {renderPlayerTable('Blocks (BLK)', playerLeaders.BLK, 'BLK')}
              {renderPlayerTable('Turnovers (TOV)', playerLeaders.TOV, 'TOV')}
              
              {renderPlayerTable('Minutes (MIN)', playerLeaders.MIN, 'MIN')}
              {renderPlayerTable('+/- Per Game (PM)', playerLeaders.PM, 'PM')}
              {renderPlayerTable('Personal Fouls (PF)', playerLeaders.PF, 'PF')}

              {/* Shooting Percentages */}
              {renderPlayerTable('Field Goal Percentage (FG%)', playerLeaders['FG%'], 'FG%', 'percent')}
              {renderPlayerTable('3-Point Percentage (3P%)', playerLeaders['3P%'], '3P%', 'percent')}
              {renderPlayerTable('Free Throw Percentage (FT%)', playerLeaders['FT%'], 'FT%', 'percent')}

              {/* Shooting Makes */}
              {renderPlayerTable('Field Goals Made (FGM)', playerLeaders.FGM, 'FGM')}
              {renderPlayerTable('3-Pointers Made (3PM)', playerLeaders['3PM'], '3PM')}
              {renderPlayerTable('Free Throws Made (FTM)', playerLeaders.FTM, 'FTM')}

              {/* Shooting Attempts */}
              {renderPlayerTable('Field Goals Attempted (FGA)', playerLeaders.FGA, 'FGA')}
              {renderPlayerTable('3-Pointers Attempted (3PA)', playerLeaders['3PA'], '3PA')}
              {renderPlayerTable('Free Throws Attempted (FTA)', playerLeaders.FTA, 'FTA')}

              {/* Advanced & Misc */}
              {renderPlayerTable('Offensive Rebounds (ORB)', playerLeaders.ORB, 'ORB')}
              {renderPlayerTable('Defensive Rebounds (DRB)', playerLeaders.DRB, 'DRB')}
              {renderPlayerTable('Player Efficiency Rating (PER)', playerLeaders.PER, 'PER')}

              {renderPlayerTable('True Shooting Pct (TS%)', playerLeaders['TS%'], 'TS%', 'percent')}
              {renderPlayerTable('Effective FG Pct (eFG%)', playerLeaders['eFG%'], 'eFG%', 'percent')}
              {renderPlayerTable('Usage Percentage (USG%)', playerLeaders['USG%'], 'USG%', 'percent')}

              {renderPlayerTable('Offensive Rating (ORtg)', playerLeaders.ORtg, 'ORtg')}
              {renderPlayerTable('Defensive Rating (DRtg)', playerLeaders.DRtg, 'DRtg', 'number', 'asc')}
              {renderPlayerTable('Box Plus-Minus (BPM)', playerLeaders.BPM, 'BPM')}

              {renderPlayerTable('Win Shares (WS)', playerLeaders.WS, 'WS')}
              {renderPlayerTable('Win Shares / 48 Mins (WS/48)', playerLeaders['WS/48'], 'WS/48', 'decimal3')}
              {renderPlayerTable('Value Over Replacement (VORP)', playerLeaders.VORP, 'VORP')}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight mb-6">Offensive Leaders</h2>
                {renderTeamTable('Points (PTS)', teamLeaders.PTS, 'pts')}
                {renderTeamTable('Field Goal % (FG%)', teamLeaders['FG%'], 'fgp', 'desc', 'percent')}
                {renderTeamTable('3-Point % (3P%)', teamLeaders['3P%'], 'tpp', 'desc', 'percent')}
              </div>
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight mb-6">Defensive Leaders</h2>
                {renderTeamTable('Points Allowed (OPP PTS)', teamLeaders['OPP PTS'], 'oppg', 'asc')}
                {renderTeamTable('Rebounds (REB)', teamLeaders.REB, 'trb')}
                {renderTeamTable('Blocks (BLK)', teamLeaders.BLK, 'blk')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
