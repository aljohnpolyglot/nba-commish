import { useState } from 'react';
import type { LeagueStats, Rule } from '../../../../types';
import { generateRuleDetails } from '../../../../services/llm/llm';
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
  const [newRule, setNewRule] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [awardSettings, setAwardSettings] = useState(leagueStats.awardSettings);

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
    awardSettings,
    setAwardSettings,
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
    seasonYear: leagueStats.year,
    setRule,
    isPbaMode: leagueStats.uiMode === 'pba_isolated',
    uiMode: leagueStats.uiMode,
    localRules,
    setLocalRules,
    newRule,
    setNewRule,
    isSaving,
    setIsSaving,
    isGenerating,
    setIsGenerating,
    expandedRule,
    setExpandedRule,
    ...flatState,
    hasConfigChanges,
    handleSaveConfig,
    handleResetConfig,
    handleRemoveRule,
    handleAddRule,
  };
};
