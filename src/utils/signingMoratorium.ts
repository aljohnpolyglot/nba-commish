import type { LeagueStats, NBAPlayer } from '../types';
import { compareGameDates, getGameDateParts, parseGameDate, toISODateString } from './dateUtils';

export interface MoratoriumInput {
    signingDate: string;
    contractYears: number;
    salaryUSDFirstYear?: number;
    prevSalaryUSDFirstYear?: number;
    usedBirdRights?: boolean;
    isExtension?: boolean;
    isReSign?: boolean;
    isMinimum?: boolean;
    isTenDay?: boolean;
    isTwoWay?: boolean;
    isRookieScale?: boolean;
    isSignAndTradeOutgoing?: boolean;
    leagueStats?: LeagueStats;
}

const toISODate = (d: Date): string => {
    return toISODateString(d);
};

const addMonths = (d: Date, months: number): Date => {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
};

export function computeTradeEligibleDate(input: MoratoriumInput): string | undefined {
    if (!input.signingDate) return undefined;
    if (input.isMinimum || input.isTenDay || input.isTwoWay) return undefined;
    if (input.isSignAndTradeOutgoing) return undefined;
    if (input.isRookieScale && !input.isExtension) return undefined;

    const signed = parseGameDate(input.signingDate);
    if (Number.isNaN(signed.getTime())) return undefined;

    if (input.isExtension) {
        return toISODate(addMonths(signed, 6));
    }

    const { year, month, day } = getGameDateParts(signed);
    const afterSept15 = (month > 9) || (month === 9 && day > 15);
    if (afterSept15) {
        return toISODate(addMonths(signed, 3));
    }

    if (input.isReSign && input.usedBirdRights) {
        const prev = input.prevSalaryUSDFirstYear ?? 0;
        const cur = input.salaryUSDFirstYear ?? 0;
        const raiseOver120 = prev > 0 && cur > prev * 1.20;
        const oneYearDeal = (input.contractYears ?? 1) === 1;
        if (raiseOver120 || oneYearDeal) {
            return `${year + 1}-01-15`;
        }
    }

    return `${year}-12-15`;
}

export function isTradeEligible(player: NBAPlayer, currentDate: string, leagueStats?: LeagueStats): boolean {
    if (leagueStats?.postSigningMoratoriumEnabled === false) return true;
    const eligible = (player as any).tradeEligibleDate as string | undefined;
    if (!eligible) return true;
    if (!currentDate) return true;
    return compareGameDates(currentDate, eligible) >= 0;
}

export function tradeEligibleDateOf(player: NBAPlayer): string | undefined {
    return (player as any).tradeEligibleDate as string | undefined;
}
