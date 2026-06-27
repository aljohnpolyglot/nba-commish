import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Player, EventResult, OlympicEvent } from '../types';
import { Users, Play, Pause, ChevronLeft, FastForward, Maximize } from 'lucide-react';

interface MarathonViewProps {
  event: OlympicEvent;
  players: Player[];
  gameSeed: number;
  onFinish: (results: (EventResult & { rank: number })[]) => void;
  isPaused?: boolean;
}

declare global {
  interface Window {
    L: any;
  }
}

// Haversine formula to calculate the distance between points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

// Generate random but deterministic hex color
const getSeedColor = (seed: number, index: number) => {
    const x = Math.sin(seed + index) * 10000;
    return '#' + Math.floor((x - Math.floor(x)) * 16777215).toString(16).padStart(6, '0');
};

const PLAYER_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#f97316', '#ec4899', '#06b6d4', '#10b981', '#f43f5e'];

export const MarathonView: React.FC<MarathonViewProps> = ({ event, players, gameSeed, onFinish, isPaused }) => {
  const [gpxPoints, setGpxPoints] = useState<[number, number][]>([]);
  const [totalDistance, setTotalDistance] = useState(0); 
  const distanceArrRef = useRef<number[]>([]); // cumulative distances for points
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const playerMarkersRef = useRef<any[]>([]);
  const lineRef = useRef<any>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(50);
  const [elapsedTime, setElapsedTime] = useState(0); 
  
  const [followPlayerIdx, setFollowPlayerIdx] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const isFinishedRef = useRef(false);

  // Calculate final times and pace curves
  const runnerData = useMemo(() => {
     const baseData = players.map(p => {
         return {
             player: p,
             finalTime: event.calculate(p, gameSeed)
         };
     });

     return baseData.map((d, i) => {
         const p = d.player;
         
         // Look for narrow gaps in final time to dictate if tactical pacing (lead changes) should be pronounced
         let minGapPercent = 1.0;
         baseData.forEach((other, j) => {
             if (i !== j) {
                 const diff = Math.abs(d.finalTime - other.finalTime) / d.finalTime;
                 if (diff < minGapPercent) minGapPercent = diff;
             }
         });
         
         const jInfo = Math.max(0, Math.min(100, p.jmp || p.spd || 50)) / 100;
         const e = Math.max(0, Math.min(100, p.end || 50)) / 100;
         
         let c1 = (jInfo - 0.5) * 0.5 + (0.5 - e) * 0.2; 
         let c2 = (e - 0.5) * 0.4 + (0.5 - jInfo) * 0.3; 
         
         const prng = (seed: number) => {
             let x = Math.sin(p.pid * 13.37 + seed * 42.11) * 43758.5453;
             return x - Math.floor(x);
         };

         const steps = 200;
         const velocities = [];
         let totalV = 0;
         
         const isTightRace = minGapPercent < 0.02;
         
         const earlyPhase = prng(1) * Math.PI * 2;
         const earlyFreq = 10 + prng(2) * 10;
         const earlyAmp = (prng(3) * 0.005) * (isTightRace ? 1.5 : 0.2); 
         
         const lateMoveAmp = (prng(4) - 0.5) * (isTightRace ? 0.015 : 0.002);

         const accelRatio = 0.02 + (1 - jInfo) * 0.05; 
         
         for (let k = 1; k <= steps; k++) {
            const u = k / steps;
            
            const startFade = Math.min(1, u * 20);
            const earlyNoise = earlyAmp * Math.sin(earlyFreq * Math.PI * u + earlyPhase) * Math.max(0, 1 - (u / 0.3)) * startFade;
            
            let lateNoise = 0;
            if (u > 0.65) {
                const lateU = (u - 0.65) / 0.35;
                lateNoise = lateMoveAmp * lateU * Math.sin(lateU * Math.PI * 0.5); 
            }
            
            let v = 1 + c1 * (1 - 4 * u + 3 * u * u) + c2 * (2 * u - 3 * u * u);
             
            const paceSlope = (1.0 - e) * 2.5; 
            v = 1.0 + paceSlope * (0.5 - u); 
            if (u < 0.15) { v += jInfo * (0.15 - u) * 4.0; }

            if (u < accelRatio) {
               v *= Math.pow(u / accelRatio, 0.5); 
            }
            
            v += earlyNoise + lateNoise;
            if (v < 0.1) v = 0.1; 
            
            velocities.push(v);
            totalV += v;
         }

         const curve = [0];
         let currDist = 0;
         for (let k = 0; k < steps; k++) {
            currDist += velocities[k] / totalV;
            curve.push(currDist);
         }
         curve[steps] = 1;

         return {
             player: p,
             finalTime: d.finalTime,
             color: i < PLAYER_COLORS.length ? PLAYER_COLORS[i] : getSeedColor(gameSeed, i),
             curve
         };
     });
  }, [players, event, gameSeed]);

  const maxTime = Math.max(...runnerData.map(r => r.finalTime));

  const sortedResults = useMemo(() => {
     const results = runnerData.map(r => ({
         player: r.player,
         score: r.finalTime,
         displayScore: event.format(r.finalTime),
         isSurprise: false
     })).sort((a, b) => a.score - b.score);
     
     return results.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [runnerData, event]);

  // Load GPX
  useEffect(() => {
     fetch('/gpx_20250421_id10253_race1_20250406001335.gpx')
       .then(res => res.text())
       .then(text => {
           const parser = new DOMParser();
           const xmlDoc = parser.parseFromString(text, "text/xml");
           const trkpts = Array.from(xmlDoc.querySelectorAll('trkpt'));
           
           // Subsample
           const interval = Math.max(1, Math.floor(trkpts.length / 300));
           const points: [number, number][] = [];
           const dists: number[] = [0];
           let cumDist = 0;
           
           for (let i = 0; i < trkpts.length; i += interval) {
               const pt = trkpts[i];
               if (!pt) continue;
               const lat = parseFloat(pt.getAttribute('lat') || '0');
               const lon = parseFloat(pt.getAttribute('lon') || '0');
               points.push([lat, lon]);
               
               if (points.length > 1) {
                   const prev = points[points.length - 2];
                   const d = calculateDistance(prev[0], prev[1], lat, lon);
                   cumDist += d;
               }
               if (points.length > 1) {
                   dists.push(cumDist);
               }
           }
           
           // ensure last point is added if it wasn't
           const lastPt = trkpts[trkpts.length - 1];
           if (lastPt) {
               const lat = parseFloat(lastPt.getAttribute('lat') || '0');
               const lon = parseFloat(lastPt.getAttribute('lon') || '0');
               const prev = points[points.length - 1];
               if (lat !== prev[0] || lon !== prev[1]) {
                   points.push([lat, lon]);
                   cumDist += calculateDistance(prev[0], prev[1], lat, lon);
                   dists.push(cumDist);
               }
           }
           
           setGpxPoints(points);
           setTotalDistance(cumDist);
           distanceArrRef.current = dists;
       });
  }, []);

  // Load Leaflet dynamically
  useEffect(() => {
     if (window.L) {
         setMapLoaded(true);
         return;
     }

     const link = document.createElement('link');
     link.rel = 'stylesheet';
     link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
     document.head.appendChild(link);

     const script = document.createElement('script');
     script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
     script.onload = () => setMapLoaded(true);
     document.head.appendChild(script);

     return () => {
        // We leave them attached to avoid reloading constantly
     };
  }, []);

  // Initialize Map
  useEffect(() => {
     if (!mapLoaded || gpxPoints.length === 0 || !mapContainerRef.current) return;
     if (mapRef.current) return; // already initialized
     
     const L = window.L;
     const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
     }).fitBounds(L.polyline(gpxPoints).getBounds());
     
     L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
         attribution: '&copy; OpenStreetMap &copy; CARTO',
         subdomains: 'abcd',
         maxZoom: 19
     }).addTo(map);

     // Draw line
     lineRef.current = L.polyline(gpxPoints, { color: '#9f1239', weight: 4, opacity: 0.8 }).addTo(map);
     
     // Initialize markers
     runnerData.forEach(runner => {
         const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: ${runner.color}; padding: 2px; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
                       <div style="width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: #18181b;">
                           <img src="${runner.player.imgURL}" style="width: 100%; height: 100%; object-fit: cover; filter: grayscale(20%); opacity: 0.9;" onerror="this.style.display='none'" />
                       </div>
                   </div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
         });
         const marker = L.marker(gpxPoints[0], { icon, zIndexOffset: 0 }).addTo(map);
         playerMarkersRef.current.push(marker);
     });

     mapRef.current = map;

     return () => {
         if (mapRef.current) {
             mapRef.current.remove();
             mapRef.current = null;
         }
         playerMarkersRef.current = [];
     };
  }, [mapLoaded, gpxPoints, runnerData]);

  // Animation Loop
  const lastTimeRef = useRef<number>(0);
  const reqRef = useRef<number>(0);

  useEffect(() => {
      if (!isPlaying || isFinished || !mapRef.current || isPaused) return;

      const L = window.L;
      
      const tick = (time: number) => {
          if (!lastTimeRef.current) lastTimeRef.current = time;
          const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1); // cap at 0.1s to prevent huge jumps
          lastTimeRef.current = time;
          
          setElapsedTime(prev => {
              const next = prev + dt * playbackSpeed;
              if (next >= maxTime && !isFinishedRef.current) {
                  isFinishedRef.current = true;
                  setIsFinished(true);
                  setIsPlaying(false);
                  return maxTime;
              }
              return next;
          });
          
          reqRef.current = requestAnimationFrame(tick);
      };
      
      reqRef.current = requestAnimationFrame(tick);
      
      return () => {
          cancelAnimationFrame(reqRef.current);
          lastTimeRef.current = 0;
      };
  }, [isPlaying, isFinished, playbackSpeed, maxTime, isPaused]);

  // Update marker positions
  useEffect(() => {
      if (!mapRef.current || playerMarkersRef.current.length === 0 || gpxPoints.length === 0) return;
      
      const L = window.L;
      const dists = distanceArrRef.current;
      
      let bounds = L.latLngBounds([]);
      let followLatLng = null;

      runnerData.forEach((runner, i) => {
         // calculate progress
         let p_t = elapsedTime / runner.finalTime;
         if (p_t > 1) p_t = 1;
         
         const steps = 200;
         const tempIdx = Math.min(Math.floor(p_t * steps), steps);
         const nextIdx = Math.min(tempIdx + 1, steps);
         const frac = (p_t * steps) - tempIdx;
         
         let progress = runner.curve[tempIdx] + (runner.curve[nextIdx] - runner.curve[tempIdx]) * frac;
         if (progress > 1) progress = 1;
         if (progress < 0) progress = 0;
         
         const targetDist = progress * totalDistance;
         
         // Binary search or linear search for the segment
         let segIdx = 0;
         while (segIdx < dists.length - 1 && dists[segIdx + 1] < targetDist) {
             segIdx++;
         }
         
         let lat, lon;
         if (segIdx >= dists.length - 1) {
             lat = gpxPoints[gpxPoints.length - 1][0];
             lon = gpxPoints[gpxPoints.length - 1][1];
         } else {
             const d0 = dists[segIdx];
             const d1 = dists[segIdx + 1];
             const t = d1 === d0 ? 0 : (targetDist - d0) / (d1 - d0);
             const p0 = gpxPoints[segIdx];
             const p1 = gpxPoints[segIdx + 1];
             lat = p0[0] + (p1[0] - p0[0]) * t;
             lon = p0[1] + (p1[1] - p0[1]) * t;
         }
         
         const latLng = L.latLng(lat, lon);
         
         const marker = playerMarkersRef.current[i];
         if (marker) {
             marker.setLatLng(latLng);
             marker.setZIndexOffset(progress === 1 ? -100 : Math.floor(progress * 1000));
         }

         if (progress < 1) {
             bounds.extend(latLng);
         }
         if (followPlayerIdx === i) {
             followLatLng = latLng;
         }
         
         if (followPlayerIdx === -1) {
             if (progress < 1 || progress === 1) {
                 bounds.extend(latLng);
             }
         }
      });
      
      if (followLatLng) {
          mapRef.current.setView(followLatLng, 19, { animate: false });
      } else if (bounds.isValid() && followPlayerIdx === -1) {
           mapRef.current.fitBounds(bounds, { animate: false, padding: [50, 50], maxZoom: 16 });
      }
      
  }, [elapsedTime, runnerData, totalDistance, gpxPoints, followPlayerIdx, isPlaying]);

  const fitAll = () => {
      setFollowPlayerIdx(null);
      if (mapRef.current && lineRef.current) {
         mapRef.current.fitBounds(lineRef.current.getBounds(), { padding: [50, 50] });
      }
  };
  
  const fitAllPlayers = () => {
      setFollowPlayerIdx(-1);
  };

  const handleFinish = React.useCallback(() => {
      onFinish(sortedResults);
  }, [onFinish, sortedResults]);

  useEffect(() => {
      if (isFinished) {
          const t = setTimeout(() => {
              handleFinish();
          }, 2000);
          return () => clearTimeout(t);
      }
  }, [isFinished, handleFinish]);

  const formatDisplayTime = (secs: number) => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-[70vh] md:h-[80vh] bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl relative">
       {/* Top Bar */}
       <div className="absolute top-0 left-0 right-0 z-[1000] p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between pointer-events-none gap-2">
           <div className="bg-zinc-900/90 backdrop-blur-md px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl border border-zinc-800 flex items-center justify-between sm:justify-start gap-4 pointer-events-auto shadow-xl">
               <h2 className="font-black text-white tracking-widest uppercase text-sm sm:text-lg">
                   {event.name}
               </h2>
               <div className="h-4 sm:h-6 w-px bg-zinc-700" />
               <div className="font-mono text-lg sm:text-2xl text-amber-500 w-24 sm:w-32 tracking-wider font-bold text-right sm:text-left">
                   {formatDisplayTime(elapsedTime)}
               </div>
           </div>

           <div className="bg-zinc-900/90 backdrop-blur-md px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl border border-zinc-800 flex items-center justify-center gap-4 sm:gap-6 pointer-events-auto shadow-xl">
               <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500 rounded-full flex items-center justify-center hover:bg-amber-400 active:scale-95 transition-all shadow-lg shrink-0"
               >
                   {isPlaying ? <Pause className="fill-black text-black" size={16} /> : <Play className="fill-black text-black ml-1" size={16} />}
               </button>
               
               <div className="flex flex-col flex-1 sm:w-48 pl-2">
                  <div className="flex justify-between items-center mb-1 text-[10px] sm:text-xs font-bold text-zinc-400 tracking-widest uppercase">
                     <span>Time Sync</span>
                     <span className="text-white">{playbackSpeed}x</span>
                  </div>
                  <input 
                     type="range" 
                     min="1" 
                     max="1000" 
                     value={playbackSpeed} 
                     onChange={(e) => setPlaybackSpeed(parseInt(e.target.value))}
                     className="w-full accent-amber-500 h-1.5 bg-zinc-700 rounded-full appearance-none outline-none cursor-pointer" 
                  />
               </div>
           </div>
       </div>

       {/* Map */}
       <div ref={mapContainerRef} className="flex-1 bg-zinc-900 w-full z-0 relative" />

       {/* Bottom Players Bar */}
       <div 
           className="h-auto bg-zinc-900 border-t border-zinc-800 p-2 sm:p-4 z-10 flex gap-2 sm:gap-3 overflow-x-auto custom-scrollbar pointer-events-auto shrink-0"
           onWheel={(e) => e.stopPropagation()}
           onTouchStart={(e) => e.stopPropagation()}
           onTouchMove={(e) => e.stopPropagation()}
           onPointerDown={(e) => e.stopPropagation()}
           onMouseDown={(e) => e.stopPropagation()}
       >
           <button 
               onClick={fitAll}
               className={`pointer-events-auto flex flex-col items-center justify-center gap-1 sm:gap-2 px-4 sm:px-6 h-16 sm:h-20 rounded-xl sm:rounded-2xl border transition-all shrink-0 bg-zinc-900/90 backdrop-blur shadow-xl ${followPlayerIdx === null ? 'border-amber-500 shadow-amber-500/20' : 'border-zinc-800 hover:border-zinc-600'}`}
           >
               <Maximize size={16} className={followPlayerIdx === null ? 'text-amber-500' : 'text-zinc-400'} />
               <span className={`text-[9px] sm:text-[10px] font-bold tracking-widest uppercase ${followPlayerIdx === null ? 'text-amber-500' : 'text-zinc-400'}`}>Map</span>
           </button>
           
           <button 
               onClick={fitAllPlayers}
               className={`pointer-events-auto flex flex-col items-center justify-center gap-1 sm:gap-2 px-4 sm:px-6 h-16 sm:h-20 rounded-xl sm:rounded-2xl border transition-all shrink-0 bg-zinc-900/90 backdrop-blur shadow-xl ${followPlayerIdx === -1 ? 'border-amber-500 shadow-amber-500/20' : 'border-zinc-800 hover:border-zinc-600'}`}
           >
               <Users size={16} className={followPlayerIdx === -1 ? 'text-amber-500' : 'text-zinc-400'} />
               <span className={`text-[9px] sm:text-[10px] font-bold tracking-widest uppercase ${followPlayerIdx === -1 ? 'text-amber-500' : 'text-zinc-400'}`}>All</span>
           </button>

           {runnerData.map((runner, i) => (
              <button 
                 key={runner.player.pid}
                 onClick={() => setFollowPlayerIdx(followPlayerIdx === i ? null : i)}
                 className={`pointer-events-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-16 sm:h-20 bg-zinc-900/90 backdrop-blur rounded-xl sm:rounded-2xl border transition-all shrink-0 shadow-xl ${followPlayerIdx === i ? 'border-amber-500 shadow-amber-500/20 scale-105' : 'border-zinc-800 hover:border-zinc-600'}`}
              >
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0" style={{ border: `2px solid ${runner.color}` }}>
                      {runner.player.imgURL ? (
                          <img src={runner.player.imgURL} alt={runner.player.lastName} className="w-full h-full rounded-full object-cover filter grayscale opacity-90" />
                      ) : (
                          <div className="w-full h-full bg-zinc-800 rounded-full flex items-center justify-center">
                              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-500" />
                          </div>
                      )}
                      
                      {elapsedTime >= runner.finalTime && (
                           <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-green-500 rounded-full border-2 border-zinc-900 flex items-center justify-center">
                               <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-white rounded-full"></div>
                           </div>
                      )}
                  </div>
                  <div className="flex flex-col text-left">
                     <span className={`font-bold text-xs sm:text-sm ${followPlayerIdx === i ? 'text-white' : 'text-zinc-300'}`}>{runner.player.lastName}</span>
                     <span className="text-zinc-500 font-mono text-[9px] sm:text-[10px] tracking-wider">{runner.player.teamAbbrev}</span>
                     {elapsedTime >= runner.finalTime && (
                         <span className="text-green-500 font-mono text-[9px] sm:text-[10px] font-bold mt-0.5">{formatDisplayTime(runner.finalTime)}</span>
                     )}
                  </div>
              </button>
           ))}
       </div>

       {/* Finish Leaderboard Overlay */}
       {isFinished && (
           <div className="absolute inset-0 z-[2000] bg-zinc-950/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-500">
               <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl max-w-lg w-full">
                   <h3 className="text-3xl font-black text-white uppercase text-center mb-6 tracking-widest">Final Results</h3>
                   <div className="space-y-3 mb-8">
                       {sortedResults.slice(0, 5).map(res => (
                           <div key={res.player.pid} className="flex items-center justify-between bg-zinc-950 px-5 py-4 rounded-xl border border-zinc-800/50">
                               <div className="flex items-center gap-4">
                                   <div className="w-6 font-mono text-zinc-500 font-bold">{res.rank}</div>
                                   <div className="font-medium text-white">{res.player.firstName} {res.player.lastName}</div>
                               </div>
                               <div className="text-amber-500 font-mono font-bold tracking-wider">{res.displayScore}</div>
                           </div>
                       ))}
                   </div>
                   <div className="text-center font-mono text-zinc-500 uppercase tracking-widest text-sm animate-pulse">
                       Finalizing results...
                   </div>
               </div>
           </div>
       )}
    </div>
  );
}
