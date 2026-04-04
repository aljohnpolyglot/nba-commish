export interface GameSettings {
  llmPerformance: 1 | 2 | 3; // 1=Blitz (Groq gpt-oss-120b), 2=Standard (Together cogito-v2), 3=Elite (Together MiniMax-M2.5)
  simulationDepth: number;    // 1–10: scales context size + output volume
  gameSpeed: number;          // 1–10: controls UI/delay pacing
  enableLLM: boolean;
  allowAITrades: boolean;     // AI teams trade with each other autonomously
  allowAIFreeAgency: boolean; // AI teams sign free agents autonomously
}

const DEFAULT_SETTINGS: GameSettings = {
  llmPerformance: 1,
  simulationDepth: 5,
  gameSpeed: 10,
  enableLLM: true,
  allowAITrades: true,
  allowAIFreeAgency: true,
};

export class SettingsManager {
  private static readonly STORAGE_KEY = 'nba_commish_settings';

  static getSettings(): GameSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration: old default had enableLLM: false
        if (parsed.enableLLM === false && !parsed.__llmMigrated) {
          parsed.enableLLM = true;
          parsed.__llmMigrated = true;
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));
        }
        // Migration: llmPerformance was 1-10, now 1|2|3
        if (parsed.llmPerformance > 3) {
          parsed.llmPerformance = parsed.llmPerformance <= 3 ? 1 : parsed.llmPerformance <= 7 ? 2 : 3;
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));
        }
        // Migration: add simulationDepth if missing
        if (parsed.simulationDepth === undefined) {
          parsed.simulationDepth = DEFAULT_SETTINGS.simulationDepth;
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    return DEFAULT_SETTINGS;
  }

  static updateSettings(partial: Partial<GameSettings>): void {
    this.saveSettings({ ...this.getSettings(), ...partial });
  }

  static saveSettings(settings: GameSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }

  // ─── Model ────────────────────────────────────────────────────────────────

  static getModelForTask(taskType: 'interaction' | 'simulation' | 'content' | 'admin'): string {
    const settings = this.getSettings();
    if (taskType === 'interaction') return 'gemini-2.5-flash-lite';
    if (!settings.enableLLM) return 'gemini-2.5-flash-lite';
    switch (settings.llmPerformance) {
      case 1: return 'fast';      // Blitz: Groq gpt-oss-120b (500 T/s) → Together fallback
      case 2: return 'balanced';  // Standard: Together cogito-v2 (update worker tier 2)
      case 3: return 'best';      // Elite: Together MiniMax-M2.5 → DeepSeek-V3 (update worker tier 3)
      default: return 'balanced';
    }
  }

  // ─── Content volume multiplier (game mode) ────────────────────────────────
  // How many social posts / news items the LLM is asked to produce.
  // Fast=0.1x  Balanced=0.5x  Best=1.0x

  static getContentMultiplier(): number {
    const { llmPerformance } = this.getSettings();
    return ({ 1: 0.1, 2: 0.5, 3: 1.0 } as Record<number, number>)[llmPerformance] ?? 0.5;
  }

  // ─── Context scale (simulation depth slider 1–10) ─────────────────────────
  // How much context (league summary, history, etc.) is packed into the prompt.
  // depth 1 → 0.3x  |  depth 5 → 0.65x  |  depth 10 → 1.0x

  static getContextScale(): number {
    const { simulationDepth } = this.getSettings();
    const d = Math.max(1, Math.min(10, simulationDepth));
    return 0.3 + (d - 1) / 9 * 0.7;
  }

  // ─── Output token budget ──────────────────────────────────────────────────
  // Mode sets ceiling, depth scales within it.

  static getMaxTokens(baseTokens: number): number {
    const { llmPerformance, simulationDepth } = this.getSettings();
    const modeCap: Record<number, number> = { 1: 0.4, 2: 0.8, 3: 1.5 };
    const depthScale = 0.4 + (simulationDepth - 1) / 9 * 0.6; // 0.4 → 1.0
    return Math.max(2048, Math.round(baseTokens * (modeCap[llmPerformance] ?? 0.8) * depthScale));
  }

  // ─── Game speed delay ─────────────────────────────────────────────────────

  static getDelay(baseDelayMs: number): number {
    const settings = this.getSettings();
    const multiplier = 2.0 - ((settings.gameSpeed - 1) / 9) * 1.8;
    return Math.round(baseDelayMs * multiplier);
  }
}
