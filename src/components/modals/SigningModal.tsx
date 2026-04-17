/**
 * SigningModal — NBA 2K-style free agent signing modal.
 * Used by BOTH Commissioner Mode and GM Mode.
 *
 * Flow:
 *   Commissioner: PlayerActionsModal → pick team → this modal (any team)
 *   GM Mode:      FreeAgentsView → this modal (locked to userTeamId)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { NBAPlayer, NBATeam } from '../../types';
import { getPlayerImage } from '../central/view/bioCache';
import { convertTo2KRating } from '../../utils/helpers';

interface SigningModalProps {
  player: NBAPlayer;
  team: NBATeam;
  leagueStats: any;
  players: NBAPlayer[];
  onClose: () => void;
  onSign: (contract: { salary: number; years: number; option: string }) => void;
}

// Inline salary helpers to avoid circular dep issues
function formatSalaryM(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd}`;
}

function computeBasicOffer(player: NBAPlayer, leagueStats: any): { salaryUSD: number; years: number; hasPlayerOption: boolean } {
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const hgt = lastRating?.hgt ?? 50;
  const k2 = convertTo2KRating(player.overallRating ?? 60, hgt);
  const cap = leagueStats?.salaryCap ?? 154_600_000;
  const minSalary = leagueStats?.minContractStaticAmount ?? 1_200_000;

  // Tiered salary based on K2 OVR
  let pct: number;
  if (k2 >= 95) pct = 0.30;       // supermax tier
  else if (k2 >= 90) pct = 0.22;  // max tier
  else if (k2 >= 85) pct = 0.15;  // star
  else if (k2 >= 80) pct = 0.10;  // starter
  else if (k2 >= 75) pct = 0.06;  // rotation
  else if (k2 >= 70) pct = 0.03;  // bench
  else pct = 0;                    // minimum

  const salaryUSD = Math.max(minSalary, Math.round(cap * pct));
  const years = k2 >= 85 ? 4 : k2 >= 78 ? 3 : k2 >= 72 ? 2 : 1;
  const hasPlayerOption = k2 >= 85 && years >= 3;

  return { salaryUSD, years, hasPlayerOption };
}

export const SigningModal: React.FC<SigningModalProps> = ({
  player, team, leagueStats, players, onClose, onSign,
}) => {
  const [salary, setSalary] = useState(0);
  const [years, setYears] = useState(1);
  const [option, setOption] = useState<'NONE' | 'PLAYER' | 'TEAM'>('NONE');

  const cap = leagueStats?.salaryCap ?? 154_600_000;

  const initialOffer = useMemo(() => computeBasicOffer(player, leagueStats), [player, leagueStats]);

  useEffect(() => {
    setSalary(initialOffer.salaryUSD);
    setYears(initialOffer.years);
    setOption(initialOffer.hasPlayerOption ? 'PLAYER' : 'NONE');
  }, [initialOffer]);

  // Team payroll
  const teamPayroll = useMemo(() => {
    return players
      .filter(p => p.tid === team.id && !(p as any).twoWay)
      .reduce((sum, p) => sum + ((p.contract?.amount ?? 0) * 1_000), 0);
  }, [players, team.id]);

  const rosterCount = useMemo(() =>
    players.filter(p => p.tid === team.id && !(p as any).twoWay).length,
  [players, team.id]);

  // K2 OVR
  const lastRating = (player as any).ratings?.[(player as any).ratings?.length - 1];
  const k2Ovr = convertTo2KRating(player.overallRating ?? 60, lastRating?.hgt ?? 50);

  // Interest meter — how likely the player accepts this offer
  const interest = useMemo(() => {
    const marketVal = initialOffer.salaryUSD;
    if (marketVal <= 0) return 50;
    const ratio = salary / marketVal;
    // Overpay = high interest, underpay = low
    const base = Math.min(99, Math.max(5, Math.round(ratio * 70 + (years >= initialOffer.years ? 10 : -5))));
    return base;
  }, [salary, years, initialOffer]);

  const incrementSalary = (amt: number) => setSalary(prev => Math.max(1_200_000, prev + amt));
  const incrementYears = (amt: number) => setYears(prev => Math.max(1, Math.min(5, prev + amt)));
  const cycleOption = (dir: number) => {
    const opts: Array<'NONE' | 'PLAYER' | 'TEAM'> = ['NONE', 'PLAYER', 'TEAM'];
    const idx = opts.indexOf(option);
    setOption(opts[(idx + dir + opts.length) % opts.length]);
  };

  // Per-year breakdown table
  const yearsTable = Array.from({ length: years }).map((_, i) => {
    const yearSalary = salary * Math.pow(1.05, i);
    const capRoom = cap - (teamPayroll + yearSalary);
    return { year: (leagueStats?.year ?? 2026) + i, salary: yearSalary, capRoom };
  });

  const playerImg = getPlayerImage(player);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="relative w-full max-w-6xl bg-[#121212] border border-white/10 rounded-sm overflow-hidden flex flex-col shadow-2xl"
        style={{ height: '85vh' }}
      >
        {/* ── Header Rail ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#e21d37] text-white">
          <div className="flex items-center gap-2">
            <span className="bg-black px-2 py-0.5 text-xs font-black italic uppercase tracking-widest">Association</span>
            <span className="text-sm font-bold uppercase tracking-tight">Sign Contract</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="opacity-70">Current Team :</span>
              <span className="font-bold uppercase">{team.name}</span>
              {team.logoUrl && <img src={team.logoUrl} className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />}
            </div>
            <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-full"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left Panel: Player Visuals ─────────────────────────────── */}
          <div className="w-1/3 relative border-r border-white/5 bg-gradient-to-b from-[#1a1a1a] to-black hidden md:block">
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="w-full h-full bg-[radial-gradient(circle_at_center,_#e21d37_0%,_transparent_70%)]" />
            </div>
            <div className="relative h-full flex flex-col">
              <div className="flex-1 flex items-end justify-center px-8 relative">
                {playerImg ? (
                  <img src={playerImg} alt={player.name} className="max-h-[85%] object-contain drop-shadow-[0_0_30px_rgba(226,29,55,0.3)]" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-black text-slate-600">
                    {(player.name ?? '??').split(' ').map(w => w[0]).join('')}
                  </div>
                )}
                <div className="absolute top-8 left-8">
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white drop-shadow-md">{player.name}</h2>
                </div>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-8 px-10 pb-12">
                {/* OVR Box */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-white/50 uppercase mb-1">Ovr</span>
                  <div className="w-16 h-20 bg-gradient-to-b from-red-600 to-red-900 border-2 border-white/20 flex items-center justify-center rounded-sm">
                    <span className="text-3xl font-black text-white">{Math.round(k2Ovr)}</span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex-1 grid grid-cols-2 gap-y-2 gap-x-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-white/30 uppercase">Position</span>
                    <span className="text-xs font-bold text-yellow-500 uppercase">{player.pos || '—'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-white/30 uppercase">Age</span>
                    <span className="text-xs font-bold text-yellow-500 uppercase">{player.age ?? '—'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-white/30 uppercase">Market Value</span>
                    <span className="text-xs font-bold text-yellow-500 uppercase">{formatSalaryM(initialOffer.salaryUSD)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-white/30 uppercase">Status</span>
                    <span className="text-xs font-bold text-yellow-500 uppercase">{player.status ?? 'Free Agent'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Panel: Contract Controls ─────────────────────────── */}
          <div className="flex-1 flex flex-col bg-[#121212]">
            {/* Interest Bar */}
            <div className="px-10 py-6 border-b border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-white italic">Interest</span>
                <span className={`text-xs font-bold ${interest >= 70 ? 'text-emerald-400' : interest >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{interest}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${interest}%` }}
                  className={`h-full ${interest >= 70 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : interest >= 40 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-red-600 to-red-400'}`}
                />
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Finances Info */}
              <div className="w-1/3 p-10 border-r border-white/5">
                <h3 className="text-xs font-black uppercase italic tracking-widest text-white mb-6">Finances</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-white/5 pb-1">
                    <span className="text-[10px] font-bold text-white/40 uppercase">Roster</span>
                    <span className="text-xs font-medium text-white">{rosterCount}/15</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/5 pb-1">
                    <span className="text-[10px] font-bold text-white/40 uppercase">Team Payroll</span>
                    <span className="text-xs font-medium text-white">{formatSalaryM(teamPayroll)}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/5 pb-1">
                    <span className="text-[10px] font-bold text-white/40 uppercase">Salary Cap</span>
                    <span className="text-xs font-medium text-white">{formatSalaryM(cap)}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/5 pb-1">
                    <span className="text-[10px] font-bold text-white/40 uppercase">Cap Space</span>
                    <span className={`text-xs font-bold ${cap - teamPayroll > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatSalaryM(Math.abs(cap - teamPayroll))}
                    </span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/5 pb-1">
                    <span className="text-[10px] font-bold text-white/40 uppercase">This Offer</span>
                    <span className="text-xs font-bold text-[#e21d37]">{formatSalaryM(salary)}/yr</span>
                  </div>
                </div>
              </div>

              {/* Editing Controls */}
              <div className="flex-1 flex flex-col">
                <div className="p-10 space-y-6">
                  {/* Salary Control */}
                  <div className="space-y-2">
                    <span className="block text-center text-[10px] font-bold text-[#e21d37] uppercase tracking-widest">Salary</span>
                    <div className="flex items-center justify-between px-4 h-12 bg-white/5 border border-white/10 rounded-sm">
                      <button onClick={() => incrementSalary(-500_000)} className="text-white hover:text-[#e21d37] transition-colors"><ChevronLeft /></button>
                      <span className="text-xl font-black text-[#e21d37] italic">{formatSalaryM(salary)}</span>
                      <button onClick={() => incrementSalary(500_000)} className="text-white hover:text-[#e21d37] transition-colors"><ChevronRight /></button>
                    </div>
                  </div>

                  {/* Years Control */}
                  <div className="space-y-2">
                    <span className="block text-center text-[10px] font-bold text-white/40 uppercase tracking-widest">Years</span>
                    <div className="flex items-center justify-between px-4 h-10 bg-white/5 border border-white/10 rounded-sm">
                      <button onClick={() => incrementYears(-1)} className="text-white/60 hover:text-white"><ChevronLeft size={18} /></button>
                      <span className="text-lg font-bold text-white italic">{years}</span>
                      <button onClick={() => incrementYears(1)} className="text-white/60 hover:text-white"><ChevronRight size={18} /></button>
                    </div>
                  </div>

                  {/* Option Control */}
                  <div className="space-y-2">
                    <span className="block text-center text-[10px] font-bold text-white/40 uppercase tracking-widest">Option</span>
                    <div className="flex items-center justify-between px-4 h-10 bg-white/5 border border-white/10 rounded-sm">
                      <button onClick={() => cycleOption(-1)} className="text-white/60 hover:text-white"><ChevronLeft size={18} /></button>
                      <span className="text-lg font-bold text-white italic">{option}</span>
                      <button onClick={() => cycleOption(1)} className="text-white/60 hover:text-white"><ChevronRight size={18} /></button>
                    </div>
                  </div>
                </div>

                {/* Per-Year Table */}
                <div className="px-10 flex-1 overflow-auto">
                  <div className="w-full flex flex-col border border-white/10 rounded-sm overflow-hidden bg-black/40">
                    <div className="grid grid-cols-4 bg-white/5 py-2 px-4 border-b border-white/10">
                      <span className="text-[10px] font-bold text-white/30 uppercase">Yr</span>
                      <span className="text-[10px] font-bold text-white/30 uppercase">Cap Hit</span>
                      <span className="text-[10px] font-bold text-white/30 uppercase">Team Total</span>
                      <span className="text-[10px] font-bold text-white/30 uppercase">Cap Room</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {yearsTable.map((row, i) => (
                        <div key={row.year} className="grid grid-cols-4 py-3 px-4 items-center">
                          <span className="text-xs font-bold text-white/70">{i + 1}</span>
                          <span className="text-xs font-bold text-white">{formatSalaryM(row.salary)}</span>
                          <span className="text-xs font-medium text-white/60">{formatSalaryM(teamPayroll + row.salary)}</span>
                          <span className={`text-xs font-extrabold ${row.capRoom < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {row.capRoom < 0 ? '-' : ''}{formatSalaryM(Math.abs(row.capRoom))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Actions Bar ─────────────────────────────────────────── */}
            <div className="mt-auto p-6 md:p-10 flex items-center justify-end gap-4 bg-gradient-to-t from-black to-transparent">
              <button
                onClick={onClose}
                className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white font-bold uppercase text-xs tracking-widest transition-all border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => onSign({ salary, years, option })}
                className="px-8 py-3 bg-[#e21d37] hover:bg-red-500 text-white font-black uppercase text-xs tracking-widest italic transition-all shadow-lg hover:shadow-red-500/20"
              >
                Submit Offer
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SigningModal;
