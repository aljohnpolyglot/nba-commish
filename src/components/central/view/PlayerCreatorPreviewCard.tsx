import React from 'react';
import { Camera } from 'lucide-react';
import { K2_CATS } from '../../../services/simulation/convert2kAttributes';
import { formatInches, type PlayerCreatorForm } from '../../../services/playerCreator';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { ratingColor } from './playerCreatorViewHelpers';

interface PlayerCreatorPreviewCardProps {
  form: PlayerCreatorForm;
  teamName: string;
  topMatch: string;
  displayOvr: number;
  displayPot: number;
  archetypeMatches: Array<{ name: string; score: number }>;
  k2: any;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  onHandlePhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const PlayerCreatorPreviewCard: React.FC<PlayerCreatorPreviewCardProps> = ({
  form,
  teamName,
  topMatch,
  displayOvr,
  displayPot,
  archetypeMatches,
  k2,
  photoInputRef,
  onHandlePhotoUpload,
}) => (
  <div className="space-y-5">
    <section className="rounded-[2rem] border border-sky-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-sky-950/40 p-5 sticky top-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          className="group relative rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500"
          title="Upload photo"
        >
          <PlayerPortrait imgUrl={form.imgURL} face={form.imgURL ? undefined : form.face} playerName={`${form.firstName} ${form.lastName}`} size={84} />
          <span className="absolute inset-0 flex items-center justify-center bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={22} className="text-white" />
          </span>
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" capture="user" onChange={onHandlePhotoUpload} className="hidden" />
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl font-black text-white uppercase tracking-tight truncate">{form.firstName} {form.lastName}</h3>
          <p className="text-sm text-slate-400">{form.pos} · {formatInches(form.heightIn)} · {form.weightLbs} lbs</p>
          <p className="text-xs text-sky-300 font-bold">{topMatch} · {teamName}</p>
        </div>
        <div className="text-center rounded-3xl border border-sky-400/40 bg-sky-400/10 px-4 py-3">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">OVR</p>
          <p className="text-4xl font-black text-sky-300">{displayOvr}</p>
          <p className="text-[10px] text-slate-500">POT {displayPot}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {archetypeMatches.map(match => (
          <div key={match.name} className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
            <div className="flex justify-between gap-2">
              <span className="text-xs font-black text-white truncate">{match.name}</span>
              <span className="text-xs font-black text-sky-300">{match.score}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${match.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {K2_CATS.map(cat => {
          const catData = k2[cat.k];
          return (
            <div key={cat.k} className="rounded-2xl bg-slate-950/50 border border-slate-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-white uppercase">{cat.n}</span>
                <span className={`text-sm font-black ${ratingColor(catData.ovr)}`}>{catData.ovr}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {cat.sub.map((sub, idx) => (
                  <div key={sub} className="flex justify-between text-[10px] gap-2">
                    <span className="text-slate-500 truncate">{sub}</span>
                    <span className={`font-black ${ratingColor(catData.sub[idx] ?? 50)}`}>{catData.sub[idx] ?? 50}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  </div>
);
