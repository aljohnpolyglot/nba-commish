import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TeamInfo } from '../lib/wheelDraft';
import { getTeamBranding, TeamLogo } from '../lib/nbaBranding';
import { ChevronRight } from 'lucide-react';

interface WheelLandingModalProps {
  isOpen: boolean;
  team: TeamInfo | null;
  undraftedCount: number;
  onConfirm: () => void;
}

export function WheelLandingModal({ isOpen, team, undraftedCount, onConfirm }: WheelLandingModalProps) {
  if (!team) return null;

  const branding = getTeamBranding(team.abbrev);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-slate-900 border-2 rounded-3xl max-w-md w-full text-center shadow-2xl overflow-hidden p-6"
            style={{
              borderColor: branding.primaryColor || '#f59e0b',
              boxShadow: `0 0 50px ${branding.primaryColor}66`,
            }}
          >
            <span
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border mb-4 inline-block"
              style={{
                backgroundColor: `${branding.primaryColor}33`,
                borderColor: branding.primaryColor,
                color: branding.secondaryColor && branding.secondaryColor !== '#000000' ? branding.secondaryColor : '#f59e0b',
              }}
            >
              YOU LANDED ON
            </span>

            {/* Large Team Logo */}
            <div
              className="p-4 rounded-2xl border shadow-inner my-3 flex items-center justify-center"
              style={{
                backgroundColor: `${branding.primaryColor}22`,
                borderColor: `${branding.primaryColor}66`,
              }}
            >
              <TeamLogo abbrev={team.abbrev} sizeClass="w-24 h-24" />
            </div>

            <div className="text-3xl font-black text-white uppercase italic tracking-tight mb-1">
              {team.name}
            </div>

            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
              {team.conference} Conference • {undraftedCount} Available Players
            </div>

            <button
              onClick={onConfirm}
              className="w-full py-4 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm cursor-pointer"
              style={{
                backgroundColor: branding.primaryColor || '#f59e0b',
                boxShadow: `0 4px 20px ${branding.primaryColor}88`,
              }}
            >
              SELECT PLAYER <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
