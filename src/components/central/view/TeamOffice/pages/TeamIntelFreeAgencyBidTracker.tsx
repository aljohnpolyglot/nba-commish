import React from 'react';
import { cn } from '../../../../../lib/utils';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import type { NBATeam } from '../../../../../types';
import type { ResolvedTeam, TrackedMarketRow } from './TeamIntelFreeAgencyShared';
import { getK2Ovr, getLastTeamTid, getResolvedTeamLogoUrl } from './TeamIntelFreeAgencyShared';

export function TeamIntelFreeAgencyBidTracker({
  euroIsolated,
  isOwnTeam,
  team,
  teamId,
  teams,
  trackedMarkets,
  shortlistSize,
  fmtUSD,
  onOpenPlayer,
}: {
  euroIsolated: boolean;
  isOwnTeam: boolean;
  team: ResolvedTeam | null;
  teamId: number;
  teams: NBATeam[];
  trackedMarkets: TrackedMarketRow[];
  shortlistSize: number;
  fmtUSD: (value: number) => string;
  onOpenPlayer: (playerId: TrackedMarketRow['player']) => void;
}) {
  if (euroIsolated) return null;

  return (
    <div className="flex-1 flex flex-col rounded-lg border border-[#30363d] bg-black/40 overflow-hidden min-w-0">
      <div className="p-3 border-b border-[#30363d] flex items-center justify-between">
        <h3 className="font-bold uppercase tracking-wider text-sm">
          {isOwnTeam ? 'Live Bid Tracker' : `${team?.name ?? 'Team'} — Active Bids`}
        </h3>
        <span className="text-xs text-slate-400">{trackedMarkets.length} active market{trackedMarkets.length === 1 ? '' : 's'}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {trackedMarkets.length === 0 ? (
          <div className="text-center text-xs text-slate-500 py-8">
            {!isOwnTeam
              ? `The ${team?.name ?? 'team'} has no active bids on free agents right now.`
              : shortlistSize === 0
                ? 'Shortlist a FA to track their market here. Active markets where you\'ve bid will also appear.'
                : 'No live markets for shortlisted players. Markets open mid-FA-window — check back tomorrow.'}
          </div>
        ) : (
          trackedMarkets.map(({ market, player, top, userBid, decisionLabel }) => {
            if (!player || !top) return null;
            const k2 = getK2Ovr(player);
            const teamHasBid = !!userBid;
            const teamLeading = teamHasBid && top.teamId === teamId;
            const teamOutbid = teamHasBid && top.teamId !== teamId;
            const topTeam = teams.find(entry => entry.id === top.teamId);
            const teamShort = team?.abbrev ?? team?.name ?? 'Team';
            const teamLogoUrl = getResolvedTeamLogoUrl(team);
            const statusLabel = isOwnTeam ? (teamLeading ? 'You lead' : teamOutbid ? 'Outbid' : 'No bid') : teamLeading ? 'Leading' : teamOutbid ? 'Outbid' : 'Not bidding';
            const teamBidLabel = isOwnTeam ? 'Your bid' : `${teamShort} bid`;
            const priorTid = getLastTeamTid(player);
            const priorTeam = priorTid >= 0 ? teams.find(entry => entry.id === priorTid) : null;

            return (
              <div
                key={market.playerId}
                onClick={() => onOpenPlayer(player)}
                className={cn(
                  'rounded border p-3 cursor-pointer transition-colors',
                  teamLeading ? 'border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20' : teamOutbid ? 'border-rose-500/60 bg-rose-500/10 hover:bg-rose-500/20' : 'border-slate-700 bg-white/5 hover:bg-white/10',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <PlayerPortrait playerName={player.name} imgUrl={player.imgURL} face={(player as any).face} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                      {priorTeam?.logoUrl ? (
                        <img
                          src={priorTeam.logoUrl}
                          alt={priorTeam.abbrev ?? priorTeam.name}
                          referrerPolicy="no-referrer"
                          className="w-4 h-4 object-contain shrink-0 opacity-80"
                          title={`Last with ${priorTeam.name}`}
                        />
                      ) : null}
                      <PlayerNameWithHover player={player} className="truncate">
                        {player.name}
                      </PlayerNameWithHover>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {player.pos} · K2 {k2} · {decisionLabel === 'Resolves today' ? <span className="text-rose-300 font-bold">Resolves today</span> : decisionLabel}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded',
                      teamLeading ? 'bg-amber-500/30 text-amber-200' : teamOutbid ? 'bg-rose-500/30 text-rose-200' : 'bg-slate-700/50 text-slate-300',
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-500 uppercase tracking-wider text-[9px]">Top bid</div>
                    <div className="font-bold tabular-nums">{fmtUSD(top.salaryUSD)}/yr · {top.years}yr</div>
                    <div className="text-slate-400 text-[10px] flex items-center gap-1.5 mt-0.5">
                      {topTeam?.logoUrl && (
                        <img src={topTeam.logoUrl} alt={topTeam.abbrev ?? topTeam.name} referrerPolicy="no-referrer" className="w-3.5 h-3.5 object-contain shrink-0" />
                      )}
                      <span>{topTeam?.abbrev ?? topTeam?.name ?? '—'}</span>
                    </div>
                  </div>
                  {userBid && (
                    <div>
                      <div className="text-slate-500 uppercase tracking-wider text-[9px]">{teamBidLabel}</div>
                      <div className="font-bold tabular-nums">{fmtUSD(userBid.salaryUSD)}/yr · {userBid.years}yr</div>
                      <div className="text-slate-400 text-[10px] flex items-center gap-1.5 mt-0.5">
                        {teamLogoUrl && (
                          <img src={teamLogoUrl} alt={team.abbrev ?? team.name} referrerPolicy="no-referrer" className="w-3.5 h-3.5 object-contain shrink-0" />
                        )}
                        <span>{userBid.option === 'PLAYER' ? 'Player option' : userBid.option === 'TEAM' ? 'Team option' : '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
