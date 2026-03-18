const scheduleCache = new WeakMap<object, { n: string; start: number; end: number }[]>();

export const parseMin = (s: string | number): number => {
  if (!s) return 0;
  if (typeof s === 'number') return s;
  const [m, sec] = s.split(':').map(Number);
  return m + (sec || 0) / 60;
};

export class RotationService {

  static getLineupAtTime(roster: any[], timeInSeconds: number, scoreDiff: number): any[] {
    if (!scheduleCache.has(roster)) {
      scheduleCache.set(roster, RotationService._buildSchedule(roster));
    }
    const schedule = scheduleCache.get(roster)!;
    const rosterMap = new Map(roster.map((p: any) => [p.n, p]));
    // Allow up to 3 OT periods (2880 + 3×300 = 3780)
    const t = Math.min(Math.max(Math.floor(timeInSeconds), 0), 3779);

    const active = schedule
      .filter(w => t >= w.start && t < w.end)
      .map(w => rosterMap.get(w.n))
      .filter(Boolean) as any[];

    if (active.length >= 5) {
      return [...active]
        .sort((a: any, b: any) => {
          // Prefer players whose window is tightly centered on this time
          // (i.e. they're "mid-shift" not just barely starting or ending)
          const scheduleA = schedule.find((w: any) => w.n === a.n)!;
          const scheduleB = schedule.find((w: any) => w.n === b.n)!;
          const midA = Math.abs(t - (scheduleA.start + scheduleA.end) / 2);
          const midB = Math.abs(t - (scheduleB.start + scheduleB.end) / 2);
          return midA - midB;
        })
        .slice(0, 5);
    }

    // Only pad with players whose window covers this time
    const activeNames = new Set(active.map((p: any) => p.n));
    const lineup = [...active];
    const sched = scheduleCache.get(roster)!;
    
    for (const p of [...roster].sort((a, b) => parseMin(b.min) - parseMin(a.min))) {
      if (lineup.length >= 5) break;
      if (activeNames.has(p.n)) continue;
      const w = sched.find((w: any) => w.n === p.n);
      if (!w) continue;
      // Only add if this time is within 60s of their window (grace period)
      if (t >= w.start - 60 && t < w.end + 60) {
        lineup.push(p);
        activeNames.add(p.n);
      }
    }

    // Last resort — if still under 5, pull from starters only
    if (lineup.length < 5) {
      for (const p of [...roster].sort((a, b) => parseMin(b.min) - parseMin(a.min))) {
        if (lineup.length >= 5) break;
        if (!activeNames.has(p.n)) {
          lineup.push(p);
          activeNames.add(p.n);
        }
      }
    }
    return lineup.filter(p => !p.fouledOut);
  }

  private static _buildSchedule(roster: any[]): { n: string; start: number; end: number }[] {
    const SEG = 60, TOTAL = 2880; // base game only — OT players recycle starters
    const NSEGS = 48; // rotation schedule covers regulation only

    // Sort by minutes descending — highest minutes = starter
    const players = [...roster]
      .filter(p => parseMin(p.min) > 0)
      .sort((a, b) => parseMin(b.min) - parseMin(a.min));

    if (players.length === 0) return roster.map(p => ({ n: p.n, start: 0, end: 0 }));

    // OVR from player ratings if available, else fallback to minutes rank
    const getOvr = (p: any): number =>
      p.ovr ?? p.ratings?.[p.ratings.length - 1]?.ovr ?? (80 - players.indexOf(p));

    const byOvr = [...players].sort((a, b) => getOvr(b) - getOvr(a));
    const starters = new Set(byOvr.slice(0, 5).map(p => p.n));
    const bench = byOvr.filter(p => !starters.has(p.n));
    const benchByLowOvr = [...bench].sort((a, b) => getOvr(a) - getOvr(b));

    const budgets = new Map(players.map(p => [p.n, Math.round(parseMin(p.min) * 60)]));
    const remaining = new Map(players.map(p => [p.n, Math.round(parseMin(p.min) * 60)]));
    const onFloor: Set<string>[] = Array.from({ length: NSEGS }, () => new Set());

    // Detect blowout from scoreDiff stored on pool players (passed via getLineupAtTime)
    // We use min distribution as proxy: if bench has lots of mins → blowout
    const totalBenchMins = bench.reduce((s, p) => s + parseMin(p.min), 0);
    const totalMins = players.reduce((s, p) => s + parseMin(p.min), 0);
    const isBlowout = totalMins > 0 && (totalBenchMins / totalMins) > 0.42;

    const GARBAGE_START = isBlowout ? 36 : 48;

    const consume = (name: string) => {
      const r = remaining.get(name) ?? 0;
      if (r > 0) remaining.set(name, r - SEG);
    };

    // ── Phase 1: Lock Q1 open with top 5 OVR ─────────────────────────────────
    for (let seg = 0; seg < 6; seg++) {
      byOvr.slice(0, 5).forEach(p => { onFloor[seg].add(p.n); consume(p.n); });
    }

    // ── Phase 2: Lock Q4 close ────────────────────────────────────────────────
    if (!isBlowout) {
      // Close game: top 5 OVR close it out
      for (let seg = 43; seg < NSEGS; seg++) {
        byOvr.slice(0, 5).forEach(p => {
          if (!onFloor[seg].has(p.n)) { onFloor[seg].add(p.n); consume(p.n); }
        });
      }
    } else {
      // Blowout: bench owns Q4 entirely, recycle if needed
      for (let seg = GARBAGE_START; seg < NSEGS; seg++) {
        let bi = 0;
        while (onFloor[seg].size < 5) {
          const p = benchByLowOvr[bi % benchByLowOvr.length];
          onFloor[seg].add(p.n);
          bi++;
          if (bi > benchByLowOvr.length * 3) break;
        }
      }
    }

    // ── Phase 3: Q3 close / Q4 transition (non-garbage) ──────────────────────
    if (!isBlowout) {
      for (let seg = 36; seg < 43; seg++) {
        if (onFloor[seg].size >= 5) continue;
        for (const p of byOvr) {
          if (onFloor[seg].size >= 5) break;
          if (!onFloor[seg].has(p.n) && (remaining.get(p.n) ?? 0) > 0) {
            onFloor[seg].add(p.n); consume(p.n);
          }
        }
      }
    }

    // ── Phase 4: Fill middle segments inward ──────────────────────────────────
    for (let seg = 0; seg < NSEGS; seg++) {
      if (onFloor[seg].size >= 5) continue;
      if (isBlowout && seg >= GARBAGE_START) continue;

      const isQ2Open = seg >= 12 && seg <= 16;
      const isQ3Open = seg >= 24 && seg <= 28;
      const isQ2Close = seg >= 18 && seg <= 23;
      const isQ3Mid = seg >= 29 && seg <= 35;

      const scored = players
        .filter(p => !onFloor[seg].has(p.n) && (remaining.get(p.n) ?? 0) > 0)
        .map(p => {
          const isS = starters.has(p.n);
          const ovr = getOvr(p);
          let score = ovr * 0.3 + (remaining.get(p.n) ?? 0) * 0.05;
          if (!isS && (isQ2Open || isQ3Open)) score += 5000;
          if (isS && (isQ2Close || isQ3Mid)) score += 3000;
          return { p, score };
        })
        .sort((a, b) => b.score - a.score);

      for (const { p } of scored) {
        if (onFloor[seg].size >= 5) break;
        onFloor[seg].add(p.n); consume(p.n);
      }

      // Fallback: anyone with budget
      for (const p of players) {
        if (onFloor[seg].size >= 5) break;
        if (!onFloor[seg].has(p.n) && (remaining.get(p.n) ?? 0) > 0) {
          onFloor[seg].add(p.n); consume(p.n);
        }
      }
      // Last resort: recycle
      for (const p of players) {
        if (onFloor[seg].size >= 5) break;
        if (!onFloor[seg].has(p.n)) onFloor[seg].add(p.n);
      }
    }

    // ── Convert segment assignments to windows ────────────────────────────────
    const windows: { n: string; start: number; end: number }[] = [];

    for (const p of players) {
      let start = -1;
      for (let seg = 0; seg < NSEGS; seg++) {
        if (onFloor[seg].has(p.n) && start === -1) start = seg * SEG;
        if (!onFloor[seg].has(p.n) && start !== -1) {
          windows.push({ n: p.n, start, end: seg * SEG });
          start = -1;
        }
      }
      if (start !== -1) windows.push({ n: p.n, start, end: TOTAL });
    }

    // Add zero windows for DNP players
    for (const p of roster) {
      if (!windows.find(w => w.n === p.n)) {
        windows.push({ n: p.n, start: 0, end: 0 });
      }
    }

    // OT extension: top 5 OVR players always play OT
    // Add extra windows for OT periods (up to 3 OT = 900 extra seconds)
    const otvr = byOvr.slice(0, 5);
    for (const p of otvr) {
      windows.push({ n: p.n, start: TOTAL, end: TOTAL + 900 });
    }
    // Bench can also appear in OT if budget remains
    for (const p of bench) {
      if ((remaining.get(p.n) ?? 0) > 0) {
        windows.push({ n: p.n, start: TOTAL, end: TOTAL + 900 });
      }
    }

    return windows;
  }

  // ── Convenience helpers ──────────────────────────────────────────────────

  static getStarters(roster: any[]): any[] {
    return [...roster].sort((a, b) => parseMin(b.min) - parseMin(a.min)).slice(0, 5);
  }

  static getRotation(roster: any[]): any[] {
    const s = this.getStarters(roster);
    return [
      ...s,
      ...[...roster]
        .filter(p => !s.includes(p))
        .sort((a, b) => parseMin(b.min) - parseMin(a.min)),
    ];
  }

  static getPlayerWindow(roster: any[], playerName: string): { start: number; end: number } {
    if (!scheduleCache.has(roster)) {
      scheduleCache.set(roster, RotationService._buildSchedule(roster));
    }
    const sched = scheduleCache.get(roster)!;
    // Return the span covering ALL stints (first start to last end)
    const entries = sched.filter((w: any) => w.n === playerName && w.end > w.start);
    if (entries.length === 0) return { start: 0, end: 2880 };
    const start = Math.min(...entries.map((w: any) => w.start));
    const end = Math.max(...entries.map((w: any) => w.end));
    return { start, end };
  }
}
