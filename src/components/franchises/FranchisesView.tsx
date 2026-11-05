import React, { useEffect, useState } from 'react';
import type { FranchiseAncillaryPrice, FranchiseSponsorOffer, FranchiseTicketTier } from '../../types';
import { useGame } from '../../store/GameContext';
import {
  canBrowseFranchiseTeam,
  canManageFranchiseTeam,
  ensureFranchiseOperations,
} from '../../services/franchises/franchiseState';
import {
  updateFranchiseAncillaryPrice,
  updateFranchiseTicketPrice,
} from '../../services/franchises/franchiseMatchday';
import {
  ensureFranchiseLeagueEvents,
  signFranchiseSponsor,
} from '../../services/franchises/franchiseSponsors';
import { FranchisePortal } from './FranchisePortal';
import { FranchiseTeamView, type TeamTab } from './FranchiseTeamView';
import { LeagueEventSponsorships } from './LeagueEventSponsorships';

interface FranchisesViewProps {
  initialTeamId?: number;
  onExit?: () => void;
}

export const FranchisesView: React.FC<FranchisesViewProps> = ({ initialTeamId, onExit }) => {
  const { state, applyTycoonMutation, dispatchAction, navigateToPlayer } = useGame();
  const isGM = state.gameMode === 'gm';
  const eventTaskInProgress = Object.values(state.commissionerTasks?.records ?? {})
    .some(record =>
      record.taskId === 'franchise_event_sponsorships'
      && record.status === 'in_progress',
    );
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
    initialTeamId ?? (isGM ? state.userTeamId ?? null : null),
  );
  const [showLeagueEvents, setShowLeagueEvents] = useState(!isGM && eventTaskInProgress);
  const [returnTab, setReturnTab] = useState<TeamTab | undefined>();
  useEffect(() => {
    setSelectedTeamId(initialTeamId ?? (isGM ? state.userTeamId ?? null : null));
    setShowLeagueEvents(!isGM && eventTaskInProgress);
    setReturnTab(undefined);
  }, [eventTaskInProgress, initialTeamId, isGM, state.saveId, state.userTeamId]);
  const selectedTeam = state.teams.find(team =>
    team.id === selectedTeamId && canBrowseFranchiseTeam(state, team.id)
  );
  const franchise = selectedTeam ? ensureFranchiseOperations(state, selectedTeam) : null;
  const canManageSelectedTeam = selectedTeam
    ? canManageFranchiseTeam(state, selectedTeam.id)
    : false;

  const mutateFranchise = (mutation: (franchiseState: NonNullable<typeof franchise>) => void) => {
    if (!selectedTeam || !canManageFranchiseTeam(state, selectedTeam.id)) return;
    applyTycoonMutation(selectedTeam.id, team => {
      if (!('id' in team)) return;
      team.franchiseOperations = team.franchiseOperations ?? ensureFranchiseOperations(state, team);
      mutation(team.franchiseOperations);
    });
  };

  if (!isGM && showLeagueEvents) {
    const portfolio = ensureFranchiseLeagueEvents(state);
    return (
      <div>
        <div className="sticky top-0 z-30 flex justify-end border-b border-slate-800 bg-[#040811]/95 px-3 py-2 backdrop-blur sm:px-7">
          <button onClick={() => setShowLeagueEvents(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-black text-white">Browse Franchises</button>
        </div>
        <LeagueEventSponsorships
          state={state}
          portfolio={portfolio}
          onSelectDeal={deal => {
            dispatchAction({
              type: 'UPDATE_STATE',
              payload: {
                franchiseLeagueEvents: {
                  ...portfolio,
                  deals: portfolio.deals.map(current =>
                    current.assetId === deal.assetId ? deal : current,
                  ),
                },
              },
            });
          }}
          onSelectDeals={deals => {
            const replacements = new Map(deals.map(deal => [deal.assetId, deal]));
            dispatchAction({
              type: 'UPDATE_STATE',
              payload: {
                franchiseLeagueEvents: {
                  ...portfolio,
                  deals: portfolio.deals.map(current =>
                    replacements.get(current.assetId) ?? current,
                  ),
                },
              },
            });
          }}
        />
      </div>
    );
  }

  if (!selectedTeam || !franchise) {
    return (
      <div>
        {!isGM && <div className="sticky top-0 z-30 flex justify-end border-b border-slate-800 bg-[#040811]/95 px-3 py-2 backdrop-blur sm:px-7"><button onClick={() => setShowLeagueEvents(true)} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-black text-amber-200">League Event Sponsors</button></div>}
        <FranchisePortal state={state} onSelectTeam={setSelectedTeamId} />
      </div>
    );
  }

  return (
    <FranchiseTeamView
      state={state}
      team={selectedTeam}
      franchise={franchise}
      canManage={canManageSelectedTeam}
      canReturn={!!onExit || state.teams.length > 1}
      initialTab={returnTab}
      onReturn={() => onExit ? onExit() : setSelectedTeamId(null)}
      onPlayerSelect={player => {
        setReturnTab('jerseys');
        navigateToPlayer(player);
      }}
      onPriceChange={(tier: FranchiseTicketTier, value: number) => {
        mutateFranchise(current => updateFranchiseTicketPrice(current, tier, value, state.leagueStats.year));
      }}
      onAncillaryPriceChange={(item: FranchiseAncillaryPrice, value: number) => {
        mutateFranchise(current => updateFranchiseAncillaryPrice(current, item, value, state.leagueStats.year));
      }}
      onSign={(offer: FranchiseSponsorOffer) => {
        mutateFranchise(current => signFranchiseSponsor(current, offer, state.leagueStats.year));
      }}
      onAcceptArena={(facilityName: string) => {
        mutateFranchise(current => {
          const pending = current.arena.pendingNewArena;
          if (!pending) return;
          const previousArena = current.arena;
          const approvedName = facilityName.trim() || pending.proposedName;
          current.arena = {
            baseName: approvedName,
            displayName: approvedName,
            location: pending.location,
            capacity: pending.capacity,
            openedSeason: state.leagueStats.year,
          };
          if (current.deals.namingRights) {
            current.deals.namingRights = {
              ...current.deals.namingRights,
              endSeason: state.leagueStats.year,
            };
          }
          current.lastArenaReviewSeason = pending.announcedSeason;
          current.history.unshift(
            {
              id: `${selectedTeam.id}-arena-${state.leagueStats.year}`,
              season: state.leagueStats.year,
              title: 'New arena approved',
              detail: `${approvedName} was approved in ${pending.location} with ${pending.capacity.toLocaleString()} seats.`,
              kind: 'arena',
            },
            {
              id: `${selectedTeam.id}-arena-retired-${state.leagueStats.year}`,
              season: state.leagueStats.year,
              title: `${previousArena.displayName} retired`,
              detail: `${previousArena.displayName} closed as the club’s home after serving ${previousArena.location}.`,
              kind: 'arena',
              imageUrl: previousArena.imageUrl,
            },
          );
        });
      }}
    />
  );
};
