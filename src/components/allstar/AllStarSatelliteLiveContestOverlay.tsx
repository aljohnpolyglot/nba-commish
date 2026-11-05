import { useMemo } from 'react';
import type { NBAPlayer, NBATeam } from '../../types';
import { useGame } from '../../store/GameContext';
import { ShootingStarsLiveContest } from '../../minigames/shootingstars/ShootingStarsLiveContest';
import { SkillsChallengeLiveContest } from '../../minigames/skills/SkillsChallengeLiveContest';
import { HorseLiveContest } from '../../minigames/horse/HorseLiveContest';
import {
  buildShootingStarsLiveTeams,
  buildSkillsLiveTeams,
} from '../../minigames/shared/liveContestBuilders';

export type SatelliteLiveContestKind = 'shooting-stars' | 'skills' | 'horse';

interface AllStarSatelliteLiveContestOverlayProps {
  active: SatelliteLiveContestKind | null;
  contestTeams: readonly NBATeam[];
  onClose: () => void;
}

type LegacyContestant = NBAPlayer & { playerId?: string };

function resolveContestants(
  entries: readonly NBAPlayer[] | undefined,
  players: readonly NBAPlayer[],
): NBAPlayer[] {
  return (entries ?? [])
    .map(entry => players.find(player =>
      player.internalId === (entry.internalId || (entry as LegacyContestant).playerId),
    ) ?? entry)
    .filter(Boolean);
}

export function AllStarSatelliteLiveContestOverlay({
  active,
  contestTeams,
  onClose,
}: AllStarSatelliteLiveContestOverlayProps) {
  const { state, dispatchAction } = useGame();
  const shootingStarsPlayers = useMemo(
    () => resolveContestants(state.allStar?.shootingStarsContestants, state.players),
    [state.allStar?.shootingStarsContestants, state.players],
  );
  const skillsPlayers = useMemo(
    () => resolveContestants(state.allStar?.skillsChallengeContestants, state.players),
    [state.allStar?.skillsChallengeContestants, state.players],
  );
  const horsePlayers = useMemo(
    () => resolveContestants(state.allStar?.horseContestants, state.players),
    [state.allStar?.horseContestants, state.players],
  );
  const teams = contestTeams as NBATeam[];
  const shootingStarsTeams = useMemo(
    () => buildShootingStarsLiveTeams(shootingStarsPlayers, teams),
    [shootingStarsPlayers, teams],
  );
  const skillsTeams = useMemo(
    () => buildSkillsLiveTeams(skillsPlayers, teams),
    [skillsPlayers, teams],
  );

  if (!active) return null;
  if (active === 'shooting-stars') {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-black">
        <ShootingStarsLiveContest
          teams={shootingStarsTeams}
          year={state.leagueStats.year}
          onClose={onClose}
          onComplete={result => {
            void dispatchAction({
              type: 'SAVE_CONTEST_RESULT',
              payload: {
                contest: 'shooting-stars',
                result: { ...result, complete: true },
                contestants: shootingStarsPlayers,
              },
            });
          }}
        />
      </div>
    );
  }
  if (active === 'skills') {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-black">
        <SkillsChallengeLiveContest
          teams={skillsTeams}
          year={state.leagueStats.year}
          onClose={onClose}
          onComplete={result => {
            void dispatchAction({
              type: 'SAVE_CONTEST_RESULT',
              payload: {
                contest: 'skills',
                result: { ...result, complete: true },
                contestants: skillsPlayers,
              },
            });
          }}
        />
      </div>
    );
  }
  if (active === 'horse') {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-black">
        <HorseLiveContest
          contestants={horsePlayers}
          rules={{
            noPlayerRepeat: state.leagueStats.allStarHorseNoPlayerRepeat === true,
            noGlobalRepeat: state.leagueStats.allStarHorseNoGlobalRepeat === true,
          }}
          onClose={onClose}
          onComplete={result => {
            void dispatchAction({
              type: 'SAVE_CONTEST_RESULT',
              payload: {
                contest: 'horse',
                result: { ...result, complete: true },
                contestants: horsePlayers,
              },
            });
          }}
        />
      </div>
    );
  }
  return null;
}
