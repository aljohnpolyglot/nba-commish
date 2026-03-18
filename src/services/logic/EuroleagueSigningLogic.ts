import { NBAPlayer } from '../../types';

export const calculateEuroleagueBuyout = (player: NBAPlayer): number => {
    // Buyout logic:
    // Base cost based on rating
    // 70+ OVR: $1M - $5M
    // <70 OVR: $250k - $1M
    
    const rating = player.overallRating;
    let buyout = 0;
    
    if (rating >= 80) {
        buyout = 3000000 + (rating - 80) * 500000; // $3M + $500k per point over 80
    } else if (rating >= 70) {
        buyout = 1000000 + (rating - 70) * 200000; // $1M + $200k per point over 70
    } else {
        buyout = 250000 + (rating - 50) * 50000; // $250k + $50k per point over 50
    }
    
    // Cap at $6M
    return Math.min(6000000, Math.max(250000, buyout));
};

export const calculateEuroleagueOverall = (ratings: any): number => {
    if (!ratings) return 60;
    
    // Attributes from BBGM
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

    // Weighted average favoring athleticism and shooting (modern game)
    // Formula: (Athleticism * 0.25) + (Shooting * 0.25) + (IQ * 0.2) + (Inside * 0.15) + (Defense * 0.15)
    
    const athleticism = (spd + jmp + endu + stre) / 4;
    const shooting = (fg + tp + ft) / 3;
    const iq = (oiq + diq + pss) / 3;
    const inside = (ins + dnk) / 2;
    const defense = (drb + reb + diq) / 3; // diq counted twice for importance
    
    let ovr = (athleticism * 0.25) + (shooting * 0.25) + (iq * 0.2) + (inside * 0.15) + (defense * 0.15);
    
    // Height bonus (BBGM heavily weights height)
    if (hgt > 60) ovr += (hgt - 60) * 0.2;
    
    // User Request: "add more tiers pls by increments of 5"
    
    let reduction = 0;
    
    if (ovr >= 80) reduction = 22;
    else if (ovr >= 75) reduction = 20;
    else if (ovr >= 70) reduction = 18;
    else if (ovr >= 65) reduction = 16;
    else if (ovr >= 60) reduction = 13;
    else if (ovr >= 55) reduction = 10;
    else if (ovr >= 50) reduction = 7;
    else if (ovr >= 45) reduction = 6;
    else reduction = 4; // < 45
    
    ovr = ovr - reduction;
    
    // Ensure we don't go below a reasonable floor (User requested 10)
    if (ovr < 10) ovr = 10;
    
    // Cap at 70 (approx NBA starter level) to prevent OP Euro players
    if (ovr > 70) ovr = 70;

    return Math.round(ovr);
};
