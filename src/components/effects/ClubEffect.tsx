import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Music, Zap } from 'lucide-react';
import { CLUB_MUSIC_URL } from '../../data/clubs';
import { SettingsManager } from '../../services/SettingsManager';

export const ClubEffect: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Play music
    const audio = new Audio(CLUB_MUSIC_URL);
    audio.loop = true;
    audio.volume = 0.5;
    audioRef.current = audio;
    
    let isMounted = true;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        if (isMounted) console.error("Audio playback failed:", err);
      });
    }

    // Auto-stop after 5 seconds
    const timer = setTimeout(() => {
      if (isMounted && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    }, SettingsManager.getDelay(5000));

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = ""; // Clear source to stop loading
        audioRef.current = null;
      }
    };
  }, []);

  return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
        >
          {/* Flashing Lights */}
          <motion.div
            animate={{
              backgroundColor: ['rgba(255,0,255,0.1)', 'rgba(0,255,255,0.1)', 'rgba(255,255,0,0.1)', 'rgba(0,0,0,0)'],
            }}
            transition={{
              duration: 0.2,
              repeat: Infinity,
              repeatType: "reverse"
            }}
            className="absolute inset-0"
          />

          {/* Strobe Effect */}
          <motion.div
            animate={{
              opacity: [0, 0.3, 0],
            }}
            transition={{
              duration: 0.1,
              repeat: Infinity,
              repeatType: "mirror"
            }}
            className="absolute inset-0 bg-white"
          />

          {/* Jumbled/Shaking Overlay */}
          <motion.div
            animate={{
              x: [-10, 10, -5, 5, 0],
              y: [-5, 5, -10, 10, 0],
              rotate: [-1, 1, -0.5, 0.5, 0],
            }}
            transition={{
              duration: 0.15,
              repeat: Infinity,
            }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="bg-black/80 backdrop-blur-xl border-4 border-violet-500 p-12 rounded-full shadow-[0_0_100px_rgba(139,92,246,0.5)] flex flex-col items-center gap-6">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 360],
                }}
                transition={{
                  scale: { duration: 0.5, repeat: Infinity },
                  rotate: { duration: 2, repeat: Infinity, ease: "linear" }
                }}
              >
                <Music size={80} className="text-violet-400" />
              </motion.div>
              <div className="text-center">
                <h2 className="text-4xl font-black text-white uppercase tracking-[0.2em] mb-2 italic">CLUBBING</h2>
                <div className="flex items-center justify-center gap-2 text-violet-400">
                  <Zap size={20} className="fill-violet-400" />
                  <span className="text-sm font-bold tracking-widest uppercase">Atmosphere Electric</span>
                  <Zap size={20} className="fill-violet-400" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Floating Particles/Lights */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * window.innerWidth, 
                y: Math.random() * window.innerHeight,
                scale: Math.random() * 2,
                opacity: Math.random()
              }}
              animate={{
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                opacity: [0.2, 0.8, 0.2],
              }}
              transition={{
                duration: Math.random() * 2 + 1,
                repeat: Infinity,
                ease: "linear"
              }}
              className={`absolute w-4 h-4 rounded-full blur-md ${
                ['bg-pink-500', 'bg-cyan-500', 'bg-violet-500', 'bg-yellow-500'][Math.floor(Math.random() * 4)]
              }`}
            />
          ))}
        </motion.div>
  );
};
