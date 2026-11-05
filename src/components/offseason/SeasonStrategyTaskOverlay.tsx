import React from 'react';
import { useGame } from '../../store/GameContext';
import type { TeamStatus } from '../../types';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { SeasonStrategyModal } from './SeasonStrategyModal';
import { formatLeagueSeasonLabel } from '../../services/leagueCalendar';

interface SeasonStrategyTaskOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function SeasonStrategyTaskOverlay({ open, onClose }: SeasonStrategyTaskOverlayProps) {
  const { state, dispatchAction } = useGame();
  const userTeam = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []);
  if (!open || !userTeam) return null;

  const euroMode = isEuroIsolatedMode(state);
  const seasonYear = Number(state.leagueStats?.year ?? new Date().getUTCFullYear());
  const reporterName = state.leagueType === 'fictional' || euroMode ? 'League Media' : 'The Athletic';

  return (
    <SeasonStrategyModal
      teamName={getTeamFullName(userTeam)}
      currentStrategy={userTeam.manualTeamStatus as TeamStatus | undefined}
      teamAbbrev={userTeam.abbrev}
      teamColors={userTeam.colors}
      teamLogoUrl={getResolvedTeamLogoUrl(userTeam, seasonYear)}
      reporterName={reporterName}
      seasonLabel={formatLeagueSeasonLabel(seasonYear, state.leagueStats)}
      onClose={onClose}
      onDeliver={async strategy => {
        await dispatchAction({
          type: 'COMPLETE_MEDIA_DAY',
          payload: { strategy },
        } as any);
      }}
      onProceed={async () => {
        onClose();
      }}
    />
  );
}
