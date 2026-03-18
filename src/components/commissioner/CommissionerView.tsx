import React, { useState } from 'react';
import { CommissionerTab } from '../../types';
import { COMMISSIONER_TABS } from '../../constants';
import Dashboard from './Dashboard';
import ViewershipTab from './ViewershipTab';
import { Activity, Tv, DollarSign } from 'lucide-react';

export const CommissionerView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CommissionerTab>('Approvals');

  const renderTab = () => {
    switch (activeTab) {
      case 'Approvals':
        return <Dashboard initialTab="approvals" />;
      case 'Viewership':
        return <ViewershipTab />;
      case 'Finances':
        return <Dashboard initialTab="finances" />;
      default:
        return <Dashboard initialTab="approvals" />;
    }
  };

  const getIcon = (tab: CommissionerTab) => {
    switch (tab) {
      case 'Approvals': return Activity;
      case 'Viewership': return Tv;
      case 'Finances': return DollarSign;
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-2xl border border-slate-800 w-full md:w-fit overflow-x-auto custom-scrollbar shrink-0">
        {COMMISSIONER_TABS.map((tab) => {
          const Icon = getIcon(tab);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                activeTab === tab 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {Icon && <Icon size={16} />}
              {tab}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {renderTab()}
      </div>
    </div>
  );
};


