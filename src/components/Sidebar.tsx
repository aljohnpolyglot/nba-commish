import React, { useRef, useState } from 'react';
import { useGame } from '../store/GameContext';
import { LogOut, Save, Settings2 } from 'lucide-react';
import { Tab } from '../types';
import { NavigationMenu } from './sidebar/NavigationMenu';
import { ApprovalsWidget } from './sidebar/ApprovalsWidget';
import { FinancesWidget } from './sidebar/FinancesWidget';
import { SettingsModal } from './modals/SettingsModal';

const GAME_LOGO_URL = 'https://i.imgur.com/66dyyIO.png';

interface SidebarProps {
  currentView: Tab;
  onViewChange: (view: Tab) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, isOpen, onClose }) => {
  const { state } = useGame();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSave = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `nba-commish-save-${state.leagueStats.year}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const sidebarContent = (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-slate-300">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img
            src={GAME_LOGO_URL}
            alt="BasketCommissionerSim"
            className="w-9 h-9 object-contain rounded-lg"
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="text-sm font-black text-white tracking-tight leading-none">BasketCommissionerSim</h1>
            <p className="text-[8px] text-slate-500 mt-0.5 uppercase tracking-widest font-bold">
              {state.date} • Season {state.leagueStats.year}
            </p>
          </div>
        </div>
        {/* Close button for mobile */}
        <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
        <NavigationMenu currentView={currentView} onViewChange={onViewChange} onClose={onClose} />

        <div className="space-y-6">
          {state.gameMode !== 'gm' && <ApprovalsWidget />}
          <FinancesWidget onViewChange={onViewChange} />
        </div>
      </div>
      
      <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
              {state.commissionerName.split(' ').map(n => n[0]).join('').toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">{state.commissionerName}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Commissioner</span>
            </div>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
            title="Exit Game"
          >
            <LogOut size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-2 px-2 pt-2 border-t border-slate-800/50">
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            title="Save Game"
          >
            <Save size={14} />
            <span className="text-[11px]">Save</span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            title="League Settings"
          >
            <Settings2 size={14} />
            <span className="text-[11px]">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {sidebarContent}
      </div>
    </>
  );
};
