export const calculatePBAOverall = (ratings: any): number => {
    if (!ratings) return 50;
    
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
    
    // PBA players are generally lower rated than NBA stars.
    // User Request: "add more tiers pls by increments of 5"
    
    let reduction = 0;
    
    if (ovr >= 75) reduction = 30;
    else if (ovr >= 70) reduction = 27;
    else if (ovr >= 65) reduction = 24;
    else if (ovr >= 60) reduction = 21;
    else if (ovr >= 55) reduction = 18;
    else if (ovr >= 50) reduction = 15;
    else if (ovr >= 45) reduction = 12;
    else reduction = 7; // < 45
    
    ovr = ovr - reduction;
    
    // Floor at 10 (User requested)
    if (ovr < 10) {
        ovr = 10;
    }
    
    // Cap at 65 (approx NBA deep bench/role player level) to prevent OP PBA players unless exceptional
    if (ovr > 65) ovr = 65;

    return Math.round(ovr);
};
