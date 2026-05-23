import type { NewsTemplate } from '../newsTemplateTypes';

export const AWARD_NEWS_TEMPLATES: NewsTemplate[] = [
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
];

