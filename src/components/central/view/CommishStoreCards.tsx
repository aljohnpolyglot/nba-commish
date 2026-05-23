import React from 'react';
import { Trophy } from 'lucide-react';
import { Category, Product } from './commishStoreassets';

export function ProductSkeleton() {
  return (
    <div className="bg-white p-4 rounded-xl shadow-md border border-transparent">
      <div className="h-48 mb-4 rounded-lg skeleton-shimmer" />
      <div className="h-3 w-1/2 mb-2 rounded skeleton-shimmer" />
      <div className="h-4 w-full mb-1 rounded skeleton-shimmer" />
      <div className="h-4 w-3/4 mb-4 rounded skeleton-shimmer" />
      <div className="h-6 w-1/3 rounded skeleton-shimmer" />
    </div>
  );
}

export function ProductCard({ product, onClick, className = 'w-full' }: { product: Product; onClick: () => void; className?: string }) {
  return (
    <div className={`flex-shrink-0 ${className} bg-white p-4 rounded-xl shadow-md hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border border-transparent hover:border-nba-blue group relative`} onClick={onClick}>
      {product.isStatic && <div className="absolute top-2 right-2 bg-nba-dark text-white text-[8px] font-black px-2 py-1 rounded-full z-10 flex items-center gap-1 shadow-lg"><Trophy size={8} /> OFFICIAL</div>}
      <div className="h-48 mb-4 overflow-hidden rounded-lg bg-gray-50 flex items-center justify-center">
        <img src={product.image} alt={product.title} className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
      </div>
      {product.brand && <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{product.brand}</div>}
      {product.category && <div className="text-[10px] font-bold text-nba-blue uppercase tracking-widest mb-1">{product.category}</div>}
      <h3 className="text-xs font-bold line-clamp-2 leading-snug mb-2 min-h-[2.5rem]">{product.title}</h3>
      <div className="mt-auto text-lg font-black text-nba-red">{product.price}</div>
    </div>
  );
}

export function CategoryCard({ item, onClick }: { item: Category; onClick: () => void }) {
  return (
    <div className="flex-shrink-0 w-40 md:w-48 cursor-pointer group" onClick={onClick}>
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-200 shadow-lg">
        <img src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 group-hover:brightness-110 transition-all duration-500" referrerPolicy="no-referrer" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <h3 className="absolute bottom-4 left-0 right-0 px-2 text-center text-white font-black uppercase text-sm md:text-lg leading-tight tracking-tight">{item.title}</h3>
      </div>
    </div>
  );
}
