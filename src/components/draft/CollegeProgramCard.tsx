import React from 'react';
import { Shield, Trophy, Zap } from 'lucide-react';
import type { CollegeTeamProfile } from '../../services/collegeTeamCatalog';
import { getCollegeTeamLabel } from '../../services/collegeTeamCatalog';

function withAlpha(hex: string | undefined, alpha: string): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return `#0f172a${alpha}`;
  return `${hex}${alpha}`;
}

interface CollegeProgramCardProps {
  collegeName: string;
  collegeProfile: CollegeTeamProfile;
}

export const CollegeProgramCard: React.FC<CollegeProgramCardProps> = ({
  collegeName,
  collegeProfile,
}) => {
  const accent = collegeProfile.primaryColor || '#3b82f6';
  const label = getCollegeTeamLabel(collegeProfile);
  const pipeline = collegeProfile.pipelineStates?.length > 0
    ? collegeProfile.pipelineStates
    : [collegeProfile.state];

  return (
    <div>
      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">College Program</h3>
      <div
        className="rounded-2xl border p-4"
        style={{
          borderColor: withAlpha(accent, '55'),
          background: `linear-gradient(135deg, ${withAlpha(accent, '22')} 0%, rgba(15,23,42,0.92) 58%)`,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-950/60 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
            <img
              src={collegeProfile.logoUrl}
              alt={label}
              className="w-11 h-11 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-white truncate">{label}</div>
            {collegeName !== collegeProfile.name && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300/70 mt-0.5">
                {collegeName}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest text-white/80 border-white/15 bg-slate-950/40">
                {collegeProfile.conferenceName}
              </span>
              {collegeProfile.isPowerConference && (
                <span className="px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest border-amber-400/30 text-amber-300 bg-amber-400/10">
                  Power Conference
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {[
            { label: 'Prestige', value: collegeProfile.prestige, icon: Trophy },
            { label: 'Offense', value: collegeProfile.offenseRating, icon: Zap },
            { label: 'Defense', value: collegeProfile.defenseRating, icon: Shield },
            { label: 'State', value: collegeProfile.state, icon: null },
          ].map(item => (
            <div key={item.label} className="bg-slate-950/45 border border-white/10 rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {item.icon ? <item.icon size={10} /> : null}
                <span>{item.label}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recruiting Pipeline</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {pipeline.map(stateCode => (
              <span
                key={stateCode}
                className="px-2 py-0.5 rounded-md border border-white/10 bg-slate-950/45 text-[10px] font-black uppercase tracking-widest text-slate-200"
              >
                {stateCode}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
