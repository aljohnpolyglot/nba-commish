import { seasonLabelToEndYear } from '../utils/historicalTimeline';
import type {
  CompetitionAllLeagueTeam,
  CompetitionHistoryAward,
  CompetitionSeason,
} from './euroleagueHistoryFetcher';
import { competitionAwardTypeFamily } from './competitionAwardTypes';

type ExternalRow = Record<string, any>;

const DISPLAY_NAMES: Record<string, string> = {
  endesa: 'Liga ACB · Endesa',
  'french-jeep-elite': 'Betclic Élite',
  'greek-heba-a1': 'Greek Basket League',
  'german-bbl': 'Basketball Bundesliga',
  'lithuanian-lkl': 'Lietuvos Krepšinio Lyga',
  'israeli-bsl': 'Israeli Basketball Premier League',
  'italian-serie-a': 'Lega Basket Serie A',
  'turkish-bsl': 'Basketbol Süper Ligi',
  'vtb-united-league': 'VTB United League',
  'adriatic-league': 'ABA League',
  'copa-del-rey': 'Copa del Rey',
  supercopa: 'Supercopa Endesa',
  'france-leaders-cup': 'Leaders Cup',
  'coppa-italia': 'Coppa Italia',
  'supercoppa-italiana': 'Supercoppa Italiana',
  'greek-super-cup': 'Greek Super Cup',
  'turkish-cup': 'Türkiye Kupası',
  'presidential-cup': "President's Cup",
  'king-mindaugas-cup': 'King Mindaugas Cup',
  'vtb-supercup': 'VTB SuperCup',
  'aba-supercup': 'ABA League Supercup',
};

const CUP_DATA_KEYS: Record<string, string> = {
  'copa-del-rey': 'copa_del_rey_spain',
  supercopa: 'supercopa_acb',
  'france-leaders-cup': 'leaders_cup_france',
  'coppa-italia': 'coppa_italia',
  'supercoppa-italiana': 'supercoppa_italiana',
  'greek-super-cup': 'greek_super_cup',
  'turkish-cup': 'turkish_cup',
  'presidential-cup': 'turkish_presidential_cup',
  'king-mindaugas-cup': 'lithuanian_cup_kmt',
  'vtb-supercup': 'vtb_united_league_supercup',
  'aba-supercup': 'aba_league_supercup',
};

export function competitionHistoryDisplayName(competitionId: string): string {
  return DISPLAY_NAMES[competitionId] ?? competitionId;
}

const asRows = (value: unknown): ExternalRow[] => Array.isArray(value) ? value : [];
const cleanText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function peopleFrom(row: ExternalRow, arrayKeys: string[], singleKeys: string[]): ExternalRow[] {
  for (const key of arrayKeys) {
    const rows = asRows(row[key]);
    if (rows.length > 0) return rows;
  }
  for (const key of singleKeys) {
    const name = cleanText(row[key]);
    if (name) return [{ ...row, name }];
  }
  return [];
}

function personName(person: ExternalRow): string {
  if (typeof (person as unknown) === 'string') return cleanText(person as unknown);
  return cleanText(person.player ?? person.name ?? person.coach);
}

function personTeam(person: ExternalRow): string | undefined {
  if (typeof (person as unknown) === 'string') return undefined;
  return cleanText(person.team ?? person.club) || undefined;
}

function sourceSeason(rows: Map<number, CompetitionSeason>, rawSeason: unknown, competitionId: string): CompetitionSeason | null {
  const season = cleanText(rawSeason);
  const endYear = seasonLabelToEndYear(season);
  if (endYear === undefined) return null;
  const existing = rows.get(endYear);
  if (existing) return existing;
  const created: CompetitionSeason = {
    Season: season,
    League: competitionHistoryDisplayName(competitionId),
    Awards: [],
    All_League_Teams: [],
  };
  rows.set(endYear, created);
  return created;
}

const awardScalarKey = (type: string): keyof CompetitionSeason | null => {
  switch (type) {
    case 'MVP': return 'Season_MVP';
    case 'Regular Season MVP': return 'Regular_Season_MVP';
    case 'Finals MVP': return 'Finals_MVP';
    case 'Final Four MVP': return 'Final_Four_MVP';
    case 'Playoffs MVP': return 'Playoffs_MVP';
    case 'Top Scorer': return 'Top_scorer';
    case 'Defensive Player of the Year': return 'Best_Defender';
    case 'Sixth Man of the Year': return 'Best_Sixth_Man';
    case 'Most Improved Player': return 'Most_Improved_Player';
    case 'Best Young Player': return 'Best_Young_Player';
    case 'Best Coach': return 'Best_Coach';
    case 'Coach of the Year': return 'Coach_of_the_Year';
    case 'Most Spectacular Player': return 'Most_Spectacular_Player';
    case 'Most Popular Player': return 'Most_Popular_Player';
    case 'Best Offensive Player': return 'Best_Offensive_Player';
    case 'Most Effective International Player': return 'Most_Effective_Player';
    default: return null;
  }
};

function addAward(
  season: CompetitionSeason,
  type: string,
  person: ExternalRow,
  role: 'player' | 'coach' | 'executive' = 'player',
  statLine?: string,
  sourceKey?: string,
): void {
  const name = personName(person);
  if (!name) return;
  const team = personTeam(person);
  const award: CompetitionHistoryAward = {
    type,
    name,
    team,
    nationality: cleanText(person.nationality) || undefined,
    role,
    statLine,
    sourceKey,
  };
  const duplicate = season.Awards?.some(entry =>
    entry.type === award.type && entry.name === award.name && entry.team === award.team,
  );
  if (!duplicate) season.Awards?.push(award);
  const scalarKey = awardScalarKey(type);
  if (scalarKey && !season[scalarKey]) {
    (season as unknown as Record<string, unknown>)[scalarKey] = team ? `${name} (${team})` : name;
  }
}

const numberWithCommaDecimal = (value: unknown): number => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

function addAwardRows(
  seasons: Map<number, CompetitionSeason>,
  competitionId: string,
  rows: ExternalRow[],
  type: string,
  arrayKeys: string[],
  singleKeys: string[],
  role: 'player' | 'coach' | 'executive' = 'player',
  statLine?: (person: ExternalRow) => string | undefined,
): void {
  for (const row of rows) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    for (const person of peopleFrom(row, arrayKeys, singleKeys)) {
      addAward(
        season,
        cleanText(person.award_type ?? row.award_type) || type,
        person,
        role,
        statLine?.(person),
        arrayKeys[0] ?? singleKeys[0],
      );
    }
  }
}

function addChampions(
  seasons: Map<number, CompetitionSeason>,
  competitionId: string,
  rows: ExternalRow[],
): void {
  for (const row of rows) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    season.Champions = cleanText(row.champion ?? row.winner) || undefined;
    season.Runnersup = cleanText(row.runner_up ?? row.runnerUp) || undefined;
    season.Third_place = cleanText(row.third) || undefined;
    season.Fourth_place = cleanText(row.fourth) || undefined;
    season.Note = cleanText(row.note) || undefined;
  }
}

function addAllLeagueTeams(
  seasons: Map<number, CompetitionSeason>,
  competitionId: string,
  rows: ExternalRow[],
  groupsFor: (row: ExternalRow) => Array<{ name: string; players: ExternalRow[] }>,
): void {
  for (const row of rows) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    const groups: CompetitionAllLeagueTeam[] = groupsFor(row).map(group => ({
      name: group.name,
      players: group.players
        .map(player => ({
          name: personName(player),
          team: personTeam(player),
          nationality: cleanText(player.nationality) || undefined,
        }))
        .filter(player => !!player.name),
    }));
    season.All_League_Teams = groups.filter(group => group.players.length > 0);
    for (const group of groupsFor(row)) {
      for (const player of group.players) {
        if (player.is_mvp !== true) continue;
        const name = personName(player);
        const hasMvp = season.Awards?.some(award =>
          personName({ name: award.name }) === name
          && competitionAwardTypeFamily(competitionId, award.type) === 'season mvp',
        );
        if (!hasMvp) addAward(season, 'MVP', player);
      }
    }
  }
}

function normalizeEndesa(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'endesa';
  const seasons = new Map<number, CompetitionSeason>();
  addChampions(seasons, competitionId, asRows(raw.champions));
  addAwardRows(seasons, competitionId, asRows(raw.acb_finals_mvp), 'Finals MVP', [], ['player']);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.top_scorers),
    'Top Scorer',
    ['recipients'],
    ['player'],
    'player',
    person => Number.isFinite(Number(person.scoring_average)) ? `${Number(person.scoring_average).toFixed(1)} PPG` : undefined,
  );
  addAllLeagueTeams(seasons, competitionId, asRows(raw.all_liga_acb_teams), row => [
    { name: 'First Team', players: asRows(row.first_team) },
    { name: 'Second Team', players: asRows(row.second_team) },
  ]);
  addAwardRows(seasons, competitionId, asRows(raw.acb_most_spectacular_player), 'Most Spectacular Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_young_player), 'Best Young Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.acb_best_coach), 'Best Coach', [], ['coach'], 'coach');
  addAwardRows(seasons, competitionId, asRows(raw.aeeb_coach_of_the_year), 'Coach of the Year', ['coaches'], ['coach'], 'coach');
  return [...seasons.values()];
}

function normalizeFrance(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'french-jeep-elite';
  const seasons = new Map<number, CompetitionSeason>();
  addChampions(seasons, competitionId, asRows(raw.champions));
  addAwardRows(seasons, competitionId, asRows(raw.mvp_winners), 'MVP', ['recipients'], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.finals_mvp), 'Finals MVP', ['recipients'], ['player']);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.top_scorers),
    'Top Scorer',
    ['recipients'],
    ['player'],
    'player',
    person => Number.isFinite(Number(person.points_per_game)) ? `${Number(person.points_per_game).toFixed(1)} PPG` : undefined,
  );
  addAwardRows(seasons, competitionId, asRows(raw.best_sixth_man), 'Sixth Man of the Year', ['recipients'], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_defender), 'Defensive Player of the Year', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.most_improved_player), 'Most Improved Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_young_player), 'Best Young Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_coach), 'Best Coach', ['coaches'], ['coach'], 'coach');
  return [...seasons.values()];
}

function normalizeGreece(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'greek-heba-a1';
  const seasons = new Map<number, CompetitionSeason>();
  addChampions(seasons, competitionId, asRows(raw.champions));
  addAwardRows(seasons, competitionId, asRows(raw.mvp_winners), 'MVP', ['winners'], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.finals_mvp), 'Finals MVP', ['winners'], ['player']);
  addAllLeagueTeams(seasons, competitionId, asRows(raw.all_greek_league_teams), row => [
    { name: 'All-Greek League Team', players: asRows(row.players) },
  ]);
  addAwardRows(seasons, competitionId, asRows(raw.most_spectacular_player), 'Most Spectacular Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.defensive_player_of_the_year), 'Defensive Player of the Year', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.most_improved_player), 'Most Improved Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_young_player), 'Best Young Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.most_popular_player), 'Most Popular Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_coach), 'Best Coach', [], ['coach'], 'coach');
  return [...seasons.values()];
}

function normalizeGermany(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'german-bbl';
  const seasons = new Map<number, CompetitionSeason>();
  const championships = raw.championships && typeof raw.championships === 'object'
    ? raw.championships as ExternalRow
    : {};
  const titleRows = [
    ...asRows(championships.pre_bundesliga),
    ...asRows(championships.bundesliga),
  ];
  addChampions(seasons, competitionId, titleRows);
  for (const row of asRows(championships.bundesliga)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    const coach = cleanText(row.coach);
    if (coach) addAward(season, 'Championship Coach', {
      name: coach,
      team: row.champion,
      nationality: row.coach_nationality,
    }, 'coach');
  }
  addAwardRows(seasons, competitionId, asRows(raw.mvp_winners), 'MVP', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.finals_mvp), 'Finals MVP', [], ['player']);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.top_scorers),
    'Top Scorer',
    [],
    ['player'],
    'player',
    person => {
      const value = Number(person.value);
      if (!Number.isFinite(value)) return undefined;
      return person.metric === 'points_per_game' ? `${value.toFixed(1)} PPG` : `${value} points`;
    },
  );
  addAllLeagueTeams(seasons, competitionId, asRows(raw.all_bbl_teams), row => [
    { name: 'First Team', players: asRows(row.first_team) },
    { name: 'Second Team', players: asRows(row.second_team) },
  ]);
  addAwardRows(seasons, competitionId, asRows(raw.best_offensive_player), 'Best Offensive Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_defender), 'Defensive Player of the Year', ['winners'], ['player']);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.most_effective_player_international),
    'Most Effective International Player',
    [],
    ['player'],
    'player',
    person => Number.isFinite(Number(person.efficiency)) ? `${Number(person.efficiency).toFixed(1)} efficiency` : undefined,
  );
  addAwardRows(seasons, competitionId, asRows(raw.most_improved_player), 'Most Improved Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.best_german_young_player), 'Best Young Player', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.coach_of_the_year), 'Coach of the Year', [], ['coach'], 'coach');
  return [...seasons.values()];
}

function normalizeLithuania(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'lithuanian-lkl';
  const seasons = new Map<number, CompetitionSeason>();
  const championshipEras = raw.historical_lithuanian_champions && typeof raw.historical_lithuanian_champions === 'object'
    ? raw.historical_lithuanian_champions as ExternalRow
    : {};
  addChampions(
    seasons,
    competitionId,
    Object.values(championshipEras).flatMap(value => asRows(value)),
  );
  for (const row of asRows(raw.lkl_finals_series_results)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    season.Champions = season.Champions ?? (cleanText(row.champion) || undefined);
    season.Runnersup = cleanText(row.runner_up) || undefined;
    season.Note = cleanText(row.result) || season.Note;
  }
  addAwardRows(seasons, competitionId, asRows(raw.lkl_season_mvp), 'MVP', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.lkl_finals_mvp), 'Finals MVP', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.lkl_coach_of_the_year), 'Coach of the Year', [], ['coach'], 'coach');
  return [...seasons.values()];
}

function normalizeItaly(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'italian-serie-a';
  const seasons = new Map<number, CompetitionSeason>();
  const detailedFinalsMvpSeasons = new Set(
    asRows(raw.lba_finals_mvp)
      .filter(row => !!cleanText(row.winner ?? row.player))
      .map(row => cleanText(row.season)),
  );
  for (const row of asRows(raw.italian_championship_finals)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    season.Champions = cleanText(row.champion) || undefined;
    season.Runnersup = cleanText(row.runner_up) || undefined;
    season.Note = [
      cleanText(row.score),
      row.won_italian_supercup === true
        ? 'League, Italian Cup and Supercup winner'
        : row.won_italian_cup === true
          ? 'League and Italian Cup winner'
          : '',
      cleanText(row.note),
    ].filter(Boolean).join(' · ') || undefined;
    const champion = cleanText(row.champion);
    const coach = cleanText(row.coach);
    if (coach) {
      addAward(season, 'Championship Coach', {
        name: coach,
        team: champion,
        nationality: row.coach_nationality,
      }, 'coach');
    }
    const finalsMvp = cleanText(row.finals_mvp);
    if (finalsMvp && !detailedFinalsMvpSeasons.has(cleanText(row.season))) {
      addAward(season, 'Finals MVP', {
        name: finalsMvp,
        team: champion,
        nationality: row.finals_mvp_nationality,
      });
    }
  }
  addAwardRows(seasons, competitionId, asRows(raw.lba_mvp), 'MVP', [], ['winner', 'player']);
  addAwardRows(seasons, competitionId, asRows(raw.lba_finals_mvp), 'Finals MVP', [], ['winner', 'player']);
  addAwardRows(seasons, competitionId, asRows(raw.lba_best_player_under_22), 'Best Young Player', [], ['winner', 'player']);
  addAwardRows(seasons, competitionId, asRows(raw.lba_best_coach), 'Coach of the Year', [], ['winner', 'coach'], 'coach');
  addAwardRows(seasons, competitionId, asRows(raw.lba_best_executive), 'Best Executive', [], ['winner'], 'executive');
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.lba_top_scorers),
    'Top Scorer',
    [],
    ['player', 'winner'],
    'player',
    person => {
      const value = Number(person.value);
      if (!Number.isFinite(value)) return undefined;
      return person.metric === 'points_per_game' ? `${value.toFixed(1)} PPG` : `${value} points`;
    },
  );
  return [...seasons.values()];
}

function normalizeEuroCup(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'eurocup';
  const seasons = new Map<number, CompetitionSeason>();
  for (const row of asRows(raw.eurocup_finals_results)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    season.Champions = cleanText(row.winner) || undefined;
    season.Runnersup = cleanText(row.runner_up) || undefined;
    season.Semifinalists = Array.isArray(row.semifinalists)
      ? row.semifinalists.map(cleanText).filter(Boolean).join(', ') || undefined
      : undefined;
    season.Note = cleanText(row.score) || undefined;
  }
  addAwardRows(seasons, competitionId, asRows(raw.eurocup_mvp), 'MVP', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.eurocup_finals_mvp), 'Finals MVP', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.eurocup_rising_star), 'Rising Star', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.eurocup_coach_of_the_year), 'Coach of the Year', [], ['coach'], 'coach');
  addAllLeagueTeams(seasons, competitionId, asRows(raw.all_eurocup_teams), row => [
    { name: 'First Team', players: asRows(row.first_team) },
    { name: 'Second Team', players: asRows(row.second_team) },
  ]);
  for (const row of asRows(raw.eurocup_top_scorers)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    const ppg = Number(row.ppg);
    addAward(season, 'Top Scorer', row, 'player', Number.isFinite(ppg) ? `${ppg.toFixed(1)} PPG` : undefined);
  }
  return [...seasons.values()];
}

function normalizeTurkey(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'turkish-bsl';
  const seasons = new Map<number, CompetitionSeason>();
  const championshipEras = raw.turkish_champions && typeof raw.turkish_champions === 'object'
    ? raw.turkish_champions as ExternalRow
    : {};
  addChampions(seasons, competitionId, Object.values(championshipEras).flatMap(value => asRows(value)));
  addAwardRows(seasons, competitionId, asRows(raw.bsl_mvp), 'MVP', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.bsl_finals_mvp), 'Finals MVP', [], ['player']);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.turkish_scoring_leaders),
    'Top Scorer',
    [],
    ['player'],
    'player',
    person => Number.isFinite(Number(person.value))
      ? person.metric === 'points_per_game' ? `${Number(person.value).toFixed(1)} PPG` : `${Number(person.value)} points`
      : undefined,
  );
  for (const row of asRows(raw.bsl_assist_leaders)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    const statLine = Number.isFinite(Number(row.value)) ? `${Number(row.value).toFixed(1)} APG` : undefined;
    addAward(season, 'Assist Leader', row, 'player', statLine);
    const name = personName(row);
    if (name) season.Assists = personTeam(row) ? `${name} (${personTeam(row)})` : name;
  }
  return [...seasons.values()];
}

function normalizeVtb(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'vtb-united-league';
  const seasons = new Map<number, CompetitionSeason>();
  for (const row of asRows(raw.vtb_united_league_finals)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    season.Champions = cleanText(row.gold) || undefined;
    season.Runnersup = cleanText(row.silver) || undefined;
    season.Third_place = cleanText(row.bronze) || undefined;
    season.Fourth_place = cleanText(row.fourth_place) || undefined;
    season.Note = [cleanText(row.score), cleanText(row.format), cleanText(row.hosts)].filter(Boolean).join(' · ') || undefined;
  }
  addAwardRows(seasons, competitionId, asRows(raw.vtb_mvp), 'MVP', [], ['player']);
  for (const row of asRows(raw.vtb_playoffs_mvp)) {
    const label = /final four/i.test(cleanText(row.format)) ? 'Final Four MVP' : 'Playoffs MVP';
    addAwardRows(seasons, competitionId, [row], label, [], ['player']);
  }
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.vtb_scoring_leaders),
    'Top Scorer',
    [],
    ['player'],
    'player',
    person => numberWithCommaDecimal(person.ppg) > 0 ? `${numberWithCommaDecimal(person.ppg).toFixed(1)} PPG` : undefined,
  );
  addAwardRows(seasons, competitionId, asRows(raw.vtb_defensive_player_of_the_year), 'Defensive Player of the Year', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.vtb_sixth_man_of_the_year), 'Sixth Man of the Year', [], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.vtb_young_player_of_the_year), 'Best Young Player', ['recipients'], ['player']);
  addAwardRows(seasons, competitionId, asRows(raw.vtb_coach_of_the_year), 'Coach of the Year', [], ['coach'], 'coach');
  return [...seasons.values()].filter(season => !!season.Champions);
}

function normalizeAdriatic(raw: ExternalRow): CompetitionSeason[] {
  const competitionId = 'adriatic-league';
  const seasons = new Map<number, CompetitionSeason>();
  addChampions(seasons, competitionId, asRows(raw.aba_league_finals_results));
  for (const row of asRows(raw.aba_league_finals_results)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (!season) continue;
    const semifinalists = asRows(row.semifinalists)
      .map(entry => typeof (entry as unknown) === 'string' ? cleanText(entry as unknown) : cleanText(entry.team ?? entry.name ?? entry.club))
      .filter(Boolean);
    season.Semifinalists = semifinalists.join(', ') || undefined;
    season.Note = cleanText(row.score) || undefined;
  }
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.aba_league_regular_season_mvp),
    'Regular Season MVP',
    [],
    ['player'],
    'player',
    person => numberWithCommaDecimal(person.pir) > 0 ? `${numberWithCommaDecimal(person.pir).toFixed(1)} PIR` : undefined,
  );
  addAwardRows(seasons, competitionId, asRows(raw.aba_league_finals_mvp), 'Finals MVP', ['winners'], ['player']);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.aba_league_top_scorers),
    'Top Scorer',
    [],
    ['player'],
    'player',
    person => numberWithCommaDecimal(person.ppg) > 0 ? `${numberWithCommaDecimal(person.ppg).toFixed(1)} PPG` : undefined,
  );
  addAwardRows(seasons, competitionId, asRows(raw.aba_league_coach_of_the_season), 'Coach of the Year', ['coaches'], ['coach'], 'coach');
  addAllLeagueTeams(seasons, competitionId, asRows(raw.aba_league_ideal_starting_five), row => [
    { name: 'Ideal Starting Five', players: asRows(row.players) },
  ]);
  addAwardRows(
    seasons,
    competitionId,
    asRows(raw.aba_league_top_prospect).map(row => ({ ...row, season: row.season ?? row.year })),
    'Best Young Player',
    [],
    ['winner', 'player'],
  );
  for (const row of asRows(raw.aba_league_winning_coaches)) {
    const season = sourceSeason(seasons, row.season, competitionId);
    if (season) addAward(season, 'Championship Coach', row, 'coach');
  }
  return [...seasons.values()].filter(season => !!season.Champions);
}

export function hasEuropeanCupHistorySource(competitionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CUP_DATA_KEYS, competitionId);
}

export function normalizeEuropeanCupHistory(competitionId: string, raw: unknown): CompetitionSeason[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${DISPLAY_NAMES[competitionId] ?? competitionId} history is not an object.`);
  }
  const rows = new Map<number, CompetitionSeason>();
  const key = CUP_DATA_KEYS[competitionId];
  const source = raw as ExternalRow;
  const sourceRows = competitionId === 'vtb-supercup'
    ? asRows(source.vtb_supercup_finals)
    : asRows(source[key]);
  const superCupIds = new Set(['supercopa', 'supercoppa-italiana', 'greek-super-cup', 'presidential-cup', 'vtb-supercup', 'aba-supercup']);
  const seasonValue = (value: unknown) => {
    const text = cleanText(value);
    if (!superCupIds.has(competitionId) || !/^\d{4}$/.test(text)) return value;
    const year = Number(text);
    return `${year}–${String(year + 1).slice(-2)}`;
  };
  for (const row of sourceRows) {
    const season = sourceSeason(rows, seasonValue(row.season ?? row.year), competitionId);
    if (!season) continue;
    season.Champions = cleanText(row.winner ?? row.champion ?? row.gold) || undefined;
    season.Runnersup = cleanText(row.runners_up ?? row.runner_up ?? row.silver) || undefined;
    season.Third_place = cleanText(row.third_place ?? row.bronze) || undefined;
    season.Fourth_place = cleanText(row.fourth_place) || undefined;
    season.Note = [
      cleanText(row.score),
      cleanText(row.venue ?? row.arena),
      cleanText(row.location ?? row.city ?? row.host ?? row.hosts),
      cleanText(row.note),
    ].filter(Boolean).join(' · ') || undefined;

    const featured = row.top_scorer_or_mvp;
    if (featured && typeof featured === 'object') {
      addAward(
        season,
        String(featured.type ?? '').toLowerCase().includes('scorer') ? 'Top Scorer' : 'MVP',
        featured as ExternalRow,
      );
    }
    const mvp = cleanText(row.mvp);
    if (mvp) addAward(season, 'MVP', { name: mvp });
    const topScorer = cleanText(row.top_scorer);
    if (topScorer) addAward(season, 'Top Scorer', { name: topScorer });
  }
  if (competitionId === 'vtb-supercup') {
    addAwardRows(rows, competitionId, asRows(source.vtb_supercup_mvp), 'MVP', [], ['player']);
  }
  return [...rows.values()].sort((left, right) =>
    (seasonLabelToEndYear(right.Season) ?? 0) - (seasonLabelToEndYear(left.Season) ?? 0),
  );
}

export function normalizeDomesticCompetitionHistory(competitionId: string, raw: unknown): CompetitionSeason[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${DISPLAY_NAMES[competitionId] ?? competitionId} history is not an object.`);
  }
  const source = raw as ExternalRow;
  const rows = competitionId === 'eurocup'
    ? normalizeEuroCup(source)
    : competitionId === 'endesa'
    ? normalizeEndesa(source)
    : competitionId === 'french-jeep-elite'
      ? normalizeFrance(source)
      : competitionId === 'italian-serie-a'
        ? normalizeItaly(source)
        : competitionId === 'turkish-bsl'
          ? normalizeTurkey(source)
          : competitionId === 'greek-heba-a1'
            ? normalizeGreece(source)
            : competitionId === 'lithuanian-lkl'
              ? normalizeLithuania(source)
              : competitionId === 'vtb-united-league'
                ? normalizeVtb(source)
              : competitionId === 'adriatic-league'
                ? normalizeAdriatic(source)
              : normalizeGermany(source);
  return rows.sort((left, right) =>
    (seasonLabelToEndYear(right.Season) ?? 0) - (seasonLabelToEndYear(left.Season) ?? 0),
  );
}
