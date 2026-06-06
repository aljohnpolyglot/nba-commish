import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ShoppingCart, Trophy, X } from 'lucide-react';
import { Product } from './commishStoreassets';

export function CommishStorePurchaseModal({
  selectedItem,
  setSelectedItem,
  purchaseQuantity,
  setPurchaseQuantity,
  personalWealth,
  priceInMillions,
  buyItem,
}: {
  selectedItem: Product | null;
  setSelectedItem: React.Dispatch<React.SetStateAction<Product | null>>;
  purchaseQuantity: number;
  setPurchaseQuantity: React.Dispatch<React.SetStateAction<number>>;
  personalWealth: number;
  priceInMillions: (item: Product, qty: number) => number;
  buyItem: () => void;
}) {
  return (
    <AnimatePresence>
      {selectedItem && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]" onClick={() => setSelectedItem(null)} />
          <motion.div initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }} animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }} exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }} className="fixed top-1/2 left-1/2 bg-white rounded-3xl overflow-hidden w-[95%] max-w-2xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-2rem)] overflow-y-auto z-[101] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] flex flex-col md:flex-row">
            <div className="w-full md:w-1/2 bg-gray-50 p-6 md:p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-100 relative min-h-[160px] md:min-h-0">
              {selectedItem.isStatic && <div className="absolute top-4 left-4 bg-nba-dark text-white text-[10px] font-black px-3 py-1.5 rounded-full z-10 flex items-center gap-1.5 shadow-xl"><Trophy size={10} /> OFFICIAL</div>}
              <img src={selectedItem.image} alt={selectedItem.title} className="max-w-full max-h-[180px] md:max-h-[400px] object-contain drop-shadow-2xl" referrerPolicy="no-referrer" />
            </div>

            <div className="w-full md:w-1/2 p-8 flex flex-col">
              <button className="self-end text-gray-400 hover:text-gray-600 transition-colors mb-4" onClick={() => setSelectedItem(null)}><X size={24} /></button>
              <div className="flex-grow">
                <div className="text-nba-blue font-black text-xs uppercase tracking-widest mb-2">AUTHENTIC GEAR</div>
                <h2 className="text-2xl font-black text-gray-900 leading-tight mb-4">{selectedItem.title}</h2>
                <div className="text-4xl font-black text-nba-red mb-4">{selectedItem.price}</div>

                <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Select Quantity</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setPurchaseQuantity(Math.max(1, purchaseQuantity - 1))} className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-nba-blue hover:text-nba-blue transition-all font-bold text-xl">-</button>
                      <span className="text-2xl font-black w-8 text-center">{purchaseQuantity}</span>
                      <button onClick={() => setPurchaseQuantity(Math.min(10, purchaseQuantity + 1))} className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-nba-blue hover:text-nba-blue transition-all font-bold text-xl">+</button>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Price</div>
                      <div className="text-xl font-black text-nba-blue">${(parseFloat(selectedItem.price.replace(/[^0-9.]/g, '')) * purchaseQuantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  {selectedItem.isStatic && <div className="flex items-center gap-2 text-sm text-gray-500"><Trophy size={16} className="text-nba-dark" /><span>Official NBA Licensed Product</span></div>}
                  <div className="flex items-center gap-2 text-sm text-gray-500"><ShoppingCart size={16} className="text-nba-blue" /><span>Global Shipping Available</span></div>
                </div>
              </div>

              {priceInMillions(selectedItem, purchaseQuantity) > personalWealth && <p className="text-red-500 text-xs font-bold text-center mb-3 uppercase tracking-widest">Insufficient personal funds</p>}
              <button className={`w-full text-white font-black py-4 rounded-2xl text-lg shadow-xl active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 ${priceInMillions(selectedItem, purchaseQuantity) > personalWealth ? 'bg-gray-400 cursor-not-allowed' : 'bg-nba-dark hover:bg-black'}`} onClick={buyItem} disabled={priceInMillions(selectedItem, purchaseQuantity) > personalWealth}>BUY NOW</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
