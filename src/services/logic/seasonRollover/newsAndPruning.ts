import { type GameState } from '../../../types';
import { type RetireeRecord, type FarewellRecord, type MortalityRecord } from '../../playerDevelopment/retirementChecker';
import { type HOFInduction, getHOFCeremonyDateString } from '../../playerDevelopment/hofChecker';
import { type JerseyRetirementRecord } from '../../playerDevelopment/jerseyRetirementChecker';
import { SettingsManager } from '../../SettingsManager';
import type { FamilyLineageEvent } from '../../playerFamilyLineage';
import { getLeagueCalendarDates } from '../../leagueCalendar';
import { toISODateString } from '../../../utils/dateUtils';
import { normalizeDate } from '../../../utils/helpers';
import { getLeagueLabels } from '../../../utils/leagueLabels';

type HistoryEntry = NonNullable<GameState['history']>[number];
type NewsItem = NonNullable<GameState['news']>[number];

export interface SeasonRolloverNewsArgs {
  state: GameState;
  currentYear: number;
  nextYear: number;
  newSalaryCap: number;
  inflationPctApplied: number;
  expiredCount: number;
  optionDateStr: string;
  playerOptionNews: string[];
  teamOptionNews: string[];
  newRetirees: RetireeRecord[];
  newFarewells: FarewellRecord[];
  newInductees: HOFInduction[];
  newJerseyRetirements: JerseyRetirementRecord[];
  deaths: MortalityRecord[];
  familyLineageEvents: FamilyLineageEvent[];
}

export interface SeasonRolloverNewsResult {
  pctStr: string;
  prunedBets: NonNullable<GameState['bets']>;
  prunedBoxScores: NonNullable<GameState['boxScores']>;
  rolloverNews: NewsItem | null;
  retirementNewsItems: NewsItem[];
  playerOptionNewsItems: NewsItem[];
  teamOptionNewsItems: NewsItem[];
  farewellNewsItems: NewsItem[];
  hofNewsItems: NewsItem[];
  jerseyRetirementNewsItems: NewsItem[];
  mortalityNewsItems: NewsItem[];
  familyLineageNewsItems: NewsItem[];
  teamOptionHistoryEntries: HistoryEntry[];
  retirementHistoryEntries: HistoryEntry[];
  farewellHistoryEntries: HistoryEntry[];
  hofHistoryEntries: HistoryEntry[];
  jerseyRetirementHistoryEntries: HistoryEntry[];
  mortalityHistoryEntries: HistoryEntry[];
  familyLineageHistoryEntries: HistoryEntry[];
}

export function buildSeasonRolloverNewsAndPruning({
  state,
  currentYear,
  nextYear,
  newSalaryCap,
  inflationPctApplied,
  expiredCount,
  optionDateStr,
  playerOptionNews,
  teamOptionNews,
  newRetirees,
  newFarewells,
  newInductees,
  newJerseyRetirements,
  deaths,
  familyLineageEvents,
}: SeasonRolloverNewsArgs): SeasonRolloverNewsResult {
  const isPba = state.leagueStats?.uiMode === 'pba_isolated';
  const isEuro = state.leagueStats?.uiMode === 'euro_isolated';
  const leagueName = getLeagueLabels(
    state.leagueType,
    state.leagueStats?.uiMode,
    state.leagueStats?.leagueName,
  ).leagueName;
  const capM = (newSalaryCap / 1_000_000).toFixed(1);
  const pctStr = inflationPctApplied >= 0
    ? `+${inflationPctApplied.toFixed(1)}%`
    : `${inflationPctApplied.toFixed(1)}%`;
  const rolloverNews = isPba || isEuro ? null : {
    id: `rollover-${nextYear}`,
    headline: `${nextYear} ${leagueName} Season Underway — Salary Cap Set at $${capM}M`,
    content: `The ${nextYear} ${leagueName} season is officially underway. The salary cap has been set at $${capM}M (${pctStr} from last season). ${expiredCount} players became free agents as their contracts expired.`,
    date: state.date,
    type: 'league',
    category: 'League News',
    isNew: true,
    read: false,
  } as unknown as NewsItem;

  const retirementNewsItems: NewsItem[] = [];

  const playerOptionNewsItems = playerOptionNews.map((text, idx) => ({
    id: `player-option-${currentYear}-${idx}-${Date.now()}`,
    headline: text.split(',')[0] ?? text,
    content: text,
    date: state.date,
    type: 'roster',
    isNew: true,
    read: false,
  }) as unknown as NewsItem);

  const teamOptionNewsItems = teamOptionNews.map((text, idx) => ({
    id: `team-option-${currentYear}-${idx}-${Date.now()}`,
    headline: text.split(',')[0] ?? text,
    content: text,
    date: state.date,
    type: 'roster',
    isNew: true,
    read: false,
  }) as unknown as NewsItem);

  const teamOptionHistoryEntries = teamOptionNews.map((text): HistoryEntry => {
    const player = state.players.find(candidate => text.includes(candidate.name));
    return {
      text,
      date: optionDateStr,
      type: 'Contract Option',
      ...(player ? { playerIds: [player.internalId], tid: player.tid } : {}),
    } as HistoryEntry;
  });

  const retirementHistoryEntries = newRetirees.map((retiree): HistoryEntry => {
    const pgStr = retiree.careerGP > 0
      ? ` ${(retiree.careerPts / retiree.careerGP).toFixed(1)} PPG / ${(retiree.careerReb / retiree.careerGP).toFixed(1)} RPG / ${(retiree.careerAst / retiree.careerGP).toFixed(1)} APG`
      : '';
    const accolades: string[] = [];
    if (retiree.allStarAppearances > 0) accolades.push(`${retiree.allStarAppearances}× All-Star`);
    if (retiree.championships > 0) accolades.push(`${retiree.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` (${accolades.join(', ')})` : '';
    return {
      text: `${retiree.name} has retired at age ${retiree.age}.${accoladeStr}${pgStr} over ${retiree.careerGP} career games.`,
      date: state.date,
      type: 'Retirement',
      playerIds: [retiree.playerId],
    } as HistoryEntry;
  });

  const farewellNewsItems = newFarewells.map((farewell, idx): NewsItem => {
    const accolades: string[] = [];
    if (farewell.allStarAppearances > 0) accolades.push(`${farewell.allStarAppearances}× All-Star`);
    if (farewell.championships > 0) accolades.push(`${farewell.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` (${accolades.join(', ')})` : '';
    return {
      id: `farewell-${farewell.playerId}-${Date.now()}-${idx}`,
      headline: farewell.isLegend ? `${farewell.name} Set for Farewell Tour Season` : `${farewell.name} May Be Playing Final Season`,
      content: `${farewell.name} (age ${farewell.age})${accoladeStr} is expected to retire at the end of the upcoming season. Sources close to the player say this will likely be his final year.`,
      date: state.date,
      type: farewell.isLegend ? 'player' : 'roster',
      isNew: true,
      read: false,
    } as unknown as NewsItem;
  });

  const farewellHistoryEntries = newFarewells.map((farewell): HistoryEntry => ({
    text: `${farewell.name} (age ${farewell.age}) is entering what is expected to be his final season.`,
    date: state.date,
    type: 'Retirement',
    playerIds: [farewell.playerId],
  } as HistoryEntry));

  const hofNewsItems = newInductees.flatMap((inductee, idx): NewsItem[] => {
    const ceremonyDate = getHOFCeremonyDateString(inductee.inductionYear);
    if (normalizeDate(state.date) !== ceremonyDate) return [];
    const accolades: string[] = [];
    if (inductee.mvps > 0) accolades.push(`${inductee.mvps}× MVP`);
    if (inductee.allStarAppearances > 0) accolades.push(`${inductee.allStarAppearances}× All-Star`);
    if (inductee.championships > 0) accolades.push(`${inductee.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` — ${accolades.join(', ')}` : '';
    const ballotStr = inductee.firstBallot ? ' (First-Ballot)' : '';
    const tierStr = inductee.firstBallot ? '' : ` (${inductee.tier === 'borderline' ? 'Borderline' : 'Multi-Ballot'})`;
    const hallLabel = inductee.league === 'PBA' ? 'PBA Hall of Fame' : 'Hall of Fame';
    const formalHallLabel = inductee.league === 'PBA' ? 'PBA Hall of Fame' : 'Naismith Memorial Basketball Hall of Fame';
    const careerLabel = inductee.league === 'PBA' ? `${inductee.careerWS.toFixed(0)} PBA games` : `${inductee.careerWS.toFixed(1)} Win Shares`;
    return [{
      id: `hof-${inductee.playerId}-${Date.now()}-${idx}`,
      headline: `${inductee.name} Inducted Into ${hallLabel}${ballotStr || tierStr}`,
      content: `${inductee.name} has been inducted into the ${formalHallLabel}${ballotStr || tierStr}. Career: ${careerLabel}${accoladeStr}.`,
      date: state.date,
      type: 'player',
      isNew: true,
      read: false,
    } as unknown as NewsItem];
  });

  const hofHistoryEntries = newInductees.flatMap((inductee): HistoryEntry[] => {
    const ceremonyDate = getHOFCeremonyDateString(inductee.inductionYear);
    if (normalizeDate(state.date) !== ceremonyDate) return [];
    const hallLabel = inductee.league === 'PBA' ? 'PBA Hall of Fame' : 'Hall of Fame';
    return [{
      text: `${inductee.name} inducted into the ${hallLabel} (Class of ${inductee.inductionYear})${inductee.firstBallot ? ' — First-Ballot' : inductee.tier === 'borderline' ? ' — Borderline' : ' — Multi-Ballot'}.`,
      date: state.date,
      type: 'Retirement',
      playerIds: [inductee.playerId],
    } as HistoryEntry];
  });

  const jerseyRetirementNewsItems = newJerseyRetirements.map((retirement, idx): NewsItem => {
    const accoladeBits: string[] = [];
    if (retirement.allStarAppearances > 0) accoladeBits.push(`${retirement.allStarAppearances}× All-Star`);
    if (retirement.championships > 0) accoladeBits.push(`${retirement.championships}× Champion`);
    const accoladeStr = accoladeBits.length > 0 ? ` The honor follows a franchise tenure that included ${accoladeBits.join(', ')}.` : '';
    return {
      id: `jersey-retire-${retirement.playerId}-${retirement.teamId}-${Date.now()}-${idx}`,
      headline: `${retirement.teamName} Retire #${retirement.number} for ${retirement.name}`,
      content: `${retirement.teamName} have retired #${retirement.number} in honor of ${retirement.name}, recognizing ${retirement.seasonsWithTeam} seasons and ${retirement.gamesWithTeam} games with the franchise.${accoladeStr}`,
      date: state.date,
      type: 'transaction',
      category: 'Transaction',
      isNew: true,
      read: false,
    } as unknown as NewsItem;
  });

  const jerseyRetirementHistoryEntries = newJerseyRetirements.map((retirement): HistoryEntry => ({
    text: `${retirement.teamName} retired #${retirement.number} in honor of ${retirement.name}.`,
    date: state.date,
    type: 'Jersey Retirement',
    playerIds: [retirement.playerId],
  } as HistoryEntry));

  const mortalityNewsItems = deaths.map((death, idx) => ({
    id: `death-${death.playerId}-${Date.now()}-${idx}`,
    headline: `Former NBA Player ${death.name} Passes Away at Age ${death.age}`,
    content: `${death.name}, who played in the NBA, passed away at the age of ${death.age}.`,
    date: state.date,
    type: 'player',
    isNew: true,
    read: false,
  }) as unknown as NewsItem);

  const mortalityHistoryEntries = deaths.map((death): HistoryEntry => ({
    text: `${death.name} died at age ${death.age}.`,
    date: state.date,
    type: 'Retirement',
    playerIds: [death.playerId],
  } as HistoryEntry));

  const draftLabel = isPba
    ? 'PBA Draft'
    : state.leagueType === 'fictional' ? 'league draft' : 'NBA Draft';
  const familyLineageNewsItems = familyLineageEvents.map((event): NewsItem => {
    const headline = event.kind === 'twins'
      ? `${event.playerNames[0]} and ${event.playerNames[1]} Enter the ${draftLabel}`
      : event.kind === 'parent_child'
        ? `${event.prospectName} Continues ${event.relativeName}'s Basketball Legacy`
        : `${event.prospectName} Follows ${event.relativeName} Into Pro Basketball`;
    const content = event.kind === 'twins'
      ? `Twins ${event.playerNames[0]} and ${event.playerNames[1]} are eligible for the ${event.introducedYear} ${draftLabel}. Their careers will begin as separate prospects, even as their family story follows them into the league.`
      : event.kind === 'parent_child'
        ? `${event.prospectName}, the child of ${event.relativeName}, is eligible for the ${event.introducedYear} ${draftLabel}.`
        : `${event.prospectName}, the ${event.relationLabel} of ${event.relativeName}, is eligible for the ${event.introducedYear} ${draftLabel}.`;
    return {
      id: `${event.id}-${event.introducedYear}`,
      headline,
      content,
      date: state.date,
      type: 'player',
      isNew: true,
      read: false,
    } as unknown as NewsItem;
  });
  const familyLineageHistoryEntries = familyLineageEvents.map((event): HistoryEntry => ({
    text: event.kind === 'twins'
      ? `Twins ${event.playerNames[0]} and ${event.playerNames[1]} entered the ${event.introducedYear} draft class.`
      : `${event.prospectName}, the ${event.relationLabel} of ${event.relativeName}, entered the ${event.introducedYear} draft class.`,
    date: state.date,
    type: 'Family',
    playerIds: event.playerIds,
  } as HistoryEntry));

  const cutoffDate = toISODateString(getLeagueCalendarDates(currentYear, state.leagueStats).regularSeasonStart);
  const prunedBets = (state.bets ?? []).filter(bet => bet.status === 'pending' || bet.date >= cutoffDate);

  const maxBoxScoreYears = SettingsManager.getSettings().maxBoxScoreYears ?? 2;
  const boxScoreCutoffYear = currentYear - maxBoxScoreYears;
  const prunedBoxScores = (state.boxScores ?? []).filter(game => {
    if (game.homeTeamId < 0 || game.awayTeamId < 0) return false;
    const parts = game.date?.split(',');
    const year = parts ? parseInt(parts[parts.length - 1]?.trim() ?? '0', 10) : 0;
    return year > boxScoreCutoffYear;
  });

  return {
    pctStr,
    prunedBets,
    prunedBoxScores,
    rolloverNews,
    retirementNewsItems,
    playerOptionNewsItems,
    teamOptionNewsItems,
    farewellNewsItems,
    hofNewsItems,
    jerseyRetirementNewsItems,
    mortalityNewsItems,
    familyLineageNewsItems,
    teamOptionHistoryEntries,
    retirementHistoryEntries,
    farewellHistoryEntries,
    hofHistoryEntries,
    jerseyRetirementHistoryEntries,
    mortalityHistoryEntries,
    familyLineageHistoryEntries,
  };
}
