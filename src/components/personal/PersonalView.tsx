import React, { useState } from 'react';
import { useGame } from '../../store/GameContext';
import { FileText, Download, DollarSign, ArrowRightLeft, User, TrendingUp, Calendar } from 'lucide-react';
import { Payslip } from '../../types';
import { formatCurrency as globalFormatCurrency } from '../../utils/helpers';

export const PersonalView: React.FC = () => {
  const { state, markPayslipsRead } = useGame();
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  React.useEffect(() => {
    if (state.hasUnreadPayslip) {
      markPayslipsRead();
    }
  }, [state.hasUnreadPayslip, markPayslipsRead]);

  const formatCurrency = (amount: number, isBaseMillions: boolean = true) => {
    return globalFormatCurrency(amount, isBaseMillions);
  };

  const totalEarnings = (state.payslips || []).reduce((acc, p) => acc + p.netPay, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 md:space-y-12 custom-scrollbar bg-slate-950 md:rounded-[2.5rem] border-x border-b md:border border-slate-800 shadow-2xl">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter leading-none">
              Personal <span className="text-emerald-500">Wealth</span>
            </h1>
            <p className="text-slate-500 font-medium mt-2 max-w-xl">
              Manage your private earnings, view detailed payslips, and monitor your financial legacy outside of the NBA's official books.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-3xl border border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Balance</p>
              <p className="text-2xl font-black text-white font-mono">{formatCurrency(state.stats?.personalWealth || 0)}</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Net Earnings</p>
              <p className="text-xl font-bold text-white font-mono">{formatCurrency(totalEarnings, false)}</p>
            </div>
          </div>
          <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last Payday</p>
              <p className="text-xl font-bold text-white font-mono">
                {state.payslips && state.payslips.length > 0 
                  ? new Date(state.payslips[state.payslips.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'N/A'}
              </p>
            </div>
          </div>
          <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
              <User size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Next Payday Date</p>
              <p className="text-xl font-bold text-white font-mono">
                {(() => {
                  const d = new Date(state.date);
                  if (d.getDate() < 15) {
                    d.setDate(15);
                  } else {
                    d.setMonth(d.getMonth() + 1);
                    d.setDate(1);
                  }
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Payslip History List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} />
                Earnings History
              </h3>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                {state.payslips.length} Statements
              </span>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {state.payslips && state.payslips.length > 0 ? (
                [...state.payslips].reverse().map((payslip) => (
                  <button
                    key={payslip.id}
                    onClick={() => setSelectedPayslip(payslip)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 group ${
                      selectedPayslip?.id === payslip.id
                        ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                        selectedPayslip?.id === payslip.id ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                      }`}>
                        {new Date(payslip.date).getDate() === 1 ? 'Monthly' : 'Mid-Month'}
                      </span>
                      <span className="text-xs font-mono text-slate-500">#{payslip.id.split('-')[1].slice(-4)}</span>
                    </div>
                    <div className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {new Date(payslip.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-sm font-mono text-slate-400 mt-1">{formatCurrency(payslip.netPay, false)}</div>
                  </button>
                ))
              ) : (
                <div className="text-center py-20 bg-slate-900/20 rounded-3xl border border-dashed border-slate-800">
                  <FileText size={40} className="mx-auto text-slate-700 mb-4 opacity-20" />
                  <p className="text-slate-500 font-medium">No earnings statements found.</p>
                </div>
              )}
            </div>
          </div>

          {/* Payslip Detail View */}
          <div className="lg:col-span-8">
            {selectedPayslip ? (
              <div className="bg-white rounded-[2.5rem] p-8 md:p-12 text-slate-900 shadow-2xl relative overflow-hidden min-h-[600px]">
                {/* Watermark */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none rotate-12">
                  <DollarSign size={600} />
                </div>

                <div className="relative z-10 flex flex-col h-full">
                  {/* Statement Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start border-b-4 border-slate-900 pb-8 mb-10 gap-6">
                    <div>
                      <h2 className="text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">
                        Earnings <br /> Statement
                      </h2>
                      <div className="flex items-center gap-2 mt-4">
                        <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center text-white font-bold text-xs">NBA</div>
                        <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">National Basketball Association</p>
                      </div>
                    </div>
                    <div className="text-right space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Statement Date</p>
                        <p className="font-mono text-lg font-bold">{new Date(selectedPayslip.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pay Period</p>
                        <p className="font-mono text-sm font-medium bg-slate-100 px-3 py-1 rounded-full inline-block">{selectedPayslip.payPeriod}</p>
                      </div>
                    </div>
                  </div>

                  {/* Employee Info */}
                  <div className="grid grid-cols-2 gap-12 mb-12">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Employee Information</p>
                      <p className="font-black text-2xl text-slate-900">{state.commissionerName}</p>
                      {state.gameMode === 'gm' ? (() => {
                        const userTeam = state.userTeamId != null ? state.teams.find(t => t.id === state.userTeamId) : null;
                        return (
                          <>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">General Manager{userTeam ? ` • ${userTeam.name}` : ''}</p>
                            <p className="text-xs text-slate-400 mt-1">{userTeam ? `${userTeam.region ?? ''} ${userTeam.name}`.trim() + ' Front Office' : 'Team Front Office'}</p>
                          </>
                        );
                      })() : (
                        <>
                          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">NBA Commissioner • Office of the Commissioner</p>
                          <p className="text-xs text-slate-400 mt-1">Olympic Tower, 645 5th Ave, New York, NY 10022</p>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Service Details</p>
                      <div className="space-y-1">
                        <div className="flex justify-end gap-4">
                          <span className="text-xs font-bold text-slate-500">Days in Period:</span>
                          <span className="text-xs font-mono font-bold">{selectedPayslip.daysPaid}</span>
                        </div>
                        <div className="flex justify-end gap-4">
                          <span className="text-xs font-bold text-slate-500">Tax Jurisdiction:</span>
                          <span className="text-xs font-bold">NY / NYC</span>
                        </div>
                        <div className="flex justify-end gap-4">
                          <span className="text-xs font-bold text-slate-500">Filing Status:</span>
                          <span className="text-xs font-bold">Single</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financial Breakdown Table */}
                  <div className="flex-1">
                    <div className="bg-slate-50 rounded-3xl border-2 border-slate-200 overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest">Description</th>
                            <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest">Earnings</th>
                            <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest">Deductions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="py-5 px-6">
                              <p className="font-bold text-slate-900">Base Salary Disbursement</p>
                              <p className="text-[10px] text-slate-500 font-medium">Contractual executive compensation</p>
                            </td>
                            <td className="py-5 px-6 text-right font-mono font-bold text-emerald-600">
                              {formatCurrency(selectedPayslip.grossPay, false)}
                            </td>
                            <td className="py-5 px-6 text-right font-mono text-slate-300">—</td>
                          </tr>
                          <tr>
                            <td className="py-4 px-6">
                              <p className="text-sm font-bold text-slate-700">Federal Income Tax</p>
                              <p className="text-[10px] text-slate-400">IRS Statutory Rate (37.0%)</p>
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-slate-300">—</td>
                            <td className="py-4 px-6 text-right font-mono text-rose-600 font-bold">
                              ({formatCurrency(selectedPayslip.federalTax, false)})
                            </td>
                          </tr>
                          <tr>
                            <td className="py-4 px-6">
                              <p className="text-sm font-bold text-slate-700">NY State Income Tax</p>
                              <p className="text-[10px] text-slate-400">NYS Department of Finance (10.9%)</p>
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-slate-300">—</td>
                            <td className="py-4 px-6 text-right font-mono text-rose-600 font-bold">
                              ({formatCurrency(selectedPayslip.stateTax, false)})
                            </td>
                          </tr>
                          <tr>
                            <td className="py-4 px-6">
                              <p className="text-sm font-bold text-slate-700">NYC Resident Tax</p>
                              <p className="text-[10px] text-slate-400">Local Municipality Surcharge (3.876%)</p>
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-slate-300">—</td>
                            <td className="py-4 px-6 text-right font-mono text-rose-600 font-bold">
                              ({formatCurrency(selectedPayslip.cityTax, false)})
                            </td>
                          </tr>
                        </tbody>
                        <tfoot className="bg-emerald-50 border-t-4 border-slate-900">
                          <tr>
                            <td className="py-6 px-6">
                              <p className="text-xl font-black text-slate-900 uppercase tracking-tighter">Net Take-Home Pay</p>
                            </td>
                            <td colSpan={2} className="py-6 px-6 text-right">
                              <p className="text-3xl font-black text-emerald-600 font-mono">
                                {formatCurrency(selectedPayslip.netPay, false)}
                              </p>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="mt-10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {String.fromCharCode(64 + i)}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authorized by NBA Finance Committee</p>
                    </div>
                    <button className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:scale-105 active:scale-95 shadow-xl">
                      <Download size={16} />
                      Download Official PDF
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[600px] flex flex-col items-center justify-center text-slate-600 bg-slate-900/20 rounded-[2.5rem] border-2 border-dashed border-slate-800 p-12 text-center">
                <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-700 mb-6">
                  <FileText size={48} />
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Statement Viewer</h3>
                <p className="max-w-xs text-slate-500 font-medium">
                  Select an earnings statement from the history list to view a detailed breakdown of your compensation and tax withholdings.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
