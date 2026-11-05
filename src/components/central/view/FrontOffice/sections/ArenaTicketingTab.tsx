import React from 'react';
import {
  CalendarDays,
  DollarSign,
  Minus,
  Plus,
  Smile,
  Ticket,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  getTicketDemandMultiplier,
} from '../../../../../services/tycoon/clubFinance';

interface ArenaTicketingTabProps {
  ticketMult: number;
  onTicketMultChange: (multiplier: number) => void;
  capacity: number;
  revenueEstimate: number;
  homeGames: number;
  fmt: (value: number) => string;
  locked?: boolean;
}

export const ArenaTicketingTab: React.FC<ArenaTicketingTabProps> = ({
  ticketMult,
  onTicketMultChange,
  capacity,
  revenueEstimate,
  homeGames,
  fmt,
  locked = false,
}) => {
  const basePrice = 85;
  const avgPrice = Math.round(basePrice * ticketMult);
  const fillRate = Math.min(100, Math.round(0.9 * getTicketDemandMultiplier(ticketMult) * 100));
  const avgAttendance = Math.round(capacity * fillRate / 100);
  const pricingLabel = ticketMult === 0 ? 'Free'
    : ticketMult <= 0.7 ? 'Budget'
    : ticketMult <= 0.9 ? 'Value'
    : ticketMult <= 1.1 ? 'Standard'
    : ticketMult <= 1.5 ? 'Premium'
    : 'Elite';
  const tiers = [
    ['Courtside', Math.round(avgPrice * 8.5), '~200 seats', 'bg-violet-400'],
    ['Lower Bowl', Math.round(avgPrice * 2.2), `~${Math.round(capacity * 0.25).toLocaleString()} seats`, 'bg-blue-400'],
    ['Club Level', Math.round(avgPrice * 1.6), `~${Math.round(capacity * 0.15).toLocaleString()} seats`, 'bg-cyan-400'],
    ['Upper Bowl', Math.round(avgPrice * 0.65), `~${Math.round(capacity * 0.40).toLocaleString()} seats`, 'bg-emerald-400'],
    ['Standing Room', Math.round(avgPrice * 0.35), 'Limited availability', 'bg-slate-400'],
  ] as Array<[string, number, string, string]>;
  const impact = [
    {
      label: 'Revenue',
      value: ticketMult >= 1.2 ? 'High' : ticketMult >= 0.9 ? 'Balanced' : 'Low',
      color: ticketMult >= 0.9 ? 'text-emerald-300' : 'text-rose-300',
      icon: <DollarSign size={20} />,
      tone: 'border-amber-400/35 bg-amber-400/10 text-amber-300',
    },
    {
      label: 'Attendance',
      value: ticketMult <= 0.8 ? 'High' : ticketMult <= 1.2 ? 'Balanced' : 'Low',
      color: ticketMult <= 1.2 ? 'text-emerald-300' : 'text-rose-300',
      icon: <Users size={20} />,
      tone: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
    },
    {
      label: 'Fan Satisfaction',
      value: ticketMult <= 1 ? 'Happy' : ticketMult <= 1.4 ? 'Neutral' : 'Unhappy',
      color: ticketMult <= 1 ? 'text-emerald-300' : ticketMult <= 1.4 ? 'text-amber-300' : 'text-rose-300',
      icon: <Smile size={20} />,
      tone: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300',
    },
    {
      label: 'Atmosphere',
      value: ticketMult <= 0.9 ? 'Electric' : ticketMult <= 1.3 ? 'Good' : 'Quiet',
      color: ticketMult <= 0.9 ? 'text-emerald-300' : ticketMult <= 1.3 ? 'text-amber-300' : 'text-rose-300',
      icon: <Zap size={20} />,
      tone: 'border-violet-400/35 bg-violet-400/10 text-violet-300',
    },
  ];

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Ticket Price Multiplier</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="text-4xl font-black tabular-nums text-white sm:text-5xl">{ticketMult.toFixed(2)}x</div>
                <span className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-black text-amber-300">
                  {pricingLabel} Pricing
                </span>
              </div>
            </div>
            <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border border-amber-400/45 bg-amber-400/[0.06] sm:h-28 sm:w-28">
              <div className="text-2xl font-black text-amber-300">{fmt(avgPrice)}</div>
              <div className="mt-1 text-xs text-slate-400">Avg. ticket</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[54px_minmax(0,1fr)_54px] items-stretch overflow-hidden rounded-xl border border-slate-700 bg-slate-950/65">
            <button
              type="button"
              onClick={() => onTicketMultChange(Math.max(0, ticketMult - 0.25))}
              disabled={locked || ticketMult <= 0}
              aria-label="Decrease ticket pricing"
              className="flex min-h-16 items-center justify-center border-r border-slate-700 text-slate-200 transition hover:bg-white/5 disabled:text-slate-700"
            >
              <Minus size={20} />
            </button>
            <div className="flex min-w-0 flex-col items-center justify-center px-3 text-center">
              <div className="text-base font-black text-white">{ticketMult.toFixed(2)}x · {pricingLabel} Pricing</div>
              <div className="mt-1 text-xs text-slate-400">Avg. ticket ~{fmt(avgPrice)}</div>
            </div>
            <button
              type="button"
              onClick={() => onTicketMultChange(ticketMult + 0.25)}
              disabled={locked}
              aria-label="Increase ticket pricing"
              className="flex min-h-16 items-center justify-center border-l border-slate-700 text-slate-200 transition hover:bg-white/5 disabled:text-slate-700"
            >
              <Plus size={20} />
            </button>
          </div>
          {locked && <div className="mt-3 text-xs font-bold text-amber-300">Ticket pricing is locked until next offseason.</div>}

          <div className="mt-5 px-2">
            <div className="relative h-3">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-600" />
              <div className="absolute left-0 top-0 h-3 w-px bg-slate-500" />
              <div className="absolute left-1/2 top-0 h-3 w-px bg-slate-500" />
              <div className="absolute right-0 top-0 h-3 w-px bg-slate-500" />
            </div>
            <div className="mt-1 grid grid-cols-3 text-xs text-slate-400">
              <span>0.00x<br />Free</span>
              <span className="text-center">1.00x<br />Standard</span>
              <span className="text-right">No maximum</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Pricing Tiers</div>
          <div className="mt-4 divide-y divide-slate-800">
            {tiers.map(([name, price, info, dot]) => (
              <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_170px] sm:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${dot}`} />
                  <span className="font-black text-white">{name}</span>
                </div>
                <div className="text-right font-black tabular-nums text-amber-300">{fmt(price)}</div>
                <div className="col-span-2 text-xs text-slate-400 sm:col-span-1 sm:text-right">{info}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <TicketSummary
            icon={<Ticket size={24} />}
            label="Average Ticket"
            value={fmt(avgPrice)}
            sub="Per game"
            tone="amber"
          />
          <TicketSummary
            icon={<Users size={24} />}
            label="Average Attendance"
            value={`${avgAttendance.toLocaleString()} / ${capacity.toLocaleString()}`}
            sub={`${fillRate}% capacity`}
            tone="emerald"
            progress={fillRate}
          />
          <TicketSummary
            icon={<TrendingUp size={24} />}
            label="Gate Revenue"
            value={homeGames > 0 ? fmt(revenueEstimate) : 'Schedule pending'}
            sub={homeGames > 0 ? 'Projected annual' : 'Awaiting fixture release'}
            tone="emerald"
          />
        </div>
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Pricing Impact</div>
          <div className="mt-4 space-y-4">
            {impact.map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${item.tone}`}>{item.icon}</span>
                <span className="min-w-0 flex-1 font-black text-white">{item.label}</span>
                <span className={`font-black ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/65 p-6 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Revenue Projection</div>
          <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
            <CalendarDays size={28} />
          </div>
          <div className="mt-5 break-words text-2xl font-black text-white">
            {homeGames > 0 ? fmt(revenueEstimate) : 'Schedule pending'}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {homeGames > 0
              ? `Annual projection across ${homeGames} scheduled home games.`
              : 'Annual projection appears after the season schedule is drawn.'}
          </p>
        </section>
      </aside>
    </div>
  );
};

const TicketSummary: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'amber' | 'emerald';
  progress?: number;
}> = ({ icon, label, value, sub, tone, progress }) => {
  const color = tone === 'amber' ? 'text-amber-300 border-amber-400/35 bg-amber-400/10' : 'text-emerald-300 border-emerald-400/35 bg-emerald-400/10';
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/65 p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${color}`}>{icon}</div>
      <div className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-xl font-black text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{sub}</div>
      {progress != null && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
};
