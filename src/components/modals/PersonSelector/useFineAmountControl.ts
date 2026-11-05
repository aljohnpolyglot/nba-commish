import { useEffect, useState } from 'react';
import type { Contact, GameState } from '../../../types';
import type { PersonSelectorActionType } from '../personSelectorModalShared';
import { contractToUSD } from '../../../utils/salaryUtils';
import { getLeagueCurrencyCode } from '../../../utils/helpers';
import { getEraAdjustedFineAmount, getEraFineStep } from '../../../services/disciplinePolicy';

export function useFineAmountControl(
  actionType: PersonSelectorActionType,
  selectedContacts: Contact[],
  state: GameState,
) {
  const [amount, setAmount] = useState('');
  const fineTarget = selectedContacts.length === 1
    ? state.players.find(player => player.internalId === selectedContacts[0].id)
    : undefined;
  const salaryBase = fineTarget
    ? contractToUSD(fineTarget.contract?.amount ?? 0)
    : Math.max(0, Number(state.leagueStats?.salaryCap ?? 0) / 15);
  const salaryStep = salaryBase < 100_000
    ? 500
    : salaryBase < 1_000_000
      ? 1_000
      : salaryBase < 10_000_000
        ? 5_000
        : 10_000;
  const fineStep = getEraFineStep(state);
  const step = actionType === 'fine' ? fineStep : salaryStep;
  const openCase = selectedContacts.length === 1
    ? state.inbox.find(email =>
        email.action?.type === 'discipline-case'
        && email.action.status === 'open'
        && email.action.playerIds.includes(selectedContacts[0].id),
      )
    : undefined;
  const caseRecommendation = openCase?.action?.type === 'discipline-case'
    ? openCase.action.recommendedAmountUSD
    : undefined;
  const recommendedAmount = actionType === 'give_money'
    ? Math.max(step, Math.round((salaryBase * 0.01) / step) * step)
    : caseRecommendation ?? Math.max(
      getEraAdjustedFineAmount(state, 2_000),
      Math.round((salaryBase * 0.0025) / step) * step,
    );

  useEffect(() => {
    if (actionType === 'fine' || actionType === 'give_money' || actionType === 'suspension') {
      setAmount(String(recommendedAmount));
    }
  }, [actionType, recommendedAmount]);

  return {
    amount,
    setAmount,
    step,
    recommendedAmount,
    currencyCode: getLeagueCurrencyCode(state.leagueStats),
  };
}
