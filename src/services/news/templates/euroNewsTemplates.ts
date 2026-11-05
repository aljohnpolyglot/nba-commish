import type { NewsTemplate } from '../newsTemplateTypes';

export const EURO_NEWS_TEMPLATES: NewsTemplate[] = [
  {
    category: 'league_contract_extension',
    scope: 'shared',
    headlines: [
      '{personName} commits future to {teamName}',
      '{teamName} secure extension with {personName}',
    ],
    contents: [
      '{personName} has agreed a {years}-year extension with {teamName}{roleClause}.',
      '{teamName} confirmed that {personName} will remain with the organization for another {years} years{roleClause}.',
    ],
  },
  {
    category: 'league_coaching_change',
    scope: 'shared',
    headlines: [
      '{teamName} appoint {coachName}',
      '{coachName} takes charge at {teamName}',
    ],
    contents: [
      '{teamName} have named {coachName} as {roleName}.',
      '{coachName} will lead {teamName} after being appointed {roleName}.',
    ],
  },
  {
    category: 'international_field_set',
    scope: 'shared',
    headlines: [
      '{tournamentName} field set for {year}',
      '{teamCount} nations ready for {tournamentName}',
    ],
    contents: [
      '{teamCount} national teams will compete in the {year} {tournamentName}{hostClause}.',
      'The field for the {year} {tournamentName} is confirmed, with {teamCount} nations taking part{hostClause}.',
    ],
  },
  {
    category: 'international_champion',
    scope: 'shared',
    headlines: [
      '{championName} win {tournamentName}',
      '{championName} crowned {tournamentName} champions',
    ],
    contents: [
      '{championName} captured the {tournamentName} title{runnerUpClause}{scoreClause}.',
      '{championName} finished the tournament on top{runnerUpClause}{scoreClause}.',
    ],
  },
  {
    category: 'euro_transfer_completed',
    scope: 'euro',
    headlines: [
      '{playerName} joins {toTeam}',
      '{toTeam} complete move for {playerName}',
      'Transfer confirmed: {playerName} to {toTeam}',
    ],
    contents: [
      '{toTeam} have completed the signing of {playerName} from {fromTeam}{feeClause}.',
      '{playerName} is heading from {fromTeam} to {toTeam} after the clubs finalized the transfer{feeClause}.',
      'The deal is official: {playerName} leaves {fromTeam} for {toTeam}{feeClause}.',
    ],
  },
  {
    category: 'euro_loan_completed',
    scope: 'euro',
    headlines: [
      '{playerName} joins {borrowerTeam} on loan',
      '{borrowerTeam} secure loan move for {playerName}',
    ],
    contents: [
      '{playerName} has joined {borrowerTeam} on loan from {parentTeam} through {endDate}{feeClause}.',
      '{parentTeam} and {borrowerTeam} agreed a loan for {playerName} running through {endDate}{feeClause}.',
    ],
  },
  {
    category: 'euro_domestic_champion',
    scope: 'euro',
    headlines: [
      '{championTeam} win {competitionName}',
      '{championTeam} crowned {competitionName} champions',
    ],
    contents: [
      '{championTeam} completed the domestic title run{runnerUpClause}.',
      '{competitionName} belongs to {championTeam} after a championship campaign{runnerUpClause}.',
    ],
  },
  {
    category: 'euro_continental_champion',
    scope: 'euro',
    headlines: [
      '{championTeam} conquer {competitionName}',
      '{championTeam} lift the {competitionName} trophy',
    ],
    contents: [
      '{championTeam} are champions of {competitionName}{runnerUpClause}.',
      '{championTeam} completed their continental run with the {competitionName} title{runnerUpClause}.',
    ],
  },
  {
    category: 'euro_award_winner',
    scope: 'euro',
    headlines: [
      '{winnerName} earns {awardName} honors',
      '{competitionName} names {winnerName} its {awardName}',
    ],
    contents: [
      '{winnerName} was recognized as {awardName} in {competitionName}{teamClause}.',
      '{competitionName} awarded {awardName} honors to {winnerName}{teamClause}.',
    ],
  },
  {
    category: 'euro_promotion',
    scope: 'euro',
    headlines: [
      'Promotion places confirmed',
      'New clubs rise into the top division',
    ],
    contents: ['{movementSummary}'],
  },
  {
    category: 'euro_relegation',
    scope: 'euro',
    headlines: [
      'Domestic relegation places confirmed',
      'Top-flight places decided after season review',
    ],
    contents: ['{movementSummary}'],
  },
  {
    category: 'euro_continental_qualification',
    scope: 'euro',
    headlines: [
      '{teamName} qualify for {competitionName}',
      '{competitionName} place secured by {teamName}',
    ],
    contents: [
      '{teamName} will compete in {competitionName} during the {season} season after earning a place through {qualificationPath}.',
      '{teamName} have secured entry to {competitionName} for {season} through {qualificationPath}.',
    ],
  },
  {
    category: 'euro_license_decision',
    scope: 'euro',
    headlines: [
      '{teamName} receive {competitionName} place',
      '{competitionName} confirms agreement with {teamName}',
    ],
    contents: [
      '{teamName} will enter {competitionName} in {season} under a {agreementLabel}.',
      '{competitionName} confirmed a {agreementLabel} for {teamName}, beginning with the {season} season.',
    ],
  },
  {
    category: 'euro_final_four',
    scope: 'euro',
    headlines: [
      '{competitionName} Final Four is set',
      'Four clubs remain in {competitionName}',
    ],
    contents: [
      '{clubList} have booked their places in the {competitionName} Final Four.',
      'The {competitionName} title race is down to four clubs: {clubList}.',
    ],
  },
  {
    category: 'euro_derby',
    scope: 'euro',
    headlines: [
      '{homeTeam} and {awayTeam} ready for derby night',
      'Derby spotlight: {homeTeam} vs. {awayTeam}',
    ],
    contents: [
      '{homeTeam} host {awayTeam} in one of the biggest dates on the {competitionName} calendar.',
      'Local rivals {homeTeam} and {awayTeam} meet with {competitionName} stakes on the line.',
    ],
  },
  {
    category: 'euro_media_rights',
    scope: 'euro',
    headlines: [
      '{competitionName} confirms media-rights distribution',
      '{competitionName} broadcast pool set for {season}',
    ],
    contents: [
      '{competitionName} confirmed a {poolAmount} media-rights pool for the {season} season.',
      'Clubs will share {poolAmount} from the {competitionName} broadcast package in {season}.',
    ],
  },
  {
    category: 'euro_club_finance',
    scope: 'euro',
    headlines: [
      '{teamName} face major board decision',
      'Club business update: {teamName}',
    ],
    contents: ['{financeSummary}'],
  },
  {
    category: 'euro_academy_promotion',
    scope: 'euro',
    headlines: [
      '{playerName} promoted to {teamName} senior squad',
      '{teamName} elevate academy prospect {playerName}',
    ],
    contents: [
      '{playerName} has stepped up from the youth academy into the {teamName} senior team.',
      '{teamName} confirmed that academy prospect {playerName} has joined the senior squad.',
    ],
  },
  {
    category: 'euro_coaching_change',
    scope: 'euro',
    headlines: [
      '{teamName} appoint {coachName}',
      '{coachName} joins the bench at {teamName}',
    ],
    contents: [
      '{teamName} have appointed {coachName} as {roleName}.',
      '{coachName} will join {teamName} as {roleName} for the new season.',
    ],
  },
  {
    category: 'euro_contract_extension',
    scope: 'euro',
    headlines: [
      '{personName} extends stay with {teamName}',
      '{teamName} retain {personName}',
    ],
    contents: [
      '{personName} has signed a {years}-year extension with {teamName}.',
      '{teamName} confirmed a new {years}-year agreement with {personName}.',
    ],
  },
];
