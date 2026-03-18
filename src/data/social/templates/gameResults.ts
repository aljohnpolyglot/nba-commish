import { SocialTemplate } from '../../../types';

export const GAME_RESULT_TEMPLATES: SocialTemplate = {
  category: 'GameResult',
  templates: [
    "FINAL: {team} ({score}) def. {opponent} ({opponentScore}). {stats}",
    "The {team} take care of business against {opponent}! Final score: {score}-{opponentScore}. {player} led the way with {stats}.",
    "Statement win for the {team} tonight in {city}! They knock off {opponent} {score}-{opponentScore}.",
    "Tough loss for {opponent} as {team} pulls away late. {score}-{opponentScore} final.",
    "The {team} defense was the story tonight, holding {opponent} to just {opponentScore} points in the win.",
    "Dominant performance by {player} ({stats}) as the {team} cruise past {opponent}, {score}-{opponentScore}.",
    "{player} was too much for {opponent} tonight, leading {team} to a {score}-{opponentScore} victory with {stats}.",
    "The {team} get the W in {city}, but the headline is {player}'s incredible {stats} against {opponent}.",
    "What a game! {team} edge out {opponent} {score}-{opponentScore}. {player} was clutch.",
    "The {team} continue their hot streak, taking down {opponent} {score}-{opponentScore}.",
    "A hard-fought battle in {city} ends with a {team} victory, {score}-{opponentScore}.",
    "{opponent} couldn't contain {player} tonight. {team} wins {score}-{opponentScore}."
  ]
};

export const BOX_SCORE_TEMPLATES: SocialTemplate = {
  category: "GameResult_BoxScore",
  templates: [
    "FINAL: {winner} ({winnerScore}) def. {loser} ({loserScore})\n{p1Name}: {p1Stats}\n{p2Name}: {p2Stats}\n{p3Name}: {p3Stats}",
    "Game Summary:\n{winner} {winnerScore}, {loser} {loserScore}\n\nTop Performers:\n{p1Name} - {p1Stats}\n{p2Name} - {p2Stats}\n{p3Name} - {p3Stats}",
    "{winner} take down {loser} {winnerScore}-{loserScore}!\n\n📊 {p1Name}: {p1Stats}\n📊 {p2Name}: {p2Stats}\n📊 {p3Name}: {p3Stats}",
    "Box Score:\n{winner} {winnerScore} - {loser} {loserScore}\n\n{p1Name}: {p1Stats}\n{p2Name}: {p2Stats}",
    "Final score from {city}:\n{winner} {winnerScore}\n{loser} {loserScore}\n\n{p1Name} was on fire: {p1Stats}"
  ]
};

export const STATMUSE_BOX_SCORE: SocialTemplate = {
  category: "GameResult_BoxScore",
  handleId: "statmuse",
  templates: [
    "{p1Name} tonight:\n\n{p1Stats}\n\nDominant.",
    "{winner} win.\n\n{p1Name}:\n{p1Stats}\n\n{p2Name}:\n{p2Stats}\n\nEfficiency.",
    "Is {p1Name} the MVP?\n\n{p1Stats}\n\nLed {winner} to a {winnerScore}-{loserScore} W."
  ]
};

export const LEGION_HOOPS_BOX_SCORE: SocialTemplate = {
  category: "GameResult_BoxScore",
  handleId: "legionhoops",
  templates: [
    "FINAL: {winner} ({winnerScore}) def. {loser} ({loserScore})\n\n{p1Name}: {p1Stats}\n{p2Name}: {p2Stats}\n{p3Name}: {p3Stats}\n\nThoughts? 👇",
    "REPORT: {winner} defeat {loser} {winnerScore}-{loserScore}.\n\nTop performers:\n🔥 {p1Name}: {p1Stats}\n🔥 {p2Name}: {p2Stats}\n\nAre they contenders?",
    "The {winner} are SCARY.\n\nBeat {loser} {winnerScore}-{loserScore} tonight.\n\n{p1Name} dropped {p1Stats}."
  ]
};

export const SKIP_BAYLESS_INSIDER: SocialTemplate = {
  category: "GameResult_Insider",
  handleId: "skipbayless",
  templates: [
    "I'm not impressed by {winner}'s win over {loser}. {p1Name} had {p1Stats}, but where was the CLUTCH gene? Michael Jordan would have won by 30!",
    "Typical {loser}. Choking against {winner} despite {p1Name} only getting {p1Stats}. LeBron would never let this happen (unless he was tired).",
    "{p1Name} puts up empty stats ({p1Stats}) in a meaningless win over {loser}. Wake me up when it's the playoffs!"
  ]
};

export const INSIDER_GAME_TEMPLATES: SocialTemplate = {
  category: "GameResult_Insider",
  templates: [
    "Sources: {winner} locker room was 'ecstatic' after {winnerScore}-{loserScore} win over {loser}. {p1Name} ({p1Stats}) led the charge.",
    "Developing: {loser} holding a closed-door meeting after {winnerScore}-{loserScore} loss to {winner}. {p1Name} dropped {p1Stats}.",
    "Statement game from {winner} ({winnerScore}-{loserScore}). Scouts were impressed by {p1Name}'s {p1Stats} tonight against {loser}.",
    "The {winner} front office watching {p1Name} drop {p1Stats} like: 👁️👄👁️"
  ]
};

export const WOJ_INSIDER: SocialTemplate = {
  category: "GameResult_Insider",
  handleId: "woj",
  templates: [
    "Sources: [Team] is finalizing a deal to acquire [Player]. Details to come.",
    "The [Team] have been aggressive in trade talks, sources tell ESPN.",
    "League sources: [Team] is expected to be active at the deadline."
  ]
};

export const SHAMS_INSIDER: SocialTemplate = {
  category: "GameResult_Insider",
  handleId: "shams",
  templates: [
    "Breaking: [Team] has agreed to a deal with [Player]. 🚨",
    "Sources: [Team] is making moves. Details on the way.",
    "All-Star guard [Player] has agreed to a contract extension, sources tell The Athletic."
  ]
};
