import { GameState, NBAPlayer, NBATeam } from '../types';
import { normalizeDate, convertTo2KRating } from '../utils/helpers';
import { getTradeDeadlineDate } from '../utils/dateUtils';
import { getTradingBlock } from '../store/tradingBlockStore';

export interface GMChatContext {
  currentDate: string;
  seasonYear: number;
  seasonPhase: 'preseason' | 'regular' | 'playoffs' | 'offseason';
  daysUntilTradeDeadline: number | null;
  daysUntilPlayoffStart: number;

  team: {
    name: string;
    wins: number;
    losses: number;
    confRank: number;
    divRank: number;
    seed: number | null;
    streak: string;
  };

  payroll: {
    total: number;
    capRoom: number;
    luxTax: number;
    mleRemaining: number;
    apronStatus: string;
  };

  rosterSummary: {
    standard: number;
    twoWay: number;
    ng: number;
    avgOVR: number;
    topPlayers: string[];
  };

  // ── FULL ROSTER ──────────────────────────────
  roster: Array<{
    name: string;
    pos: string;
    k2: number;
    stats: { ppg: number; rpg: number; apg: number; fgPct: number };
    salary: string;
    contract: { yearsLeft: number; expiring: boolean };
    injury?: { type: string; gamesRemaining: number };
    status: 'starter' | 'bench' | '6th-man' | 'backup' | 'two-way';
    marketStatus?: 'untouchable' | 'available' | 'on-block';
  }>;

  recentMoves: Array<{
    type: 'trade' | 'sign' | 'waive' | 'injury';
    date: string;
    summary: string;
  }>;

  recentInjuries: Array<{
    player: string;
    type: string;
    gamesRemaining: number;
  }>;

  recentResults: Array<{
    date: string;
    opponent: string;
    score: string;
    win: boolean;
  }>;

  teamIntel: {
    status: string; // CONTENDING, REBUILDING, SELLING, BUYING
    untouchables: string[]; // player names
    tradingBlock: string[];
    needPositions: string[];
    expiringContracts: Array<{ player: string; salary: string; year: number }>;
  };

  recipient: {
    role: 'owner' | 'coach' | 'player';
    name: string;
    stats?: {
      ppg: number;
      rpg: number;
      apg: number;
      mpg: number;
      fgPct: number;
    };
    contract?: {
      yearsLeft: number;
      nextYearSalary: number;
      hasOption: boolean;
    };
    morale?: {
      overall: number;
      traits: string[];
    };
    recentStatline?: string[];
    status?: string;
    marketStatus?: string;
  };

  recentMessages: Array<{
    senderName: string;
    text: string;
    timestamp: string;
  }>;
}

/**
 * Build comprehensive game context for GM-mode LLM chat.
 * Includes full roster, team intel, recent activity, and conversation history.
 */
export function buildGMChatContext(
  state: GameState,
  recipientId: string,
  recentTurnCount: number = 5
): GMChatContext {
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  if (!userTeam) {
    throw new Error('User team not found');
  }

  const dateNorm = normalizeDate(state.date);
  const [year, month, day] = dateNorm.split('-').map(Number);
  const seasonYear = state.leagueStats?.year ?? 2026;

  // Determine season phase
  let seasonPhase: 'preseason' | 'regular' | 'playoffs' | 'offseason' = 'offseason';
  if ((month === 7 && day >= 1) || (month >= 8 && month <= 9) || (month === 10 && day <= 23)) {
    seasonPhase = 'preseason';
  } else if ((month === 10 && day >= 24) || (month >= 11) || (month <= 3)) {
    seasonPhase = 'regular';
  } else if (month >= 4) {
    seasonPhase = 'playoffs';
  }

  // Days until trade deadline
  const tradeDeadlineStr = `${seasonYear}-02-06`;
  const daysUntilTradeDeadline = dateNorm >= tradeDeadlineStr ? null : Math.ceil((new Date(tradeDeadlineStr).getTime() - new Date(dateNorm).getTime()) / (1000 * 60 * 60 * 24));

  // Days until playoff start
  const playoffStartStr = `${seasonYear}-04-13`;
  const daysUntilPlayoff = Math.ceil((new Date(playoffStartStr).getTime() - new Date(dateNorm).getTime()) / (1000 * 60 * 60 * 24));

  // ─────── FULL ROSTER ────────────────────────────────────────────
  const userRoster = state.players.filter(p => p.tid === state.userTeamId && p.status === 'Active');

  // Get trading block info
  const tradingBlock = getTradingBlock(state.userTeamId || 0);
  const untouchableIds = new Set(tradingBlock?.untouchableIds || []);
  const blockIds = new Set(tradingBlock?.blockIds || []);

  const roster = userRoster
    .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))
    .map(p => {
      const lr = (p as any).ratings?.[p.ratings.length - 1];
      const k2 = Math.round(convertTo2KRating(p.overallRating ?? 0, lr?.hgt ?? 50, lr?.tp));

      // Get season stats
      const ss = p.stats?.find(s => s.season === seasonYear && !s.playoffs);
      const ppg = ss ? ((ss.pts || 0) / Math.max(1, ss.gp || 1)).toFixed(1) : '0.0';
      const rpg = ss ? (((ss.trb || ss.reb || 0) / Math.max(1, ss.gp || 1))).toFixed(1) : '0.0';
      const apg = ss ? ((ss.ast || 0) / Math.max(1, ss.gp || 1)).toFixed(1) : '0.0';
      const fgPct = ss ? (((ss.fgm || 0) / Math.max(1, ss.fga || 1)) * 100).toFixed(1) : '0.0';

      // Salary
      const salary = `$${((p.contract?.amount ?? 0) / 1000).toFixed(1)}M`;

      // Years left
      const yearsLeft = Math.max(0, (p.contract?.exp ?? 0) - seasonYear);

      // Determine status (starter/bench/6th/etc) — simplified
      let status: 'starter' | 'bench' | '6th-man' | 'backup' | 'two-way' = 'bench';
      if ((p as any).twoWay) {
        status = 'two-way';
      } else if (k2 >= 85) {
        status = 'starter';
      } else if (k2 >= 75) {
        status = '6th-man';
      }

      // Market status
      let marketStatus: 'untouchable' | 'available' | 'on-block' | undefined;
      if (untouchableIds.has(p.internalId)) marketStatus = 'untouchable';
      else if (blockIds.has(p.internalId)) marketStatus = 'on-block';

      return {
        name: p.name,
        pos: p.pos || 'F',
        k2,
        stats: { ppg: parseFloat(ppg), rpg: parseFloat(rpg), apg: parseFloat(apg), fgPct: parseFloat(fgPct) },
        salary,
        contract: { yearsLeft, expiring: yearsLeft === 0 },
        injury: (p as any).injury?.gamesRemaining > 0
          ? { type: (p as any).injury.injuryType, gamesRemaining: (p as any).injury.gamesRemaining }
          : undefined,
        status,
        marketStatus,
      };
    });

  // ─────── TEAM INTEL ─────────────────────────────────────────────
  const standardPlayers = userRoster.filter(p => !(p as any).twoWay);
  const twoWayPlayers = userRoster.filter(p => (p as any).twoWay);
  const ngPlayers = userRoster.filter(p => (p as any).nonGuaranteed);

  const untouchables = roster
    .filter(r => r.marketStatus === 'untouchable')
    .map(r => r.name);

  const tradingBlockPlayers = roster
    .filter(r => r.marketStatus === 'on-block')
    .map(r => r.name);

  const expiringContracts = roster
    .filter(r => r.contract.expiring)
    .map(r => ({ player: r.name, salary: r.salary, year: seasonYear }));

  // Determine team status (simplified)
  const winPct = (userTeam.wins ?? 0) / Math.max(1, (userTeam.wins ?? 0) + (userTeam.losses ?? 0));
  let teamStatus = 'REBUILDING';
  if (winPct > 0.600) teamStatus = 'CONTENDING';
  else if (winPct > 0.500) teamStatus = 'RETOOLING';
  else if (winPct > 0.400) teamStatus = 'SELLING';

  // Position needs (weak spots)
  const posGroups: Record<string, number[]> = { G: [], F: [], C: [] };
  for (const r of roster) {
    if (r.pos.includes('G') || r.pos === 'PG' || r.pos === 'SG') posGroups.G.push(r.k2);
    else if (r.pos.includes('C') || r.pos === 'FC') posGroups.C.push(r.k2);
    else posGroups.F.push(r.k2);
  }
  const needPositions = Object.entries(posGroups)
    .map(([pos, vals]) => ({
      pos: pos === 'G' ? 'Guard' : pos === 'F' ? 'Forward' : 'Center',
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    }))
    .filter(p => p.avg < 82)
    .map(p => p.pos);

  // ─────── RECIPIENT DATA ────────────────────────────────────────
  const recipient = state.players.find(p => p.internalId === recipientId);
  const recipientStaff = recipient
    ? null
    : [
        ...(state.staff?.owners || []),
        ...(state.staff?.gms || []),
        ...(state.staff?.coaches || []),
      ].find(s => s.name === recipientId);

  let recipientData: GMChatContext['recipient'] = {
    role: 'player',
    name: recipientId,
  };

  if (recipient) {
    recipientData.role = 'player';
    recipientData.name = recipient.name;
    recipientData.status = recipient.status;

    // Season stats
    const ss = recipient.stats?.find(s => s.season === seasonYear && !s.playoffs);
    const gp = ss?.gp || 1;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    recipientData.stats = {
      ppg: ss ? round1((ss.pts || 0) / gp) : 0,
      rpg: ss ? round1((ss.trb || ss.reb || 0) / gp) : 0,
      apg: ss ? round1((ss.ast || 0) / gp) : 0,
      mpg: ss ? round1((ss.mp || 0) / gp) : 0,
      fgPct: ss ? round1(((ss.fgm || 0) / Math.max(1, ss.fga || 1)) * 100) : 0,
    };

    // Contract
    if (recipient.contract) {
      recipientData.contract = {
        yearsLeft: Math.max(0, (recipient.contract.exp ?? 0) - seasonYear),
        nextYearSalary: (recipient.contract.amount ?? 0) * 1000,
        hasOption: !!(recipient as any).playerOption || !!(recipient as any).teamOption,
      };
    }

    // Morale
    const moodTraits = (recipient as any).moodTraits?.slice(0, 3) || [];
    recipientData.morale = {
      overall: (recipient as any).morale ?? 75,
      traits: moodTraits,
    };

    // Market status
    if (untouchableIds.has(recipient.internalId)) recipientData.marketStatus = 'untouchable';
    else if (blockIds.has(recipient.internalId)) recipientData.marketStatus = 'available';
  } else if (recipientStaff) {
    recipientData.role = recipientStaff.role === 'owner' ? 'owner' : recipientStaff.role === 'coach' ? 'coach' : 'player';
    recipientData.name = recipientStaff.name;
  }

  // ─────── PAYROLL ───────────────────────────────────────────────
  const totalSalary = userRoster.reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1000), 0);
  const capSpace = 136000000 - totalSalary; // cap in USD

  // ─────── RECENT ACTIVITY ───────────────────────────────────────
  const recentMoves = (state.history ?? [])
    .slice(-15)
    .map(h => ({
      type: (h.type as any) === 'Signing' ? 'sign' : (h.type as any) === 'Trade' ? 'trade' : 'waive' as const,
      date: h.date ?? state.date,
      summary: h.text ?? '',
    }));

  const recentInjuries = (state.pendingInjuryToasts ?? []).slice(-5).map(inj => ({
    player: inj.playerName,
    type: inj.injuryType,
    gamesRemaining: inj.gamesRemaining,
  }));

  const recentResults = state.schedule
    .filter(g => new Date(g.date).getTime() < new Date(dateNorm).getTime() && g.played)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
    .map(g => {
      const isHome = g.homeTid === state.userTeamId;
      const opponent = state.teams.find(t => t.id === (isHome ? g.awayTid : g.homeTid))?.name ?? 'Unknown';
      const userScore = isHome ? g.homeScore : g.awayScore;
      const opponentScore = isHome ? g.awayScore : g.homeScore;
      const win = userScore > opponentScore;
      return {
        date: g.date,
        opponent,
        score: `${userScore}-${opponentScore}`,
        win,
      };
    });

  // ─────── CHAT HISTORY ──────────────────────────────────────────
  const recentMessages = state.chats
    .find(c => c.participants.includes(recipientId))
    ?.messages.slice(-recentTurnCount)
    .map(m => ({
      senderName: m.senderName,
      text: m.text,
      timestamp: m.timestamp,
    })) || [];

  return {
    currentDate: state.date,
    seasonYear,
    seasonPhase,
    daysUntilTradeDeadline,
    daysUntilPlayoffStart: daysUntilPlayoff,

    team: {
      name: userTeam.name,
      wins: userTeam.wins ?? 0,
      losses: userTeam.losses ?? 0,
      confRank: userTeam.confRank ?? 0,
      divRank: userTeam.divRank ?? 0,
      seed: userTeam.seed ?? null,
      streak: userTeam.streak ?? 'N/A',
    },

    payroll: {
      total: totalSalary,
      capRoom: Math.max(0, capSpace),
      luxTax: 0,
      mleRemaining: 2000000,
      apronStatus: capSpace < 0 ? 'Over cap' : 'Under cap',
    },

    rosterSummary: {
      standard: standardPlayers.length,
      twoWay: twoWayPlayers.length,
      ng: ngPlayers.length,
      avgOVR: Math.round(
        standardPlayers.reduce((sum, p) => sum + (p.overallRating ?? 0), 0) / Math.max(1, standardPlayers.length)
      ),
      topPlayers: roster.slice(0, 3).map(r => `${r.name} (${r.k2} OVR)`),
    },

    roster,

    recentMoves,
    recentInjuries,
    recentResults,

    teamIntel: {
      status: teamStatus,
      untouchables,
      tradingBlock: tradingBlockPlayers,
      needPositions,
      expiringContracts,
    },

    recipient: recipientData,

    recentMessages,
  };
}
