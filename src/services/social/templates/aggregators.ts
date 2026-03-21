// import { SocialTemplate } from '../types';

// export const AGGREGATOR_TEMPLATES: SocialTemplate[] = [
//     {
//         id: 'br_star_injury',
//         handle: 'bleacher_report',
//         template: (ctx) => {
//             const templates = [
//                 "Sources: A devastating blow for the {{team}} as an MRI reveals star player {{player}} has suffered a season-ending {{injury_type}}. The team's championship aspirations take a monumental hit.",
//                 "The landscape of the league has shifted. {{player}} is officially out for the season with a {{injury_type}}. A devastating diagnosis for the {{team}} superstar.",
//                 "A massive loss for the sport this season. {{player}}, one of the league's premier talents, will not return this year due to a significant {{injury_type}}.",
//                 "A crushing blow to the {{team}}'s title aspirations. Key starter {{player}} will miss the remainder of the playoffs with a {{injury_type}}."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 85,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.player.overallRating >= 85 && ctx.injury.gamesRemaining > 30
//     },
//     {
//         id: 'sc_significant_time',
//         handle: 'sportscenter',
//         template: (ctx) => {
//             const templates = [
//                 "The {{team}} announced that {{player}} is out indefinitely with a {{injury_type}}. No timetable for his return has been set.",
//                 "Devastating news: {{player}} will be re-evaluated in 'several weeks' after suffering a {{injury_type}}. He's expected to miss significant time.",
//                 "The {{team}} will have to cope without {{player}} for the foreseeable future. He's been sidelined indefinitely with a {{injury_type}}.",
//                 "There is no clear timeline for {{player}}'s return from a {{injury_type}}, sources say. The team is calling him out indefinitely."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 80,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.injury.gamesRemaining > 20
//     },
//     {
//         id: 'central_season_ending',
//         handle: 'nba_central',
//         template: (ctx) => {
//             const templates = [
//                 "The {{team}} announced today that forward {{player}} will miss the remainder of the season after undergoing surgery for a {{injury_type}}.",
//                 "Tough break for {{player}}, who is officially out for the season, the team says. He's expected to make a full recovery for next year's training camp.",
//                 "Roster Update: {{player}}'s {{injury_type}} was more severe than anticipated. He has been ruled out for the rest of the campaign.",
//                 "Injury update from the {{team}}: {{player}} will be sidelined for the remainder of the season with a {{injury_type}}."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 80,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.injury.gamesRemaining > 50
//     },
//     {
//         id: 'pr_short_term',
//         handle: 'nba_pr',
//         template: (ctx) => {
//             const templates = [
//                 "{{player}} is listed as OUT for tonight's game with a minor {{injury_type}}. Expect him to miss the next {{games_missed}} games as well.",
//                 "Injury Report: {{player}} ({{injury_type}}) – OUT. He will not travel with the team for their short {{games_missed}}-game trip.",
//                 "The {{team}} announce {{player}} is dealing with a {{injury_type}} and will be reevaluated in a few days. He's expected to miss {{games_missed}} games.",
//                 "{{player}} (minor {{injury_type}}) has been ruled OUT for the next stretch of games. Timeline: {{games_missed}} games."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 80,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.injury.gamesRemaining > 0 && ctx.injury.gamesRemaining <= 5
//     },
//     {
//         id: 'hoop_central_narrative',
//         handle: 'hoop_central',
//         template: (ctx) => {
//             const templates = [
//                 "Just a tough, tough break for {{player}}. After finally carving out a consistent role in the rotation, a {{injury_type}} will sideline him for several weeks.",
//                 "The {{team}} just cannot catch a break. The injury bug bites again, this time taking key role player {{player}} with a {{injury_type}}.",
//                 "You have to feel for {{player}}. He was playing the best basketball of his career before this unfortunate {{injury_type}} setback.",
//                 "Brutal timing. {{player}} was really starting to find his rhythm with the second unit before being sidelined with a {{injury_type}}."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 70,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.player.overallRating < 80 && ctx.injury.gamesRemaining > 10
//     },
//     {
//         id: 'statmuse_injury_stats',
//         handle: 'statmuse',
//         template: (ctx) => {
//             return `The {{team}} with {{player}} this season:\n\n{{winner_score}}-{{loser_score}} record\nTop 10 defense\n\nWith {{player}} out for {{games_missed}} games ({{injury_type}}), how does {{city}} respond? 🧐`;
//         },
//         priority: 85,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.player.overallRating >= 85 && ctx.injury.gamesRemaining > 5
//     }
// ];
