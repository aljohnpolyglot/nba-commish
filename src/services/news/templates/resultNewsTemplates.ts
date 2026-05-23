import type { NewsTemplate } from '../newsTemplateTypes';

export const RESULT_NEWS_TEMPLATES: NewsTemplate[] = [
  {
    category: 'duo_performance',
    headlines: [
      '{player1Name} and {player2Name} Combine to Power {teamName} Past {opponentName}',
      'Dynamic Duo: {player1Name} + {player2Name} Too Much for {opponentName}',
      '{teamName} Win Behind {player1Name}\'s {pts1} and {player2Name}\'s {pts2}',
      'Twin Engines: {player1Name} and {player2Name} Lead {teamName} to Victory',
    ],
    contents: [
      'The {teamName} needed both of them tonight, and they delivered. {player1Name} finished with {pts1} points while {player2Name} added {pts2}, as the two stars carried {teamName} past the {opponentName}.',
      'When {teamName} needs two stars to show up, they usually get it. {player1Name} ({pts1} pts, {reb1} reb, {ast1} ast) and {player2Name} ({pts2} pts, {reb2} reb, {ast2} ast) combined for a dominant showing against the {opponentName}.',
      'The old cliché is true — it takes two to tango. {player1Name} and {player2Name} set the pace for the {teamName} all night, combining for {combinedPts} points in the win over the {opponentName}.',
      '{teamName} have a two-headed monster, and the {opponentName} learned that firsthand. {player1Name} paced the team with {pts1} while {player2Name} was right there with {pts2} in an impressive all-around team win.',
    ],
  },
  {
    category: 'team_feat',
    headlines: [
      '{playerName} Drops {pts} in {teamName} Win Over {opponentName}',
      '{playerName} Erupts for {pts} Points to Pace {teamName}',
      '{teamName}\'s {playerName} Goes Off for {pts} pts, {reb} reb, {ast} ast',
      '{playerName} Shines with {pts}-Point Night for {teamName}',
      '{playerName} Records Triple-Double to Power {teamName}',
      '{playerName}\'s {pts}/{reb}/{ast} Line Fuels {teamName} Effort',
    ],
    contents: [
      '{playerName} was the best player on the floor as the {teamName} faced off against the {opponentName}. The performance — {pts} points, {reb} rebounds, {ast} assists — underscored just how important {playerName} is to this team\'s success.',
      'The {teamName} leaned on {playerName} against the {opponentName}, and the star delivered in a big way. A {pts}-point, {reb}-rebound night with {ast} assists was another reminder of the level {playerName} can play at.',
      '{playerName} reminded everyone why the {teamName} go as he goes. A dominant {pts}-point showing against the {opponentName} kept {teamName} moving in the right direction this week.',
      'In a performance that flew slightly under the radar nationally, {playerName} went for {pts} and {reb} boards while dishing {ast} assists for the {teamName}. Worth noting.',
    ],
  },
  {
    category: 'game_result',
    headlines: [
      '{winnerName} Defeat {loserName} {winnerScore}–{loserScore}',
      '{winnerName} Top {loserName} in {gameType} Action',
      '{winnerName} Handle {loserName}, Move to {winnerRecord}',
      '{loserName} Fall to {winnerName} {loserScore}–{winnerScore}',
    ],
    contents: [
      'The {winnerName} took care of business at home, defeating the {loserName} {winnerScore}–{loserScore}. {topPerformer} led the way with {topPts} points.',
      '{winnerName} earned a hard-fought {winnerScore}–{loserScore} win over the {loserName}. {topPerformer} paced the victors, finishing with {topPts} points.',
      'In a {gameType} showdown, the {winnerName} defeated {loserName} by a score of {winnerScore}–{loserScore}. {topPerformer} was the standout with {topPts} points.',
      'The {loserName} dropped to {loserRecord} after falling {loserScore}–{winnerScore} to the {winnerName}. {topPerformer} was the best player on the floor.',
    ],
  },
];

