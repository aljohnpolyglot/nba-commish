import React from 'react';
import { cn } from '../../../../../lib/utils';
import { computeContractOffer } from '../../../../../utils/salaryUtils';
import { getDisplayPotential } from '../../../../../utils/playerRatings';
import { PlayerNameWithHover } from '../../../../shared/PlayerNameWithHover';
import type { NBAPlayer, NBATeam } from '../../../../../types';
import type { FreeAgencyMarket, SortConfig, TierFilter, TopFreeAgentRow } from './TeamIntelFreeAgencyShared';
import { fmt1, getLastSeasonPergame, getLastTeamTid, hasBirdRightsResolved, isPlayerRFA } from './TeamIntelFreeAgencyShared';

export function TeamIntelFreeAgencyTopDrawer({
  tierFilter,
  sortConfig,
  birdRightsEnabled,
  euroIsolated,
  isOwnTeam,
  shortlistIds,
  teamId,
  teams,
  allMarkets,
  leagueStats,
  currentYear,
  visibleTopFAs,
  totalTopFAs,
  faPage,
  faPerPage,
  faTotalPages,
  fmtMoney,
  onSetTierFilter,
  onHandleSort,
  onOpenPlayer,
  onToggleShortlist,
  onSetFaPerPage,
  onPrevPage,
  onNextPage,
}: {
  tierFilter: TierFilter;
  sortConfig: SortConfig;
  birdRightsEnabled: boolean;
  euroIsolated: boolean;
  isOwnTeam: boolean;
  shortlistIds: Set<string>;
  teamId: number;
  teams: NBATeam[];
  allMarkets: FreeAgencyMarket[];
  leagueStats: unknown;
  currentYear: number;
  visibleTopFAs: TopFreeAgentRow[];
  totalTopFAs: number;
  faPage: number;
  faPerPage: number;
  faTotalPages: number;
  fmtMoney: (value: number) => string;
  onSetTierFilter: (filter: TierFilter) => void;
  onHandleSort: (col: string) => void;
  onOpenPlayer: (player: NBAPlayer) => void;
  onToggleShortlist: (id: string) => void;
  onSetFaPerPage: (value: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-black/40 overflow-hidden shrink-0">
      <div className="p-3 border-b border-[#30363d] flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold uppercase tracking-wider text-sm">Top Free Agents</h3>
        <div className="flex gap-1">
          {(['all', '90+', '80-89', '70-79', 'u25'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => onSetTierFilter(filter)}
              className={cn(
                'px-2 py-1 text-[10px] font-bold uppercase rounded',
                tierFilter === filter ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
              )}
            >
              {filter === 'u25' ? 'Under 25' : filter}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
              <SortableHeader label="Player" col="name" sortConfig={sortConfig} align="left" onSort={onHandleSort} />
              <th className="text-center px-1.5 py-2" title={euroIsolated ? 'Most recent club' : 'Most recent team'}>Team</th>
              <SortableHeader label="Pos" col="pos" sortConfig={sortConfig} align="center" onSort={onHandleSort} />
              <SortableHeader label="Age" col="age" sortConfig={sortConfig} align="center" onSort={onHandleSort} />
              <SortableHeader label="K2" col="k2" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              <SortableHeader label="POT" col="pot" sortConfig={sortConfig} align="right" title="2K-style potential rating" onSort={onHandleSort} />
              <SortableHeader label="MPG" col="mp" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              <SortableHeader label="PTS" col="pts" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              <SortableHeader label="REB" col="reb" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              <SortableHeader label="AST" col="ast" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              <SortableHeader label="PER" col="per" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              <th className="text-center px-1.5 py-2" title="Restricted (prior team can match offer sheet) vs Unrestricted">Type</th>
              {birdRightsEnabled && <th className="text-center px-1.5 py-2" title="Bird Rights — prior team can sign over the cap">Bird</th>}
              {!euroIsolated && <th className="text-center px-1.5 py-2" title="Number of active competing bids in the market">Offers</th>}
              <SortableHeader label="Asking" col="asking" sortConfig={sortConfig} align="right" onSort={onHandleSort} />
              {isOwnTeam && <th className="text-center px-2 py-2 w-[60px]">★</th>}
            </tr>
          </thead>
          <tbody>
            {visibleTopFAs.map(({ player, k2, age }) => {
              const offer = computeContractOffer(player, leagueStats as any);
              const isShortlisted = shortlistIds.has(player.internalId);
              const pot = getDisplayPotential(player, currentYear);
              const pg = getLastSeasonPergame(player);
              const rfa = isPlayerRFA(player);
              const askingTotalUSD = offer.salaryUSD * offer.years;
              const lastTid = getLastTeamTid(player);
              const lastTeam = lastTid >= 0 ? teams.find(team => team.id === lastTid) : null;
              const hasBird = hasBirdRightsResolved(player) && lastTid === teamId;
              const playerMarket = allMarkets.find(market => market.playerId === player.internalId && !market.resolved);
              const activeOfferCount = playerMarket?.bids.filter(bid => bid.status === 'active').length ?? 0;
              const isYourPriorPlayer = lastTid === teamId && lastTid >= 0;

              return (
                <tr
                  key={player.internalId}
                  onClick={() => onOpenPlayer(player)}
                  className={cn(
                    'border-t border-slate-800/60 cursor-pointer',
                    isYourPriorPlayer ? 'bg-amber-500/10 hover:bg-amber-500/20 border-l-2 border-l-amber-500' : 'hover:bg-white/5',
                  )}
                >
                  <td className="px-3 py-1.5 font-semibold truncate max-w-[160px]"><PlayerNameWithHover player={player}>{player.name}</PlayerNameWithHover></td>
                  <td className="text-center text-slate-400 font-bold tabular-nums text-[10px]">
                    {lastTeam ? (
                      <span className="inline-flex items-center gap-1 justify-center">
                        {lastTeam.logoUrl && (
                          <img src={lastTeam.logoUrl} alt={lastTeam.abbrev ?? lastTeam.name} referrerPolicy="no-referrer" className="w-4 h-4 object-contain shrink-0 opacity-90" />
                        )}
                        <span>{lastTeam.abbrev}</span>
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="text-center text-slate-400">{player.pos}</td>
                  <td className="text-center text-slate-400 tabular-nums">{age}</td>
                  <td className={cn('text-right font-black tabular-nums', k2 >= 90 ? 'text-blue-300' : k2 >= 85 ? 'text-emerald-300' : k2 >= 78 ? 'text-amber-300' : 'text-slate-400')}>{k2}</td>
                  <td className={cn('text-right font-semibold tabular-nums', pot >= 90 ? 'text-blue-300/80' : pot >= 85 ? 'text-emerald-300/80' : pot >= 78 ? 'text-amber-300/80' : 'text-slate-500')}>{pot}</td>
                  <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.mp) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.pts) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.reb) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.ast) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-right text-slate-300 tabular-nums">{pg ? fmt1(pg.per) : <span className="text-slate-600">—</span>}</td>
                  <td className="text-center">
                    <span
                      className={cn(
                        'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider',
                        rfa ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40' : 'bg-slate-700/40 text-slate-400 border border-slate-700',
                      )}
                    >
                      {rfa ? 'RFA' : 'UFA'}
                    </span>
                  </td>
                  {birdRightsEnabled && (
                    <td className="text-center">
                      <span
                        className={cn(
                          'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider',
                          hasBird ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-700/40 text-slate-500 border border-slate-700',
                        )}
                      >
                        {hasBird ? 'YES' : 'NO'}
                      </span>
                    </td>
                  )}
                  {!euroIsolated && (
                    <td className="text-center">
                      {activeOfferCount > 0 ? (
                        <span
                          className={cn(
                            'inline-block px-1.5 py-0.5 rounded text-[9px] font-black tabular-nums tracking-wider',
                            activeOfferCount >= 4 ? 'bg-blue-500/25 text-blue-200 border border-blue-500/50' : activeOfferCount >= 2 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-700/40 text-slate-300 border border-slate-700',
                          )}
                        >
                          {activeOfferCount}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-600 tracking-wider">—</span>
                      )}
                    </td>
                  )}
                  <td className="text-right text-slate-300 tabular-nums whitespace-nowrap">{fmtMoney(askingTotalUSD)}/{offer.years}yr</td>
                  {isOwnTeam && (
                    <td className="text-center">
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          onToggleShortlist(player.internalId);
                        }}
                        className={cn('px-1.5 py-0.5 rounded text-sm', isShortlisted ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300')}
                        title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                      >
                        {isShortlisted ? '★' : '☆'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalTopFAs > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#30363d] bg-black/30">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold hidden sm:inline-block">Show</span>
            <select
              className="bg-slate-900 border border-slate-700 text-white text-[11px] font-bold rounded px-2 py-1 outline-none appearance-none text-center"
              value={faPerPage}
              onChange={event => onSetFaPerPage(Number(event.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center flex-1">
            Page {faPage} <span className="text-slate-600">of</span> {faTotalPages}
            <span className="hidden sm:inline"> • {totalTopFAs} FAs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-slate-900 border border-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              onClick={onPrevPage}
              disabled={faPage === 1}
            >
              Prev
            </button>
            <button
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-slate-900 border border-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              onClick={onNextPage}
              disabled={faPage >= faTotalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  col,
  sortConfig,
  align,
  title,
  onSort,
}: {
  label: string;
  col: string;
  sortConfig: SortConfig;
  align: 'left' | 'center' | 'right';
  title?: string;
  onSort: (col: string) => void;
}) {
  return (
    <th
      className={cn(
        'px-1.5 py-2 cursor-pointer hover:text-slate-300',
        align === 'left' ? 'text-left px-3' : align === 'center' ? 'text-center px-2' : 'text-right',
      )}
      title={title}
      onClick={() => onSort(col)}
    >
      {label} {sortConfig.col === col && <span className="text-amber-400">{sortConfig.dir === 'desc' ? '▼' : '▲'}</span>}
    </th>
  );
}
