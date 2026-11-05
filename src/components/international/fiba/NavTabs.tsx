interface NavTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs?: string[];
}

export default function NavTabs({ activeTab, onTabChange, tabs = ['Standings', 'Leaders', 'Games', 'Stats', 'Teams', 'Players'] }: NavTabsProps) {
  return (
    <div className="bg-[#1b2330] overflow-x-auto no-scrollbar border-b border-[#111720]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-6 md:space-x-8 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`py-4 px-1 border-b-[3px] text-sm md:text-[15px] font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-[#5bf5a3] text-[#5bf5a3]'
                    : 'border-transparent text-gray-300 hover:text-white hover:border-gray-500'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
