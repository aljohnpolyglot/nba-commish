import React from 'react';
import { Camera } from 'lucide-react';
import {
  formatInches,
  resolveCreatorPortrait,
  type PlayerCreatorForm,
} from '../../../services/playerCreator';
import { PlayerPortrait } from '../../shared/PlayerPortrait';

interface PlayerCreatorPreviewCardProps {
  form: PlayerCreatorForm;
  teamName: string;
  topMatch: string;
  displayOvr: number;
  displayPot: number;
  archetypeMatches: Array<{ name: string; score: number }>;
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
  photoInputRef,
  onHandlePhotoUpload,
}) => {
  const portrait = resolveCreatorPortrait(form);

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-zinc-800 bg-zinc-950 xl:w-80 xl:border-l xl:border-t-0">
    <div className="flex flex-col items-center border-b border-zinc-800 bg-zinc-900/30 p-5">
      <button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        className="group relative overflow-hidden rounded-full border-2 border-zinc-700 bg-zinc-800 shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
        title="Upload photo"
      >
        <PlayerPortrait
          imgUrl={portrait.imgURL}
          face={portrait.face}
          playerName={`${form.firstName} ${form.lastName}`}
          size={96}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera size={22} className="text-white" />
        </span>
      </button>
      <input ref={photoInputRef} type="file" accept="image/*" capture="user" onChange={onHandlePhotoUpload} className="hidden" />
      <h2 className="mt-4 text-center text-xl font-black uppercase leading-tight tracking-wide text-white">
        {form.firstName}<br />{form.lastName}
      </h2>
      <div className="mt-2 text-center text-sm font-bold uppercase tracking-widest text-cyan-500">
        {form.pos} · {formatInches(form.heightIn)} · {form.weightLbs} lbs
      </div>
      <div className="mt-1 text-center text-xs font-bold uppercase tracking-wider text-zinc-400">
        {topMatch} · {teamName}
      </div>
    </div>

    <div className="flex justify-center gap-8 border-b border-zinc-800 bg-zinc-900/10 p-5">
      <div className="flex flex-col items-center">
        <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">OVR</span>
        <span className="text-4xl font-black text-white">{displayOvr}</span>
      </div>
      <div className="w-px bg-zinc-800" />
      <div className="flex flex-col items-center">
        <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">POT</span>
        <span className="text-4xl font-black text-cyan-400">{displayPot}</span>
      </div>
    </div>

    <div className="p-5 xl:flex-1 xl:overflow-y-auto">
      <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Archetype Matches</h4>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {archetypeMatches.map((match, index) => (
          <div key={match.name} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-sm font-bold uppercase tracking-wider">
              <span className={index === 0 ? 'text-white' : 'text-zinc-300'}>{match.name}</span>
              <span className={index === 0 ? 'text-cyan-400' : 'text-zinc-400'}>{match.score}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-800">
              <div className={index === 0 ? 'h-full bg-cyan-500' : 'h-full bg-zinc-500'} style={{ width: `${match.score}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
    </aside>
  );
};
