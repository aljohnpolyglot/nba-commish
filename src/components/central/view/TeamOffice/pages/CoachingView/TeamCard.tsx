import { K2Result, PlayerK2, CoachSliders } from '../types';
import { getDisplayOverall } from '../../../../../../utils/playerRatings';

interface TeamCardProps {
  teamName: string;
  bestSystem: string;
  avgK2: K2Result;
  sortedProfs: [string, number][];
  top12: PlayerK2[];
  coachSliders: CoachSliders;
  leadPlayer: { name: string; pos: string };
}

const PrefBar = ({ left, right, val, tooltip }: { left: string, right: string, val: number, tooltip: string }) => {
  const offset = val - 50;
  const leaningText = offset > 0 ? `${right} +${offset}` : offset < 0 ? `${left} +${Math.abs(offset)}` : 'Neutral';
  
  return (
    <div className="group relative">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[8px] text-[#8b949e] uppercase">{leaningText}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="w-12 text-right mr-2 text-[#8b949e]">{left}</span>
        <div className="flex-1 h-1.5 bg-[#21262d] rounded-full relative">
          {/* Center Marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[#30363d] z-0" />
          <div 
            className="absolute top-0 bottom-0 w-1.5 bg-[#f1c40f] rounded-full -ml-[3px] z-10" 
            style={{ left: `${val}%` }}
          />
        </div>
        <span className="w-12 ml-2 text-[#8b949e]">{right}</span>
      </div>
      
      {/* Tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 bg-[#0d1117] border border-[#30363d] rounded p-2 z-50 shadow-2xl text-[10px] text-white text-center">
        {tooltip}
      </div>
    </div>
  );
};

const SliderRow = ({ label, val, tooltip }: { label: string, val: number, tooltip: string }) => (
  <div className="flex justify-between group relative cursor-help py-0.5">
    <span>{label}</span>
    <span className="text-[#58a6ff]">{val}</span>
    
    {/* Tooltip */}
    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block w-40 bg-[#0d1117] border border-[#30363d] rounded p-2 z-50 shadow-2xl text-[9px] text-white text-center">
      {tooltip}
    </div>
  </div>
);

export default function TeamCard({ teamName, bestSystem, avgK2, sortedProfs, top12, coachSliders, leadPlayer }: TeamCardProps) {
  const getAvg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b) / arr.length);
  
  const modernStretcher = (raw: number) => {
    // raw 0 -> 62 | raw 50 -> 78 | raw 100 -> 98
    // This creates a 36-point spread across the league instead of a 5-point spread.
    return Math.max(60, Math.min(99, Math.round(62 + (raw * 0.36))));
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 transition hover:border-[#58a6ff] hover:-translate-y-1">
      <div className="text-xl font-bold text-white border-b border-[#30363d] pb-2 mb-4 flex justify-between items-center">
        {teamName}
        <span className="bg-[#f1c40f] text-black px-3 py-1 rounded-full text-xs font-extrabold">
          {bestSystem}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Outside', val: modernStretcher(getAvg(avgK2.OS)) },
          { label: 'Athletic', val: modernStretcher(getAvg(avgK2.AT)) },
          { label: 'Inside', val: modernStretcher(getAvg(avgK2.IS)) },
          { label: 'Playmake', val: modernStretcher(getAvg(avgK2.PL)) },
          { label: 'Defense', val: modernStretcher(getAvg(avgK2.DF)) },
          { label: 'Rebound', val: modernStretcher(getAvg(avgK2.RB)) },
        ].map((cat) => (
          <div key={cat.label} className="bg-[#0d1117] p-2 rounded-md text-center border border-[#21262d]">
            <span className="text-[10px] text-[#8b949e] uppercase block">{cat.label}</span>
            <span className="text-lg font-bold text-[#58a6ff]">{cat.val}</span>
          </div>
        ))}
      </div>
      
      <div className="mb-4">
        <h4 className="text-xs text-[#8b949e] uppercase mb-2">Top 12 Players</h4>
        <div className="space-y-1">
          {top12.map((p, i) => (
            <div key={i} className="relative group flex justify-between text-xs text-[#e6edf3] p-1 hover:bg-[#21262d] rounded cursor-pointer transition-colors">
              <span>{p.name || `${(p as any).firstName || ''} ${(p as any).lastName || ''}`.trim()} ({p.pos})</span>
              <span className="font-bold text-[#58a6ff]">{getDisplayOverall(p)}</span>
              
              {/* Tooltip */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-72 bg-[#0d1117] border border-[#30363d] rounded-lg p-3 z-50 shadow-2xl">
                <div className="font-bold text-[#58a6ff] mb-2 border-b border-[#30363d] pb-1">
                  {p.name || `${(p as any).firstName || ''} ${(p as any).lastName || ''}`.trim()} - {p.pos}
                </div>
                
                <div className="text-[10px] text-[#8b949e] mb-1">BBGM Attributes</div>
                <div className="grid grid-cols-4 gap-1 text-[10px] mb-2 text-white">
                  <div><span className="text-[#8b949e]">HGT:</span> {p.currentRating.hgt}</div>
                  <div><span className="text-[#8b949e]">STR:</span> {p.currentRating.stre}</div>
                  <div><span className="text-[#8b949e]">SPD:</span> {p.currentRating.spd}</div>
                  <div><span className="text-[#8b949e]">JMP:</span> {p.currentRating.jmp}</div>
                  <div><span className="text-[#8b949e]">END:</span> {p.currentRating.endu}</div>
                  <div><span className="text-[#8b949e]">INS:</span> {p.currentRating.ins}</div>
                  <div><span className="text-[#8b949e]">DNK:</span> {p.currentRating.dnk}</div>
                  <div><span className="text-[#8b949e]">FT:</span> {p.currentRating.ft}</div>
                  <div><span className="text-[#8b949e]">FG:</span> {p.currentRating.fg}</div>
                  <div><span className="text-[#8b949e]">3PT:</span> {p.currentRating.tp}</div>
                  <div><span className="text-[#8b949e]">OIQ:</span> {p.currentRating.oiq}</div>
                  <div><span className="text-[#8b949e]">DIQ:</span> {p.currentRating.diq}</div>
                  <div><span className="text-[#8b949e]">DRB:</span> {p.currentRating.drb}</div>
                  <div><span className="text-[#8b949e]">PSS:</span> {p.currentRating.pss}</div>
                  <div><span className="text-[#8b949e]">REB:</span> {p.currentRating.reb}</div>
                </div>

                <div className="text-[10px] text-[#8b949e] mb-1 border-t border-[#30363d] pt-2">2K Categories</div>
                <div className="grid grid-cols-3 gap-1 text-[10px] text-white">
                  <div><span className="text-[#8b949e]">OUT:</span> {getAvg(p.k2.OS)}</div>
                  <div><span className="text-[#8b949e]">ATH:</span> {getAvg(p.k2.AT)}</div>
                  <div><span className="text-[#8b949e]">INS:</span> {getAvg(p.k2.IS)}</div>
                  <div><span className="text-[#8b949e]">PLY:</span> {getAvg(p.k2.PL)}</div>
                  <div><span className="text-[#8b949e]">DEF:</span> {getAvg(p.k2.DF)}</div>
                  <div><span className="text-[#8b949e]">REB:</span> {getAvg(p.k2.RB)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#30363d] pt-3 max-h-48 overflow-y-auto custom-scrollbar">
        {sortedProfs.map((s, i) => (
          <div key={s[0]} className={`flex justify-between text-[11px] mb-1 p-1 rounded ${i === 0 ? 'bg-[rgba(241,196,15,0.1)] text-[#f1c40f] font-bold' : 'text-[#e6edf3] opacity-80'}`}>
            <span>{s[0]}</span>
            <span>Score: {s[1].toFixed(0)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-[#8b949e] mt-3 italic mb-4">
        System Lead: {leadPlayer.name} ({leadPlayer.pos})
      </div>

      <div className="mt-4 border-t border-[#30363d] pt-3">
        <h4 className="text-xs text-[#8b949e] uppercase mb-2">Coach Sliders</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0 text-[10px]">
          <SliderRow label="Tempo" val={coachSliders.tempo} tooltip="How quick the team moves the ball on offense." />
          <SliderRow label="Def Pressure" val={coachSliders.defensivePressure} tooltip="Speed of defensive rotations and pressure." />
          <SliderRow label="Help Defense" val={coachSliders.helpDefense} tooltip="Frequency of players helping on defense." />
          <SliderRow label="Fast Break" val={coachSliders.fastBreak} tooltip="Frequency of pushing in transition." />
          <SliderRow label="Crash Off. Glass" val={coachSliders.crashOffensiveGlass} tooltip="Frequency of crashing offensive boards vs leaking out." />
          <SliderRow label="Run Plays" val={coachSliders.runPlays} tooltip="Frequency of running set plays (Floor General based)." />
          <SliderRow label="Early Offense" val={coachSliders.earlyOffense} tooltip="Frequency of looking for quick shots early in the clock." />
          <SliderRow label="Double Team" val={coachSliders.doubleTeam} tooltip="Frequency of double teaming (Selective < 5%)." />
          <SliderRow label="Zone Usage" val={coachSliders.zoneUsage} tooltip="Frequency of using zone defense (Rim protection based)." />
          <SliderRow label="Bench Depth" val={coachSliders.benchDepth} tooltip="Reliability and quality of the bench rotation." />
          <SliderRow label="Attack Basket" val={coachSliders.attackBasket} tooltip="Frequency of driving to the rim." />
          <SliderRow label="Post Players" val={coachSliders.postPlayers} tooltip="Frequency of posting up in the paint." />
        </div>

        <h4 className="text-[10px] text-[#8b949e] uppercase mt-3 mb-1">Shot Distribution (Base 100)</h4>
        <div className="flex justify-between text-[10px] bg-[#0d1117] p-1.5 rounded border border-[#21262d]">
          <span title="Inside">INS: <span className="text-white">{coachSliders.shotInside}</span></span>
          <span title="Close">CLS: <span className="text-white">{coachSliders.shotClose}</span></span>
          <span title="Medium">MID: <span className="text-white">{coachSliders.shotMedium}</span></span>
          <span title="3PT">3PT: <span className="text-white">{coachSliders.shot3pt}</span></span>
        </div>

        <h4 className="text-[10px] text-[#8b949e] uppercase mt-3 mb-1">Preferences</h4>
        <div className="space-y-2 text-[9px]">
          <PrefBar left="Size" right="Speed" val={coachSliders.prefSizeSpeed} tooltip="Preference for height/strength vs speed." />
          <PrefBar left="Athletic" right="Skill" val={coachSliders.prefAthleticSkill} tooltip="Preference for raw athleticism vs technical skill/IQ." />
          <PrefBar left="Offense" right="Defense" val={coachSliders.prefOffDef} tooltip="Preference for offensive firepower vs defensive lockdown." />
          <PrefBar left="Inside" right="Outside" val={coachSliders.prefInOut} tooltip="Preference for interior scoring vs perimeter shooting." />
          <div className="text-[8px] text-[#8b949e] italic text-center mt-1 opacity-60">Center (50) is Neutral</div>
        </div>
      </div>
    </div>
  );
}
