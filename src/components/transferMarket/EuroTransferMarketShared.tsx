import React from 'react';
import { ArrowLeftRight, Inbox, ListChecks, Search } from 'lucide-react';
import type { BidStatus, ClauseStatus, MockClub, MockPlayer } from './mockData';
import { useTransferMarketContext } from './state';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import type { NBAPlayer } from '../../types';
import { PlayerNameWithHover } from '../shared/PlayerNameWithHover';

export type TabKey = 'listings' | 'inbox' | 'browse' | 'clauses';

export type OpenMarketPlayer = (player: MockPlayer) => void;

export const fmtEUR = (n: number): string => {
  if (n === 0) return '€0';
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}K`;
  return `€${n}`;
};

const ratingColor = (v: number): string => {
  if (v >= 90) return 'text-blue-300 border-blue-500/40 bg-blue-500/10';
  if (v >= 80) return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  if (v >= 70) return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  if (v >= 50) return 'text-orange-300 border-orange-500/40 bg-orange-500/10';
  return 'text-rose-300 border-rose-500/40 bg-rose-500/10';
};

export const statusColor = (s: BidStatus): string => {
  switch (s) {
    case 'Highest Bid': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'Active': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'Outbid': return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
    case 'Accepted': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    case 'Rejected': return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    case 'Withdrawn': return 'bg-slate-700/40 text-slate-500 border-slate-600/40';
  }
};

export const clauseStatusColor = (s: ClauseStatus): string => {
  switch (s) {
    case 'Active': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'Trigger Risk': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'Fired': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    case 'Expired': return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
    case 'No Clause': return 'bg-slate-700/40 text-slate-500 border-slate-600/40';
  }
};

export function resolveMarketPlayer(players: NBAPlayer[], player: MockPlayer): NBAPlayer | null {
  const ids = new Set([
    player.id,
    (player as any).internalId,
    (player as any).playerId,
    (player as any).pid,
  ].filter(Boolean));
  return players.find(p =>
    ids.has(p.internalId) ||
    ids.has(String((p as any).pid ?? '')) ||
    p.name === player.name
  ) ?? null;
}

export const PlayerCell: React.FC<{ p: MockPlayer; small?: boolean; onOpen?: OpenMarketPlayer; hoverPlayer?: NBAPlayer | null }> = ({ p, small, onOpen, hoverPlayer = null }) => (
  <div
    className={`flex items-center gap-3 ${onOpen ? 'cursor-pointer hover:text-amber-200' : ''}`}
    role={onOpen ? 'button' : undefined}
    tabIndex={onOpen ? 0 : undefined}
    onClick={(e) => {
      if (!onOpen) return;
      e.stopPropagation();
      onOpen(p);
    }}
    onKeyDown={(e) => {
      if (!onOpen || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      onOpen(p);
    }}
  >
    <PlayerPortrait
      imgUrl={p.imgURL}
      face={p.face}
      playerName={p.name}
      size={small ? 32 : 44}
    />
    <div className="min-w-0">
      {hoverPlayer ? (
        <PlayerNameWithHover player={hoverPlayer} className={`${small ? 'text-[11px]' : 'text-xs'} font-bold text-white truncate block`}>
          {p.name}
        </PlayerNameWithHover>
      ) : (
        <div className={`${small ? 'text-[11px]' : 'text-xs'} font-bold text-white truncate`}>{p.name}</div>
      )}
      <div className="text-[9px] text-slate-500 truncate">
        {p.flag} {p.position} · {p.age}y · {p.contractYearsLeft}y left
      </div>
    </div>
  </div>
);

export const RatingBadge: React.FC<{ label: 'OVR' | 'POT'; value: number; small?: boolean }> = ({ label, value, small }) => {
  const tooltip = label === 'OVR'
    ? 'Overall rating'
    : 'Potential rating';
  return (
    <div
      title={`${tooltip}: ${value}`}
      aria-label={`${tooltip}: ${value}`}
      className={`inline-flex items-center gap-1 px-2 ${small ? 'py-0.5 text-[10px]' : 'py-1 text-[11px]'} rounded-md border font-black tabular-nums ${ratingColor(value)}`}
    >
      <span className="text-[8px] font-bold opacity-60 tracking-widest">{label}</span>
      {value}
    </div>
  );
};

export const OvrPotPair: React.FC<{ ovr: number; pot: number; small?: boolean }> = ({ ovr, pot, small }) => (
  <div className="inline-flex items-center gap-1">
    <RatingBadge label="OVR" value={ovr} small={small} />
    <RatingBadge label="POT" value={pot} small={small} />
  </div>
);

export const ClubChip: React.FC<{ c: MockClub; small?: boolean }> = ({ c, small }) => {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const size = small ? 'w-5 h-5' : 'w-6 h-6';
  const showLogo = c.logoUrl && !logoFailed;
  return (
    <div className="inline-flex items-center gap-1.5">
      {showLogo ? (
        <img
          src={c.logoUrl}
          alt={c.shortName}
          className={`${size} object-contain shrink-0`}
          loading="lazy"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <div
          className={`${size} ${small ? 'text-[9px]' : 'text-[10px]'} rounded-full flex items-center justify-center font-black text-white shrink-0`}
          style={{ background: c.colorHex, border: '1px solid rgba(255,255,255,0.2)' }}
        >
          {c.shortName}
        </div>
      )}
      <div className="min-w-0">
        <div className={`${small ? 'text-[10px]' : 'text-[11px]'} font-bold text-white truncate`}>{c.name}</div>
        <div className="text-[9px] text-slate-500 truncate">{c.flag} {c.league}</div>
      </div>
    </div>
  );
};

export const StatusPill: React.FC<{ children: React.ReactNode; tone: string }> = ({ children, tone }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${tone}`}>
    {children}
  </span>
);

export const HeaderStrip: React.FC = () => {
  const { club, budget, window: w } = useTransferMarketContext();
  return (
    <div className="bg-slate-900/60 border-b border-slate-800/60 px-4 sm:px-6 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black text-white border-2 border-white/20" style={{ background: club.colorHex }}>
          {club.logoUrl ? (
            <img src={club.logoUrl} alt={club.name} className="w-full h-full object-contain p-1" />
          ) : (
            club.shortName
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{club.name} · Front Office</div>
          <h1 className="text-lg font-black text-white flex flex-wrap items-center gap-2">
            <ArrowLeftRight size={18} className="text-amber-400" />
            Transfer Market
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Auction hub for player transfers</span>
          </h1>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 text-[11px] w-full lg:w-auto">
        <div className="flex flex-col items-start lg:items-end">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Cash</span>
          <span className="font-black text-emerald-300">{fmtEUR(budget.cashEUR)}</span>
        </div>
        <div className="flex flex-col items-start lg:items-end">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Payroll Space</span>
          <span className="font-black text-blue-300">{fmtEUR(budget.payrollSpaceEUR)}</span>
        </div>
        <div className="flex flex-col items-start lg:items-end">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Window</span>
          <span className={`font-black ${w.open ? 'text-amber-300' : 'text-slate-500'}`}>
            {w.windowLabel}{w.open ? ` · ${w.daysLeft}d left` : ` · ${w.spanLabel}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export const TabsRow: React.FC<{ active: TabKey; onChange: (k: TabKey) => void; counts: Record<TabKey, number> }> = ({ active, onChange, counts }) => {
  const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { key: 'listings', label: 'My Listings', icon: ListChecks },
    { key: 'inbox', label: 'Inbox', icon: Inbox },
    { key: 'browse', label: 'Browse Market', icon: Search },
  ];
  return (
    <div className="px-4 sm:px-6 pt-4 border-b border-slate-800/60 flex items-center gap-1 bg-slate-900/40 overflow-x-auto scrollbar-hide">
      {tabs.map(t => {
        const isActive = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`shrink-0 px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 border-b-2 ${
              isActive ? 'text-amber-300 border-amber-400' : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <Icon size={14} />
            {t.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
};
