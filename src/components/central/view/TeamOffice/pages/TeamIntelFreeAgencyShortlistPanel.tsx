import React from 'react';
import { cn } from '../../../../../lib/utils';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import { computeContractOffer } from '../../../../../utils/salaryUtils';
import { getDisplayAge } from '../../../../../store/playerRatingStore';
import type { NBAPlayer } from '../../../../../types';
import type { FreeAgencyMarket, ResolvedTeam } from './TeamIntelFreeAgencyShared';
import { getK2Ovr } from './TeamIntelFreeAgencyShared';

export function TeamIntelFreeAgencyShortlistPanel({
  isOffseasonView,
  isOwnTeam,
  euroIsolated,
  shortlistedPlayers,
  shortlistSize,
  shortlistCap,
  team,
  currentYear,
  leagueStats,
  allMarkets,
  teamId,
  fmtMoney,
  onEdit,
  onToggleShortlist,
  onSubmitAutoBidsAll,
  onSubmitAutoBid,
  onOpenPlayer,
}: {
  isOffseasonView: boolean;
  isOwnTeam: boolean;
  euroIsolated: boolean;
  shortlistedPlayers: NBAPlayer[];
  shortlistSize: number;
  shortlistCap: number;
  team: ResolvedTeam | null;
  currentYear: number;
  leagueStats: unknown;
  allMarkets: FreeAgencyMarket[];
  teamId: number;
  fmtMoney: (value: number) => string;
  onEdit: () => void;
  onToggleShortlist: (id: string) => void;
  onSubmitAutoBidsAll: () => void;
  onSubmitAutoBid: (player: NBAPlayer) => void;
  onOpenPlayer: (player: NBAPlayer) => void;
}) {
  if (!isOffseasonView) return null;

  return (
    <div className="lg:w-[360px] flex flex-col rounded-lg border border-[#30363d] bg-black/40 overflow-hidden shrink-0">
      <div className="p-3 border-b border-[#30363d] flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold uppercase tracking-wider text-sm">My Shortlist</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{shortlistSize}/{shortlistCap}</span>
          {isOwnTeam && shortlistedPlayers.length > 0 && !euroIsolated && (
            <button
              onClick={onSubmitAutoBidsAll}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase text-[10px] rounded"
              title="Submit competitive bids on every shortlisted FA via the bid market"
            >
              Auto-bid All
            </button>
          )}
          {isOwnTeam && (
            <button onClick={onEdit} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-[10px] rounded">
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {shortlistedPlayers.length === 0 ? (
          <div className="text-center text-xs text-slate-500 py-8">
            {isOwnTeam
              ? 'Star FAs you\'re scouting. Click Edit to add up to 15.'
              : `The ${team?.name ?? 'team'} front office has no public scouting board. Use the Top Free Agents drawer below to see who's available.`}
          </div>
        ) : (
          shortlistedPlayers
            .map(player => ({ player, k2: getK2Ovr(player), offer: computeContractOffer(player, leagueStats as any) }))
            .sort((a, b) => b.k2 - a.k2)
            .map(({ player, k2, offer }) => {
              const traits: string[] = (player as any).moodTraits ?? [];
              const traitBadge = traits.find(trait => ['LOYAL', 'MERCENARY', 'COMPETITOR'].includes(trait));
              const age = getDisplayAge(player, currentYear);
              const market = allMarkets.find(entry => entry.playerId === player.internalId && !entry.resolved);
              const hasUserBid = !!market?.bids.some(bid => bid.teamId === teamId && bid.status === 'active');

              return (
                <div
                  key={player.internalId}
                  onClick={() => onOpenPlayer(player)}
                  className="flex items-center gap-2 px-2 py-2 bg-white/5 hover:bg-white/10 rounded cursor-pointer"
                >
                  <PlayerPortrait playerName={player.name} imgUrl={player.imgURL} face={(player as any).face} size={32} />
                  <div className="flex-1 min-w-0">
                    <PlayerNameWithHover player={player} className="text-xs font-semibold truncate block">
                      {player.name.charAt(0)}. {player.name.split(' ').slice(1).join(' ')}
                    </PlayerNameWithHover>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span>{player.pos}</span>
                      <span className="text-slate-600">·</span>
                      <span>age {age}</span>
                      {traitBadge && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span
                            className={cn(
                              'font-bold',
                              traitBadge === 'LOYAL' ? 'text-emerald-300' : traitBadge === 'MERCENARY' ? 'text-amber-300' : 'text-sky-300',
                            )}
                          >
                            {traitBadge}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        'text-sm font-black tabular-nums',
                        k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400',
                      )}
                    >
                      {k2}
                    </div>
                    <div className="text-[9px] text-slate-500 tabular-nums">{fmtMoney(offer.salaryUSD)}/yr</div>
                  </div>
                  {isOwnTeam && (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          onSubmitAutoBid(player);
                        }}
                        className={cn(
                          'px-2 py-0.5 text-[9px] font-bold uppercase rounded',
                          euroIsolated
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : hasUserBid
                              ? 'bg-amber-600/30 text-amber-300 hover:bg-amber-600/50'
                              : 'bg-amber-600 hover:bg-amber-500 text-white',
                        )}
                        title={euroIsolated ? 'Open direct signing offer' : hasUserBid ? 'Bump your bid (beat top by 5%)' : 'Submit competitive market bid'}
                      >
                        {euroIsolated ? 'Sign' : hasUserBid ? 'Bump' : 'Pursue'}
                      </button>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          onToggleShortlist(player.internalId);
                        }}
                        className="text-rose-400/70 hover:text-rose-400 text-xs leading-none px-1"
                        title="Remove from shortlist"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
