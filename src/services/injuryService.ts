import type { InjuryDefinition } from '../types';

// Your new, clean JSON endpoint for injuries
const INJURY_DATA_URL = 'https://api.npoint.io/6c949491f7d664218c8e';

export const getInjuryData = async (): Promise<InjuryDefinition[]> => {
    try {
        const response = await fetch(INJURY_DATA_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // No more complex parsing needed! Just get the JSON.
        const injuries: InjuryDefinition[] = await response.json();
        return injuries;

    } catch (error) {
        console.error('Failed to fetch injury data:', error);
        
        // Fallback to a minimal list of injuries if fetching fails
        return [
            { name: "Sprained Ankle", frequency: 1808, games: 3.46 },
            { name: "Patellar Tendinitis", frequency: 1493, games: 6.95 },
            { name: "Back Spasms", frequency: 999, games: 3.94 },
            { name: "Torn ACL", frequency: 40, games: 100 },
        ];
    }
};

export const getRandomInjury = (injuries: InjuryDefinition[]): InjuryDefinition => {
  const totalFreq = injuries.reduce((sum, i) => sum + i.frequency, 0);
  let rand = Math.random() * totalFreq;
  for (const injury of injuries) {
    if (rand < injury.frequency) return injury;
    rand -= injury.frequency;
  }
  return injuries[0];
};
