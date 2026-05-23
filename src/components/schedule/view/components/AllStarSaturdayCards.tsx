import { Crown, Play, Trophy } from 'lucide-react';

interface AllStarSaturdayCardsProps {
  allStar: any;
  isActuallyToday: boolean;
  onNavigateToAllStar: () => void;
  onViewContestDetails: (type: 'dunk' | 'three') => void;
  onWatchDunkContest: () => void;
  onWatchThreePoint: () => void;
  throneEnabled: boolean;
}

export function AllStarSaturdayCards({
  allStar,
  isActuallyToday,
  onNavigateToAllStar,
  onViewContestDetails,
  onWatchDunkContest,
  onWatchThreePoint,
  throneEnabled,
}: AllStarSaturdayCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {allStar?.dunkContest?.complete ? (
        <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/40 border border-orange-500/30 rounded-2xl p-6">
          <div className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em] mb-3">Slam Dunk Champion · Final</div>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">🏆</div>
            <div className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
              {allStar.dunkContest.winnerName}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onViewContestDetails('dunk')}
              className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Trophy size={12} />
              View Results
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/40 border border-orange-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl">🏀</div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Slam Dunk Contest</h3>
              <p className="text-orange-400 text-xs font-bold uppercase tracking-widest">Saturday Night</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onViewContestDetails('dunk')}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
            >
              Details
            </button>
            {isActuallyToday && (
              <button
                onClick={onWatchDunkContest}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Play size={12} fill="currentColor" />
                Watch Live
              </button>
            )}
          </div>
        </div>
      )}

      {allStar?.threePointContest?.complete ? (
        <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/40 border border-indigo-500/30 rounded-2xl p-6">
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-3">3-Point Champion · Final</div>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl">🎯</div>
            <div className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
              {allStar.threePointContest.winnerName}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onViewContestDetails('three')}
              className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Trophy size={12} />
              View Results
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/40 border border-indigo-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl">🎯</div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">3-Point Contest</h3>
              <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Saturday Night</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onViewContestDetails('three')}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
            >
              Details
            </button>
            {isActuallyToday && (
              <button
                onClick={onWatchThreePoint}
                className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Play size={12} fill="currentColor" />
                Watch Live
              </button>
            )}
          </div>
        </div>
      )}

      {throneEnabled && (
        allStar?.throne?.complete ? (
          <div className="bg-gradient-to-br from-yellow-900/40 to-amber-900/40 border border-yellow-500/30 rounded-2xl p-6 md:col-span-2">
            <div className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em] mb-3">King of 1v1 · Final</div>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Crown size={22} className="text-yellow-400" />
              </div>
              <div className="text-2xl font-black text-white uppercase tracking-tight leading-tight">
                {allStar.throne.champion?.playerName ?? 'TBD'}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onNavigateToAllStar}
                className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Trophy size={12} />
                View Bracket
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-yellow-900/40 to-amber-900/40 border border-yellow-500/20 rounded-2xl p-6 md:col-span-2">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Crown size={22} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">The Throne</h3>
                <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest">
                  {allStar?.throneAnnounced
                    ? 'Field of 16 · Single-Elimination · Saturday Night'
                    : 'Awaiting Field Reveal'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onNavigateToAllStar}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs transition-all"
              >
                Open Throne
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

