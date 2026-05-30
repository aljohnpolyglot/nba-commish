import React from 'react';
import { Play, Sparkles, Trophy } from 'lucide-react';
import { ChallengeEmptyState } from './AllStarChallengeCards';
import { getPlayerImage } from '../../utils/playerImage';
import { getTeamFullName } from '../../utils/teamNames';

interface ShootingStarsViewProps {
  allStar: any;
  players: any[];
  teams: any[];
  ownTid?: number | null;
  onRun?: () => void;
  isSimulating?: boolean;
}

const accents = [
  { text: 'text-emerald-400', border: 'border-l-emerald-400', borderHex: '#10b981', tint: 'bg-emerald-500/10' },
  { text: 'text-violet-400', border: 'border-l-violet-500', borderHex: '#8b5cf6', tint: 'bg-violet-500/10' },
  { text: 'text-orange-400', border: 'border-l-orange-500', borderHex: '#f97316', tint: 'bg-orange-500/10' },
  { text: 'text-sky-400', border: 'border-l-sky-400', borderHex: '#38bdf8', tint: 'bg-sky-500/10' },
];

const formatSeconds = (value?: number | null) => value == null || Number.isNaN(value) ? '--.-s' : `${value.toFixed(1)}s`;

const collapseRepeatedLocation = (label?: string) => {
  const parts = (label ?? '').trim().split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.floor(parts.length / 2); size += 1) {
    const first = parts.slice(0, size).join(' ').toLowerCase();
    const second = parts.slice(size, size * 2).join(' ').toLowerCase();
    if (first === second) return [...parts.slice(0, size), ...parts.slice(size * 2)].join(' ');
  }
  return parts.join(' ');
};

const contestantId = (contestant: any) => contestant?.internalId ?? contestant?.playerId;

const resolvePlayer = (playerId: string | undefined, players: any[], fallbackName?: string) => {
  const player = players.find(item => item.internalId === playerId) ?? players.find(item => item.name === fallbackName);
  return player ?? (fallbackName ? { internalId: playerId ?? fallbackName, name: fallbackName } : null);
};

const resolveTeam = (teamEntry: any, teams: any[], teamPlayers: any[]) => {
  const id = Number(teamEntry?.teamId);
  if (Number.isFinite(id)) {
    const direct = teams.find(team => team.id === id);
    if (direct) return direct;
  }
  const anchor = teamPlayers.find(player => player?.tid >= 0 && player.tid < 100);
  return anchor ? teams.find(team => team.id === anchor.tid) : null;
};

const teamName = (team: any, fallback?: string) => team ? getTeamFullName(team) : collapseRepeatedLocation(fallback) || 'Team TBD';
const teamLogo = (team: any) => team?.logoUrl ?? team?.imgURL ?? team?.imgURLSmall;

const nameParts = (name?: string) => {
  const parts = (name ?? 'TBD').trim().split(/\s+/);
  return {
    first: parts[0] ?? 'TBD',
    last: parts.slice(1).join(' ') || parts[0] || 'TBD',
  };
};

const MemberCard: React.FC<{ player: any; fallbackName?: string; accent: string }> = ({ player, fallbackName, accent }) => {
  const name = player?.name ?? fallbackName ?? 'TBD';
  const parts = nameParts(name);
  const image = player ? getPlayerImage(player) : undefined;
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0f172a&color=fff&size=160`;

  return (
    <div className="relative h-24 min-w-0 overflow-hidden rounded-lg border bg-slate-950/80 shadow-lg sm:h-28" style={{ borderColor: `${accent}88` }}>
      <img
        src={image ?? fallback}
        alt={name}
        className="h-full w-full object-cover object-top"
        referrerPolicy="no-referrer"
        onError={(event) => { (event.currentTarget as HTMLImageElement).src = fallback; }}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-2 pb-1.5 pt-8 text-center">
        <div className="truncate text-[10px] font-black uppercase leading-none text-white sm:text-xs">{parts.first}</div>
        <div className="truncate text-[10px] font-black uppercase leading-none text-white sm:text-xs">{parts.last}</div>
      </div>
    </div>
  );
};

const sortResultTeams = (result: any) => [...(result?.teams ?? [])].sort((a: any, b: any) => {
  const at = a.finalTime ?? (a.round1Time ?? a.timeSec ?? 9999) + 10000;
  const bt = b.finalTime ?? (b.round1Time ?? b.timeSec ?? 9999) + 10000;
  return at - bt;
});

export const ShootingStarsView: React.FC<ShootingStarsViewProps> = ({ allStar, players, teams, ownTid, onRun, isSimulating }) => {
  const contestants = allStar?.shootingStarsContestants ?? [];
  const result = allStar?.shootingStars;
  const isAnnounced = contestants.length > 0 || !!result;
  const teamGroups = Array.from({ length: Math.floor(contestants.length / 3) }, (_, index) => contestants.slice(index * 3, index * 3 + 3));

  if (!isAnnounced) {
    return (
      <ChallengeEmptyState
        title="Shooting Stars"
        copy="The teams will be announced before All-Star Saturday."
        icon={<Sparkles size={32} />}
      />
    );
  }

  if (!result) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-widest text-cyan-400">Saturday · Shooting Stars</p>
            <h2 className="text-3xl font-black italic tracking-tight text-white sm:text-4xl">Team Field</h2>
            <p className="mt-2 text-sm font-semibold text-slate-400">{contestants.length} participants · teams of three</p>
          </div>
          {onRun && (
            <button
              onClick={onRun}
              disabled={isSimulating}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950 transition hover:bg-cyan-300 disabled:opacity-40"
            >
              <Play size={14} fill="currentColor" /> Watch Live
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {teamGroups.map((group: any[], index) => {
            const groupPlayers = group.map(contestant => resolvePlayer(contestantId(contestant), players, contestant?.name)).filter(Boolean);
            const anchor = groupPlayers.find(player => player?.tid >= 0 && player.tid < 100) ?? groupPlayers[0];
            const team = teams.find(item => item.id === anchor?.tid);
            const accent = accents[index % accents.length];
            const isOwn = ownTid != null && groupPlayers.some(player => player?.tid === ownTid);

            return (
              <div key={`${team?.id ?? index}-${index}`} className={`overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl ${isOwn ? 'ring-1 ring-cyan-400/60' : ''}`}>
                <div className={`flex items-center gap-4 border-l-4 ${accent.border} ${accent.tint} px-4 py-4`}>
                  <div className={`w-10 shrink-0 text-center text-3xl font-black italic ${accent.text}`}>{index + 1}</div>
                  {teamLogo(team) && <img src={teamLogo(team)} alt={team?.abbrev ?? 'team'} className="h-14 w-14 shrink-0 object-contain" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Shooting Stars Team</p>
                    <h3 className="truncate text-xl font-black tracking-tight text-white">{teamName(team, `Team ${index + 1}`)}</h3>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 p-4">
                  {groupPlayers.map((player, playerIndex) => (
                    <MemberCard key={player?.internalId ?? `${index}-${playerIndex}`} player={player} accent={accent.borderHex} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const rankedTeams = sortResultTeams(result);
  const winner = rankedTeams.find((team: any) => team.teamId === result.winnerTeamId) ?? rankedTeams[0];
  const winnerPlayers = (winner?.playerIds?.length ? winner.playerIds : [])
    .map((playerId: string, index: number) => resolvePlayer(playerId, players, winner?.playerNames?.[index]))
    .filter(Boolean);
  const winnerTeam = resolveTeam(winner, teams, winnerPlayers);
  const winnerFinalTime = winner?.finalTime ?? winner?.timeSec;
  const winnerDisplayName = teamName(winnerTeam, winner?.label ?? result.winnerLabel);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#06101f] shadow-2xl">
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 p-4 shadow-[0_0_45px_rgba(16,185,129,0.18)]">
              {teamLogo(winnerTeam) ? (
                <img src={teamLogo(winnerTeam)} alt={winnerDisplayName} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <Trophy className="h-12 w-12 text-cyan-300" />
              )}
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan-300">
                <Trophy size={15} /> Shooting Stars Champion
              </div>
              <h2 className="truncate text-4xl font-black italic tracking-tight text-white sm:text-5xl">{winnerDisplayName}</h2>
              <p className="mt-2 truncate text-lg font-bold text-slate-400 sm:text-xl">{winner?.playerNames?.join(' · ')}</p>
            </div>
          </div>
          <div className="border-t border-cyan-500/20 pt-5 lg:min-w-80 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Final Time (Round 2)</div>
            <div className="mt-2 text-6xl font-black tracking-tight text-white tabular-nums sm:text-7xl">{formatSeconds(winnerFinalTime)}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/80">
        <div className="hidden grid-cols-[70px_350px_1fr_150px_180px] border-b border-slate-800 bg-slate-900/70 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-400 lg:grid">
          <span>#</span>
          <span>Team</span>
          <span>Members</span>
          <span className="text-right">Round 1</span>
          <span className="text-right">Final (Round 2)</span>
        </div>
        <div className="divide-y divide-slate-800">
          {rankedTeams.map((entry: any, index: number) => {
            const accent = accents[index % accents.length];
            const entryPlayers = (entry.playerIds?.length ? entry.playerIds : entry.playerNames ?? [])
              .map((value: string, playerIndex: number) => resolvePlayer(entry.playerIds?.[playerIndex] ?? value, players, entry.playerNames?.[playerIndex] ?? value))
              .filter(Boolean);
            const entryTeam = resolveTeam(entry, teams, entryPlayers);
            const isWinner = entry.teamId === result.winnerTeamId;
            const displayName = teamName(entryTeam, entry.label);

            return (
              <div key={entry.teamId ?? `${displayName}-${index}`} className={`grid gap-4 border-l-4 ${accent.border} px-4 py-5 lg:grid-cols-[70px_350px_1fr_150px_180px] lg:items-center ${isWinner ? 'bg-cyan-500/10' : 'bg-slate-950/40'}`}>
                <div className={`text-4xl font-black italic ${accent.text}`}>{index + 1}</div>
                <div className="flex min-w-0 items-center gap-4">
                  {teamLogo(entryTeam) && <img src={teamLogo(entryTeam)} alt={displayName} className="h-16 w-20 shrink-0 object-contain" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 lg:hidden">Team</p>
                    <h3 className="text-2xl font-black leading-tight tracking-tight text-white">{displayName}</h3>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {entryPlayers.map((player, playerIndex) => (
                    <MemberCard key={player?.internalId ?? `${entry.teamId}-${playerIndex}`} player={player} fallbackName={entry.playerNames?.[playerIndex]} accent={accent.borderHex} />
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-3 lg:block lg:border-t-0 lg:pt-0 lg:text-right">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500 lg:hidden">Round 1</span>
                  <span className="text-2xl font-black text-slate-300 tabular-nums">{formatSeconds(entry.round1Time ?? entry.timeSec)}</span>
                </div>
                <div className="flex items-center justify-between lg:block lg:text-right">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500 lg:hidden">Final</span>
                  {entry.finalTime != null ? (
                    <span className={`text-3xl font-black tabular-nums ${isWinner ? 'text-emerald-400' : 'text-white'}`}>{formatSeconds(entry.finalTime)}</span>
                  ) : (
                    <span className="inline-flex rounded-full border border-rose-500/70 bg-rose-500/10 px-5 py-2 text-xl font-black text-rose-300">DNF</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
