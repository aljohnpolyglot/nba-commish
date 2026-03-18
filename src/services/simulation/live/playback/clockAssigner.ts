import { Possession, Period } from './possessionTypes';

export function assignClocks(
  possessions: Possession[],
  quarterDuration: number = 720,
  qStartGs: number = 0,
  periodLabel: Period = '1ST'
): void {
  const qLen = quarterDuration;
  const n = possessions.length;
  if (n === 0) return;

  possessions.forEach((poss, i) => {
    let baseGs: number;
    
    // Check if it's a late game situation (last quarter or OT)
    // We'll assume if qLen is 300 it's OT, or if qStartGs >= 2160 it's Q4+
    const isLateQuarter = qLen === 300 || qStartGs >= 2160;

    if (isLateQuarter) {
      // Compress last 2 minutes (120 seconds)
      const earlyLen = qLen - 130; 
      const lateLen = 105;         
      
      const earlyIntegral = earlyLen / 14;
      const lateIntegral = lateLen / 8;
      const totalIntegral = earlyIntegral + lateIntegral;
      
      const y = (i / Math.max(n - 1, 1)) * totalIntegral;
      
      if (y <= earlyIntegral) {
        baseGs = qStartGs + 10 + y * 14;
      } else {
        baseGs = qStartGs + (qLen - 120) + (y - earlyIntegral) * 8;
      }
    } else {
      const usableLen = qLen - 25; 
      baseGs = qStartGs + 10 + (i / Math.max(n - 1, 1)) * usableLen;
    }
    
    const isLateGame = isLateQuarter && (baseGs - qStartGs) > (qLen - 120);
    const jitter = (Math.random() - 0.5) * (isLateGame ? 4 : 8);
    let gs = baseGs + jitter;
    
    gs = Math.max(qStartGs + 5, Math.min(qStartGs + qLen - 5, gs));
    
    const tiq = qLen - (gs - qStartGs);
    const mins = Math.floor(tiq / 60);
    const secs = Math.floor(tiq % 60);
    const clock = mins + ':' + secs.toString().padStart(2, '0');
    
    poss.gs = gs;
    poss.clock = clock;
    poss.period = periodLabel;
  });
}
