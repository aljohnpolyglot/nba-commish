import React, { useMemo, useState } from 'react';
import { ChevronRight, LockKeyhole, Plus, Quote, Sparkles, Star, Trash2, X } from 'lucide-react';
import type { NBATeam } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';
import { buildChristmasGameRecommendations } from '../../services/logic/autoResolversParts/scheduleResolvers';
import { TeamDropdown } from '../shared/TeamDropdown';

interface ChristmasGamesModalProps {
  teams: NBATeam[];
  onClose: () => void;
  onConfirm: (games: { homeTid: number; awayTid: number }[]) => void;
  initialGames?: { homeTid: number; awayTid: number }[];
}

export const ChristmasGamesModal: React.FC<ChristmasGamesModalProps> = ({ teams, onClose, onConfirm, initialGames = [] }) => {
  const recommendations = useMemo(() => buildChristmasGameRecommendations(teams), [teams]);
  const [games, setGames] = useState<{ homeTid: number; awayTid: number }[]>(
    initialGames.length > 0 ? initialGames : [{ homeTid: -1, awayTid: -1 }]
  );
  const [openTeamPicker, setOpenTeamPicker] = useState<string | null>(null);

  const usedTeamIds = new Set<number>();
  games.forEach(g => {
    if (g.homeTid !== -1) usedTeamIds.add(g.homeTid);
    if (g.awayTid !== -1) usedTeamIds.add(g.awayTid);
  });

  const addGame = () => {
    if (games.length < 5) {
      setGames([...games, { homeTid: -1, awayTid: -1 }]);
    }
  };

  const removeGame = (index: number) => {
    const newGames = [...games];
    newGames.splice(index, 1);
    setGames(newGames.length > 0 ? newGames : [{ homeTid: -1, awayTid: -1 }]);
  };

  const updateGame = (index: number, field: 'homeTid' | 'awayTid', value: number) => {
    setGames(current => current.map((game, gameIndex) => (
      gameIndex === index ? { ...game, [field]: value } : game
    )));
  };

  const isValid = games.length > 0 && games.every(g => g.homeTid !== -1 && g.awayTid !== -1 && g.homeTid !== g.awayTid);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020817]/85 p-2 backdrop-blur-md animate-in fade-in duration-300 sm:p-4">
      <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-700/80 bg-[radial-gradient(circle_at_top_left,rgba(30,58,138,0.12),transparent_38%),linear-gradient(145deg,#091628,#061122)] shadow-[0_34px_100px_rgba(0,0,0,0.6)] sm:max-h-[calc(100vh-2rem)]">
        <header className="flex items-start justify-between gap-4 px-4 pb-5 pt-5 sm:px-8 sm:pb-7 sm:pt-8 lg:px-12 lg:pt-10">
          <div className="flex min-w-0 items-center gap-4 sm:gap-7">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-rose-500 bg-rose-500/5 shadow-[inset_0_0_28px_rgba(244,63,94,0.08)] sm:size-24 sm:rounded-[1.75rem]">
              <span role="img" aria-label="Christmas tree" className="text-3xl leading-none sm:text-5xl">🎄</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-4xl lg:text-5xl">Christmas Day Showcase</h2>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 sm:mt-2 sm:text-sm">Schedule the marquee matchups</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Christmas Day Showcase"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-600 text-slate-400 transition hover:border-slate-400 hover:bg-slate-800 hover:text-white sm:size-14"
          >
            <X size={25} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-7 custom-scrollbar sm:px-8 lg:px-12">
          <div className="flex gap-4 overflow-hidden rounded-2xl border border-slate-700/70 border-l-4 border-l-rose-500 bg-slate-900/35 p-5 sm:gap-6 sm:p-7">
            <Quote size={34} fill="currentColor" className="mt-0.5 shrink-0 text-rose-500" />
            <p className="text-sm italic leading-7 text-slate-300 sm:text-lg sm:leading-9">
              Commissioner, Christmas Day is our biggest stage. The world is watching.
              <span className="block">Hand-pick the five matchups that will define the holiday and drive our ratings to record highs.</span>
            </p>
          </div>

          {recommendations.length > 0 && (
            <section className="rounded-[1.75rem] border border-slate-700/80 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.08),transparent_34%),linear-gradient(145deg,rgba(9,22,40,0.96),rgba(6,17,34,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4 sm:gap-6">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-rose-500 bg-rose-500/5 text-rose-400 shadow-[inset_0_0_24px_rgba(244,63,94,0.08)] sm:size-20">
                    <Star size={32} />
                  </span>
                  <div>
                    <h3 className="flex items-center gap-3 text-xl font-black uppercase tracking-tight text-white sm:text-3xl">
                      Recommended slate
                      <Sparkles className="text-rose-500" size={24} />
                    </h3>
                    <p className="mt-1 text-xs text-slate-400 sm:text-base">The strongest cross-conference matchups available for Christmas Day.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setGames(recommendations)} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-rose-700 to-rose-500 px-6 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_28px_rgba(244,63,94,0.2)] transition hover:from-rose-600 hover:to-rose-400 sm:min-h-16 sm:px-8 sm:text-sm">
                  <Sparkles size={20} /> Use recommendations
                </button>
              </div>
              <div className="mt-6 grid gap-3 lg:grid-cols-2">
                {recommendations.map((game, index) => {
                  const away = teams.find(team => team.id === game.awayTid);
                  const home = teams.find(team => team.id === game.homeTid);
                  return (
                    <button
                      type="button"
                      key={`${game.awayTid}-${game.homeTid}`}
                      onClick={() => setGames(recommendations)}
                      className="group grid min-h-24 grid-cols-[44px_minmax(0,1fr)_auto_minmax(0,1fr)_24px] items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/25 p-3 text-left transition hover:border-rose-500/50 hover:bg-rose-500/5 sm:grid-cols-[52px_minmax(0,1fr)_auto_minmax(0,1fr)_28px] sm:gap-3 sm:p-4"
                    >
                      <span className="flex size-11 items-center justify-center rounded-xl bg-slate-800/80 text-xl font-black text-rose-500 sm:size-13 sm:text-2xl">
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 sm:gap-3">
                        {away?.logoUrl
                          ? <img src={away.logoUrl} alt="" className="size-10 shrink-0 object-contain sm:size-14" referrerPolicy="no-referrer" />
                          : <span className="text-xs font-black text-slate-500">{away?.abbrev}</span>}
                        <span className="truncate text-xs font-black text-white sm:text-sm">{getTeamFullName(away)}</span>
                      </span>
                      <span className="text-[10px] font-black uppercase text-slate-500 sm:text-xs">vs</span>
                      <span className="flex min-w-0 items-center justify-end gap-2 text-right sm:gap-3">
                        <span className="truncate text-xs font-black text-white sm:text-sm">{getTeamFullName(home)}</span>
                        {home?.logoUrl
                          ? <img src={home.logoUrl} alt="" className="size-10 shrink-0 object-contain sm:size-14" referrerPolicy="no-referrer" />
                          : <span className="text-xs font-black text-slate-500">{home?.abbrev}</span>}
                      </span>
                      <ChevronRight className="text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-rose-400" size={22} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className="space-y-4">
            {games.map((game, index) => (
              <article
                key={index}
                className="rounded-2xl border border-slate-700/75 bg-[linear-gradient(135deg,rgba(13,29,51,0.82),rgba(8,20,37,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] animate-in slide-in-from-bottom-2 duration-300 sm:p-6"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-rose-500/60 bg-rose-500/10 text-lg font-black text-slate-100">
                      {index + 1}
                    </span>
                    <h4 className="text-base font-black text-white sm:text-xl">Matchup {index + 1}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGame(index)}
                    aria-label={`Remove matchup ${index + 1}`}
                    className="flex size-11 items-center justify-center rounded-xl border border-slate-700 text-slate-500 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
                  <TeamDropdown
                    label="Away team"
                    selectedTeamId={game.awayTid === -1 ? null : game.awayTid}
                    onSelect={teamId => updateGame(index, 'awayTid', teamId)}
                    teams={teams.filter(team => !usedTeamIds.has(team.id) || team.id === game.awayTid)}
                    otherTeamId={game.homeTid}
                    isOpen={openTeamPicker === `${index}-away`}
                    onToggle={() => setOpenTeamPicker(current => current === `${index}-away` ? null : `${index}-away`)}
                    placeholder="Select team"
                    showRecords={false}
                  />
                  <TeamDropdown
                    label="Home team"
                    selectedTeamId={game.homeTid === -1 ? null : game.homeTid}
                    onSelect={teamId => updateGame(index, 'homeTid', teamId)}
                    teams={teams.filter(team => !usedTeamIds.has(team.id) || team.id === game.homeTid)}
                    otherTeamId={game.awayTid}
                    isOpen={openTeamPicker === `${index}-home`}
                    onToggle={() => setOpenTeamPicker(current => current === `${index}-home` ? null : `${index}-home`)}
                    placeholder="Select team"
                    showRecords={false}
                  />
                </div>
              </article>
            ))}
          </div>

          {games.length < 5 && (
            <button
              type="button"
              onClick={addGame}
              className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-600 py-5 text-rose-500 transition hover:border-rose-500/60 hover:bg-rose-500/5 sm:py-7"
            >
              <span className="flex size-9 items-center justify-center rounded-full border border-rose-500">
                <Plus size={21} className="transition-transform group-hover:scale-110" />
              </span>
              <span className="text-xs font-black uppercase tracking-[0.2em] sm:text-sm">Add matchup ({games.length}/5)</span>
            </button>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-700/60 bg-slate-950/15 p-4 sm:flex-row sm:gap-6 sm:p-8 lg:px-12">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-600 py-4 text-xs font-black uppercase tracking-[0.18em] text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 sm:py-5 sm:text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(games)}
            disabled={!isValid}
            className={`flex flex-[2] items-center justify-center gap-3 rounded-xl py-4 text-xs font-black uppercase tracking-[0.22em] transition sm:py-5 sm:text-sm ${
              isValid
                ? 'bg-gradient-to-r from-rose-700 to-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.22)] hover:from-rose-600 hover:to-rose-400'
                : 'cursor-not-allowed border border-rose-900/50 bg-rose-950/30 text-rose-300/35'
            }`}
          >
            <LockKeyhole size={20} />
            Lock in schedule
          </button>
        </footer>
      </div>
    </div>
  );
};
