import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bath,
  Bed,
  Building,
  Coins,
  DollarSign,
  Globe,
  Info,
  Layers,
  Loader2,
  MapPin,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { Asset, OwnedAsset } from './realsternTypes';
import {
  estimateSqm,
  fakeDaysListed,
  IMAGE_FALLBACK,
} from './realSternShared';

export function NotificationToast({ notification }: { notification: string | null }) {
  return (
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
  );
}

export function PortfolioSummaryHeader({
  inventory,
  lifetimeEarnings,
}: {
  inventory: OwnedAsset[];
  lifetimeEarnings: number;
}) {
  const totalInvested = inventory.reduce((s, a) => s + a.price, 0);
  const resaleValue = Math.floor(totalInvested * 0.8);
  const unrealizedPnL = resaleValue - totalInvested;
  const totalSqm = inventory.reduce((s, a) => s + estimateSqm(a.details?.beds, a.details?.baths), 0);
  const statesCovered = new Set(inventory.map((a) => a.state).filter(Boolean)).size;
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

export function PurchaseModal({
  asset,
  wealth,
  onConfirm,
  onClose,
}: {
  asset: Asset;
  wealth: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
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
        className="relative bg-white rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full flex flex-col sm:flex-row max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)] overflow-y-auto"
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
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-prestige-gold cursor-pointer flex-shrink-0"
              />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider leading-relaxed">
                I confirm I want to acquire this property for{' '}
                <span className="font-bold text-prestige-black">${asset.price.toLocaleString()}</span>{' '}
                from my personal funds.
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

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-prestige-black/5 p-6 space-y-4 animate-pulse">
      <div className="h-64 bg-gray-100 rounded-2xl" />
      <div className="space-y-2">
        <div className="h-4 bg-gray-100 rounded w-1/4" />
        <div className="h-8 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
      <div className="h-12 bg-gray-100 rounded-xl" />
    </div>
  );
}

export function AssetCard({
  asset,
  onAction,
  actionLabel,
  canAfford,
  isOwned,
}: {
  asset: Asset;
  onAction: () => void;
  actionLabel: string;
  canAfford: boolean;
  isOwned: boolean;
}) {
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
          <p className="text-white text-xs italic serif">
            {asset.description || 'A premier asset for the discerning commissioner.'}
          </p>
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
          {canAfford ? actionLabel : 'Insufficient Funds'}
        </button>
      </div>
    </div>
  );
}

export function InventoryCard({
  asset,
  onClick,
}: {
  asset: OwnedAsset;
  onClick: () => void;
}) {
  const sqm = estimateSqm(asset.details?.beds, asset.details?.baths);
  const monthlyIncome = Math.floor(asset.price * 0.004);
  const daysOwned = Math.floor((Date.now() - new Date(asset.purchasedAt).getTime()) / (1000 * 60 * 60 * 24));

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

export function LoadingTrigger() {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-widest">
      <Loader2 className="animate-spin" size={16} />
      Loading more assets...
    </div>
  );
}
