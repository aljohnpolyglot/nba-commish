export const MIN_PLAYOFF_ROUNDS = 1;
export const MAX_PLAYOFF_ROUNDS = 7;

export const getPlayoffBracketCapacity = (roundCount: number): number =>
  2 ** Math.min(MAX_PLAYOFF_ROUNDS, Math.max(MIN_PLAYOFF_ROUNDS, Math.round(roundCount)));

export const getBalancedFirstRoundByes = (teamCount: number, roundCount: number): number =>
  Math.max(0, getPlayoffBracketCapacity(roundCount) - Math.max(2, Math.round(teamCount)));

export const getMinimumPlayoffField = (roundCount: number, byConference: boolean): number => {
  const capacity = getPlayoffBracketCapacity(roundCount);
  if (capacity === 2) return 2;
  return capacity / 2 + (byConference ? 2 : 1);
};

export const getOpeningRoundGameCount = (teamCount: number, firstRoundByes: number): number =>
  Math.max(0, Math.floor((Math.max(2, Math.round(teamCount)) - Math.max(0, Math.round(firstRoundByes))) / 2));

export const isBalancedPlayoffField = (
  teamCount: number,
  firstRoundByes: number,
  roundCount: number,
): boolean => {
  const teams = Math.max(2, Math.round(teamCount));
  const byes = Math.max(0, Math.round(firstRoundByes));
  const openingTeams = teams - byes;
  return openingTeams >= 2
    && openingTeams % 2 === 0
    && byes + openingTeams / 2 === getPlayoffBracketCapacity(roundCount) / 2;
};

export const getPlayoffRoundLabel = (
  round: number,
  roundCount: number,
  teamCount?: number,
  finalsLabel = 'Finals',
): string => {
  const totalRounds = Math.max(MIN_PLAYOFF_ROUNDS, Math.round(roundCount));
  const currentRound = Math.max(1, Math.round(round));
  const roundsRemaining = totalRounds - currentRound;
  if (roundsRemaining <= 0) return finalsLabel;
  if (
    currentRound === 1
    && Number.isFinite(teamCount)
    && Number(teamCount) > getPlayoffBracketCapacity(totalRounds - 1)
    && Number(teamCount) < getPlayoffBracketCapacity(totalRounds)
  ) return 'Opening Round';
  if (roundsRemaining === 1) return 'Semifinals';
  if (roundsRemaining === 2) return 'Quarterfinals';
  return `Round of ${2 ** (roundsRemaining + 1)}`;
};
