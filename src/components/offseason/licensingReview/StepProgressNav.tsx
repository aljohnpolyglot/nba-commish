import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface Step {
  id: number;
  label: string;
}

interface StepProgressNavProps {
  steps: Step[];
  currentStep: number;
  onSelectStep: (stepId: number) => void;
}

export const StepProgressNav: React.FC<StepProgressNavProps> = ({
  steps,
  currentStep,
  onSelectStep,
}) => {
  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 backdrop-blur-md sm:p-2">
      <div className="scrollbar-hide mx-auto flex max-w-4xl items-center justify-start gap-1 overflow-x-auto px-1 py-1 sm:justify-center sm:gap-3">
        {steps.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isPassed = step.id < currentStep;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => onSelectStep(step.id)}
                className="group relative flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-xl px-2 py-2 transition-all sm:gap-3 sm:px-3"
              >
                {/* Step circle indicator */}
                <motion.div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/40 ring-2 ring-orange-500/50'
                      : isPassed
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : 'bg-slate-800/50 text-slate-500 border border-slate-800'
                  }`}
                  animate={{ scale: isActive ? 1.08 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  {step.id}
                </motion.div>

                {/* Step label */}
                <span
                  className={`text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'text-white' : isPassed ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>

                {/* Animated orange underline for active step */}
                {isActive && (
                  <motion.div
                    layoutId="activeStepIndicatorBar"
                    className="absolute -bottom-2 left-0 right-0 h-[3px] bg-orange-500 rounded-full shadow-[0_0_12px_rgba(249,115,22,0.8)]"
                    transition={{
                      type: 'spring',
                      stiffness: 450,
                      damping: 30,
                    }}
                  />
                )}
              </button>

              {/* Arrow divider */}
              {idx < steps.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-700 shrink-0 hidden sm:block" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
