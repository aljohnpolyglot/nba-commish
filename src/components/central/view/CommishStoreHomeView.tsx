import React from 'react';
import { Category, CATEGORIES, PLAYERS, Product } from './commishStoreassets';
import { CategoryCard, ProductCard } from './CommishStoreCards';
import { getTeamLogo } from '../../../utils/helpers';

export function CommishStoreHomeView({
  isFictional,
  topPicks,
  onProductSelect,
  onSearch,
  westTeams,
  eastTeams,
}: {
  isFictional: boolean;
  topPicks: Product[];
  onProductSelect: (product: Product) => void;
  onSearch: (params: { query?: string; productType?: string; teamFilter?: string; forceMasterOnly?: boolean }) => void;
  westTeams: Array<{ id: number; name: string; logoUrl?: string }>;
  eastTeams: Array<{ id: number; name: string; logoUrl?: string }>;
}) {
  const openCategory = (category: Category) => onSearch({ productType: category.title, teamFilter: '', forceMasterOnly: true });
  const openPlayer = (query: string) => onSearch({ query });
  const openTeam = (teamName: string) =>
    isFictional ? onSearch({ query: `${teamName} basketball` }) : onSearch({ query: teamName, teamFilter: teamName, forceMasterOnly: true });

  return (
    <div className="space-y-12">
      {isFictional ? (
        <div className="relative h-64 md:h-96 rounded-2xl overflow-hidden shadow-2xl cursor-pointer group bg-gradient-to-br from-nba-dark via-gray-900 to-nba-blue" onClick={() => onSearch({ query: 'basketball jersey' })}>
          <div className="absolute inset-0 flex flex-col items-end justify-end p-8">
            <div className="text-white">
              <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter">CHAMPIONSHIP GEAR</h2>
              <p className="text-lg opacity-90">Browse official basketball merchandise</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative h-64 md:h-96 rounded-2xl overflow-hidden shadow-2xl cursor-pointer group" onClick={() => onSearch({ query: 'Golden State Warriors' })}>
          <img src="https://nbastore.com.ph/cdn/shop/files/GSW-FH_web_banner_1944x.png" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Hero Banner" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-8">
            <div className="text-white">
              <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter">CHAMPIONSHIP GEAR</h2>
              <p className="text-lg opacity-90">Procure the latest Warriors collection</p>
            </div>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">Top Picks</h2>
        <div className="flex overflow-x-auto gap-6 pb-6 custom-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {topPicks.map((product, idx) => <ProductCard key={idx} product={product} onClick={() => onProductSelect(product)} className="w-72" />)}
        </div>
      </section>

      <section>
        <h2 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">Categories</h2>
        <div className="flex overflow-x-auto gap-6 pb-6 custom-scrollbar pl-4 md:pl-0">
          {CATEGORIES.map((category, idx) => <CategoryCard key={idx} item={category} onClick={() => openCategory(category)} />)}
        </div>
      </section>

      {!isFictional && (
        <section>
          <h2 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">Player Collections</h2>
          <div className="flex overflow-x-auto gap-6 pb-6 custom-scrollbar pl-4 md:pl-0">
            {PLAYERS.map((player, idx) => <CategoryCard key={idx} item={player} onClick={() => openPlayer(player.query)} />)}
          </div>
        </section>
      )}

      <section className="space-y-12 mb-12">
        <h2 className="text-3xl font-black uppercase text-center mb-12 tracking-tight">Shop By Team</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative">
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-200 -translate-x-1/2" />
          <CommishConferenceGrid title="Western Conference" titleClass="text-nba-blue border-nba-blue" teams={westTeams} onTeamClick={openTeam} />
          <CommishConferenceGrid title="Eastern Conference" titleClass="text-nba-red border-nba-red" teams={eastTeams} onTeamClick={openTeam} />
        </div>
      </section>
    </div>
  );
}

function CommishConferenceGrid({
  title,
  titleClass,
  teams,
  onTeamClick,
}: {
  title: string;
  titleClass: string;
  teams: Array<{ id: number; name: string; logoUrl?: string }>;
  onTeamClick: (teamName: string) => void;
}) {
  return (
    <div className="space-y-6">
      <h3 className={`text-xl font-black ${titleClass} border-b-2 pb-2 uppercase italic`}>{title}</h3>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
        {teams.map(team => (
          <button key={team.id} onClick={() => onTeamClick(team.name)} className="flex flex-col items-center group">
            <div className="w-12 h-12 mb-2 group-hover:scale-110 transition-transform">
              <img src={team.logoUrl || getTeamLogo(team.id)} alt={team.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <span className="text-[10px] font-bold text-center leading-tight uppercase tracking-tighter">{team.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
