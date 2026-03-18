export interface GameSettings {
  llmPerformance: number; // 1 to 10
  gameSpeed: number; // 1 to 10
  enableLLM: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  llmPerformance: 5,
  gameSpeed: 5,
  enableLLM: false,
};

export class SettingsManager {
  private static readonly STORAGE_KEY = 'nba_commish_settings';

  static getSettings(): GameSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    return DEFAULT_SETTINGS;
  }

  static saveSettings(settings: GameSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }

  // Helper methods
  static getModelForTask(taskType: 'interaction' | 'simulation' | 'content' | 'admin'): string {
    const settings = this.getSettings();
    if (!settings.enableLLM) return 'gemini-3.1-flash-lite-preview'; // Fallback, though shouldn't be called if disabled

    // 1-3: Lite, 4-7: Flash, 8-10: Pro
    if (settings.llmPerformance <= 3) {
      return 'gemini-3.1-flash-lite-preview';
    } else if (settings.llmPerformance <= 7) {
      return 'gemini-3-flash-preview';
    } else {
      return 'gemini-3.1-pro-preview';
    }
  }

  static getMaxTokens(baseTokens: number): number {
    const settings = this.getSettings();
    // 1: 0.5x, 5: 1x, 10: 2x
    const multiplier = 0.5 + ((settings.llmPerformance - 1) / 9) * 1.5;
    return Math.round(baseTokens * multiplier);
  }

  static getDelay(baseDelayMs: number): number {
    const settings = this.getSettings();
    // 1: 2x, 5: 1x, 10: 0.2x
    const multiplier = 2.0 - ((settings.gameSpeed - 1) / 9) * 1.8;
    return Math.round(baseDelayMs * multiplier);
  }
}
