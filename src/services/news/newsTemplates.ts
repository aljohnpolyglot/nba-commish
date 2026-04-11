export type NewsCategory =
  | 'win_streak'
  | 'long_win_streak'
  | 'lose_streak'
  | 'streak_snapped'
  | 'monster_performance'
  | 'preseason_performance'
  | 'triple_double'
  | 'major_injury'
  | 'trade_rumor'
  | 'trade_confirmed'
  | 'signing_confirmed'
  | 'coach_hot_seat'
  | 'milestone'
  | 'batch_recap'
  | 'preseason_recap'
  | 'game_result'
  | 'duo_performance'
  | 'all_star_winner'
  | 'all_star_mvp'
  | 'playoff_series_win'
  | 'playoff_elimination'
  | 'nba_champion'
  | 'finals_mvp'
  | 'award_mvp'
  | 'award_dpoy'
  | 'award_roty'
  | 'award_allnba'
  | 'award_smoy'
  | 'award_mip'
  | 'award_coy'
  | 'team_feat';

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
  {
    category: 'all_star_winner',
    headlines: [
      '{conference} Wins {year} NBA All-Star Game {homeScore}–{awayScore}',
      'All-Star Classic Ends with {conference} Taking the Crown',
      '{year} NBA All-Star Game Final: {conference} Defeats {losingConf}',
      'What a Show! {conference} Claims All-Star Victory in {city}',
    ],
    contents: [
      'In front of a packed arena in {city}, the {conference} put on a show in the {year} NBA All-Star Game, defeating the {losingConf} {homeScore}–{awayScore} in a display of the league\'s finest talent.',
      'The {conference} outlasted the {losingConf} in the {year} NBA All-Star Game. Final: {homeScore}–{awayScore}. The crowd was electric from tip-off to the final buzzer.',
      '{year} All-Star Weekend closed on a high note as the {conference} topped the {losingConf} {homeScore}–{awayScore}. Another memorable showcase of the league\'s brightest stars.',
      'The {conference} dominated the second half to seal a {homeScore}–{awayScore} victory over the {losingConf} in the {year} NBA All-Star Game.',
    ],
  },
  {
    category: 'all_star_mvp',
    headlines: [
      '{playerName} Named MVP of the {year} NBA All-Star Game',
      'All-Star MVP: {playerName} Dazzles with {pts} Points',
      '{playerName} Owns the Stage at All-Star Weekend — MVP Award',
      'Unstoppable: {playerName} Earns All-Star Game MVP Honor',
    ],
    contents: [
      '{playerName} was the undisputed best player on the floor, dropping {pts} points with {reb} rebounds and {ast} assists to claim the {year} NBA All-Star Game MVP Award.',
      'The MVP trophy was never in doubt. {playerName} was a force of nature in the {year} All-Star Game, lighting up the crowd for {pts} points and walking away with the hardware.',
      'With {pts} points, {reb} boards and {ast} dimes, {playerName} of the {teamName} was the clear choice for All-Star MVP. A night nobody in attendance will forget.',
      '{playerName} turned the All-Star Game into a personal highlight reel — {pts} points, {reb} rebounds, {ast} assists — and the league\'s top prize to show for it.',
    ],
  },
  {
    category: 'playoff_series_win',
    headlines: [
      'Advance! {teamName} Eliminate {opponentName} in {gamesCount} Games',
      '{teamName} Move On: Series Win Over {opponentName}',
      '{teamName} Are Playoff Bound — Dispatch {opponentName} in {gamesCount}',
      'Next Round: {teamName} Take Down {opponentName} to Advance',
    ],
    contents: [
      'The {teamName} are moving on. A dominant {gamesCount}-game series win over the {opponentName} punches their ticket to the next round of the playoffs.',
      'Resilient and relentless, the {teamName} closed out the {opponentName} in {gamesCount} games. The locker room celebration started before the final horn stopped echoing.',
      'It wasn\'t always pretty, but the {teamName} are into the next round after eliminating {opponentName} in Game {gamesCount}. The road continues.',
      'The {opponentName} put up a fight, but the {teamName} were simply too much. A series win in {gamesCount} games keeps their championship dreams alive.',
    ],
  },
  {
    category: 'playoff_elimination',
    headlines: [
      'Season Over: {teamName} Eliminated by {opponentName}',
      'Heartbreak in {teamCity} — {teamName} Exit the Playoffs',
      '{teamName} Bow Out: Eliminated in {gamesCount} Games',
      'The Dream Ends Here: {teamName} Fall to {opponentName}',
    ],
    contents: [
      'The final buzzer sounded, and the {teamName}\'s season is finished. They fall to the {opponentName} in {gamesCount} games. Questions about the offseason start now.',
      'A gut-wrenching ending for {teamCity}. The {teamName} are eliminated, their season done after {gamesCount} games against the {opponentName}. The locker room was silent.',
      'It ends here. The {teamName}, once one of the favorites, bow out in {gamesCount} games to the {opponentName}. Tough exit for a squad with high expectations.',
      'Fans in {teamCity} are left wondering what could have been. The {teamName}\'s playoff run ends at the hands of the {opponentName} after {gamesCount} games.',
    ],
  },
  {
    category: 'nba_champion',
    headlines: [
      'CHAMPIONS! {teamName} Win the {year} NBA Title',
      'Back-to-Back Reality? No — {teamName} Are the {year} NBA Champions',
      '{teamName} Hoist the Larry O\'Brien Trophy — {year} Champions',
      'Dynasty? {teamName} Capture the {year} NBA Championship',
    ],
    contents: [
      'It is official. The {teamName} are the {year} NBA Champions. Confetti rained down as the Larry O\'Brien Trophy was brought to center court. {teamCity} is going absolutely wild tonight.',
      'After a {gamesCount}-game Finals battle, the {teamName} have done it. They are the {year} NBA Champions. A city, a franchise, and a fanbase can exhale — this one is for the ages.',
      'The final buzzer sealed one of the most memorable championship runs in recent memory. The {teamName} are your {year} NBA Champions, defeating the {opponentName} in the Finals.',
      'Championship night in {teamCity}. The {teamName} captured the {year} NBA title, and the celebration will last for days. A worthy champion at the end of a spectacular season.',
    ],
  },
  {
    category: 'finals_mvp',
    headlines: [
      '{playerName} Named {year} NBA Finals MVP',
      'Finals MVP: {playerName} Leads {teamName} to the Title',
      '{playerName} Claims the Bill Russell Trophy — Finals MVP',
      'The Best Player of the Playoffs Was {playerName} — Finals MVP',
    ],
    contents: [
      '{playerName} was the engine behind the {teamName}\'s championship run, averaging {pts} PPG in the Finals and earning the Bill Russell NBA Finals MVP Award.',
      'Clutch performances, big moments, and elite two-way basketball. {playerName} did it all in the Finals, and the MVP trophy belongs in {teamCity}.',
      'Bill Russell Award: {playerName}. The {teamName} star was simply on a different level throughout the series, averaging {pts} points per game in the championship round.',
      '{playerName} is Finals MVP. In a series that demanded greatness, {playerName} answered the call — and so did the {teamName}. Champions.',
    ],
  },
  {
    category: 'award_mvp',
    headlines: [
      '{playerName} Wins the {year} NBA Most Valuable Player Award',
      'MVP: {playerName} of the {teamName} Takes Home the Award',
      '{playerName} Named {year} NBA MVP — A Dominant Season Rewarded',
      'The League\'s Best Player: {playerName} Wins the {year} MVP',
    ],
    contents: [
      '{playerName} is the {year} NBA Most Valuable Player. The {teamName} star had a remarkable season — {pts} PPG, {reb} RPG, {ast} APG — and the voters made the right call.',
      'After a campaign that sparked debate all season long, {playerName} has been officially named the {year} NBA MVP. The {teamName} led the league in multiple categories on the back of their superstar\'s relentless play.',
      'The award was never really in doubt. {playerName} of the {teamName} claimed the {year} MVP trophy after one of the most dominant seasons in recent memory: {pts}/{reb}/{ast} per game.',
      '{playerName} is your {year} Most Valuable Player. The {teamName} forward/guard elevated his game when it mattered most, and the league recognized it with the game\'s highest individual honor.',
    ],
  },
  {
    category: 'award_dpoy',
    headlines: [
      '{playerName} Named {year} Defensive Player of the Year',
      'DPOY: {playerName} Wins the League\'s Top Defensive Honor',
      '{playerName} of {teamName} Earns {year} DPOY Award',
      'Lockdown: {playerName} Claims the {year} Defensive Player of the Year',
    ],
    contents: [
      'Defense wins championships — and this season, it earned {playerName} of the {teamName} the {year} Defensive Player of the Year award. The rim protection, the chase-down blocks, the relentless effort.',
      '{playerName} has been named the {year} Defensive Player of the Year. The {teamName} anchor was the most disruptive defensive force in the league this season, making life miserable for opponents every night.',
      'A deserving winner. {playerName} takes home the {year} DPOY trophy after a season in which the {teamName} built their defensive identity around his effort and IQ on that end of the floor.',
    ],
  },
  {
    category: 'award_roty',
    headlines: [
      '{playerName} Wins the {year} NBA Rookie of the Year',
      'ROTY: {playerName} Claims Rookie of the Year Honors',
      '{playerName} of the {teamName} Named {year} Rookie of the Year',
      'The Future Is Now: {playerName} Wins {year} NBA Rookie of the Year',
    ],
    contents: [
      '{playerName} is the {year} Rookie of the Year. The {teamName} first-year player had a sensational debut — {pts} PPG, {reb} RPG, {ast} APG — and left no doubt about who deserved the award.',
      'Welcome to the NBA. {playerName} of the {teamName} has earned Rookie of the Year honors after a debut season that exceeded every expectation. The future is very bright.',
      'The {year} Rookie of the Year is {playerName}. The {teamName} star rewrote the script for first-year players, showing poise, production, and an elite ceiling from day one.',
    ],
  },
  {
    category: 'award_allnba',
    headlines: [
      '{year} All-NBA Teams Announced',
      'NBA Reveals {year} All-NBA Selections',
      'All-NBA First Team Led by {playerName}',
      '{year} All-NBA Honors: First Team Released',
    ],
    contents: [
      'The {year} All-NBA First Team has been announced. Leading the selections is {playerName} of the {teamName}, who had one of the finest individual seasons in recent memory.',
      'All-NBA honors are out for {year}. The first team features {playerName} of the {teamName} alongside the league\'s other elite performers from a compelling regular season.',
      'The {year} All-NBA teams are set. {playerName} headlines a first team that represents the best the league had to offer this season.',
    ],
  },
  {
    category: 'award_smoy',
    headlines: [
      '{playerName} Wins the {year} Sixth Man of the Year Award',
      'SMOY: {playerName} Earns Sixth Man Honors for {year}',
      '{playerName} of the {teamName} Named {year} Sixth Man of the Year',
    ],
    contents: [
      '{playerName} is the {year} Sixth Man of the Year. Coming off the bench every night, the {teamName} spark plug averaged {pts} PPG and changed games from the moment he checked in.',
      'The best player not in the starting lineup is {playerName}, and the voters confirmed it. The {teamName} reserve claims the {year} Sixth Man of the Year trophy after a season of high-impact minutes and clutch buckets.',
      '{playerName} made starting lineups look foolish night after night. The {teamName} sixth man wins the {year} SMOY award in a season that proved the second unit can carry a team as well as any starter.',
    ],
  },
  {
    category: 'award_mip',
    headlines: [
      '{playerName} Named {year} Most Improved Player',
      'MIP: {playerName} Wins the Award for Biggest Leap',
      '{playerName} of the {teamName} Claims {year} Most Improved Player',
      'From Overlooked to Elite — {playerName} Is Your {year} MIP',
    ],
    contents: [
      'Nobody saw this coming — or maybe they should have. {playerName} of the {teamName} is the {year} Most Improved Player after a season that left the league scrambling to adjust. {pts} points per game, a completely revamped skill set, and a hunger that never let up.',
      'The {year} MIP belongs to {playerName}. The {teamName} forward/guard was one thing a year ago and something else entirely this season — the improvement was real, the production followed, and the award is deserved.',
      '{playerName} put in the work in the offseason and it showed all year long. The {teamName} star claims the {year} Most Improved Player award after one of the more striking individual jumps in recent memory.',
    ],
  },
  {
    category: 'award_coy',
    headlines: [
      '{coachName} Named {year} NBA Coach of the Year',
      'COY: {coachName} Wins Coaching Award for {year}',
      '{teamName}\'s {coachName} Earns {year} Coach of the Year',
      'The Best Coach in Basketball: {coachName} Takes Home the {year} COY',
    ],
    contents: [
      '{coachName} is your {year} Coach of the Year. The {teamName} finished {wins}-{losses}, and the system, adjustments, and locker room culture that produced that record all point back to one person.',
      'From the bench up, {coachName} built something with the {teamName} this season that most didn\'t see coming. A {wins}-win season and the {year} Coach of the Year award are the result.',
      'Give credit to the mastermind. {coachName} of the {teamName} claims the {year} Coach of the Year award after guiding this squad through a season full of challenges and turning them into one of the league\'s best stories.',
    ],
  },
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
