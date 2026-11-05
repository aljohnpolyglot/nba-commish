import React from 'react';
import { X } from 'lucide-react';
import type { ScoutingPipelineRecord, ScoutingPipelineStage } from '../../services/euroScouting/pipeline';
import { filterScoutingPipeline } from '../../services/euroScouting/pipeline';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { CountryFlag } from '../shared/CountryFlag';
import { PlayerPortrait } from '../shared/PlayerPortrait';

const STAGE_LABEL: Record<ScoutingPipelineStage, string> = {
  reported: 'Reported Prospects',
  academy: 'Joined Academy',
  senior: 'Reached Senior Team',
};

function latestPerGame(player: ScoutingPipelineRecord['currentPlayer']): string {
  const rows = Array.isArray(player.stats) ? player.stats : [];
  const row = [...rows].reverse().find(item => Number(item.gp ?? 0) > 0);
  if (!row) return 'No senior stats yet';
  const gp = Math.max(1, Number(row.gp ?? 0));
  const pts = Number(row.pts ?? 0);
  const reb = Number(row.trb ?? (Number(row.orb ?? 0) + Number(row.drb ?? 0)));
  const ast = Number(row.ast ?? 0);
  return `${(pts / gp).toFixed(1)} PPG · ${(reb / gp).toFixed(1)} RPG · ${(ast / gp).toFixed(1)} APG`;
}

export const ScoutingPipelineModal: React.FC<{
  stage: ScoutingPipelineStage;
  records: ScoutingPipelineRecord[];
  onClose: () => void;
}> = ({ stage, records, onClose }) => {
  const visible = filterScoutingPipeline(records, stage);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/85 sm:items-center sm:p-4"
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 p-5 backdrop-blur">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">Scouting Pipeline</p>
            <h3 className="mt-1 text-2xl font-black text-white">{STAGE_LABEL[stage]}</h3>
            <p className="mt-1 text-xs text-slate-500">{visible.length} player{visible.length === 1 ? '' : 's'} traced from saved reports.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-3 p-4 sm:p-5">
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center text-sm text-slate-500">No players have reached this stage yet.</div>
          ) : visible.map(record => (
            <article key={record.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start gap-3">
                <PlayerPortrait imgUrl={record.currentPlayer.imgURL} face={record.currentPlayer.face} playerName={record.currentPlayer.name} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-white">{record.currentPlayer.name}</h4>
                    <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-300">{record.statusLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{normalizePositionLabel(record.currentPlayer.pos, record.currentPlayer.hgt)} · Age {record.currentPlayer.age ?? '—'}</p>
                  <p className="mt-2 text-xs font-bold text-emerald-300">{latestPerGame(record.currentPlayer)}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 text-xs text-slate-500 sm:grid-cols-3">
                <span className="inline-flex items-center gap-1.5"><CountryFlag country={record.assignment.countryName} />{record.assignment.countryName}</span>
                <span>Scout: {record.assignment.scoutName}</span>
                <span>Reported: {record.assignment.startedDate}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};
