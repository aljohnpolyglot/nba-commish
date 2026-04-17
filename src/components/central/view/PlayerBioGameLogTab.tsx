import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { NBAPlayer, Game } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { getOpeningNightDate } from '../../../utils/dateUtils';
import { BoxScoreModal } from '../../modals/BoxScoreModal';

interface PlayerBioGameLogTabProps {
  player: NBAPlayer;
  onGameClick?: (game: Game) => void;
  onTeamClick?: (teamId: number) => void;
}

export const PlayerBioGameLogTab: React.FC<PlayerBioGameLogTabProps> = ({
  player, onGameClick, onTeamClick,
}) => {
  const { state } = useGame();
  const [gameLogSort, setGameLogSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'date', dir: 'desc' });
  const [gameLogSeason, setGameLogSeason] = useState<number | null>(null);
  const [localBoxScoreGame, setLocalBoxScoreGame] = useState<Game | null>(null);

  const OPENING_NIGHT_MS = getOpeningNightDate(state.leagueStats.year).getTime();

  const gameLog = useMemo(() => {
    const logs: any[] = [];

    const firstGameForTeam = new Map<number, number>();
    state.boxScores.forEach(game => {
      const isHome = game.homeStats.some((p: any) => p.playerId === player.internalId);
      const isAway = game.awayStats.some((p: any) => p.playerId === player.internalId);
      if (isHome || isAway) {
        const tid = isHome ? game.homeTeamId : game.awayTeamId;
        const ms = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
        if (ms > 0 && (!firstGameForTeam.has(tid) || ms < firstGameForTeam.get(tid)!)) {
          firstGameForTeam.set(tid, ms);
        }
      }
    });

    state.boxScores.forEach(game => {
      const isHome = game.homeStats.some((p: any) => p.playerId === player.internalId);
      const isAway = game.awayStats.some((p: any) => p.playerId === player.internalId);

      if (isHome || isAway) {
        const stats = isHome
          ? game.homeStats.find((p: any) => p.playerId === player.internalId)
          : game.awayStats.find((p: any) => p.playerId === player.internalId);

        if (stats) {
          const teamId = isHome ? game.homeTeamId : game.awayTeamId;
          const oppId  = isHome ? game.awayTeamId : game.homeTeamId;
          const team   = state.teams.find(t => t.id === teamId);
          const opp    = state.teams.find(t => t.id === oppId);
          const schedGame = state.schedule.find((g: any) => g.gid === game.gameId);
          const gameTimeMs = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
          const isPreseason = gameTimeMs > 0 && gameTimeMs < OPENING_NIGHT_MS &&
            (schedGame?.isPreseason === true || !schedGame);
          const isAllStarGame = !!(schedGame?.isAllStar);
          const isWin = isHome ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
          const resultStr = `${isWin ? 'W' : 'L'}, ${isHome ? game.homeScore : game.awayScore}-${isHome ? game.awayScore : game.homeScore}`;

          const fgm = stats.fgm || 0; const fga = stats.fga || 0;
          const tpm = stats.threePm || 0; const tpa = stats.threePa || 0;
          const ftm = stats.ftm || 0;  const fta = stats.fta || 0;
          const twom = fgm - tpm; const twoa = fga - tpa;
          const fgp  = fga  > 0 ? (fgm  / fga ).toFixed(3).replace(/^0+/, '') : '.000';
          const tpp  = tpa  > 0 ? (tpm  / tpa ).toFixed(3).replace(/^0+/, '') : '.000';
          const twop = twoa > 0 ? (twom / twoa).toFixed(3).replace(/^0+/, '') : '.000';
          const efgp = fga  > 0 ? ((fgm + 0.5 * tpm) / fga).toFixed(3).replace(/^0+/, '') : '.000';
          const ftp  = fta  > 0 ? (ftm  / fta ).toFixed(3).replace(/^0+/, '') : '.000';

          logs.push({
            date: game.date, isPreseason, isAllStar: isAllStarGame, isDNP: false,
            gameId: game.gameId, teamId, oppTeamId: oppId,
            teamAbbrev: isAllStarGame ? 'ASG' : (team?.abbrev || 'UNK'),
            isAway: !isHome,
            oppAbbrev: isAllStarGame ? 'ASG' : (opp?.abbrev || 'UNK'),
            result: game.isOT
              ? `${resultStr}${game.otCount && game.otCount > 1 ? ` ${game.otCount}OT` : ' OT'}`
              : resultStr,
            isWin, gs: stats.gs > 0,
            mp: Math.floor(stats.min) + ':' + String(Math.floor((stats.min % 1) * 60)).padStart(2, '0'),
            fgm, fga, fgp, tpm, tpa, tpp, twom, twoa, twop, efgp, ftm, fta, ftp,
            orb: stats.orb || 0, drb: stats.drb || 0, trb: stats.reb || 0,
            ast: stats.ast || 0, stl: stats.stl || 0, blk: stats.blk || 0,
            tov: stats.tov || 0, pf: stats.pf || 0, pts: stats.pts || 0,
            gmsc: (stats.gameScore || 0).toFixed(1),
            plusMinus: stats.pm != null ? stats.pm : null,
          });
        }
      } else if (game.homeTeamId === player.tid || game.awayTeamId === player.tid) {
        const isHomeTeam = game.homeTeamId === player.tid;
        const gameMsDNP = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
        const joinMs = firstGameForTeam.get(player.tid) ?? 0;
        if (gameMsDNP > 0 && joinMs > 0 && gameMsDNP < joinMs) return;
        const oppId = isHomeTeam ? game.awayTeamId : game.homeTeamId;
        const team  = state.teams.find(t => t.id === player.tid);
        const opp   = state.teams.find(t => t.id === oppId);
        const schedGame = state.schedule.find((g: any) => g.gid === game.gameId);
        const gameMs2 = (() => { try { return new Date(game.date).getTime(); } catch { return 0; } })();
        const isPreseason = gameMs2 > 0 && gameMs2 < OPENING_NIGHT_MS &&
          (schedGame?.isPreseason === true || !schedGame);
        const isWin = isHomeTeam ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
        const score = isHomeTeam ? `${game.homeScore}-${game.awayScore}` : `${game.awayScore}-${game.homeScore}`;
        logs.push({
          date: game.date, isPreseason, isDNP: true, gameId: game.gameId,
          teamId: player.tid, oppTeamId: oppId,
          dnpReason: game.playerDNPs?.[player.internalId] ??
            ((player.injury?.gamesRemaining ?? 0) > 0
              ? `DNP — Injury (${player.injury!.type})`
              : "DNP — Coach's Decision"),
          teamAbbrev: team?.abbrev || 'UNK', isAway: !isHomeTeam,
          oppAbbrev: opp?.abbrev || 'UNK',
          result: game.isOT
            ? `${isWin ? 'W' : 'L'}, ${score}${game.otCount && game.otCount > 1 ? ` ${game.otCount}OT` : ' OT'}`
            : `${isWin ? 'W' : 'L'}, ${score}`,
          isWin, gs: false, mp: '—', fgm: 0, fga: 0, fgp: '—', tpm: 0, tpa: 0, tpp: '—',
          twom: 0, twoa: 0, twop: '—', efgp: '—', ftm: 0, fta: 0, ftp: '—',
          orb: 0, drb: 0, trb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0,
          gmsc: '—', plusMinus: null,
        });
      }
    });

    const reversed = logs.reverse();
    const rsTotal = reversed.filter(l => !l.isPreseason && !l.isDNP).length;
    let rsRank = rsTotal;
    return reversed.map(l => ({ ...l, rank: l.isPreseason || l.isDNP ? null : rsRank-- }));
  }, [state.boxScores, state.schedule, player.internalId, player.tid, player.injury, state.teams, OPENING_NIGHT_MS]);

  const gameLogSeasons = useMemo(() => {
    const years = new Set<number>();
    gameLog.forEach(l => {
      const d = new Date(l.date);
      if (!isNaN(d.getTime())) {
        const yr = d.getFullYear();
        years.add(d.getMonth() < 9 ? yr : yr + 1);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [gameLog]);

  const effectiveGameLogSeason = gameLogSeason ?? gameLogSeasons[0] ?? state.leagueStats.year;

  const sortedGameLog = useMemo(() => {
    const filtered = gameLog.filter(l => {
      const d = new Date(l.date);
      if (isNaN(d.getTime())) return true;
      const yr = d.getFullYear();
      const seasonYear = d.getMonth() < 9 ? yr : yr + 1;
      return seasonYear === effectiveGameLogSeason;
    });
    return [...filtered].sort((a, b) => {
      const dir = gameLogSort.dir === 'asc' ? 1 : -1;
      if (gameLogSort.field === 'date') return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
      const getVal = (l: any): number => {
        const numericFields = ['pts','trb','ast','stl','blk','tov','pf','orb','drb','fgm','fga','tpm','tpa','twom','twoa','ftm','fta','min'];
        if (numericFields.includes(gameLogSort.field)) return l[gameLogSort.field] ?? 0;
        return parseFloat('0' + l[gameLogSort.field]) || 0;
      };
      return (getVal(a) - getVal(b)) * dir;
    });
  }, [gameLog, effectiveGameLogSeason, gameLogSort]);

  const sortHdr = (field: string, label: string) => (
    <th
      className={`px-3 py-2 font-semibold text-right cursor-pointer hover:text-white select-none${gameLogSort.field === field ? ' text-indigo-400' : ''}`}
      onClick={() => setGameLogSort(s => ({ field, dir: s.field === field && s.dir === 'desc' ? 'asc' : 'desc' }))}
    >
      {label}{gameLogSort.field === field ? (gameLogSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  const resolveTeam = (tid: number) => {
    const nba = state.teams.find((t: any) => t.id === tid);
    if (nba) return nba;
    const nonNBA = (state.nonNBATeams ?? []).find((t: any) => t.tid === tid);
    if (nonNBA) return { id: tid, name: nonNBA.name ?? nonNBA.league ?? 'International', abbrev: (nonNBA.name ?? 'INT').slice(0, 3).toUpperCase(), logoUrl: '', conference: 'East' } as any;
    return null;
  };

  return (
    <div className="p-4 md:p-8 bg-[#080808] flex flex-col" style={{ minHeight: 0 }}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-lg font-bold text-white uppercase tracking-wider">
          {effectiveGameLogSeason - 1}-{String(effectiveGameLogSeason).slice(2)} Game Log
          {sortedGameLog.filter(g => !g.isPreseason && !g.isDNP).length > 0 && (
            <span className="ml-3 text-xs font-normal text-slate-400 normal-case tracking-normal">
              {sortedGameLog.filter(g => !g.isPreseason && !g.isDNP).length} regular season games
            </span>
          )}
        </h3>
        {gameLogSeasons.length > 1 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-0.5 shrink-0">
            <button
              onClick={() => { const idx = gameLogSeasons.indexOf(effectiveGameLogSeason); if (idx < gameLogSeasons.length - 1) setGameLogSeason(gameLogSeasons[idx + 1]); }}
              disabled={gameLogSeasons.indexOf(effectiveGameLogSeason) >= gameLogSeasons.length - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-black text-white px-2 min-w-[56px] text-center">
              {effectiveGameLogSeason - 1}-{String(effectiveGameLogSeason).slice(2)}
            </span>
            <button
              onClick={() => { const idx = gameLogSeasons.indexOf(effectiveGameLogSeason); if (idx > 0) setGameLogSeason(gameLogSeasons[idx - 1]); }}
              disabled={gameLogSeasons.indexOf(effectiveGameLogSeason) <= 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[60vh] md:max-h-[70vh] custom-scrollbar">
        <table className="min-w-max text-sm text-left text-slate-300">
          <thead className="text-[10px] text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800 whitespace-nowrap">
            <tr>
              <th className="px-3 py-2 font-semibold">Rk</th>
              <th
                className={`px-3 py-2 font-semibold cursor-pointer hover:text-white select-none${gameLogSort.field === 'date' ? ' text-indigo-400' : ''}`}
                onClick={() => setGameLogSort(s => ({ field: 'date', dir: s.field === 'date' && s.dir === 'desc' ? 'asc' : 'desc' }))}
              >
                Date{gameLogSort.field === 'date' ? (gameLogSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
              <th className="px-3 py-2 font-semibold">Team</th>
              <th className="px-3 py-2 font-semibold"></th>
              <th className="px-3 py-2 font-semibold">Opp</th>
              <th className="px-3 py-2 font-semibold">Result</th>
              <th className="px-3 py-2 font-semibold">GS</th>
              {sortHdr('min', 'MP')}
              {(['fgm','fga','fgp','tpm','tpa','tpp','twom','twoa','twop','efgp','ftm','fta','ftp','orb','drb','trb','ast','stl','blk','tov','pf','pts','gmsc'] as const).map(f => {
                const label: Record<string, string> = { fgm:'FG',fga:'FGA',fgp:'FG%',tpm:'3P',tpa:'3PA',tpp:'3P%',twom:'2P',twoa:'2PA',twop:'2P%',efgp:'eFG%',ftm:'FT',fta:'FTA',ftp:'FT%',orb:'ORB',drb:'DRB',trb:'TRB',ast:'AST',stl:'STL',blk:'BLK',tov:'TOV',pf:'PF',pts:'PTS',gmsc:'GmSc' };
                return (
                  <th key={f} className={`px-3 py-2 font-semibold text-right cursor-pointer hover:text-white select-none${gameLogSort.field === f ? ' text-indigo-400' : ''}`}
                    onClick={() => setGameLogSort(s => ({ field: f, dir: s.field === f && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                    {label[f]}{gameLogSort.field === f ? (gameLogSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </th>
                );
              })}
              <th className="px-3 py-2 font-semibold text-right">+/-</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sortedGameLog.map((log, i) => {
              const showPreseasonDivider = gameLogSort.field === 'date' && log.isPreseason && (i === 0 || !sortedGameLog[i - 1].isPreseason);
              return (
                <React.Fragment key={i}>
                  {showPreseasonDivider && (
                    <tr>
                      <td colSpan={32} className="px-3 py-2 bg-slate-900/80 border-y border-slate-700">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Preseason</span>
                      </td>
                    </tr>
                  )}
                  {log.isDNP ? (
                    <tr className="hover:bg-slate-800/50 transition-colors whitespace-nowrap text-xs opacity-50">
                      <td className="px-3 py-2"><span className="text-[10px] font-bold text-slate-500">DNP</span></td>
                      <td className="px-3 py-2">{log.date}</td>
                      <td className={`px-3 py-2${onTeamClick && log.teamId ? ' cursor-pointer hover:text-indigo-400' : ''}`} onClick={() => onTeamClick && log.teamId && onTeamClick(log.teamId)}>{log.teamAbbrev}</td>
                      <td className="px-3 py-2">{log.isAway ? '@' : ''}</td>
                      <td className={`px-3 py-2${onTeamClick && log.oppTeamId ? ' cursor-pointer hover:text-indigo-400' : ''}`} onClick={() => onTeamClick && log.oppTeamId && onTeamClick(log.oppTeamId)}>{log.oppAbbrev}</td>
                      <td className={`px-3 py-2 ${log.isWin ? 'text-emerald-400' : 'text-red-400'}`}>{log.result}</td>
                      <td colSpan={26} className="px-3 py-2 text-slate-500 italic">{log.dnpReason}</td>
                    </tr>
                  ) : (
                    <tr className={`hover:bg-slate-800/50 transition-colors whitespace-nowrap text-xs ${log.isPreseason ? 'opacity-70' : ''}`}>
                      <td className="px-3 py-2">
                        {log.isAllStar ? <span title="All-Star Game">⭐</span>
                          : log.rank !== null ? log.rank
                          : <span className="text-[10px] font-bold text-amber-500/70">PRE</span>}
                      </td>
                      <td className="px-3 py-2">{log.date}</td>
                      <td className={`px-3 py-2${onTeamClick && log.teamId ? ' cursor-pointer hover:text-indigo-400' : ''}`} onClick={() => onTeamClick && log.teamId && onTeamClick(log.teamId)}>{log.teamAbbrev}</td>
                      <td className="px-3 py-2">{log.isAway ? '@' : ''}</td>
                      <td className={`px-3 py-2${onTeamClick && log.oppTeamId ? ' cursor-pointer hover:text-indigo-400' : ''}`} onClick={() => onTeamClick && log.oppTeamId && onTeamClick(log.oppTeamId)}>{log.oppAbbrev}</td>
                      <td
                        className={`px-3 py-2 ${log.isWin ? 'text-emerald-400' : 'text-red-400'}${log.gameId ? ' cursor-pointer hover:underline' : ''}`}
                        onClick={() => { if (log.gameId) { const sg = state.schedule.find((g: any) => g.gid === log.gameId); if (sg) { if (onGameClick) onGameClick(sg); else setLocalBoxScoreGame(sg); } } }}
                      >{log.result}</td>
                      <td className="px-3 py-2">{log.gs ? '*' : ''}</td>
                      <td className="px-3 py-2 text-right">{log.mp}</td>
                      <td className="px-3 py-2 text-right">{log.fgm}</td>
                      <td className="px-3 py-2 text-right">{log.fga}</td>
                      <td className="px-3 py-2 text-right">{log.fgp}</td>
                      <td className="px-3 py-2 text-right">{log.tpm}</td>
                      <td className="px-3 py-2 text-right">{log.tpa}</td>
                      <td className="px-3 py-2 text-right">{log.tpp}</td>
                      <td className="px-3 py-2 text-right">{log.twom}</td>
                      <td className="px-3 py-2 text-right">{log.twoa}</td>
                      <td className="px-3 py-2 text-right">{log.twop}</td>
                      <td className="px-3 py-2 text-right">{log.efgp}</td>
                      <td className="px-3 py-2 text-right">{log.ftm}</td>
                      <td className="px-3 py-2 text-right">{log.fta}</td>
                      <td className="px-3 py-2 text-right">{log.ftp}</td>
                      <td className="px-3 py-2 text-right">{log.orb}</td>
                      <td className="px-3 py-2 text-right">{log.drb}</td>
                      <td className="px-3 py-2 text-right">{log.trb}</td>
                      <td className="px-3 py-2 text-right">{log.ast}</td>
                      <td className="px-3 py-2 text-right">{log.stl}</td>
                      <td className="px-3 py-2 text-right">{log.blk}</td>
                      <td className="px-3 py-2 text-right">{log.tov}</td>
                      <td className="px-3 py-2 text-right">{log.pf}</td>
                      <td className="px-3 py-2 text-right font-bold text-white">{log.pts}</td>
                      <td
                        className={`px-3 py-2 text-right${log.gameId ? ' cursor-pointer hover:underline' : ''}`}
                        onClick={() => { if (log.gameId) { const sg = state.schedule.find((g: any) => g.gid === log.gameId); if (sg) { if (onGameClick) onGameClick(sg); else setLocalBoxScoreGame(sg); } } }}
                      >{log.gmsc}</td>
                      <td className={`px-3 py-2 text-right ${log.plusMinus != null && log.plusMinus > 0 ? 'text-emerald-400' : log.plusMinus != null && log.plusMinus < 0 ? 'text-red-400' : ''}`}>
                        {log.plusMinus != null ? (log.plusMinus > 0 ? `+${log.plusMinus}` : log.plusMinus) : '—'}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {sortedGameLog.length === 0 && (
              <tr>
                <td colSpan={32} className="px-3 py-8 text-center text-slate-500">No game log available for this season.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {localBoxScoreGame && (() => {
        const bsResult = state.boxScores.find((b: any) => b.gameId === localBoxScoreGame.gid);
        const homeTeam = resolveTeam(localBoxScoreGame.homeTid);
        const awayTeam = resolveTeam(localBoxScoreGame.awayTid);
        if (!homeTeam || !awayTeam) return null;
        return (
          <BoxScoreModal
            game={localBoxScoreGame}
            result={bsResult}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            players={state.players}
            onClose={() => setLocalBoxScoreGame(null)}
            onPlayerClick={() => setLocalBoxScoreGame(null)}
          />
        );
      })()}
    </div>
  );
};
