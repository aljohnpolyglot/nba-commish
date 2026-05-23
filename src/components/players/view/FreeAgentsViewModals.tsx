import React from 'react';
import { PlayerActionsModal } from '../../central/view/PlayerActionsModal';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import ContactModal from '../../ContactModal';
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
          onHeal={() => { vm.healPlayer(vm.selectedActionPlayer!.internalId); vm.setSelectedActionPlayer(null); }}
        />
      )}
      {vm.quick.portals}
      {vm.contactModalPerson && (
        <ContactModal
          contact={vm.contactModalPerson}
          onClose={() => vm.setContactModalPerson(null)}
          onSend={async ({ message }: { message: string }) => {
            const chat = vm.state.chats.find((c: any) => c.participants.includes(vm.contactModalPerson.id) && c.participants.includes('commissioner'));
            await vm.dispatchAction({
              type: 'SEND_CHAT_MESSAGE',
              payload: {
                chatId: chat?.id,
                text: message,
                targetId: vm.contactModalPerson.id,
                targetName: vm.contactModalPerson.name,
                targetRole: vm.contactModalPerson.title,
                targetOrg: vm.contactModalPerson.organization || 'Unknown',
                avatarUrl: vm.contactModalPerson.playerPortraitUrl,
              },
            });
            vm.setContactModalPerson(null);
          }}
          isLoading={vm.state.isProcessing}
        />
      )}
      {vm.viewingRatingsPlayer && (
        <PlayerRatingsModal player={vm.viewingRatingsPlayer} season={vm.state.leagueStats?.year ?? new Date().getFullYear()} onClose={() => vm.setViewingRatingsPlayer(null)} />
      )}
      {vm.rosterGate.modal}
      {vm.personSelectorOpen && vm.preSelectedContact && (
        <PersonSelectorModal
          title={vm.personSelectorType === 'bribe' ? 'Offer Bribe' : vm.personSelectorType === 'dinner' ? 'Invite to Dinner' : vm.personSelectorType === 'movie' ? 'Invite to Movie' : vm.personSelectorType === 'suspension' ? 'Suspend Player' : vm.personSelectorType === 'waive' ? 'Waive Player' : vm.personSelectorType === 'sabotage' ? 'Sabotage' : 'Action'}
          actionType={vm.personSelectorType as any}
          preSelectedContact={vm.preSelectedContact}
          skipPersonSelection
          onClose={() => { vm.setPersonSelectorOpen(false); vm.setPreSelectedContact(null); }}
          onSelect={vm.handlePersonSelected}
        />
      )}
    </>
  );
}
