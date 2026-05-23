import type { NewsTemplate } from '../newsTemplateTypes';

export const CORE_NEWS_TEMPLATES: NewsTemplate[] = [
  {
    category: 'win_streak',
    headlines: [
      'Unstoppable! {teamName} Extend Streak to {streakCount}',
      'Is Anyone Going to Stop the {teamName}?',
      'Juggernaut: {teamName} Notch {streakCount}th Straight Win',
      '{teamName} Look Like Title Contenders During Historic Run',
    ],
    contents: [
      'The {teamName} continued their absolute tear through the league, securing their {streakCount}th consecutive victory. The locker room vibes are immaculate.',
      "Analysts are running out of superlatives for the {teamName}. Their current {streakCount}-game win streak has put the rest of the conference on notice.",
      "Behind stellar play on both ends of the floor, the {teamName} have rattled off {streakCount} wins in a row. Head coach says they're 'just taking it one game at a time.'",
      "It's officially a winning streak of epic proportions. The {teamName} have won {streakCount} straight, climbing the standings and capturing the league's attention.",
    ],
  },
  {
    category: 'long_win_streak',
    headlines: [
      '{teamName} Win {streakCount} Straight — Is This the Best Team in the League?',
      'Historic: {teamName} Have Not Lost in {streakCount} Games',
      'Legendary Run: {teamName} Keep Piling Up Ws',
      'The {teamName} Machine: {streakCount} Consecutive Victories and Counting',
    ],
    contents: [
      "Stop what you're doing — the {teamName} have now won {streakCount} games in a row. This is legitimately one of the more impressive runs we've seen in years.",
      'The rest of the league is taking notes. The {teamName} have won {streakCount} straight and have now fully separated themselves as must-watch basketball.',
      "Coaches around the league are game-planning for the {teamName}, but nothing is working. {streakCount} consecutive wins is a statement of dominance.",
      "At what point do we start calling this historic? The {teamName} streak is now at {streakCount} games, and there's no sign of slowing down.",
    ],
  },
  {
    category: 'streak_snapped',
    headlines: [
      'Streak Over: {teamName} Fall After {streakCount} Straight Wins',
      'The Run Ends: {teamName}\'s {streakCount}-Game Win Streak Is No More',
      'All Good Things Must End: {teamName} Finally Lose',
      '{teamName} Brought Back Down to Earth After {streakCount}-Game Hot Streak',
    ],
    contents: [
      "It had to end eventually. The {teamName}'s impressive {streakCount}-game win streak came to a close, snapping one of the better runs in the league this season.",
      "The winning streak is over. The {teamName} had rattled off {streakCount} consecutive wins before finally being stopped. The run was special while it lasted.",
      "Somebody finally figured out the {teamName}. After {streakCount} wins in a row, the streak is officially over — but what a ride it was.",
      "Gravity wins in the end. The {teamName}'s {streakCount}-game streak ends tonight. The question now is whether they can bounce back quickly.",
    ],
  },
  {
    category: 'lose_streak',
    headlines: [
      'Rock Bottom: {teamName} Freefall Continues',
      'Panic Setting In? {teamName} Drop {streakCount} Straight',
      'Searching for Answers: {teamName} Lose {streakCount} in a Row',
      'Disaster Class: The {teamName} Cannot Buy a Win Right Now',
    ],
    contents: [
      'The vibes are officially atrocious for the {teamName} after yet another defeat, pushing their losing streak to a brutal {streakCount} games.',
      'A closed-door meeting might be needed soon. The {teamName} have now lost {streakCount} consecutive games, and frustration is boiling over.',
      'Fans are booing, body language is bad, and the {teamName} have dropped {streakCount} straight. Something has to change soon.',
      'It goes from bad to worse for the {teamName}. Their current {streakCount}-game skid has front office executives sweating.',
    ],
  },
  {
    category: 'monster_performance',
    headlines: [
      'Historic Night: {playerName} Erupts for {statValue} {statType}!',
      '{playerName} Puts the Entire League on Notice',
      'A One-Man Show! {playerName} Drops {statValue} {statType} Against {opponentName}',
      'Generational: {playerName} Masterclass Leads to Victory',
    ],
    contents: [
      'Fans who tuned in witnessed absolute greatness as {playerName} carried the {teamName} with a legendary {statValue}-{statType} masterclass.',
      'The {opponentName} threw double teams, zone defense, and the kitchen sink at {playerName}, but nothing worked. A casual {statValue} {statType} for the superstar.',
      'Put it in the Louvre. {playerName} was completely unguardable, finishing with an astonishing {statValue} {statType}.',
      'We might be talking about this {playerName} game for years. An unbelievable {statValue} {statType} performance that left the crowd speechless.',
    ],
  },
  {
    category: 'triple_double',
    headlines: [
      'Triple-Double Machine: {playerName} Does It Again',
      '{playerName} Dominant in All Phases with {pts}/{reb}/{ast} Night',
      'The Numbers Don\'t Lie: {playerName} Stuffs the Stat Sheet',
      'Complete Performance: {playerName} Leads {teamName} with Triple-Double',
    ],
    contents: [
      '{playerName} was everywhere on the floor tonight, finishing with {pts} points, {reb} rebounds, and {ast} assists in a complete team effort from the {teamName}.',
      "The box score doesn't do it justice. {playerName} recorded a {pts}/{reb}/{ast} triple-double, controlling the game from start to finish.",
      "That's what elite looks like. {playerName} impacted the game in every way possible, dropping {pts} points to go with {reb} boards and {ast} dimes.",
      'Another night, another triple-double for {playerName}. The {teamName} star continues to be impossible to game plan for.',
    ],
  },
  {
    category: 'major_injury',
    headlines: [
      'Devastating Blow: {playerName} Out Indefinitely',
      'Injury Update: {teamName} Lose {playerName} to {injuryType}',
      'Brutal Luck for {teamName} as {playerName} Goes Down',
      'Medical Staff Confirms Fears Regarding {playerName}',
    ],
    contents: [
      "The wind has been taken out of the {teamName}'s sails. {playerName} has been diagnosed with a {injuryType} and is expected to miss {duration}.",
      'Heartbreaking news out of the {teamName} facility. Star player {playerName} suffered a {injuryType} and will be sidelined for {duration}.',
      'Just as they were finding their rhythm, the {teamName} lose {playerName} to a {injuryType}. They will be without him for {duration}.',
      'A collective gasp echoed through the arena as {playerName} went down. Tests today confirmed a {injuryType}, shelving them for {duration}.',
    ],
  },
  {
    category: 'playoff_injury_out',
    headlines: [
      'Playoffs Over for {playerName} — {teamName} Must Adjust',
      'Crushing Blow: {playerName} Out for the Remainder of the Playoffs',
      '{teamName} Lose {playerName} for Playoffs — {injuryType} Confirmed',
      'Season Ends Early: {playerName} Will Not Return This Postseason',
    ],
    contents: [
      '{playerName} is done for the playoffs. A {injuryType} suffered in the series against {opponentName} ends his postseason run. A devastating blow to {teamName}\'s championship hopes.',
      'The news is as bad as feared. {playerName} has been ruled out for the remainder of the playoffs with a {injuryType}. {teamName} will need to find answers without their key piece.',
      '{teamName} confirmed the worst: {playerName} will not play again this postseason. The {injuryType} requires time, and time is something the playoffs do not allow.',
      'A defining moment in this playoff run — and not the kind anyone wanted. {playerName} is out for the playoffs after suffering a {injuryType}.',
    ],
  },
  {
    category: 'playoff_injury_series',
    headlines: [
      'Out for the Series: {playerName} Will Not Return Against {opponentName}',
      '{playerName} Ruled Out for the Rest of This Series — {injuryType}',
      '{teamName} Shorthanded: {playerName} Done for the Series',
      'Injury Blow: {playerName} Cannot Continue Against {opponentName}',
    ],
    contents: [
      '{playerName} will not return in this series. A {injuryType} has sidelined him for the remainder of the matchup against {opponentName}, leaving {teamName} to adjust on the fly.',
      'The {teamName} will have to close out the series without {playerName}. The {injuryType} rules him out for the duration of the {opponentName} series.',
      'Gut punch for {teamName}. {playerName} — their key contributor — is out for the series against {opponentName} after suffering a {injuryType}.',
      '{opponentName} gets a significant break as {playerName} is ruled out for the rest of this series. {teamName} insists they have enough depth to respond.',
    ],
  },
  {
    category: 'playoff_injury_game',
    headlines: [
      '{playerName} Questionable for Game {gameNumber} vs. {opponentName} — {injuryType}',
      '{playerName} Listed Day-to-Day — Status Uncertain for Game {gameNumber}',
      '{teamName} Monitoring {playerName} Ahead of Game {gameNumber}',
      'Injury Report: {playerName} Day-to-Day with {injuryType}',
    ],
    contents: [
      '{playerName} is listed as questionable for Game {gameNumber} against {opponentName} with a {injuryType}. The team will re-evaluate closer to tip-off.',
      '{playerName} is day-to-day with a {injuryType}. {teamName} has not ruled him out for Game {gameNumber} — a decision will be made closer to game time.',
      '{teamName} list {playerName} as day-to-day. He could play through the {injuryType} at reduced minutes, with a final call before Game {gameNumber}.',
      'No timetable given for {playerName} and his {injuryType}. He is being monitored by the {teamName} training staff ahead of Game {gameNumber}.',
    ],
  },
  {
    category: 'trade_rumor',
    headlines: [
      'Rumor Mill: {playerName} Unhappy with {teamName} Front Office?',
      'Sources: Rival Executives Monitoring {playerName} Situation',
      'Could the {teamName} Look to Blow It Up?',
      'Whispers of Discontent Growing Around {playerName}',
    ],
    contents: [
      'League insiders are reporting friction between {playerName} and the {teamName} brass. If things do not improve, a trade request could be imminent.',
      'Several front offices have reportedly placed exploratory calls to the {teamName} regarding the availability of {playerName}.',
      'With the {teamName} struggling to meet expectations, executives around the league believe {playerName} could be moved before the deadline.',
      "Where there's smoke, there's fire. Rumors are swirling that {playerName} is growing tired of the current situation with the {teamName}.",
    ],
  },
  {
    category: 'coach_hot_seat',
    headlines: [
      'Is the Clock Ticking for the {teamName} Head Coach?',
      'Front Office Growing Impatient in {teamCity}',
      'Hot Seat Watch: {teamName} Ownership Wants Answers',
      'Rumors of a Coaching Change Swirling Around the {teamName}',
    ],
    contents: [
      'After failing to meet early season expectations, sources say the {teamName} ownership is heavily evaluating the coaching staff.',
      "The locker room might be slipping away. Whispers suggest the {teamName} head coach has a very short leash moving forward.",
      'In this league, someone has to take the fall. For the {teamName}, insiders believe a coaching change is highly likely if they do not turn it around immediately.',
    ],
  },
  {
    category: 'milestone',
    headlines: [
      '{playerName} Reaches {milestoneValue} Career {milestoneType}',
      'History Made: {playerName} Joins Elite Club',
      '{playerName} Etches Name in {teamName} Record Books',
      'Milestone Alert: {playerName} Hits {milestoneValue} Career {milestoneType}',
    ],
    contents: [
      'In a moment that will be remembered for years, {playerName} crossed the {milestoneValue} career {milestoneType} threshold, joining a very short list of greats.',
      "The {teamName} faithful gave {playerName} a standing ovation after the milestone was announced. A moment of class for a class act.",
      '{playerName} added another chapter to a legendary career, eclipsing {milestoneValue} career {milestoneType} in a game to remember.',
    ],
  },
  {
    category: 'preseason_performance',
    headlines: [
      'Preseason Preview: {playerName} Erupts for {statValue} {statType}',
      'Training Camp Takeover: {playerName} Makes a Statement',
      'Early Look: {playerName} Goes Off in Exhibition Play',
      '{playerName} Sending a Message Before Opening Night',
    ],
    contents: [
      "It's only preseason, but {playerName} doesn't care. A scorching {statValue}-point showing against {opponentName} has fans buzzing heading into the regular season.",
      'The {teamName} faithful have a lot to be excited about. {playerName} looked completely unguardable in exhibition action, finishing with {statValue} {statType} against {opponentName}.',
      "Preseason stat lines don't count — but try telling that to {playerName}, who torched {opponentName} for {statValue} {statType} in tonight's exhibition.",
      '{statValue} {statType} in a preseason game. {playerName} is sending a message ahead of Opening Night, and the {teamName} are looking sharp early.',
    ],
  },
  {
    category: 'preseason_recap',
    headlines: [
      'Preseason Standout: {playerName} Leads Early Exhibition Play',
      'Early Watch: {teamName}\'s {playerName} is Turning Heads',
      'Training Camp Report: {playerName} Impressing in Exhibitions',
      '{playerName} the Early Star of {teamName}\'s Preseason',
    ],
    contents: [
      "Exhibition games are low stakes, but {playerName} of the {teamName} hasn't gotten the memo. Averaging {pts} PPG in preseason play, the early indicators are very encouraging.",
      "The {teamName}'s {playerName} has been the early standout this preseason, posting a stat-stuffing {pts} points with {reb} boards and {ast} assists in exhibition play.",
      'An early look at what the regular season could bring. {playerName} has been the most impressive player of the preseason so far, posting {pts} PPG for the {teamName}.',
      "Preseason doesn't define careers — but {playerName} is making a strong impression. The {teamName} star is averaging {pts} PPG with complementary {reb}/{ast} in exhibitions.",
    ],
  },
  {
    category: 'batch_recap',
    headlines: [
      '{playerName} is the League\'s Hottest Player Right Now',
      'Around the League: {playerName} Leads the Period\'s Best Performances',
      '{teamName}\'s {playerName} is Taking Over',
      'Standout of the Period: {playerName} Above the Rest',
      'The League is on Notice — {playerName} is Cooking',
    ],
    contents: [
      'No one has been more dominant in this stretch than {playerName} of the {teamName}. A standout {pts}-point showing with {reb} boards and {ast} assists — a complete two-way effort.',
      '{playerName} has been impossible to game-plan for lately. The {teamName} star dropped {pts} points with {reb} rebounds and {ast} assists in a performance that had the league talking.',
      "If you haven't been watching {teamName} games, you've been missing out. {playerName} put up {pts} points in a statement game that cemented their status as one of the league's best.",
      'Period Report: {playerName} ({teamName}) stands out as the top performer, putting up {pts} PTS alongside {reb} REB and {ast} AST in the league\'s biggest game of the stretch.',
      '{teamName}\'s {playerName} is in a groove right now. A league-best {pts}-point performance with complementary numbers across the board.',
    ],
  },
  {
    category: 'signing_confirmed',
    headlines: [
      '{teamName} Make a Move: {playerName} Signs',
      'Official: {playerName} Joins the {teamName}',
      '{teamName} Add {playerName} to the Roster',
      'Roster Move: {teamName} Ink {playerName}',
    ],
    contents: [
      'The {teamName} have officially added {playerName} to the roster. The move comes as the front office looks to shore up the rotation heading into the stretch run.',
      '{playerName} is officially a member of the {teamName}, per the league transaction wire. The signing brings depth and experience to the squad.',
      'It is now official: {playerName} has signed with the {teamName}. Expect to see the newcomer in the rotation as early as the next home game.',
      'The {teamName} front office was active, agreeing to terms with {playerName}. The deal adds an important piece to a roster looking to make a push.',
    ],
  },
  {
    category: 'trade_confirmed',
    headlines: [
      'TRADE ALERT: {teamAName}–{teamBName} Deal Official',
      'League Wire: {teamAName} and {teamBName} Swap Assets',
      'Breaking: Major Trade Shakes Up the League',
      'Commissioner Confirms Trade Between {teamAName} and {teamBName}',
    ],
    contents: [
      'It is now confirmed: the {teamAName} and {teamBName} have completed a trade. {assetsToB} head to {teamBName}, while {assetsToA} go the other way.',
      'The deal is done. {teamAName} and {teamBName} have swapped {assetsToB} for {assetsToA} in a move that reshapes both rosters heading down the stretch.',
      'In one of the bigger deals of the season, {teamAName} and {teamBName} executed a trade that sends {assetsToB} to {teamBName} in exchange for {assetsToA}.',
      'The front offices have been busy. The {teamAName}–{teamBName} trade is finalized: {assetsToB} depart, {assetsToA} arrive.',
    ],
  },
];

