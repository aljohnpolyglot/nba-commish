import { SocialTemplate } from '../../../types';

export const SHITPOST_TEMPLATES: SocialTemplate = {
  category: 'Shitpost',
  templates: [
    "I've seen enough. {player} is the GOAT. Don't @ me. 🐐",
    "The {opponent} front office watching {player} drop {stats} like: 👁️👄👁️",
    "Imagine thinking {player} isn't elite in {year}. Couldn't be me.",
    "The scriptwriters went crazy with this {team} win tonight. ✍️🔥",
    "My parlay was one {player} rebound away from greatness. I'm sick. 🤮",
    "The {team} really thought they had a chance today. That's cute. 😂",
    "Watching {player} play basketball is like watching a master at work. Or a glitch in the matrix."
  ]
};

export const BAD_GAME_TEMPLATES: SocialTemplate = {
  category: 'Shitpost',
  handleId: 'nbacentel',
  templates: [
    "BREAKING: {player} has been arrested for stealing money from the {team} organization tonight.\n\n{stats}\n{fgm}/{fga} FG\n{threePm}/{threePa} 3PT\n\nGenerational heist.",
    "Sources: {player} is being investigated for point shaving after this performance:\n\n{stats}\n{tov} Turnovers\n{fgm}-{fga} FG\n\nUnbelievable.",
    "REPORT: The {team} are considering waiving {player} immediately following tonight's disaster class.\n\n{stats}\nCardio session.",
    "StatMuse: {player} tonight:\n\n{pts} PTS\n{fgm}-{fga} FG\n{threePm}-{threePa} 3P\n\nBetter than Michael Jordan?"
  ]
};

export const DEFENSIVE_MASTERCLASS_TEMPLATES: SocialTemplate = {
  category: 'Shitpost',
  handleId: 'brickmuse',
  templates: [
    "{player} tonight:\n\n{pts} PTS\n{fgm}-{fga} FG\n\nClamped by {opponent} defense. 🔒",
    "Building a house tonight 🧱\n\n{player}:\n{fgm}/{fga} FG\n{threePm}/{threePa} 3P\n\nRough.",
    "Tony Snell statline from {player}?\n\n{stats}\n\nRunning around doing nothing."
  ]
};
