import React, { useRef, useEffect, useState } from 'react';
import type { ImagnPhoto } from '../../services/ImagnPhotoService';

const PROXY = 'https://nbagamesimages.mogatas-princealjohn-05082003.workers.dev/?url=';

interface Props {
  photo         : ImagnPhoto;
  homeTeamColor : string;
  awayTeamColor : string;
  homeAbbrev    : string;
  awayAbbrev    : string;
  homeScore     : number;
  awayScore     : number;
  onExport?     : (dataUrl: string) => void;
  /** When true, renders auto-composed image with no UI controls (for social feed) */
  readOnly?     : boolean;
}

type CropPreset = 'square' | 'portrait' | 'landscape';

const PRESETS: Record<CropPreset, { w: number; h: number; label: string }> = {
  square   : { w: 1080, h: 1080, label: '1:1 Square'    },
  portrait : { w: 1080, h: 1350, label: '4:5 Portrait'  },
  landscape: { w: 1200, h: 630,  label: '1.91:1 Story'  },
};

export const ImagnPhotoEditor: React.FC<Props> = ({
  photo, homeTeamColor, awayTeamColor,
  homeAbbrev, awayAbbrev, homeScore, awayScore, onExport,
  readOnly = false,
}) => {
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const [preset, setPreset]     = useState<CropPreset>('square');
  const [overlay, setOverlay]   = useState(true);
  const [gradient, setGradient] = useState(true);
  const [zoom, setZoom]         = useState(1.0);
  const [offsetY, setOffsetY]   = useState(0);

  // In read-only mode, force square preset (social feed standard)
  const activePreset = readOnly ? 'square' : preset;

  const { w: outW, h: outH } = PRESETS[activePreset];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = outW;
    canvas.height = outH;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = PROXY + encodeURIComponent(photo.medUrl);

    img.onload = () => {
      // ── Photo (cropped + zoomed) ──────────────────────────────────────
      const scale = Math.max(outW / img.width, outH / img.height) * zoom;
      const dw    = img.width  * scale;
      const dh    = img.height * scale;
      const dx    = (outW - dw) / 2;
      const dy    = (outH - dh) / 2 + offsetY;
      ctx.drawImage(img, dx, dy, dw, dh);

      // ── Bottom gradient ───────────────────────────────────────────────
      if (gradient) {
        const grad = ctx.createLinearGradient(0, outH * 0.5, 0, outH);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.72)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, outW, outH);
      }

      // ── Score bar ─────────────────────────────────────────────────────
      if (overlay) {
        const barH  = Math.round(outH * 0.11);
        const barY  = outH - barH;
        const halfW = outW / 2;

        ctx.fillStyle = awayTeamColor;
        ctx.fillRect(0, barY, halfW, barH);

        ctx.fillStyle = homeTeamColor;
        ctx.fillRect(halfW, barY, halfW, barH);

        // Divider
        ctx.fillStyle = '#fff';
        ctx.fillRect(halfW - 1, barY, 2, barH);

        const mid = barY + barH / 2;
        const fs  = Math.round(barH * 0.42);
        ctx.font         = `700 ${fs}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#fff';

        ctx.textAlign = 'left';
        ctx.fillText(awayAbbrev, Math.round(outW * 0.04), mid);
        ctx.textAlign = 'right';
        ctx.fillText(String(awayScore), halfW - Math.round(outW * 0.04), mid);

        ctx.textAlign = 'left';
        ctx.fillText(String(homeScore), halfW + Math.round(outW * 0.04), mid);
        ctx.textAlign = 'right';
        ctx.fillText(homeAbbrev, outW - Math.round(outW * 0.04), mid);

        ctx.font      = `500 ${Math.round(fs * 0.65)}px Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText('FINAL', outW / 2, mid);
      }

      // ── Photographer credit ───────────────────────────────────────────
      if (photo.photographer) {
        const creditFs   = Math.round(outW * 0.018);
        ctx.font         = `400 ${creditFs}px Arial, sans-serif`;
        ctx.fillStyle    = 'rgba(255,255,255,0.5)';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'bottom';
        const creditY    = outH - (overlay ? Math.round(outH * 0.11) : 0) - 8;
        ctx.fillText(`© ${photo.photographer} / Imagn Images`, outW - 12, creditY);
      }
    };
  }, [photo, activePreset, overlay, gradient, zoom, offsetY, outW, outH,
      awayTeamColor, homeTeamColor, awayAbbrev, homeAbbrev, awayScore, homeScore]);

  const handleExport = () => {
    const dataUrl = canvasRef.current?.toDataURL('image/jpeg', 0.92) ?? '';
    onExport?.(dataUrl);
    const a    = document.createElement('a');
    a.href     = dataUrl;
    a.download = `${awayAbbrev}_at_${homeAbbrev}.jpg`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        className={readOnly ? 'w-full rounded-xl' : 'max-w-full rounded-lg border border-zinc-700'}
        style={readOnly ? undefined : { maxHeight: 420 }}
      />

      {!readOnly && (
        <>
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {(Object.keys(PRESETS) as CropPreset[]).map(p => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1 rounded-md text-xs font-semibold text-white transition-colors ${
                  preset === p ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
              >
                {PRESETS[p].label}
              </button>
            ))}
            <button
              onClick={() => setOverlay(o => !o)}
              className={`px-3 py-1 rounded-md text-xs font-semibold text-white transition-colors ${
                overlay ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              Score Bar {overlay ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setGradient(g => !g)}
              className={`px-3 py-1 rounded-md text-xs font-semibold text-white transition-colors ${
                gradient ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              Gradient {gradient ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Zoom + crop nudge */}
          <div className="flex gap-6 items-center text-xs text-zinc-400">
            <label className="flex items-center gap-2">
              Zoom
              <input
                type="range" min={1} max={2} step={0.05}
                value={zoom} onChange={e => setZoom(+e.target.value)}
                className="w-24"
              />
              <span className="w-8 text-right">{zoom.toFixed(2)}x</span>
            </label>
            <label className="flex items-center gap-2">
              Crop Y
              <input
                type="range" min={-200} max={200} step={5}
                value={offsetY} onChange={e => setOffsetY(+e.target.value)}
                className="w-24"
              />
              <span className="w-8 text-right">{offsetY > 0 ? '+' : ''}{offsetY}</span>
            </label>
          </div>

          <button
            onClick={handleExport}
            className="px-6 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-sm transition-colors"
          >
            Export JPG
          </button>
        </>
      )}
    </div>
  );
};

export default ImagnPhotoEditor;
