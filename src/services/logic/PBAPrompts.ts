import { NBAPlayer } from '../../types';

export const getPBABuyoutPrompt = (player: NBAPlayer, teamName: string): string => {
    const prompts = [
        `BREAKING: PBA star ${player.name} is taking his talents to the NBA, signing with the ${teamName}.`,
        `The ${teamName} have agreed to a deal with Filipino standout ${player.name}.`,
        `From the Philippines to the Association: ${player.name} signs with the ${teamName}.`,
        `Sources: ${player.name} has cleared waivers from his PBA team and will join the ${teamName}.`,
        `The ${teamName} tap into the Asian market, acquiring ${player.name} from the PBA.`,
        `After dominating in the Philippines, ${player.name} gets his shot with the ${teamName}.`,
        `Official: ${player.name} is the latest international signing for the ${teamName}.`
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
};

export const getPBASocialReaction = (player: NBAPlayer, teamName: string): { handle: string, content: string }[] => {
    return [
        {
            handle: '@WojESPN',
            content: `The ${teamName} are finalizing a deal with ${player.name}, sources tell ESPN. He's a household name in the Philippines.`
        },
        {
            handle: '@ShamsCharania',
            content: `Filipino star ${player.name} is signing with the ${teamName}, per sources. A significant move for international basketball.`
        },
        {
            handle: '@PBAConnect',
            content: `History! ${player.name} is headed to the NBA to play for the ${teamName}. #PBA #NBA`
        },
        {
            handle: '@HoopsPH',
            content: `Lets go!! ${player.name} to the ${teamName}! 🇵🇭🏀`
        }
    ];
};
