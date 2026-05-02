import React from 'react';
import { ScheduleDay, TrainingParadigm, Allocations } from '../types';
import { ChevronLeft, ChevronRight, Activity, Zap, Shield, Dumbbell, Coffee } from 'lucide-react';

interface Props {
  schedule: ScheduleDay[];
  dailyPlans: Record<number, { intensity: number; paradigm: TrainingParadigm; allocations: Allocations }>;
  onDayClick: (day: number) => void;
  currentDate: string;
  displayMonth: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

export function ScheduleView({ schedule, dailyPlans, onDayClick, currentDate, displayMonth, onPrevMonth, onNextMonth }: Props) {
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <div className="bg-black p-4 md:p-6 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-none">
            SEASON SCHEDULE
          </h2>
          <p className="text-[9px] md:text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1.5 hover:text-slate-300 transition-colors uppercase">
            Date: {currentDate}
          </p>
        </div>
        
        <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 p-1 md:p-1.5 rounded-xl md:rounded-2xl shadow-inner shadow-white/5 w-full md:w-auto justify-between md:justify-start">
          <button
            onClick={onPrevMonth}
            disabled={!onPrevMonth}
            className="p-1 md:p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous month"
          >
            <ChevronLeft size={16} className="md:w-3.5 md:h-3.5" />
          </button>
          <div className="px-3 md:px-4 text-[9px] md:text-[11px] font-black text-white uppercase tracking-[0.2em]">
            {displayMonth}
          </div>
          <button
            onClick={onNextMonth}
            disabled={!onNextMonth}
            className="p-1 md:p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next month"
          >
            <ChevronRight size={16} className="md:w-3.5 md:h-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar pb-2">
        <div className="grid grid-cols-7 gap-1 md:gap-4 min-w-[300px] md:min-w-0">
          {daysOfWeek.map(day => (
            <div key={day} className="text-center text-[7px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 md:mb-2 border-b border-slate-800 pb-1 md:pb-2">
              {day}
            </div>
          ))}

          {/*
            Calendar grid mirrors the real game schedule view: cells are
            anchored to actual weekdays (day.weekday) so Oct 1 lands in its real
            column. Leading blanks fill the gap before day 1 of the visible month.
          */}
          {(() => {
            const leadingBlanks = schedule[0]?.weekday ?? 0;
            return Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square bg-slate-900/20 rounded-lg md:rounded-xl border border-slate-800/30 opacity-40 shadow-inner" />
            ));
          })()}

          {schedule.map((day) => (
            <CalendarDay
              key={day.isoDate ?? day.day}
              day={day}
              plan={dailyPlans[day.day]}
              onClick={() => onDayClick(day.day)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
       <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${color}`}></div>
       <span className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

const CalendarDay: React.FC<{ 
  day: ScheduleDay; 
  plan?: { intensity: number; paradigm: TrainingParadigm };
  onClick: () => void 
}> = ({ day, plan, onClick }) => {

  const isB2B = day.isB2B;
  const isGameDay = day.activity === 'Game';

  const getParadigmLabel = (paradigmName: string) => {
    switch (paradigmName) {
      case 'Offensive': return 'Offense Day';
      case 'Defensive': return 'Defense Day';
      case 'Biometrics': return 'Bio Day';
      case 'Recovery': return 'Recovery Day';
      case 'Balanced': return 'Balanced Day';
      default: return paradigmName;
    }
  };

  const getParadigmDescription = (paradigmName: string) => {
    switch (paradigmName) {
      case 'Offensive': return 'Builds Offensive System Familiarity.';
      case 'Defensive': return 'Builds Defensive System Familiarity.';
      case 'Biometrics': return 'Prevents physical regression with age, stunts skill growth.';
      case 'Recovery': return 'Load management, walk-throughs and IQ film study.';
      case 'Balanced': return 'Linearly builds offense & defense familiarity.';
      default: return day.description;
    }
  };

  // No plan AND day.activity === 'Off Day' → no team training scheduled (offseason/FA/Sunday).
  // Render as "Off Day" instead of inventing a fake "Balanced Day".
  const isOffDay = !plan && day.activity === 'Off Day';
  // Default paradigm when no plan is present must match what DailyPlanModal opens
  // with — otherwise the cell label and the modal disagree (the famous "calendar
  // says OFFENSE DAY but modal opens Balanced" bug). Always default to 'Balanced'.
  const defaultParadigm = 'Balanced';
  const actualParadigm = isGameDay || isOffDay ? null : (plan ? plan.paradigm : defaultParadigm);
  const displayActivity = isGameDay ? 'Game' : (isOffDay ? 'Off Day' : getParadigmLabel(actualParadigm!));
  const displayDescription = isGameDay ? day.description : (isOffDay ? day.description : getParadigmDescription(actualParadigm!));

  let bgClass = "bg-slate-900 border-slate-800 hover:border-blue-500 hover:bg-slate-800 shadow-inner";
  let dotColor = "bg-slate-700";
  let labelColor = "text-slate-400";
  
  if (day.activity === 'Game') {
    bgClass = "bg-orange-950/40 border-orange-500/50 hover:border-orange-400 hover:bg-orange-900/50";
    dotColor = "bg-orange-500";
    labelColor = "text-orange-400";
  } else if (actualParadigm === 'Offensive') {
    bgClass = "bg-red-950/30 border-red-900/50 hover:border-red-500 hover:bg-red-900/40";
    dotColor = "bg-red-500";
    labelColor = "text-red-400";
  } else if (actualParadigm === 'Balanced') {
    bgClass = "bg-blue-950/30 border-blue-900/50 hover:border-blue-500 hover:bg-blue-900/40";
    dotColor = "bg-blue-500";
    labelColor = "text-blue-400";
  } else if (actualParadigm === 'Defensive') {
    bgClass = "bg-indigo-950/30 border-indigo-900/50 hover:border-indigo-500 hover:bg-indigo-900/40";
    dotColor = "bg-indigo-500";
    labelColor = "text-indigo-400";
  } else if (actualParadigm === 'Recovery') {
    bgClass = "bg-emerald-950/20 border-emerald-900/40 hover:border-emerald-500 hover:bg-emerald-900/30";
    dotColor = "bg-emerald-500";
    labelColor = "text-emerald-400";
  } else if (actualParadigm === 'Biometrics') {
    bgClass = "bg-purple-950/30 border-purple-900/50 hover:border-purple-500 hover:bg-purple-900/40";
    dotColor = "bg-purple-500";
    labelColor = "text-purple-400";
  } else if (day.activity === 'Shootaround') {
    bgClass = "bg-slate-800 border-slate-700 hover:border-yellow-500/50 hover:bg-slate-700 shadow-xl";
    dotColor = "bg-yellow-500";
    labelColor = "text-yellow-400";
  }

  if (day.activity === 'Off Day') {
     bgClass = "bg-slate-900 border-slate-800 hover:border-blue-500 hover:bg-slate-800 shadow-inner";
     dotColor = "bg-slate-700";
     labelColor = "text-slate-500";
  }

  return (
    <button
      onClick={isGameDay ? undefined : onClick}
      className={`group aspect-square rounded-lg md:rounded-2xl border ${bgClass} p-1 md:p-4 flex flex-col transition-all text-left outline-none ${isGameDay ? 'cursor-default' : 'cursor-pointer'} overflow-hidden`}
    >
      <div className="flex justify-between items-start">
        <span className="text-[8px] md:text-sm font-black font-mono text-white/40 leading-none">{day.day}</span>
        <div className={`w-1 h-1 md:w-2 md:h-2 rounded-full ${dotColor} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
      </div>

      <div className="mt-1 md:mt-4 flex-1 overflow-hidden">
        {/*
          Game days show opponent abbrev / logo / vs|@ home-away (per
          ScheduleView.tsx:54 design doc — calendar must display matchup so
          users can plan training around opponent type).
        */}
        {isGameDay && day.opponent ? (
          <div className="flex flex-col gap-0.5 md:gap-1 leading-none">
            <div className="flex items-center gap-1">
              {day.opponent.logoUrl && (
                <img
                  src={day.opponent.logoUrl}
                  alt=""
                  className="w-3 h-3 md:w-5 md:h-5 object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className={`text-[7px] md:text-xs font-black uppercase tracking-tighter ${labelColor}`}>
                {day.opponent.isHome ? 'vs' : '@'} {day.opponent.abbrev}
              </span>
            </div>
            <span className="text-[6px] md:text-[9px] text-orange-400/70 font-bold uppercase tracking-widest">
              Game Day
            </span>
          </div>
        ) : (
          <div className={`text-[7px] md:text-xs font-black uppercase tracking-tighter md:tracking-tight leading-[1.1] md:leading-none ${labelColor} line-clamp-2`}>
            {displayActivity}
          </div>
        )}
        
        {plan && (
          <div className="mt-auto pt-1 md:pt-2 space-y-1">
             <div className="flex items-center gap-1 md:gap-1.5">
                <div className="flex-1 h-0.5 bg-slate-800 rounded-full overflow-hidden hidden md:block">
                   <div className="h-full bg-blue-400/50" style={{ width: `${plan.intensity}%` }} />
                </div>
                <span className="text-[6px] md:text-[8px] font-mono text-slate-500 text-right w-full md:w-6">{plan.intensity}%</span>
             </div>
          </div>
        )}

        {!plan && !isGameDay && day.activity !== 'Off Day' && (
           <div className="mt-auto pt-1 md:pt-2 space-y-1">
              <div className="flex items-center gap-1 md:gap-1.5">
                 <div className="flex-1 h-0.5 bg-slate-800/50 rounded-full overflow-hidden hidden md:block">
                    <div className="h-full bg-slate-500/30" style={{ width: `${actualParadigm === 'Recovery' ? 20 : (actualParadigm === 'Offensive' || actualParadigm === 'Defensive' ? 80 : actualParadigm === 'Biometrics' ? 90 : 50)}%` }} />
                 </div>
                 <span className="text-[6px] md:text-[8px] font-mono text-slate-600 text-right w-full md:w-6">{actualParadigm === 'Recovery' ? '20%' : (actualParadigm === 'Offensive' || actualParadigm === 'Defensive' ? '80%' : actualParadigm === 'Biometrics' ? '90%' : '50%')}</span>
              </div>
           </div>
        )}
      </div>

      {isB2B && (
         <div className="mt-auto pt-0.5 md:pt-2 hidden xs:block">
           <div className="text-[5px] md:text-[8px] font-black uppercase text-orange-500 bg-orange-500/10 px-0.5 md:px-1 rounded inline-block border border-orange-500/20 leading-none">B2B</div>
         </div>
      )}
    </button>
  );
};
