import React, { useMemo } from 'react';
import type { NBAPlayer } from '../../types';
import type { TycoonState, TycoonTier } from '../../types/tycoon';
import { TIER_BASE, getTierForClub } from '../../services/tycoon/specs/spain';
import { academyBudgetCostEUR, sumStaffPayrollEUR } from '../../services/tycoon/economyScale';

export interface FinanceTeamLike {
  tid?: number;
  id?: number;
  name: string;
  region?: string;
  abbrev?: string;
  imgURL?: string;
  logoUrl?: string;
  tycoon?: TycoonState;
}

const teamId   = (t: FinanceTeamLike): number => (t.tid ?? t.id ?? -1);
const teamLogo = (t: FinanceTeamLike): string | undefined => t.imgURL ?? t.logoUrl;
const teamStaffMarket = (t: FinanceTeamLike): 'nba' | 'euro' => {
  const tid = teamId(t);
  return tid >= 0 && tid < 100 ? 'nba' : 'euro';
};
const isACBClub = (t: FinanceTeamLike): boolean => {
  const tid = teamId(t);
  return tid >= 5000 && tid < 5100;
};
const isEuroLeagueClub = (t: FinanceTeamLike): boolean => {
  const tid = teamId(t);
  return tid >= 1000 && tid < 1100;
};

// ─── League Finances panel ────────────────────────────────────────────────────
// Single-view finances overview (no nested subtabs). Mirrors the mockup's
// "Financial Overview" only — Revenue/Expense/Salary/Health subtabs intentionally omitted.
//
// Reused by both InternationalLeagueHub (NBA-mode hubs) and CompetitionHubLayout
// (Euro-isolated mode Liga Endesa / Euroleague views).

export interface FinanceRow {
  team: FinanceTeamLike;
  matchday: number;
  sponsorship: number;
  tv: number;
  totalRev: number;
  wages: number;
  staff: number;
  facility: number;
  scouting: number;
  travel: number;
  medical: number;
  academy: number;
  totalExp: number;
  profit: number;
  wageRevPct: number;
  health: { label: string; tone: 'excellent' | 'good' | 'stable' | 'risk' | 'critical' };
}

const HEALTH_STYLES: Record<FinanceRow['health']['tone'], { dot: string; text: string; bg: string }> = {
  excellent: { dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
  good:      { dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  stable:    { dot: 'bg-yellow-400',  text: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
  risk:      { dot: 'bg-orange-400',  text: 'text-orange-400',  bg: 'bg-orange-500/10' },
  critical:  { dot: 'bg-rose-500',    text: 'text-rose-400',    bg: 'bg-rose-500/10' },
};

function classifyHealth(team: FinanceTeamLike, profit: number, wageRevPct: number): FinanceRow['health'] {
  if (isACBClub(team)) {
    if (wageRevPct > 130 || profit < -8_000_000) return { label: 'Critical', tone: 'critical' };
    if (profit < -4_000_000) return { label: 'Struggling', tone: 'risk' };
    if (profit < -1_000_000) return { label: 'Caution', tone: 'stable' };
    return { label: 'Healthy', tone: 'good' };
  }
  if (isEuroLeagueClub(team)) {
    if (wageRevPct > 140 || profit < -20_000_000) return { label: 'Critical', tone: 'critical' };
    if (profit < -10_000_000) return { label: 'Struggling', tone: 'risk' };
    if (profit < -3_000_000) return { label: 'Caution', tone: 'stable' };
    return { label: 'Healthy', tone: 'good' };
  }
  if (profit < -1_000_000) return { label: 'Critical',  tone: 'critical' };
  if (profit < 250_000)    return { label: 'At Risk',   tone: 'risk' };
  if (profit < 1_000_000)  return { label: 'Stable',    tone: 'stable' };
  if (profit < 10_000_000) return { label: 'Good',      tone: 'good' };
  return { label: 'Excellent', tone: 'excellent' };
}

function fmtMoney(value: number, symbol: string): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  if (abs === 0)            return `${symbol}0`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

function buildFinanceRow(team: FinanceTeamLike, players: NBAPlayer[]): FinanceRow {
  const t = team.tycoon ?? ((team as any).tycoon as TycoonState | undefined);
  const ledger = t?.ledgerHistory?.[t.ledgerHistory.length - 1];
  const staffMarket = teamStaffMarket(team);

  let matchday = 0, sponsorship = 0, tv = 0;
  let wages = 0, staff = 0, facility = 0, scouting = 0, travel = 0, medical = 0, academy = 0;

  // Live wages from current contracts (always available).
  const tid = teamId(team);
  const liveWages = players
    .filter(p => p.tid === tid)
    .reduce((s, p) => s + (Number(p.contract?.amount ?? 0) * 1000), 0);

  if (ledger) {
    matchday    = ledger.revenue.matchday    ?? 0;
    sponsorship = ledger.revenue.sponsorship ?? 0;
    tv          = ledger.revenue.tv          ?? 0;
    wages       = ledger.expenses.wages      ?? liveWages;
    staff       = sumStaffPayrollEUR(t, staffMarket) || (ledger.expenses.staff ?? 0);
    facility    = ledger.expenses.facility   ?? 0;
    scouting    = ledger.expenses.scouting   ?? 0;
    travel      = ledger.expenses.travel     ?? 0;
    medical     = ledger.expenses.medical    ?? 0;
    academy     = (ledger.expenses as any).academy ?? 0;
  } else {
    wages = liveWages;
    // Re-derive tier from the canonical lookup whenever the team has a
    // recognisable name. This shields the panel from stale tier values
    // saved before the lookup was fixed: a Tier-S club with t.tier='D'
    // would otherwise render with D-floor matchday and sponsorships.
    // Gameplay-driven tier shifts are still respected because the heal
    // in migrate.ts is one-shot — once tierInitHealed=true, t.tier
    // tracks gameplay and is trusted here.
    const savedTier  = (t?.tier as TycoonTier | undefined);
    const lookupTier = getTierForClub((team.name ?? '') || (team.region ?? ''));
    const tier: TycoonTier | undefined = savedTier ?? lookupTier;
    const tb = tier ? TIER_BASE[tier] : null;

    if (t?.sponsorships) {
      sponsorship = (Object.values(t.sponsorships) as any[])
        .reduce((s, slot) => s + Number(slot?.valuePerYear ?? 0), 0);
    }
    // If the saved sponsorships look like stale D-tier defaults but the
    // canonical lookup says higher, fall back to the lookup-tier floor so
    // the panel doesn't render an absurd "Real Madrid €494K sponsors".
    if (
      tb &&
      lookupTier !== savedTier &&
      sponsorship < (TIER_BASE[lookupTier].sponsorshipFloor.kit * 0.3)
    ) {
      const floor = TIER_BASE[lookupTier].sponsorshipFloor;
      sponsorship = Math.round((floor.kit + floor.sleeve + floor.stadium) * 0.7);
    }
    if (sponsorship === 0) sponsorship = Math.round(wages * 0.7);

    tv = tb ? tb.tvRevenue : Math.round(wages * 0.4);

    if (tb) {
      // Use tier-canonical capacity when the saved facilities look stale
      // (e.g. 4500-seat arena for what should be a Tier-S club).
      const savedCap = (t?.facilities?.stadium as any)?.capacity;
      const expectedCap = TIER_BASE[lookupTier].stadiumCapacity;
      const cap = savedCap && savedCap >= expectedCap * 0.6
        ? savedCap
        : expectedCap;
      const fillFloor  = ({ S: 0.85, A: 0.75, B: 0.65, C: 0.55, D: 0.45 } as Record<TycoonTier, number>)[tier!] ?? 0.65;
      matchday = Math.round(cap * fillFloor * tb.ticketPrice * 30);
    } else {
      matchday = Math.round(wages * 0.32);
    }

    staff = sumStaffPayrollEUR(t, staffMarket)
         || Math.round(wages * 0.10);

    const facLevels = (t?.facilities?.stadium?.level ?? 1)
                    + (t?.facilities?.trainingCenter?.level ?? 1)
                    + (t?.facilities?.academy?.level ?? 1);
    facility = tb ? facLevels * tb.facilityOpsPerLevel : Math.round(wages * 0.07);

    scouting = (t?.scoutingInvestment ?? 0) || (tb ? tb.scoutingBudget : Math.round(wages * 0.04));

    travel  = tb ? tb.travelBase : Math.round(wages * 0.06);
    medical = (t?.medicalBudget ?? 0) || Math.round(wages * 0.06);
    academy = academyBudgetCostEUR(t?.academyBudget, tier);
  }

  const totalRev   = matchday + sponsorship + tv;
  const totalExp   = wages + staff + facility + scouting + travel + medical + academy;
  const profit     = totalRev - totalExp;
  const wageRevPct = totalRev > 0 ? (wages / totalRev) * 100 : 0;

  return {
    team, matchday, sponsorship, tv, totalRev,
    wages, staff, facility, scouting, travel, medical, academy, totalExp,
    profit, wageRevPct, health: classifyHealth(team, profit, wageRevPct),
  };
}

// Conic-gradient donut. Slices in the order given.
const Donut: React.FC<{
  slices: Array<{ value: number; color: string }>;
  size?: number;
}> = ({ slices, size = 96 }) => {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  let acc = 0;
  const stops = total > 0
    ? slices.map(s => {
        const start = (acc / total) * 360;
        acc += Math.max(0, s.value);
        const end = (acc / total) * 360;
        return `${s.color} ${start}deg ${end}deg`;
      }).join(', ')
    : '#1e293b 0deg 360deg';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full"
        style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
      />
      <div
        className="absolute rounded-full bg-[#0f1218]"
        style={{ inset: size * 0.18 }}
      />
    </div>
  );
};

const SummaryCard: React.FC<{
  title: string;
  total: number;
  totalColor: string;
  symbol: string;
  slices: Array<{ label: string; value: number; color: string }>;
}> = ({ title, total, totalColor, symbol, slices }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</span>
      <span className="text-lg font-black tabular-nums" style={{ color: totalColor }}>
        {fmtMoney(total, symbol)}
      </span>
    </div>
    <div className="flex items-center gap-4">
      <Donut slices={slices.map(s => ({ value: s.value, color: s.color }))} />
      <div className="flex-1 min-w-0 space-y-1.5">
        {slices.map(s => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div key={s.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-slate-400 flex-1 truncate">{s.label}</span>
              <span className="font-bold text-slate-200 tabular-nums">{fmtMoney(s.value, symbol)}</span>
              <span className="text-slate-500 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export interface LeagueFinancesPanelProps {
  teams: FinanceTeamLike[];
  players: NBAPlayer[];
  /** Display name shown in the panel header — e.g. "Liga Endesa (ACB)". */
  displayName: string;
  /** Short tag shown in the scope chip — e.g. "Liga ACB". */
  shortName: string;
  /** Currency symbol for all money cells. */
  currencySymbol: string;
  seasonYear: number;
}

export const LeagueFinancesPanel: React.FC<LeagueFinancesPanelProps> = ({
  teams, players, displayName, shortName, currencySymbol: symbol, seasonYear,
}) => {
  const acbView = useMemo(() => teams.length > 0 && teams.every(isACBClub), [teams]);
  const euroLeagueView = useMemo(() => teams.length > 0 && teams.every(isEuroLeagueClub), [teams]);
  const rows = useMemo(
    () => teams
      .map(team => buildFinanceRow(team, players))
      .sort((a, b) => b.profit - a.profit),
    [teams, players],
  );

  const totals = useMemo(() => {
    const r = rows.reduce(
      (acc, row) => {
        acc.matchday    += row.matchday;
        acc.sponsorship += row.sponsorship;
        acc.tv          += row.tv;
        acc.wages       += row.wages;
        acc.staff       += row.staff;
        acc.facility    += row.facility;
        acc.scouting    += row.scouting;
        acc.travel      += row.travel;
        acc.medical     += row.medical;
        acc.academy     += row.academy;
        acc.profit      += row.profit;
        if (row.profit > 0) acc.profitableTeams += 1;
        return acc;
      },
      { matchday: 0, sponsorship: 0, tv: 0, wages: 0, staff: 0, facility: 0, scouting: 0, travel: 0, medical: 0, academy: 0, profit: 0, profitableTeams: 0 },
    );
    const totalRev = r.matchday + r.sponsorship + r.tv;
    const totalExp = r.wages + r.staff + r.facility + r.scouting + r.travel + r.medical + r.academy;
    const avgProfit = rows.length ? r.profit / rows.length : 0;
    return { ...r, totalRev, totalExp, avgProfit };
  }, [rows]);

  const revenueSlices = [
    { label: 'Matchday Revenue', value: totals.matchday,    color: '#3b82f6' },
    { label: 'Sponsorships',     value: totals.sponsorship, color: '#22c55e' },
    { label: 'TV Rights',        value: totals.tv,          color: '#a855f7' },
  ];
  const expenseSlices = [
    { label: 'Wages',        value: totals.wages,    color: '#ef4444' },
    { label: 'Staff',        value: totals.staff,    color: '#f97316' },
    { label: 'Facility Ops', value: totals.facility, color: '#eab308' },
    { label: 'Scouting',     value: totals.scouting, color: '#84cc16' },
    { label: 'Travel',       value: totals.travel,   color: '#06b6d4' },
    { label: 'Medical',      value: totals.medical,  color: '#a855f7' },
    { label: 'Youth Academy', value: totals.academy, color: '#10b981' },
  ];
  const healthLegend = (acbView || euroLeagueView)
    ? [
        { tone: 'good', label: 'Healthy' },
        { tone: 'stable', label: 'Caution' },
        { tone: 'risk', label: 'Struggling' },
        { tone: 'critical', label: 'Critical' },
      ] as const
    : [
        { tone: 'excellent', label: 'Excellent' },
        { tone: 'good', label: 'Good' },
        { tone: 'stable', label: 'Stable' },
        { tone: 'risk', label: 'At Risk' },
        { tone: 'critical', label: 'Critical' },
      ] as const;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black uppercase italic tracking-tight text-white">League Finances</h2>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            {displayName} · {seasonYear}/{(seasonYear + 1).toString().slice(-2)} season
          </p>
        </div>
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          {teams.length} clubs · scope: {shortName}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SummaryCard
          title="Money in"
          total={totals.totalRev}
          totalColor="#34d399"
          symbol={symbol}
          slices={revenueSlices}
        />
        <SummaryCard
          title="Money out"
          total={totals.totalExp}
          totalColor="#f87171"
          symbol={symbol}
          slices={expenseSlices}
        />
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Projected League Profit</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mt-3">Total</span>
          <span className={`text-3xl font-black tabular-nums mt-0.5 ${totals.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {fmtMoney(totals.profit, symbol)}
          </span>
          <div className="grid grid-cols-2 gap-3 mt-auto pt-4">
            <div className="bg-black/30 rounded-lg px-3 py-2 border border-white/5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Avg Profit / Team</div>
              <div className={`text-sm font-black tabular-nums ${totals.avgProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {fmtMoney(totals.avgProfit, symbol)}
              </div>
            </div>
            <div className="bg-black/30 rounded-lg px-3 py-2 border border-white/5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Profitable Teams</div>
              <div className="text-sm font-black tabular-nums text-emerald-300">
                {totals.profitableTeams}<span className="text-slate-500 font-normal"> / {rows.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[1280px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold">#</th>
                <th rowSpan={2} className="px-3 py-2 text-left font-bold">Team</th>
                <th colSpan={4} className="px-3 py-2 text-center font-bold border-l border-white/5">Money In</th>
                <th rowSpan={2} className="px-3 py-2 text-right font-bold border-l border-white/5">Projected Profit</th>
                <th colSpan={8} className="px-3 py-2 text-center font-bold border-l border-white/5">Money Out</th>
                <th rowSpan={2} className="px-3 py-2 text-right font-bold border-l border-white/5">Wage / Rev</th>
                <th rowSpan={2} className="px-3 py-2 text-center font-bold border-l border-white/5">Outlook</th>
              </tr>
              <tr className="text-[9px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <th className="px-2 py-2 text-right font-bold border-l border-white/5">Matchday</th>
                <th className="px-2 py-2 text-right font-bold">Sponsors</th>
                <th className="px-2 py-2 text-right font-bold">TV Rights</th>
                <th className="px-2 py-2 text-right font-bold">Total Rev</th>
                <th className="px-2 py-2 text-right font-bold border-l border-white/5">Wages</th>
                <th className="px-2 py-2 text-right font-bold">Staff</th>
                <th className="px-2 py-2 text-right font-bold">Facility</th>
                <th className="px-2 py-2 text-right font-bold">Scouting</th>
                <th className="px-2 py-2 text-right font-bold">Travel</th>
                <th className="px-2 py-2 text-right font-bold">Medical</th>
                <th className="px-2 py-2 text-right font-bold">Academy</th>
                <th className="px-2 py-2 text-right font-bold">Total Exp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, idx) => {
                const style = HEALTH_STYLES[row.health.tone];
                const wageColor =
                  row.wageRevPct > 100 ? 'text-rose-400'   :
                  row.wageRevPct > 70  ? 'text-orange-400' :
                  row.wageRevPct > 55  ? 'text-yellow-300' :
                                          'text-slate-300';
                const logo = teamLogo(row.team);
                return (
                  <tr key={teamId(row.team)} className="hover:bg-white/[0.04] transition-colors">
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-500 font-black">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {logo && (
                          <div className="w-6 h-6 rounded bg-white/95 p-0.5 shrink-0">
                            <img
                              src={logo}
                              alt=""
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <span className="font-bold text-slate-200 truncate">
                          {row.team.region ? `${row.team.region} ` : ''}{row.team.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300 border-l border-white/5">{fmtMoney(row.matchday, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">{fmtMoney(row.sponsorship, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300">{fmtMoney(row.tv, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-300">{fmtMoney(row.totalRev, symbol)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-black border-l border-white/5 ${row.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fmtMoney(row.profit, symbol)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-300 border-l border-white/5">{fmtMoney(row.wages, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.staff, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.facility, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.scouting, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.travel, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-400">{fmtMoney(row.medical, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-300/80">{fmtMoney(row.academy, symbol)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-rose-300">{fmtMoney(row.totalExp, symbol)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold border-l border-white/5 ${wageColor}`}>
                      {row.wageRevPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 border-l border-white/5">
                      <span className={`flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {row.health.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No clubs loaded for {shortName} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-4 px-4 py-2.5 border-t border-white/5 text-[10px] font-bold uppercase tracking-widest">
          {healthLegend.map(({ tone, label }) => {
            const s = HEALTH_STYLES[tone];
            return (
            <span key={tone} className={`flex items-center gap-1.5 ${s.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {label}
            </span>
          )})}
        </div>
      </div>
    </div>
  );
};
