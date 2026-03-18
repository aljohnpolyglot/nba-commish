export const generateRuleDetailsPrompt = (ruleIdea: string): string => {
    return `
  The NBA Commissioner wants to add a new rule based on this idea: "${ruleIdea}".
  Generate a formal, clear, and professional title and a detailed description for this new rule.
  Avoid satire or jokes in the rule text itself. It should sound like an official NBA memo.
  `;
};

export const generateAwardDetailsPrompt = (awardIdea: string): string => {
    return `
  The NBA Commissioner wants to add a new customizable award based on this idea: "${awardIdea}".
  Generate a formal, professional title (e.g., "The [Name] Trophy") and a strictly factual description for this new award, including the criteria for winning it.
  
  CRITICAL:
  1. Be extremely concise (max 2-3 sentences).
  2. Do NOT be satirical, sarcastic, or "attack" the user's idea.
  3. Do NOT editorialise about the state of the game (e.g., do not say "mid-range is dead").
  4. Treat the user's input as a serious, official request.
  `;
};
