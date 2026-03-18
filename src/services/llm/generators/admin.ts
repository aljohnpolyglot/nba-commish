import { generateContentWithRetry } from "../utils/api";
import { 
  SYSTEM_PROMPT, 
  generateRuleDetailsPrompt, 
  generateAwardDetailsPrompt 
} from "../prompts";
import { RULE_DETAILS_SCHEMA } from "../../schemas";
import { SettingsManager } from "../../SettingsManager";

export async function generateRuleDetails(ruleIdea: string): Promise<{ title: string, description: string }> {
  const prompt = generateRuleDetailsPrompt(ruleIdea);

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('admin'),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RULE_DETAILS_SCHEMA as any,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from LLM");
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating rule details:", error);
    return { title: ruleIdea, description: "A new rule added by the Commissioner." };
  }
}

export async function generateAwardDetails(awardIdea: string): Promise<{ title: string, description: string }> {
  const prompt = generateAwardDetailsPrompt(awardIdea);

  try {
    const response = await generateContentWithRetry({
      model: SettingsManager.getModelForTask('admin'),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RULE_DETAILS_SCHEMA as any,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from LLM");
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating award details:", error);
    return { title: awardIdea, description: "A new award added by the Commissioner." };
  }
}
