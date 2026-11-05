import { ChevronRight } from 'lucide-react';

interface HeaderProps {
  title?: string;
}

export default function Header({ title = 'FIBA Basketball World Cup 2019' }: HeaderProps) {
  return (
    <div className="relative bg-[#4a7258] text-white overflow-hidden border-b border-[#1b2330]">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://assets.fiba.basketball/image/upload/w_800/hub-simplified-background"
          alt="Background"
          className="w-full h-full object-cover mix-blend-overlay opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#446751]/90 via-[#446751]/80 to-transparent"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-center justify-between">
        <div className="flex-1 w-full flex items-center justify-between">
          <div className="max-w-2xl text-left">
            <h1 className="text-3xl md:text-4xl lg:text-[42px] font-black tracking-tight text-white mb-2" style={{ fontFamily: 'sans-serif' }}>
              {title}
            </h1>
          </div>
          
          <div className="flex-shrink-0 ml-8 hidden md:block">
            <img
              src="https://assets.fiba.basketball/image/upload/d_.asset_mainlogo--competition_9472.svg/f_svg/.asset_verticallogo--competition_9472?buster=20650"
              alt="Logo"
              className="h-24 md:h-32 object-contain drop-shadow-xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
