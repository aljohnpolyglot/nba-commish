import type { NewsTemplate } from '../newsTemplateTypes';

export const EVENT_NEWS_TEMPLATES: NewsTemplate[] = [
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
    category: 'all_star_bracket',
    headlines: [
      '{winner} Survives {loser} in All-Star {roundLabel}, {homeScore}-{awayScore}',
      'All-Star {roundLabel}: {winner} Knocks Off {loser} {homeScore}-{awayScore}',
      '{winner} Outlasts {loser} in All-Star {roundLabel} Showdown',
      '{winner} Tops {loser} {homeScore}-{awayScore} — {roundLabel} in the Books',
    ],
    contents: [
      '{winner} held off {loser} {homeScore}-{awayScore} in the All-Star {roundLabel}. {mvpName} led all scorers with {mvpPts} points.',
      'In the {year} All-Star {roundLabel}, {winner} edged {loser} {homeScore}-{awayScore} behind a {mvpPts}-point night from {mvpName}.',
      '{mvpName} dropped {mvpPts} as {winner} took down {loser} {homeScore}-{awayScore} in the All-Star {roundLabel}.',
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
      '{teamName} Move On — Take Down {opponentName} in {gamesCount}',
      '{teamName} Punch Their Ticket to the Second Round',
      'Next Round: {teamName} Dispatch {opponentName} in {gamesCount}',
    ],
    contents: [
      'The {teamName} are moving on. A {gamesCount}-game series win over the {opponentName} sends them to the Second Round of the playoffs.',
      'Resilient and relentless, the {teamName} closed out the {opponentName} in {gamesCount} games. The locker room celebration started before the final horn stopped echoing.',
      'It wasn\'t always pretty, but the {teamName} are into the Second Round after eliminating {opponentName} in Game {gamesCount}. The road continues.',
      'The {opponentName} put up a fight, but the {teamName} were simply too much. A series win in {gamesCount} games and they advance.',
    ],
  },
  {
    category: 'playoff_advance_r2',
    headlines: [
      'Conference Finals Bound! {teamName} Oust {opponentName} in {gamesCount}',
      '{teamName} Are Headed to the Conference Finals',
      'Conference Finals: {teamName} Dispatch {opponentName} in {gamesCount} Games',
      '{teamName} Advance — Conference Finals Await After {gamesCount}-Game Series',
    ],
    contents: [
      'The {teamName} are Conference Finals bound. A {gamesCount}-game series victory over the {opponentName} books their spot in the final four.',
      'The {teamName} got through the {opponentName} in {gamesCount} games. The Conference Finals are next, and the competition only gets tougher from here.',
      'Championship contender. The {teamName} punched their Conference Finals ticket after eliminating the {opponentName} in a {gamesCount}-game series.',
      '{teamName} keep climbing. They took down {opponentName} in {gamesCount} games and now set their sights on the Conference Finals.',
    ],
  },
  {
    category: 'playoff_finals_bound',
    headlines: [
      'HEADING TO THE NBA FINALS! {teamName} Eliminate {opponentName}',
      '{teamName} Are Going to the NBA Finals',
      'FINALS BOUND: {teamName} Take Down {opponentName} in {gamesCount}',
      '{teamName} Punch Their NBA Finals Ticket — Eliminate {opponentName} in {gamesCount}',
    ],
    contents: [
      'They\'re going to the NBA Finals. The {teamName} survived a brutal Conference Finals, eliminating the {opponentName} in {gamesCount} games. The Larry O\'Brien Trophy is one series away.',
      'THE {teamName} ARE GOING TO THE NBA FINALS. After {gamesCount} games against the {opponentName}, they punched their ticket to the biggest stage in basketball.',
      'The {teamName} are the latest team to earn a trip to the NBA Finals — and they had to go through the {opponentName} to get there. Championship or bust in {gamesCount} games.',
      'Conference Champions. The {teamName} shut out the {opponentName}\'s season and booked a Finals berth in {gamesCount} games. Now the real work begins.',
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
    category: 'series_alive',
    headlines: [
      'Still Alive! {teamName} Stave Off Elimination',
      '{teamName} Survive — Season Continues',
      'Not Done Yet: {teamName} Force Another Game Against {opponentName}',
      'Fight Night: {teamName} Refuse to Let Season End',
    ],
    contents: [
      "Nobody counted them out more than they did themselves. {teamName} won when they had to, keeping their {year} playoff run alive one more game against {opponentName}.",
      "The season is not over. {teamName} delivered a statement win, forcing {opponentName} to close them out in the next game. The pressure now flips.",
      "Down but not out. {teamName} staved off elimination with a crucial win over {opponentName}. Series continues.",
      "{teamName} showed the heart of a champion tonight. Facing elimination, they responded with a gutsy victory to stay alive in the series against {opponentName}.",
    ],
  },
  {
    category: 'series_comeback',
    headlines: [
      'Comeback Alert! {teamName} Even the Series',
      'Momentum Shift: {teamName} Tie It Up at {wins}-{wins}',
      '{teamName} Back in It — Series Now Tied {wins}-{wins}',
      'The Tide Has Turned: {teamName} Level the Series',
    ],
    contents: [
      "The {teamName} were counted out, but not anymore. They have evened the series at {wins}-{wins} and the complexion of this matchup has completely changed.",
      "Nobody believed in {teamName} — except {teamName}. A resilient win ties the series at {wins} apiece and sends this one to a deciding stretch.",
      "Massive swing in the series. {teamName} claw back to even the score at {wins}-{wins}. {opponentName} has to feel the momentum draining away.",
      "This series is very much alive. {teamName} answered every punch from {opponentName} to tie it up at {wins}-{wins}.",
    ],
  },
  {
    category: 'series_forces_game7',
    headlines: [
      'IT GOES TO GAME 7! {teamName} Force the Deciding Game',
      'Game 7 Is Happening — {teamName} Refuse to Fold',
      '{teamName} Push It to the Limit: Series Tied 3-3',
      'We Need a Game 7! {teamName} Even the Series Against {opponentName}',
    ],
    contents: [
      "The best outcome in basketball: a Game 7. {teamName} forced the decisive game after a must-win victory over {opponentName}. Winner-take-all is on the horizon.",
      "Winner take all. {teamName} were supposed to be finished, but they refused to accept elimination. Now a do-or-die Game 7 awaits against {opponentName}.",
      "Everyone gets what they wanted. {teamName} have forced a Game 7 against {opponentName} with a performance that will be remembered regardless of how this series ends.",
      "{teamName} came back from the brink to force Game 7 against {opponentName}. This is what the playoffs are about.",
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
];

