import React from 'react';
import { cn } from '../../../../../lib/utils';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import type { GameState } from '../../../../../types';
import type { ResolvedTeam, TrackedMarketRow } from './TeamIntelFreeAgencyShared';
import { getLastTeamTid, getResolvedTeamLogoUrl } from './TeamIntelFreeAgencyShared';

export function TeamIntelFreeAgencyBidTracker({
  euroIsolated,
  isOwnTeam,
  team,
  teams,
  state,
  currentYear,
  trackedMarkets,
  fmtUSD,
  onOpenPlayer,
}: {
  euroIsolated: boolean;
  isOwnTeam: boolean;
  team: ResolvedTeam | null;
  teams: ResolvedTeam[];
  state: GameState;
  currentYear: number;
  trackedMarkets: TrackedMarketRow[];
  fmtUSD: (value: number) => string;
  onOpenPlayer: (playerId: TrackedMarketRow['player']) => void;
}) {
  if (euroIsolated || !isOwnTeam) return null;

  return (
    <div className="flex-1 flex flex-col rounded-lg border border-[#30363d] bg-black/40 overflow-hidden min-w-0">
      <div className="p-3 border-b border-[#30363d] flex items-center justify-between">
        <h3 className="font-bold uppercase tracking-wider text-sm">Your Free Agency Board</h3>
        <span className="text-xs text-slate-400">{trackedMarkets.length} player{trackedMarkets.length === 1 ? '' : 's'}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {trackedMarkets.length === 0 ? (
          <div className="text-center text-xs text-slate-500 py-8">
            Submit an offer to track the player and decision here.
          </div>
        ) : (
          trackedMarkets.map(({ market, player, userBid }) => {
            if (!player) return null;
            const teamLogoUrl = getResolvedTeamLogoUrl(team);
            const priorTid = state.leagueStats?.uiMode === 'pba_isolated'
              ? Number((player as any).pbaPreviousTid ?? -1)
              : getLastTeamTid(player);
            const priorTeam = priorTid >= 0
              ? teams.find(entry => Number((entry as any).id ?? (entry as any).tid) === priorTid)
              : null;
            const priorTeamLogoUrl = getResolvedTeamLogoUrl(priorTeam);

            return (
              <div
                key={market.playerId}
                onClick={() => onOpenPlayer(player)}
                className={cn(
                  'rounded border p-3 cursor-pointer transition-colors',
                  userBid
                    ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
                    : 'border-slate-700 bg-white/5 hover:bg-white/10',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <PlayerPortrait playerName={player.name} imgUrl={player.imgURL} face={(player as any).face} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                      {priorTeamLogoUrl ? (
                        <img
                          src={priorTeamLogoUrl}
                          alt={priorTeam?.abbrev ?? priorTeam?.name}
                          referrerPolicy="no-referrer"
                          className="w-4 h-4 object-contain shrink-0 opacity-80"
                          title={`Last with ${priorTeam?.name ?? 'team'}`}
                        />
                      ) : null}
                      <PlayerNameWithHover player={player} className="truncate">
                        {player.name}
                      </PlayerNameWithHover>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {player.pos} · {userBid ? 'Awaiting decision' : 'Watching market'}
                    </div>
                  </div>
                  <span className="rounded bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200">Offer submitted</span>
                </div>
                {userBid ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-slate-500 uppercase tracking-wider text-[9px]">Your offer</div>
                      <div className="font-bold tabular-nums">{fmtUSD(userBid.salaryUSD)}/yr · {userBid.years}yr</div>
                      <div className="text-slate-400 text-[10px] flex items-center gap-1.5 mt-0.5">
                        {teamLogoUrl && (
                          <img src={teamLogoUrl} alt={team?.abbrev ?? team?.name} referrerPolicy="no-referrer" className="w-3.5 h-3.5 object-contain shrink-0" />
                        )}
                        <span>{userBid.option === 'PLAYER' ? 'Player option' : userBid.option === 'TEAM' ? 'Team option' : '—'}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 uppercase tracking-wider text-[9px]">Status</div>
                      <div className="font-bold text-slate-300">Awaiting player decision</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">Open the player to review the market and make an offer.</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
