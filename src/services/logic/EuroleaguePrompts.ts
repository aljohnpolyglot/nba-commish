import { NBAPlayer } from '../../types';

export const getEuroleagueBuyoutPrompt = (player: NBAPlayer, teamName: string): string => {
    const prompts = [
        `BREAKING: ${player.name} is finalizing a buyout with his Euroleague club to sign with the ${teamName}. Sources tell ESPN.`,
        `Euroleague star ${player.name} is coming to the NBA. He has agreed to a deal with the ${teamName}, per sources.`,
        `The ${teamName} are adding international talent, signing ${player.name} from Europe.`,
        `After a standout season overseas, ${player.name} is returning to the NBA to join the ${teamName}.`,
        `Sources: ${player.name} has paid his buyout clause and will sign a contract with the ${teamName}.`,
        `The ${teamName} bolster their roster by acquiring ${player.name} from the Euroleague.`,
        `Official: ${player.name} is an NBA player again. He signs with the ${teamName}.`
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
};

export const getEuroleagueSocialReaction = (player: NBAPlayer, teamName: string): { handle: string, content: string }[] => {
    return [
        {
            handle: '@WojESPN',
            content: `Free agent guard ${player.name} has agreed to a deal with the ${teamName}, his agent tells ESPN. He spent last season in the EuroLeague.`
        },
        {
            handle: '@ShamsCharania',
            content: `The ${teamName} are signing ${player.name}, sources tell @TheAthletic. The former EuroLeague standout returns to the NBA.`
        },
        {
            handle: '@EuroHoopsnet',
            content: `BREAKING: ${player.name} leaves Europe to sign with the NBA's ${teamName}. A huge loss for his former club.`
        },
        {
            handle: '@DraftExpress',
            content: `${player.name} to the ${teamName} is a fascinating pickup. His efficiency in Europe was elite.`
        }
    ];
};
