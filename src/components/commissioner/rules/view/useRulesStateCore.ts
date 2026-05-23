import { useState } from 'react';
import type { LeagueStats, Rule } from '../../../../types';
import { generateAwardDetails, generateRuleDetails } from '../../../../services/llm/llm';
import { createRulesViewDefaults } from './rulesStateViewDefaults';
import { useLeagueLabels } from '../../../../utils/leagueLabels';
import {
  materializeRulesStateSection,
  useAllStarRulesState,
  useEconomyRulesState,
  useFormatRulesState,
  useGameRulesState,
  useHonorsRulesState,
} from './useRulesDomainStates';
import {
  buildRulesStateBaseline,
  hasRulesConfigChanges,
  resetRulesConfig,
  saveRulesConfig,
} from './rulesStateConfig';

export const useRulesState = (
  leagueStats: LeagueStats,
  dispatchAction: (action: any) => Promise<void>,
  isEditable = true,
) => {
  const labels = useLeagueLabels();
  const viewDefaults = createRulesViewDefaults(leagueStats);

  const [localRules, setLocalRules] = useState<Rule[]>(leagueStats.rules);
  const [localAwards, setLocalAwards] = useState<Rule[]>(leagueStats.awards || []);
  const [newRule, setNewRule] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAward, setIsGeneratingAward] = useState(false);
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [expandedAward, setExpandedAward] = useState<string | null>(null);

  const formatState = materializeRulesStateSection(useFormatRulesState(leagueStats, viewDefaults));
  const allStarState = materializeRulesStateSection(useAllStarRulesState(viewDefaults));
  const gameState = materializeRulesStateSection(useGameRulesState(leagueStats));
  const economyState = materializeRulesStateSection(useEconomyRulesState(leagueStats));
  const honorsState = materializeRulesStateSection(useHonorsRulesState(leagueStats));

  const flatState = {
    ...formatState,
    ...allStarState,
    ...gameState,
    ...economyState,
    ...honorsState,
    draftEligibilityRule: formatState.eligibilityRule,
    setDraftEligibilityRule: formatState.setEligibilityRule,
  };

  const rules = {} as LeagueStats;
  const setterByKey = {} as Record<string, (value: any) => void>;
  for (const [key, value] of Object.entries(flatState)) {
    if (key.startsWith('set') && typeof value === 'function') {
      setterByKey[key.charAt(3).toLowerCase() + key.slice(4)] = value as (value: any) => void;
      continue;
    }
    (rules as any)[key] = value;
  }

  const setRule = <K extends keyof LeagueStats | string>(key: K, value: any) => {
    const setter = setterByKey[key as string];
    if (setter) setter(value);
    else if (process.env.NODE_ENV !== 'production') {
      console.warn(`[useRulesState] setRule: no setter registered for "${String(key)}"`);
    }
  };

  const baseline = buildRulesStateBaseline(leagueStats, viewDefaults);
  const hasConfigChanges = hasRulesConfigChanges(rules as any, baseline);

  const handleSaveConfig = async () => {
    if (!isEditable) return;
    setIsSaving(true);
    try {
      const cleanedFormat = await saveRulesConfig({
        rules: rules as any,
        baseline,
        leagueStats,
        dispatchAction,
        cupShort: labels.cupShort,
      });
      setRule('playoffFormat', cleanedFormat);
    } catch (error) {
      console.error('Failed to save rules:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetConfig = () => {
    resetRulesConfig(baseline, setRule);
  };

  const handleAddAward = async (name: string, criteria: string) => {
    setIsGeneratingAward(true);
    try {
      const details = await generateAwardDetails(criteria.trim());
      let finalTitle = name.trim() || details.title;
      if (finalTitle.toLowerCase().includes('mvp') && !finalTitle.includes('(')) {
        finalTitle = 'MVP (Michael Jordan Trophy)';
      } else if (finalTitle.toLowerCase().includes('defensive player') && !finalTitle.includes('(')) {
        finalTitle = 'Defensive Player of the Year (Hakeem Olajuwon Trophy)';
      }

      const updatedAwards = [
        ...localAwards,
        { id: `award-${Date.now()}`, title: finalTitle, description: details.description },
      ];
      setLocalAwards(updatedAwards);
      setAwardModalOpen(false);

      await dispatchAction({
        type: 'ANNOUNCE_CHANGE',
        payload: {
          description: `The Commissioner has established a new award: ${finalTitle}. Criteria: ${details.description}`,
          statUpdates: {
            awards: updatedAwards,
            morale: { fans: 2, players: 3, owners: 0, legacy: 1 },
            viewership: 1,
          },
        },
      });
    } catch (error) {
      console.error('Failed to generate award details:', error);
    } finally {
      setIsGeneratingAward(false);
    }
  };

  const handleRemoveAward = async (id: string) => {
    const awardToRemove = localAwards.find(award => award.id === id);
    const updatedAwards = localAwards.filter(award => award.id !== id);
    setLocalAwards(updatedAwards);
    await dispatchAction({
      type: 'ANNOUNCE_CHANGE',
      payload: {
        description: `The Commissioner has abolished the ${awardToRemove?.title || 'award'}.`,
        statUpdates: {
          awards: updatedAwards,
          morale: { fans: -3, players: -4, owners: 0, legacy: -2 },
          viewership: -1,
        },
      },
    });
  };

  const handleRemoveRule = async (id: string) => {
    const updatedRules = localRules.filter(rule => rule.id !== id);
    setLocalRules(updatedRules);
    await dispatchAction({ type: 'UPDATE_RULES', payload: { rules: updatedRules } });
  };

  const handleAddRule = async (ruleText: string) => {
    if (!ruleText.trim()) return;
    setIsGenerating(true);
    try {
      const details = await generateRuleDetails(ruleText.trim());
      const updatedRules = [
        ...localRules,
        { id: `rule-${Date.now()}`, title: details.title, description: details.description },
      ];
      setLocalRules(updatedRules);
      setNewRule('');

      await dispatchAction({ type: 'UPDATE_RULES', payload: { rules: updatedRules } });
      await dispatchAction({
        type: 'ANNOUNCE_CHANGE',
        payload: {
          description: `The Commissioner has implemented a new rule: ${details.title}. ${details.description}`,
          statUpdates: { rules: updatedRules },
        },
      });
    } catch (error) {
      console.error('Failed to generate rule details:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    rules,
    setRule,
    localRules,
    setLocalRules,
    localAwards,
    setLocalAwards,
    newRule,
    setNewRule,
    isSaving,
    setIsSaving,
    isGenerating,
    setIsGenerating,
    isGeneratingAward,
    setIsGeneratingAward,
    awardModalOpen,
    setAwardModalOpen,
    expandedRule,
    setExpandedRule,
    expandedAward,
    setExpandedAward,
    ...flatState,
    hasConfigChanges,
    handleSaveConfig,
    handleResetConfig,
    handleAddAward,
    handleRemoveAward,
    handleRemoveRule,
    handleAddRule,
  };
};
