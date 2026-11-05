import React, { useMemo } from 'react';
import { Target, Trophy } from 'lucide-react';
import { ChallengeEmptyState } from './AllStarChallengeCards';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';
import { getPlayerImage } from '../../utils/playerImage';
import { getTeamFullName } from '../../utils/teamNames';
import { useGame } from '../../store/GameContext';
import { buildBoxScoreStatsByPlayer } from '../central/view/playerStatsBoxScoreMaps';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { calcSkillsOdds } from '../../utils/allStarOdds';
import type { NBAPlayer } from '../../types';
import { getLeagueEventDisplayName } from '../../services/franchises/franchiseEventNaming';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';

interface SkillsChallengeViewProps {
  allStar: any;
  players: any[];
  teams: any[];
  ownTid?: number | null;
  onRun?: () => void;
  isSimulating?: boolean;
}

export const SkillsChallengeView: React.FC<SkillsChallengeViewProps> = ({ allStar, players, teams, ownTid }) => {
  const { state } = useGame();
  const eventName = getLeagueEventDisplayName(state, 'skills_challenge', 'Skills Challenge');
  const contestants = allStar?.skillsChallengeContestants ?? [];
  const result = allStar?.skillsChallenge;
  const isAnnounced = contestants.length > 0 || !!result;
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const currentYear = Number(state.leagueStats?.year);
  const pbaConferenceIndex = state.leagueStats?.pbaConference === 'commissioners'
    ? 1
    : state.leagueStats?.pbaConference === 'governors'
      ? 2
      : 0;
  const pbaCompetitionId = PBA_COMPETITIONS[pbaConferenceIndex].id;
  const livePbaStats = useMemo(() => isPba
    ? buildBoxScoreStatsByPlayer(state, {
        competitionIds: new Set([pbaCompetitionId]),
        phase: 'regular',
      })
    : null, [isPba, pbaCompetitionId, state.boxScores, state.leagueStats?.year]);
  const contestantPlayers = useMemo(() => contestants.map((contestant: any) =>
    players.find(player => player.internalId === (contestant.internalId || contestant.playerId)) || contestant,
  ), [contestants, players]);

  const skillsStats = (player: any) => {
    const sourceRows = isPba
      ? livePbaStats?.get(String(player.internalId)) ?? []
      : (player.stats ?? []).filter((row: any) => row.season === currentYear && !row.playoffs && (row.gp ?? 0) > 0);
    const rows = sourceRows.filter((row: any) => row.season === currentYear && (row.gp ?? 0) > 0);
    const totals = rows.reduce((sum: any, row: any) => ({
      gp: sum.gp + Number(row.gp ?? 0),
      pts: sum.pts + Number(row.pts ?? 0),
      ast: sum.ast + Number(row.ast ?? 0),
      tov: sum.tov + Number(row.tov ?? 0),
    }), { gp: 0, pts: 0, ast: 0, tov: 0 });
    return {
      ppg: totals.gp > 0 ? (totals.pts / totals.gp).toFixed(1) : '0.0',
      apg: totals.gp > 0 ? (totals.ast / totals.gp).toFixed(1) : '0.0',
      astTo: totals.tov > 0 ? (totals.ast / totals.tov).toFixed(1) : totals.ast > 0 ? totals.ast.toFixed(1) : '—',
    };
  };

  const avatarUrl = (name: string, color: string) => {
    const initials = String(name ?? 'Player').split(' ').map(part => part[0]).join('').slice(0, 2) || 'P';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color.replace('#', '')}&color=fff&size=224&bold=true`;
  };

  if (!isAnnounced) {
    return (
      <ChallengeEmptyState
        title={eventName}
        copy="The competitors will be announced before All-Star Saturday."
        icon={<Target size={32} />}
      />
    );
  }

  if (!result) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-orange-400">Saturday · All-Star Weekend</p>
            <h2 className="text-3xl font-black italic tracking-tighter text-white">{eventName}</h2>
            <p className="mt-2 text-sm text-slate-500">{contestants.length} competitors · skills challenge obstacle course</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {contestantPlayers.map((player: any) => {
            const team = teams.find(t => Number(t.id ?? t.tid) === Number(player?.tid));
            const logo = getResolvedTeamLogoUrl(team, currentYear);
            const isOwn = ownTid != null && player?.tid === ownTid;
            const teamColor = team?.colors?.[0] ?? '#f97316';
            const image = getPlayerImage(player);
            const stats = skillsStats(player);
            const odds = calcSkillsOdds(contestantPlayers as NBAPlayer[], player as NBAPlayer);
            return (
              <div
                key={player.internalId || player.playerId}
                className={`rounded-2xl border p-4 shadow-xl ${isOwn ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-800 bg-[#0d1117]'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-16 w-16 shrink-0">
                    <div className="h-16 w-16 overflow-hidden rounded-full border-2 bg-slate-800" style={{ borderColor: `${teamColor}66` }}>
                      <img
                        src={image ?? avatarUrl(player.name, teamColor)}
                        alt={player.name}
                        className="h-full w-full object-cover object-top"
                        referrerPolicy="no-referrer"
                        onError={event => {
                          event.currentTarget.src = avatarUrl(player.name, teamColor);
                        }}
                      />
                    </div>
                    {logo && (
                      <div className="absolute -bottom-1 -right-1 rounded-full border border-slate-800 bg-slate-950 p-1">
                        <img src={logo} alt="" className="h-5 w-5 object-contain" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white">
                      <PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover>
                    </div>
                    <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {player.pos}{team?.abbrev ? ` · ${team.abbrev}` : ''}
                    </div>
                    <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">To win</div>
                    <div className="font-mono text-xl font-black text-emerald-400">{odds}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
                  {[
                    [stats.ppg, 'PPG'],
                    [stats.apg, 'APG'],
                    [stats.astTo, 'AST/TO'],
                  ].map(([value, label], index) => (
                    <div key={label} className={`px-2 py-2 text-center ${index > 0 ? 'border-l border-slate-800' : ''}`}>
                      <div className="font-mono text-sm font-bold text-slate-200">{value}</div>
                      <div className="mt-0.5 text-[9px] font-black tracking-widest text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
                {team && <div className="mt-3 truncate text-[10px] text-slate-500">{getTeamFullName(team)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const winner = players.find(p => p.internalId === result.winnerId) || players.find(p => p.name === result.winnerName);
  const winnerTeam = teams.find(t => t.id === winner?.tid);
  const winnerImage = winner ? getPlayerImage(winner) : null;
  const winnerLogo = getResolvedTeamLogoUrl(winnerTeam, currentYear);
  const sortedRows = [...(result.contestants ?? [])].sort((a: any, b: any) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    const af = a.finalTime ?? 9999;
    const bf = b.finalTime ?? 9999;
    return af === bf ? a.round1Time - b.round1Time : af - bf;
  });

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-950/70 via-slate-950 to-slate-900 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.18),transparent_60%)]" />
        <div className="relative flex flex-col items-center gap-6 p-8 sm:flex-row">
          <div className="relative shrink-0">
            <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-orange-400 bg-slate-900 shadow-[0_0_40px_rgba(249,115,22,0.35)]">
              {winnerImage ? (
                <img src={winnerImage} alt={result.winnerName} className="h-full w-full object-cover object-top" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><Trophy className="h-12 w-12 text-orange-300" /></div>
              )}
            </div>
            <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-orange-500 px-3 py-0.5 text-[9px] font-black text-slate-950">
              <Trophy size={8} /> CHAMPION
            </div>
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <div className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">
              {eventName} Champion
            </div>
            <h2 className="mb-1 truncate text-4xl font-black italic tracking-tighter text-white">
              {winner ? <PlayerNameWithHover player={winner}>{result.winnerName}</PlayerNameWithHover> : result.winnerName}
            </h2>
            {winnerTeam && (
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                {winnerLogo && <img src={winnerLogo} className="h-5 w-5 object-contain" referrerPolicy="no-referrer" alt="" />}
                <span className="text-sm font-bold uppercase tracking-widest text-slate-400">{winnerTeam.abbrev}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-[1.5fr_1fr_110px_110px] bg-slate-800/50 px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-500">
            <span>Competitor</span>
            <span>Team</span>
            <span className="text-right">Round 1</span>
            <span className="text-right">Finals</span>
          </div>
          <div className="divide-y divide-slate-800">
          {sortedRows.map((row: any) => {
            const player = players.find(p => p.internalId === row.playerId) || players.find(p => p.name === row.playerName);
            const team = teams.find(t => t.id === player?.tid);
            const image = player ? getPlayerImage(player) : null;
            const logo = getResolvedTeamLogoUrl(team, currentYear);
            return (
              <div key={row.playerId} className={`grid grid-cols-[1.5fr_1fr_110px_110px] items-center px-6 py-4 text-sm transition-colors ${row.isWinner ? 'bg-orange-500/10' : ''}`}>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-orange-400/30 bg-slate-800">
                    {image ? <img src={image} className="h-full w-full object-cover object-top" alt={row.playerName} referrerPolicy="no-referrer" /> : <div className="flex h-full w-full items-center justify-center text-xs font-black text-slate-500">{row.playerName?.slice(0, 2)}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-white">
                      {player ? <PlayerNameWithHover player={player}>{row.playerName}</PlayerNameWithHover> : row.playerName}
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{player?.pos ?? ''}</div>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  {logo && <img src={logo} className="h-8 w-10 shrink-0 object-contain" alt={team?.abbrev ?? 'team'} referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold uppercase tracking-widest text-slate-300">{team?.abbrev ?? ''}</div>
                    {team && <div className="truncate text-[10px] text-slate-500">{getTeamFullName(team)}</div>}
                  </div>
                </div>
                <div className="text-right font-mono text-sm text-slate-300">{row.round1Time.toFixed(1)}s</div>
                <div className={`text-right font-mono text-sm font-black ${row.finalTime != null ? 'text-white' : 'text-slate-700'}`}>
                  {row.finalTime != null ? `${row.finalTime.toFixed(1)}s` : 'DNQ'}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
};
