import React from 'react';
import { PlayerActionsModal } from '../../central/view/PlayerActionsModal';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import type { useFreeAgentsViewModel } from './useFreeAgentsViewModel';

type VM = ReturnType<typeof useFreeAgentsViewModel>;

export function FreeAgentsViewModals({ vm }: { vm: VM }) {
  return (
    <>
      {vm.selectedActionPlayer && (
        <PlayerActionsModal
          player={vm.selectedActionPlayer}
          onClose={() => vm.setSelectedActionPlayer(null)}
          onActionSelect={vm.handleActionSelect}
          onHeal={() => vm.healPlayer(vm.selectedActionPlayer!.internalId)}
        />
      )}
      {vm.quick.portals}
      {vm.viewingRatingsPlayer && (
        <PlayerRatingsModal player={vm.viewingRatingsPlayer} season={vm.state.leagueStats?.year ?? new Date().getFullYear()} onClose={() => vm.setViewingRatingsPlayer(null)} />
      )}
      {vm.rosterGate.modal}
      {vm.personSelectorOpen && vm.preSelectedContact && (
        <PersonSelectorModal
          title={vm.personSelectorType === 'dinner' ? 'Invite to Dinner' : vm.personSelectorType === 'movie' ? 'Invite to Movie' : vm.personSelectorType === 'suspension' ? 'Suspend Player' : vm.personSelectorType === 'waive' ? 'Waive Player' : vm.personSelectorType === 'sabotage' ? 'Sabotage' : 'Action'}
          actionType={vm.personSelectorType as any}
          preSelectedContact={vm.preSelectedContact}
          skipPersonSelection
          showInviteMorePrompt={vm.personSelectorType === 'dinner' || vm.personSelectorType === 'movie'}
          onClose={() => { vm.setPersonSelectorOpen(false); vm.setPreSelectedContact(null); }}
          onSelect={vm.handlePersonSelected}
        />
      )}
    </>
  );
}
