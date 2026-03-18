import React from 'react';
import { motion } from 'motion/react';
import { X, Users, Star } from 'lucide-react';

export const AllStarGamePreviewModal: React.FC<{
  game: any;
  onClose: () => void;
  onViewRosters: () => void;
  onWatch: () => void;
}> = ({ game, onClose, onViewRosters, onWatch }) => {
  const isRisingStars = game.isRisingStars;
  const isAllStar = game.isAllStar;
  const isCelebrity = game.isCelebrityGame;
  const title = isRisingStars ? 'Rising Stars Game' : isAllStar ? 'All-Star Game' : isCelebrity ? 'Celebrity Game' : 'All-Star Event';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-[#111] border border-white/10 rounded-[40px] p-12 max-w-2xl w-full shadow-2xl"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-4xl font-black text-white uppercase tracking-tighter">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={32} />
          </button>
        </div>
        
        <p className="text-slate-400 text-lg mb-10 leading-relaxed">
          The {title} is ready to begin. You can watch the game live or view the team rosters to see who will be starting.
        </p>
        
        <div className="flex gap-4">
          {!game.played && (
            <button 
              onClick={onWatch}
              className="flex-1 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              <Star size={20} />
              Watch Live
            </button>
          )}
          <button 
            onClick={onViewRosters}
            className="flex-1 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <Users size={20} />
            View Rosters
          </button>
        </div>
      </motion.div>
    </div>
  );
};
