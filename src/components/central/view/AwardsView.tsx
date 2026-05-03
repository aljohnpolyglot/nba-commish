import React from 'react';
import { Trophy, Star, Shield, TrendingUp, Award, Crown } from 'lucide-react';

interface AwardData {
  type: string;
  season: number;
}

interface AwardsViewProps {
  awards: AwardData[];
  teamColor?: string;
}

const getAwardIcon = (type: string) => {
  const lowerType = type.toLowerCase();

  if (lowerType.includes('the throne')) {
    return (
      <div className="relative">
        <Crown size={22} className="text-yellow-400 fill-yellow-400/30 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]" />
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></div>
      </div>
    );
  }

  if (lowerType.includes('mvp') || lowerType.includes('championship') || lowerType.includes('champion')) {
    return (
      <div className="relative">
        <Trophy size={22} className="text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
      </div>
    );
  }
  
  if (lowerType.includes('first team all-league')) {
    return <Star size={22} className="fill-yellow-500 text-yellow-500 drop-shadow-[0_0_5px_rgba(234,179,8,0.3)]" />;
  }
  
  if (lowerType.includes('second team all-league')) {
    return <Star size={22} className="fill-slate-300 text-slate-300" />;
  }
  
  if (lowerType.includes('third team all-league')) {
    return <Star size={22} className="fill-amber-700 text-amber-700" />;
  }
  
  if (lowerType.includes('all-star')) {
    if (lowerType.includes('mvp')) {
      return (
        <div className="relative">
          <Star size={22} className="text-yellow-400 fill-yellow-400/30" />
          <Trophy size={10} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-500" />
        </div>
      );
    }
    return <Star size={22} className="text-yellow-400" fill="none" />; // Transparent inside
  }
  
  if (lowerType.includes('defensive') || lowerType.includes('all-defensive')) {
    return (
      <div className="relative flex items-center justify-center">
        <Shield size={22} className="text-blue-500 fill-blue-500/10" />
        <span className="absolute text-[10px] font-black text-blue-400">D</span>
      </div>
    );
  }
  
  if (lowerType.includes('improved')) {
    return (
      <div className="bg-emerald-500/20 p-1 rounded-md">
        <TrendingUp size={18} className="text-emerald-400" />
      </div>
    );
  }
  
  return <Award size={20} className="text-indigo-400" />;
};

const formatSeason = (season: number) => {
  return `${season - 1}-${String(season).slice(2)}`;
};

export const AwardsView: React.FC<AwardsViewProps> = ({ awards, teamColor = '#6366f1' }) => {
  if (!awards || awards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 italic">
        <Trophy size={48} className="mb-4 opacity-20" />
        <p>No awards on file for this player.</p>
      </div>
    );
  }

  // Grouping for summary
  const summaryMap = awards.reduce((acc, award) => {
    if (!acc[award.type]) {
      acc[award.type] = [];
    }
    acc[award.type].push(award.season);
    return acc;
  }, {} as Record<string, number[]>);

  // Sort seasons for each award type
  Object.keys(summaryMap).forEach(type => {
    summaryMap[type].sort((a, b) => a - b);
  });

  // Sort award types by "importance" or frequency
  const sortedAwardTypes = Object.keys(summaryMap).sort((a, b) => {
    const importance = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes('championship') || t.includes('champion')) return 100;
      if (t.includes('mvp')) return 90;
      if (t.includes('defensive player')) return 80;
      if (t.includes('first team all-league')) return 70;
      if (t.includes('all-star')) return 60;
      return 10;
    };
    return importance(b) - importance(a);
  });

  return (
    <div className="flex flex-col gap-8 p-6 bg-[#080808] h-full overflow-y-auto custom-scrollbar">
      {/* Visual Trophy List */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Trophy Case
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...awards].sort((a, b) => b.season - a.season).map((award, i) => (
            <div 
              key={i} 
              className="group flex items-center gap-4 bg-white/[0.02] hover:bg-white/[0.05] p-3 rounded-xl border border-white/5 transition-all duration-300"
            >
              <div className="w-10 h-10 flex items-center justify-center bg-white/[0.03] rounded-full shrink-0 group-hover:scale-110 transition-transform">
                {getAwardIcon(award.type)}
              </div>
              <div className="min-w-0">
                <div className="text-white font-bold text-xs truncate uppercase tracking-tight">
                  {award.type}
                </div>
                <div className="text-slate-500 text-[10px] font-mono mt-0.5">
                  {formatSeason(award.season)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Summary List */}
      <section className="mt-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Career Summary
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent"></div>
        </div>

        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {sortedAwardTypes.map((type) => {
            const seasons = summaryMap[type];
            // Helper to group consecutive seasons
            const groupedSeasons = seasons.reduce((acc: string[], curr, i) => {
              const startYear = curr - 1;
              const endYearShort = String(curr).slice(2);
              const fullStr = `${startYear}-${endYearShort}`;

              if (i === 0) {
                acc.push(fullStr);
              } else {
                const prev = seasons[i - 1];
                if (curr === prev + 1) {
                  const last = acc[acc.length - 1];
                  // If it's already a range, update the end
                  if (last.includes('–')) {
                    acc[acc.length - 1] = last.split('–')[0] + '–' + endYearShort;
                  } else {
                    // Start a new range
                    acc[acc.length - 1] = last + '–' + endYearShort;
                  }
                } else {
                  acc.push(fullStr);
                }
              }
              return acc;
            }, []);

            return (
              <div key={type} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors px-2 rounded-lg">
                <div className="flex items-center gap-2 sm:w-64 shrink-0">
                  <div className="text-xs font-black text-white uppercase tracking-wider">
                    {type}
                  </div>
                  {seasons.length > 1 && (
                    <div className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 rounded border border-yellow-500/20">
                      {seasons.length}X
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {groupedSeasons.join(', ')}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
