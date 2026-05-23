/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Asset, OwnedAsset } from './realsternTypes';
import { INITIAL_ASSETS, US_STATES } from './realsternData';
import { NotificationToast, PurchaseModal } from './realSternCards';
import {
  fetchExternalAssets as loadExternalAssets,
  estimateSqm,
  SortOption,
} from './realSternShared';
import {
  InventoryView,
  RealSternFooter,
  RealSternHeader,
  RealSternMain,
  StoreView,
} from './realSternViews';
import { useGame } from '../../../store/GameContext';
import { RealSternActionModal } from '../../modals/RealSternActionModal';
import { useRosterComplianceGate } from '../../../hooks/useRosterComplianceGate';
import { useDraftEventGate } from '../../../hooks/useDraftEventGate';
import type { Contact } from '../../../types';

export default function RealStern() {
  const { state, dispatchAction } = useGame();
  const rosterGate = useRosterComplianceGate();
  const draftGate = useDraftEventGate();
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
    const loadAssets = async () => {
      setLoading(true);
      try {
        const data = await loadExternalAssets();
        if (data) {
          setAssets(data);
        }
      } catch (error) {
        console.error('Failed to fetch external assets', error);
      } finally {
        setLoading(false);
      }
    };

    loadAssets();
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
    setActionModalAsset(null);
    rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner gifted "${asset.title}" (valued at $${asset.price.toLocaleString()}) to ${recipientName} as a personal gesture.`,
        isSpecificEvent: true,
      },
    } as any)));
    showNotification(`${asset.title} gifted to ${recipientName}. They will remember this.`);
  };

  const inviteToAsset = async (contacts: Contact[], asset: OwnedAsset, reason?: string) => {
    if (!contacts.length) return;
    const guestName = contacts.map(c => c.name).join(', ');
    setActionModalAsset(null);
    const reasonNote = reason?.trim() ? ` — ${reason.trim()}` : ' for an exclusive private meeting';
    rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
      type: 'ADVANCE_DAY',
      payload: {
        outcomeText: `Commissioner hosted ${guestName} at ${asset.title}${reasonNote}.`,
        isSpecificEvent: true,
      },
    } as any)));
    showNotification(`Invitation sent to ${guestName} for ${asset.title}.`);
  };

  const abandonAsset = (instanceId: string) => {
    const asset = inventory.find(a => a.instanceId === instanceId);
    if (asset) {
      setInventory(prev => prev.filter(a => a.instanceId !== instanceId));
      showNotification(`${asset.title} has been abandoned.`);
      setActionModalAsset(null);
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
      <RealSternHeader
        view={view}
        inventoryCount={inventory.length}
        personalWealth={state.stats.personalWealth}
        onViewChange={setView}
      />

      <RealSternMain
        view={view}
        storeView={
          <StoreView
            loading={loading}
            sortBy={sortBy}
            filterState={filterState}
            filterCity={filterCity}
            availableStates={availableStates}
            cities={cities}
            filteredAssetsCount={filteredAssets.length}
            affordableCount={affordableCount}
            visibleAssets={visibleAssets}
            visibleCount={visibleCount}
            totalFilteredAssets={filteredAssets.length}
            wealth={wealth}
            inventory={inventory}
            observerTarget={observerTarget}
            onSortChange={setBy}
            onStateChange={(value) => {
              setFilterState(value);
              setFilterCity('all');
            }}
            onCityChange={setFilterCity}
            onAssetSelect={setSelectedAssetForPurchase}
          />
        }
        inventoryView={
          <InventoryView
            inventory={inventory}
            lifetimeEarnings={lifetimeEarnings}
            onBrowseAcquisitions={() => setView('store')}
            onAssetClick={setActionModalAsset}
          />
        }
      />

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

      <NotificationToast notification={notification} />
      <RealSternFooter />
      {rosterGate.modal}
      {draftGate.modal}
    </div>
  );
}
