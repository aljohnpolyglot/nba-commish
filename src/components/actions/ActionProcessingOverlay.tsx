import { CheckCircle2, HeartHandshake, Sparkles, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../store/GameContext';

export function ActionProcessingOverlay() {
  const { state } = useGame();
  if (!state.isProcessing || !state.processingAction) return null;

  const stages = [
    { label: 'Assessing Public, Owners and Players', icon: Users, delay: 0.1 },
    { label: 'Updating Legacy and Viewership', icon: Sparkles, delay: 0.28 },
    { label: 'Recording relationship changes', icon: HeartHandshake, delay: 0.46 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9050] flex items-center justify-center bg-slate-950/88 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-violet-400/30 bg-[linear-gradient(145deg,rgba(15,25,50,0.98),rgba(6,13,31,0.99))] shadow-[0_28px_90px_rgba(0,0,0,0.62),0_0_35px_rgba(124,58,237,0.14)]"
      >
        <div className="border-b border-slate-700/70 p-6 text-center sm:p-8">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/15" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-violet-400 border-t-transparent" />
            <Sparkles className="absolute inset-0 m-auto text-violet-200" size={24} />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-violet-300">Processing Action</p>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{state.processingAction.label}</h2>
        </div>
        <div className="space-y-3 p-5 sm:p-7">
          {stages.map(({ label, icon: Icon, delay }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay, duration: 0.25 }}
              className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/25 px-4 py-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-violet-300"><Icon size={18} /></span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-300">{label}</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </motion.div>
          ))}
          <div className="overflow-hidden rounded-full bg-slate-800">
            <motion.div
              initial={{ width: '8%' }}
              animate={{ width: '94%' }}
              transition={{ duration: 1.3, ease: 'easeOut' }}
              className="h-2 rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-400"
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
