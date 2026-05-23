import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Briefcase, Building, Wallet } from 'lucide-react';
import type { Asset, OwnedAsset } from './realsternTypes';
import type { SortOption } from './realSternShared';
import { formatWealth } from './realSternShared';
import {
  AssetCard,
  InventoryCard,
  LoadingTrigger,
  PortfolioSummaryHeader,
  SkeletonCard,
} from './realSternCards';

export function RealSternHeader({
  view,
  inventoryCount,
  personalWealth,
  onViewChange,
}: {
  view: 'store' | 'inventory';
  inventoryCount: number;
  personalWealth: number;
  onViewChange: (view: 'store' | 'inventory') => void;
}) {
  return (
    <header className="bg-prestige-black text-white px-3 sm:px-6 py-2 sm:py-4 shadow-2xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-row items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="w-7 h-7 sm:w-12 sm:h-12 bg-prestige-gold rounded-full flex items-center justify-center shadow-inner flex-shrink-0">
            <Building className="text-prestige-black" size={14} />
          </div>
          <div className="min-w-0">
            <h1 className="serif text-base sm:text-3xl font-light tracking-widest uppercase truncate">Real Stern</h1>
            <p className="hidden sm:block text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.3em] text-prestige-gold font-semibold">
              Private Acquisitions · Commissioner's Office
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-8 flex-shrink-0">
          <div className="flex flex-col items-end sm:items-start">
            <span className="hidden sm:block text-[10px] uppercase tracking-widest text-gray-400">Liquidity</span>
            <div className="flex items-center gap-1 sm:gap-1.5 text-prestige-gold">
              <Wallet size={12} className="sm:w-[18px] sm:h-[18px]" />
              <span className="text-xs sm:text-2xl font-light tracking-tighter serif">
                {formatWealth(personalWealth)}
              </span>
            </div>
          </div>

          <nav className="flex bg-white/5 rounded-full p-0.5 sm:p-1 border border-white/10">
            <button
              onClick={() => onViewChange('store')}
              className={`px-2 sm:px-6 py-1 sm:py-2 rounded-full text-[9px] sm:text-xs uppercase tracking-widest transition-all ${view === 'store' ? 'bg-prestige-gold text-prestige-black font-bold' : 'text-gray-400 hover:text-white'}`}
            >
              <span className="hidden sm:inline">Acquisitions</span>
              <span className="sm:hidden">Buy</span>
            </button>
            <button
              onClick={() => onViewChange('inventory')}
              className={`px-2 sm:px-6 py-1 sm:py-2 rounded-full text-[9px] sm:text-xs uppercase tracking-widest transition-all ${view === 'inventory' ? 'bg-prestige-gold text-prestige-black font-bold' : 'text-gray-400 hover:text-white'}`}
            >
              Portfolio ({inventoryCount})
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}

export function StoreView({
  loading,
  sortBy,
  filterState,
  filterCity,
  availableStates,
  cities,
  filteredAssetsCount,
  affordableCount,
  visibleAssets,
  visibleCount,
  totalFilteredAssets,
  wealth,
  inventory,
  observerTarget,
  onSortChange,
  onStateChange,
  onCityChange,
  onAssetSelect,
}: {
  loading: boolean;
  sortBy: SortOption;
  filterState: string;
  filterCity: string;
  availableStates: string[];
  cities: string[];
  filteredAssetsCount: number;
  affordableCount: number;
  visibleAssets: Asset[];
  visibleCount: number;
  totalFilteredAssets: number;
  wealth: number;
  inventory: OwnedAsset[];
  observerTarget: React.RefObject<HTMLDivElement | null>;
  onSortChange: (value: SortOption) => void;
  onStateChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onAssetSelect: (asset: Asset) => void;
}) {
  return (
    <motion.div
      key="store"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4 sm:space-y-8"
    >
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 sm:gap-6">
        <div>
          <h2 className="serif text-3xl sm:text-5xl font-light mb-1">Available Assets</h2>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-4">
            {filteredAssetsCount} properties available · {affordableCount} within your budget
          </p>
          <div className="h-px bg-prestige-black/10 w-full mb-4" />
          <p className="text-sm text-gray-500 uppercase tracking-widest">Curated for the highest level of influence</p>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="bg-white border border-prestige-black/10 rounded-lg px-4 py-2 text-xs uppercase tracking-widest outline-none focus:border-prestige-gold"
            >
              <option value="premium">Premium</option>
              <option value="popular">Most Expensive</option>
              <option value="recent">Recent</option>
              <option value="price-asc">Price lowest first</option>
              <option value="price-desc">Price highest first</option>
              <option value="area-asc">Smallest est. sqm</option>
              <option value="area-desc">Biggest est. sqm</option>
              <option value="price-m2-asc">Price per sqm (low → high)</option>
              <option value="price-m2-desc">Price per sqm (high → low)</option>
            </select>
          </div>

          {!loading && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">State</label>
                <select
                  value={filterState}
                  onChange={(e) => onStateChange(e.target.value)}
                  className="bg-white border border-prestige-black/10 rounded-lg px-4 py-2 text-xs uppercase tracking-widest outline-none focus:border-prestige-gold"
                >
                  <option value="all">All States</option>
                  {availableStates.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {filterState !== 'all' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">City</label>
                  <select
                    value={filterCity}
                    onChange={(e) => onCityChange(e.target.value)}
                    className="bg-white border border-prestige-black/10 rounded-lg px-4 py-2 text-xs uppercase tracking-widest outline-none focus:border-prestige-gold"
                  >
                    <option value="all">All Cities</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
        {loading ? (
          Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {visibleAssets.map((asset, index) => (
              <AssetCard
                key={`${asset.id}-${asset.title.slice(0, 8)}-${index}`}
                asset={asset}
                onAction={() => onAssetSelect(asset)}
                actionLabel="Acquire Asset"
                canAfford={wealth >= asset.price}
                isOwned={inventory.some((i) => i.id === asset.id)}
              />
            ))}
            {visibleCount < totalFilteredAssets ? (
              <div ref={observerTarget} className="col-span-full h-20 flex items-center justify-center">
                <LoadingTrigger />
              </div>
            ) : (
              <div className="col-span-full h-20" />
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

export function InventoryView({
  inventory,
  lifetimeEarnings,
  onBrowseAcquisitions,
  onAssetClick,
}: {
  inventory: OwnedAsset[];
  lifetimeEarnings: number;
  onBrowseAcquisitions: () => void;
  onAssetClick: (asset: OwnedAsset) => void;
}) {
  return (
    <motion.div
      key="inventory"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 sm:space-y-12"
    >
      <div className="mb-8">
        <h2 className="serif text-3xl sm:text-5xl font-light mb-2">Your Portfolio</h2>
        <div className="h-px bg-prestige-black/10 w-full mb-4" />
        <p className="text-sm text-gray-500 uppercase tracking-widest">Managing {inventory.length} high-value assets</p>
      </div>

      {inventory.length > 0 && <PortfolioSummaryHeader inventory={inventory} lifetimeEarnings={lifetimeEarnings} />}

      {inventory.length === 0 ? (
        <div className="text-center py-32 border border-dashed border-prestige-black/20 rounded-3xl">
          <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="serif text-2xl text-gray-400 italic">
            No holdings on record. Begin acquiring assets to build your real estate empire.
          </p>
          <button
            onClick={onBrowseAcquisitions}
            className="mt-6 text-prestige-gold uppercase tracking-widest text-xs font-bold hover:underline"
          >
            Browse Acquisitions
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          {inventory.map((asset) => (
            <InventoryCard key={asset.instanceId} asset={asset} onClick={() => onAssetClick(asset)} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function RealSternMain({
  view,
  storeView,
  inventoryView,
}: {
  view: 'store' | 'inventory';
  storeView: React.ReactNode;
  inventoryView: React.ReactNode;
}) {
  return (
    <main className="flex-grow p-4 sm:p-8 max-w-7xl mx-auto w-full">
      <AnimatePresence mode="wait">{view === 'store' ? storeView : inventoryView}</AnimatePresence>
    </main>
  );
}

export function RealSternFooter() {
  return (
    <footer className="p-6 sm:p-12 border-t border-prestige-black/5 text-center">
      <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400">
        Real Stern Private Holdings · Commissioner's Office Division · Est. 2026 · All Acquisitions Confidential
      </p>
    </footer>
  );
}
