export interface GameSettings {
  llmPerformance: 1 | 2 | 3; // 1=Fast, 2=Balanced, 3=Best
  gameSpeed: number; // 1 to 10
  enableLLM: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  llmPerformance: 2,
  gameSpeed: 5,
  enableLLM: true,
};

export class SettingsManager {
  private static readonly STORAGE_KEY = 'nba_commish_settings';

  static getSettings(): GameSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration: old default had enableLLM: false — upgrade silently
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

  // Helper methods
  static getModelForTask(taskType: 'interaction' | 'simulation' | 'content' | 'admin'): string {
    const settings = this.getSettings();

    // Chat always uses the fastest model regardless of performance setting
    if (taskType === 'interaction') return 'gemini-2.5-flash-lite';

    if (!settings.enableLLM) return 'gemini-2.5-flash-lite';

    switch (settings.llmPerformance) {
      case 1: return 'gemini-2.5-flash-lite';  // Fast
      case 2: return 'gemini-2.5-flash';        // Balanced
      case 3: return 'gemini-2.5-flash';        // Best — flash is primary, pro is opportunistic fallback
      default: return 'gemini-2.5-flash';
    }
  }

  static getMaxTokens(baseTokens: number): number {
    const settings = this.getSettings();
    // 1: 0.6x, 2: 1.0x, 3: 1.5x
    const multipliers: Record<number, number> = { 1: 0.6, 2: 1.0, 3: 1.5 };
    return Math.round(baseTokens * (multipliers[settings.llmPerformance] ?? 1.0));
  }

  static getDelay(baseDelayMs: number): number {
    const settings = this.getSettings();
    // 1: 2x, 5: 1x, 10: 0.2x
    const multiplier = 2.0 - ((settings.gameSpeed - 1) / 9) * 1.8;
    return Math.round(baseDelayMs * multiplier);
  }
}
