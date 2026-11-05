import React, { useCallback, useState } from 'react';
import { PersonSelectorModal } from '../components/modals/PersonSelectorModal';
import { useGame } from '../store/GameContext';
import type { Contact } from '../types';
import {
  getTeamActivityCostMillion,
  resolveManagedTeamActivityParticipants,
  type TeamActivityType,
} from '../services/teamActivities';

type PendingTeamActivity = {
  contact: Contact;
  teamId: number;
  type: TeamActivityType;
};

export function useManagedTeamActivity() {
  const { state, dispatchAction } = useGame();
  const [pending, setPending] = useState<PendingTeamActivity | null>(null);

  const open = useCallback((contact: Contact, type: TeamActivityType, teamId = state.userTeamId) => {
    if (teamId == null) return false;
    if (resolveManagedTeamActivityParticipants(state, teamId, [contact]).contacts.length !== 1) return false;
    setPending({ contact, teamId, type });
    return true;
  }, [state]);

  const contactFilter = useCallback((contact: Contact) => {
    if (!pending) return false;
    return resolveManagedTeamActivityParticipants(state, pending.teamId, [contact]).contacts.length === 1;
  }, [pending, state]);

  const portals = pending ? (
    <PersonSelectorModal
      title={pending.type === 'movie' ? 'Movie Night' : 'Team Dinner'}
      actionType={pending.type}
      preSelectedContact={pending.contact}
      showInviteMorePrompt
      contactFilter={contactFilter}
      selectionTitle="Choose Teammates and Staff"
      selectionDescription="Select people from your current club."
      chargePersonalFunds
      onClose={() => setPending(null)}
      onSelect={async (contacts, reason, amount, location, duration) => {
        const activity = pending;
        setPending(null);
        const eligible = resolveManagedTeamActivityParticipants(state, activity.teamId, contacts);
        if (eligible.contacts.length === 0) return;
        await dispatchAction({
          type: 'INVITE_DINNER',
          payload: {
            targetName: eligible.contacts.map(contact => contact.name).join(', '),
            targetRole: eligible.contacts.map(contact => contact.title).join(', '),
            targetId: eligible.contacts.map(contact => contact.id).join(','),
            reason,
            amount,
            duration,
            location,
            count: eligible.contacts.length,
            subType: activity.type,
            contacts: eligible.contacts,
            teamId: activity.teamId,
            managedTeamId: activity.teamId,
            teamActivity: true,
            activityCostMillion: getTeamActivityCostMillion(activity.type, eligible.contacts.length),
          },
        });
      }}
    />
  ) : null;

  return { open, portals };
}
