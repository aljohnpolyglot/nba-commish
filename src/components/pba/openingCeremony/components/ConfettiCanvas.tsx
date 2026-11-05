import { useEffect, useRef } from 'react';

interface ConfettiCanvasProps {
  active: boolean;
  paused?: boolean;
  colorHexes?: string[];
}

const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#ec4899'];

export function ConfettiCanvas({
  active,
  paused = false,
  colorHexes = DEFAULT_COLORS,
}: ConfettiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const colorKey = colorHexes.join(',');

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    const particles: {
      x: number;
      y: number;
      size: number;
      color: string;
      vx: number;
      vy: number;
      rotation: number;
      rotSpeed: number;
    }[] = [];

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    resize();

    const colors = colorHexes.length > 0 ? colorHexes : DEFAULT_COLORS;

    // Spawn 100 confetti pieces
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isPaused = pausedRef.current;

      particles.forEach((p) => {
        if (!isPaused) {
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.rotSpeed;

          if (p.y > canvas.height) {
            p.y = -20;
            p.x = Math.random() * canvas.width;
          }
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        ctx.restore();
      });

      animFrame = requestAnimationFrame(render);
    };

    render();

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, [active, colorKey]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
    />
  );
}
