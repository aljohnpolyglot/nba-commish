/**
 * seasonRollover.ts
 *
 * Called automatically from simulationHandler.ts when the sim date crosses
 * June 30 of the current season year (day before free agency opens July 1).
 *
 * Timeline:
 *  ~June 20  — NBA Finals end, bracket marked complete
 *  June 30   — THIS FIRES: contract expiry, year increment, cap inflation, clear transient state
 *  July 1    — Free agency opens (AI FA signings via AIFreeAgentHandler)
 *  Late June — NBA Draft (handled separately by DraftSimulatorView)
 *  Aug 14    — Schedule regen fires via autoResolvers.ts (existing logic)
 *
 * Note: Schedule generation is NOT done here — autoResolvers.ts already handles
 * that on Aug 14 when it detects no regular-season games exist.
 */

import { GameState, NBAPlayer, NBACupState } from '../../types';
import { applyCapInflation } from '../../utils/finance/inflationUtils';
import { drawCupGroups } from '../nbaCup/drawGroups';
import { sweepExpiredTPEs } from '../../utils/tradeExceptionUtils';
import { runRetirementChecks, runFarewellTourChecks, runMortalityChecks, RetireeRecord, FarewellRecord, MortalityRecord } from '../playerDevelopment/retirementChecker';
import { runHOFChecks, HOFInduction, getHOFCeremonyDate } from '../playerDevelopment/hofChecker';
import { runJerseyRetirementChecks, JerseyRetirementRecord, deriveLeagueStartYearFromHistory } from '../playerDevelopment/jerseyRetirementChecker';
import { generateFuturePicks, pruneExpiredPicks, DEFAULT_TRADABLE_PICK_SEASONS } from '../draft/DraftPickGenerator';
import { computeContractOffer, getContractLimits, isSupermaxAwardQualified } from '../../utils/salaryUtils';
import { computeMoodScore } from '../../utils/mood/moodScore';
import type { MoodTrait } from '../../utils/mood/moodTypes';
import { SettingsManager } from '../SettingsManager';
import { ensureDraftClasses } from '../draftClassFiller';
import { potEstimator } from '../genDraftPlayers';
import { retireExternalLeaguePlayers, repopulateExternalLeagues, enforceExternalMinRoster } from '../externalLeagueSustainer';

/** Fired when the sim has just crossed into a new offseason (Oct 1, new year).
 *  Returns the rolled-over GameState patch. Does NOT mutate input. */
export function applySeasonRollover(state: GameState): Partial<GameState> {
  const currentYear = state.leagueStats.year;
  const nextYear    = currentYear + 1;
  const leagueStartYear = deriveLeagueStartYearFromHistory(state.history, currentYear);

  // ── 0. Player options ───────────────────────────────────────────────────
  // Players with a player option on their expiring contract decide before rollover:
  //  - Opt IN  (market value < current contract × 0.9) → keep contract, exp advances +1
  //  - Opt OUT (market value ≥ current contract × 0.9) → become FA at rollover
  // Note: current BBGM roster data has no player options; this fires for future AI-generated contracts.
  const playerOptOutIds = new Set<string>();
  const playerOptInIds  = new Set<string>();
  const playerOptionNews: string[] = [];
  const playerOptionHistory: Array<{ text: string; date: string; type: string; playerIds?: string[] }> = [];

  // GM-mode toast collector — player/team option decisions for the user's roster only
  const isGM = state.gameMode === 'gm';
  const userTid = isGM ? state.userTeamId : undefined;
  const pendingOptionToasts: Array<{ playerName: string; teamName: string; pos: string; decision: 'player-in' | 'player-out' | 'team-exercised' | 'team-declined'; amountM?: number }> = [];

  // Player options: gist labels option on the season it APPLIES TO.
  // "2025-26 Player Option" → parsed exp = 2026.
  // Decision happens at SUMMER BEFORE that season = Jun 30 of currentYear (2025).
  // So at Jun 30 2025 rollover (currentYear=2025), check exp === nextYear (2026).
  // This way the player decides NOW whether to play the upcoming option year.
  for (const p of state.players) {
    if (!(p as any).contract?.hasPlayerOption) continue;
    if (!p.contract || (p.contract.exp ?? 0) !== nextYear) continue;
    if (p.tid < 0 || p.tid >= 100) continue; // only active NBA players

    const offer = computeContractOffer(p, state.leagueStats as any);
    const currentAmountUSD = (p.contract.amount ?? 0) * 1_000; // BBGM thousands → USD
    const team = state.teams.find(t => t.id === p.tid);
    // Opt in if current contract pays more than 90% of what market would offer
    if (currentAmountUSD >= offer.salaryUSD * 0.9) {
      playerOptInIds.add(p.internalId);
      // Player opts in — contract stays (handled above; we leave exp as-is)
      const text = `${p.name} has accepted his player option with the ${team?.name ?? 'team'}: $${(currentAmountUSD / 1_000_000).toFixed(1)}M`;
      playerOptionNews.push(text);
      // Jun 29 — options happen BEFORE free agency (Jul 1+). getSeasonYear boundary at Jun 28+
      // ensures these still appear in the new season's transaction view.
      const optionDateStr = `Jun 29, ${currentYear}`;
      playerOptionHistory.push({ text, date: optionDateStr, type: 'Signing', playerIds: [p.internalId] });
      if (isGM && p.tid === userTid) {
        pendingOptionToasts.push({
          playerName: p.name, teamName: team?.name ?? '', pos: (p as any).pos ?? '',
          decision: 'player-in', amountM: +(currentAmountUSD / 1_000_000).toFixed(1),
        });
      }
    } else {
      playerOptOutIds.add(p.internalId);
      const text = `${p.name} has declined his player option${team ? ` with the ${team.name}` : ''}, becoming a free agent.`;
      playerOptionNews.push(text);
      const optionDateStr = `Jun 29, ${currentYear}`;
      playerOptionHistory.push({ text, date: optionDateStr, type: 'Signing', playerIds: [p.internalId] });
      if (isGM && p.tid === userTid) {
        pendingOptionToasts.push({
          playerName: p.name, teamName: team?.name ?? '', pos: (p as any).pos ?? '',
          decision: 'player-out',
        });
      }
    }
  }

  // ── 0b. Rookie team option exercise ─────────────────────────────────────
  // AI teams automatically exercise team options on good players (OVR ≥ 50 BBGM).
  // Gist labels option on the season it applies to: "2023-24 Team" → parsed teamOptionExp = 2024.
  // Decision at summer BEFORE = Jun 30 2023 (currentYear=2023) → check teamOptionExp === nextYear (2024).
  const teamOptionExercisedIds  = new Set<string>();
  const teamOptionDeclinedIds   = new Set<string>();
  const teamOptionNews: string[] = [];

  for (const p of state.players) {
    if (!(p as any).contract?.hasTeamOption) continue;
    const teamOptExp: number = (p as any).contract?.teamOptionExp ?? -1;
    if (teamOptExp !== nextYear) continue;          // not decision time yet
    if (p.tid < 0 || p.tid >= 100) continue;
    if ((p as any).status === 'Retired') continue;

    const team = state.teams.find(t => t.id === p.tid);
    const ovr = p.overallRating ?? 60;
    // Exercise if OVR ≥ 50 BBGM (rotation-level or better, per BBGM scale: 45+ = role player, 55+ = starter)
    const exercise = ovr >= 50;
    if (exercise) {
      teamOptionExercisedIds.add(p.internalId);
      teamOptionNews.push(
        `${team?.name ?? 'A team'} has exercised their team option on ${p.name}.`,
      );
      if (isGM && p.tid === userTid) {
        pendingOptionToasts.push({
          playerName: p.name, teamName: team?.name ?? '', pos: (p as any).pos ?? '',
          decision: 'team-exercised',
        });
      }
    } else {
      teamOptionDeclinedIds.add(p.internalId);
      teamOptionNews.push(
        `${team?.name ?? 'A team'} has declined their team option on ${p.name}, making him a restricted free agent.`,
      );
      if (isGM && p.tid === userTid) {
        pendingOptionToasts.push({
          playerName: p.name, teamName: team?.name ?? '', pos: (p as any).pos ?? '',
          decision: 'team-declined',
        });
      }
    }
  }

  // ── 0c. Rookie extension coupled with team option exercise ───────────────
  // In real NBA, exercising a rookie option and negotiating the Rose Rule/rookie
  // extension are one bundled summer conversation, not two separate events. The
  // mid-season extension window (Oct–Feb) uses a single deterministic roll per
  // (player, year) — if a franchise cornerstone happens to land in the 15–20%
  // decline bucket, they silently hit FA with no retry. Firing an extension offer
  // here, alongside the option exercise, gives young MVP/All-NBA players a
  // proper negotiation window with high acceptance before the lossy mid-season
  // path can fail them.
  interface OptionExtension {
    newExp: number;
    newYears: number;
    annualUSD: number;
    hasPlayerOption: boolean;
    label: string;
    contractYears: Array<{ season: string; guaranteed: number; option: string }>;
    amountThousands: number;
  }
  const optionExtensions = new Map<string, OptionExtension>();
  const optionExtHistory: Array<{ text: string; date: string; type: string; playerIds?: string[] }> = [];

  for (const p of state.players) {
    if (!teamOptionExercisedIds.has(p.internalId)) continue;
    // Team options only sit on years 3–4 of rookie-scale contracts, so the only
    // eligibility branch that can fire here is the rookie extension window (YOS 3–4).
    const yos = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    if (yos < 3 || yos > 4) continue;

    const team = state.teams.find(t => t.id === p.tid);
    if (!team) continue;

    const playerForExt = { ...p, hasBirdRights: true } as NBAPlayer;
    const limits = getContractLimits(playerForExt, state.leagueStats as any);
    if (!limits.isRookieExtEligible && !limits.isSupermaxEligible) continue;

    const traits: MoodTrait[] = (p as any).moodTraits ?? [];
    const teamPlayers = state.players.filter(pp => pp.tid === p.tid);
    const { score: moodScore } = computeMoodScore(p, team, state.date, false, false, false, teamPlayers, currentYear);
    const offer = computeContractOffer(playerForExt, state.leagueStats as any, traits, moodScore);

    // Bundled summer negotiation — high acceptance floor. Foundational young
    // players (MVP/All-NBA in last 3 yrs) almost never bolt at this stage IRL.
    const recentAwards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
    const hasFoundationalAward = recentAwards.some(a =>
      a.season >= currentYear - 2 && /mvp|all.nba/i.test(a.type));
    const isFoundational = hasFoundationalAward;
    const wins = (team as any).wins ?? 0;
    const losses = (team as any).losses ?? 0;
    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0.5;

    let basePct: number;
    if (traits.includes('LOYAL'))      basePct = 0.97;
    else if (isFoundational)           basePct = 0.95;
    else if (moodScore >= 2)           basePct = 0.90;
    else if (moodScore >= -2)          basePct = 0.78;
    else                               basePct = 0.50;
    if (traits.includes('COMPETITOR') && winPct < 0.40 && (p.overallRating ?? 0) >= 60) {
      basePct = Math.min(basePct, 0.45);
    }

    // Deterministic roll, distinct multiplier from mid-season so players who
    // got unlucky on one roll aren't auto-unlucky on the other.
    let seed = 0;
    for (let i = 0; i < p.internalId.length; i++) seed += p.internalId.charCodeAt(i);
    seed += currentYear * 97;
    const roll = Math.abs((Math.sin(seed) * 10000) % 1);
    if (roll >= basePct) continue; // declined — mid-season window is the fallback

    // Extension kicks in the season AFTER the existing deal ends.
    // contract.exp is the last covered season year (e.g. 2027 → 2026-27 season).
    const extBaseYear = (p.contract?.exp ?? currentYear) + 1;
    const extYears = offer.years;
    const annualUSD = offer.salaryUSD;
    const extContractYears = Array.from({ length: extYears }, (_, i) => {
      const yr = extBaseYear + i;
      return {
        season: `${yr - 1}-${String(yr).slice(-2)}`,
        guaranteed: Math.round(annualUSD * Math.pow(1.05, i)),
        option: (i === extYears - 1 && offer.hasPlayerOption) ? 'Player' : '',
      };
    });

    const label = limits.isSupermaxEligible ? 'Supermax'
      : limits.rookieRoseQualified ? 'Rose Rule'
      : 'Rookie Ext';

    optionExtensions.set(p.internalId, {
      newExp: extBaseYear + extYears - 1,
      newYears: extYears,
      annualUSD,
      hasPlayerOption: offer.hasPlayerOption,
      label,
      contractYears: extContractYears,
      amountThousands: Math.round(annualUSD / 1_000),
    });

    const totalM = Math.round((annualUSD / 1_000_000) * extYears);
    const optTag = offer.hasPlayerOption ? ' (player option)' : '';
    optionExtHistory.push({
      text: `${p.name} has signed a rookie extension with the ${team.name}: $${totalM}M/${extYears}yr${optTag} (${label})`,
      date: `Jun 30, ${currentYear}`,
      type: 'Signing',
      playerIds: [p.internalId],
    });
  }

  // ── 1. Contract expiry ──────────────────────────────────────────────────
  // Players whose contract ends at or before the just-completed season become FAs.
  // We track yearsWithTeam by inspecting the existing field or incrementing by 1.
  // Helper: sync contract.amount to the upcoming season from contractYears[] if available.
  // contractYears[] stores real per-season salaries from the gist; contract.amount is in BBGM
  // thousands. Without this sync, trade/cap logic uses the salary from the initial load year.
  const nextSeasonStr = `${nextYear - 1}-${String(nextYear).slice(-2)}`;
  // Upper bound: no real NBA salary exceeds $250M/year — guard against a corrupt
  // contractYears entry (e.g. guaranteed stored in the wrong unit) cascading
  // into contract.amount during rollover. Mirrors the LOAD_GAME repair.
  const SANE_GUARANTEED_USD = 250_000_000;
  const SANE_AMOUNT_THOUSANDS = 250_000;
  const syncedContractAmount = (p: NBAPlayer): number | undefined => {
    const cy = (p as any).contractYears as Array<{ season: string; guaranteed: number }> | undefined;
    if (!cy) return undefined;
    const entry = cy.find(e => e.season === nextSeasonStr);
    if (!entry || entry.guaranteed <= 0 || entry.guaranteed > SANE_GUARANTEED_USD) return undefined;
    const synced = Math.round(entry.guaranteed / 1000);
    if (synced <= 0 || synced > SANE_AMOUNT_THOUSANDS) return undefined;
    return synced;
  };

  const expiredIds = new Set<string>();
  const updatedPlayers: NBAPlayer[] = state.players.map(p => {
    // Snapshot OVR at end of season for career progression chart
    // Stored as ovrHistory: Array<{ season, ovr }> — one entry per completed season
    if (p.overallRating && p.tid !== -2 && !(p as any).diedYear) {
      const existing: any[] = (p as any).ovrHistory ?? [];
      if (!existing.some((h: any) => h.season === currentYear)) {
        p = { ...p, ovrHistory: [...existing, { season: currentYear, ovr: p.overallRating }] } as any;
      }
    }

    // ── POT drift (BBGM-style dynamic potential) ───────────────────────────
    // Stored POT is a snapshot of "where scouts think this player is headed
    // given current OVR + age." Recompute yearly so stalled players see their
    // POT nerf down (visible bust) and breakouts see it climb. Progression
    // engine reads rating.pot, so next season's growth ceiling moves too.
    // Skip retired, deceased, unborn prospects.
    if (
      p.tid !== -2 &&
      !(p as any).diedYear &&
      (p as any).status !== 'Retired' &&
      p.ratings &&
      p.ratings.length > 0 &&
      typeof p.age === 'number'
    ) {
      const ratingsArr = p.ratings as any[];
      const cyIdx = ratingsArr.findIndex(r => r?.season === currentYear);
      const idx = cyIdx !== -1 ? cyIdx : ratingsArr.length - 1;
      const lastR = ratingsArr[idx];
      const currentOvr = lastR?.ovr ?? p.overallRating ?? 60;
      const priorPot = lastR?.pot ?? currentOvr;
      const age = p.age;
      const targetPot = potEstimator(currentOvr, age);
      const blend = age <= 22 ? 0.25 : age <= 27 ? 0.40 : 0.60;
      const blended = Math.round(priorPot + (targetPot - priorPot) * blend);
      const maxDelta = 3;
      const clampedByStep = Math.max(priorPot - maxDelta, Math.min(priorPot + maxDelta, blended));
      // Allow pot to sit up to 5 BBGM below OVR so potMod returns -0.2 for
      // established players — without this, pot ratchets up forever with OVR
      // and every player looks like a budding star with room to grow.
      const newPot = Math.min(99, Math.max(currentOvr - 5, clampedByStep));
      if (newPot !== priorPot) {
        const newRatings = ratingsArr.map((r, i) => i === idx ? { ...r, pot: newPot } : r);
        p = { ...p, ratings: newRatings } as NBAPlayer;
      }
    }

    // Everyone ages (retired, external, FA, contracted) except deceased players and unborn prospects
    if ((p as any).diedYear) return p;                   // deceased — do not age
    if (p.tid === -2) return p;                          // future draft prospect — birth year is source of truth

    const EXTERNAL_LEAGUES = ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];

    // Retired / unsigned (already FA) / no contract — age only, no contract changes
    if ((p as any).status === 'Retired' || !p.contract || p.tid < 0) {
      return typeof p.age === 'number' ? { ...p, age: p.age + 1 } as NBAPlayer : p;
    }

    // WNBA is a separate women's league — never flip WNBA players into the
    // NBA FA pool. Age only, keep status. (Their expiry is a separate TODO;
    // needs a WNBA-specific FA pipeline, not this one.)
    if ((p as any).status === 'WNBA') {
      return typeof p.age === 'number' ? { ...p, age: p.age + 1 } as NBAPlayer : p;
    }

    // Men's external leagues (foreign pro leagues OR tid >= 100 non-NBA slots,
    // excluding WNBA handled above). Prior code short-circuited ALL external
    // players forever, so Barcelona / B-League / Euroleague contracts with
    // contract.exp=2026 stayed "current" in 2030+ and never flowed back to the
    // NBA FA pool. Evidence: Yuma Kajiwara K2 99 rotting in Shiga Lakes, Sayon
    // Keita K2 95 frozen at FCB. Fix: if their contract is expired, flip to
    // NBA FA so routeUnsignedPlayers (Oct 1) and runAIFreeAgencyRound can
    // re-route them. Router already weights by OVR, so Euroleague-caliber
    // guys tend to re-land in Euroleague — no home-country bias needed.
    if (EXTERNAL_LEAGUES.includes((p as any).status ?? '') || p.tid >= 100) {
      const bumpedAge = typeof p.age === 'number' ? p.age + 1 : p.age;

      // Auto-declare-for-draft: foreign men's-league prospects turning 19 this
      // rollover declare for the upcoming NBA draft. ProgressionEngine freezes
      // their ratings at <19 so they arrive fresh, not inflated by Euroleague
      // MVP runs. WNBA already short-circuited above.
      const isMensExternal = (p as any).status !== 'WNBA' &&
        (EXTERNAL_LEAGUES.includes((p as any).status ?? '') || p.tid >= 100);
      if (isMensExternal && typeof bumpedAge === 'number' && bumpedAge === 19) {
        // Draft eligibility year: the NBA draft fires late June, so a Jun 30
        // rollover lands AFTER the current year's draft — declare for next year.
        const declareYear = nextYear;
        return {
          ...p,
          age: bumpedAge,
          tid: -2,
          status: 'Draft Prospect' as const,
          yearsWithTeam: 0,
          twoWay: undefined,
          nonGuaranteed: false,
          gLeagueAssigned: false,
          contract: undefined,
          contractYears: [],
          draft: { ...(p as any).draft, year: declareYear },
        } as any;
      }

      const contractExpired = (p.contract?.exp ?? 0) <= currentYear;
      if (contractExpired) {
        // Previously flipped every external expiring contract to NBA FA, so
        // PBA/CBA/Euroleague players vanished from their home league at 24-26
        // and rotted in the NBA FA pool until force-retirement at 43. That's
        // why the oldest PBA player was always ~36.
        //
        // Only NBA-caliber external players (K2 ≥ 70, BBGM ~44+) test the NBA
        // market. Everyone else auto-resigns with their home club for another
        // 1-2 years so the age pyramid fills naturally.
        const ovrForFlip = p.overallRating ?? 0;
        const NBA_MARKET_BBGM_THRESHOLD = 44; // K2 ~70 (K2 = 0.88*BBGM + 31)
        if (ovrForFlip >= NBA_MARKET_BBGM_THRESHOLD) {
          expiredIds.add(p.internalId);
          return {
            ...p,
            age: bumpedAge,
            tid: -1,
            status: 'Free Agent' as const,
            yearsWithTeam: 0,
            twoWay: undefined,
            nonGuaranteed: false,
            gLeagueAssigned: false,
            midSeasonExtensionDeclined: undefined,
            contract: { ...p.contract, hasPlayerOption: false },
          } as any;
        }
        // Auto-resign at home: 1-2yr extension, small salary bump tied to OVR.
        const newExp = currentYear + (ovrForFlip >= 40 ? 2 : 1);
        const bumpedAmt = Math.max(p.contract?.amount ?? 0, 1);
        return {
          ...p,
          age: bumpedAge,
          contract: { ...p.contract, exp: newExp, amount: bumpedAmt, hasPlayerOption: false },
          yearsWithTeam: ((p as any).yearsWithTeam ?? 0) + 1,
        } as any;
      }
      // Contract still active — age only, keep external status
      return typeof p.age === 'number' ? { ...p, age: p.age + 1 } as NBAPlayer : p;
    }

    const contractExp: number = p.contract.exp ?? 0;
    const newAge = typeof p.age === 'number' ? p.age + 1 : p.age;

    // Team option declined → player becomes FA (restricted if rookie + restrictedFA flag)
    if (teamOptionDeclinedIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      const isRFA = !!(p as any).contract?.restrictedFA;
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        midSeasonExtensionDeclined: undefined,
        contract: { ...p.contract, hasTeamOption: false, restrictedFA: isRFA, isRestrictedFA: isRFA },
      } as any;
    }

    // Team option exercised → strip hasTeamOption flag, contract stays until contract.exp.
    // Also compute Bird Rights + supermax eligibility (previously only the "still
    // under contract" branch set these, so option-exercised players had stale flags
    // until the following rollover). If a rookie extension was signed in §0c,
    // fold its contractYears + new exp into the returned player.
    if (teamOptionExercisedIds.has(p.internalId)) {
      const nextAmt = syncedContractAmount(p);
      const yrsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
      const hasBirdRights =
        (state.leagueStats.birdRightsEnabled ?? true) && yrsWithTeam >= 3
          ? true
          : (p as any).hasBirdRights ?? false;
      const supermaxEnabled = state.leagueStats.supermaxEnabled ?? true;
      const supermaxMinYrs = (state.leagueStats as any).supermaxMinYears ?? 8;
      const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
      const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
      const superMaxEligible = supermaxEnabled && hasBirdRights &&
        isSupermaxAwardQualified(awards, currentYear, yearsOfService, supermaxMinYrs);

      const ext = optionExtensions.get(p.internalId);
      if (ext) {
        // Preserve existing contractYears through the current (option-exercised) deal;
        // extension writes new entries for exp+1 onward.
        const keepExistingThrough = (p.contract?.exp ?? currentYear);
        const existingThroughCurrent = ((p as any).contractYears ?? []).filter((cy: any) => {
          const yr = parseInt(cy.season.split('-')[0], 10) + 1;
          return yr <= keepExistingThrough;
        });
        return {
          ...p,
          age: newAge,
          yearsWithTeam: yrsWithTeam,
          hasBirdRights,
          superMaxEligible,
          midSeasonExtensionDeclined: undefined,
          contract: {
            ...p.contract,
            hasTeamOption: false,
            teamOptionExp: undefined,
            exp: ext.newExp,
            ...(nextAmt ? { amount: nextAmt } : {}),
          },
          contractYears: [...existingThroughCurrent, ...ext.contractYears],
        } as any;
      }

      return {
        ...p,
        age: newAge,
        yearsWithTeam: yrsWithTeam,
        hasBirdRights,
        superMaxEligible,
        midSeasonExtensionDeclined: undefined,
        contract: { ...p.contract, hasTeamOption: false, teamOptionExp: undefined, ...(nextAmt ? { amount: nextAmt } : {}) },
      } as any;
    }

    // Contract expired OR player opted out of their player option
    if (contractExp <= currentYear || playerOptOutIds.has(p.internalId)) {
      expiredIds.add(p.internalId);
      return {
        ...p,
        age: newAge,
        tid: -1,
        status: 'Free Agent' as const,
        yearsWithTeam: 0,
        midSeasonExtensionDeclined: undefined, // reset for next season
        twoWay: undefined,                     // two-way status cleared — becomes standard FA
        playoffEligible: undefined,            // reset — new season, everyone starts eligible
        contract: { ...p.contract, hasPlayerOption: false }, // option consumed
      } as any;
    }

    // Still under contract — increment yearsWithTeam, compute superMaxEligible
    const yrsWithTeam = ((p as any).yearsWithTeam ?? 0) + 1;
    const hasBirdRights =
      (state.leagueStats.birdRightsEnabled ?? true) && yrsWithTeam >= 3
        ? true
        : (p as any).hasBirdRights ?? false;

    // Super-max eligibility: Bird Rights + award/service criteria
    const supermaxEnabled = state.leagueStats.supermaxEnabled ?? true;
    const supermaxMinYrs = (state.leagueStats as any).supermaxMinYears ?? 8;
    const yearsOfService = ((p as any).stats ?? []).filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0).length;
    const awards: Array<{ season: number; type: string }> = (p as any).awards ?? [];
    const superMaxEligible = supermaxEnabled && hasBirdRights &&
      isSupermaxAwardQualified(awards, currentYear, yearsOfService, supermaxMinYrs);

    const nextAmt = syncedContractAmount(p);
    return {
      ...p, age: newAge, yearsWithTeam: yrsWithTeam, hasBirdRights, superMaxEligible, midSeasonExtensionDeclined: undefined,
      ...(nextAmt ? { contract: { ...p.contract, amount: nextAmt } } : {}),
    } as any;
  });

  // ── 2. Cap inflation ────────────────────────────────────────────────────
  const ls = state.leagueStats;
  let newSalaryCap    = ls.salaryCap ?? 154_647_000;
  let newLuxuryPayroll = ls.luxuryPayroll ?? Math.round(newSalaryCap * (ls.luxuryTaxThresholdPercentage ?? 121.5) / 100);
  let newFirstApron   = ls.firstApronPercentage  != null ? Math.round(newSalaryCap * ls.firstApronPercentage  / 100) : undefined;
  let newSecondApron  = ls.secondApronPercentage != null ? Math.round(newSalaryCap * ls.secondApronPercentage / 100) : undefined;
  // `minContractStaticAmount` is stored in MILLIONS (e.g. 1.273 = $1.273M).
  // Line 517 multiplies by 1_000_000 to get USD before passing to applyCapInflation.
  // The old fallback 1_272_870 treated-as-millions would be $1.27T — fix per CLAUDE.md.
  let newMinContract  = ls.minContractStaticAmount ?? 1.273;
  let inflationPctApplied = 0;

  if (ls.inflationEnabled ?? true) {
    const { thresholds, pct } = applyCapInflation(
      {
        salaryCap:     newSalaryCap,
        luxuryPayroll: newLuxuryPayroll,
        firstApron:    newFirstApron,
        secondApron:   newSecondApron,
        minContract:   Math.round(newMinContract * 1_000_000), // applyCapInflation expects USD
      },
      {
        inflationMin:     ls.inflationMin     ?? 0,
        inflationMax:     ls.inflationMax     ?? 10,
        inflationAverage: ls.inflationAverage ?? 5.5,
        inflationStdDev:  ls.inflationStdDev  ?? 2.0,
      },
    );
    inflationPctApplied = pct;
    newSalaryCap      = thresholds.salaryCap;
    newLuxuryPayroll  = thresholds.luxuryPayroll;
    newFirstApron     = thresholds.firstApron;
    newSecondApron    = thresholds.secondApron;
    newMinContract    = (thresholds.minContract ?? Math.round(newMinContract * 1_000_000)) / 1_000_000;
  }

  // Schedule regen is NOT done here — autoResolvers.ts handles it on Aug 14
  // when it detects no regular-season games exist for the new year.

  // ── 3. Retirement checks ─────────────────────────────────────────────────
  // Run AFTER age increments (updatedPlayers already has age+1).
  // External leagues retire first (league-specific curves); NBA/FA path follows.
  const {
    players: playersAfterExtRetire,
    retirees: extRetirees,
    historyEntries: extRetireHistory,
  } = retireExternalLeaguePlayers(updatedPlayers, currentYear, state.date ?? `Jun 30, ${currentYear}`);

  const { players: playersAfterRetire, newRetirees } = runRetirementChecks(playersAfterExtRetire, currentYear);

  // ── 3c. Farewell tour flags for the UPCOMING season ──────────────────────
  // After retirees are removed, identify players who will likely retire at the
  // end of the NEXT season and mark them as farewell tour.
  const { players: playersWithFarewells, newFarewells } = runFarewellTourChecks(playersAfterRetire, currentYear);

  // ── 3c2. Hall of Fame inductions ─────────────────────────────────────────
  // Hall-worthy retirees are inducted on a tiered timeline:
  // first-ballot (5 years), regular multi-ballot (7 years), borderline (15 years).
  // Threshold is commissioner-configurable.
  const hofThreshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  const { players: playersAfterHOF, newInductees } = runHOFChecks(playersWithFarewells, currentYear, hofThreshold);

  // ── 3c3. Franchise jersey retirements ───────────────────────────────────
  // TODO: When League News and Transactions split into separate surfaces, move
  // these ceremonial league-history items out of TransactionsView.
  const { teams: teamsAfterJerseyRetirements, newRetirements: newJerseyRetirements } =
    runJerseyRetirementChecks(playersAfterHOF, state.teams, currentYear, { leagueStartYear });

  // ── 3c4. Retired-player mortality ────────────────────────────────────────
  const { players: playersAfterMortality, deaths } = runMortalityChecks(playersAfterHOF, currentYear);

  // ── 3d. Top up future draft classes ──────────────────────────────────────
  // Each rollover pushes the horizon one year further. Top up so the player
  // always has 4 populated classes ahead (currentYear+1 through +4 at this point,
  // since nextYear is now the "current" season).
  const fillResult = ensureDraftClasses(playersAfterMortality, nextYear, state.leagueStats.draftEligibilityRule);
  const playersWithDraftClasses = fillResult.additions.length > 0
    ? [...playersAfterMortality, ...fillResult.additions]
    : playersAfterMortality;

  // ── 3e. External-league repopulation ─────────────────────────────────────
  // Two-track: youth (15-18yo) for Euroleague/Endesa/NBL/BLeague/GLeague;
  // adult-direct (22-26yo) for PBA/ChinaCBA. Matches 1:1 outflow from retirements
  // + 19y auto-declares that happened in the age-increment step above.
  const { additions: extRepopPlayers } = repopulateExternalLeagues(
    { ...state, players: playersWithDraftClasses } as any,
    extRetirees,
    currentYear,
    nextYear,
  );

  // ── 3f. External min-roster safety net ───────────────────────────────────
  // After all the above, any external team still below 12 gets journeyman fills.
  const postRepopPlayers = extRepopPlayers.length > 0
    ? [...playersWithDraftClasses, ...extRepopPlayers]
    : playersWithDraftClasses;
  const { additions: safetyPlayers } = enforceExternalMinRoster(
    { ...state, players: postRepopPlayers } as any,
    nextYear,
  );
  const playersFinalized = safetyPlayers.length > 0
    ? [...postRepopPlayers, ...safetyPlayers]
    : postRepopPlayers;

  // ── 3b. Draft pick bookkeeping ───────────────────────────────────────────
  const windowSize = state.leagueStats.tradableDraftPickSeasons ?? DEFAULT_TRADABLE_PICK_SEASONS;
  const nbaNBATeams = (state.teams ?? []).filter((t: any) => t.id >= 0 && t.id < 100);
  // Prune stale picks THEN generate new window for the new season
  const prunedPicks = pruneExpiredPicks(state.draftPicks ?? [], currentYear);
  const updatedPicks = generateFuturePicks(prunedPicks, nbaNBATeams as any, nextYear, windowSize);

  // ── 4. Rollover news item ────────────────────────────────────────────────
  const capM  = (newSalaryCap / 1_000_000).toFixed(1);
  const pctStr = inflationPctApplied >= 0
    ? `+${inflationPctApplied.toFixed(1)}%`
    : `${inflationPctApplied.toFixed(1)}%`;
  const rolloverNews = {
    id: `rollover-${nextYear}-${Date.now()}`,
    headline: `${nextYear} NBA Season Underway — Salary Cap Set at $${capM}M`,
    content: `The ${nextYear} NBA season is officially underway. The salary cap has been set at $${capM}M (${pctStr} from last season). ${expiredIds.size} players became free agents as their contracts expired.`,
    date: state.date,
    type: 'league' as const,
    isNew: true,
    read: false,
  };

  // ── Retirement news items ────────────────────────────────────────────────
  const retirementNewsItems = newRetirees.map((r: RetireeRecord) => {
    const pgStr = r.careerGP > 0
      ? `${(r.careerPts / r.careerGP).toFixed(1)} PPG / ${(r.careerReb / r.careerGP).toFixed(1)} RPG / ${(r.careerAst / r.careerGP).toFixed(1)} APG over ${r.careerGP} games`
      : 'career stats unavailable';
    const accolades: string[] = [];
    if (r.allStarAppearances > 0) accolades.push(`${r.allStarAppearances}× All-Star`);
    if (r.championships > 0) accolades.push(`${r.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` His career included ${accolades.join(', ')}.` : '';
    const headline = r.isLegend
      ? `Legend Retires: ${r.name} Ends Storied Career After ${r.careerGP} Games`
      : `${r.name} Announces Retirement`;
    return {
      id: `retire-${r.playerId}-${Date.now()}`,
      headline,
      content: `${r.name} (age ${r.age}) has officially announced his retirement.${accoladeStr} He averaged ${pgStr}.`,
      date: state.date,
      type: (r.isLegend ? 'player' : 'roster') as any,
      isNew: true,
      read: false,
    };
  });

  // ── Player option news items ─────────────────────────────────────────────
  const playerOptionNewsItems = playerOptionNews.map((text, i) => ({
    id: `player-option-${currentYear}-${i}-${Date.now()}`,
    headline: text.split(',')[0] ?? text,
    content: text,
    date: state.date,
    type: 'roster' as const,
    isNew: true,
    read: false,
  }));

  // ── Team option news items ───────────────────────────────────────────────
  const teamOptionNewsItems = teamOptionNews.map((text, i) => ({
    id: `team-option-${currentYear}-${i}-${Date.now()}`,
    headline: text.split(',')[0] ?? text,
    content: text,
    date: state.date,
    type: 'roster' as const,
    isNew: true,
    read: false,
  }));

  // ── Team option history entries ──────────────────────────────────────────
  const teamOptionHistoryEntries = teamOptionNews.map(text => ({
    text,
    date: `Jun 29, ${currentYear}`,
    type: 'Signing' as const,
  }));

  // ── Retirement history entries ────────────────────────────────────────────
  const retirementHistoryEntries = newRetirees.map((r: RetireeRecord) => {
    const pgStr = r.careerGP > 0
      ? ` ${(r.careerPts / r.careerGP).toFixed(1)} PPG / ${(r.careerReb / r.careerGP).toFixed(1)} RPG / ${(r.careerAst / r.careerGP).toFixed(1)} APG`
      : '';
    const accolades: string[] = [];
    if (r.allStarAppearances > 0) accolades.push(`${r.allStarAppearances}× All-Star`);
    if (r.championships > 0) accolades.push(`${r.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` (${accolades.join(', ')})` : '';
    return {
      text: `${r.name} has retired at age ${r.age}.${accoladeStr}${pgStr} over ${r.careerGP} career games.`,
      date: state.date,
      type: 'Retirement' as const,
      playerIds: [r.playerId],
    };
  });

  // ── Farewell tour news items ──────────────────────────────────────────────
  const farewellNewsItems = newFarewells.map((r: FarewellRecord, i: number) => {
    const accolades: string[] = [];
    if (r.allStarAppearances > 0) accolades.push(`${r.allStarAppearances}× All-Star`);
    if (r.championships > 0) accolades.push(`${r.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` (${accolades.join(', ')})` : '';
    const headline = r.isLegend
      ? `${r.name} Set for Farewell Tour Season`
      : `${r.name} May Be Playing Final Season`;
    return {
      id: `farewell-${r.playerId}-${Date.now()}-${i}`,
      headline,
      content: `${r.name} (age ${r.age})${accoladeStr} is expected to retire at the end of the upcoming season. Sources close to the player say this will likely be his final year.`,
      date: state.date,
      type: (r.isLegend ? 'player' : 'roster') as any,
      isNew: true,
      read: false,
    };
  });

  // ── Farewell tour history entries ─────────────────────────────────────────
  const farewellHistoryEntries = newFarewells.map((r: FarewellRecord) => ({
    text: `${r.name} (age ${r.age}) is entering what is expected to be his final season.`,
    date: state.date,
    type: 'Retirement' as const,
    playerIds: [r.playerId],
  }));

  // ── Hall of Fame induction news items ─────────────────────────────────────
  const hofNewsItems = newInductees.map((h: HOFInduction, i: number) => {
    const ceremonyDate = getHOFCeremonyDate(h.inductionYear).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const accolades: string[] = [];
    if (h.mvps > 0) accolades.push(`${h.mvps}× MVP`);
    if (h.allStarAppearances > 0) accolades.push(`${h.allStarAppearances}× All-Star`);
    if (h.championships > 0) accolades.push(`${h.championships}× Champion`);
    const accoladeStr = accolades.length > 0 ? ` — ${accolades.join(', ')}` : '';
    const ballotStr = h.firstBallot ? ' (First-Ballot)' : '';
    const tierStr = h.firstBallot ? '' : ` (${h.tier === 'borderline' ? 'Borderline' : 'Multi-Ballot'})`;
    return {
      id: `hof-${h.playerId}-${Date.now()}-${i}`,
      headline: `${h.name} Inducted Into Hall of Fame${ballotStr || tierStr}`,
      content: `${h.name} has been inducted into the Naismith Memorial Basketball Hall of Fame${ballotStr || tierStr}. Career: ${h.careerWS.toFixed(1)} Win Shares${accoladeStr}.`,
      date: ceremonyDate,
      type: 'player' as const,
      isNew: true,
      read: false,
    };
  });

  // ── Hall of Fame history entries ──────────────────────────────────────────
  const hofHistoryEntries = newInductees.map((h: HOFInduction) => {
    const ceremonyDate = getHOFCeremonyDate(h.inductionYear).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return {
      text: `${h.name} inducted into the Hall of Fame (Class of ${h.inductionYear})${h.firstBallot ? ' — First-Ballot' : h.tier === 'borderline' ? ' — Borderline' : ' — Multi-Ballot'}.`,
      date: ceremonyDate,
      type: 'Retirement' as const,
      playerIds: [h.playerId],
    };
  });

  // ── Jersey retirement news + history entries ─────────────────────────────
  const jerseyRetirementNewsItems = newJerseyRetirements.map((j: JerseyRetirementRecord, i: number) => {
    const accoladeBits: string[] = [];
    if (j.allStarAppearances > 0) accoladeBits.push(`${j.allStarAppearances}× All-Star`);
    if (j.championships > 0) accoladeBits.push(`${j.championships}× Champion`);
    const accoladeStr = accoladeBits.length > 0 ? ` The honor follows a franchise tenure that included ${accoladeBits.join(', ')}.` : '';
    return {
      id: `jersey-retire-${j.playerId}-${j.teamId}-${Date.now()}-${i}`,
      headline: `${j.teamName} Retire #${j.number} for ${j.name}`,
      content: `${j.teamName} have retired #${j.number} in honor of ${j.name}, recognizing ${j.seasonsWithTeam} seasons and ${j.gamesWithTeam} games with the franchise.${accoladeStr}`,
      date: state.date,
      type: 'transaction' as any,
      category: 'Transaction',
      isNew: true,
      read: false,
    };
  });

  const jerseyRetirementHistoryEntries = newJerseyRetirements.map((j: JerseyRetirementRecord) => ({
    text: `${j.teamName} retired #${j.number} in honor of ${j.name}.`,
    date: state.date,
    type: 'Jersey Retirement',
    playerIds: [j.playerId],
  }));

  // ── Mortality news + history entries ─────────────────────────────────────
  const mortalityNewsItems = deaths.map((d: MortalityRecord, i: number) => ({
    id: `death-${d.playerId}-${Date.now()}-${i}`,
    headline: `Former NBA Player ${d.name} Passes Away at Age ${d.age}`,
    content: `${d.name}, who played in the NBA, passed away at the age of ${d.age}.`,
    date: state.date,
    type: 'player' as const,
    isNew: true,
    read: false,
  }));

  const mortalityHistoryEntries = deaths.map((d: MortalityRecord) => ({
    text: `${d.name} died at age ${d.age}.`,
    date: state.date,
    type: 'Retirement' as const,
    playerIds: [d.playerId],
  }));

  console.log(
    `[SeasonRollover] ${currentYear} → ${nextYear} | ` +
    `Cap: $${(state.leagueStats.salaryCap ?? 0) / 1_000_000 | 0}M → $${capM}M (${pctStr}) | ` +
    `${expiredIds.size} contracts expired | ` +
    `${teamOptionExercisedIds.size} team opts exercised | ` +
    `${teamOptionDeclinedIds.size} team opts declined | ` +
    `${optionExtensions.size} rookie extensions signed | ` +
    `${newRetirees.length} retirements | ${newFarewells.length} farewell tours | ` +
    `${newInductees.length} HOF inductions | ${newJerseyRetirements.length} jersey retirements | ${deaths.length} deaths | ` +
    `${updatedPicks.length} total draft picks`
  );

  // ── Bets pruning — drop resolved bets (won/lost) older than 2 seasons ────
  const cutoffDate = `${currentYear - 1}-10-01`; // beginning of the season 2 years ago
  const prunedBets = (state.bets ?? []).filter(b => b.status === 'pending' || b.date >= cutoffDate);

  // ── Box score pruning ─────────────────────────────────────────────────────
  // Keep only the last maxBoxScoreYears seasons of game results.
  // GameResult.date is a locale string like "Oct 24, 2025"; extract year from tail.
  const maxBoxScoreYears = SettingsManager.getSettings().maxBoxScoreYears ?? 2;
  const boxScoreCutoffYear = currentYear - maxBoxScoreYears; // keep games from this year onward
  const prunedBoxScores = (state.boxScores ?? []).filter(g => {
    // Drop exhibition game box scores (negative team IDs: All-Star, Rising Stars, Celebrity)
    // so next season's All-Star Weekend starts with a clean slate
    if (g.homeTeamId < 0 || g.awayTeamId < 0) return false;
    const parts = g.date?.split(',');
    const yr = parts ? parseInt(parts[parts.length - 1]?.trim() ?? '0', 10) : 0;
    return yr > boxScoreCutoffYear;
  });

  // ── Reset team W-L for new season ───────────────────────────────────────────
  // Archive completed season record to team.seasons[], then zero out wins/losses.
  // Emits both {wins, losses} AND {won, lost} so BBGM-style consumers and sim-style
  // consumers all read correctly without per-site fallback logic.
  const teamsReset = teamsAfterJerseyRetirements.map(t => {
    const existingSeasons: any[] = (t as any).seasons ?? [];
    const existingRecord = existingSeasons.find((s: any) => Number(s.season) === currentYear);
    // Preserve any playoffRoundsWon already stamped by lazySimRunner's bracket-complete hook.
    const existingPlayoffRoundsWon = existingRecord?.playoffRoundsWon;
    const seasonRecord = {
      // Carry forward any other fields BBGM may have seeded (imgURLSmall, etc.)
      ...(existingRecord ?? {}),
      season: currentYear,
      wins: t.wins,
      losses: t.losses,
      won: t.wins,
      lost: t.losses,
      playoffRoundsWon: existingPlayoffRoundsWon ?? 0,
    };
    // Replace the stale pre-seeded entry if one exists; otherwise append.
    // BBGM imports pre-seed a current-year entry with 0-0 that would shadow the
    // real record if we kept it; always overwrite on rollover.
    const nextSeasons = existingRecord
      ? existingSeasons.map((s: any) => Number(s.season) === currentYear ? seasonRecord : s)
      : [...existingSeasons, seasonRecord];
    return {
      ...t,
      wins: 0,
      losses: 0,
      streak: { type: 'W' as const, count: 0 },  // reset streak so "rock bottom" news doesn't fire
      seasons: nextSeasons,
    };
  });

  // TPE shelf life is 1 year — most rollover-time exceptions have already aged out,
  // but this catches any lingering deadline-period TPEs.
  const teamsWithSweptTPEs = sweepExpiredTPEs(teamsReset, state.date);

  // ── NBA Cup archive + redraw ─────────────────────────────────────────────
  // Archive the current cup (even if somehow not complete — defensive), then
  // draw new groups for next year using this season's final standings.
  let nbaCupPatch: { nbaCup?: NBACupState; nbaCupHistory?: Record<number, NBACupState> } = {};
  if (state.leagueStats.inSeasonTournament !== false) {
    const prevStandings = state.teams.map(t => ({ tid: t.id, wins: t.wins, losses: t.losses }));
    const newGroups = drawCupGroups(state.teams, prevStandings, state.saveId ?? 'default', nextYear);
    const newCup: NBACupState = {
      year: nextYear,
      status: 'group',
      groups: newGroups,
      wildcards: { East: null, West: null },
      knockout: [],
    };
    nbaCupPatch = {
      nbaCup: newCup,
      nbaCupHistory: {
        ...(state.nbaCupHistory ?? {}),
        ...(state.nbaCup ? { [currentYear]: state.nbaCup } : {}),
      },
    };
  }

  return {
    players: playersFinalized,
    teams: teamsWithSweptTPEs,
    draftPicks: updatedPicks,
    bets: prunedBets,
    boxScores: prunedBoxScores,
    schedule: [],          // clear old season schedule so autoGenerateSchedule runs fresh
    christmasGames: [],
    globalGames: [],
    ...({
      // Archive completed playoff bracket so HistoricalPlayoffBracket can show sim-generated seasons
      historicalPlayoffs: {
        ...((state as any).historicalPlayoffs ?? {}),
        ...(state.playoffs ? { [currentYear]: state.playoffs } : {}),
      },
    } as any),
    ...nbaCupPatch,
    playoffs: undefined,
    allStar: undefined,
    draftLotteryResult: undefined,
    leagueStats: {
      ...state.leagueStats,
      year: nextYear,
      salaryCap:            newSalaryCap,
      luxuryPayroll:        newLuxuryPayroll,
      ...(newFirstApron  != null ? { firstApronAmount:  newFirstApron  } : {}),
      ...(newSecondApron != null ? { secondApronAmount: newSecondApron } : {}),
      minContractStaticAmount: newMinContract,
      mleUsage: {},  // reset MLE usage each season
      // Inflate league revenue floor alongside the cap so sponsorship/merch/tickets
      // scale with the economy rather than sitting flat forever.
      revenue: Math.round((state.leagueStats.revenue ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap))),
      // Inflate mediaRights revenue inputs so BroadcastingView formula stays
      // consistent with the inflated leagueStats.salaryCap, and unlock so the
      // commissioner can re-finalize a new deal each season.
      ...(state.leagueStats.mediaRights ? {
        mediaRights: {
          ...state.leagueStats.mediaRights,
          salaryCap: newSalaryCap / 1_000_000,
          totalRev:  (state.leagueStats.mediaRights.totalRev  ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
          mediaRev:  (state.leagueStats.mediaRights.mediaRev  ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
          lpRev:     (state.leagueStats.mediaRights.lpRev     ?? 0) * (newSalaryCap / (state.leagueStats.salaryCap || newSalaryCap)),
          isLocked:  false,
        },
      } : {}),
    },
    retirementAnnouncements: newRetirees,
    seasonPreviewDismissed: true,  // stays hidden through FA; shown when preseason starts (Oct 1)
    draftComplete: undefined,      // reset so draft can run for new year
    news: [...jerseyRetirementNewsItems, ...hofNewsItems, ...mortalityNewsItems, ...farewellNewsItems, ...teamOptionNewsItems, ...playerOptionNewsItems, ...retirementNewsItems, rolloverNews, ...(state.news ?? [])].slice(0, 200),
    history: [...(state.history ?? []), ...playerOptionHistory, ...teamOptionHistoryEntries, ...optionExtHistory, ...retirementHistoryEntries, ...farewellHistoryEntries, ...hofHistoryEntries, ...jerseyRetirementHistoryEntries, ...mortalityHistoryEntries, ...extRetireHistory],
    ...(pendingOptionToasts.length > 0
      ? { pendingOptionToasts: [...(state.pendingOptionToasts ?? []), ...pendingOptionToasts] }
      : {}),
  };
}

/** Returns true if the sim should fire a season rollover on this date.
 *  Triggers on June 30 of the current season year (day before FA opens July 1).
 *  e.g. season year 2026 → fires when date >= 2026-06-30.
 *  The year increment inside applySeasonRollover acts as the guard —
 *  after firing, leagueStats.year becomes nextYear so this won't re-fire. */
export function shouldFireRollover(state: GameState, dateNorm: string): boolean {
  const year = state.leagueStats.year;
  // The season runs Oct (year-1) → June (year). Rollover on June 30 of `year`.
  const rolloverDate = `${year}-06-30`;
  return dateNorm >= rolloverDate;
}
