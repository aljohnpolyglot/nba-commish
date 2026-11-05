import React, { useState } from 'react';
import ContactModal from '../components/ContactModal';
import { PersonSelectorModal } from '../components/modals/PersonSelectorModal';
import type { PersonSelectorActionType } from '../components/modals/personSelectorModalShared';
import { getContactFromPlayer } from '../components/players/view/freeAgentsViewData';
import { useGame } from '../store/GameContext';
import type { Contact, NBAPlayer } from '../types';
import { useManagedTeamActivity } from './useManagedTeamActivity';

type PlayerPersonActionType =
  | 'contact'
  | 'dinner'
  | 'movie'
  | 'fine'
  | 'drug_test'
  | 'suspension'
  | 'sabotage'
  | 'hypnotize';

const PLAYER_PERSON_ACTIONS = new Set<PlayerPersonActionType>([
  'contact',
  'dinner',
  'movie',
  'fine',
  'drug_test',
  'suspension',
  'sabotage',
  'hypnotize',
]);

const ACTION_TITLES: Record<Exclude<PlayerPersonActionType, 'contact'>, string> = {
  dinner: 'Invite to Dinner',
  movie: 'Invite to Movie',
  fine: 'Fine Player',
  drug_test: 'Order Drug Test',
  suspension: 'Suspend Player',
  sabotage: 'Sabotage Player',
  hypnotize: 'Hypnotize',
};

const ACTION_TYPES: Record<Exclude<PlayerPersonActionType, 'contact'>, string> = {
  dinner: 'INVITE_DINNER',
  movie: 'INVITE_DINNER',
  fine: 'FINE_PERSON',
  drug_test: 'DRUG_TEST_PERSON',
  suspension: 'SUSPEND_PLAYER',
  sabotage: 'SABOTAGE_PLAYER',
  hypnotize: 'HYPNOTIZE',
};

export function usePlayerPersonActions() {
  const { state, dispatchAction } = useGame();
  const teamActivity = useManagedTeamActivity();
  const [pending, setPending] = useState<{
    player: NBAPlayer;
    actionType: Exclude<PlayerPersonActionType, 'contact'>;
  } | null>(null);
  const [messageContact, setMessageContact] = useState<Contact | null>(null);

  const open = (player: NBAPlayer, actionType: string): boolean => {
    if (!PLAYER_PERSON_ACTIONS.has(actionType as PlayerPersonActionType)) return false;
    if (actionType === 'hypnotize' && state.godModeEnabled !== true) return false;
    if (state.gameMode === 'gm' && (actionType === 'dinner' || actionType === 'movie')) {
      return teamActivity.open(
        getContactFromPlayer(player, state),
        actionType,
        state.userTeamId,
      );
    }
    if (actionType === 'contact') {
      setMessageContact(getContactFromPlayer(player, state));
      return true;
    }
    setPending({
      player,
      actionType: actionType as Exclude<PlayerPersonActionType, 'contact'>,
    });
    return true;
  };

  const portals = (
    <>
      {pending && (
        <PersonSelectorModal
          title={ACTION_TITLES[pending.actionType]}
          actionType={pending.actionType as PersonSelectorActionType}
          preSelectedContact={getContactFromPlayer(pending.player, state)}
          skipPersonSelection={!['dinner', 'movie'].includes(pending.actionType)}
          showInviteMorePrompt={['dinner', 'movie'].includes(pending.actionType)}
          onClose={() => setPending(null)}
          onSelect={async (contacts, reason, amount, location, duration, disciplineTemplate) => {
            const actionType = pending.actionType;
            setPending(null);
            if (actionType === 'hypnotize' && state.godModeEnabled !== true) return;
            const finalReason = reason || (actionType === 'movie' ? 'Movie Night' : 'No reason provided.');
            await dispatchAction({
              type: ACTION_TYPES[actionType] as any,
              payload: {
                targetName: contacts.map(contact => contact.name).join(', '),
                targetRole: contacts.map(contact => contact.title).join(', '),
                targetId: contacts.map(contact => contact.id).join(','),
                reason: location ? `${finalReason} at ${location}` : finalReason,
                amount,
                duration,
                count: contacts.length,
                subType: actionType,
                location,
                contacts,
                disciplineTemplateId: disciplineTemplate?.templateId,
                disciplineTemplateName: disciplineTemplate?.templateName,
              },
            });
          }}
        />
      )}

      {messageContact && (
        <ContactModal
          contact={messageContact}
          onClose={() => setMessageContact(null)}
          onSend={async ({ message }) => {
            const contact = messageContact;
            const chat = state.chats.find(entry => entry.participants.includes(contact.id));
            await dispatchAction({
              type: 'SEND_CHAT_MESSAGE',
              payload: {
                chatId: chat?.id,
                text: message,
                targetId: contact.id,
                targetName: contact.name,
                targetRole: contact.title,
                targetOrg: contact.organization || 'Unknown',
                avatarUrl: contact.playerPortraitUrl,
              },
            });
            setMessageContact(null);
          }}
          isLoading={state.isProcessing}
        />
      )}
      {teamActivity.portals}
    </>
  );

  return { open, portals };
}
