interface SubNavTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs?: string[];
}

export default function SubNavTabs({ activeTab, onTabChange, tabs }: SubNavTabsProps) {
  const defaultTabs = ['Standings', 'Bracket', 'Class. Games', 'Class. Games 17-32', 'Second Round', 'First Round'];
  const displayTabs = tabs || defaultTabs;

  return (
    <div className="bg-[#111720] overflow-x-auto no-scrollbar border-b border-[#1b2330]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <nav className="flex space-x-2 md:space-x-3 min-w-max">
          {displayTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`py-2 px-4 rounded-[4px] text-[13px] md:text-[14px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[#5bf5a3] text-black'
                    : 'bg-[#2b3341] text-white hover:bg-[#343e4f]'
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
