import React from 'react';

export const TradeFinderHeader: React.FC<{
  tradePartnerCount: number;
  mobilePanel: 'assets' | 'offers';
  setMobilePanel: React.Dispatch<React.SetStateAction<'assets' | 'offers'>>;
  basketCount: number;
  offerCount: number;
}> = ({ tradePartnerCount, mobilePanel, setMobilePanel, basketCount, offerCount }) => (
  <div className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight">Trade Finder</h2>
        <p className="text-slate-500 text-[11px] font-medium mt-0.5 hidden sm:block">
          Select assets → scan all {tradePartnerCount} other teams for matching return packages
        </p>
      </div>
      <div className="flex lg:hidden gap-1 bg-slate-800 rounded-lg p-1">
        <button
          onClick={() => setMobilePanel('assets')}
          className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${
            mobilePanel === 'assets' ? 'bg-indigo-600 text-white' : 'text-slate-400'
          }`}
        >
          Assets{basketCount > 0 ? ` (${basketCount})` : ''}
        </button>
        <button
          onClick={() => setMobilePanel('offers')}
          className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${
            mobilePanel === 'offers' ? 'bg-indigo-600 text-white' : 'text-slate-400'
          }`}
        >
          Offers{offerCount > 0 ? ` (${offerCount})` : ''}
        </button>
      </div>
    </div>
  </div>
);
