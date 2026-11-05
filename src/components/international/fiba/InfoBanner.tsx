interface InfoBannerProps {
  items?: Array<{ label: string; value: string }>;
}

export default function InfoBanner({ items = [
    { label: 'Date', value: '31 Aug - 15 Sept 2019' },
    { label: 'Host', value: "People's Republic of China" },
    { label: 'Winner', value: 'Spain' },
    { label: 'MVP', value: 'Ricky Rubio (ESP)' },
  ] }: InfoBannerProps) {

  return (
    <div className="bg-[#212835] border-b border-[#1b2330]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-wrap md:flex-nowrap md:space-x-12">
          {items.map((item, index) => (
            <div key={index} className={`flex flex-col w-1/2 md:w-auto mb-4 md:mb-0 ${index !== 0 ? 'md:border-l md:border-[#2d3544] md:pl-12' : ''}`}>
              <span className="text-[10px] md:text-[11px] font-bold text-[#8d939e] uppercase tracking-wider mb-1">{item.label}</span>
              <span className="text-sm md:text-[15px] font-bold text-white tracking-tight">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
