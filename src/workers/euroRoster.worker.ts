import type { EuroBasketballSourceDescriptor } from '../data/euroBasketballSources';
import {
  buildEuroBasketballRosterFromSource,
  loadEuroRosterCompetitionHistory,
  type EuroleagueBbgmFile,
} from '../services/euroleagueRosterFetcher';
import { readJsonResponse } from '../services/utils/jsonResponse';

type RosterRequest = {
  id: number;
  source: EuroBasketballSourceDescriptor;
  season: number;
};

self.onmessage = async (event: MessageEvent<RosterRequest>) => {
  const { id, source, season } = event.data;
  try {
    const response = await fetch(source.rosterUrl);
    const data = await readJsonResponse<EuroleagueBbgmFile>(
      response,
      `${source.displayName} ${season} roster`,
    );
    const history = await loadEuroRosterCompetitionHistory(source);
    const roster = buildEuroBasketballRosterFromSource(data, source, season, history);
    self.postMessage({ id, kind: 'result', roster });
  } catch (error) {
    self.postMessage({
      id,
      kind: 'error',
      message: error instanceof Error ? error.message : 'The roster source could not be prepared.',
    });
  }
};

export {};
