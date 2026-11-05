export const competitionAwardTypeFamily = (competitionId: string, value: string): string => {
  const type = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (competitionId === 'vtb-united-league' && /^(?:finals|final four|playoffs) mvp$/.test(type)) return 'postseason mvp';
  if (competitionId === 'adriatic-league' && /^(?:regular season )?(?:mvp|most valuable player)$/.test(type)) return 'season mvp';
  if (/^(?:bbl )?mvp$|^(?:season )?most valuable player$|^season mvp$/.test(type)) return 'season mvp';
  if (/^finals mvp$/.test(type)) return 'finals mvp';
  if (/defensive player of the year|best defender/.test(type)) return 'defender';
  if (/top scorer|scoring leader/.test(type)) return 'top scorer';
  if (/rookie of the year|best (?:german )?(?:young player|player under 2[234])|rising star|newcomer of the year/.test(type)) return 'young player';
  return type;
};
