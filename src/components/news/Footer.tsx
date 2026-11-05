import React from 'react';
import { Facebook, Instagram, Twitter, Youtube, Twitch } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { NewsBranding } from './branding';

export default function Footer({ branding }: { branding: NewsBranding }) {
  const { state } = useGame();
  const copyrightYear = state.leagueStats?.year ?? new Date(state.date).getFullYear();

  return (
    <footer className="text-white py-12" style={{ background: branding.secondary }}>
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-6">
            <a href="#" className="text-gray-400 hover:text-white transition-colors"><Facebook size={20} /></a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors"><Instagram size={20} /></a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors"><Twitter size={20} /></a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors"><Youtube size={20} /></a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors"><Twitch size={20} /></a>
          </div>

          <div className="text-gray-400 text-xs text-center md:text-right">
            <p>© {copyrightYear} {branding.legalName}. All rights reserved.</p>
            <div className="mt-2 space-x-4">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Use</a>
              <a href="#" className="hover:text-white">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
