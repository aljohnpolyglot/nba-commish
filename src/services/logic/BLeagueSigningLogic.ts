import { NBAPlayer } from '../../types';

export const calculateBLeagueBuyout = (player: NBAPlayer): number => {
    const rating = player.overallRating;
    let buyout = 0;

    if (rating >= 75) {
        buyout = 1000000 + (rating - 75) * 250000;
    } else if (rating >= 65) {
        buyout = 500000 + (rating - 65) * 100000;
    } else {
        buyout = 100000 + (rating - 50) * 25000;
    }

    return Math.min(3000000, Math.max(100000, buyout));
};

export const calculateBLeagueOverall = (ratings: any): number => {
    if (!ratings) return 50;

    const hgt = ratings.hgt || 50;
    const stre = ratings.stre || 50;
    const spd = ratings.spd || 50;
    const jmp = ratings.jmp || 50;
    const endu = ratings.endu || 50;
    const ins = ratings.ins || 50;
    const dnk = ratings.dnk || 50;
    const ft = ratings.ft || 50;
    const fg = ratings.fg || 50;
    const tp = ratings.tp || 50;
    const oiq = ratings.oiq || 50;
    const diq = ratings.diq || 50;
    const drb = ratings.drb || 50;
    const pss = ratings.pss || 50;
    const reb = ratings.reb || 50;

    const athleticism = (spd + jmp + endu + stre) / 4;
    const shooting = (fg + tp + ft) / 3;
    const iq = (oiq + diq + pss) / 3;
    const inside = (ins + dnk) / 2;
    const defense = (drb + reb + diq) / 3;

    let ovr = (athleticism * 0.25) + (shooting * 0.25) + (iq * 0.2) + (inside * 0.15) + (defense * 0.15);

    if (hgt > 60) ovr += (hgt - 60) * 0.2;

    let reduction = 0;
    if (ovr >= 75) reduction = 18;
    else if (ovr >= 70) reduction = 16;
    else if (ovr >= 65) reduction = 13;
    else if (ovr >= 60) reduction = 10;
    else if (ovr >= 55) reduction = 7;
    else if (ovr >= 50) reduction = 4;
    else if (ovr >= 45) reduction = 1;
    else reduction = 0;

    ovr = ovr - reduction;

    if (ovr < 10) ovr = 10;
    if (ovr > 75) ovr = 75;

    return Math.round(ovr);
};
