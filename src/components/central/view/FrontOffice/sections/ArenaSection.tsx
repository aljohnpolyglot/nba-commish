import React, { useMemo, useState } from 'react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { ArenaFeatureId, Sponsorship, SponsorshipSlot, TycoonState } from '../../../../../types/tycoon';
import { TEAM_ARENAS } from '../../../../../data/arenas';
import { getArenaForTeam } from '../../../../../utils/arenaData';
import { ARENA_TABS, type ArenaTab, NBA_ARENA_CAPACITIES } from './arenaSectionConfig';
import { getTycoonFacilityLevel, getTycoonStadiumCapacity } from '../../../../../services/tycoon/tierBase';
import {
  getArenaRating,
  getOwnedArenaFeatureIds,
  type ArenaCapacityProject,
  type ArenaFeatureSpec,
} from '../../../../../services/tycoon/facilityUpgradeEngine';
import { getSponsoredArenaFeatures } from '../../../../../services/tycoon/sponsorBenefits';
import {
  getTicketDemandMultiplier,
  normalizeTicketPriceMultiplier,
} from '../../../../../services/tycoon/clubFinance';
import { type LeagueKey } from '../../../../../data/sponsorCatalogFetcher';
import { ArenaCourtTab } from './ArenaCourtTab';
import { ArenaIdentityTab } from './ArenaIdentityTab';
import { ArenaOverviewTab } from './ArenaOverviewTab';
import { ArenaPurchaseModal } from './ArenaPurchaseModal';
import { ArenaSponsorshipPortfolio } from './ArenaSponsorshipPortfolio';
import { ArenaTicketingTab } from './ArenaTicketingTab';

interface ArenaSectionProps {
  tycoon: TycoonState;
  teamName: string;
  teamAbbrev?: string;
  teamLogoUrl?: string;
  currency: string;
  sponsorLeague: LeagueKey;
  homeGames: number;
  onTicketMultChange: (multiplier: number) => void;
  economyIndex: number;
  availableCash: number;
  onPurchaseFeature: (feature: ArenaFeatureId) => void;
  onPurchaseCapacity: (projectId: string, currentCapacity: number) => void;
  locked?: boolean;
}

type ArenaProject =
  | { kind: 'feature'; spec: ArenaFeatureSpec }
  | { kind: 'capacity'; spec: ArenaCapacityProject };

export const ArenaSection: React.FC<ArenaSectionProps> = ({
  tycoon,
  teamName,
  teamAbbrev,
  teamLogoUrl,
  currency,
  sponsorLeague,
  homeGames,
  onTicketMultChange,
  economyIndex,
  availableCash,
  onPurchaseFeature,
  onPurchaseCapacity,
  locked = false,
}) => {
  const [tab, setTab] = useState<ArenaTab>('identity');
  const [selectedProject, setSelectedProject] = useState<ArenaProject | null>(null);
  const ticketMult = normalizeTicketPriceMultiplier(tycoon.ticketPriceMultiplier);
  const savedVenue = tycoon.facilities.stadium.venue;
  const arenaName = savedVenue?.name ?? TEAM_ARENAS[teamName] ?? `${teamName} Arena`;
  const arenaInfo = getArenaForTeam(teamAbbrev ?? teamName);
  const stadiumLevel = getTycoonFacilityLevel(tycoon.facilities.stadium);
  const sourceCapacity = arenaInfo?.seating_capacity ?? NBA_ARENA_CAPACITIES[arenaName] ?? 0;
  const capacity = Math.max(sourceCapacity, getTycoonStadiumCapacity(tycoon));
  const location = savedVenue ? `${savedVenue.city}, ${savedVenue.country}` : arenaInfo?.arena_location ?? '';
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);
  const sponsoredFeatures = getSponsoredArenaFeatures(tycoon);
  const sponsoredFeatureIds = sponsoredFeatures.map(feature => feature.featureId);
  const arenaRating = getArenaRating(tycoon.facilities.stadium, capacity, sponsoredFeatureIds);
  const projectedArenaRating = selectedProject
    ? selectedProject.kind === 'capacity'
      ? getArenaRating(tycoon.facilities.stadium, capacity + selectedProject.spec.seatGain, sponsoredFeatureIds)
      : getArenaRating({
          ...tycoon.facilities.stadium,
          installedArenaFeatures: [...new Set([
            ...getOwnedArenaFeatureIds(tycoon.facilities.stadium),
            selectedProject.spec.id,
          ])],
        }, capacity, sponsoredFeatureIds)
    : arenaRating;
  const revenueEstimate = useMemo(() => {
    const avgTicketPrice = 85 * ticketMult;
    const fillRate = Math.min(1, (0.75 + stadiumLevel * 0.03) * getTicketDemandMultiplier(ticketMult));
    return Math.round(avgTicketPrice * capacity * homeGames * fillRate);
  }, [capacity, homeGames, stadiumLevel, ticketMult]);
  const sponsorships = tycoon.sponsorships ?? {};
  const arenaSponsors = (['court', 'stadium'] as SponsorshipSlot[])
    .map(slot => ({ slot, deal: sponsorships[slot] }))
    .filter((entry): entry is { slot: SponsorshipSlot; deal: Sponsorship } => Boolean(entry.deal));

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-flow-col auto-cols-[minmax(180px,1fr)] gap-3 overflow-x-auto pb-1 scrollbar-hide xl:grid-flow-row xl:grid-cols-5">
        {ARENA_TABS.map(item => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex min-h-16 items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-black transition ${
              tab === item.id
                ? 'border-amber-400/60 bg-amber-400/[0.08] text-amber-300'
                : 'border-slate-700 bg-slate-950/20 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === 'identity' && (
        <ArenaIdentityTab
          arenaName={arenaName}
          capacity={capacity}
          location={location}
          arenaRating={arenaRating}
          revenueEstimate={revenueEstimate}
          homeGames={homeGames}
          teamName={teamName}
          teamLogoUrl={teamLogoUrl}
          fmt={fmt}
          stadium={tycoon.facilities.stadium}
          onSelectFeature={spec => setSelectedProject({ kind: 'feature', spec })}
          onManageTickets={() => setTab('ticketing')}
          sponsoredFeatures={sponsoredFeatures}
          sponsorLeague={sponsorLeague}
        />
      )}
      {tab === 'court' && (
        <ArenaCourtTab
          teamName={teamName}
          teamLogoUrl={teamLogoUrl}
          teamAbbrev={teamAbbrev}
          arenaName={arenaName}
        />
      )}
      {tab === 'overview' && (
        <ArenaOverviewTab
          arenaName={arenaName}
          capacity={capacity}
          arenaRating={arenaRating}
          tycoon={tycoon}
          revenueEstimate={revenueEstimate}
          homeGames={homeGames}
          fmt={fmt}
          onSelectCapacity={spec => setSelectedProject({ kind: 'capacity', spec })}
        />
      )}
      {tab === 'sponsorship' && (
        <ArenaSponsorshipPortfolio
          arenaSponsors={arenaSponsors}
          arenaName={arenaName}
          fmt={fmt}
          sponsorLeague={sponsorLeague}
          sponsoredFeatureIds={sponsoredFeatureIds}
        />
      )}
      {tab === 'ticketing' && (
        <ArenaTicketingTab
          ticketMult={ticketMult}
          onTicketMultChange={onTicketMultChange}
          capacity={capacity}
          revenueEstimate={revenueEstimate}
          homeGames={homeGames}
          fmt={fmt}
          locked={locked}
        />
      )}

      {selectedProject && (
        <ArenaPurchaseModal
          project={selectedProject}
          owned={selectedProject.kind === 'feature' && getOwnedArenaFeatureIds(tycoon.facilities.stadium).includes(selectedProject.spec.id)}
          economyIndex={economyIndex}
          availableCash={availableCash}
          currentCapacity={capacity}
          currentRating={arenaRating}
          completedRating={projectedArenaRating}
          fmt={fmt}
          locked={locked}
          onClose={() => setSelectedProject(null)}
          onPurchase={() => {
            if (selectedProject.kind === 'feature') return onPurchaseFeature(selectedProject.spec.id);
            return onPurchaseCapacity(selectedProject.spec.id, capacity);
          }}
        />
      )}
    </div>
  );
};
