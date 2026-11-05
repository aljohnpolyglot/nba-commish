import type { GameState } from '../../../types';
import { getTeamFullName } from '../../../utils/teamNames';
import { PlayerAssignmentsModal } from '../../shared/PlayerAssignmentsModal';

type Props = {
  open: boolean;
  state: GameState;
  userTeam: any;
  onClose: () => void;
  onMarkDone: () => void;
};

export function EndesaNbaDraftReviewModal({ open, state, userTeam, onClose, onMarkDone }: Props) {
  const draftYear = state.leagueStats.year;
  const ready = state.euroScouting?.preparedNbaDraftDecisionSeasons?.includes(draftYear) === true;
  const playersById = new Map([
    ...state.players,
    ...(state.euroScouting?.academyPlayers ?? []),
  ].map(player => [player.internalId, player]));
  const decisions = (state.euroScouting?.nbaDraftDecisions ?? [])
    .filter(decision => decision.draftYear === draftYear && decision.sourceTeamTid === state.userTeamId);
  const assignments = decisions.map(decision => {
    const player = playersById.get(decision.playerId);
    const outlook = decision.outlook === 'first-round'
      ? 'Current outlook: first round'
      : decision.outlook === 'second-round'
        ? 'Current outlook: second round'
        : 'Current outlook: draft bubble';
    return {
      id: decision.id,
      playerName: decision.playerName,
      playerImageUrl: player?.imgURL,
      destinationName: `${draftYear} NBA Draft`,
      destinationLogoUrl: undefined,
      destinationSubtitle: outlook,
      statusLabel: 'Plans to Enter',
    };
  });

  return (
    <PlayerAssignmentsModal
      open={open}
      title="NBA Draft Decisions"
      description={`Review which of your players plan to enter the ${draftYear} NBA Draft.`}
      organizationName={userTeam ? getTeamFullName(userTeam) : 'Your Club'}
      organizationLogoUrl={userTeam?.logoUrl ?? userTeam?.imgURL}
      assignments={assignments}
      participationLabel={assignments.length === 1 ? '1 player plans to enter' : `${assignments.length} players plan to enter`}
      emptyMessage={ready ? `No player from your club currently plans to enter the ${draftYear} NBA Draft.` : 'The draft decisions are being prepared.'}
      continueLabel="Mark Done"
      continueDisabled={!ready}
      onClose={onClose}
      onContinue={onMarkDone}
    />
  );
}
