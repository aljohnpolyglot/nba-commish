import React from 'react';
import { formatCurrencyWithCode } from '../../../../../utils/helpers';
import type { TrainingFacilityAreaKey, TycoonState } from '../../../../../types/tycoon';
import { TEAM_ARENAS } from '../../../../../data/arenas';
import {
  getTrainingAreaLevels,
  getTrainingCenterRating,
} from '../../../../../services/tycoon/facilityUpgradeEngine';
import { TrainingOverviewPanel } from './TrainingOverviewPanel';

interface TrainingSectionProps {
  tycoon: TycoonState;
  teamName: string;
  teamLogoUrl?: string;
  currency: string;
  economyIndex: number;
  availableCash: number;
  onPurchaseArea: (area: TrainingFacilityAreaKey) => void;
}

export const TrainingSection: React.FC<TrainingSectionProps> = ({
  tycoon,
  teamName,
  teamLogoUrl,
  currency,
  economyIndex,
  availableCash,
  onPurchaseArea,
}) => {
  const areaLevels = getTrainingAreaLevels(tycoon);
  const rating = getTrainingCenterRating(tycoon);
  const facilityName = `${teamName} Training Center`;
  const arenaName = TEAM_ARENAS[teamName] ?? 'Arena';
  const fmt = (value: number) => formatCurrencyWithCode(value, currency, false);

  return (
    <TrainingOverviewPanel
      facilityName={facilityName}
      arenaName={arenaName}
      teamLogoUrl={teamLogoUrl}
      areaLevels={areaLevels}
      rating={rating}
      economyIndex={economyIndex}
      availableCash={availableCash}
      fmt={fmt}
      onPurchaseArea={onPurchaseArea}
    />
  );
};
