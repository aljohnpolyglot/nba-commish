import { get, set, del, keys } from 'idb-keyval';
import { GameState } from '../types';

export interface SaveMetadata {
  id: string;
  name: string;
  dateSaved: number;
  gameDate: string;
  commissionerName: string;
  day: number;
}

const SAVES_PREFIX = 'nba_commish_save_';
const METADATA_KEY = 'nba_commish_metadata';

export class SaveManager {
  static async getMetadata(): Promise<SaveMetadata[]> {
    const metadata = await get<SaveMetadata[]>(METADATA_KEY);
    return metadata || [];
  }

  static async saveGame(state: GameState, saveName: string): Promise<string> {
    const id = state.saveId || `${SAVES_PREFIX}${Date.now()}`;
    const metadata = await this.getMetadata();
    
    const newMeta: SaveMetadata = {
      id,
      name: saveName,
      dateSaved: Date.now(),
      gameDate: state.date,
      commissionerName: state.commissionerName,
      day: state.day,
    };

    // Update or add metadata
    const existingIndex = metadata.findIndex(m => m.id === id);
    if (existingIndex >= 0) {
      metadata[existingIndex] = newMeta;
    } else {
      metadata.push(newMeta);
    }
    
    // Save state and metadata
    const stateToSave = { ...state, saveId: id };
    await set(id, stateToSave);
    await set(METADATA_KEY, metadata);
    
    return id;
  }

  static async loadGame(id: string): Promise<GameState | undefined> {
    return await get<GameState>(id);
  }

  static async deleteSave(id: string): Promise<void> {
    const metadata = await this.getMetadata();
    const newMetadata = metadata.filter(m => m.id !== id);
    
    await del(id);
    await set(METADATA_KEY, newMetadata);
  }

  static async exportSave(id: string): Promise<void> {
    const state = await this.loadGame(id);
    if (!state) return;

    const metadata = (await this.getMetadata()).find(m => m.id === id);
    const fileName = `nba_commish_save_${metadata?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || id}.json`;
    
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async importSave(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const state = JSON.parse(e.target?.result as string) as GameState;
          if (!state.isDataLoaded || !state.commissionerName) {
            throw new Error('Invalid save file format');
          }
          
          // Clear saveId so it creates a new save instead of overwriting
          state.saveId = undefined;
          
          const saveName = `Imported Save - ${new Date().toLocaleDateString()}`;
          await this.saveGame(state, saveName);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}
