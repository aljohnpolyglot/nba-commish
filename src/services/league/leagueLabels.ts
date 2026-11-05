import { getLeagueLabels } from '../../utils/leagueLabels';

export type LeagueNeutralLabels = {
  draft: string;
  allLeague: string;
  champion: string;
};

export function getLeagueNeutralLabels(leagueType?: 'fictional' | 'modded', uiMode?: string, leagueName?: string): LeagueNeutralLabels {
  const labels = getLeagueLabels(leagueType, uiMode, leagueName);
  const nba = leagueType === 'modded' && (uiMode == null || uiMode === 'nba');
  return {
    draft: nba ? 'NBA Draft' : labels.draft === 'NBA Draft' ? 'Draft' : labels.draft,
    allLeague: nba ? 'All-NBA' : 'All-League',
    champion: nba ? 'NBA Champion' : 'League Champion',
  };
}

