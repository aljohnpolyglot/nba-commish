import React from 'react';
import { Search, Utensils, MapPin, Check } from 'lucide-react';
import { Restaurant } from './types';

interface LocationStepProps {
  restaurants: Restaurant[];
  restaurantSearch: string;
  setRestaurantSearch: (search: string) => void;
  selectedRestaurant: Restaurant | null;
  setSelectedRestaurant: (restaurant: Restaurant) => void;
  loadingRestaurants: boolean;
  guestCount: number;
}

export const LocationStep: React.FC<LocationStepProps> = ({
  restaurants,
  restaurantSearch,
  setRestaurantSearch,
  selectedRestaurant,
  setSelectedRestaurant,
  loadingRestaurants,
  guestCount
}) => {
  const filteredRestaurants = restaurants.filter(r => 
    r.name.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
    r.city.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
    r.genre.toLowerCase().includes(restaurantSearch.toLowerCase())
  ).slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl flex items-start gap-3">
        <Utensils className="text-indigo-400 shrink-0 mt-0.5" size={18} />
        <p className="text-sm text-indigo-200 leading-relaxed">
          Select a venue for your private dinner with <strong>{guestCount} guests</strong>.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
        <input
          type="text"
          value={restaurantSearch}
          onChange={(e) => setRestaurantSearch(e.target.value)}
          placeholder="Search restaurants by name, city, or cuisine..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
        />
      </div>

      {loadingRestaurants ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold uppercase tracking-widest">Loading Venues...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRestaurants.map((restaurant, idx) => {
            const isSelected = selectedRestaurant?.name === restaurant.name;
            return (
              <button
                key={`${restaurant.name}-${idx}`}
                onClick={() => setSelectedRestaurant(restaurant)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-200 ${
                  isSelected 
                    ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10' 
                    : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <MapPin size={18} />
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>{restaurant.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{restaurant.city}, {restaurant.state} • {restaurant.genre}</p>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                    <Check size={14} className="text-white" />
                  </div>
                )}
              </button>
            );
          })}
          {filteredRestaurants.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No venues found matching your search.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
