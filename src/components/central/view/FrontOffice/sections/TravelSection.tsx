import React from 'react';
import { Plane } from 'lucide-react';
import type { TycoonState } from '../../../../../types/tycoon';
import { TravelLogisticsCard } from '../../../../tycoon/TravelLogisticsCard';
import { SectionTitle } from '../shared/helpers';

export const TravelSection: React.FC<{
  tycoon: TycoonState;
  currency: string;
  domesticAwayGames: number;
  internationalAwayGames: number;
  onSave: (prefs: { hotel: number; flight: number; bus: number }) => void;
}> = ({ tycoon, currency, domesticAwayGames, internationalAwayGames, onSave }) => (
  <div className="space-y-6">
    <SectionTitle icon={<Plane size={22} />} title="Travel & Logistics" subtitle="Set comfort standards for hotels, flights, and domestic road trips." />
    {(tycoon.cashOnHand ?? 0) < 2_000_000 && (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
        Survival mode watch: low cash may force economy travel in the next travel-economy update.
      </div>
    )}
    <TravelLogisticsCard tycoon={tycoon} currency={currency} domesticAwayGames={domesticAwayGames} internationalAwayGames={internationalAwayGames} onSave={onSave} />
  </div>
);
