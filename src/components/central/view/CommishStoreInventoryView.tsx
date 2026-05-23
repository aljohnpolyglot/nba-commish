import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Product } from './commishStoreassets';

export function CommishStoreInventoryView({
  assets,
  onBack,
  onAssetSelect,
}: {
  assets: { product: Product; quantity: number; date: string }[];
  onBack: () => void;
  onAssetSelect: (asset: { product: Product; quantity: number; date: string }) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b-4 border-nba-blue pb-4">
        <h2 className="text-3xl font-black text-nba-dark tracking-tighter flex items-center gap-3 uppercase italic">
          <ShoppingCart className="text-nba-blue" /> ASSET INVENTORY
        </h2>
        <button onClick={onBack} className="text-nba-red font-black text-sm hover:underline tracking-widest uppercase">BACK TO STORE</button>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl shadow-inner border-2 border-dashed border-gray-200">
          <ShoppingCart size={64} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-xl font-bold text-gray-400 uppercase tracking-widest">No assets acquired yet.</h3>
          <button onClick={onBack} className="mt-6 bg-nba-blue text-white px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg">START SHOPPING</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assets.map((asset, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100 flex gap-4 hover:scale-[1.02] transition-all cursor-pointer group" onClick={() => onAssetSelect(asset)}>
              <div className="w-24 h-24 bg-gray-50 rounded-xl flex-shrink-0 flex items-center justify-center p-2">
                <img src={asset.product.image} alt={asset.product.title} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <div className="flex flex-col justify-between py-1 flex-grow">
                <div>
                  <h3 className="font-bold text-sm line-clamp-2 leading-tight mb-1 group-hover:text-nba-blue transition-colors">{asset.product.title}</h3>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Qty: {asset.quantity}</div>
                    <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{new Date(asset.date).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Value</div>
                  <div className="text-nba-blue font-black text-lg">
                    $
                    {(parseFloat(asset.product.price.replace(/[^0-9.]/g, '')) * asset.quantity).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
