import type { NewsTemplate } from '../newsTemplateTypes';

export const PBA_NEWS_TEMPLATES: NewsTemplate[] = [
  {
    category: 'pba_game_recap', scope: 'pba',
    headlines: [
      '{winnerName} turn back {loserName}, {winnerScore}–{loserScore}',
      '{topPerformer} leads {winnerName} past {loserName}',
    ],
    contents: [
      '{winnerName} beat {loserName} {winnerScore}–{loserScore} in {conferenceName} action. {topPerformer} set the tone with {topPts} points, {topReb} rebounds, and {topAst} assists.',
      '{topPerformer} delivered {topPts} points as {winnerName} finished off a {winnerScore}–{loserScore} win over {loserName}.',
    ],
  },
  {
    category: 'pba_close_game', scope: 'pba',
    headlines: [
      '{winnerName} survive {loserName} in {winnerScore}–{loserScore} thriller',
      '{topPerformer} delivers as {winnerName} escape by {margin}',
    ],
    contents: [
      'One possession decided it: {winnerName} held off {loserName} {winnerScore}–{loserScore}. {topPerformer} finished with {topPts} points.',
      '{loserName} pushed to the final horn, but {winnerName} closed the night with a {winnerScore}–{loserScore} victory behind {topPerformer}.',
    ],
  },
  {
    category: 'pba_upset', scope: 'pba',
    headlines: [
      '{winnerName} stun {loserName}, {winnerScore}–{loserScore}',
      'Upset in {conferenceName}: {winnerName} take down {loserName}',
    ],
    contents: [
      '{winnerName} overturned the form book with a {winnerScore}–{loserScore} victory over {loserName}. {topPerformer} led the upset with {topPts} points.',
      '{loserName} entered with the stronger record, but {winnerName} owned the night and won {winnerScore}–{loserScore}.',
    ],
  },
  {
    category: 'pba_player_performance', scope: 'pba',
    headlines: [
      '{playerName} powers {teamName} with {pts}-point night',
      '{playerName} takes center stage for {teamName}',
    ],
    contents: [
      '{playerName} produced {pts} points, {reb} rebounds, and {ast} assists for {teamName} against {opponentName}.',
      '{teamName} leaned on {playerName}, who filled the box score with {pts} points, {reb} boards, and {ast} assists.',
    ],
  },
  {
    category: 'pba_conference_preview', scope: 'pba',
    headlines: [
      '{conferenceName} race takes shape',
      '{teamCount} clubs begin the chase for the {conferenceName}',
    ],
    contents: [
      '{teamCount} PBA clubs are in the {conferenceName} field, with every result counting toward the playoff race.',
      'The {conferenceName} campaign is underway and the path to the trophy runs through {teamCount} clubs.',
    ],
  },
  {
    category: 'pba_standings_race', scope: 'pba',
    headlines: [
      '{leaderName} set the pace at {leaderRecord}',
      '{conferenceName} table tightens behind {leaderName}',
    ],
    contents: [
      '{leaderName} lead the {conferenceName} at {leaderRecord}, with {chaserName} next at {chaserRecord}.',
      'The playoff race has {leaderName} on top at {leaderRecord}; {chaserName} remain within striking distance at {chaserRecord}.',
    ],
  },
  {
    category: 'pba_playoff_series', scope: 'pba',
    headlines: [
      '{winnerName} move on after eliminating {loserName}',
      '{winnerName} close out {loserName} in the {conferenceName} playoffs',
    ],
    contents: [
      '{winnerName} won the series {seriesScore} and ended {loserName}\'s {conferenceName} run.',
      'The {conferenceName} bracket belongs to {winnerName} for another round after a {seriesScore} series win over {loserName}.',
    ],
  },
  {
    category: 'pba_finals_bound', scope: 'pba',
    headlines: [
      '{teamName} book a place in the {conferenceName} Finals',
      'Finals bound: {teamName} eliminate {opponentName}',
    ],
    contents: [
      '{teamName} are one series from the {conferenceName} crown after taking out {opponentName}.',
      '{opponentName} are out and {teamName} are headed to the {conferenceName} Finals.',
    ],
  },
  {
    category: 'pba_conference_champion', scope: 'pba',
    headlines: [
      '{championName} are {conferenceName} champions',
      '{championName} capture the {conferenceName} crown',
    ],
    contents: [
      '{championName} completed the title run{runnerUpClause}.{mvpClause}{recordClause}',
      'The {conferenceName} trophy belongs to {championName}{runnerUpClause}.{mvpClause}{recordClause}',
    ],
  },
  {
    category: 'pba_grand_slam', scope: 'pba',
    headlines: [
      'Grand Slam! {teamName} sweep all three PBA conferences',
      '{teamName} complete a historic PBA Grand Slam',
    ],
    contents: [
      '{teamName} won the Philippine Cup, Commissioner\'s Cup, and Governors\' Cup in {season} to complete the Grand Slam.',
      'Three conferences, three trophies: {teamName} own the {season} PBA season.',
    ],
  },
  {
    category: 'pba_all_star_captains', scope: 'pba',
    headlines: [
      '{teamAName} will face {teamBName} in the PBA All-Star Game',
      '{teamAName} vs. {teamBName}: {captainAName} and {captainBName} headline PBA All-Star matchup',
    ],
    contents: [
      '{captainAName} will captain {teamAName}, while {captainBName} leads {teamBName}. The {season} PBA All-Star rosters are set.',
      'The captain draft is complete: {teamAName}, led by {captainAName}, will meet {captainBName}\'s {teamBName}.',
    ],
  },
  {
    category: 'pba_all_star_recap', scope: 'pba',
    headlines: [
      '{winnerName} beat {loserName} {winnerScore}–{loserScore} in PBA All-Star Game',
      '{mvpName} named MVP as {winnerName} win PBA All-Star showcase',
    ],
    contents: [
      '{winnerName} defeated {loserName} {winnerScore}–{loserScore}.{mvpClause}{contestClause}',
      'The PBA All-Star Game ended {winnerScore}–{loserScore} for {winnerName}.{mvpClause}{contestClause}',
    ],
  },
  {
    category: 'pba_contest_winner', scope: 'pba',
    headlines: [
      '{winnerName} wins the PBA {contestName}',
      'PBA {contestName}: {winnerName} takes the title',
    ],
    contents: [
      '{winnerName} delivered under the All-Star Weekend lights to win the {season} PBA {contestName}.',
      'The {season} PBA {contestName} trophy belongs to {winnerName}.',
    ],
  },
  {
    category: 'pba_award_winner', scope: 'pba',
    headlines: [
      '{winnerName} earns {awardName}',
      '{conferenceName} honors {winnerName} as {awardName}',
    ],
    contents: [
      '{winnerName} was named {awardName} for the {conferenceName}{teamClause}.',
      'The {conferenceName} recognized {winnerName} with {awardName} honors{teamClause}.',
    ],
  },
  {
    category: 'pba_draft_pick', scope: 'pba',
    headlines: [
      '{teamName} select {playerName} with pick No. {pickNumber}',
      'PBA Draft: {playerName} goes to {teamName}',
    ],
    contents: [
      '{teamName} used the No. {pickNumber} selection in the {season} PBA Draft on {playerName}.',
      '{playerName} begins a PBA career with {teamName} after being selected No. {pickNumber}.',
    ],
  },
  {
    category: 'pba_import_signing', scope: 'pba',
    headlines: [
      '{teamName} bring in {playerName} for the {conferenceName}',
      'Import signing: {playerName} joins {teamName}',
    ],
    contents: [
      '{playerName} has signed with {teamName} as the club\'s import for the {conferenceName}.',
      '{teamName} confirmed {playerName} for its {conferenceName} campaign.',
    ],
  },
];
