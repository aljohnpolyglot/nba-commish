import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { NBATeam, Game, GameResult, PlayerGameStats, NBAPlayer, PlayoffBracket } from '../../types';
import { useGame } from '../../store/GameContext';
import { getGameTimingConfig } from '../../utils/gameClock';
import { isFourPointEnabled } from '../../utils/ruleFlags';
import { getTeamFullName } from '../../utils/teamNames';
import { normalizeDate } from '../../utils/helpers';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { BoxScoreQuarterlyScores, BoxScoreTeamComparison } from './BoxScoreSummary';

interface BoxScoreModalProps {
  game: Game;
  result?: GameResult;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  players: NBAPlayer[];
  onClose: () => void;
  onPlayerClick?: (player: NBAPlayer) => void;
  onTeamClick?: (teamId: number) => void;
  playoffs?: PlayoffBracket | null;
  schedule?: Game[];
}

type SortKey = keyof PlayerGameStats | 'fgp' | 'tpp' | 'ftp';

function isBoxScoreRosterPlayer(player: NBAPlayer, teamId: number): boolean {
  if (player.tid !== teamId) return false;
  const status = player.status ?? 'Active';
  return status !== 'Retired' && status !== 'Free Agent' && status !== 'Draft Prospect' && status !== 'Prospect';
}

const collapseRepeatedLabel = (label?: string) => {
  const parts = (label ?? '').trim().split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.floor(parts.length / 2); size += 1) {
    if (parts.slice(0, size).join(' ').toLowerCase() === parts.slice(size, size * 2).join(' ').toLowerCase()) {
      return parts.slice(0, size).join(' ');
    }
  }
  return parts.join(' ');
};

export const BoxScoreModal: React.FC<BoxScoreModalProps> = ({
  game, result, homeTeam, awayTeam, players, onClose, onPlayerClick, onTeamClick, playoffs, schedule
}) => {
  const { state } = useGame();
  const timingConfig = useMemo(() => getGameTimingConfig(state.leagueStats), [state.leagueStats]);
  const fourPointEnabled = isFourPointEnabled(state.leagueStats);
  // For playoff/play-in games, find the series to show series score instead of W-L record
  const seriesInfo = useMemo(() => {
    if ((!game.isPlayoff && !game.isPlayIn) || !playoffs || !game.playoffSeriesId) return null;
    const series = playoffs.series.find(s => s.id === game.playoffSeriesId);
    if (!series) return null;
    const hW = series.higherSeedTid === homeTeam.id ? series.higherSeedWins : series.lowerSeedWins;
    const aW = series.higherSeedTid === awayTeam.id ? series.higherSeedWins : series.lowerSeedWins;
    const winsNeeded = Math.ceil(series.gamesNeeded / 2);
    const complete = series.status === 'complete';
    const homeSeriesW = hW;
    const awaySeriesW = aW;
    if (complete) {
      const champ = series.winnerId === homeTeam.id ? homeTeam.abbrev : awayTeam.abbrev;
      return { homeLabel: `${homeSeriesW}`, awayLabel: `${awaySeriesW}`, sub: `${champ} WINS ${Math.max(hW,aW)}-${Math.min(hW,aW)}` };
    }
    const leader = hW > aW ? homeTeam.abbrev : aW > hW ? awayTeam.abbrev : null;
    const sub = leader
      ? `${leader} leads ${Math.max(hW,aW)}-${Math.min(hW,aW)}`
      : `Series tied ${hW}-${aW}`;
    return { homeLabel: `${homeSeriesW}`, awayLabel: `${awaySeriesW}`, sub };
  }, [game, playoffs, homeTeam, awayTeam]);
  const isIntraSquad = game.homeTid === game.awayTid;
  const displayTeamName = (team: NBATeam) => collapseRepeatedLabel(team.id < 0 ? team.name : (getTeamFullName(team) || team.name));
  const awayBaseName = displayTeamName(awayTeam);
  const homeBaseName = displayTeamName(homeTeam);
  const awayDisplayName = isIntraSquad ? `${awayBaseName} B` : awayBaseName;
  const homeDisplayName = isIntraSquad ? `${homeBaseName} A` : homeBaseName;
  const awayAbbrevLabel = isIntraSquad ? `${awayTeam.abbrev} B` : awayTeam.abbrev;
  const homeAbbrevLabel = isIntraSquad ? `${homeTeam.abbrev} A` : homeTeam.abbrev;
  const datedRecords = useMemo(() => {
    if (seriesInfo) return null;
    const targetDate = normalizeDate(result?.date || game.date);
    const inferredPbaSeason = (() => {
      if (!String(game.competitionId ?? '').startsWith('pba-')) return null;
      const [year, month] = targetDate.split('-').map(Number);
      if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
      return month >= 10 ? year + 1 : year;
    })();
    const targetSeason = result?.season ?? (game as any).season ?? inferredPbaSeason ?? state.leagueStats?.year;
    const currentPhase = String((game as any).competitionPhase ?? '').toLowerCase();
    const isRegularCompetitionPhase = (phase: string) =>
      ['group', 'league', 'regular', 'regular-season'].includes(phase) || phase.startsWith('r');
    const isCompetitionRegular = !game.competitionId || isRegularCompetitionPhase(currentPhase);
    const isStandingsGame = !game.isPreseason && !game.isPlayoff && !game.isPlayIn && !(result as any)?.excludeFromRecord && isCompetitionRegular;
    if (!isStandingsGame) return null;

    let homeWins = 0;
    let homeLosses = 0;
    let awayWins = 0;
    let awayLosses = 0;
    const allResults = [...(state.boxScores ?? [])];
    if (!allResults.some((box: any) => box.gameId === game.gid) && result) {
      allResults.push({ ...result, gameId: game.gid, date: result.date ?? game.date, season: targetSeason, competitionId: game.competitionId, competitionPhase: (game as any).competitionPhase });
    }

    const relevantGames = allResults
      .filter((box: any) => {
        if (box.homeTeamId < 0 || box.awayTeamId < 0) return false;
        if ((box.season ?? targetSeason) !== targetSeason) return false;
        if (normalizeDate(box.date) > targetDate) return false;
        const scheduleGame = schedule?.find(g => g.gid === box.gameId);
        const boxCompetitionId = box.competitionId ?? scheduleGame?.competitionId;
        const boxPhase = String(box.competitionPhase ?? (scheduleGame as any)?.competitionPhase ?? '').toLowerCase();
        const excludeFromRecord = box.excludeFromRecord === true || (scheduleGame as any)?.excludeFromRecord === true;
        if (excludeFromRecord) return false;
        if (scheduleGame?.isPreseason || scheduleGame?.isPlayoff || scheduleGame?.isPlayIn) return false;
        if (game.competitionId) return boxCompetitionId === game.competitionId && isRegularCompetitionPhase(boxPhase);
        return !boxCompetitionId;
      })
      .sort((a: any, b: any) => {
        const dateCmp = normalizeDate(a.date).localeCompare(normalizeDate(b.date));
        if (dateCmp !== 0) return dateCmp;
        return (a.gameId ?? 0) - (b.gameId ?? 0);
      });

    for (const box of relevantGames) {
      const homeWon = (box.homeScore ?? 0) > (box.awayScore ?? 0);
      if (box.homeTeamId === homeTeam.id) {
        if (homeWon) homeWins++; else homeLosses++;
      } else if (box.awayTeamId === homeTeam.id) {
        if (homeWon) homeLosses++; else homeWins++;
      }
      if (box.homeTeamId === awayTeam.id) {
        if (homeWon) awayWins++; else awayLosses++;
      } else if (box.awayTeamId === awayTeam.id) {
        if (homeWon) awayLosses++; else awayWins++;
      }
    }

    return {
      homeLabel: `${homeWins}–${homeLosses}`,
      awayLabel: `${awayWins}–${awayLosses}`,
    };
  }, [awayTeam.id, game, homeTeam.id, result, schedule, seriesInfo, state.boxScores, state.leagueStats?.year]);

  // Style + label per "fake-team" archetype for All-Star / Rising Stars / Celebrity placeholders.
  const FAKE_TEAM_STYLES = {
    usa:   { cls: 'bg-sky-900/50 border-sky-500/60 text-sky-300',         label: '🇺🇸' },
    world: { cls: 'bg-emerald-900/50 border-emerald-500/60 text-emerald-300', label: '🌍' },
    east:  { cls: 'bg-blue-900/50 border-blue-500/60 text-blue-300',      label: 'E'  },
    west:  { cls: 'bg-amber-900/50 border-amber-500/60 text-amber-300',   label: 'W'  },
  } as const;
  const classifyFakeTeam = (team: NBATeam): keyof typeof FAKE_TEAM_STYLES => {
    const name = (team.name || '').toLowerCase();
    if (name.includes('usa') || name.includes('stripe') || (name.includes('star') && !name.includes('rising'))) return 'usa';
    if (name.includes('world')) return 'world';
    if (team.conference === 'East' || name.includes('eastern')) return 'east';
    return 'west';
  };

  const renderTeamLogo = (team: NBATeam) => {
    // Prefer threaded-through logoUrl whenever present.
    if (team.logoUrl) {
      const sizeCls = team.id < 0 ? 'w-16 h-16 md:w-24 md:h-24' : 'w-12 h-12 md:w-24 md:h-24';
      return <img src={team.logoUrl} alt={displayTeamName(team)} className={`${sizeCls} object-contain drop-shadow-2xl group-hover:scale-110 transition-transform`} referrerPolicy="no-referrer" />;
    }
    if (team.id < 0) {
      const { cls, label } = FAKE_TEAM_STYLES[classifyFakeTeam(team)];
      return (
        <div className={`w-16 h-16 md:w-24 md:h-24 rounded-full flex items-center justify-center text-3xl md:text-5xl font-black border-2 group-hover:scale-110 transition-transform ${cls}`}>
          {label}
        </div>
      );
    }
    // Non-NBA team without logo
    return (
      <div className="w-12 h-12 md:w-24 md:h-24 rounded-full bg-emerald-900/30 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-lg group-hover:scale-110 transition-transform">
        {team.abbrev?.slice(0, 3) || '?'}
      </div>
    );
  };
  const [activeTab, setActiveTab] = React.useState<'away' | 'home' | 'comparison'>('away');
  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'pts',
    direction: 'desc'
  });

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const formatPlayerMinutes = (stat: PlayerGameStats) => {
    const statMinutes = Number(stat.min ?? 0);
    const statSeconds = Number(stat.sec ?? 0);
    const hasWholeMinuteWithRemainder =
      Number.isFinite(statMinutes) &&
      Number.isFinite(statSeconds) &&
      statSeconds > 0 &&
      statSeconds < 60 &&
      Math.abs(statMinutes - Math.round(statMinutes)) < 0.001;
    const totalSeconds = Number.isFinite(statMinutes) && statMinutes > 0
      ? Math.max(0, Math.round(statMinutes * 60 + (hasWholeMinuteWithRemainder ? statSeconds : 0)))
      : Math.max(0, Math.round(Number.isFinite(statSeconds) ? statSeconds : 0));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const getPlayerPos = (playerId: string) => {
    const p = players.find(p => p.internalId === playerId);
    return p?.pos || 'N/A';
  };

  const getDnpReason = React.useCallback((player: NBAPlayer) => {
    const explicit = result?.playerDNPs?.[player.internalId];
    if (explicit) return explicit;
    if ((player.injury?.gamesRemaining ?? 0) > 0) {
      return `DNP — Injury (${player.injury!.type})`;
    }
    if ((game.isPlayoff || game.isPlayIn) && (player as any).twoWay) {
      return 'DNP — Two Way';
    }
    return "DNP — Coach's Decision";
  }, [game.isPlayIn, game.isPlayoff, result?.playerDNPs]);

  const renderStatsTable = (stats: PlayerGameStats[], teamId: number) => {
    const sortedStats = [...stats].sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA: any = a[key as keyof PlayerGameStats];
      let valB: any = b[key as keyof PlayerGameStats];

      if (key === 'fgp') {
        valA = a.fga > 0 ? a.fgm / a.fga : 0;
        valB = b.fga > 0 ? b.fgm / b.fga : 0;
      } else if (key === 'tpp') {
        valA = a.threePa > 0 ? a.threePm / a.threePa : 0;
        valB = b.threePa > 0 ? b.threePm / b.threePa : 0;
      } else if (key === 'ftp') {
        valA = a.fta > 0 ? a.ftm / a.fta : 0;
        valB = b.fta > 0 ? b.ftm / b.fta : 0;
      }

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    const SortHeader = ({ label, sortKey, align = 'right' }: { label: string, sortKey: SortKey, align?: 'left' | 'right' | 'center' }) => (
      <th 
        className={`px-2 py-3 font-black tracking-widest cursor-pointer hover:text-white transition-colors text-${align} ${sortConfig.key === sortKey ? 'text-indigo-400' : ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          {label}
          {sortConfig.key === sortKey && (
            <span className="text-[8px]">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
          )}
        </div>
      </th>
    );

    return (
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs text-left min-w-[800px]">
          <thead className="text-[10px] text-slate-500 uppercase bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-black tracking-widest">Name</th>
              <th className="px-2 py-3 font-black tracking-widest">Pos</th>
              <SortHeader label="MIN" sortKey="min" />
              <SortHeader label="FGM-A" sortKey="fgm" />
              <SortHeader label="3PM-A" sortKey="threePm" />
              {fourPointEnabled && <SortHeader label="4PM-A" sortKey="fourPm" />}
              <SortHeader label="FTM-A" sortKey="ftm" />
              <SortHeader label="ORB" sortKey="orb" />
              <SortHeader label="DRB" sortKey="drb" />
              <SortHeader label="REB" sortKey="reb" />
              <SortHeader label="AST" sortKey="ast" />
              <SortHeader label="STL" sortKey="stl" />
              <SortHeader label="BLK" sortKey="blk" />
              <SortHeader label="TOV" sortKey="tov" />
              <SortHeader label="PF" sortKey="pf" />
              <SortHeader label="PTS" sortKey="pts" />
              <SortHeader label="+/-" sortKey="pm" />
              <SortHeader label="GmSc" sortKey="gameScore" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sortedStats.map((s) => {
              const playerObj = players.find(p => p.internalId === s.playerId);
              return (
              <tr key={s.playerId} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-3">
                  {playerObj ? (
                    <PlayerNameWithHover
                      player={playerObj}
                      className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                      onClick={() => onPlayerClick && onPlayerClick(playerObj)}
                    >
                      {s.name}
                    </PlayerNameWithHover>
                  ) : (
                    <span className="font-bold text-indigo-400">{s.name}</span>
                  )}
                  {(() => {
                    const exit = result?.playerInGameInjuries?.[s.playerId];
                    if (exit) {
                      const q = exit.quarter > 4 ? 'OT' : `Q${exit.quarter}`;
                      return (
                        <span
                          title={`Left in ${q} — ${exit.type}`}
                          className="ml-1.5 inline-block text-[9px] font-black text-red-500 cursor-help align-middle"
                        >
                          ✚
                        </span>
                      );
                    }
                    const hurt = result?.playersPlayingHurt?.[s.playerId];
                    if (hurt) {
                      return (
                        <span
                          title={`Playing hurt — ${hurt}`}
                          className="ml-1.5 inline-block text-[9px] font-black text-orange-500 cursor-help align-middle"
                        >
                          ✚
                        </span>
                      );
                    }
                    return null;
                  })()}
                </td>
                <td className="px-2 py-3 font-mono text-slate-400">{getPlayerPos(s.playerId)}</td>
                <td className="px-2 py-3 text-right font-mono">{formatPlayerMinutes(s)}</td>
                <td className="px-2 py-3 text-right font-mono">{s.fgm}-{s.fga}</td>
                <td className="px-2 py-3 text-right font-mono">{s.threePm}-{s.threePa}</td>
                {fourPointEnabled && <td className="px-2 py-3 text-right font-mono">{s.fourPm || 0}-{s.fourPa || 0}</td>}
                <td className="px-2 py-3 text-right font-mono">{s.ftm}-{s.fta}</td>
                <td className="px-2 py-3 text-right font-mono">{s.orb}</td>
                <td className="px-2 py-3 text-right font-mono">{s.drb}</td>
                <td className="px-2 py-3 text-right font-mono">{s.reb}</td>
                <td className="px-2 py-3 text-right font-mono">{s.ast}</td>
                <td className="px-2 py-3 text-right font-mono">{s.stl}</td>
                <td className="px-2 py-3 text-right font-mono">{s.blk}</td>
                <td className="px-2 py-3 text-right font-mono">{s.tov}</td>
                <td className="px-2 py-3 text-right font-mono">{s.pf || 0}</td>
                <td className="px-2 py-3 text-right font-mono font-bold text-white">{s.pts}</td>
                <td className={`px-2 py-3 text-right font-mono ${(s.pm || 0) > 0 ? 'text-green-400' : (s.pm || 0) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {(s.pm || 0) > 0 ? '+' : ''}{s.pm || 0}
                </td>
                <td className="px-2 py-3 text-right font-mono">{s.gameScore?.toFixed(1) || '0.0'}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      {(() => {
        const dnpPlayers = players.filter(p =>
          isBoxScoreRosterPlayer(p, teamId) &&
          !stats.some(s => s.playerId === p.internalId)
        );
        if (dnpPlayers.length === 0) return null;
        return (
          <table className="w-full text-xs text-left min-w-[800px] border-t border-slate-800/50 mt-px">
            <tbody>
              {dnpPlayers.map(p => (
                <tr key={p.internalId} className="opacity-50 hover:opacity-75 transition-opacity">
                  <td className="px-4 py-2">
                    <PlayerNameWithHover
                      player={p}
                      className="font-bold text-slate-400 hover:text-slate-300 transition-colors cursor-pointer"
                      onClick={() => onPlayerClick && onPlayerClick(p)}
                    >
                      {p.name}
                    </PlayerNameWithHover>
                  </td>
                  <td className="px-2 py-2 font-mono text-slate-500">{p.pos || 'N/A'}</td>
                  <td colSpan={fourPointEnabled ? 16 : 15} className="px-2 py-2 text-slate-500 italic font-mono text-[11px] uppercase tracking-widest">
                    {getDnpReason(p)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
    </div>
  );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-[#0a0a0a] border border-white/10 rounded-[24px] md:rounded-[32px] w-full max-w-5xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#111]">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">{isIntraSquad ? 'Scrimmage' : 'Box Score'}</h2>
            {(result?.date || game.date) && (
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                {new Date(result?.date || game.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scoreboard */}
        <div className="flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-b from-[#111] to-[#0a0a0a]">
          <div className="flex items-center justify-center gap-2 md:gap-16 w-full">
            <div className="flex flex-col items-center gap-2 md:gap-4 w-1/3">
              <button
                onClick={() => onTeamClick && onTeamClick(awayTeam.id)}
                className="group flex flex-col items-center gap-2 md:gap-4"
              >
                {renderTeamLogo(awayTeam)}
                <div className="text-center">
                  <div className="font-black text-xs md:text-2xl text-white tracking-tight group-hover:text-indigo-400 transition-colors">{awayDisplayName}</div>
                  {awayTeam.id >= 0 && (
                    <div className="text-[11px] font-bold text-slate-500 tracking-widest mt-0.5">
                      {seriesInfo?.awayLabel
                        ?? datedRecords?.awayLabel
                        ?? (typeof result?.awayWins === 'number' && typeof result?.awayLosses === 'number'
                          ? `${result.awayWins}–${result.awayLosses}`
                          : '—')}
                    </div>
                  )}
                </div>
              </button>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 md:gap-8">
                <span className={`text-3xl md:text-6xl font-black font-mono tracking-tighter ${(game.awayScore || 0) > (game.homeScore || 0) ? 'text-white' : 'text-slate-500'}`}>{game.awayScore || 0}</span>
                <span className="text-slate-800 font-black text-xl md:text-3xl">-</span>
                <span className={`text-3xl md:text-6xl font-black font-mono tracking-tighter ${(game.homeScore || 0) > (game.awayScore || 0) ? 'text-white' : 'text-slate-500'}`}>{game.homeScore || 0}</span>
              </div>
              {seriesInfo?.sub && (
                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{seriesInfo.sub}</div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 md:gap-4 w-1/3">
              <button
                onClick={() => onTeamClick && onTeamClick(homeTeam.id)}
                className="group flex flex-col items-center gap-2 md:gap-4"
              >
                {renderTeamLogo(homeTeam)}
                <div className="text-center">
                  <div className="font-black text-xs md:text-2xl text-white tracking-tight group-hover:text-indigo-400 transition-colors">{homeDisplayName}</div>
                  {homeTeam.id >= 0 && (
                    <div className="text-[11px] font-bold text-slate-500 tracking-widest mt-0.5">
                      {seriesInfo?.homeLabel
                        ?? datedRecords?.homeLabel
                        ?? (typeof result?.homeWins === 'number' && typeof result?.homeLosses === 'number'
                          ? `${result.homeWins}–${result.homeLosses}`
                          : '—')}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
          
          <BoxScoreQuarterlyScores
            awayAbbrevLabel={awayAbbrevLabel}
            game={game}
            homeAbbrevLabel={homeAbbrevLabel}
            numQuarters={timingConfig.numQuarters}
            result={result}
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-[#111]">
          <button
            onClick={() => setActiveTab('away')}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'away' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            {awayDisplayName}
          </button>
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'home' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            {homeDisplayName}
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === 'comparison' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            Team Comparison
          </button>
        </div>

        {/* Stats Table */}
        <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
          {result ? (
            activeTab === 'away' ? renderStatsTable(result.awayStats, awayTeam.id) :
            activeTab === 'home' ? renderStatsTable(result.homeStats, homeTeam.id) :
            <BoxScoreTeamComparison
              awayAbbrevLabel={awayAbbrevLabel}
              awayTeamId={awayTeam.id}
              fourPointEnabled={fourPointEnabled}
              homeAbbrevLabel={homeAbbrevLabel}
              homeTeamId={homeTeam.id}
              onTeamClick={onTeamClick}
              result={result}
            />
          ) : (
            <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest">
              Detailed box score not available for this game.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
