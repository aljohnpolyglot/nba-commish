export type NewsCategory =
  | 'win_streak'
  | 'lose_streak'
  | 'monster_performance'
  | 'preseason_performance'
  | 'triple_double'
  | 'major_injury'
  | 'trade_rumor'
  | 'coach_hot_seat'
  | 'milestone'
  | 'batch_recap'
  | 'preseason_recap';

export interface NewsTemplate {
  category: NewsCategory;
  headlines: string[];
  contents: string[];
}

export const NEWS_TEMPLATES: NewsTemplate[] = [
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
      'Around the League: {playerName} Leads the Week\'s Best Performances',
      '{teamName}\'s {playerName} is Putting Up Numbers',
      'Week in Review: {playerName} Stands Above the Rest',
      'The League is on Notice — {playerName} is Cooking',
    ],
    contents: [
      'Over the past week, no one has been more dominant than {playerName} of the {teamName}. Averaging {pts} PPG with {reb} boards and {ast} assists, the numbers speak for themselves.',
      '{playerName} has been the most consistent performer in the league recently. The {teamName} star is averaging {pts} points per game and showing no signs of slowing down.',
      "If you haven't been watching {teamName} games, you've been missing out. {playerName} is in the middle of a scorching stretch, averaging {pts} PPG over the last week.",
      'Week in review: {playerName} ({teamName}) stands out as the league\'s top performer, putting up {pts} PPG alongside {reb} REB and {ast} AST.',
      '{teamName}\'s {playerName} is in a groove right now. League-best {pts} points per game this week with complementary numbers across the board.',
    ],
  },
];
