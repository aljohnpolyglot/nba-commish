// import { SocialTemplate } from '../types';
// import { isVeteran, isAllStar } from '../helpers';

// export const WOJNAROWSKI_TEMPLATES: SocialTemplate[] = [
//     {
//         id: 'woj_commissioner',
//         handle: 'woj',
//         template: "Commissioner {{commissioner_name}} was in {{city}} tonight for {{team}}-{{opponent}} to evaluate game operations and officiating standards. League sources say the visit is the first of several planned 'unannounced' stops. {{team}} takes the win, {{winner_score}}-{{loser_score}}.",
//         priority: 70,
//         condition: (ctx) => !ctx.player && ctx.game.winnerId === ctx.team?.id && Math.random() < 0.05
//     },
//     {
//         id: 'woj_star_season_ending',
//         handle: 'woj',
//         template: (ctx) => {
//             const templates = [
//                 "Sources: A devastating blow for the {{team}} as an MRI reveals star player {{player}} has suffered a season-ending {{injury_type}}. The team's championship aspirations take a monumental hit.",
//                 "Just in: {{team}} All-Star {{player}} will miss the remainder of the season with a torn {{injury_type}}, league sources tell ESPN. A brutal end to a spectacular year.",
//                 "The landscape of the league has shifted. {{player}} is officially out for the season with a {{injury_type}}. A devastating diagnosis for the {{team}} superstar.",
//                 "Confirmed by the team: {{player}}'s season is over. The injury sustained last night was diagnosed as a severe {{injury_type}}, requiring a long-term recovery.",
//                 "A massive loss for the sport this season. {{player}}, one of the league's premier talents, will not return this year due to a significant {{injury_type}}."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 100,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.player.overallRating >= 85 && ctx.injury.gamesRemaining > 50
//     },
//     {
//         id: 'woj_veteran_season_ending',
//         handle: 'woj',
//         template: (ctx) => {
//             const templates = [
//                 "At {{age}} years old, you have to wonder what's next for {{player}}. A season-ending {{injury_type}} is a devastating blow for the respected veteran.",
//                 "Sources: {{age}}-year-old veteran {{player}}'s season is over due to a {{injury_type}}. A difficult setback at this stage of his distinguished career.",
//                 "Heartbreaking news for {{player}}. The {{age}}-year-old fan favorite faces a long recovery after a season-ending {{injury_type}}, raising questions about his future in the league.",
//                 "The {{team}} announce {{player}} will miss the rest of the season. For a {{age}}-year-old player, a major {{injury_type}} is an especially tough hurdle to overcome.",
//                 "After {{seasons}} seasons in the league, {{age}}-year-old {{player}} suffers a major {{injury_type}}. You just hope this isn't the last we've seen of him on a basketball court."
//             ];
//             return templates[Math.floor(Math.random() * templates.length)];
//         },
//         priority: 100,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && isVeteran(ctx.player) && ctx.injury.gamesRemaining > 50
//     },
//     {
//         id: 'woj_major_injury',
//         handle: 'woj',
//         template: (ctx) => {
//             if (ctx.injury.injuryType === 'Load Management') {
//                 return "ESPN Sources: The {{team}} are holding out {{player}} tonight against the {{opponent}} for injury management.";
//             }
//             return "ESPN Sources: {{team}}'s {{player}} has sustained a {{injury_type}} and will be sidelined indefinitely. A timeline for his return will be established after further evaluation.";
//         },
//         priority: 95,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.player.overallRating >= 80 && ctx.injury.gamesRemaining > 15
//     },
//     {
//         id: 'woj_minor_injury',
//         handle: 'woj',
//         template: "ESPN Sources: {{team}}'s {{player}} will miss {{games_missed}} games with a {{injury_type}}.",
//         priority: 90,
//         condition: (ctx) => !!ctx.injury && !!ctx.player && ctx.injury.gamesRemaining > 0 && ctx.injury.gamesRemaining <= 15
//     }
// ];
