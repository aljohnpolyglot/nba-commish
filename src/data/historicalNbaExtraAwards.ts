import type { HistoricalAward, NBAPlayer } from '../types';
import { getHistoricalContestAwardsForPlayer } from './allStarContestWinners';

type WinnerRow = {
  season: number;
  name: string;
  tid: number;
  type: string;
  source: string;
};

const rows = (type: string, source: string, values: Array<[number, string, number]>): WinnerRow[] =>
  values.map(([season, name, tid]) => ({ season, name, tid, type, source }));

const WINNERS: WinnerRow[] = [
  ...rows('IBM Award', 'historical-nba-legacy-awards', [
    [1984, 'Magic Johnson', 13], [1985, 'Michael Jordan', 4], [1986, 'Charles Barkley', 22],
    [1987, 'Charles Barkley', 22], [1988, 'Charles Barkley', 22], [1989, 'Michael Jordan', 4],
    [1990, 'David Robinson', 25], [1991, 'David Robinson', 25], [1992, 'Dennis Rodman', 8],
    [1993, 'Hakeem Olajuwon', 10], [1994, 'David Robinson', 25], [1995, 'David Robinson', 25],
    [1996, 'David Robinson', 25], [1997, 'Grant Hill', 8], [1998, 'Karl Malone', 28],
    [1999, 'Dikembe Mutombo', 0], [2000, "Shaquille O'Neal", 13], [2001, "Shaquille O'Neal", 13],
    [2002, 'Tim Duncan', 25],
  ]),
  ...rows('Comeback Player of the Year', 'historical-nba-legacy-awards', [
    [1981, 'Bernard King', 9], [1982, 'Gus Williams', 20], [1983, 'Paul Westphal', 19],
    [1984, 'Adrian Dantley', 28], [1985, 'Micheal Ray Richardson', 2], [1986, 'Marques Johnson', 12],
  ]),
  ...rows('Sportsmanship Award', 'nbaextraawards', [
    [1996, 'Joe Dumars', 8], [1997, 'Terrell Brandon', 5], [1998, 'Avery Johnson', 25],
    [1999, 'Hersey Hawkins', 20], [2000, 'Eric Snow', 22], [2001, 'David Robinson', 25],
    [2002, 'Steve Smith', 25], [2003, 'Ray Allen', 20], [2004, 'P. J. Brown', 18],
    [2005, 'Grant Hill', 21], [2006, 'Elton Brand', 12], [2007, 'Luol Deng', 4],
    [2008, 'Grant Hill', 23], [2009, 'Chauncey Billups', 7], [2010, 'Grant Hill', 23],
    [2011, 'Stephen Curry', 9], [2012, 'Jason Kidd', 6], [2013, 'Jason Kidd', 19],
    [2014, 'Mike Conley', 14], [2015, 'Kyle Korver', 0], [2016, 'Mike Conley', 14],
    [2017, 'Kemba Walker', 3], [2018, 'Kemba Walker', 3], [2019, 'Mike Conley', 14],
    [2020, 'Vince Carter', 0], [2021, 'Jrue Holiday', 16], [2022, 'Patty Mills', 2],
    [2023, 'Mike Conley', 17], [2024, 'Tyrese Maxey', 22], [2025, 'Jrue Holiday', 1],
    [2026, 'Derrick White', 1],
  ]),
  ...rows('Hustle Award', 'nbaextraawards', [
    [2017, 'Patrick Beverley', 10], [2018, 'Amir Johnson', 22], [2019, 'Marcus Smart', 1],
    [2020, 'Montrezl Harrell', 12], [2021, 'Thaddeus Young', 4], [2022, 'Marcus Smart', 1],
    [2023, 'Marcus Smart', 1], [2024, 'Alex Caruso', 4], [2025, 'Draymond Green', 9],
    [2026, 'Moussa Diabaté', 3],
  ]),
  ...rows('Teammate of the Year', 'nbaextraawards', [
    [2013, 'Chauncey Billups', 12], [2014, 'Shane Battier', 15], [2015, 'Tim Duncan', 25],
    [2016, 'Vince Carter', 14], [2017, 'Dirk Nowitzki', 6], [2018, 'Jamal Crawford', 17],
    [2019, 'Mike Conley', 14], [2020, 'Jrue Holiday', 18], [2021, 'Damian Lillard', 24],
    [2022, 'Jrue Holiday', 16], [2023, 'Jrue Holiday', 16], [2024, 'Mike Conley', 17],
    [2025, 'Stephen Curry', 9], [2026, 'DeAndre Jordan', 18],
  ]),
];

const nameKey = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

export function getHistoricalNbaExtraAwards(maxSeason = Number.POSITIVE_INFINITY): HistoricalAward[] {
  return WINNERS
    .filter(winner => winner.season <= maxSeason)
    .map(winner => ({ ...winner, uiMode: 'nba' as const }));
}

export function mergeHistoricalNbaExtraAwards(
  awards: HistoricalAward[] | undefined,
  maxSeason: number,
): HistoricalAward[] {
  const merged = [...(awards ?? [])];
  const existing = new Map(merged.map((award, index) => [
    `${award.season}|${award.type}|${nameKey(award.name)}`,
    index,
  ]));
  for (const award of getHistoricalNbaExtraAwards(maxSeason)) {
    const key = `${award.season}|${award.type}|${nameKey(award.name)}`;
    const index = existing.get(key);
    if (index === undefined) {
      existing.set(key, merged.length);
      merged.push(award);
    } else {
      merged[index] = { ...merged[index], ...award };
    }
  }
  return merged;
}

export function applyHistoricalNbaExtraAwardsToPlayers(
  players: NBAPlayer[],
  maxSeason: number,
): NBAPlayer[] {
  const byName = new Map<string, HistoricalAward[]>();
  for (const award of getHistoricalNbaExtraAwards(maxSeason)) {
    const key = nameKey(award.name);
    byName.set(key, [...(byName.get(key) ?? []), award]);
  }
  return players.map(player => {
    const awards = [
      ...(byName.get(nameKey(player.name)) ?? []),
      ...getHistoricalContestAwardsForPlayer(player.name, maxSeason + 1),
    ];
    if (awards.length === 0) return player;
    const existing = new Set((player.awards ?? []).map(award => `${award.season}|${award.type}`));
    const additions = awards
      .filter(award => !existing.has(`${award.season}|${award.type}`))
      .map(award => ({ season: award.season, type: award.type, uiMode: 'nba', source: award.source }));
    return additions.length > 0 ? { ...player, awards: [...(player.awards ?? []), ...additions] } : player;
  });
}
