/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag,
  Briefcase,
  Wallet,
  DollarSign,
  MapPin,
  Bed,
  Bath,
  Building,
  Info,
  Loader2,
  TrendingUp,
  TrendingDown,
  Layers,
  Globe,
  Coins
} from 'lucide-react';
import { Asset, OwnedAsset } from './realsternTypes';
import { INITIAL_ASSETS, US_STATES } from './realsternData';
import { useGame } from '../../../store/GameContext';
import { RealSternActionModal } from '../../modals/RealSternActionModal';

const IMAGE_FALLBACK = 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800';

const parseRooms = (s?: string): number => {
  if (!s) return 0;
  const n = parseInt(s);
  return isNaN(n) ? 0 : n;
};

const estimateSqm = (beds?: string, baths?: string): number => {
  const b = parseRooms(beds);
  const ba = parseRooms(baths);
  const sqft = 1200 + (b * 400) + (ba * 150);
  return Math.round(sqft * 0.0929); // convert sqft → sqm
};

const fakeDaysListed = (id: string) => {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 180) + 3;
};

type SortOption = 'premium' | 'popular' | 'recent' | 'price-asc' | 'price-desc' | 'area-asc' | 'area-desc' | 'price-m2-asc' | 'price-m2-desc';

export default function RealStern() {
  const { state, dispatchAction } = useGame();
  const wealth = state.stats.personalWealth * 1_000_000;

  const inventory = (state.realEstateInventory ?? []) as OwnedAsset[];
  const setInventory = (updater: OwnedAsset[] | ((prev: OwnedAsset[]) => OwnedAsset[])) => {
    const next = typeof updater === 'function' ? updater(inventory) : updater;
    dispatchAction({ type: 'REAL_ESTATE_INVENTORY_UPDATE', payload: { inventory: next } });
  };

  const [view, setView] = useState<'store' | 'inventory'>('store');
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedAssetForPurchase, setSelectedAssetForPurchase] = useState<Asset | null>(null);
  const [lifetimeEarnings, setLifetimeEarnings] = useState(0);
  
  // Asset action modal (replaces inline gift/invite/abandon buttons)
  const [actionModalAsset, setActionModalAsset] = useState<OwnedAsset | null>(null);

  // Pagination / Lazy Loading
  const [visibleCount, setVisibleCount] = useState(12);
  const observerTarget = useRef(null);

  // Filters and Sorting
  const [sortBy, setBy] = useState<SortOption>('premium');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');

  // Reset visible count when filters or sorting change
  useEffect(() => {
    setVisibleCount(12);
  }, [filterState, filterCity, sortBy]);

  // Fetch external data
  useEffect(() => {
    const fetchExternalAssets = async () => {
      setLoading(true);
      try {
        const response = await fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/realestatedata');
        if (response.ok) {
          const text = await response.text();
          try {
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
              const formatted = data.map((item: any) => {
                const locParts = item.location ? item.location.split(',').map((s: string) => s.trim()) : [];
                const city = locParts[0] || 'Unknown';
                const state = locParts[1] || 'Unknown';
                
                return {
                  id: item.id || Math.random().toString(36).substr(2, 9),
                  title: item.title,
                  price: parseInt(item.price) || 1000000,
                  location: item.location || 'Unknown',
                  city,
                  state,
                  image: item.image,
                  category: 'Real Estate',
                  details: {
                    beds: item.beds,
                    baths: item.baths,
                    office: item.office
                  }
                };
              });

              // Filter out broken images
              const withValidImages = formatted.filter(asset => 
                asset.image && asset.image.startsWith('https://img.jamesedition.com')
              );

              // Remove duplicates based on title and price
              const uniqueMap = new Map();
              withValidImages.forEach(asset => {
                const key = `${asset.title}-${asset.price}`;
                if (!uniqueMap.has(key)) {
                  uniqueMap.set(key, asset);
                }
              });
              
              setAssets(Array.from(uniqueMap.values()));
            }
          } catch (e) {
            console.error("Failed to parse external data as JSON", e);
          }
        }
      } catch (error) {
        console.error("Failed to fetch external assets", error);
      } finally {
        setLoading(false);
      }
    };

    fetchExternalAssets();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const confirmPurchase = () => {
    if (!selectedAssetForPurchase) return;
    const asset = selectedAssetForPurchase;
    
    if (wealth >= asset.price) {
      dispatchAction({ type: 'STORE_PURCHASE', payload: { amountMillion: asset.price / 1_000_000 } });
      const newOwned: OwnedAsset = {
        ...asset,
        purchasedAt: new Date().toISOString(),
        instanceId: Math.random().toString(36).substr(2, 9)
      };
      setInventory(prev => [newOwned, ...prev]);
      showNotification(`Acquired: ${asset.title}`);
      setSelectedAssetForPurchase(null);
    } else {
      showNotification("Insufficient funds for this acquisition.");
    }
  };

  const sellAsset = (instanceId: string) => {
    const asset = inventory.find(a => a.instanceId === instanceId);
    if (asset) {
      const sellPrice = Math.floor(asset.price * 0.8); // 80% resale value
      const passiveLoss = Math.floor(asset.price * 0.004);
      dispatchAction({ type: 'STORE_PURCHASE', payload: { amountMillion: -(sellPrice / 1_000_000) } });
      setLifetimeEarnings(prev => prev + sellPrice);
      setInventory(prev => prev.filter(a => a.instanceId !== instanceId));
      showNotification(
        `Sold ${asset.title} for $${sellPrice.toLocaleString()} — passive income reduced by $${passiveLoss.toLocaleString()}/mo`
      );
    }
  };

  const giftAsset = async (contacts: Contact[], asset: OwnedAsset) => {
    if (!contacts.length) return;
    const recipientName = contacts.map(c => c.name).join(', ');
    setInventory(prev => prev.filter(a => a.instanceId !== asset.instanceId));
    setGiftModalAsset(null);
    await dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner gifted "${asset.title}" (valued at $${asset.price.toLocaleString()}) to ${recipientName} as a personal gesture.`,
        isSpecificEvent: true,
      },
    } as any);
    showNotification(`${asset.title} gifted to ${recipientName}. They will remember this.`);
  };

  const inviteToAsset = async (contacts: Contact[], asset: OwnedAsset, reason?: string) => {
    if (!contacts.length) return;
    const guestName = contacts.map(c => c.name).join(', ');
    setInviteModalAsset(null);
    const reasonNote = reason?.trim() ? ` — ${reason.trim()}` : ' for an exclusive private meeting';
    await dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner hosted ${guestName} at ${asset.title}${reasonNote}.`,
        isSpecificEvent: true,
      },
    } as any);
    showNotification(`Invitation sent to ${guestName} for ${asset.title}.`);
  };

  const abandonAsset = (instanceId: string) => {
    const asset = inventory.find(a => a.instanceId === instanceId);
    if (asset) {
      setInventory(prev => prev.filter(a => a.instanceId !== instanceId));
      showNotification(`${asset.title} has been abandoned.`);
      setAbandonConfirm(null);
    }
  };

  // Derived Data
  const filteredAssets = useMemo(() => {
    let result = [...assets];
    
    if (filterState !== 'all') {
      result = result.filter(a => a.state === filterState);
    }
    
    if (filterCity !== 'all') {
      result = result.filter(a => a.city === filterCity);
    }
    
    // Sort logic
    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'recent':
        result.sort((a, b) => b.id.localeCompare(a.id));
        break;
      case 'popular':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'area-asc':
        result.sort((a, b) => {
          const areaA = estimateSqm(a.details?.beds, a.details?.baths);
          const areaB = estimateSqm(b.details?.beds, b.details?.baths);
          return areaA - areaB;
        });
        break;
      case 'area-desc':
        result.sort((a, b) => {
          const areaA = estimateSqm(a.details?.beds, a.details?.baths);
          const areaB = estimateSqm(b.details?.beds, b.details?.baths);
          return areaB - areaA;
        });
        break;
      case 'price-m2-asc':
        result.sort((a, b) => {
          const sqmA = Math.max(1, estimateSqm(a.details?.beds, a.details?.baths));
          const sqmB = Math.max(1, estimateSqm(b.details?.beds, b.details?.baths));
          return (a.price / sqmA) - (b.price / sqmB);
        });
        break;
      case 'price-m2-desc':
        result.sort((a, b) => {
          const sqmA = Math.max(1, estimateSqm(a.details?.beds, a.details?.baths));
          const sqmB = Math.max(1, estimateSqm(b.details?.beds, b.details?.baths));
          return (b.price / sqmB) - (a.price / sqmA);
        });
        break;
      default:
        break;
    }
    
    return result;
  }, [assets, filterState, filterCity, sortBy]);

  // Intersection Observer for Lazy Loading
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting) {
      setVisibleCount(prev => prev + 12);
    }
  }, []);

  useEffect(() => {
    if (visibleCount >= filteredAssets.length) return;
    const observer = new IntersectionObserver(handleObserver, { 
      threshold: 0.1,
      rootMargin: '100px' // Start loading before reaching the very bottom
    });
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [handleObserver, visibleCount, filteredAssets.length]);

  const availableStates = useMemo(() => {
    const presentStates = new Set(assets.map(a => a.state).filter(Boolean));
    return US_STATES.filter(s => presentStates.has(s)).sort();
  }, [assets]);

  const cities = useMemo(() => {
    if (filterState === 'all') return [];
    const filteredByState = assets.filter(a => a.state === filterState);
    const c = new Set(filteredByState.map(a => a.city).filter(Boolean));
    return Array.from(c).sort() as string[];
  }, [assets, filterState]);

  const visibleAssets = filteredAssets.slice(0, visibleCount);
  const affordableCount = filteredAssets.filter(a => a.price <= wealth).length;

  return (
    <div className="prestige-scope min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-prestige-black text-white px-3 sm:px-6 py-2 sm:py-4 shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="w-7 h-7 sm:w-12 sm:h-12 bg-prestige-gold rounded-full flex items-center justify-center shadow-inner flex-shrink-0">
              <Building className="text-prestige-black" size={14} />
            </div>
            <div className="min-w-0">
              <h1 className="serif text-base sm:text-3xl font-light tracking-widest uppercase truncate">Real Stern</h1>
              <p className="hidden sm:block text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.3em] text-prestige-gold font-semibold">Private Acquisitions · Commissioner's Office</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-8 flex-shrink-0">
            <div className="flex flex-col items-end sm:items-start">
              <span className="hidden sm:block text-[10px] uppercase tracking-widest text-gray-400">Liquidity</span>
              <div className="flex items-center gap-1 sm:gap-1.5 text-prestige-gold">
                <Wallet size={12} className="sm:w-[18px] sm:h-[18px]" />
                <span className="text-xs sm:text-2xl font-light tracking-tighter serif">${wealth.toLocaleString()}</span>
              </div>
            </div>

            <nav className="flex bg-white/5 rounded-full p-0.5 sm:p-1 border border-white/10">
              <button
                onClick={() => setView('store')}
                className={`px-2 sm:px-6 py-1 sm:py-2 rounded-full text-[9px] sm:text-xs uppercase tracking-widest transition-all ${view === 'store' ? 'bg-prestige-gold text-prestige-black font-bold' : 'text-gray-400 hover:text-white'}`}
              >
                <span className="hidden sm:inline">Acquisitions</span>
                <span className="sm:hidden">Buy</span>
              </button>
              <button
                onClick={() => setView('inventory')}
                className={`px-2 sm:px-6 py-1 sm:py-2 rounded-full text-[9px] sm:text-xs uppercase tracking-widest transition-all ${view === 'inventory' ? 'bg-prestige-gold text-prestige-black font-bold' : 'text-gray-400 hover:text-white'}`}
              >
                Portfolio ({inventory.length})
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 sm:p-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === 'store' ? (
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
                    {filteredAssets.length} properties available · {affordableCount} within your budget
                  </p>
                  <div className="h-px bg-prestige-black/10 w-full mb-4"></div>
                  <p className="text-sm text-gray-500 uppercase tracking-widest">Curated for the highest level of influence</p>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Sort By</label>
                    <select 
                      value={sortBy} 
                      onChange={(e) => setBy(e.target.value as any)}
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
                          onChange={(e) => {
                            setFilterState(e.target.value);
                            setFilterCity('all');
                          }}
                          className="bg-white border border-prestige-black/10 rounded-lg px-4 py-2 text-xs uppercase tracking-widest outline-none focus:border-prestige-gold"
                        >
                          <option value="all">All States</option>
                          {availableStates.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      {filterState !== 'all' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">City</label>
                          <select 
                            value={filterCity} 
                            onChange={(e) => setFilterCity(e.target.value)}
                            className="bg-white border border-prestige-black/10 rounded-lg px-4 py-2 text-xs uppercase tracking-widest outline-none focus:border-prestige-gold"
                          >
                            <option value="all">All Cities</option>
                            {cities.map(c => <option key={c} value={c}>{c}</option>)}
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
                        onAction={() => setSelectedAssetForPurchase(asset)}
                        actionLabel="Acquire Asset"
                        canAfford={wealth >= asset.price}
                        isOwned={inventory.some(i => i.id === asset.id)}
                      />
                    ))}
                    {/* Lazy Loading Trigger */}
                    {visibleCount < filteredAssets.length ? (
                      <div ref={observerTarget} className="col-span-full h-20 flex items-center justify-center">
                        <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-widest">
                          <Loader2 className="animate-spin" size={16} />
                          Loading more assets...
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-full h-20" />
                    )}
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 sm:space-y-12"
            >
              <div className="mb-8">
                <h2 className="serif text-3xl sm:text-5xl font-light mb-2">Your Portfolio</h2>
                <div className="h-px bg-prestige-black/10 w-full mb-4"></div>
                <p className="text-sm text-gray-500 uppercase tracking-widest">Managing {inventory.length} high-value assets</p>
              </div>

              {inventory.length > 0 && (
                <PortfolioSummaryHeader 
                  inventory={inventory} 
                  lifetimeEarnings={lifetimeEarnings} 
                />
              )}

              {inventory.length === 0 ? (
                <div className="text-center py-32 border border-dashed border-prestige-black/20 rounded-3xl">
                  <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="serif text-2xl text-gray-400 italic">No holdings on record. Begin acquiring assets to build your real estate empire.</p>
                  <button 
                    onClick={() => setView('store')}
                    className="mt-6 text-prestige-gold uppercase tracking-widest text-xs font-bold hover:underline"
                  >
                    Browse Acquisitions
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                  {inventory.map((asset) => (
                    <InventoryCard
                      key={asset.instanceId}
                      asset={asset}
                      onClick={() => setActionModalAsset(asset)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {selectedAssetForPurchase && (
          <PurchaseModal
            asset={selectedAssetForPurchase}
            wealth={wealth}
            onConfirm={confirmPurchase}
            onClose={() => setSelectedAssetForPurchase(null)}
          />
        )}

        {actionModalAsset && (
          <RealSternActionModal
            asset={actionModalAsset}
            onClose={() => setActionModalAsset(null)}
            onSell={(instanceId) => { sellAsset(instanceId); setActionModalAsset(null); }}
            onAbandon={(instanceId) => { abandonAsset(instanceId); setActionModalAsset(null); }}
            onGiftComplete={() => {
              setInventory(prev => prev.filter(a => a.instanceId !== actionModalAsset?.instanceId));
              setActionModalAsset(null);
            }}
            onInviteComplete={() => setActionModalAsset(null)}
          />
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-prestige-black text-white px-8 py-4 rounded-full shadow-2xl border border-prestige-gold/30 z-[100] flex items-center gap-3"
          >
            <Info size={18} className="text-prestige-gold" />
            <span className="text-xs uppercase tracking-widest font-medium">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="p-6 sm:p-12 border-t border-prestige-black/5 text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-gray-400">
          Real Stern Private Holdings · Commissioner's Office Division · Est. 2026 · All Acquisitions Confidential
        </p>
      </footer>
    </div>
  );
}

function PortfolioSummaryHeader({ inventory, lifetimeEarnings }: { inventory: OwnedAsset[], lifetimeEarnings: number }) {
  const totalInvested  = inventory.reduce((s, a) => s + a.price, 0);
  const resaleValue    = Math.floor(totalInvested * 0.80);
  const unrealizedPnL  = resaleValue - totalInvested;
  const totalSqm       = inventory.reduce((s, a) => s + estimateSqm(a.details?.beds, a.details?.baths), 0);
  const statesCovered  = new Set(inventory.map(a => a.state).filter(Boolean)).size;
  const monthlyPassive = inventory.reduce((s, a) => s + Math.floor(a.price * 0.004), 0);

  const stats = [
    { label: 'Total Invested', value: `$${totalInvested.toLocaleString()}`, color: 'text-prestige-gold', icon: <Wallet size={14} /> },
    { label: 'Est. Resale (80%)', value: `$${resaleValue.toLocaleString()}`, color: 'text-white', icon: <TrendingUp size={14} /> },
    { label: 'Paper Loss', value: `$${unrealizedPnL.toLocaleString()}`, color: 'text-red-400', icon: <TrendingDown size={14} /> },
    { label: 'Total Est. Sqm', value: `${totalSqm.toLocaleString()} sqm`, color: 'text-white', icon: <Layers size={14} /> },
    { label: 'States Covered', value: statesCovered, color: 'text-white', icon: <Globe size={14} /> },
    { label: 'Monthly Passive', value: `+$${monthlyPassive.toLocaleString()}`, color: 'text-green-400', icon: <Coins size={14} /> },
  ];

  if (lifetimeEarnings > 0) {
    stats.push({ label: 'Lifetime Sold', value: `$${lifetimeEarnings.toLocaleString()}`, color: 'text-amber-400', icon: <DollarSign size={14} /> });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
      {stats.map((stat, i) => (
        <div key={i} className="flex-shrink-0 bg-prestige-black border border-prestige-gold/20 rounded-2xl p-4 min-w-[180px] shadow-lg">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-400 mb-2">
            {stat.icon}
            {stat.label}
          </div>
          <div className={`serif text-xl font-light ${stat.color}`}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

function PurchaseModal({ asset, wealth, onConfirm, onClose }: { asset: Asset, wealth: number, onConfirm: () => void, onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const canAfford = wealth >= asset.price;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-prestige-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-white rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full flex flex-col sm:flex-row max-h-[90vh] overflow-y-auto"
      >
        <div className="w-full sm:w-1/2 h-48 sm:h-auto flex-shrink-0">
          <img
            src={asset.image || IMAGE_FALLBACK}
            alt={asset.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="p-6 sm:p-8 w-full sm:w-1/2 flex flex-col">
          <div className="mb-4 sm:mb-6">
            <div className="text-[10px] uppercase tracking-widest text-prestige-gold font-bold mb-1">{asset.category}</div>
            <h3 className="serif text-2xl sm:text-3xl font-medium mb-2">{asset.title}</h3>
            <div className="flex flex-col gap-1 mb-3 sm:mb-4">
              <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-widest">
                <MapPin size={10} />
                {asset.location}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">
                Listed {fakeDaysListed(asset.id)} days ago
              </div>
            </div>
            <div className="serif text-3xl sm:text-4xl font-light text-prestige-black mb-3 sm:mb-4">
              ${asset.price.toLocaleString()}
            </div>

            {(asset.details?.beds || asset.details?.baths) && (
              <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest mb-3">
                <Building size={12} />
                ~{estimateSqm(asset.details.beds, asset.details.baths).toLocaleString()} sqm (est.)
              </div>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-3">
            {/* Confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-prestige-gold cursor-pointer flex-shrink-0"
              />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-relaxed">
                I confirm I want to acquire this property for{' '}
                <span className="font-bold text-prestige-black">${asset.price.toLocaleString()}</span>
                {' '}from my personal funds.
              </span>
            </label>

            <button
              onClick={onConfirm}
              disabled={!canAfford || !confirmed}
              className={`w-full py-4 rounded-xl text-[10px] uppercase tracking-[0.3em] font-bold transition-all flex items-center justify-center gap-2 ${
                canAfford && confirmed
                  ? 'bg-prestige-black text-white hover:bg-prestige-gold hover:text-prestige-black'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <DollarSign size={14} />
              {!canAfford ? 'Insufficient Funds' : !confirmed ? 'Check Box to Confirm' : 'Confirm Acquisition'}
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-[10px] uppercase tracking-widest text-gray-400 font-bold hover:text-prestige-black transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-prestige-black/5 p-6 space-y-4 animate-pulse">
      <div className="h-64 bg-gray-100 rounded-2xl"></div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-100 rounded w-1/4"></div>
        <div className="h-8 bg-gray-100 rounded w-3/4"></div>
        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
      </div>
      <div className="h-12 bg-gray-100 rounded-xl"></div>
    </div>
  );
}

interface AssetCardProps {
  asset: Asset;
  onAction: () => void;
  actionLabel: string;
  canAfford: boolean;
  isOwned: boolean;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, onAction, actionLabel, canAfford, isOwned }) => {
  const sqm = estimateSqm(asset.details?.beds, asset.details?.baths);
  const pricePerSqm = sqm > 0 ? Math.round(asset.price / sqm) : null;

  return (
    <div className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 flex flex-col border border-prestige-black/5">
      <div className="relative h-64 overflow-hidden">
        <img 
          src={asset.image || IMAGE_FALLBACK} 
          alt={asset.title} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold text-prestige-black">
          {asset.category}
        </div>
        
        {isOwned && (
          <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold shadow-lg">
            ✓ OWNED
          </div>
        )}

        <div className="absolute bottom-4 left-4 bg-prestige-black/60 backdrop-blur px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest font-medium text-white">
          Listed {fakeDaysListed(asset.id)} days ago
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-prestige-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-6">
          <p className="text-white text-xs italic serif">{asset.description || "A premier asset for the discerning commissioner."}</p>
        </div>
      </div>
      
      <div className="p-6 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="serif text-2xl font-medium mb-1">{asset.title}</h3>
            <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-widest">
              <MapPin size={10} />
              {asset.location}
            </div>
          </div>
          <div className="text-right">
            <div className="serif text-xl font-light text-prestige-gold">${asset.price.toLocaleString()}</div>
            {pricePerSqm && (
              <div className="text-[10px] text-prestige-gold uppercase tracking-widest font-bold mt-1">
                ${pricePerSqm.toLocaleString()} / sqm
              </div>
            )}
          </div>
        </div>

        {(asset.details?.beds || asset.details?.baths) && (
          <div className="flex flex-col gap-2 mb-6 pt-4 border-t border-prestige-black/5">
            <div className="flex gap-4">
              {asset.details?.beds && (
                <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest">
                  <Bed size={12} /> {asset.details.beds}
                </div>
              )}
              {asset.details?.baths && (
                <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest">
                  <Bath size={12} /> {asset.details.baths}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest">
              <Building size={12} />
              ~{sqm.toLocaleString()} sqm (est.)
            </div>
          </div>
        )}

        <button 
          onClick={onAction}
          disabled={!canAfford}
          className={`mt-auto w-full py-4 rounded-xl text-[10px] uppercase tracking-[0.3em] font-bold transition-all flex items-center justify-center gap-2 ${
            canAfford 
              ? 'bg-prestige-black text-white hover:bg-prestige-gold hover:text-prestige-black' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {canAfford ? <ShoppingBag size={14} /> : <Info size={14} />}
          {canAfford ? actionLabel : "Insufficient Funds"}
        </button>
      </div>
    </div>
  );
}

interface InventoryCardProps {
  asset: OwnedAsset;
  onClick: () => void;
}

const InventoryCard: React.FC<InventoryCardProps> = ({ asset, onClick }) => {
  const sqm = estimateSqm(asset.details?.beds, asset.details?.baths);
  const monthlyIncome = Math.floor(asset.price * 0.004);
  const daysOwned = Math.floor(
    (Date.now() - new Date(asset.purchasedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-3xl overflow-hidden shadow-xl border border-prestige-black/5 flex flex-col sm:flex-row cursor-pointer hover:shadow-2xl transition-all duration-300"
    >
      <div className="w-full sm:w-2/5 h-48 sm:h-auto overflow-hidden relative">
        <img
          src={asset.image || IMAGE_FALLBACK}
          alt={asset.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <div className="absolute top-3 right-3 bg-prestige-gold text-prestige-black px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold shadow-lg">
          Owned {daysOwned}d
        </div>
      </div>

      <div className="p-5 sm:p-7 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <div className="text-[10px] uppercase tracking-widest text-prestige-gold font-bold mb-1">{asset.category}</div>
            <h3 className="serif text-xl sm:text-2xl font-medium mb-1 line-clamp-2">{asset.title}</h3>
            <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-widest mb-1">
              <MapPin size={10} />
              <span className="truncate">{asset.location}</span>
            </div>
            <div className="text-[10px] text-green-600 font-bold uppercase tracking-widest mb-2">
              ~${monthlyIncome.toLocaleString()} / mo passive
            </div>
            {(asset.details?.beds || asset.details?.baths) && (
              <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest">
                <Building size={12} />
                ~{sqm.toLocaleString()} sqm (est.)
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Acquired</div>
            <div className="serif text-lg sm:text-2xl font-light text-prestige-black">${asset.price.toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-prestige-black/5">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center font-bold group-hover:text-prestige-gold transition-colors">
            Tap to manage this property →
          </p>
        </div>
      </div>
    </div>
  );
}

